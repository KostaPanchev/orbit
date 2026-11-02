import { execFileSync } from "node:child_process";
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, realpathSync, rmdirSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class AulaSessionError extends Error {}

const MARKER = "orbit-aula-private-session-v1\n";
const MARKER_NAME = ".orbit-session";
const SESSION_FILES = new Set([MARKER_NAME, ".key", "tokens.json"]);

export function sessionPaths(root: string) {
  const data = join(realpathSync(root), ".orbit");
  return { data, auth: join(data, "aula-auth"), lock: join(data, ".aula-session.lock") };
}
export type SessionPaths = ReturnType<typeof sessionPaths>;

function assertOwned(path: string, directory: boolean, privateMode = true) {
  const info = lstatSync(path);
  if (info.uid !== process.getuid?.() || info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1)) {
    throw new AulaSessionError("Session storage must be owned by this user, with no symlinks, hard links, or special files.");
  }
  if (privateMode && (info.mode & 0o7777) !== (directory ? 0o700 : 0o600)) {
    throw new AulaSessionError("Session storage permissions must be 0700 for directories and 0600 for files. Nothing was loosened automatically.");
  }
  return info;
}

function ensureDataDirectory(paths: SessionPaths) {
  if (!existsSync(paths.data)) mkdirSync(paths.data, { mode: 0o700 });
  assertOwned(paths.data, true);
}

function assertMarker(paths: SessionPaths) {
  const auth = assertOwned(paths.auth, true);
  if (auth.dev !== lstatSync(paths.data).dev) {
    throw new AulaSessionError("The session directory must not be a separate mounted volume.");
  }
  const marker = join(paths.auth, MARKER_NAME);
  assertOwned(marker, false);
  if (readFileSync(marker, "utf8") !== MARKER) {
    throw new AulaSessionError("The session directory is not marked as Orbit-owned. Refusing to adopt or delete it.");
  }
}

export function prepareSessionDirectory(paths: SessionPaths) {
  ensureDataDirectory(paths);
  if (!existsSync(paths.auth)) mkdirSync(paths.auth, { mode: 0o700 });
  assertOwned(paths.auth, true);
  const marker = join(paths.auth, MARKER_NAME);
  if (!existsSync(marker) && readdirSync(paths.auth).length === 0) {
    writeFileSync(marker, MARKER, { mode: 0o600, flag: "wx" });
  }
  assertSessionFiles(paths);
}

export function assertSessionFiles(paths: SessionPaths) {
  assertMarker(paths);
  for (const name of readdirSync(paths.auth)) {
    if (!SESSION_FILES.has(name)) {
      throw new AulaSessionError("Unexpected session files or legacy cookies/logs exist. Run pnpm aula:disconnect before logging in.");
    }
    assertOwned(join(paths.auth, name), false);
  }
  const tokens = existsSync(join(paths.auth, "tokens.json"));
  const key = existsSync(join(paths.auth, ".key"));
  if (tokens !== key) throw new AulaSessionError("The credential store is incomplete. Run pnpm aula:disconnect before retrying.");
}

export async function withSessionLock<T>(paths: SessionPaths, action: () => Promise<T>): Promise<T> {
  ensureDataDirectory(paths);
  let descriptor: number;
  try {
    descriptor = openSync(paths.lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new AulaSessionError("An Aula operation is active or was interrupted. Stop it first. A stale lock requires local process verification; it is never removed automatically.");
    }
    throw error;
  }
  const ownLock = fstatSync(descriptor);
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid }));
    return await action();
  } finally {
    closeSync(descriptor);
    const current = lstatSync(paths.lock);
    if (current.ino !== ownLock.ino || current.dev !== ownLock.dev) {
      throw new AulaSessionError("The session lock changed unexpectedly; it was not removed.");
    }
    unlinkSync(paths.lock);
  }
}

function removeContents(directory: string, device: number, preserveMarker = false) {
  for (const name of readdirSync(directory)) {
    if (preserveMarker && name === MARKER_NAME) continue;
    const path = join(directory, name);
    const info = lstatSync(path);
    if (info.isDirectory() && !info.isSymbolicLink()) {
      if (info.dev !== device) throw new AulaSessionError("Session cleanup will not cross into another mounted volume.");
      assertOwned(path, true, false);
      removeContents(path, device);
      rmdirSync(path);
    } else {
      // Unlink entries only; never follow a leftover cookie/log symlink.
      unlinkSync(path);
    }
  }
}

