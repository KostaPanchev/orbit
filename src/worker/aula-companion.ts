import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

export const AULA_REVISION = "d9a27d84933446783c89446ba3e9d799fd47ea2c";
export const BUN_VERSION = "1.4.4";
const root = fileURLToPath(new URL("../../", import.meta.url));
export const bunExecutable = resolve(root, "node_modules/bun/bin/bun.exe");
const companion = resolve(root, ".orbit/aula-mcp");
const patch = resolve(root, "patches/aula-mcp-read-contract.patch");
const affectedFiles = [
  "packages/aula-client/src/aula-client.ts",
  "packages/aula-client/src/aula-types.ts",
  "packages/aula-client/src/aula-client.test.ts",
  "packages/mcp-server/src/tools.ts",
  "packages/mcp-server/src/tools.test.ts",
  "packages/aula-auth/src/token-store.ts",
  "apps/cli/src/login-log.ts",
  "apps/cli/src/commands/login.ts",
  "apps/cli/src/commands/tokens.test.ts",
];

function git(directory: string, args: string[]) {
  return execFileSync("git", ["--no-pager", "-C", directory, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function companionState(directory: string, revision: string, patchPath: string): "clean" | "patched" {
  if (lstatSync(directory).isSymbolicLink() || realpathSync(git(directory, ["rev-parse", "--show-toplevel"]).trim()) !== realpathSync(directory)) {
    throw new Error("The companion must be its own checkout, not a symlink or parent repository.");
  }
  if (git(directory, ["rev-parse", "HEAD"]).trim() !== revision) {
    throw new Error("Companion revision differs from the reviewed pin. No files were overwritten.");
  }
  if (git(directory, ["ls-files", "--others", "--exclude-standard"]).trim()) {
    throw new Error("Companion has untracked files. Preserve or move them before preparing it.");
  }
  const expected = readFileSync(patchPath, "utf8");
  if (!expected.startsWith("diff --git ")) throw new Error("The companion patch is missing or invalid.");
  const actual = git(directory, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/", "HEAD"]);
  if (actual === expected) return "patched";
  if (actual === "") return "clean";
  throw new Error("Companion changes differ from the reviewed patch. No files were overwritten.");
}

export function applyCompanionPatch(directory: string, revision: string, patchPath: string) {
  if (companionState(directory, revision, patchPath) === "patched") return;
  git(directory, ["apply", "--check", patchPath]);
  git(directory, ["apply", patchPath]);
  if (companionState(directory, revision, patchPath) !== "patched") {
    throw new Error("Companion patch verification failed.");
  }
}

export function assertPreparedCompanion() {
  if (!existsSync(companion) || companionState(companion, AULA_REVISION, patch) !== "patched") {
    throw new Error("Run pnpm aula:prepare first. The pinned companion patch is not ready.");
  }
}

export function assertBunRuntime() {
  const version = execFileSync(bunExecutable, ["--no-env-file", "--version"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
    env: { NODE_ENV: "production", PATH: "/usr/bin:/bin", LANG: "C" },
  }).trim();
  if (version !== BUN_VERSION) throw new Error("The local Bun runtime differs from its reviewed pin. Run pnpm install --frozen-lockfile.");
}

function run(args: string[]) {
  execFileSync("pnpm", args, {
    cwd: companion,
    stdio: "inherit",
    env: { ...process.env, AULA_MCP_WRITE: "0", AULA_MCP_RAW: "0", AULA_MCP_LOG: "0" },
  });
}

function main() {
  const mode = process.argv[2];
  if (!["prepare", "check", "test"].includes(mode ?? "") || process.argv.length !== 3) {
    throw new Error("Usage: aula-companion.ts prepare|check|test. This command never logs in or starts live sync.");
  }
  if (mode === "prepare") {
    if (!existsSync(companion)) {
      mkdirSync(dirname(companion), { recursive: true, mode: 0o700 });
      execFileSync("git", ["clone", "--no-checkout", "https://github.com/Casperjuel/aula-mcp.git", companion], { stdio: "inherit" });
      git(companion, ["checkout", "--detach", AULA_REVISION]);
    }
    applyCompanionPatch(companion, AULA_REVISION, patch);
  } else assertPreparedCompanion();
  if (mode === "test") {
    run(["typecheck"]);
    run(["exec", "biome", "check", ...affectedFiles]);
    assertBunRuntime();
    execFileSync(bunExecutable, [
      "test", "--no-env-file", "packages/aula-client/src/aula-client.test.ts",
      "packages/mcp-server/src/tools.test.ts", "apps/cli/src/commands/tokens.test.ts",
    ], { cwd: companion, stdio: "inherit", env: {
      NODE_ENV: "test",
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: homedir(), TMPDIR: tmpdir(), LANG: "C",
      AULA_MCP_WRITE: "0", AULA_MCP_RAW: "0", AULA_MCP_LOG: "0", AULA_MCP_NO_KEYCHAIN: "1",
    } });
  }
  console.log("Pinned companion patch verified. This command did not log in; live imports remain disabled.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    console.error("Aula companion preparation/check failed.", error instanceof Error ? error.message : "Unknown failure");
    process.exitCode = 1;
  }
}
