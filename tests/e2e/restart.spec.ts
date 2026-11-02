import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotSchema } from "../../src/domain/model";
import { suggestionDetails } from "../../src/domain/presentation";

test("the complete application and worker restart with saved approvals, edits and dismissals", async ({ request }) => {
  const directory = mkdtempSync(join(tmpdir(), "orbit-app-restart-"));
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a loopback port.");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  async function start() {
    child = spawn(process.execPath, ["--import", "tsx", "src/worker/local.ts", "start", "--port", String(port)], {
      env: { ...process.env, ORBIT_DB_PATH: join(directory, "restart.sqlite"), ORBIT_DATASET: "synthetic-restart" },
      stdio: "pipe",
    });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    await expect.poll(async () => {
      if (child?.exitCode !== null) throw new Error(`Local launcher exited: ${output}`);
      try { return (await request.get(`${origin}/api/organizer`, { timeout: 500 })).status(); }
      catch (error) {
        if (error instanceof Error && /ECONNREFUSED|Timeout/.test(error.message)) return 0;
        throw error;
      }
    }, { timeout: 15_000 }).toBe(200);
  }
  try {
    await start();
    const initial = snapshotSchema.parse(await (await request.get(`${origin}/api/organizer`)).json());
    const trip = initial.suggestions.find((item) => item.title === "Visit to the nature centre")!;
    const gathering = initial.suggestions.find((item) => item.title === "Autumn gathering")!;
    const approved = await request.post(`${origin}/api/organizer`, {
      headers: { Origin: origin }, data: {
        type: "approve", id: trip.id, revision: trip.revision,
        details: { ...suggestionDetails(trip, initial.agenda), title: "Kept after app restart" }, dateConfirmed: false,
      },
    });
    expect(approved.ok()).toBe(true);
    const dismissed = await request.post(`${origin}/api/organizer`, {
      headers: { Origin: origin }, data: { type: "dismiss", id: gathering.id, revision: gathering.revision },
    });
    expect(dismissed.ok()).toBe(true);
    const before = snapshotSchema.parse(await dismissed.json());
    await stop();
    await start();
    const after = snapshotSchema.parse(await (await request.get(`${origin}/api/organizer`)).json());
    expect(after.agenda).toEqual(before.agenda);
    expect(after.decisions).toEqual(before.decisions);
    expect(after.workerOnline).toBe(true);
  } finally {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  }
});
