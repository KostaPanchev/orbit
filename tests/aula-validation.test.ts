// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AllowlistedAulaReader, AulaReadError, decodeReadResult, withAulaReader,
  type AulaReader, type AulaReadTool,
} from "@/server/aula/read-client";
import { validateAula } from "@/server/aula/validate";

const signal = () => new AbortController().signal;
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const SECRET = "FICTIONAL_PRIVATE_CONTENT_DO_NOT_PRINT";

function fixtureReader() {
  const calls: Array<{ tool: AulaReadTool; args: Record<string, unknown> }> = [];
  const threads = Array.from({ length: 21 }, (_, index) => ({ id: index + 1, read: index !== 0, subject: SECRET }));
  const read = vi.fn<AulaReader["read"]>(async (tool, args) => {
    calls.push({ tool, args });
    switch (tool) {
      case "aula.profiles.list":
        return { profiles: [{ profileId: 1, displayName: SECRET, children: [{ id: 100, name: SECRET }] }] };
      case "aula.calendar.events":
        return [{ title: SECRET, startDateTime: "2026-11-02T09:00:00+01:00", endDateTime: "2026-11-02T10:00:00+01:00" }];
      case "aula.posts.list":
        return { count: 1, posts: [{ id: Number(args.index) + 1, content: SECRET }], moreMessagesExist: args.index === 0 };
      case "aula.messages.list_threads": {
        const page = Number(args.page);
        return { threads: threads.slice(page * 20, (page + 1) * 20), page, hasMorePages: page === 0 };
      }
      case "aula.messages.get_thread":
        return { messages: [{ id: Number(args.page) + 1, body: SECRET }], page: args.page, moreMessagesExist: args.page === 0 };
    }
  });
  return { read, calls, threads };
}

afterEach(() => vi.restoreAllMocks());

it("allowlists only the approved weekly-plan provider with bounded child/week inputs", async () => {
  const client = new Client({ name: "fixture", version: "1" });
  const call = vi.spyOn(client, "callTool").mockResolvedValue(text({ childId: 10, complete: true, events: [] }));
  const reader = new AllowlistedAulaReader(client);
  await reader.read("aula.ugeplan.easyiq_skoleportal", { childIds: [10], institutionCodes: ["G10"], isoWeek: "2026-W45" }, signal());
  expect(call).toHaveBeenCalledOnce();
  for (const args of [
    { childIds: [10, 20], institutionCodes: ["G10"], isoWeek: "2026-W45" },
    { childIds: [10], institutionCodes: ["G10"], isoWeek: "2026-W99" },
    { childIds: [10], institutionCodes: ["G10"], isoWeek: "2026-W45", raw: true },
  ]) await expect(reader.read("aula.ugeplan.easyiq_skoleportal", args, signal())).rejects.toMatchObject({ code: "invalid-input" });
  await expect(reader.read("aula.ugeplan.easyiq", {}, signal())).rejects.toMatchObject({ code: "denied-tool" });
  expect(call).toHaveBeenCalledOnce();
});
it("follows short post pages, more than 20 threads, and sampled thread pages without leaking content", async () => {
  const reader = fixtureReader();
  const report = await validateAula(reader, signal());
  expect(report).toMatchObject({
    outcome: "sample-checks-passed", children: 1,
    posts: { status: "passed", items: 2, pages: 2 },
    threadList: { status: "passed", items: 21, pages: 2 },
    threadMessages: { status: "passed", items: 6, pages: 6 },
    calendar: { status: "passed", items: 1 }, sampledThreads: 3, sampledUnreadThreads: 0,
    readMarkers: "unchanged-in-sample",
  });
  expect(reader.calls.filter((call) => call.tool === "aula.posts.list").map((call) => call.args.index)).toEqual([0, 1]);
  expect(reader.calls.filter((call) => call.tool === "aula.messages.get_thread").map((call) => call.args.threadId)).toEqual([2, 2, 3, 3, 4, 4]);
  expect(JSON.stringify(report)).not.toContain(SECRET);
  expect(JSON.stringify(report)).not.toMatch(/profileId|threadId|subject|body|displayName/);
  expect(report.remaining).toContain("unread read-marker behavior");
});

