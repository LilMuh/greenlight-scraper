// greenlight-scraper 的 HTTP 服务。只负责「抓取 + 归一化」，不碰数据库。
// 后端将来通过这几个接口调用它。

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ALL_COURSES } from "./model/index.js";
import { scrape } from "./sources/index.js";
import type { ScrapeRequest, ScrapeResponse } from "./types.js";

const PORT = Number(process.env.PORT ?? 8090);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

  // 已配置的球场清单（slug + 名称 + source + site）
  if (req.method === "GET" && url.pathname === "/courses") {
    const courses = ALL_COURSES.map(({ id, name, source, site }) => ({ id, name, source, site }));
    return sendJson(res, 200, courses);
  }

  // 抓取：一次浏览器导航取回请求里指定球场某天的所有时段
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

    try {
      const teeTimes = await scrape(request);
      const body: ScrapeResponse = {
        source: request.source,
        site: request.site,
        date: request.date,
        count: teeTimes.length,
        teeTimes,
      };
      return sendJson(res, 200, body);
    } catch (error) {
      console.error(error);
      return sendJson(res, 502, { error: "抓取失败", detail: String(error) });
    }
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`greenlight-scraper listening on http://localhost:${PORT}`);
});
