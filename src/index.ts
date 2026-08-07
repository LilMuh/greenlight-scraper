// greenlight-scraper 的 HTTP 服务。抓取 + 写库（tee_time），对外只返回摘要。
// 后端 task 调 POST /scrape 触发；前端读数据是去后端读库，不经过这里。
//
// course 表是例外：这里只读它做 slug→id 解析，从不写。球场的地址/评分虽然由这里
// 从 Google Maps 抓（浏览器能力只在这个仓），但抓完原样返回给后端，由后端写库。

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ALL_COURSES, selectCourses } from "./model/index.js";
import { scrape } from "./sources/index.js";
import { fetchCourseInfos } from "./sources/googleMaps.js";
import { saveTeeTimes } from "./teeTimeStore.js";
import type { CourseInfo, ScrapeRequest } from "./types.js";

const PORT = Number(process.env.PORT ?? 8090);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_HOLES = 18;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * 顺带刷新球场的地址/评分。后端在请求里点名要刷哪些（它拥有 course 表、也负责写回），
 * 没点名就直接返回空数组，一次浏览器都不开。
 *
 * 整个过程吞掉所有异常：Google 改版式、网络抖动、页面结构变了——
 * 这些都不该让一趟已经成功落库的抓取变成 502。取不到就是这轮没有，下轮再说。
 */
async function refreshCourseInfos(request: ScrapeRequest, site: string): Promise<CourseInfo[]> {
  const wanted = request.refreshCourses ?? [];
  if (wanted.length === 0) return [];

  try {
    console.log(`[maps] 刷新 ${wanted.length} 个球场的地址/评分: ${wanted.map((c) => c.slug).join(", ")}`);
    const infos = await fetchCourseInfos(wanted, site);
    for (const info of infos) {
      console.log(`[maps] ${info.slug}: address=${info.address ?? "-"} rating=${info.rating ?? "-"} (${info.ratingCount ?? "-"})`);
    }
    return infos;
  } catch (error) {
    console.error(`[maps] 刷新球场信息失败，本轮跳过（时段已正常落库）: ${String(error)}`);
    return [];
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // 健康检查
  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { status: "ok" });
  }

  // 已配置的球场清单（slug + 名称 + source + site）——后端读路径用来显示球场名
  if (req.method === "GET" && url.pathname === "/courses") {
    const courses = ALL_COURSES.map(({ id, name, source, site }) => ({ id, name, source, site }));
    return sendJson(res, 200, courses);
  }

  // 抓取 + 写库：一次浏览器导航取回该 site 指定球场某天的时段，写进 tee_time
  if (req.method === "POST" && url.pathname === "/scrape") {
    let request: ScrapeRequest;
    try {
      request = JSON.parse((await readRequestBody(req)) || "{}") as ScrapeRequest;
    } catch (error) {
      return sendJson(res, 400, { error: `请求体不是合法 JSON: ${String(error)}` });
    }

    if (!request.source) return sendJson(res, 400, { error: "缺少 source" });
    if (!ISO_DATE_PATTERN.test(request.date ?? "")) {
      return sendJson(res, 400, { error: "date 必填，格式 YYYY-MM-DD" });
    }

    const holes = request.holes ?? DEFAULT_HOLES;

    try {
      const courses = selectCourses(request.source, request.site, request.courseIds);
      if (courses.length === 0) {
        return sendJson(res, 404, { error: "没有匹配的球场" });
      }
      const site = courses[0]!.site;

      const teeTimes = await scrape(request);
      const written = await saveTeeTimes(
        { source: request.source, site, date: request.date, holes, courseIds: courses.map((course) => course.id) },
        teeTimes,
      );

      // 时段落库之后才顺带查 maps：时段是正事，球场的地址/评分是装饰，
      // 后者出问题绝不能连累前者。refreshCourseInfos 自己吞掉所有异常。
      const courseInfos = await refreshCourseInfos(request, site);

      return sendJson(res, 200, { source: request.source, site, date: request.date, count: written, courseInfos });
    } catch (error) {
      console.error(error);
      return sendJson(res, 502, { error: "抓取或写库失败", detail: String(error) });
    }
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`greenlight-scraper listening on http://localhost:${PORT}`);
});
