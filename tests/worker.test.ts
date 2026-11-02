// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { fork, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { openDatabase, type OrbitDb } from "@/server/db/client";
import { getSnapshot, mutate } from "@/server/services/organizer";
import { suggestionDetails } from "@/domain/presentation";

const children: ChildProcess[] = [];
let directory: string | undefined;
let db: OrbitDb | undefined;
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, "exit");
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
  try { await exit; } finally { clearTimeout(timeout); }
}
afterEach(async () => {
  for (const child of children) await stop(child);
  children.length = 0;
  db?.$client.close();
  db = undefined;
  if (directory) rmSync(directory, { recursive: true, force: true });
});
it("initializes, processes browser-independent jobs, stops, and restarts without losing decisions", async () => {
  directory = mkdtempSync(join(tmpdir(), "orbit-worker-"));
  const path = join(directory, "worker.sqlite");
  const dataset = "synthetic-process";
  async function start() {
    const child = fork(resolve("src/worker/main.ts"), [], {
      execArgv: ["--import", "tsx"], env: { ...process.env, ORBIT_DB_PATH: path, ORBIT_DATASET: dataset },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    children.push(child);
    let errors = "";
    child.stderr?.on("data", (chunk) => { errors += String(chunk); });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Worker readiness timed out.")), 10_000);
      child.once("message", (message) => {
        clearTimeout(timer);
        if (message === "ready") resolve();
        else reject(new Error("Unexpected worker message"));
      });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Worker exited ${code}: ${errors}`)); });
    });
    return child;
  }
  const first = await start();
  db = openDatabase(path);
  const state = getSnapshot(db, dataset);
  const candidate = state.suggestions.find((item) => item.title === "Visit to the nature centre")!;
  mutate(db, dataset, { type: "approve", id: candidate.id, revision: candidate.revision, dateConfirmed: false, details: { ...suggestionDetails(candidate, state.agenda), title: "Persistent across processes" } });
  mutate(db, dataset, { type: "refresh" });
  for (let attempts = 0; attempts < 50 && getSnapshot(db, dataset).job; attempts++) await delay(100);
  expect(getSnapshot(db, dataset).job).toBeNull();
  const before = getSnapshot(db, dataset);
  await stop(first);
  expect(getSnapshot(db, dataset).workerOnline).toBe(false);
  mutate(db, dataset, { type: "refresh" });
  expect(getSnapshot(db, dataset).job).toBe("queued");
  const second = await start();
  expect(getSnapshot(db, dataset).agenda).toEqual(before.agenda);
  expect(getSnapshot(db, dataset).decisions).toEqual(before.decisions);
  expect(getSnapshot(db, dataset).job).toBeNull();
  await stop(second);
}, 25_000);

it("rejects attempts to override the local launcher's loopback binding", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/worker/local.ts", "start", "--hostname", "0.0.0.0"], { stdio: "ignore" });
  children.push(child);
  const [code] = await once(child, "exit");
  expect(code).toBe(1);
});
