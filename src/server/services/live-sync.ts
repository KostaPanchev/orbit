import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import { REFRESH_INTERVAL, type SyncErrorCode } from "../../domain/model";
import { assertPreparedCompanion, assertBunRuntime, bunExecutable } from "../../worker/aula-companion";
import type { OrbitDb } from "../db/client";
import { datasets, syncRuns } from "../db/schema";
import { AulaReadError, withAulaReader } from "../aula/read-client";
import { normalizeProfile } from "../aula/normalize";
import { AulaSource } from "../aula/source";
import { AulaSessionError, assertSessionFiles, clearSession, privateSessionEnvironment, requireHostSafeguards, sessionPaths, withSessionLock } from "../aula/session";
import { SourceError } from "../sources/types";
import { latestCoverage, requireDataset } from "./organizer";
import { pruneLiveData } from "./retention";
import { assertLease, synchronize } from "./sync";

function failure(db: OrbitDb, dataset: string, owner: string, code: SyncErrorCode) {
  const now = new Date().toISOString();
  db.$client.transaction(() => {
    assertLease(db, owner);
    const coverage = latestCoverage(db, dataset).map((item) => ({ ...item, complete: false, error: code, checkedAt: now, pages: 0, items: 0 }));
    db.insert(syncRuns).values({ id: randomUUID(), dataset, startedAt: now, finishedAt: now, coverage, error: code }).run();
    db.update(datasets).set({ nextRefresh: Date.now() + REFRESH_INTERVAL }).where(eq(datasets.id, dataset)).run();
  }).immediate();
}
export async function synchronizeLive(db: OrbitDb, dataset: string, owner: string, stop?: AbortSignal) {
  const paths = sessionPaths(resolve("."));
  pruneLiveData(db, dataset);
  try {
    await withSessionLock(paths, async () => {
      if (!existsSync(join(paths.auth, "tokens.json"))) throw new SourceError("disconnected");
      assertSessionFiles(paths);
      requireHostSafeguards(paths);
      assertPreparedCompanion();
      assertBunRuntime();
      const signal = AbortSignal.any([AbortSignal.timeout(5 * 60_000), ...(stop ? [stop] : [])]);
      await withAulaReader({
        command: bunExecutable, args: ["--no-env-file", resolve(".orbit/aula-mcp/packages/mcp-server/src/server-stdio.ts")],
        cwd: resolve(".orbit/aula-mcp"), env: privateSessionEnvironment(paths),
      }, signal, async (reader) => {
        const profile = normalizeProfile(await reader.read("aula.profiles.list", {}, signal));
        db.$client.transaction(() => {
          assertLease(db, owner);
          const data = requireDataset(db, dataset);
          if (data.kind !== "live" || data.accountScope && data.accountScope !== profile.accountScope) throw new SourceError("reconnect");
          db.update(datasets).set({
            accountScope: profile.accountScope, household: profile.household, householdAt: Date.now(), initialized: true,
          }).where(eq(datasets.id, dataset)).run();
        }).immediate();
        await synchronize(db, dataset, owner, new AulaSource(reader, profile, Date.now(), signal), { summarize: () => ({ candidates: [], brief: [] }) });
      });
      assertSessionFiles(paths);
    });
  } catch (error) {
    if (error instanceof SourceError) failure(db, dataset, owner, error.code);
    else if (error instanceof AulaReadError) failure(db, dataset, owner, error.code === "reconnect" ? "reconnect" : error.code === "rate-limited" ? "rate-limited" : error.code === "timeout" ? "timeout" : "unavailable");
    else if (error instanceof AulaSessionError) failure(db, dataset, owner, "disconnected");
    else if (error instanceof z.ZodError) failure(db, dataset, owner, "invalid-data");
    else throw error;
  }
}
export async function disconnectLive(db: OrbitDb, dataset: string, owner: string) {
  const paths = sessionPaths(resolve("."));
  await withSessionLock(paths, async () => {
    assertLease(db, owner);
    clearSession(paths);
    db.update(datasets).set({ paused: true }).where(and(eq(datasets.id, dataset), eq(datasets.kind, "live"))).run();
  });
  failure(db, dataset, owner, "disconnected");
}
