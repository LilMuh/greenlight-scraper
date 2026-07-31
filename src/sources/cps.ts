// CPS / Club Prophet（如 golfvancouver.cps.golf）的抓取实现。
//
// 站点在 Cloudflare + reCAPTCHA 后面，普通 curl 会被 401。我们不去重建它的鉴权，
// 而是驱动指纹浏览器（Open-Anti-Browser）：加载一次搜索页，让它的 Angular SPA 自己发出
// 那个已经带好 token / x-* 头 / transactionId 的 TeeTimes 请求，我们用 CDP 的 Fetch 域
// 把这个请求「拦下来」，只改我们关心的查询参数（日期 / 球场 / 人数 / 洞数），再读它的响应。

import { openBrowserPage } from "../browser/browserService.js";
import type { CpsCourse } from "../model/cps.js";
import type { TeeTime } from "../types.js";

// 打开搜索页的路径（TeeOffTime 区间给足，让 SPA 拉回全天时段）
const SEARCH_PATH = "/onlineresweb/search-teetime?TeeOffTimeMin=0&TeeOffTimeMax=23.999722222222225";

// 等 SPA 发出 TeeTimes 响应的最长时间
const TEE_TIMES_TIMEOUT_MS = 45_000;

// 用 numberOfPlayer=0 查询，才能拿到每个时段真实的部分空位（1/2/3/4），而不是只看到「已能约满 4 人」的时段
const QUERY_ALL_SEATS = "0";

// TeeTimes 响应里每个时段我们会用到的字段
type CpsSlot = {
  startTime: string; // "2026-07-11T18:09:00"
  courseId: number;
  courseName: string;
  holes: number;
  maxPlayer: number; // 该时段当前真实空位数（0–4）= available_seats
  availableParticipantNo?: number[]; // 空位座次数组，其 .length == maxPlayer，用作兜底
  shItemPrices?: { price?: number; displayPrice?: number }[];
};

/** 把 "2026-07-11" 转成 CPS 接口要的 "Sat Jul 11 2026" 格式。 */
function toCpsSearchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${parts.month} ${parts.day} ${parts.year}`;
}

/**
 * 在浏览器里导航一次搜索页，拦截 SPA 自己的 TeeTimes 请求并改参数，返回原始时段数组。
 * 一次导航可以带上多个 courseId（逗号拼接），一把取回同站点所有球场。
 */
async function fetchCpsSlots(
  site: string,
  cpsCourseIds: number[],
  isoDate: string,
  holes: number,
): Promise<CpsSlot[]> {
  const wantedSearchDate = toCpsSearchDate(isoDate);
  const wantedCourseCsv = cpsCourseIds.join(",");
  const searchPageUrl = `https://${site}.cps.golf${SEARCH_PATH}`;

  const { cdp, close } = await openBrowserPage();
  try {
    // 让浏览器在「请求发出前」和「响应回来后」两个阶段都把 TeeTimes 请求暂停给我们
    await cdp.sendCommand("Fetch.enable", {
      patterns: [
        { urlPattern: "*/TeeTimes*", requestStage: "Request" },
        { urlPattern: "*/TeeTimes*", requestStage: "Response" },
      ],
    });

    const responseBody = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("等待 TeeTimes 响应超时")), TEE_TIMES_TIMEOUT_MS);

      cdp.onEvent(async (event) => {
        if (event.method !== "Fetch.requestPaused") return;
        const paused = event.params;
        try {
          const isResponseStage = paused.responseStatusCode != null || paused.responseErrorReason != null;

          if (!isResponseStage) {
            // 请求阶段：把查询参数改成我们要的条件（若已经是目标参数则直接放行）
            const url = new URL(paused.request.url);
            const alreadyOurParams =
              url.searchParams.get("searchDate") === wantedSearchDate &&
              url.searchParams.get("courseIds") === wantedCourseCsv &&
              url.searchParams.get("numberOfPlayer") === QUERY_ALL_SEATS;

            if (alreadyOurParams) {
              await cdp.sendCommand("Fetch.continueRequest", { requestId: paused.requestId });
            } else {
              url.searchParams.set("searchDate", wantedSearchDate);
              url.searchParams.set("courseIds", wantedCourseCsv);
              url.searchParams.set("numberOfPlayer", QUERY_ALL_SEATS);
              url.searchParams.set("holes", String(holes));
              await cdp.sendCommand("Fetch.continueRequest", { requestId: paused.requestId, url: url.toString() });
            }
          } else {
            // 响应阶段：读出响应体，再放行让页面正常结束
            const raw = await cdp.sendCommand<{ body: string; base64Encoded: boolean }>("Fetch.getResponseBody", {
              requestId: paused.requestId,
            });
            const text = raw.base64Encoded ? Buffer.from(raw.body, "base64").toString("utf8") : raw.body;
            cdp.sendCommand("Fetch.continueRequest", { requestId: paused.requestId }).catch(() => {});
            clearTimeout(timer);
            resolve(text);
          }
        } catch (error) {
          cdp.sendCommand("Fetch.continueRequest", { requestId: paused.requestId }).catch(() => {});
          clearTimeout(timer);
          reject(error as Error);
        }
      });

      // 导航到搜索页，触发 SPA 自己去发 TeeTimes 请求
      cdp.sendCommand("Page.enable").then(() => cdp.sendCommand("Page.navigate", { url: searchPageUrl })).catch(reject);
    });

    const parsed = JSON.parse(responseBody) as { isSuccess?: boolean; content?: CpsSlot[] };
    // content 有时不是数组（如当天已过、无可订时段时会是 null 或一个提示对象），统一当成空
    return Array.isArray(parsed.content) ? parsed.content : [];
  } finally {
    await cdp.sendCommand("Fetch.disable").catch(() => {});
    close();
  }
}

/** 把 CPS 原始时段转成我们统一的 TeeTime。cpsIdToSlug 用来回填我们的球场 slug。 */
function toTeeTime(slot: CpsSlot, holes: number, cpsIdToSlug: Map<number, string>): TeeTime {
  const fee = slot.shItemPrices?.[0];
  const availableSeats = slot.maxPlayer ?? slot.availableParticipantNo?.length ?? 0; // 当前真实空位数
  return {
    courseId: cpsIdToSlug.get(slot.courseId) ?? String(slot.courseId),
    time: slot.startTime.slice(11, 16), // "18:09"
    date: slot.startTime.slice(0, 10), // "2026-07-11"
    course: slot.courseName,
    holes: slot.holes ?? holes,
    price: fee?.price ?? fee?.displayPrice ?? 0, // 单人 green fee，税前
    cartPrice: null, // 这个接口只给 green fee，不含球车价
    available: availableSeats > 0, // 有空位才算可订
    availableSeats,
  };
}

/**
 * 抓一批 CPS 球场（必须同属一个 site）在某天的时段。
 * 一次浏览器导航覆盖所有球场，省去逐个球场重复开浏览器。
 */
export async function scrapeCps(courses: CpsCourse[], isoDate: string, holes = 18): Promise<TeeTime[]> {
  if (courses.length === 0) return [];

  const site = courses[0]!.site;
  const cpsCourseIds = courses.map((course) => course.cpsCourseId);
  const cpsIdToSlug = new Map(courses.map((course) => [course.cpsCourseId as number, course.id]));

  const slots = await fetchCpsSlots(site, cpsCourseIds, isoDate, holes);
  return slots.map((slot) => toTeeTime(slot, holes, cpsIdToSlug));
}
