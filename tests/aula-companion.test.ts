// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyCompanionPatch, companionState } from "@/worker/aula-companion";

let directory: string;
let revision: string;
let patchPath: string;
let patchDirectory: string;
const git = (...args: string[]) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "orbit-companion-"));
  patchDirectory = mkdtempSync(join(tmpdir(), "orbit-companion-patch-"));
  patchPath = join(patchDirectory, "contract.patch");
  git("init");
  git("config", "user.name", "Orbit fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", "/dev/null");
  writeFileSync(join(directory, "fixture.txt"), "before\n");
  git("add", "fixture.txt");
  git("commit", "-m", "Fictional test fixture\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>");
  revision = git("rev-parse", "HEAD").trim();
  writeFileSync(join(directory, "fixture.txt"), "after\n");
  writeFileSync(patchPath, git("diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/", "HEAD"));
  writeFileSync(join(directory, "fixture.txt"), "before\n");
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  rmSync(patchDirectory, { recursive: true, force: true });
});

it("applies the exact patch once and verifies repeated preparation without network access", () => {
  expect(companionState(directory, revision, patchPath)).toBe("clean");
  applyCompanionPatch(directory, revision, patchPath);
  expect(companionState(directory, revision, patchPath)).toBe("patched");
  applyCompanionPatch(directory, revision, patchPath);
  expect(readFileSync(join(directory, "fixture.txt"), "utf8")).toBe("after\n");
});

it("refuses a different revision", () => {
  expect(() => applyCompanionPatch(directory, "0".repeat(40), patchPath)).toThrow("revision differs");
  expect(readFileSync(join(directory, "fixture.txt"), "utf8")).toBe("before\n");
});

it("preserves unrelated tracked and untracked changes", () => {
  writeFileSync(join(directory, "fixture.txt"), "user changes\n");
  expect(() => applyCompanionPatch(directory, revision, patchPath)).toThrow("changes differ");
  expect(readFileSync(join(directory, "fixture.txt"), "utf8")).toBe("user changes\n");
  writeFileSync(join(directory, "notes.txt"), "keep this\n");
  expect(() => applyCompanionPatch(directory, revision, patchPath)).toThrow("untracked files");
  expect(readFileSync(join(directory, "notes.txt"), "utf8")).toBe("keep this\n");
});

it("refuses extra changes after patching", () => {
  applyCompanionPatch(directory, revision, patchPath);
  writeFileSync(join(directory, "fixture.txt"), "after\nunreviewed\n");
  expect(() => companionState(directory, revision, patchPath)).toThrow("changes differ");
});

it("rejects symlinked checkouts and invalid patches", () => {
  const link = join(patchDirectory, "checkout");
  symlinkSync(directory, link);
  expect(() => companionState(link, revision, patchPath)).toThrow("not a symlink");
  writeFileSync(patchPath, "");
  expect(() => applyCompanionPatch(directory, revision, patchPath)).toThrow("patch is missing or invalid");
});
