# Orbit

A single-household dashboard for school and kindergarten information: what matters today, what is coming up, and what needs your review.

Orbit is planned to bring relevant Aula messages, posts, and calendar events into a focused daily overview, reducing the need to read every source individually. It is a dashboard first, not a chatbot or an autonomous agent.

> **Status: Phase 2 local organizer implemented; Phase 3 guarded login and account validation available.** Today, Upcoming, Review, source details, and local settings still use persisted synthetic data. User-controlled login and an explicitly authorized content-free account check have succeeded. Live synchronization, retention-backed live persistence, real AI, remote access, and external calendars are not enabled.

## Prototype experience

- **Today:** a concise daily brief highlighting important changes and actions.
- **Upcoming:** events and deadlines for the next 30 days, with child and institution labels and child filtering.
- **Review:** event suggestions that can be approved, edited and approved, or dismissed.
- **Source details:** source references, timestamps, and original Danish excerpts alongside English summaries.
- **Clear status:** separate indicators for source coverage, last successful refresh, and brief generation time, including partial, stale, disconnected, and AI-unavailable states.

The interface and prewritten summaries are in English, with fictional Danish source excerpts available for verification.

### Review before scheduling

The demo distinguishes structured calendar fixtures from prewritten suggestions. Suggestions include supporting evidence and disclose uncertainty; missing times or durations are not invented, date-only events remain date-only, and unresolved dates stay in review unless a user explicitly confirms a date.

Approved suggestions link to their agenda entries to avoid duplicates. A changed-source fixture proposes a revision to the lantern walk; approval replaces the linked entry and preserves its previously edited title.

**Approvals only affect Orbit.** No Google or Apple calendar will be connected in the initial five phases.

## Roadmap

Each phase requires a separate request to begin, completion of its prerequisites, and feedback before proceeding.

| Phase | Deliverable | Boundary |
| --- | --- | --- |
| 1. UI/UX prototype | Interactive Today, Upcoming, Review, source details, filters, and demo settings | Fictional fixtures and in-memory state only; no integrations or persistence |
| 2. Local organizer | Persistent agenda and review decisions, synthetic imports, and a refresh worker | Still uses synthetic data; no live Aula access or real AI |
| 3. Read-only Aula | Authorized messages, posts, and structured calendar events | Requires approved data safeguards and validated account access; AI remains disabled |
| 4. Grounded AI | English briefs and reviewable suggestions backed by source evidence | Requires an explicit AI provider, processing location, and data-handling decision |
| 5. Private deployment | Supervised worker, protected access, backups, and tested recovery | Requires explicit hosting and access-control decisions |

### Current milestone: the persistent local organizer

The prototype uses Emma at Lindely School and Alex at Birch Kindergarten, both fictional, with prewritten English summaries and Danish source excerpts. The fixed demo date is **2 November 2026**; the upcoming window includes **2 November through 1 December**, in Copenhagen time.

- Approve, edit-and-approve, and dismiss save to local SQLite. Source evidence, candidate revisions, review history, agenda entries, briefs, and sync outcomes are persisted.
- Decisions survive navigation, browser reloads, and application/worker restarts. Approvals say **"Saved to Orbit."** Child filters remain session UI state.
- Reimporting unchanged sources does not duplicate entries or reopen decisions. Changed approved sources create proposed revisions; stale review submissions are rejected, and edited title/date/time/location fields are retained by default.
- **Refresh synthetic data** and the scenario selector enqueue durable worker jobs. Normal, busy, empty-response, slow-refresh, partial, stale, failure, disconnected, expired-session, and summary-unavailable scenarios exercise the persistence workflow, not just presentation.
- Empty responses retain existing data: absence is not a deletion. Failed checks never appear as an all-clear result. Summary failures keep the previous brief and its timestamp while structured calendar facts remain available.
- **Reset synthetic dataset** resets only the selected synthetic dataset, then reimports the initial fixtures. Reloading and changing scenarios never reset decisions.
- Source timestamps and the 30-day agenda window remain fictional and fixed. Refresh and brief-processing timestamps reflect actual local processing; unchanged brief content keeps its original processing timestamp.

## Technology and later-phase choices

