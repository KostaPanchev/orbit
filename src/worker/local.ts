import { fork, spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const mode = process.argv[2];
const originalArgs = process.argv.slice(3);
const live = originalArgs[0] === "--live";
const args = live ? originalArgs.slice(1) : originalArgs;
if (!["dev", "start"].includes(mode) || (args.length && !(args.length === 2 && args[0] === "--port" && /^\d+$/.test(args[1])))) {
  throw new Error("Use pnpm dev or pnpm start, optionally with --port NUMBER. Network binding is fixed to 127.0.0.1.");
}
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...(live ? { ORBIT_DATASET: "live-aula", ORBIT_DB_PATH: resolve(".orbit/live.sqlite") } : {}) };
const worker = fork(resolve("src/worker/main.ts"), [], { execArgv: ["--import", "tsx"], env, stdio: ["inherit", "inherit", "inherit", "ipc"] });
let app: ChildProcess | undefined;
let stopping = false;
let forceStop: ReturnType<typeof setTimeout> | undefined;
function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  worker.kill("SIGTERM");
  app?.kill("SIGTERM");
  forceStop = setTimeout(() => {
    if (worker.exitCode === null) worker.kill("SIGKILL");
    if (app?.exitCode === null) app.kill("SIGKILL");
  }, 10_000);
  forceStop.unref();
}
function exited(code: number | null) {
  if (!stopping) shutdown(code ?? 1);
  if (worker.exitCode !== null && (!app || app.exitCode !== null)) clearTimeout(forceStop);
}
worker.on("error", (error) => { console.error("Worker could not start:", error.message); shutdown(1); });
worker.on("exit", exited);
worker.once("message", (message) => {
  if (message !== "ready" || stopping) return;
  app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), mode, "--hostname", "127.0.0.1", ...args], { env, stdio: "inherit" });
  app.on("error", (error) => { console.error("App could not start:", error.message); shutdown(1); });
  app.on("exit", exited);
});
process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
