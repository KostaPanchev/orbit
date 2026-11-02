import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withAulaReader } from "../server/aula/read-client";
import { validateAula } from "../server/aula/validate";
import {
  assertSessionFiles, prepareSessionDirectory, privateSessionEnvironment,
  requireHostSafeguards, sessionPaths, withSessionLock,
} from "../server/aula/session";
import { assertPreparedCompanion, assertBunRuntime, bunExecutable } from "./aula-companion";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--confirm-read-only-check") {
    console.error("Use pnpm aula:validate --confirm-read-only-check to authorize a local account check. It reads profiles, posts, calendar entries, and a thread sample, printing only counts/status. No source content is imported or sent to AI.");
    process.exitCode = 1;
    return;
  }
  const paths = sessionPaths(root);
  const interrupted = new AbortController();
  const stop = () => interrupted.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    await withSessionLock(paths, async () => {
      assertPreparedCompanion();
      assertBunRuntime();
      prepareSessionDirectory(paths);
      requireHostSafeguards(paths);
      if (!existsSync(join(paths.auth, "tokens.json"))) {
        console.error("Validation blocked: no saved Orbit credentials. Complete guarded login in your own terminal first.");
        process.exitCode = 1;
        return;
      }
      const signal = AbortSignal.any([interrupted.signal, AbortSignal.timeout(120_000)]);
      const report = await withAulaReader({
        command: bunExecutable,
        args: ["--no-env-file", join(root, ".orbit/aula-mcp/packages/mcp-server/src/server-stdio.ts")],
        cwd: join(root, ".orbit/aula-mcp"), env: privateSessionEnvironment(paths),
      }, signal, (reader) => validateAula(reader, signal));
      assertSessionFiles(paths);
      requireHostSafeguards(paths);
      console.log(JSON.stringify(report, null, 2));
      console.log("Only counts/status were printed. This validation command did not save source records or start live synchronization.");
      if (report.outcome !== "sample-checks-passed") process.exitCode = 1;
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

main().catch(() => {
  console.error("Validation blocked by local setup, timeout, or connector failure. No credential, provider error payload, or family content was printed. Run preflight; do not enable debug logging.");
  process.exitCode = 1;
});