| Area | Choice | Introduced |
| --- | --- | --- |
| Frontend | Next.js App Router, TypeScript, pnpm | Phase 1 |
| Design | Tailwind CSS and custom, minimal Material-inspired components; no Material UI library | Phase 1 |
| Validation | Zod domain schemas | Phase 2 |
| Persistence | SQLite with Drizzle migrations | Phase 2 |
| Refresh | Node worker sharing server-side domain services | Phase 2 |
| Aula access | Allowlisted MCP read tools through a local companion process | Phase 3 |
| AI | Explicitly selected provider behind a summarizer boundary | Phase 4 |

The prototype is mobile-first, with restrained color, clear typography, and low visual noise. WCAG 2.1 AA checks cover keyboard operation, visible focus, meaningful labels, non-color status cues, reduced motion, and 200% zoom/reflow. Native modal dialogs provide source inspection and editing; local system fonts avoid remote font requests.

The Next.js application and a separate Node worker share SQLite (Drizzle with `better-sqlite3`) and validated domain services. Only the worker ingests sources. The browser reads server snapshots and submits validated mutations; it does not persist data in localStorage or schedule imports. Synthetic adapters and deterministic summarization use typed boundaries that can support later authorized integrations.

**Selected hosting: the existing Mac.** The app, SQLite database, and worker run locally without a hosting subscription. Keep access on loopback; remote access has not been approved.

Scheduled refresh runs every 30 minutes while Orbit and the Mac are running, with manual refresh using the same workflow. Stopping the local launcher stops the app and worker; sleep suspends work. Closing the browser does not stop the worker. Overdue work resumes when running again. A database-backed lease prevents competing workers, and interrupted jobs are retried after recovery. This downtime is acceptable; no always-on deployment is enabled.

## Aula integration

Initial live coverage is limited to core Aula messages, posts, and calendar events. Weekly-plan providers, document/image attachments, and content requiring additional access will remain visibly unprocessed.

