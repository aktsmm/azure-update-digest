export const MRC_MCP_URL = "https://www.microsoft.com/releasecommunications/mcp";

export class McpError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false, readonly retryAfterMs?: number) {
    super(message);
  }
}

export interface McpClientOptions {
  url?: string;
  minIntervalMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Minimal Streamable-HTTP MCP client (JSON or SSE responses), with pacing and retry on 429/5xx. */
export class McpClient {
  private sessionId: string | undefined;
  private nextId = 1;
  private lastCall = 0;
  private initialized = false;
  private readonly url: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: (msg: string) => void;
  requestCount = 0;

  constructor(opts: McpClientOptions = {}) {
    this.url = opts.url ?? MRC_MCP_URL;
    this.minIntervalMs = opts.minIntervalMs ?? 400;
    this.maxRetries = opts.maxRetries ?? 5;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.log = opts.log ?? (() => {});
  }

  private async post(body: unknown, expectResponse: boolean): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      const wait = this.lastCall + this.minIntervalMs - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastCall = Date.now();
      this.requestCount++;
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        };
        if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
        const res = await this.fetchImpl(this.url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
        const sid = res.headers.get("mcp-session-id");
        if (sid) this.sessionId = sid;
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get("retry-after"));
          throw new McpError(`HTTP ${res.status}`, res.status, true, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
        }
        if (!res.ok) throw new McpError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status, false);
        if (!expectResponse) return undefined;
        const text = await res.text();
        return parseRpc(text, res.headers.get("content-type") ?? "");
      } catch (err) {
        const retryable = err instanceof McpError ? err.retryable : !(err instanceof McpError);
        if (!retryable || attempt >= this.maxRetries) throw err;
        attempt++;
        const hint = err instanceof McpError ? err.retryAfterMs : undefined;
        const delay = hint ?? Math.min(30_000, 1000 * 2 ** attempt);
        this.log(`retry ${attempt}/${this.maxRetries} after ${delay}ms: ${(err as Error).message}`);
        await this.sleep(delay);
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.post(
      { jsonrpc: "2.0", id: this.nextId++, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "azure-update-digest", version: "0.1.0" } } },
      true,
    );
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, false);
    this.initialized = true;
  }

  /** Calls a tool and returns the parsed JSON payload of its first text content block. */
  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.initialize();
    const rpc = (await this.post({ jsonrpc: "2.0", id: this.nextId++, method: "tools/call", params: { name, arguments: args } }, true)) as {
      result?: { content?: { type: string; text?: string }[]; isError?: boolean };
      error?: { message?: string };
    };
    if (rpc.error) throw new McpError(`MCP error: ${rpc.error.message ?? "unknown"}`);
    const text = rpc.result?.content?.find((c) => c.type === "text")?.text;
    if (rpc.result?.isError) throw new McpError(`Tool error: ${(text ?? "").slice(0, 200)}`);
    if (text === undefined) throw new McpError("Tool returned no text content");
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new McpError(`Tool returned non-JSON text: ${text.slice(0, 120)}`);
    }
  }
}

export function parseRpc(text: string, contentType: string): unknown {
  if (contentType.includes("text/event-stream")) {
    const datas = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    for (const d of datas.reverse()) {
      try {
        const j = JSON.parse(d) as { result?: unknown; error?: unknown };
        if (j.result !== undefined || j.error !== undefined) return j;
      } catch {
        /* keep looking */
      }
    }
    throw new McpError("No JSON-RPC message in SSE response");
  }
  return JSON.parse(text);
}
