// 用 OAB 浏览器打开 Google Maps，取一个球场的地址和评分。
//
// 和 CPS 那边不一样：CPS 拦的是 SPA 自己发的 JSON XHR（*/TeeTimes*），拿到的是结构化数据，
// 所以稳。Google Maps 没有这么干净的等价物（它的内部接口是 protobuf 风格的定长数组，
// 字段位置会变），只能解析 DOM。**这意味着 Google 改版式的那天，这里会静默失效。**
//
// 所以整套代码的设计前提是「取不到是常态」：
//   - 任何一步失败都返回 null，不抛；调用方把 null 原样交给后端，后端跳过不写。
//   - 三个字段各自独立提取，能取到几个算几个，不搞「要么全有要么全无」。
//   - 绝不返回猜的值（比如 rating=0），空就是空——前端对 null 有降级，对 0 没有。
//
// 提取优先走 aria-label 而不是 class 名：class 是构建产物（.F7nice 这种）随时会变，
// aria-label 是给读屏软件的，Google 改它的动机小得多。

import { openBrowserPage } from "../browser/browserService.js";
import type { CdpConnection } from "../browser/cdp.js";
import type { CourseInfo, CourseRefreshRequest } from "../types.js";

/** 单个球场最多等多久（毫秒）。地图页比搜索页慢，给足一点。 */
const PAGE_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

/** site → 拼进搜索词的地区，避免搜到同名的外地球场。 */
const SITE_REGION: Record<string, string> = {
  golfvancouver: "Vancouver BC",
  golfburnaby: "Burnaby BC",
};

/**
 * 在页面里跑的提取脚本。返回三种状态：
 *   consent    撞上 Google 的同意页，点一下继续（profile 第一次访问会遇到）
 *   navigating 还停在搜索结果列表，点第一条进地点页
 *   ok         已经在地点页，字段能取到几个给几个
 */
const EXTRACT_SCRIPT = String.raw`(() => {
  // Google 的同意页。点掉之后它会自己跳回原目标
  if (location.hostname.startsWith("consent.")) {
    const button = [...document.querySelectorAll("button, input[type=submit]")].find((element) =>
      /^\s*(accept|agree|i agree|accept all|同意|全部接受)/i.test(
        element.textContent || element.value || ""));
    if (button) { button.click(); return { status: "consent" }; }
    return { status: "waiting" };
  }

  // 搜索落在结果列表上（球场名不够独特时会这样）：点第一条进地点页
  if (!location.pathname.startsWith("/maps/place/")) {
    const firstResult = document.querySelector('a[href*="/maps/place/"]');
    if (firstResult) { firstResult.click(); return { status: "navigating" }; }
    return { status: "waiting" };
  }

  // 地点信息都在主面板里。限定范围，免得扫到侧边栏里别的商户
  const panel = document.querySelector('[role="main"]') || document.body;

  // --- 地址 -----------------------------------------------------------------
  // 首选 data-item-id="address"：这是 Google 给「复制地址」按钮的稳定钩子。
  // 它的 aria-label 形如 "Address: 7800 Vivian Dr, Vancouver, BC V5S 2V9, Canada"
  let address = null;
  const addressButton = panel.querySelector('[data-item-id="address"]');
  if (addressButton) {
    const label = addressButton.getAttribute("aria-label") || "";
    address = label.replace(/^[^:]*:\s*/, "").trim() || null;
    if (!address) address = (addressButton.textContent || "").trim() || null;
  }

  // --- 评分和评价数 ----------------------------------------------------------
  // 扫 aria-label。两个正则都刻意收紧，避开评分分布直方图那一堆
  // （它的 label 形如 "5 stars, 800 reviews"，会同时命中两个宽松的模式）：
  //   星级要求带一位小数（"4.3 stars"），直方图那边是整数，天然排除；
  //   评价数要求整条 label 就是数字加 reviews，直方图那条前面还有 "5 stars," 所以不匹配。
  let rating = null;
  let ratingCount = null;
  for (const element of panel.querySelectorAll("[aria-label]")) {
    const label = (element.getAttribute("aria-label") || "").trim();
    if (rating === null) {
      const match = label.match(/^([0-5][.,]\d)\s*stars?\b/i) || label.match(/^rated\s+([0-5][.,]\d)\b/i);
      if (match) rating = parseFloat(match[1].replace(",", "."));
    }
    if (ratingCount === null) {
      const match = label.match(/^([\d][\d,.\s]*)\s*reviews?$/i);
      if (match) {
        const digits = parseInt(match[1].replace(/[^\d]/g, ""), 10);
        if (Number.isFinite(digits)) ratingCount = digits;
      }
    }
    if (rating !== null && ratingCount !== null) break;
  }

  // 一个都没取到就说明页面还没渲染完，让调用方继续轮询而不是过早收工
  if (address === null && rating === null) return { status: "waiting" };

  return { status: "ok", address, rating, ratingCount, mapsUrl: location.href };
})()`;

