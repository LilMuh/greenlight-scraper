// 驱动一个「指纹浏览器服务」：启动一个浏览器 profile，拿到它某个页面的 CDP 连接。
// CPS 这类站点有 Cloudflare + reCAPTCHA，普通 curl/fetch 会被 401，只能用真实指纹浏览器。
//
// 这里对接的是开源 Open-Anti-Browser 的 Open-API（一个本地 FastAPI 服务）。
// 所有本地相关的东西——服务地址、profile id、api key——都从环境变量读，不进仓库。

import { CdpConnection } from "./cdp.js";

// 浏览器服务的本地地址（默认 OAB 的 127.0.0.1:8000）
const SERVICE_URL = process.env.BROWSER_SERVICE_URL?.trim() || "http://127.0.0.1:8000";
// 要启动的浏览器 profile id
const PROFILE_ID = process.env.BROWSER_PROFILE_ID?.trim() || "";
// 访问 Open-API 的 key；留空则从服务的 info 接口自动获取
const CONFIGURED_API_KEY = process.env.BROWSER_API_KEY?.trim() || "";

/** 拿到 Open-API 的 key：优先用环境变量，否则问服务要。 */
async function resolveApiKey(): Promise<string> {
  if (CONFIGURED_API_KEY) return CONFIGURED_API_KEY;
  const info = (await fetch(`${SERVICE_URL}/api/open-api/info`).then((r) => r.json())) as { api_key: string };
  return info.api_key;
}

/**
 * 启动（或复用）指定 profile，返回它的 Chrome 远程调试端口。
 * 第一次调用可能冷启动 Chrome，Node fetch 偶尔会先抛一次 "fetch failed"，所以带重试。
 */
async function startProfile(apiKey: string): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${SERVICE_URL}/open-api/profiles/${PROFILE_ID}/start`, {
        method: "POST",
        headers: { "X-API-Key": apiKey },
      });
      if (!response.ok) throw new Error(`启动 profile 返回 ${response.status}`);
      const data = (await response.json()) as { port?: number; debug_port?: number };
      const debugPort = data.port ?? data.debug_port;
      if (!debugPort) throw new Error("启动 profile 没有返回调试端口");
      return debugPort;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`无法启动浏览器 profile: ${String(lastError)}`);
}

type ChromeTarget = { type: string; url: string; webSocketDebuggerUrl?: string };

/**
 * 从 Chrome 的 /json 列出所有 target。冷启动时调试端口可能还没就绪（ECONNREFUSED），
 * 所以带重试轮询，等 Chrome 把端口开起来。
 */
async function listChromeTargets(debugPort: number): Promise<ChromeTarget[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return (await fetch(`http://127.0.0.1:${debugPort}/json`).then((r) => r.json())) as ChromeTarget[];
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Chrome 调试端口 ${debugPort} 一直连不上: ${String(lastError)}`);
}

export type BrowserPage = { cdp: CdpConnection; close: () => void };

/**
 * 启动 profile 并连上它一个页面的 CDP。
 * close() 只断开 WebSocket，浏览器保持常驻（下次抓取免去冷启动）。
 */
export async function openBrowserPage(): Promise<BrowserPage> {
  if (!PROFILE_ID) {
    throw new Error("未配置 BROWSER_PROFILE_ID —— 请在 .env 里填一个可用的浏览器 profile id");
  }

  const apiKey = await resolveApiKey();
  const debugPort = await startProfile(apiKey);

  // 从 Chrome 的 /json 列出所有 target，挑一个 page 类型的来连
  const targets = await listChromeTargets(debugPort);
  const pageTarget = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl) ?? targets[0];
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error("浏览器里没有可连接的 page target");

  const cdp = await CdpConnection.connect(pageTarget.webSocketDebuggerUrl);
  return { cdp, close: () => cdp.close() };
}
