import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { normalizeTimestamp } from "../../domain/dates";

const id = z.number().int().positive();
const toolInputs = {
  "aula.profiles.list": z.object({}).strict(),
  "aula.posts.list": z.object({ index: z.number().int().nonnegative(), limit: z.number().int().min(1).max(50), onlyUnread: z.literal(false) }).strict(),
  "aula.messages.list_threads": z.object({ page: z.number().int().nonnegative() }).strict(),
  "aula.messages.get_thread": z.object({ threadId: id, page: z.number().int().nonnegative() }).strict(),
  "aula.calendar.events": z.union([
    z.object({ profileIds: z.array(id).min(1), range: z.literal("this_week") }).strict(),
    z.object({ profileIds: z.array(id).min(1), start: z.string().max(40), end: z.string().max(40) }).strict().refine((value) => {
      try {
        const span = Date.parse(normalizeTimestamp(value.end)) - Date.parse(normalizeTimestamp(value.start));
        return span > 0 && span <= 31 * 86400_000;
      } catch { return false; }
    }),
  ]),
};
export type AulaReadTool = keyof typeof toolInputs;
export type ReadFailure = "denied-tool" | "invalid-input" | "timeout" | "transport" | "provider" | "response-shape" | "incomplete" | "sensitive" | "limit" | "profile-selection" | "read-state-changed" | "reconnect" | "rate-limited";
export class AulaReadError extends Error {
  constructor(public readonly code: ReadFailure) { super(code); }
}
export interface AulaReader {
  read(tool: AulaReadTool, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
function isReadTool(tool: string): tool is AulaReadTool { return Object.hasOwn(toolInputs, tool); }

const toolResult = z.object({
  isError: z.boolean().optional(),
  content: z.tuple([z.object({ type: z.literal("text"), text: z.string().max(8 * 1024 * 1024) })]),
});

export function decodeReadResult(result: unknown): unknown {
  const parsed = toolResult.safeParse(result);
  if (!parsed.success) throw new AulaReadError("response-shape");
  if (parsed.data.isError) {
    const text = parsed.data.content[0].text;
    if (/\bstatus[: ]+(401|403)\b/.test(text) || /\binvalid_grant\b|\bNo stored tokens\b/.test(text)) throw new AulaReadError("reconnect");
    if (/\bstatus[: ]+429\b/.test(text)) throw new AulaReadError("rate-limited");
    if (/Invalid or incomplete (threads|messages|posts) page/.test(text)) throw new AulaReadError("incomplete");
    throw new AulaReadError("provider");
  }
  let data: unknown;
  try { data = JSON.parse(parsed.data.content[0].text); }
  catch { throw new AulaReadError("response-shape"); }
  if (data && typeof data === "object" && "error" in data) {
    throw new AulaReadError(data.error === "step_up_required" ? "sensitive" : "provider");
  }
  return data;
}

export class AllowlistedAulaReader implements AulaReader {
  constructor(private readonly client: Client) {}
  async read(tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    if (!isReadTool(tool)) throw new AulaReadError("denied-tool");
    const input = toolInputs[tool].safeParse(args);
    if (!input.success) throw new AulaReadError("invalid-input");
    try {
      signal.throwIfAborted();
      const result = await this.client.callTool({ name: tool, arguments: input.data }, undefined, {
        signal, timeout: 15_000, resetTimeoutOnProgress: false,
      });
      return decodeReadResult(result);
    } catch (error) {
      if (error instanceof AulaReadError) throw error;
      if (signal.aborted || error instanceof McpError && error.code === ErrorCode.RequestTimeout) throw new AulaReadError("timeout");
      throw new AulaReadError("transport");
    }
  }
}

class PrivateStdioTransport extends StdioClientTransport {
  override start() {
    const mask = process.umask(0o077);
    try { return super.start(); }
    finally { process.umask(mask); }
  }
}

export async function withAulaReader<T>(
  runtime: { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv },
  signal: AbortSignal,
  action: (reader: AulaReader) => Promise<T>,
): Promise<T> {
  const env = Object.fromEntries(Object.entries(runtime.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const transport = new PrivateStdioTransport({
    ...runtime, env: { ...env, USER: "", LOGNAME: "", SHELL: "/bin/false" }, stderr: "ignore", maxBufferSize: 8 * 1024 * 1024,
  });
  let closed = false;
  const exited = new Promise<void>((resolve) => { transport.onclose = () => { closed = true; resolve(); }; });
  const client = new Client({ name: "orbit-read-validation", version: "1" });
  const transportFailure = new AbortController();
  client.onerror = () => transportFailure.abort();
  const operationSignal = AbortSignal.any([signal, transportFailure.signal]);
  try {
    try { await client.connect(transport, { signal: operationSignal, timeout: 15_000 }); }
    catch { throw new AulaReadError(signal.aborted ? "timeout" : "transport"); }
    const reader = new AllowlistedAulaReader(client);
    const result = await action({
      read: (tool, args, requestSignal) => reader.read(tool, args, AbortSignal.any([operationSignal, requestSignal])),
    });
    if (transportFailure.signal.aborted) throw new AulaReadError("transport");
    return result;
  } finally {
    const hadProcess = transport.pid !== null;
    try {
      await client.close();
      if (hadProcess && !closed) {
        const stopped = await Promise.race([exited.then(() => true), delay(5_000, false, { ref: false })]);
        if (!stopped) throw new AulaReadError("transport");
      }
    } catch { throw new AulaReadError("transport"); }
  }
}
