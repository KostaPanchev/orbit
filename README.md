# Orbit

A single-household dashboard for school and kindergarten information: what matters today, what is coming up, and what needs your review.

Orbit is planned to bring relevant Aula messages, posts, and calendar events into a focused daily overview, reducing the need to read every source individually. It is a dashboard first, not a chatbot or an autonomous agent.

> **Status: Phase 1 prototype implemented.** Today, Upcoming, Review, source details, child filters, and demo settings work with fictional data and in-memory decisions. No live integrations or persistence exist. The remaining phases below are planned, not enabled.

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

### Current milestone: the UI-only demo

The prototype uses Emma at Lindely School and Alex at Birch Kindergarten, both fictional, with prewritten English summaries and Danish source excerpts. The fixed demo date is **2 November 2026**; the upcoming window includes **2 November through 1 December**, in Copenhagen time.

- Approve, edit-and-approve, dismiss, source inspection, navigation, and child filtering work in memory.
- Decisions survive in-app navigation but reset on a full page reload or **Reset demo**. Changing scenarios does not reset decisions.
- Approvals say **"Added to demo agenda"**; persistent approvals from Phase 2 will say **"Saved to Orbit."**
- The scenario selector offers normal, busy, empty, loading, partial, stale, refresh error, disconnected, reconnect-required, and AI-unavailable states.
- **Simulate refresh** runs a short local UI timer, preserves decisions and fixed fictional timestamps, and never contacts Aula or AI. It does not repair the selected error scenario.
- Loading is intentionally paused for inspection; choose another scenario to leave it. Empty hides fixture items without clearing decisions. Failed scenarios show the previous fictional data with explicit warnings.

Phase 1 does not include a database, localStorage persistence, backend domain services, workers, authentication, external data requests, or deployment.

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

Architecture will be added only when needed. From Phase 2, the Next.js application and a separate worker will share SQLite and application services. Synthetic and live datasets will remain separate, while using the same normalization, persistence, and review workflows.

**Selected hosting: the existing Mac.** The app, future SQLite database, and future worker will run locally without a hosting subscription. Keep access on loopback; remote access has not been approved.

From Phase 2, scheduled refresh will run every 30 minutes while Orbit's local process and worker are running and the Mac is awake, with manual refresh using the same workflow. Stopping the local process stops refresh; sleep suspends it. Closing the browser tab/window alone does not stop the worker. This downtime is acceptable; an always-on service is not required. Phase 1 still only simulates refresh.

## Aula integration

Initial live coverage is limited to core Aula messages, posts, and calendar events. Weekly-plan providers, document/image attachments, and content requiring additional access will remain visibly unprocessed.

[Casperjuel/aula-mcp](https://github.com/Casperjuel/aula-mcp) is the preferred feasibility candidate, **not a verified or installed dependency**. It is an experimental community integration, not an established official integration contract.

Before adoption, a pinned revision must be reviewed and validated for authorized login, account-specific coverage, pagination, read-marker behavior, session expiry, reconnect handling, and permitted use. The proposed integration uses a local MCP stdio companion, with its Bun runtime separate from the Next.js Node runtime.

Orbit will allowlist required read tools and leave `AULA_MCP_WRITE` and `AULA_MCP_RAW` disabled. It must not mark messages read, change presence, download excluded attachments, or bypass access controls.

See the [integration research and feasibility checklist](./plan.md#aula-integration-research-and-recommendation) for alternatives and detailed requirements.

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

Open **http://127.0.0.1:3000**. Development and production preview scripts bind to loopback and disable Next.js telemetry. No environment file, credentials, or data services are needed. Dependency installation requires the package registry; the running prototype makes no external service requests.

For a local production preview:

```sh
pnpm build
pnpm start
```

### Try the main journey

1. Inspect a daily brief source and its original Danish excerpt, including the unprocessed attachment warning.
2. Open Review. Approve the consent deadline, edit and approve the trip, and dismiss the unresolved gathering.
3. Approve the lantern walk revision. Upcoming should show one updated entry with the original edited title.
4. Filter by child, navigate between views, and try the demo scenarios. Decisions remain in memory.
5. Reload or choose Reset demo to restore the initial four agenda items and four pending suggestions.

The consent fixture is only a reminder: approving it does not reply in Aula. No external calendar is connected. A user-entered date outside the 30-day window is retained in memory but is not shown in Upcoming; the approval announcement explains this.

Phase 1 is ready for UX feedback. Mac-local hosting and its process-bound refresh lifecycle are confirmed; Phase 2 still requires a separate request. Live-data safeguards, the AI provider/processing location, and remote deployment remain unapproved. See [plan.md](./plan.md) for phase gates and [AGENTS.md](./AGENTS.md) for contributor guidance.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium # first browser test run only
pnpm test:e2e
```

The browser suite starts and stops its own loopback production server on port 3100. Build before running it; keep that port free. Use `pnpm test:e2e --grep 'keyboard|320px'` for focused keyboard and reflow checks.

Verified for Phase 1:

- 17 Vitest/Testing Library checks for state transitions, revisions, dates, filtering, and editor validation.
- 20 Playwright checks across desktop Chromium and Chromium with mobile emulation: primary journeys, keyboard-only operation, focus return, reset/reload, scenarios, source inspection, no external requests/storage writes, 320px reflow, and 200% CSS zoom.
- Axe WCAG 2.1 AA checks on all four views and both dialogs, plus visual browser inspection. Automated checks are not a full accessibility certification; physical-device, WebKit/Firefox, and screen-reader testing are not yet performed.
- Lint, TypeScript, and a production build.

Later phases add:

- SQLite-backed integration tests from Phase 2 for persistence, idempotency, source revisions, and recovery.
- Connector and AI tests in later phases for pagination, incomplete responses, expired sessions, Danish dates, daylight-saving changes, unsupported claims, and prompt-injection content.

See the [acceptance criteria](./plan.md#acceptance-and-verification) for the exact requirements. Passing one phase's checks does not establish that later phases work.

## Out of scope for the initial phases

Google/Apple calendar connections, exports, subscriptions, and external writes; notifications, email, and push delivery; weekly-plan providers; attachments and OCR; chores and task assignment; shopping and meal planning; multi-household support; general conversational agents; and a public multi-user service.

External calendar integration is a potential later phase requiring a separate provider and scope decision. Current hosting is Mac-local; any later remote/production deployment and the AI provider remain undecided.
