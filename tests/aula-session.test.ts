// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertSessionFiles, clearSession, prepareSessionDirectory, privateSessionEnvironment,
  requireLoginConsent, sessionPaths, validateHostReport, withSessionLock, type HostReport,
  type SessionPaths,
} from "@/server/aula/session";
import { runInteractiveLogin } from "@/worker/aula-session";
import { bunExecutable } from "@/worker/aula-companion";

let root: string;
let paths: SessionPaths;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "orbit-aula-session-"));
  paths = sessionPaths(root);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it("creates only private, marked storage and can be repeated", () => {
  prepareSessionDirectory(paths);
  prepareSessionDirectory(paths);
  expect(lstatSync(paths.data).mode & 0o777).toBe(0o700);
  expect(lstatSync(paths.auth).mode & 0o777).toBe(0o700);
  expect(lstatSync(join(paths.auth, ".orbit-session")).mode & 0o777).toBe(0o600);
  expect(readdirSync(paths.auth)).toEqual([".orbit-session"]);
});

it("refuses existing unrelated session data rather than adopting it", () => {
  mkdirSync(paths.data, { mode: 0o700 });
  mkdirSync(paths.auth, { mode: 0o700 });
  writeFileSync(join(paths.auth, "unrelated.txt"), "preserve");
  expect(() => prepareSessionDirectory(paths)).toThrow();
  expect(() => clearSession(paths)).toThrow();
  expect(readFileSync(join(paths.auth, "unrelated.txt"), "utf8")).toBe("preserve");
});

it.each(["data", "auth"] as const)("refuses a symlinked %s directory", (key) => {
  const outside = join(root, "outside");
  mkdirSync(outside, { mode: 0o700 });
  if (key === "auth") mkdirSync(paths.data, { mode: 0o700 });
  symlinkSync(outside, paths[key]);
  expect(() => prepareSessionDirectory(paths)).toThrow();
  expect(existsSync(outside)).toBe(true);
});

it("does not claim cleanup succeeded for a dangling session symlink", () => {
  mkdirSync(paths.data, { mode: 0o700 });
  symlinkSync(join(root, "missing"), paths.auth);
  expect(() => clearSession(paths)).toThrow();
  expect(lstatSync(paths.auth).isSymbolicLink()).toBe(true);
});

it.each(["data", "auth"] as const)("rejects broad directory permissions on %s", (key) => {
  prepareSessionDirectory(paths);
  chmodSync(paths[key], 0o755);
  expect(() => prepareSessionDirectory(paths)).toThrow("0700");
});

it("rejects broad, symlinked, or hard-linked credentials", () => {
  prepareSessionDirectory(paths);
  const key = join(paths.auth, ".key");
  const tokens = join(paths.auth, "tokens.json");
  writeFileSync(key, "fictional key", { mode: 0o600 });
  writeFileSync(tokens, "fictional encrypted tokens", { mode: 0o644 });
  expect(() => assertSessionFiles(paths)).toThrow("0600");
  chmodSync(tokens, 0o600);
  linkSync(tokens, join(root, "linked-token"));
  expect(() => assertSessionFiles(paths)).toThrow("hard links");
  rmSync(tokens);
  symlinkSync(join(root, "linked-token"), tokens);
  expect(() => assertSessionFiles(paths)).toThrow("symlinks");
});

it("rejects partial stores and leftover plaintext/log files before login", () => {
  prepareSessionDirectory(paths);
  writeFileSync(join(paths.auth, ".key"), "fictional key", { mode: 0o600 });
  expect(() => assertSessionFiles(paths)).toThrow("incomplete");
  writeFileSync(join(paths.auth, "tokens.json"), "ciphertext", { mode: 0o600 });
  assertSessionFiles(paths);
  writeFileSync(join(paths.auth, "cookies.json"), "fictional cookie", { mode: 0o600 });
  expect(() => assertSessionFiles(paths)).toThrow("legacy cookies/logs");
});

