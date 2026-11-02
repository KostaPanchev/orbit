# Orbit: phased implementation plan

## Goal and current state

Reduce the mental load of following school and kindergarten information: explain what matters today, show upcoming events and deadlines, and turn relevant information into reviewable event suggestions.

Phases 1 and 2 are implemented as a Next.js App Router/TypeScript frontend with Tailwind CSS, fictional fixtures, and local SQLite persistence. Their demo mode remains available, including durable approval/edit/dismiss workflows. Phase 3 adds a separate real Aula mode: original source previews, structured calendar events, dynamic audiences, guarded session handling, and local persistence/retention. No AI provider, remote hosting, or external calendar is enabled.

The user authorized Phase 3 safeguards, completed guarded login, approved local account validation, and requested a preview with real data before Phase 4. The live worker imported authorized data and the loopback dashboard served it without AI. Automatic credential renewal was observed. This is a working preview, not complete Phase 3 acceptance: the newest source edits still require final verification and deliberate source exclusions remain.

**Current handoff (2 November 2026):** the user stopped all Orbit tasks/servers and intends to request changes before Phase 4. Data and credentials were preserved. Do not restart services, fetch live content, or advance phases just to resume context. See [the handoff and validation boundary](#phase-3-handoff-and-remaining-checks). Phases 4-5 remain unstarted and require separate authorization.

Build a dashboard first, not a chatbot or general-purpose autonomous agent. Use a controlled ingestion and summarization workflow so the interface remains useful even when Aula or AI is unavailable.

## Delivery and phase boundaries

The requested project document is `plan.md` at the repository root. Saving the document does not authorize application implementation. Each phase must be started separately at the user's request; demonstrate the outcome and stop for feedback before continuing.

| Phase | Deliverable | Dependencies |
| --- | --- | --- |
| 1 | Interactive UI/UX prototype with dummy data | Next.js frontend only |
| 2 | Persistent local organizer | Approved UX, local database, synthetic data |
| 3 | Read-only Aula integration | Approved data safeguards and validated account access |
| 4 | Source-grounded AI summaries and suggestions | Explicit AI processing/provider decision |
| 5 | Private deployment and operational readiness | Hosting and access-control decisions |

Phase 1 must not require a database, backend integration, background worker, Aula account, or AI provider. Google/Apple calendar integration remains a future, separately scoped phase.

## Confirmed decisions

- One household only. No multi-tenant SaaS, invitations, or multiple-account merging in the first version.
- Next.js frontend with a custom, minimal Material-inspired design, rather than the Material UI component library.
- English interface and English summaries; preserve original Danish source excerpts for verification.
- Start with a UI-only prototype using dummy data. Add persistence, Aula access, AI, and deployment in separate phases.
- Initial coverage: core Aula messages, posts, and calendar events.
- Weekly-plan providers and document/image attachments are deferred. Clearly disclose unprocessed sources.
- Main features: daily school/kindergarten brief, upcoming events and deadlines, and event suggestions requiring approval.
- In Phase 1, approval changes only the in-memory demo agenda. From Phase 2, approval saves an item persistently inside Orbit. Google Calendar, Apple Calendar, calendar export/subscription, and external calendar writes are deferred.
- Phase 1 simulates refresh. From Phase 2, refresh every 30 minutes while the local worker is running, with a manual refresh option. Update the daily brief when relevant information changes once AI is enabled.
- Show the next 30 days by default.
- Demo and live modes use separate databases and launch commands. The Phase 3 preview shows original sources/events, not synthetic summaries. Until unread behavior is separately verified, unread/unclassified message bodies are not fetched; title-only previews and incomplete coverage are explicit.
- Current hosting choice: run Orbit on the user's existing Mac, with the application, SQLite database, and worker on that machine. This avoids a hosting subscription; always-on availability is not required.
- From Phase 2, refresh runs only while Orbit's local process and worker are running and the Mac is awake. Stopping the local process stops refresh; sleep suspends refresh. Closing a browser tab/window alone does not stop the local process or worker.
- This local-hosting choice supersedes the earlier fully undecided hosting status. Remote access and any later production deployment remain unapproved; keep loopback-only access for now. The AI provider and processing location remain undecided. No cloud service or later phase is authorized by this decision.

## Recommended product experience

### Today

The landing page answers three questions without requiring the user to open every message:

1. What changed or matters today?
2. What is coming up?
3. What needs my review?

Use a concise daily brief, an upcoming agenda, and a review queue. Show child/institution labels and allow filtering, without turning the homepage into a dense control panel. Keep source details behind an accessible drawer or detail page.

Each summary point and event suggestion includes its source reference, source timestamp, and the original excerpt where available. English summaries must preserve names, dates, places, and the meaning of the Danish original.

### Review and internal agenda

- Suggestions contain title, relevant child or household audience, date/time when supported, location when supplied, source evidence, and any uncertainty.
- Support approve, edit-and-approve, and dismiss.
- Label Phase 1 approvals "Added to demo agenda" and explain that demo changes reset on page reload. From Phase 2, use "Saved to Orbit." Always display that no external calendar is connected.
- Separate structured Aula calendar events from AI-extracted suggestions. Structured events do not need an LLM to determine their dates.
- Link an approved suggestion to its internal agenda entry so it does not appear twice.
- Do not invent missing times or durations. Keep genuinely date-only events date-only; unresolved dates remain in review rather than being scheduled.
- In Phase 1, preserve decisions during in-app navigation but reset on full reload or explicit demo reset. From Phase 2, preserve decisions across refreshes and restarts.
- If an approved item's source changes, surface a proposed revision. Do not silently overwrite the approved entry or discard user edits.

### Trust and incomplete coverage

Display last successful refresh, brief generation time, and source coverage separately. Provide explicit states for demo mode, disconnected, refreshing, partial results, stale data, reconnect required, and AI unavailable. In Phase 1 these are labeled, selectable demo scenarios, not claims about real services.

"No new information" is valid only after the relevant sources were successfully checked. An inaccessible sensitive message or an unprocessed attachment must not become an all-clear result. Orbit supplements Aula; the first release cannot promise to capture information in excluded sources.

### Design and accessibility

- Quiet neutral surfaces, a restrained accent, strong typography, generous spacing, subtle elevation, and low visual noise.
- Mobile-first responsive web UI; desktop layout can use a compact navigation rail and wider agenda.
- Build with Tailwind CSS and native semantic elements; add headless accessible primitives only where necessary for dialogs, menus, or drawers.
- No chatbot, large calendar grid, animation-heavy presentation, or PWA/offline caching of family data in the first release.
- Apply WCAG 2.1 AA: keyboard access, visible focus, meaningful headings and labels, contrast, non-color status cues, reduced motion, live status announcements, and 200% zoom/reflow. Prefer 44px interaction targets.

## Aula integration research and recommendation

These are community integrations, not a verified official integration contract. Initial research inspected documentation and selected implementation files without account access. Phase 3 has since pinned/patched the preferred companion, run offline and authorized account checks, and imported real data for the local preview. Popularity and advertised tests are not proof of reliability or safety; neither do the observed results establish complete Phase 3 acceptance. Detailed evidence and remaining checks are recorded below.

| Candidate | Relevant evidence | Recommendation |
| --- | --- | --- |
| [Casperjuel/aula-mcp](https://github.com/Casperjuel/aula-mcp) | TypeScript/Bun project with MitID authentication, HTTP and stdio MCP transports, and tools for profiles, posts, messages, calendar, and provider-specific data. Its own documentation describes it as experimental. | Preferred first feasibility spike. Best fit among the reviewed options for this TypeScript application, subject to account-specific validation. |
| [scaarup/aula](https://github.com/scaarup/aula) | Home Assistant integration with school calendars, messages, booked meetings, and several weekly-plan providers. It documents unofficial endpoints and authentication constraints. | Consider if Home Assistant is already part of the household setup. Do not add Home Assistant solely for Orbit. |
| [miklen/aula_mcp](https://github.com/miklen/aula_mcp) | Python stdio MCP server with a normalized overview, browser-assisted authentication, and attachment resources. | Alternative if the preferred connector fails the required coverage or authentication checks. Not proven superior. |
| [nickknissen/aula](https://github.com/nickknissen/aula) | Unofficial async Python library and CLI exposing core Aula and widget functionality. | Alternative for a custom connector without MCP, at the cost of adding a Python boundary. |

### How to use the preferred connector

Run a pinned, reviewed upstream revision as a local companion process, accessed by the worker through MCP stdio. Keep its Bun runtime separate from the Next.js Node runtime. Do not copy its authentication implementation into Orbit.

Its internal `@aula-mcp/aula-client` package is marked private and uses workspace dependencies; do not assume it is a supported package that can simply be installed from npm. Using the MCP interface avoids depending on those private package internals.

The application, not the LLM, calls an explicit allowlist of required read tools. Leave `AULA_MCP_WRITE` and `AULA_MCP_RAW` disabled and enforce the allowlist in Orbit too. Do not enable presence changes, message read-marker changes, arbitrary API requests, or attachment downloads.

The feasibility spike must verify:

- Guardian MitID login using the connector's documented flow; the user completes authentication directly, without supplying credentials or tokens in chat.
- Profile selection and which school/kindergarten sources are actually available.
- Complete pagination for posts, thread lists, and individual threads. The inspected client notes that Aula returns thread pages of 20 and ignores larger requested page sizes.
- Read-marker behavior, sensitive-message/step-up handling, token refresh, expiry, logout, and reconnect behavior.
- Structured calendar coverage, stable IDs, update/cancellation semantics, source references, and available deep links.
- That failures and truncated results can be identified rather than interpreted as empty successful responses.
- Applicable Aula/MitID terms and permitted use. Official authorization or supported unattended access has not been established by this research.

If the connector is unsuitable, evaluate one alternative against these same checks before changing architecture. Do not silently replace it with browser scraping or bypass access controls.

## Architecture and phase boundaries

Add architecture only when its phase needs it. Avoid microservices, Redis, vector databases, agent orchestration frameworks, and a generic plugin system.

### Phase 1: frontend only

Use Next.js App Router, TypeScript, pnpm, and Tailwind CSS. Components consume typed fictional fixtures through a small shared in-memory state store. Use a fixed, visibly labeled demo date so examples and the 30-day agenda remain deterministic. No localStorage persistence is needed.

Only the normal Next.js development server is required. Do not add a database, ORM, data API routes, domain backend, worker, authentication, connector, AI SDK, or external data requests.

### Phase 2 onward: persistent application

The following architecture is introduced incrementally after the UI is evaluated:

```text
Browser
  -> Next.js App Router: UI + server-side reads and mutations
       -> SQLite

Local worker
  -> synthetic source OR allowlisted Aula MCP companion
  -> validation, normalization, change detection
  -> mode-specific SQLite (demo OR live)
  -> demo: synthetic summaries and review workflows
  -> live Phase 3: source previews and structured events, no AI
  -> future Phase 4: separately authorized grounded summaries/suggestions
```

### Technical choices

- Next.js App Router, TypeScript, and pnpm.
- Tailwind CSS and a small custom component set.
- Server-side application services and schema validation with Zod; keep connectors and secrets out of client bundles.
- SQLite with Drizzle migrations for the single-household local application. This is not a commitment to a serverless deployment or shared network database. Revisit storage if the deployment model later requires it.
- One Node worker entry point using the same domain services and database. Do not schedule work inside page renders, browser tabs, or request handlers.
- Typed source/summarizer boundaries were introduced in Phase 2; the Aula adapter is now wired for Phase 3. Live extraction returns no briefs/candidates. Add a real AI provider only after Phase 4 authorization.
- From Phase 2, synthetic data enters through the same normalization, persistence, review, and presentation paths used by live data. Phase 1 imports fixtures directly.

### Current code layout

- `src/app/`: Today, Upcoming, Review, and connection/status settings routes.
- `src/components/`: mode-aware shell/views, dynamic child filters, source dialogs, and accessibility primitives. `demo-views.tsx` currently contains both demo and live branches despite its historical filename.
- `src/demo/`: fictional fixtures consumed only by the synthetic server adapter and fixture-history bootstrap. Phase 1's in-memory store has been replaced.
- `src/domain/`: mode-aware DTOs, source/event schemas, review states, live date/window helpers, and presentation selectors.
- `src/server/db/`: database schema, migrations, and repositories.
- `src/server/sources/`: shared adapter/error contracts and the synthetic adapter/deterministic summarizer.
- `src/server/aula/`: protected session handling, allowlisted MCP reader, count/status validation, live normalization, and paginated source adapter.
- `src/server/briefs/`: remains a future Phase 4 proposal, not an implemented service.
- `src/server/services/`: shared imports/snapshots/review, protected live sync/disconnect, and retention/deletion.
- `src/server/local-access.ts`: local page/API access and mutation safeguards.
- `src/worker/`: scheduled/manual jobs, live/demo launcher, companion preparation, guarded login, and validation commands.
- `patches/`: exact pinned companion changes plus its license.
- `tests/`: fictional demo/live fixtures, database/process tests, and browser checks. Real family content is not a test artifact.
- `README.md`: demo/live launch instructions, privacy controls, and verification limitations.

Create only files needed by the requested phase. The domain backend, database, source adapters, and worker begin in Phase 2; AI services begin in Phase 4. Do not scaffold empty later-phase layers in Phase 1.

### Minimal persisted concepts, from Phase 2

- Source items: source kind, stable upstream ID, account scope, audience, timestamps, version/content hash, normalized content, and source references.
- Sync runs: per-source outcomes, pagination/coverage, last successful completion, and typed error states.
- Event candidates: structured fields, evidence references, uncertainty reasons, and source revision.
- Review decisions and internal agenda entries: approved/dismissed state, user edits, and links to the candidate revision.
- Daily briefs: source coverage, as-of time, provenance, and prompt/model version when AI is enabled.

Use stable IDs and uniqueness constraints for idempotent imports. Do not merge unrelated events solely because their titles match. Link duplicates across posts/messages/calendar only with sufficient evidence; otherwise flag them for review.

## Sync and AI behavior

### Reliable synchronization

- Process all required pages within the configured coverage window and expose incomplete coverage.
- Use conservative polling, timeouts, bounded retries/backoff, and a single-run lease to avoid concurrent duplicate work.
- Manual refresh requests the same workflow rather than bypassing it.
- Record progress only for successfully processed data. Recover after restart without duplicating suggestions or losing review decisions.
- Recheck changed source versions and use bounded overlap where upstream cursors are unavailable.
- Preserve the last successful data on upstream failure, clearly marked stale.
- Absence from a partial response is not a deletion. Treat cancellations or removals as authoritative only when supported by explicit source evidence or a complete relevant snapshot.
- Handle Aula dates with the source timezone, normally Europe/Copenhagen; test daylight-saving transitions and distinguish all-day dates from timestamps.

### Controlled AI processing

For the prototype, use deterministic synthetic summaries and extraction outputs, visibly labeled as demo content. Do not imply that a real model produced them.

For the future AI-enabled live stage (steps 3-6 require Phase 4):

1. Fetch and normalize only authorized, in-scope source content.
2. Import structured calendar facts without LLM interpretation.
3. Ask the configured model for schema-constrained event candidates and brief items with source IDs and supporting excerpts.
4. Validate fields, dates, references, and whether evidence exists in the source.
5. Route ambiguous, contradictory, or unsupported output to review or an explicit processing failure.
6. Publish only validated outputs; preserve access to source material and coverage information.

Source messages are untrusted content, not instructions. The model must have no Aula write tools, secrets, arbitrary browsing, or direct database mutation capability. Schema validation checks structure, not truth; source-grounded evaluation and user review remain necessary.

Reuse unchanged extraction results; do not call the model on every page view. If the model fails, continue displaying validated structured events and the last brief with its original timestamp, plus an explicit error. Never fabricate a replacement summary.

## Privacy and activation gates

Demo mode uses fictional content; the authorized Phase 3 preview stores real sources in its separate protected database. Bind both modes to loopback. The app has no separate household-user authentication: never treat host/origin checks as permission for LAN or remote deployment.

Phase 3's original activation requirements (decisions and implementation evidence are recorded in its status below):

- Reconfirm the selected Mac-local, loopback-only arrangement for the app, database, and worker before live ingestion; separately approve any remote access or change of host.
- Authentication/access control for remote use, including authorization on every server-side read and mutation, secure sessions, transport security, and mutation protections.
- A minimum necessary data-retention policy for originals, excerpts, summaries, decisions, logs, and backups; explicit disconnect and deletion behavior.
- Host/storage encryption, protected connector tokens, secrets management, and backup/restore procedures. SQLite alone does not encrypt stored content.

Before Phase 4, separately confirm AI processing location/provider, data handling, retention, and any acceptable external transfers. A local MCP process does not prevent its client from transmitting school content to a cloud model. Live AI remains disabled until this decision; it need not block read-only access in Phase 3.

Keep tokens in the connector's protected store, not Orbit's client or logs. Avoid third-party analytics, content-bearing error telemetry, and logging message bodies or names. Excluded attachments and sensitive content requiring additional access remain visibly unprocessed; do not automatically escalate authentication.

For the selected Mac-local arrangement, interrupted refresh is explicitly acceptable: there is no refresh while the local process is stopped or the Mac sleeps. Browser-tab closure does not control the worker. Continuous unattended refresh would require an awake, running host and a separately approved operational arrangement; it is not a current requirement.

## Phased implementation todos

### Phase 1: UI and UX prototype with dummy data

**Outcome:** an interactive interface for evaluating the design and primary user journeys, without integrations.

1. **Establishing the UI foundation** (`prototype-foundation`): scaffold Next.js/TypeScript, Tailwind, frontend checks, design tokens, and the accessible responsive shell.
2. **Building the interactive demo** (`prototype-ui`): add fixtures and shared in-memory state; implement Today, Upcoming, Review, source details, child filters, and demo settings. Depends on `prototype-foundation`.
3. **Validating and refining the UX** (`prototype-validation`): test primary interactions, responsive layout, keyboard access, zoom, and scenario states; document startup/reset behavior. Depends on `prototype-ui`.

**Implementation status (2 November 2026):** all three Phase 1 todos are implemented and verified. Startup, reset behavior, fixture walkthrough, and validation commands are documented in [README.md](./README.md#getting-started).

- Foundation: Next.js App Router, TypeScript, pnpm, custom Tailwind-styled components, local system fonts, semantic responsive shell, and frontend checks. Tailwind uses its standard PostCSS adapter; the generated Turbopack-specific adapter served stale CSS during rebuild validation and was replaced.
- Demo: fictional Emma/Alex household, fixed 2 November 2026 clock, 30-day window ending 1 December, school/kindergarten filters, Danish source evidence, date-only events, unresolved-date confirmation, linked approval/revision flows, dismissals, and explicit reset. A revised lantern walk preserves the seeded user-edited title and replaces one agenda entry only after approval.
- Scenarios: normal, busy, empty, loading, partial, stale, error, disconnected, reconnect required, and AI unavailable. Loading is deliberately paused for inspection. Scenario changes preserve in-memory decisions; empty hides fixture content. Simulated refresh preserves fixed fictional timestamps and the selected scenario and does not contact any service.
- Verified: lint, type-check, production build, 17 unit/component tests, and 20 browser checks across desktop and mobile-emulated Chromium. Browser checks cover keyboard-only actions, focus return, navigation/reload/reset, filtering, source inspection, scenario states, absence of external requests/storage writes, 320px reflow, and 200% CSS zoom. Axe checks cover all views and dialogs; visual browser inspection supplements automation.
- Remaining: user evaluation of the UX. No implementation blockers remain. Physical-device, other browser engines, and screen-reader checks are not claimed; automated accessibility checks do not establish full WCAG certification.
- Next step: demonstrate and collect UX feedback. Do not start Phase 2 without a separate request.

Use a fictional household with school and kindergarten information: a normal day, a busy day, an upcoming trip, a deadline, an ambiguous event time, a changed event, and an item with an unprocessed attachment. Include prewritten English summaries and fictional Danish source excerpts. No AI generates this content.

Make approve, edit-and-approve, dismiss, source inspection, navigation, and child filtering work in memory. Add a demo reset control and scenario selector for empty/loading/partial/stale/error states. A simulated refresh must not claim to contact Aula.

**Excluded:** database, localStorage persistence, backend domain services, workers, scheduled sync, authentication, Aula/MitID, AI calls, external calendars, and deployment.

**Exit criteria:** all primary journeys can be tested on desktop and mobile; changes survive in-app navigation but reset on full reload; simulated states are clearly labeled; source details are inspectable; keyboard and zoom checks pass; no credentials or external data services are required. Stop for UX feedback.

### Phase 2: persistent local organizer, still using dummy data

**Outcome:** the agreed UI becomes a functioning local organizer whose decisions and agenda survive restarts.

Todo: **Implementing persistent local workflows** (`prototype-data`), after `prototype-validation` and a separate request to start Phase 2.

- Add Zod domain schemas, SQLite/Drizzle migrations, server-side reads and mutations, and database-backed approval/edit/dismiss workflows.
- Replace in-memory state with application services while preserving the UI and source references.
- Add the synthetic source adapter, deterministic synthetic summarizer, idempotent imports, change detection, worker, and manual/scheduled refresh.
- Keep synthetic and future live datasets separate; reset only the selected synthetic dataset.
- Add database integration tests and setup documentation.

**Exit criteria:** decisions survive reloads/restarts; repeated imports do not duplicate items; changed source versions request re-review without destroying user edits; simulated failures preserve last-successful data with clear status. No Aula account, AI provider, or cloud deployment is required.

**Implementation status (2 November 2026):** `prototype-data` is implemented and verified.

- Added Zod contracts, committed Drizzle migrations, and SQLite storage with dataset-scoped source identities, content revisions, candidates, decision history, agenda entries, briefs, sync runs, durable jobs, and a worker lease.
- The frontend reads persisted snapshots and uses validated, same-origin server mutations. Approval/dismissal is transactional; stale candidate versions and pre-reset forms are rejected. Revisions preserve all user-edited fields by default and replace, rather than duplicate, linked agenda entries.
- Synthetic data follows the adapter, normalization, evidence validation, persistence, review, and presentation workflow. Unchanged extraction is reused. Structured dates are imported independently of summary availability.
- Manual/scenario requests and 30-minute scheduling use one worker queue. The local launcher starts the worker before Next.js and stops both together. Leases, bounded page retries/timeouts, pagination, crash recovery, offline status, and per-source coverage are implemented.
- Reset is restricted to the selected synthetic dataset and rotates its review generation. Empty synthetic responses preserve existing information; they do not imply deletion. Live ingestion was excluded from Phase 2 and is now separately implemented under Phase 3.
- Database/process integration tests and browser checks verify durability, idempotency, re-review, failure retention, reset isolation, migration/recovery, accessibility, and loopback operation. Setup, lifecycle, limitations, and the hands-on walkthrough are in [README.md](./README.md#getting-started).

**Phase 2 behavior changes from the UI prototype:** reload now preserves decisions; approval says "Saved to Orbit"; scenario selection queues real synthetic ingestion instead of switching presentation only; loading completes; empty responses retain saved data; actual processing timestamps replace simulated refresh timestamps. The fixed fictional agenda date remains visible.

**Remaining work/blockers:** no implementation blocker within Phase 2. User feedback and hands-on Mac sleep/resume observation remain useful; automated tests cover elapsed-time lease renewal, not physical sleep. The separate Phase 3 request and policy decisions are recorded below.

**Next step:** preserve the synthetic organizer while refining the separately authorized Phase 3 live preview.

### Phase 3: read-only Aula integration

**Outcome:** show authorized messages, posts, and structured Aula calendar events in the existing UI.

1. **Confirming live-data safeguards and access** (`live-data-gate`): approved policies, preflight, guarded user login, and local protection implemented. Depends on `prototype-data`.
2. **Validating the Aula connector** (`aula-feasibility`): pinned patch, offline checks, authorized account sample, 30-day calendar normalization, and observed credential renewal; comprehensive acceptance still pending. Depends on `live-data-gate`.
3. **Implementing and testing live synchronization** (`live-sync`): adapter, shared worker imports, retention/deletion, and mode-aware UI implemented and used for the authorized preview. Latest edits and final acceptance remain pending. Depends on `aula-feasibility`; conservative unread/sensitive exclusions remain in force.

Do not present synthetic summaries as summaries of live sources. Until Phase 4, show source previews and structured events, and label AI summaries/suggestions as not enabled.

**Exit criteria:** authorized read-only access, pagination, and reconnect paths work; imports are idempotent; unavailable sources are disclosed; no messages are marked read and no Aula writes occur. Stop if the connector or access conditions are unsuitable.

**Approved safeguards (2 November 2026):**

- Keep the app, worker, database, and connector on the existing Mac with loopback-only access; no remote access.
- Require FileVault-protected storage and exclude Orbit data and connector tokens from backups. Local FileVault/startup-volume checks passed and the approved Time Machine exclusion was applied to `.orbit`; other backup/sync exclusion remains user-confirmed rather than automatically verified.
- Apply a 90-day limit to live source data and related agenda/review records. Expired records are hidden immediately; physical cleanup runs while the worker is active or on restart, not while Orbit/Mac is stopped. Unchanged reimports must not renew retention.
- Disconnect stops synchronization and removes connector tokens. Retain local records until expiry or explicit deletion, with disconnected/stale status; do not silently delete them on disconnect.
- The user authorized inspection and direct user-driven login after safeguards pass and confirmed account-access authorization. Credentials, tokens, and family content must not enter chat or diagnostic artifacts.
- AI processing, excluded attachments/providers, Aula writes, read-marker changes, and remote deployment remain disabled. Account authorization does not by itself establish that unofficial automation is permitted by Aula/MitID terms.

**Connector baseline: pinned, patched, and used by the live preview; full acceptance pending.** Source inspection pinned [Casperjuel/aula-mcp `d9a27d84933446783c89446ba3e9d799fd47ea2c`](https://github.com/Casperjuel/aula-mcp/tree/d9a27d84933446783c89446ba3e9d799fd47ea2c) (release 1.6.2). The local companion is now accessed by the worker through allowlisted stdio MCP. The following historical findings describe the unpatched pin and explain the maintained local patch:

- [Client response handling](https://github.com/Casperjuel/aula-mcp/blob/d9a27d84933446783c89446ba3e9d799fd47ea2c/packages/aula-client/src/aula-client.ts#L242): calendar responses with missing data become `[]`; thread lists with missing `threads` or continuation fields become empty/complete results. Missing individual-thread data/messages also become empty arrays.
- [Individual-thread tool](https://github.com/Casperjuel/aula-mcp/blob/d9a27d84933446783c89446ba3e9d799fd47ea2c/packages/mcp-server/src/tools.ts#L959): accepts a page argument but returns only subject/messages, losing any upstream completion metadata. Its description claiming every message is not proof of complete coverage.
- [Posts tool](https://github.com/Casperjuel/aula-mcp/blob/d9a27d84933446783c89446ba3e9d799fd47ea2c/packages/mcp-server/src/tools.ts#L671): missing posts become an empty array and the continuation flag is optional. Orbit cannot recover information discarded by the companion by validating the resulting MCP payload alone.
- The inspected code separates the write-gated read-marker operation from thread fetching, and supports stdio plus encrypted token storage. These are positive source-level findings, not proof of account-specific read-only behavior, token expiry/reconnect, or permitted unattended use.
- As required by the fallback checklist, inspected [miklen/aula_mcp `1e84ee5781dc77057c14790b2bc45df0c859a25e`](https://github.com/miklen/aula_mcp/tree/1e84ee5781dc77057c14790b2bc45df0c859a25e). Its [posts client](https://github.com/miklen/aula_mcp/blob/1e84ee5781dc77057c14790b2bc45df0c859a25e/aula_mcp/client.py#L612) likewise collapses missing data into an empty list and drops completion metadata. Its [token persistence](https://github.com/miklen/aula_mcp/blob/1e84ee5781dc77057c14790b2bc45df0c859a25e/aula_mcp/state.py#L141) writes JSON without explicit private-file permissions or encryption in that save path. It is not adopted; account validation was not attempted after these source-level gaps were found.

**Approved dependency-strategy adjustment:** the user approved the local pinned-companion patch/tests, then isolated encrypted-file safeguards and a real-data preview. Maintain the response/pagination, plain-text message conversion, and private-session patch locally; do not change the authentication protocol or publish a fork/PR implicitly. The rejected alternative does not change Orbit's architecture.

**Implemented and verified offline:**

- `patches/aula-mcp-read-contract.patch` validates envelopes/collection/completion fields, normalizes `hasMorePosts`, rejects missing/conflicting pagination and inconsistent page echoes, preserves individual-thread continuation, and supplies plain text through the existing HTML-to-text helper. Unknown completeness is an error; a short page alone does not mean success. Authentication is unchanged. The upstream MIT notice is retained.
- `pnpm aula:prepare` checks out the exact pin under ignored `.orbit/aula-mcp` and applies only the recorded patch. `pnpm aula:check` verifies revision and exact tracked diff; both reject unexpected changes rather than overwriting them. A clean-checkout reproduction verified the actual patch, not just a synthetic example.
- `pnpm aula:test` runs the companion type-check, affected-file lint, and fictional client/MCP/private-store tests using locally installed pinned Bun 1.4.4. No real authentication, real credential-store access, live data requests, or imports occur in those tests; package installation may download public dependencies. Login does not install or download a runtime.
- 144 focused companion tests pass, including malformed responses, HTTP 401/403/429/500, explicit empty success, more than 20 threads, native post-pagination compatibility, multi-page posts/thread messages, MCP error/continuation serialization, and private encrypted persistence with mocked login results. Write/raw tool gates are tested disabled; read-marker changes are absent from the tested read request sequences.
- Earlier shared-parser validation also passed all 158 client tests. Preparation/session tests cover exact pin/patch verification, protected permissions, environment/terminal gates, cleanup isolation/failures, concurrency, and child shutdown. Those initial changes were offline-only; later live UI checks and their validation boundary are listed below.

**Pre-login safeguards (implemented 2 November 2026):**

- `pnpm aula:preflight` creates/validates marked `.orbit/aula-auth` storage (`0700` directories, `0600` files), rejects unsafe links/permissions/ACLs, and requires fully enabled FileVault on the startup data volume plus Time Machine exclusion of the data and credential directories.
- Applied the previously approved Time Machine exclusion only to `.orbit`; actual preflight subsequently passed on this Mac. Other backup/cloud-sync systems cannot be verified automatically and remain a user-confirmation gate. Exclusion does not remove historical backups.
- `pnpm aula:login` is available only in the user's own interactive terminal, with explicit permitted-use and other-backup confirmations. It verifies the pinned companion/local Bun, enforces preflight, and runs the unchanged MitID/OAuth protocol with an isolated home/config, private umask, and restricted environment. The user completed login directly; no interactive authentication was initiated through agent tools.
- Reuse the companion's AES-256-GCM file store rather than the shared macOS Keychain entry. Tokens and their local key remain in the protected, backup-excluded session directory. The private-session patch disables saved cookies, identifying login logs, and debug transcripts; failed-login error payloads are not printed. Cookie-based silent reauthentication is intentionally disabled; renewal uses the authorized token flow and reconnect remains user-driven.
- `pnpm aula:disconnect` removes the owned token/key, any leftover cookies/logs/transcripts, and the session directory, while leaving the agenda/database and unrelated Aula installations intact. Cleanup never follows symlinks or crosses mounted volumes; failures are explicit. This is local deletion, not remote revocation or forensic/backup erasure.
- Session operations are serialized. Interrupted login children are stopped and awaited before failure cleanup; failed/cancelled login clears prior/partial credentials in this isolated store. Force-killed operations can leave a lock and intentionally require local process verification before manual lock removal.

**First user-driven login follow-up (2 November 2026):** the reported authentication succeeded, but Orbit rejected the saved session because Bun created its runtime code cache inside the isolated home/credential directory. Reproduced this offline with the actual pinned CLI's help command and a fictional TypeScript process; no real credential files were read and no authentication was repeated. The wrapper now forces `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0` and `DO_NOT_TRACK=1` without weakening the credential allowlist. The new regression failed before the fix and passes afterward, preserving fictional credential files; all 20 session tests, lint, type-check, and production build passed. The user subsequently retried successfully, as recorded below.

**Account-validation follow-up (2 November 2026):** the user subsequently confirmed successful guarded login and explicitly approved local validation that reports counts/status only.

- Added the pinned Node MCP SDK and an application-side five-tool allowlist over stdio, with validated arguments, sanitized responses/errors, suppressed provider stderr, bounded payloads/timeouts, and process shutdown before releasing the protected session lock. No raw/write, presence, discovery, attachment, or provider tools can be dispatched.
- `pnpm aula:validate --confirm-read-only-check` traverses bounded post/thread listings, checks this week's calendar and a three-thread sample, and compares read flags. It stores no source records or diagnostic report files, and prints no names, IDs, message/post content, source hashes, or credential values.
- The first authorized check passed profiles/calendar/thread listings/sampled messages but exposed a posts-contract mismatch. A fixed-field, content-free diagnostic established the actual boolean field as `hasMorePosts`. The patch now normalizes that explicit flag; it still rejects missing, malformed, or conflicting continuation evidence. Temporary diagnostic instrumentation was removed.
- The repeated authorized check returned `sample-checks-passed`, including multi-page posts/thread listings and unchanged read flags in sampled threads. That validation command did not import records; the later separately requested live preview did. Sample success alone is not proof of all-source coverage, unread behavior, or a full revocation/reconnect lifecycle.
- Offline tests cover more-than-20 thread pagination, short-but-nonterminal post pages, missing/conflicting flags, duplicates, bounds, unsafe-tool denial, content/error redaction, read-state changes, and real stdio child shutdown. The account-validation milestone passed 71 Orbit tests plus lint/type-check/build; later verification is recorded below.

**Live preview implementation (2 November 2026):**

- The user requested the actual app with real data before Phase 4. `pnpm dev:live --port 3001` and `pnpm start:live --port 3001` explicitly select `live-aula` in `.orbit/live.sqlite`, separate from `.orbit/orbit.sqlite` demo storage. Both launch the worker and loopback web app; starting live mode can immediately contact Aula.
- `src/server/aula/normalize.ts` validates stable source IDs, offset timestamps, real child/profile metadata, explicit all-day/end fields, and source text. `src/domain/dates.ts` owns Copenhagen date windows/DST handling. Invalid records have explicit partial coverage, not invented fields.
- The live source adapter processes calendar, posts, and messages through the shared job/import workflow. It rejects duplicate or malformed pagination, uses bounded calls, and compares fetched threads' read status. Only already-read, explicitly non-sensitive thread bodies are fetched; unread/unclassified threads receive title-only previews. Sensitive content, attachments/images, and providers remain excluded.
- The shared sync service uses stable account/source keys and content revisions. Structured calendar updates are idempotent; explicit cancellations and absence from complete relevant calendar snapshots can remove entries. Partial/invalid snapshots never justify absence-based deletion. It rejects cross-account/audience mixing and live demo/AI extraction.
- Migration `0002_wakeful_mantis.sql` adds dataset account/household/pause metadata, source first-seen/expiry, and agenda/source links. Retention uses source time capped at 90 days since first persistence; thread records use the earliest retained message time. Reads filter expired sources/agenda; worker startup, pre-sync, and periodic cleanup remove expired related data with secure deletion/WAL truncation. No claim of offline physical deletion or forensic/backup erase is made.
- Local settings provide queued disconnect and live-data deletion. UI disconnect removes local credentials and pauses refresh while preserving imports. Live-data deletion removes live records and pauses refresh while preserving the login and demo. The standalone credential-disconnect command does not change the dataset pause flag.
- Today displays original source previews, Upcoming displays structured Aula events, Review explains that AI is disabled, and Settings discloses coverage/privacy controls. Real audiences replace hard-coded demo children; unattributed sources use the household label. Live mode has no fictional brief or suggestion output.
- Page/API local-host and origin checks, same-origin JSON mutations, private no-store headers, and frame/referrer protections apply. They do not provide remote-user authentication. Live source content stays local and is not captured in browser screenshots or test artifacts.
- A counts-only dry run verified the real 30-day calendar and source mappings and observed the protected token file being renewed. The running live preview then persisted and served real sources. A nullable attachment-metadata mismatch was fixed and tested; the subsequent message warnings reflected deliberate unread/sensitive exclusions, not normalization gaps. No real content, names, IDs, or credentials are recorded in this handoff.

#### Phase 3 handoff and remaining checks

**State at pause:** the live preview was working at `http://127.0.0.1:3001`. At the user's request, all Orbit tasks/servers were stopped and ports 3000/3001/3100 verified closed. Data and credentials were preserved, not revoked; future session validity is not guaranteed. The live implementation still includes modified and untracked files. Preserve them and inspect Git status in the next session. This documentation update does not restart servers, rerun tests, commit changes, or authorize new live reads.

**Verified checkpoints:**

- Last full Orbit suite: **89 tests**. Companion suite: **144 tests**. Full desktop/mobile Playwright suite: **32 tests**. Lint, type-check, and production build passed.
- Subsequent nullable-message metadata work passed **18 focused source/store tests**, lint, and type-check; its build passed. **8 live-view browser checks** then passed with fictional long names, source/settings dialogs, 320px reflow, 200% zoom, and axe checks.
- Actual live runtime checks used counts/status only and showed persisted sources/events with empty AI brief/suggestion output. Automatic credential renewal was observed; full remote-revocation/reconnect and physical sleep/resume behavior were not comprehensively demonstrated.

**Saved after those checks; final verification pending:**

1. `src/domain/model.ts`, `src/server/aula/normalize.ts`, `src/components/source-button.tsx`, and `src/app/globals.css`: per-message source dates/authors and latest-message-only previews rather than presenting concatenated older messages as current. Associated source/UI tests were added but not rerun.
2. `src/server/aula/source.ts` and `src/server/services/organizer.ts`: stricter exact 30-date calendar filtering while retaining overlapping ongoing events. Associated source tests were added but not rerun.
3. `src/server/services/retention.ts`: clearing expired account-binding/refresh metadata when no retained source remains. The corresponding store assertion was added but not rerun.

The existing production build and earlier saved live records predate these final changes. A rebuild and authorized refresh are needed to see the new normalized message shape; do not claim it was already demonstrated in the live browser.

**Next-session order:**

1. Take the user's requested refinements before Phase 4. Keep servers stopped and avoid opening real storage or making account requests unless needed and authorized for that request.
2. When code work resumes, inspect the pending edits and validate them with fictional fixtures: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm aula:test`, `pnpm build`, then focused/full browser checks as appropriate. Do not point tests at the live database or capture the real household page.
3. Complete the Phase 3 acceptance review: latest retention/UI changes, disconnected/reconnect and interrupted-operation behavior, account isolation, source date/cancellation assumptions, and the clearly limited unread/sensitive coverage. Keep unread bodies excluded unless their behavior is separately verified and expansion approved. Use counts/status only for any necessary authorized live verification.
4. Demonstrate the revised preview, stop for feedback, and only then consider a separately requested Phase 4 with explicit provider/location/data-handling decisions. No Phase 4 dependency or AI processing is authorized by this handoff.

**Phase 3 remains in progress, not complete.** The current blocker is final verification/refinement, not a missing initial MitID setup step.

### Phase 4: source-grounded AI briefs and suggestions

**Outcome:** English daily briefs and reviewable event suggestions generated from authorized source material.

1. **Confirming the AI processing arrangement** (`ai-provider-gate`): choose and authorize the provider/location and data handling. Depends on `live-sync`; blocked until these decisions are supplied.
2. **Implementing grounded AI processing** (`live-ai`): add schema-constrained extraction, evidence validation, uncertainty handling, result reuse, and explicit error behavior. Depends on `ai-provider-gate`.
3. **Validating AI and end-to-end live behavior** (`live-validation`): run evaluation fixtures and authorized end-to-end checks without exposing family data in artifacts. Depends on `live-ai`.

**Exit criteria:** outputs resolve to source evidence; evaluation fixtures contain no invented event facts; uncertain dates remain unscheduled; prompt-injection content cannot trigger tools or writes; provider failure is visible. Approvals still save only inside Orbit.

### Phase 5: private deployment and operational readiness

**Outcome:** reliable access outside the development session using a deployment model chosen by the user.

The current choice is Mac-local operation with acceptable downtime. This phase remains deferred; that choice does not authorize an always-on service or remote deployment.

1. **Choosing deployment and access controls** (`deployment-gate`): confirm hosting, local-only versus remote access, access controls, and backup ownership. Depends on `live-validation`; blocked until these decisions are supplied.
2. **Deploying and verifying private operation** (`private-deployment`): configure deployment, enforce access controls, supervise the worker, protect secrets/storage, and test backup/restore, restart recovery, disconnect, retention, and deletion. Depends on `deployment-gate`.

**Exit criteria:** unauthorized requests cannot read or mutate family data; the worker runs independently of a development terminal; recovery and deletion procedures work; stale/disconnected states remain visible. Never expose an unauthenticated prototype to the network.

### Future phase: external calendars and other extensions

After a separate scope decision, select Google Calendar or Apple/iCloud and plan provider-specific authorization, a dedicated target calendar, and idempotent create/update/cancel reconciliation. This is not part of Phases 1-5.

Passing one phase's checks does not prove later phases work. Start a phase only when explicitly requested and its prerequisites and decision gates are satisfied.

## Acceptance and verification

Add validation alongside each phase rather than installing later-phase tooling early. Use Vitest and Testing Library for UI/domain behavior and Playwright with accessibility checks for key browser journeys. Add SQLite-backed integration tests in Phase 2. Run lint, type-check, relevant tests, and a production build; use manual keyboard, zoom, and responsive checks where automation is insufficient.

Phase 1 acceptance:

- The default upcoming view covers 30 days relative to the demo clock and supports child filtering.
- Approve, edit, and dismiss update the UI without duplicate demo agenda entries and survive in-app navigation.
- A page reload or demo reset restores the documented initial fixture state.
- Each brief item and suggestion resolves to synthetic source evidence.
- Demo, empty, loading, stale, partially failed, disconnected, and failed-summary states are visibly distinct and reproducible through the scenario selector.
- No database, worker, external API, LLM, calendar, or real credential is needed.
- Core workflows work by keyboard and at mobile widths and 200% zoom.

Phase 2 adds:

- Refreshing twice does not duplicate sources, suggestions, or agenda entries.
- Approve, edit, and dismiss survive browser refresh and worker/application restart.
- A changed approved event requires review; stale approvals cannot silently apply to a newer candidate version.
- Migration, fixture reset isolation, restart recovery, and simulated failures are tested.

Phases 3 and 4 add, as each capability is introduced:

- Pagination includes a fixture with more than 20 threads and multi-page posts/thread messages.
- Tests cover malformed responses, token expiry, 401/403/429, timeouts, partial results, schema drift, and process interruption.
- Danish source fixtures cover relative dates, missing/ambiguous dates, all-day events, daylight-saving changes, cancellations, duplicates, conflicting messages, and prompt-injection text.
- Every published AI item has valid source evidence; the evaluation fixture set permits no invented dates, times, locations, or unsupported events. Failed cases block release rather than being hidden behind a confidence score.
- The worker cannot invoke Aula write/raw tools or mark messages read.
- No Google/Apple calendar requests are made, even after approving an event.
- No claim of full source coverage is made when attachments, providers, sensitive items, or pages are unprocessed.

## Deliberately deferred

Google/Apple calendar integrations and automatic calendar writes; notifications/email/push delivery; task assignment and chores; shopping/meal planning; weekly-plan providers; document OCR/attachment processing; multi-household support; general conversational agents; and a public multi-user service. Private deployment is Phase 5, not a Phase 1 prerequisite.

The most useful next expansion is calendar integration with a dedicated calendar and explicit create/update/cancel reconciliation. Provider choice should be made before implementation; Google Calendar and Apple/iCloud should not be assumed to have identical integration requirements.

## Supporting references

- [Preferred connector README](https://github.com/Casperjuel/aula-mcp#readme)
- [Connector tool registrations and write gates](https://github.com/Casperjuel/aula-mcp/blob/main/packages/mcp-server/src/tools.ts)
- [Connector stdio transport](https://github.com/Casperjuel/aula-mcp/blob/main/packages/mcp-server/src/server-stdio.ts)
- [Client implementation and pagination behavior](https://github.com/Casperjuel/aula-mcp/blob/main/packages/aula-client/src/aula-client.ts)
- [Private client package manifest](https://github.com/Casperjuel/aula-mcp/blob/main/packages/aula-client/package.json)
- [Connector security policy](https://github.com/Casperjuel/aula-mcp/blob/main/SECURITY.md)

These links describe moving upstream branches. Pin and recheck the selected revision during the live feasibility stage rather than assuming documentation guarantees current behavior.