it("reports an unread comparison only when unread threads were actually sampled", async () => {
  const reader = fixtureReader();
  for (const thread of reader.threads) thread.read = false;
  const report = await validateAula(reader, signal());
  expect(report.sampledUnreadThreads).toBe(3);
  expect(report.readMarkers).toBe("unchanged-in-sample");
  expect(report.remaining).not.toContain("unread read-marker behavior");
});

it("does not interpret missing profile data or multiple profiles as a successful empty account", async () => {
  for (const profiles of [{}, { profiles: [] }, { profiles: [{ profileId: 1 }] }, {
    profiles: [{ profileId: 1, children: [{ id: 2 }] }, { profileId: 3, children: [{ id: 4 }] }],
  }]) {
    const read = vi.fn<AulaReader["read"]>().mockResolvedValue(profiles);
    const report = await validateAula({ read }, signal());
    expect(report.outcome).toBe("blocked");
    expect(report.profiles.status).toBe("blocked");
    expect(read).toHaveBeenCalledTimes(1);
  }
});

it.each(["missing-flag", "duplicate-page", "wrong-count", "empty-with-more"] as const)("blocks malformed post pagination: %s", async (failure) => {
  const reader = fixtureReader();
  const original = reader.read.getMockImplementation()!;
  reader.read.mockImplementation(async (tool, args, signal) => {
    if (tool !== "aula.posts.list") return original(tool, args, signal);
    if (failure === "missing-flag") return { count: 0, posts: [] };
    if (failure === "wrong-count") return { count: 99, posts: [{ id: 1 }], moreMessagesExist: false };
    if (failure === "empty-with-more") return { count: 0, posts: [], moreMessagesExist: true };
    return { count: 1, posts: [{ id: 1 }], moreMessagesExist: true };
  });
  const report = await validateAula(reader, signal());
  expect(report.outcome).toBe("blocked");
  expect(report.posts.status).toBe("blocked");
  expect(report.calendar.status).toBe("passed");
});

it("bounds a provider that never ends its pages", async () => {
  const reader = fixtureReader();
  const original = reader.read.getMockImplementation()!;
  reader.read.mockImplementation(async (tool, args, signal) => {
    if (tool !== "aula.posts.list") return original(tool, args, signal);
    return { count: 1, posts: [{ id: Number(args.index) + 1 }], moreMessagesExist: true };
  });
  const report = await validateAula(reader, signal());
  expect(report.posts).toMatchObject({ status: "blocked", pages: 50, reason: "limit" });
});

it("rejects repeated individual-thread pages rather than claiming completeness", async () => {
  const reader = fixtureReader();
  const original = reader.read.getMockImplementation()!;
  reader.read.mockImplementation(async (tool, args, signal) => tool === "aula.messages.get_thread"
    ? { messages: [{ id: 1, body: SECRET }], moreMessagesExist: true }
    : original(tool, args, signal));
  const report = await validateAula(reader, signal());
  expect(report.threadMessages).toMatchObject({ status: "blocked", reason: "incomplete" });
  expect(report.outcome).toBe("blocked");
});

it("stops the sample if read-state changes or the thread can no longer be compared", async () => {
  const reader = fixtureReader();
  const original = reader.read.getMockImplementation()!;
  reader.read.mockImplementation(async (tool, args, signal) => {
    const result = await original(tool, args, signal);
    if (tool === "aula.messages.get_thread" && args.page === 0) {
      const thread = reader.threads.find((thread) => thread.id === args.threadId);
      if (thread) thread.read = !thread.read;
    }
    return result;
  });
  const report = await validateAula(reader, signal());
  expect(report.readMarkers).toBe("changed-or-inconclusive");
  expect(report.threadMessages.reason).toBe("read-state-changed");
  expect(report.outcome).toBe("blocked");
});

it("discloses sensitive/error responses and never includes raw exception text", async () => {
  for (const error of [new AulaReadError("sensitive"), new Error(SECRET)]) {
    const reader = fixtureReader();
    const original = reader.read.getMockImplementation()!;
    reader.read.mockImplementation(async (tool, args, signal) => {
      if (tool === "aula.messages.get_thread") throw error;
      return original(tool, args, signal);
    });
    const report = await validateAula(reader, signal());
    expect(report.threadMessages.status).toBe("blocked");
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(report.exclusions).toContain("sensitive/step-up-only content");
  }
});