type ExtractResult = {
  status: "ok" | "waiting" | "navigating" | "consent";
  address?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  mapsUrl?: string | null;
};

/** 在页面里求值一段表达式，拿回它的值。求值本身出错时返回 null。 */
async function evaluate(cdp: CdpConnection, expression: string): Promise<ExtractResult | null> {
  try {
    const response = await cdp.sendCommand<{ result?: { value?: ExtractResult } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    return response?.result?.value ?? null;
  } catch {
    return null;
  }
}

/** 搜索链接。带上地区，免得搜到同名的外地球场。 */
function searchUrl(name: string, site: string | undefined): string {
  const region = (site && SITE_REGION[site]) || "";
  const query = [name, region].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * 查一个球场。取不到就返回全 null 的记录（而不是抛）——
 * 后端看到全 null 会跳过，不会把好数据覆盖成空。
 */
async function fetchOne(course: CourseRefreshRequest, site: string | undefined): Promise<CourseInfo> {
  const empty: CourseInfo = { slug: course.slug, address: null, rating: null, ratingCount: null, mapsUrl: null };

  const { cdp, close } = await openBrowserPage();
  try {
    await cdp.sendCommand("Page.enable");
    await cdp.sendCommand("Runtime.enable");

    // 有存过的地点链接就直接去，省掉搜索这一跳，也不会再匹配错商户
    const target = course.mapsUrl?.trim() || searchUrl(course.name, site);
    await cdp.sendCommand("Page.navigate", { url: target });

    const deadline = Date.now() + PAGE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const result = await evaluate(cdp, EXTRACT_SCRIPT);
      if (result?.status === "ok") {
        return {
          slug: course.slug,
          address: result.address ?? null,
          rating: result.rating ?? null,
          ratingCount: result.ratingCount ?? null,
          mapsUrl: result.mapsUrl ?? null,
        };
      }
      // consent / navigating / waiting 都继续轮询：前两种页面正在自己跳转
    }

    console.warn(`[maps] ${course.slug}: 等待地点页超时，这次跳过（保持库里的旧值）`);
    return empty;
  } catch (error) {
    console.warn(`[maps] ${course.slug}: 取信息失败，这次跳过 —— ${String(error)}`);
    return empty;
  } finally {
    close();
  }
}

/**
 * 按顺序查一批球场。**必须串行**：所有请求都驱动同一个 OAB profile，
 * 并发会让它们互相抢同一个 Chrome page target。
 *
 * 单个球场失败不影响其余——每个都各自兜底成全 null 的记录。
 */
export async function fetchCourseInfos(courses: CourseRefreshRequest[], site: string | undefined): Promise<CourseInfo[]> {
  const infos: CourseInfo[] = [];
  for (const course of courses) {
    infos.push(await fetchOne(course, site));
  }
  return infos;
}
