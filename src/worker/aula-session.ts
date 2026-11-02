import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  AulaSessionError, assertSessionFiles, clearSession, prepareSessionDirectory,
  privateSessionEnvironment, requireHostSafeguards, requireLoginConsent,
  sessionPaths, withSessionLock,
} from "../server/aula/session";
import { assertPreparedCompanion, assertBunRuntime, bunExecutable } from "./aula-companion";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function runInteractiveLogin(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const previousMask = process.umask(0o077);
  let child: ChildProcess;
  try { child = spawn(command, args, { cwd, env, stdio: "inherit" }); }
  finally { process.umask(previousMask); }
  let interrupted = false;
  let failed = false;
  let forceStop: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    interrupted = true;
    child.kill("SIGTERM");
    forceStop ??= setTimeout(() => child.kill("SIGKILL"), 5_000);
    forceStop.unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    return await new Promise<boolean>((resolveExit) => {
      child.once("error", () => { failed = true; });
      child.once("close", (code) => resolveExit(!interrupted && !failed && code === 0));
    });
  } finally {
    clearTimeout(forceStop);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "login") {
    requireLoginConsent(args, Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY));
  } else if (!["preflight", "disconnect"].includes(mode ?? "") || args.length) {
    throw new AulaSessionError("Use pnpm aula:preflight, pnpm aula:disconnect, or the documented guarded login command.");
  }
  const paths = sessionPaths(root);
  await withSessionLock(paths, async () => {
    if (mode === "disconnect") {
      clearSession(paths);
      console.log("Orbit's local Aula credentials, key, cookies, and authentication logs are removed. Agenda/database and other Aula installations are unchanged. This does not revoke sessions on Aula's servers.");
      return;
    }
    try {
      assertPreparedCompanion();
      assertBunRuntime();
    } catch {
      throw new AulaSessionError("The pinned companion or local Bun runtime is not ready. Run pnpm install --frozen-lockfile, pnpm aula:prepare, and pnpm aula:test before preflight.");
    }
    prepareSessionDirectory(paths);
    requireHostSafeguards(paths);
    if (mode === "preflight") {
      console.log("Private-file, FileVault, and Time Machine checks passed. Confirm permitted unofficial access and other backup/sync exclusions separately. No login or data import was performed.");
      return;
    }
    const environment = privateSessionEnvironment(paths);
    let completed = false;
    try {
      const succeeded = await runInteractiveLogin(bunExecutable, [
        "--no-env-file", join(root, ".orbit/aula-mcp/apps/cli/src/index.ts"), "login",
      ], environment, join(root, ".orbit/aula-mcp"));
      if (!succeeded) throw new AulaSessionError("Login failed or was cancelled. Partial local credentials will be removed.");
      assertSessionFiles(paths);
      requireHostSafeguards(paths);
      if (!existsSync(join(paths.auth, "tokens.json"))) throw new AulaSessionError("Login exited without saving credentials.");
      completed = true;
      console.log("Local credentials saved in Orbit's isolated encrypted store. Live imports remain disabled; account coverage and read-only behavior still need validation.");
    } finally {
      if (!completed) clearSession(paths);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof AulaSessionError ? error.message : "A local session operation failed. It was not reported as successful; no credential/error payload was logged.");
    process.exitCode = 1;
  });
}