it("requires a real thread sample rather than claiming unread behavior was tested on an empty mailbox", async () => {
  const reader = fixtureReader();
  const original = reader.read.getMockImplementation()!;
  reader.read.mockImplementation(async (tool, args, signal) => tool === "aula.messages.list_threads"
    ? { threads: [], page: 0, hasMorePages: false }
    : original(tool, args, signal));
  const report = await validateAula(reader, signal());
  expect(report.readMarkers).toBe("not-tested");
  expect(report.outcome).toBe("blocked");
});

it("rejects write, raw, provider, discovery, attachment and arbitrary tools before dispatch", async () => {
  const client = new Client({ name: "fixture", version: "1" });
  const dispatch = vi.spyOn(client, "callTool");
  const reader = new AllowlistedAulaReader(client);
  for (const tool of [
    "aula.messages.mark_read", "aula.presence.set_template", "aula.raw_request",
    "aula.messages.get_attachment", "aula.posts.get_attachment", "aula.ugeplan.easyiq",
    "aula.discover", "__proto__", "toString",
  ]) await expect(reader.read(tool, {}, signal())).rejects.toMatchObject({ code: "denied-tool" });
  await expect(reader.read("aula.messages.get_thread", { threadId: 1, page: 0, markRead: true }, signal())).rejects.toMatchObject({ code: "invalid-input" });
  expect(dispatch).not.toHaveBeenCalled();
});

it("decodes only bounded text JSON and sanitizes provider/MCP failures", async () => {
  expect(decodeReadResult(text({ count: 0 }))).toEqual({ count: 0 });
  for (const result of [
    { content: [] }, { content: [{ type: "text", text: "not JSON" }] },
    { content: [{ type: "image", data: SECRET }] }, { ...text(SECRET), isError: true },
  ]) expect(() => decodeReadResult(result)).toThrow(AulaReadError);
  expect(() => decodeReadResult(text({ error: "step_up_required", message: SECRET }))).toThrow("sensitive");
  expect(() => decodeReadResult({
    content: [{ type: "text", text: `Invalid or incomplete posts page ${SECRET}` }], isError: true,
  })).toThrow("incomplete");
  const client = new Client({ name: "fixture", version: "1" });
  const dispatch = vi.spyOn(client, "callTool").mockRejectedValue(new McpError(ErrorCode.RequestTimeout, SECRET));
  const reader = new AllowlistedAulaReader(client);
  await expect(reader.read("aula.profiles.list", {}, signal())).rejects.toMatchObject({ code: "timeout", message: "timeout" });
  dispatch.mockRejectedValue(new Error(SECRET));
  await expect(reader.read("aula.profiles.list", {}, signal())).rejects.toMatchObject({ code: "transport", message: "transport" });
});

it("uses real stdio MCP transport without inheriting diagnostics, and waits for child shutdown", async () => {
  const directory = mkdtempSync(join(tmpdir(), "orbit-mcp-fixture-"));
  const require = createRequire(import.meta.url);
  const script = join(directory, "server.cjs");
  const pidFile = join(directory, "pid");
  try {
    writeFileSync(script, `
      const { writeFileSync } = require("node:fs");
      const { McpServer } = require(${JSON.stringify(require.resolve("@modelcontextprotocol/sdk/server/mcp.js"))});
      const { StdioServerTransport } = require(${JSON.stringify(require.resolve("@modelcontextprotocol/sdk/server/stdio.js"))});
      writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
      process.stderr.write(${JSON.stringify(SECRET)});
      const server = new McpServer({name: "fictional", version: "1"});
      server.registerTool("aula.profiles.list", {inputSchema: {}}, async () =>
        ({content: [{type: "text", text: JSON.stringify({profiles: []})}]}));
      server.connect(new StdioServerTransport());
    `);
    const result = await withAulaReader({
      command: process.execPath, args: [script], cwd: directory,
      env: { NODE_ENV: "test", PATH: "/usr/bin:/bin", HOME: directory },
    }, signal(), (reader) => reader.read("aula.profiles.list", {}, signal()));
    expect(result).toEqual({ profiles: [] });
    const pid = Number(readFileSync(pidFile, "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 10_000);