[Casperjuel/aula-mcp](https://github.com/Casperjuel/aula-mcp) is the preferred feasibility candidate, **not a live-validated integration**. It is an experimental community integration, not an established official integration contract.

Phase 3 has started with approved local-only safeguards: FileVault-protected storage, data/token exclusion from backups, a maximum 90-day live-data retention period, and explicit deletion. Credential isolation, pre-login checks, and local session cleanup are implemented below. Live-record retention/deletion and worker disconnect integration are **not implemented yet**; no live imports are enabled.

Inspection of pinned revision `d9a27d84933446783c89446ba3e9d799fd47ea2c` found that malformed responses can become empty successful results and individual-thread completion metadata is not exposed. The inspected Python MCP alternative also loses post-completion information. The approved local patch rejects ambiguous results, preserves thread continuation metadata, and normalizes Aula's verified `hasMorePosts` flag. Missing, invalid, and conflicting flags still fail explicitly. The companion supports protected login and account validation, but is not connected to the organizer worker. Existing startup still rejects live datasets.

Before adoption, a pinned revision must be reviewed and validated for authorized login, account-specific coverage, pagination, read-marker behavior, session expiry, reconnect handling, and permitted use. The proposed integration uses a local MCP stdio companion, with its Bun runtime separate from the Next.js Node runtime.

Orbit will allowlist required read tools and leave `AULA_MCP_WRITE` and `AULA_MCP_RAW` disabled. It must not mark messages read, change presence, download excluded attachments, or bypass access controls.

See the [integration research and feasibility checklist](./plan.md#aula-integration-research-and-recommendation) for alternatives and detailed requirements.
See [Phase 3 status](./plan.md#phase-3-read-only-aula-integration) for pinned source evidence, approved safeguards, and the next decision.

### Offline companion preparation

```sh
pnpm aula:prepare
pnpm --dir .orbit/aula-mcp install --frozen-lockfile --ignore-scripts
pnpm aula:check
pnpm aula:test
```

Preparation downloads public source into ignored `.orbit/aula-mcp`, checks out the reviewed commit, and applies [the recorded response/pagination patch](./patches/aula-mcp-read-contract.patch). The [upstream MIT license](./patches/aula-mcp-LICENSE) is retained. Re-running preparation is safe for the exact patched checkout; an unexpected revision, tracked change, or untracked file stops preparation without overwriting it.

The companion uses its own pinned package manager/workspace dependencies, separate from Next.js. Bun 1.4.4 is a pinned local development dependency installed by `pnpm install --frozen-lockfile`; tests and login never download a runtime on demand. The test command checks companion types and affected-file lint, and exercises fictional HTTP responses through the client and in-memory MCP transport. It also tests encrypted persistence with fictional credentials in temporary directories, not your actual store. These commands do not start an MCP service, authenticate against Aula/MitID, or enable live ingestion.

### Pre-login safeguards and local session

Use the Orbit commands, **not the companion's raw login/logout/status commands**. Earlier direct CLI login instructions are superseded by this guarded workflow.

```sh
pnpm aula:preflight
```

Preflight creates an Orbit-owned, ignored `.orbit/aula-auth` directory with `0700` permissions and a `0600` ownership marker. It verifies private permissions, rejects links and additional ACL grants, requires fully enabled FileVault on the startup data volume, and checks Time Machine exclusion for both `.orbit` and the credential directory. It does not read/decrypt credentials, log in, or import data.

If Time Machine exclusion is missing, run this from the repository root, then repeat preflight:

```sh
/usr/bin/tmutil addexclusion "$PWD/.orbit"
pnpm aula:preflight
```

This excludes only Orbit's local data directory from future Time Machine backups; it does not change other backup settings or remove older backups. Check cloud-sync and other backup tools separately. On the development Mac, the approved exclusion was applied and preflight passed on 2 November 2026.

After preflight passes, and **only after you have confirmed permitted use of this unofficial connector and excluded the directory from every other backup/sync tool**, you may initiate the private account-validation step in your own terminal:

```sh
pnpm aula:login --confirm-permitted-use --confirm-no-other-backups
```

Those flags are your explicit confirmations, not bypasses for the enforced checks. Login refuses pipes/captured output and extra options such as usernames, debug flags, or transcript paths. Enter your MitID username and complete the app/QR prompts locally; do not share the terminal output, screenshots, QR codes, or credentials in chat.

- Tokens use the connector's AES-256-GCM file store under `.orbit/aula-auth`, with a `0600` local key and token file. No system Keychain entry or another installation's token store is used. Both files are sensitive; encryption with a colocated key does not protect against a compromised/unlocked user account.
- The child process has a private umask and restricted environment, with environment-file loading disabled. Bun's runtime transpiler disk cache is disabled because its isolated home is the strict credential directory; cached code must not appear there. `DO_NOT_TRACK=1` also disables Bun's automatic crash-report uploads/telemetry. The child cannot inherit alternate credential locations/keys, cache overrides, write/raw flags, proxies, or runtime preload options from the parent environment.
- Private-session mode disables persisted cookies, identity-bearing login logs, and debug transcripts; upstream error payloads are not printed on login failure. Cookie-based silent reauthentication is intentionally unavailable. The OAuth/MitID protocol is unchanged.
- Only one Orbit session operation can run at a time. Cancellation stops the login child before cleanup; failed/cancelled login clears the isolated credential store, including any previous credentials there. Preflight failures do not silently delete existing credentials.
- A successful login saves credentials only. It does **not** populate Orbit or establish complete/read-only account coverage.

To clear the local session:

```sh
pnpm aula:disconnect
```

This deletes the owned token/key files and any leftover cookies, logs, or transcripts, without following symlinks or crossing mounted volumes. It leaves the organizer database/agenda and unrelated Aula installations untouched. Cleanup errors are reported as failures, not successful logout. It is local deletion, not remote token revocation, backup erasure, or forensic secure erase.

Stop an active login with **Ctrl+C** before disconnecting. A force-killed process can leave `.orbit/.aula-session.lock`; Orbit refuses automatic stale-lock removal because its login child might still be running. Verify that both the owning process and its login child have stopped before manually removing that specific lock. Do not remove it merely to bypass a busy/error state.

An earlier wrapper allowed Bun to create a runtime code cache inside the credential directory. That caused authentication to succeed but Orbit's post-login check to reject the session with "Unexpected session files or legacy cookies/logs exist." The cache is now disabled, not added to the credential allowlist. The failed guarded attempt runs local cleanup; rerun `pnpm aula:preflight` and then the guarded login command above. This fix was reproduced and verified with the actual Bun runtime and fictional files, without reading real credentials or repeating authentication.

**Still pending:** full-window account coverage, unread read-marker behavior, expiry/reconnect validation, 90-day live-record retention/deletion, worker disconnect integration, and live UI/sync. An allowlisted account-validation command is available below; missing evidence remains an explicit failure.

### Content-free account validation

After guarded login, this command can check the connector without importing source records:

```sh
pnpm aula:validate --confirm-read-only-check
```

The confirmation authorizes reads of profiles, all bounded pages of posts/thread listings, this week's calendar, and up to three message threads (preferring already-read threads). It compares each sampled thread's read status afterward and stops the sample if that status changes or cannot be compared. A change could also come from concurrent Aula use; Orbit reports it as changed/inconclusive, never attempts a write to restore it, and does not declare validation successful.

The local Node client talks to the pinned Bun companion over MCP stdio. Its allowlist permits only profile listing, post listing, thread listing/reading, and calendar reads with validated inputs. Write/raw, presence, discovery, attachment, and provider tools are denied before dispatch. Credentials stay in the protected store; the companion may renew its authentication tokens. Provider stderr and raw errors are not forwarded, and the final report contains only counts, fixed status/reason codes, and declared limitations.

Checks stop at 50 pages per listing/thread, 15 seconds per request, or 120 seconds overall. Missing/duplicate/inconsistent pages, sensitive-message restrictions, malformed data, and limits remain explicit failures. Each process is closed and awaited before releasing the session lock. No family content, IDs, names, source hashes, or credential values are printed or saved in a report file.

An authorized account sample has passed after fixing the native post-pagination field. **`sample-checks-passed` is not Phase 3 completion:** already-read samples do not establish unread behavior; a calendar-week sample does not establish a full 30-day import; source normalization, expiry/reconnect behavior, 90-day retention/deletion, and live worker/UI wiring remain outstanding. The report lists these limitations. The dashboard will remain synthetic until that implementation is complete; no additional MitID setup is needed merely to implement it.

## Trust and privacy

- Use fictional data until the live-data safeguards are explicitly approved.
- Bind local prototypes to loopback; do not expose an unauthenticated prototype to a LAN or the internet.
- Before live ingestion, decide storage, retention, access control, encryption, credential handling, backup, disconnect, and deletion behavior. SQLite alone does not encrypt stored content.
- Keep connector tokens out of client code, logs, and the repository. Never supply MitID credentials or tokens in chat.
- Avoid third-party analytics, content-bearing error telemetry, and logging family content.
- Keep live AI disabled until its provider, processing location, retention, and any external data transfers are approved. A local MCP process does not imply local AI processing.
- Treat source messages as untrusted data, not instructions. AI must have no Aula write tools, secrets, arbitrary browsing, or direct database mutation capability.
- Validate AI output against source evidence. On failure, show an explicit error and preserve last-successful data with its original timestamp rather than fabricate a replacement.

Orbit supplements Aula; it cannot promise complete coverage of excluded or inaccessible sources. **"No new information" is valid only after the relevant sources have been successfully checked.**

## Getting started

Use Node.js 24 and pnpm (the package manager version is pinned in the manifest).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:3000**. The launcher migrates and initializes the synthetic database in the worker, then starts Next.js. Development and production scripts bind to loopback and disable Next.js telemetry. No credentials or external data services are needed. Dependency installation requires the package registry; the running organizer makes no external service requests.

For a local production preview:

```sh
pnpm build
pnpm start
```

Stop the launcher with **Ctrl+C**; both app and worker stop. Do not run `pnpm worker` alongside `pnpm dev` or `pnpm start` against the same database.

### Local database and worker

- Default storage: `.orbit/orbit.sqlite`, with SQLite WAL/SHM sidecars. These files are ignored by Git. SQLite is **not encrypted**; only fictional data is authorized.
- `pnpm db:setup` applies committed Drizzle migrations and imports synthetic fixtures without starting the app. It preserves decisions. Run it only when the worker is stopped.
- `pnpm worker` runs ingestion alone, independently of any browser. Only one worker may hold the database lease; after a crash, takeover can require up to 60 seconds.
- `ORBIT_DB_PATH` selects another local database file. `ORBIT_DATASET` selects a dataset named `synthetic-*` (default `synthetic-default`). Set these in the launching shell so both app and worker receive the same values. Live datasets are rejected.
- `pnpm db:generate` generates migrations after schema changes. Startup and `db:setup` apply migrations; page renders and API requests never migrate, seed, or ingest.
- Sync fetches every synthetic page, uses five-second page timeouts with at most three attempts and bounded backoff, and records per-source coverage. Worker jobs survive a closed browser and process interruption.
- If the worker is offline, saved information remains visible and refresh requests wait in the queue. Restart Orbit to process them. A local-storage error is shown explicitly rather than reporting a successful save.
- The app is unauthenticated and synthetic-only. Host checks and same-origin JSON mutations are additional local safeguards, not authorization for remote or live-data use.

### Try the main journey

1. Inspect a daily brief source and its original Danish excerpt, including the unprocessed attachment warning.
2. Open Review. Approve the consent deadline, edit and approve the trip, and dismiss the unresolved gathering.
3. Approve the lantern walk revision. Upcoming should show one updated entry with the original edited title.
4. Reload the page, then stop and restart Orbit. Your approvals, edits, and dismissals should remain.
5. Try Partial results or Summary unavailable, refresh, and inspect Local settings. Prior successful data remains visible with explicit coverage/errors.
6. Choose Reset synthetic dataset to restore the initial four agenda items and four pending suggestions.

The consent fixture is only a reminder: approving it does not reply in Aula. No external calendar is connected. A user-entered date outside the 30-day window is saved but not shown in Upcoming; the approval announcement explains this.

Phase 2 is ready for local-organizer feedback. Phase 3 is not started: live-data safeguards and authorized account access still require a separate decision and request. The AI provider/processing location and remote deployment also remain unapproved. See [plan.md](./plan.md) for phase gates and [AGENTS.md](./AGENTS.md) for contributor guidance.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium # first browser test run only
pnpm test:e2e
```

The browser suite starts and stops its own loopback production server on port 3100, with isolated `.orbit/e2e.sqlite` storage and `synthetic-e2e` fixtures. Tests run serially and reset their dataset before each UI journey. Restart checks use temporary databases and additional ephemeral loopback ports. Build before running browser tests; keep port 3100 free. Use `pnpm test:e2e --grep 'keyboard|320px'` for focused keyboard and reflow checks.

Verification coverage for Phase 2:

- Vitest/Testing Library checks for domain validation, Copenhagen daylight-saving transitions, date-only events, editor validation and save failures.
- SQLite integration checks for migrations, restart durability, idempotency, stale revisions, preservation of all edited fields, reset isolation (including a live-data sentinel), pagination, failures, retries/timeouts, leases, interrupted jobs, and scheduling.
- Real worker-process and full application restart checks; approvals, edits, and dismissals must survive. No browser is required for worker processing.
- Playwright checks across desktop Chromium and Chromium with mobile emulation: primary journeys, keyboard-only operation, focus return, persistent reload/reset, scenarios, source inspection, same-origin mutation safeguards, no external requests/browser-storage writes, 320px reflow, and 200% CSS zoom.
- Axe WCAG 2.1 AA checks on all four views and both dialogs. Automated checks are not a full accessibility certification; physical-device, WebKit/Firefox, and screen-reader testing are not yet performed.
- Lint, TypeScript, and a production build.

Later phases add:

- Connector and AI tests in later phases for pagination, incomplete responses, expired sessions, Danish dates, daylight-saving changes, unsupported claims, and prompt-injection content.

See the [acceptance criteria](./plan.md#acceptance-and-verification) for the exact requirements. Passing one phase's checks does not establish that later phases work.

## Out of scope for the initial phases

Google/Apple calendar connections, exports, subscriptions, and external writes; notifications, email, and push delivery; weekly-plan providers; attachments and OCR; chores and task assignment; shopping and meal planning; multi-household support; general conversational agents; and a public multi-user service.

External calendar integration is a potential later phase requiring a separate provider and scope decision. Current hosting is Mac-local; any later remote/production deployment and the AI provider remain undecided.
