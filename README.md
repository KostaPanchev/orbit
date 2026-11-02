# Orbit

A single-household dashboard for school and kindergarten information: what matters today, what is coming up, and what needs your review.

Orbit is planned to bring relevant Aula messages, posts, and calendar events into a focused daily overview, reducing the need to read every source individually. It is a dashboard first, not a chatbot or an autonomous agent.

> **Status: planning only.** No application, dependencies, or tests have been implemented. The features and technical choices below describe the intended product, not currently available functionality.

## Planned experience

- **Today:** a concise daily brief highlighting important changes and actions.
- **Upcoming:** events and deadlines for the next 30 days, with child and institution labels and child filtering.
- **Review:** event suggestions that can be approved, edited and approved, or dismissed.
- **Source details:** source references, timestamps, and original Danish excerpts alongside English summaries.
- **Clear status:** separate indicators for source coverage, last successful refresh, and brief generation time, including partial, stale, disconnected, and AI-unavailable states.

The interface and summaries will be in English. Names, dates, places, and the meaning of Danish source material must be preserved.

### Review before scheduling

Structured Aula calendar events will remain distinct from AI-extracted suggestions. Suggestions must include supporting evidence and disclose uncertainty; missing times or durations will not be invented, date-only events will remain date-only, and unresolved dates will stay in review.

Approved suggestions will link to their agenda entries to avoid duplicates. If a source changes, Orbit will propose a revision rather than silently overwrite an approved entry or discard user edits.

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

### First milestone: the UI-only demo

The prototype will use a fictional household, prewritten English summaries, fictional Danish source excerpts, and a fixed, visibly labeled demo date.

- Approve, edit-and-approve, dismiss, source inspection, navigation, and child filtering will work in memory.
- Decisions will survive in-app navigation but reset on a full page reload or explicit demo reset.
- Approvals will say **"Added to demo agenda"**; persistent approvals from Phase 2 will say **"Saved to Orbit."**
- A scenario selector will expose empty, loading, partial, stale, disconnected, and error states.
- Refresh will be simulated and clearly labeled; it will not contact Aula or an AI service.

Phase 1 will not include a database, localStorage persistence, backend domain services, workers, authentication, external data requests, or deployment.

## Planned technology

| Area | Choice | Introduced |
| --- | --- | --- |
| Frontend | Next.js App Router, TypeScript, pnpm | Phase 1 |
| Design | Tailwind CSS and custom, minimal Material-inspired components; no Material UI library | Phase 1 |
| Validation | Zod domain schemas | Phase 2 |
| Persistence | SQLite with Drizzle migrations | Phase 2 |
| Refresh | Node worker sharing server-side domain services | Phase 2 |
| Aula access | Allowlisted MCP read tools through a local companion process | Phase 3 |
| AI | Explicitly selected provider behind a summarizer boundary | Phase 4 |

The design will be mobile-first, with restrained color, clear typography, and low visual noise. WCAG 2.1 AA is the accessibility target, including keyboard operation, visible focus, meaningful labels, non-color status cues, reduced motion, and 200% zoom/reflow.

Architecture will be added only when needed. From Phase 2, the Next.js application and a separate worker will share SQLite and application services. Synthetic and live datasets will remain separate, while using the same normalization, persistence, and review workflows.

Scheduled refresh will run every 30 minutes while the worker is running, with manual refresh using the same workflow. A sleeping laptop cannot refresh; unattended operation requires the later deployment phase.

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

There is no runnable application or setup command yet. Begin with the [implementation plan](./plan.md), which defines phase dependencies, decision gates, and acceptance criteria. Repository contributors should also read [AGENTS.md](./AGENTS.md).

The next implementation milestone is **Phase 1: the UI/UX prototype**. Installation, startup, reset, and validation commands will be documented when the application and its scripts exist. Creating this README does not start implementation or select a hosting or AI provider.

## Planned verification

Validation will be introduced alongside each phase:

- Vitest and Testing Library for UI and domain behavior.
- Playwright with accessibility checks for key browser journeys, supplemented by manual keyboard, responsive-layout, and zoom checks.
- SQLite-backed integration tests from Phase 2 for persistence, idempotency, source revisions, and recovery.
- Connector and AI tests in later phases for pagination, incomplete responses, expired sessions, Danish dates, daylight-saving changes, unsupported claims, and prompt-injection content.
- Lint, type-check, relevant tests, and a production build once those scripts exist.

See the [acceptance criteria](./plan.md#acceptance-and-verification) for the exact requirements. Passing one phase's checks does not establish that later phases work.

## Out of scope for the initial phases

Google/Apple calendar connections, exports, subscriptions, and external writes; notifications, email, and push delivery; weekly-plan providers; attachments and OCR; chores and task assignment; shopping and meal planning; multi-household support; general conversational agents; and a public multi-user service.

External calendar integration is a potential later phase requiring a separate provider and scope decision. Production hosting and the AI provider remain undecided.
