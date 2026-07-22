import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ScrapeRequest, TeeTime } from "./types.js";

// Minimal HTTP surface for the scraper. Real fetching/normalization (curl
// fingerprint + CDP browser intercept) lands in a later step; for now the
// endpoints are stubs so the backend can wire against a stable contract.

const PORT = Number(process.env.PORT ?? 8090);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { status: "ok" });
  }

  // Course catalog (slug + name + source + site). Stub for now.
  if (req.method === "GET" && url.pathname === "/courses") {
    return sendJson(res, 200, []);
  }

  // Scrape one source/date. Stub for now — returns an empty result set.
  if (req.method === "POST" && url.pathname === "/scrape") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}") as ScrapeRequest;
      void body;
      const teeTimes: TeeTime[] = [];
      return sendJson(res, 200, { teeTimes });
    } catch (err) {
      return sendJson(res, 400, { error: String(err) });
    }
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`greenlight-scraper listening on http://localhost:${PORT}`);
});
