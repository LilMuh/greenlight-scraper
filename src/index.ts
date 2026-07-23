// greenlight-scraper 的 HTTP 服务。抓取 + 写库（tee_time），对外只返回摘要。
// 后端 task 调 POST /scrape 触发；前端读数据是去后端读库，不经过这里。

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ALL_COURSES, selectCourses } from "./model/index.js";
import { scrape } from "./sources/index.js";
import { saveTeeTimes } from "./teeTimeStore.js";
import type { ScrapeRequest } from "./types.js";

const PORT = Number(process.env.PORT ?? 8090);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_HOLES = 18;
const DEFAULT_PLAYERS = 4;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
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
    const players = request.players ?? DEFAULT_PLAYERS;

    try {
      const courses = selectCourses(request.source, request.site, request.courseIds);
      if (courses.length === 0) {
        return sendJson(res, 404, { error: "没有匹配的球场" });
      }
      const site = courses[0]!.site;

      const teeTimes = await scrape(request);
      const written = await saveTeeTimes(
        { source: request.source, site, date: request.date, holes, players, courseIds: courses.map((c) => c.id) },
        teeTimes,
      );

      return sendJson(res, 200, { source: request.source, site, date: request.date, count: written });
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