export function clearSession(paths: SessionPaths) {
  ensureDataDirectory(paths);
  if (!lstatSync(paths.auth, { throwIfNoEntry: false })) return;
  assertMarker(paths);
  removeContents(paths.auth, lstatSync(paths.auth).dev, true);
  unlinkSync(join(paths.auth, MARKER_NAME));
  rmdirSync(paths.auth);
  if (existsSync(paths.auth)) throw new AulaSessionError("Session cleanup did not complete.");
}

export interface HostReport {
  platform: string;
  fileVault: string;
  sameVolume: boolean;
  exclusions: string[];
  permissions: string[];
}

export function validateHostReport(report: HostReport) {
  if (report.platform !== "darwin") throw new AulaSessionError("Live login is restricted to the approved Mac-local arrangement.");
  if (report.fileVault.trim() !== "FileVault is On." || !report.sameVolume) {
    throw new AulaSessionError("FileVault protection could not be confirmed for this storage volume. Enable/finish FileVault encryption on the startup data volume before login.");
  }
  if (report.exclusions.length !== 2 || report.exclusions.some((line) => !line.trim().startsWith("[Excluded]"))) {
    throw new AulaSessionError("Time Machine exclusion is not confirmed. Exclude Orbit's .orbit directory, then run pnpm aula:preflight again. Other backup/sync tools must be checked separately.");
  }
  if (!report.permissions.length || report.permissions.some((line) => {
    const mode = line.trim().split(/\s+/)[0];
    return !/^[d-][rwx-]{9}@?$/.test(mode ?? "");
  })) {
    throw new AulaSessionError("Storage has extended ACLs or unverifiable permissions. Remove additional access grants before login.");
  }
}

export function requireHostSafeguards(paths: SessionPaths) {
  if (process.platform !== "darwin") throw new AulaSessionError("Live login is restricted to macOS.");
  const run = (command: string, args: string[]) => execFileSync(command, args, {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
    env: { NODE_ENV: "production", PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LC_ALL: "C", LANG: "C" },
  });
  let report: HostReport;
  try {
    report = {
      platform: process.platform,
      fileVault: run("/usr/bin/fdesetup", ["status"]),
      sameVolume: statSync(paths.auth).dev === statSync("/System/Volumes/Data").dev,
      exclusions: [paths.data, paths.auth].map((path) => run("/usr/bin/tmutil", ["isexcluded", path])),
      permissions: [paths.data, paths.auth, ...readdirSync(paths.auth).map((name) => join(paths.auth, name))]
        .map((path) => run("/bin/ls", ["-lde", path])),
    };
  } catch {
    throw new AulaSessionError("A local encryption, backup, or permission check could not run. Login remains blocked; check FileVault and Time Machine locally.");
  }
  validateHostReport(report);
}

export function privateSessionEnvironment(paths: SessionPaths): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: paths.auth, TMPDIR: tmpdir(), LANG: "C", LC_ALL: "C", TERM: "xterm-256color",
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", DO_NOT_TRACK: "1",
    AULA_MCP_DIR: paths.auth, AULA_MCP_NO_KEYCHAIN: "1", AULA_MCP_PRIVATE_SESSION: "1",
    AULA_MCP_WRITE: "0", AULA_MCP_RAW: "0", AULA_MCP_LOG: "0",
  };
}

export function requireLoginConsent(args: string[], interactive: boolean) {
  if (!interactive) throw new AulaSessionError("Login requires your own interactive terminal. Do not run it through chat, a pipe, or captured output.");
  const required = ["--confirm-permitted-use", "--confirm-no-other-backups"];
  if (args.length !== required.length || required.some((arg) => !args.includes(arg))) {
    throw new AulaSessionError("Login requires --confirm-permitted-use and --confirm-no-other-backups. Do not confirm until you have checked permitted unofficial access and all other backup/sync exclusions. No other login options are accepted.");
  }
}
