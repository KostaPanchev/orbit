# Orbit: phased implementation plan

## Goal and current state

Reduce the mental load of following school and kindergarten information: explain what matters today, show upcoming events and deadlines, and turn relevant information into reviewable event suggestions.

Phase 1 is implemented as a Next.js App Router/TypeScript frontend with Tailwind CSS, fictional fixtures, and shared in-memory state. Today, Upcoming, Review, source drawers, child filters, and demo settings are interactive. No family data, Aula account, AI provider, database, or external calendar has been accessed or enabled.

The UI prototype and its automated acceptance checks are complete; the next step is user UX feedback. Phases 2-5 remain unstarted and require separate authorization.

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
- Current hosting choice: run Orbit on the user's existing Mac, with the application, future SQLite database, and future worker on that machine. This avoids a hosting subscription; always-on availability is not required.
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

These are community integrations, not a verified official integration contract. Repository documentation and selected implementation files were inspected; none was installed or tested against the user's account. Popularity and advertised tests are not proof of reliability or safety.

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

## Proposed architecture

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
  -> SQLite
  -> structured event extraction and daily brief generation
       -> synthetic summarizer OR explicitly configured AI provider
```

### Technical choices

- Next.js App Router, TypeScript, and pnpm.
- Tailwind CSS and a small custom component set.
- Server-side application services and schema validation with Zod; keep connectors and secrets out of client bundles.
- SQLite with Drizzle migrations for the single-household local application. This is not a commitment to a serverless deployment or shared network database. Revisit storage if the deployment model later requires it.
- One Node worker entry point using the same domain services and database. Do not schedule work inside page renders, browser tabs, or request handlers.
- Introduce typed source and summarizer boundaries in Phase 2. Add the Aula adapter in Phase 3 and the AI provider in Phase 4.
- From Phase 2, synthetic data enters through the same normalization, persistence, review, and presentation paths used by live data. Phase 1 imports fixtures directly.

### Proposed code layout

- `src/app/`: Today, Upcoming, Review, and connection/status settings routes.
- `src/components/`: reusable presentation components and accessibility primitives.
- `src/demo/`: typed fictional fixtures, shared in-memory state, and scenario selection in Phase 1.
- `src/domain/`: source records, events, review states, brief schemas, and validation rules.
- `src/server/db/`: database schema, migrations, and repositories.
- `src/server/sources/`: synthetic adapter and later the Aula MCP adapter.
- `src/server/briefs/`: extraction, summarization, provenance validation, and provider boundary.
- `src/server/services/`: sync, agenda, and review workflows.
- `src/worker/`: scheduled/manual job processing and lifecycle.
- `tests/`: synthetic fixtures, unit/integration tests, and browser tests.
- `README.md`: local setup, demo limitations, validation commands, and later live-operation instructions.

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

For the live stage:

1. Fetch and normalize only authorized, in-scope source content.
2. Import structured calendar facts without LLM interpretation.
3. Ask the configured model for schema-constrained event candidates and brief items with source IDs and supporting excerpts.
4. Validate fields, dates, references, and whether evidence exists in the source.
5. Route ambiguous, contradictory, or unsupported output to review or an explicit processing failure.
6. Publish only validated outputs; preserve access to source material and coverage information.

Source messages are untrusted content, not instructions. The model must have no Aula write tools, secrets, arbitrary browsing, or direct database mutation capability. Schema validation checks structure, not truth; source-grounded evaluation and user review remain necessary.

Reuse unchanged extraction results; do not call the model on every page view. If the model fails, continue displaying validated structured events and the last brief with its original timestamp, plus an explicit error. Never fabricate a replacement summary.

## Privacy and activation gates

The prototype uses fictional families and school content only. Bind local services to loopback. Do not make the prototype remotely accessible or treat an unprotected LAN deployment as safe.

Before live persistent ingestion in Phase 3, confirm:

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

### Phase 3: read-only Aula integration

**Outcome:** show authorized messages, posts, and structured Aula calendar events in the existing UI.

1. **Confirming live-data safeguards and access** (`live-data-gate`): resolve storage, retention, access, credential handling, and authorization for user-driven login. Depends on `prototype-data`; blocked until these decisions are supplied.
2. **Validating the Aula connector** (`aula-feasibility`): pin the connector and complete the feasibility checklist above. Depends on `live-data-gate`.
3. **Implementing and testing live synchronization** (`live-sync`): wire the allowlisted adapter into the worker with pagination, reconciliation, recovery, and coverage indicators. Depends on `aula-feasibility`.

Do not present synthetic summaries as summaries of live sources. Until Phase 4, show source previews and structured events, and label AI summaries/suggestions as not enabled.

**Exit criteria:** authorized read-only access, pagination, and reconnect paths work; imports are idempotent; unavailable sources are disclosed; no messages are marked read and no Aula writes occur. Stop if the connector or access conditions are unsuitable.

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
