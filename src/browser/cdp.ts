// 一个极简的 Chrome DevTools Protocol (CDP) 客户端：通过单个 WebSocket 操作一个浏览器页面。
// CDP 是「命令 + 事件」协议：我们发命令（如 Page.navigate）拿回复，浏览器也会主动
// 推事件（如 Fetch.requestPaused）给我们订阅。零依赖，用 Node 20+ 内置的全局 WebSocket。

/** CDP socket 上的一条消息：要么是某条命令的回复，要么是一个事件。 */
export type CdpMessage = {
  id?: number; // 回复才有，对应命令的 id
  method?: string; // 事件才有，如 "Fetch.requestPaused"
  params?: any; // 事件负载
  result?: any; // 命令结果
  error?: unknown; // 命令出错时的信息
};

export class CdpConnection {
  private nextCommandId = 0;
  // 已发出、仍在等回复的命令，按命令 id 索引
  private awaitingReply = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  // 想接收所有 CDP 事件的回调
  private eventHandlers: ((event: CdpMessage) => void)[] = [];

  private constructor(private socket: WebSocket) {
    this.socket.addEventListener("message", (rawEvent: MessageEvent) => {
      const message: CdpMessage = JSON.parse(String(rawEvent.data));

      // 命中某条命令的回复：结算对应的 promise
      if (message.id != null && this.awaitingReply.has(message.id)) {
        const { resolve, reject } = this.awaitingReply.get(message.id)!;
        this.awaitingReply.delete(message.id);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
        return;
      }

      // 否则是浏览器推来的事件：分发给所有订阅者
      if (message.method) {
        for (const handler of this.eventHandlers) handler(message);
      }
    });
  }

  /** 连接到某个页面的 webSocketDebuggerUrl。 */
  static connect(webSocketDebuggerUrl: string): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(webSocketDebuggerUrl);
      socket.addEventListener("open", () => resolve(new CdpConnection(socket)));
      socket.addEventListener("error", () => reject(new Error(`无法打开 CDP socket: ${webSocketDebuggerUrl}`)));
    });
  }

  /** 发送一条 CDP 命令，resolve 出它的 result。 */
  sendCommand<Result = any>(method: string, params: Record<string, unknown> = {}): Promise<Result> {
    const commandId = ++this.nextCommandId;
    return new Promise((resolve, reject) => {
      this.awaitingReply.set(commandId, { resolve, reject });
      this.socket.send(JSON.stringify({ id: commandId, method, params }));
    });
  }

  /** 订阅这条连接上浏览器推来的所有 CDP 事件。 */
  onEvent(handler: (event: CdpMessage) => void): void {
    this.eventHandlers.push(handler);
  }

  close(): void {
    try {
      this.socket.close();
    } catch {
      // 已经在关闭/已关闭，忽略
    }
  }
}