it("deletes all session material without following links or deleting the agenda", async () => {
  prepareSessionDirectory(paths);
  const agenda = join(paths.data, "orbit.sqlite");
  const outside = join(root, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep"), "unrelated");
  writeFileSync(agenda, "fictional database");
  for (const name of [".key", "tokens.json", "cookies.json", "login-log.jsonl"]) {
    writeFileSync(join(paths.auth, name), "fictional", { mode: 0o600 });
  }
  const transcripts = join(paths.auth, "transcripts");
  mkdirSync(transcripts, { mode: 0o700 });
  writeFileSync(join(transcripts, "debug.jsonl"), "fictional");
  symlinkSync(outside, join(paths.auth, "outside-link"));
  await withSessionLock(paths, async () => clearSession(paths));
  expect(existsSync(paths.auth)).toBe(false);
  expect(existsSync(paths.lock)).toBe(false);
  expect(readFileSync(agenda, "utf8")).toBe("fictional database");
  expect(readFileSync(join(outside, "keep"), "utf8")).toBe("unrelated");
  await withSessionLock(paths, async () => clearSession(paths));
});

it("surfaces incomplete deletion and preserves the ownership marker for retry", () => {
  prepareSessionDirectory(paths);
  const transcripts = join(paths.auth, "transcripts");
  mkdirSync(transcripts, { mode: 0o700 });
  writeFileSync(join(transcripts, "debug.jsonl"), "fictional");
  chmodSync(transcripts, 0o500);
  try {
    if (process.getuid?.() !== 0) {
      expect(() => clearSession(paths)).toThrow();
      expect(existsSync(join(paths.auth, ".orbit-session"))).toBe(true);
    }
  } finally { chmodSync(transcripts, 0o700); }
  clearSession(paths);
});

it("serializes operations and releases its own lock on success or error", async () => {
  prepareSessionDirectory(paths);
  await withSessionLock(paths, async () => {
    expect(lstatSync(paths.lock).mode & 0o777).toBe(0o600);
    await expect(withSessionLock(paths, async () => clearSession(paths))).rejects.toThrow("active");
  });
  expect(existsSync(paths.lock)).toBe(false);
  await expect(withSessionLock(paths, async () => { throw new Error("fictional failure"); })).rejects.toThrow("fictional failure");
  expect(existsSync(paths.lock)).toBe(false);
});

it("fails closed on an interrupted operation instead of removing its lock", async () => {
  prepareSessionDirectory(paths);
  writeFileSync(paths.lock, "interrupted operation", { mode: 0o600 });
  await expect(withSessionLock(paths, async () => clearSession(paths))).rejects.toThrow("stale lock");
  expect(readFileSync(paths.lock, "utf8")).toBe("interrupted operation");
  expect(existsSync(paths.auth)).toBe(true);
});

const protectedHost: HostReport = {
  platform: "darwin", fileVault: "FileVault is On.\n", sameVolume: true,
  exclusions: ["[Excluded] /fixture/.orbit", "[Excluded] /fixture/.orbit/aula-auth"],
  permissions: ["drwx------  fixture", "-rw-------@ fixture"],
};

it("requires fully enabled FileVault, the protected volume, explicit exclusion, and no ACLs", () => {
  expect(() => validateHostReport(protectedHost)).not.toThrow();
  for (const change of [
    { platform: "linux" }, { fileVault: "FileVault is Off." },
    { fileVault: "FileVault is On.\nDecryption in progress." }, { sameVolume: false },
    { exclusions: ["[Included] /fixture", "[Excluded] /fixture/auth"] },
    { exclusions: [] }, { permissions: ["drwx------+ fixture"] }, { permissions: [] },
    { permissions: ["unknown"] },
  ]) expect(() => validateHostReport({ ...protectedHost, ...change })).toThrow();
});

it("does not inherit credentials, write/debug flags, proxies, or runtime injection options", () => {
  vi.stubEnv("AULA_MCP_KEY", "fictional inherited secret");
  vi.stubEnv("AULA_MCP_WRITE", "1");
  vi.stubEnv("NODE_OPTIONS", "fictional");
  vi.stubEnv("HTTPS_PROXY", "fictional");
  vi.stubEnv("BUN_RUNTIME_TRANSPILER_CACHE_PATH", "fictional-inherited-cache");
  vi.stubEnv("DO_NOT_TRACK", "0");
  const env = privateSessionEnvironment(paths);
  expect(env).toMatchObject({
    AULA_MCP_DIR: paths.auth, AULA_MCP_NO_KEYCHAIN: "1", AULA_MCP_PRIVATE_SESSION: "1",
    AULA_MCP_WRITE: "0", AULA_MCP_RAW: "0", AULA_MCP_LOG: "0",
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", DO_NOT_TRACK: "1",
  });
  for (const key of ["AULA_MCP_KEY", "NODE_OPTIONS", "BUN_OPTIONS", "HTTPS_PROXY", "AULA_MCP_ALLOW_REMOTE"]) {
    expect(env[key]).toBeUndefined();
  }
});

it("allows only terminal login with both explicit confirmations and no credential/debug arguments", () => {
  const args = ["--confirm-permitted-use", "--confirm-no-other-backups"];
  expect(() => requireLoginConsent(args, true)).not.toThrow();
  expect(() => requireLoginConsent(args, false)).toThrow("interactive terminal");
  for (const invalid of [[], [args[0]], [args[0], args[0]], [...args, "--debug"], [...args, "--username", "fixture"]]) {
    expect(() => requireLoginConsent(invalid, true)).toThrow("requires");
  }
});

it("uses a private child umask, restores the parent, and reports subprocess failures", async () => {
  const mask = process.umask();
  const file = join(root, "child-file");
  const result = await runInteractiveLogin(process.execPath, [
    "-e", "require('node:fs').writeFileSync(process.argv[1], 'fictional')", file,
  ], { NODE_ENV: "test" }, root);
  expect(result).toBe(true);
  expect(lstatSync(file).mode & 0o777).toBe(0o600);
  expect(process.umask()).toBe(mask);
  expect(await runInteractiveLogin(process.execPath, ["-e", "process.exit(2)"], { NODE_ENV: "test" }, root)).toBe(false);
  expect(await runInteractiveLogin(join(root, "missing-executable"), [], { NODE_ENV: "test" }, root)).toBe(false);
});

it("keeps Bun's runtime cache out of the credential store after a successful child process", async () => {
  prepareSessionDirectory(paths);
  const fixture = join(root, "fictional-login.ts");
  // Exercise disk caching with a TypeScript module larger than Bun's cache threshold.
  writeFileSync(fixture, `
    import { writeFileSync } from "node:fs";
    import { join } from "node:path";
    const values: number[] = [${Array.from({ length: 20_000 }, (_, i) => i).join(",")}];
    if (values.length !== 20000) throw new Error("Invalid fictional fixture");
    const directory = process.env.AULA_MCP_DIR;
    if (!directory) throw new Error("Missing fictional session directory");
    writeFileSync(join(directory, ".key"), "fictional key", { mode: 0o600 });
    writeFileSync(join(directory, "tokens.json"), "fictional ciphertext", { mode: 0o600 });
  `);
  await withSessionLock(paths, async () => {
    expect(await runInteractiveLogin(bunExecutable, ["--no-env-file", fixture], privateSessionEnvironment(paths), root)).toBe(true);
    expect(readdirSync(paths.auth).sort()).toEqual([".key", ".orbit-session", "tokens.json"]);
    assertSessionFiles(paths);
  });
  expect(readFileSync(join(paths.auth, "tokens.json"), "utf8")).toBe("fictional ciphertext");
  expect(existsSync(paths.lock)).toBe(false);
});

it("waits for its login child to stop when interrupted", () => {
  const moduleUrl = pathToFileURL(join(process.cwd(), "src/worker/aula-session.ts")).href;
  const script = `
    import { runInteractiveLogin } from ${JSON.stringify(moduleUrl)};
    setTimeout(() => process.emit("SIGTERM"), 200);
    const result = await runInteractiveLogin(process.execPath,
      ["-e", "setInterval(() => {}, 1000)"], { NODE_ENV: "test" }, process.cwd());
    process.exit(result ? 1 : 0);
  `;
  expect(() => execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "-e", script,
  ], { timeout: 8_000, stdio: "pipe" })).not.toThrow();
});

it("blocks the actual login command under captured output before launching authentication", () => {
  const result = spawnSync(process.execPath, [
    "--import", "tsx", "src/worker/aula-session.ts", "login",
    "--confirm-permitted-use", "--confirm-no-other-backups",
  ], { encoding: "utf8", stdio: "pipe", timeout: 10_000 });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("your own interactive terminal");
});
