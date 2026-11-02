"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { type AgendaEntry, type EventDetails, type Candidate } from "@/domain/model";
import { addDays, startOfWeek } from "@/domain/dates";
import { useOrganizer } from "./organizer-provider";
import { eventInWindow, formatDate, formatSourceTime, matchesChild, scheduleWeek, suggestionDetails } from "@/domain/presentation";
import { ChildLabel } from "./child-label";
import { Dialog } from "./dialog";
import { Icon } from "./icon";
import { SourceButton } from "./source-button";
import { SourceLinks } from "./source-links";

function useItems() {
  const { state } = useOrganizer();
  const pending = state.suggestions.filter((item) => !state.decisions[item.id] && matchesChild(item, state.child));
  const agenda = state.agenda.filter((item) => eventInWindow(item, state.today, state.windowEnd) && matchesChild(item, state.child)).toSorted((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const points = state.brief.filter((item) => matchesChild(item, state.child));
  return { state, pending, agenda, points };
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>;
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-symbol" aria-hidden="true"><Icon name="check" /></span><h3>{title}</h3><p>{children}</p></div>;
}

function LoadingState() {
  const live = useOrganizer().state.mode === "live";
  return <section className="panel loading-panel" aria-busy="true" aria-label={live ? "Loading Aula data" : "Loading synthetic data"}><h2>Getting the local overview ready</h2><p>{live ? "The local worker is checking Aula. Original source previews and structured events will appear here; AI is disabled." : "The worker is importing fictional sources. No Aula or AI service is contacted."}</p><div className="skeleton" /><div className="skeleton short" /><div className="skeleton" /></section>;
}

function EventCard({ entry }: { entry: AgendaEntry }) {
  const { state } = useOrganizer();
  const lastDay = entry.endDate && entry.allDay ? addDays(entry.endDate, -1) : entry.endDate;
  return <article className="agenda-entry" aria-label={entry.title} id={`event-${entry.id}`}>
    <div className="date-tile" aria-hidden="true"><span>{entry.date === state.today ? "Today" : formatDate(entry.date, true).split(" ")[1]}</span><strong>{Number(entry.date.slice(8))}</strong></div>
    <div className="event-content">
      <ChildLabel child={entry.child} />
      <h3>{entry.title}</h3>
      <p className="event-time"><time dateTime={`${entry.date}${entry.time ? `T${entry.time}` : ""}`}>{formatDate(entry.date)} · {entry.allDay ? "All day" : entry.time || "Date only · no time specified"}</time>{lastDay && lastDay > entry.date && <> through {formatDate(lastDay)}</>}{entry.endTime && <> – {entry.endTime}</>}</p>
      {entry.location && <p className="muted">{entry.location}</p>}
      <span className="origin-label">{entry.origin === "Structured calendar" ? state.mode === "live" ? "Structured Aula calendar" : "Structured calendar · synthetic" : "Saved to Orbit"}</span>
      <SourceButton source={entry.source} />
    </div>
  </article>;
}

function LiveToday() {
  const { state, agenda } = useItems();
  const [visible, setVisible] = useState(12);
  const previews = state.previews.filter((item) => matchesChild(item, state.child));
  return <>
    <PageHeading eyebrow="Original sources. A calmer overview." title="Your Aula, at a glance." description="Real posts, message previews, and calendar events. Original text is preserved; AI summaries and suggestions are not enabled." />
    {!state.previews.length && !state.agenda.length && state.job ? <LoadingState /> : <div className="today-grid">
      <section className="panel" aria-labelledby="sources-heading">
        <div className="panel-heading"><div><p className="eyebrow">From school and kindergarten</p><h2 id="sources-heading">Source previews</h2></div><span className="pill">No AI summary</span></div>
        <p className="panel-description">Latest retained posts and threads from the last 90 days. Household labels mean the source did not identify a single child.</p>
        {previews.length ? <ul className="brief-list">{previews.slice(0, visible).map((item) => <li key={item.id}>
          <article className="live-source"><ChildLabel child={item.child} /><h3 lang="da">{item.source.title}</h3>
            <p className="source-preview" lang="da">{item.source.excerpt.slice(0, 320)}{item.source.excerpt.length > 320 ? "…" : ""}</p>
            {item.source.notice && <p className="field-help">{item.source.notice}</p>}
            <SourceButton source={item.source} />
          </article>
        </li>)}</ul> : <EmptyState title="No source previews for this selection">Check coverage below. Empty or excluded results do not mean there is nothing to follow up in Aula.</EmptyState>}
        {visible < previews.length && <button className="panel-link" onClick={() => setVisible((value) => value + 12)}>Show more source previews<Icon name="arrow" /></button>}
        <div className="brief-footnote"><Icon name="source" /><p>At most 100 recent sources are listed. Attachments, other weekly-plan providers, sensitive content, and unread message bodies are not imported. EasyIQ lesson content is in School schedule.</p></div>
      </section>
      <section className="panel next-panel" aria-labelledby="next-heading">
        <div className="panel-heading"><div><p className="eyebrow">The next 30 days</p><h2 id="next-heading">On the horizon</h2></div></div>
        {agenda.length ? <div className="agenda-list">{agenda.slice(0, 5).map((entry) => <EventCard key={entry.id} entry={entry} />)}</div> : <EmptyState title="No calendar items available">Only checked structured calendar data can appear here. See coverage for missing or incomplete sources.</EmptyState>}
        <Link className="panel-link" href="/school-schedule">See the school schedule<Icon name="arrow" /></Link>
      </section>
    </div>}
  </>;
}

export function TodayView() {
  const { state, pending, agenda, points } = useItems();
  if (state.mode === "live") return <LiveToday />;
  return <>
    <PageHeading eyebrow="Monday, made a little lighter" title="A little clarity for today." description="The important bits from school and kindergarten, all in one place." />
    {!state.lastSuccess && state.job ? <LoadingState /> : <>
      <div className="today-grid">
        <section className="panel brief-panel" aria-labelledby="brief-heading">
          <div className="panel-heading"><div><p className="eyebrow">The short version</p><h2 id="brief-heading">Your daily brief</h2></div><span className="pill">Prewritten demo</span></div>
          {points.length ? <ul className="brief-list">{points.map((item, index) => <li key={item.id}>
            <span className="brief-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <article><div className="item-topline"><ChildLabel child={item.child} /><span className={`item-label ${item.label === "Changed" ? "changed" : ""}`}>{item.label}</span></div><h3>{item.title}</h3><p>{item.summary}</p><SourceButton source={item.source} /></article>
          </li>)}</ul> : <EmptyState title="A quieter demo day">No brief items for this selection. Only the listed core demo sources were checked; excluded sources may contain information.</EmptyState>}
          <div className="brief-footnote"><Icon name="source" /><p>Every point has a source. These summaries are written fixtures, not AI output.</p></div>
        </section>
        <section className="panel next-panel" aria-labelledby="next-heading">
          <div className="panel-heading"><div><p className="eyebrow">Make a little room</p><h2 id="next-heading">On the horizon</h2></div></div>
          {agenda.length ? <div className="agenda-list">{agenda.slice(0, 3).map((entry) => <EventCard key={entry.id} entry={entry} />)}</div> : <EmptyState title="Room to breathe">No agenda items for this selection in the next 30 demo days.</EmptyState>}
          <Link className="panel-link" href="/upcoming">See approved upcoming events<Icon name="arrow" /></Link>
          <Link className="panel-link" href="/school-schedule">See the school schedule<Icon name="arrow" /></Link>
        </section>
      </div>
      <section className="review-teaser" aria-labelledby="review-heading">
        <div className="review-emblem" aria-hidden="true"><Icon name="review" /></div>
        <div><p className="eyebrow">You have the final say</p><h2 id="review-heading">{pending.length ? `${pending.length} suggestions need a look` : "Nothing waiting for review"}</h2><p>{pending.length ? "A trip, a deadline, or a change of plans. Nothing joins your agenda without you." : "Your decisions are saved locally, including across reloads and restarts."}</p></div>
        <Link className="button primary" href="/review">Review suggestions<Icon name="arrow" /></Link>
      </section>
    </>}
  </>;
}

export function UpcomingView() {
  const { state, agenda, pending } = useItems();
  const approved = agenda.filter((entry) => entry.origin === "Approved suggestion");
  return <>
    <PageHeading eyebrow="A little space to plan" title="Coming up." description={state.mode === "live" ? `${formatDate(state.today)} - ${formatDate(addDays(state.windowEnd, -1))} · the next 30 days. Times are in Europe/Copenhagen.` : "2 November - 1 December 2026 · the next 30 demo days. Times are in Europe/Copenhagen."} />
    {state.mode === "live" ? <section className="panel" aria-labelledby="upcoming-empty-heading">
      <div className="panel-heading"><h2 id="upcoming-empty-heading">No upcoming events yet</h2><span className="pill">AI not enabled</span></div>
      <p className="panel-description">This space is reserved for events from AI-generated suggestions, after your review. AI suggestions are not enabled yet. Imported calendar events are in School schedule; this empty view is not an all-clear for Aula.</p>
      <Link href="/school-schedule" className="panel-link">See the school schedule<Icon name="arrow" /></Link>
    </section> : !state.agenda.length && state.job ? <LoadingState /> : <section className="panel" aria-labelledby="agenda-heading">
      <div className="panel-heading"><h2 id="agenda-heading">Your Orbit agenda</h2><span className="pill">{approved.length} {approved.length === 1 ? "item" : "items"}</span></div>
      <p className="panel-description">Your approved fictional suggestions. Structured calendar fixtures are in School schedule. No external calendar is connected.</p>
      {approved.length ? <div className="agenda-list full-agenda">{approved.map((entry) => <EventCard key={entry.id} entry={entry} />)}</div> : <EmptyState title="No upcoming items">There are no approved suggestions for this child filter and 30-day window. This is not a claim about excluded or unchecked sources.</EmptyState>}
      <Link href="/review" className="panel-link">{pending.length} suggestions still in review<Icon name="arrow" /></Link>
    </section>}
  </>;
}

function SchoolDay({ day }: { day: ReturnType<typeof scheduleWeek>[number] }) {
  const { state } = useOrganizer();
  return <section className={`schedule-day${day.date === state.today ? " current-day" : ""}`} aria-labelledby={`day-${day.date}`}>
    <h3 id={`day-${day.date}`}><time dateTime={day.date}>{formatDate(day.date)}</time>{day.date === state.today && <> <span className="pill">Today</span></>}</h3>
    {!day.available ? <p className="schedule-empty">Outside the available date window</p> : day.entries.length ? <ul className="schedule-events">{day.entries.map((entry) => {
      const lastDay = entry.endDate && entry.allDay ? addDays(entry.endDate, -1) : entry.endDate;
      const spansDates = lastDay && lastDay > entry.date;
      return <li key={entry.id}><article className="schedule-card" aria-label={entry.title} id={`schedule-${day.date}-${entry.id}`}>
        <ChildLabel child={entry.child} institution />
        <h4 lang={state.mode === "live" ? "da" : undefined}>{entry.title}</h4>
        {entry.className && <p className="muted">{entry.className}</p>}
        <p className="schedule-time">
          <time dateTime={`${entry.date}${entry.time && !entry.allDay ? `T${entry.time}` : ""}`}>{spansDates && `${formatDate(entry.date, true)} · `}{entry.allDay ? "All day" : entry.time || "Date only · no time specified"}</time>
          {lastDay && spansDates ? <> to <time dateTime={`${lastDay}${entry.endTime && !entry.allDay ? `T${entry.endTime}` : ""}`}>{formatDate(lastDay, true)}{entry.endTime && !entry.allDay && ` · ${entry.endTime}`}</time></> : entry.endTime && !entry.allDay && <> – <time dateTime={`${entry.endDate ?? entry.date}T${entry.endTime}`}>{entry.endTime}</time></>}
        </p>
        {entry.location && <p className="muted">{entry.location}</p>}
        {entry.notes && <p className="lesson-notes" lang="da">{entry.notes}</p>}
        <SourceLinks source={entry.source} />
        <span className="origin-label">{entry.source.kind === "Weekly plan" ? "EasyIQ SkolePortal" : state.mode === "live" ? "Structured Aula calendar" : "Structured calendar · synthetic"}</span>
        <SourceButton source={entry.source} />
      </article></li>;
    })}</ul> : <p className="schedule-empty">No imported events for this selection</p>}
  </section>;
}

export function SchoolScheduleView() {
  const { state, agenda } = useItems();
  const currentWeek = startOfWeek(state.today);
  const lastWeek = startOfWeek(addDays(state.windowEnd, -1));
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const week = selectedWeek < currentWeek ? currentWeek : selectedWeek > lastWeek ? lastWeek : selectedWeek;
  const weekEnd = addDays(week, 6);
  const live = state.mode === "live";
  const entries = live ? state.schoolPlan.filter((entry) => matchesChild(entry, state.child)) : agenda;
  const days = scheduleWeek(entries, week, state.today, state.windowEnd);
  const weekend = days.slice(5);
  const loading = (live ? !state.schoolPlan.length : !state.agenda.some((entry) => entry.origin === "Structured calendar")) && Boolean(state.job);
  return <>
    <PageHeading eyebrow="The school week, at a glance" title="School schedule" description={live ? "Only EasyIQ SkolePortal classes, with their original time ranges, lesson content, and resources. Aula calendar events remain in Overview. No AI is used." : "School and kindergarten calendar fixtures, grouped by day. No live provider or AI is used."} />
    {state.mode === "live" && !state.coverage.find((item) => item.kind === "Weekly plan")?.complete && <p className="notice warning schedule-coverage" role="status">EasyIQ lesson coverage is incomplete or has not been checked. Saved lesson content remains visible; missing notes do not mean nothing was assigned. See Local settings for coverage.</p>}
    <section className="panel schedule-panel" aria-labelledby="schedule-week-heading">
      <div className="panel-heading">
        <div><p className="eyebrow">Europe/Copenhagen</p><h2 id="schedule-week-heading" aria-live="polite" aria-atomic="true">{formatDate(week)} {week.slice(0, 4)} – {formatDate(weekEnd)} {weekEnd.slice(0, 4)}</h2></div>
        <div className="week-controls" role="group" aria-label="Choose schedule week">
          <button className="button secondary" disabled={week <= currentWeek} onClick={() => setSelectedWeek(addDays(week, -7))}>Previous week</button>
          <button className="button secondary" onClick={() => setSelectedWeek(currentWeek)}>This week</button>
          <button className="button secondary" disabled={week >= lastWeek} onClick={() => setSelectedWeek(addDays(week, 7))}>Next week</button>
        </div>
      </div>
      <p className="panel-description">Available dates: {formatDate(state.today)} – {formatDate(addDays(state.windowEnd, -1))}. Empty days mean no imported events for this selection, not that excluded or unchecked sources are clear. See coverage for missing, stale, or incomplete data.</p>
      {loading ? <p className="schedule-loading" role="status" aria-busy="true">{live ? "Loading EasyIQ SkolePortal classes." : "Loading imported calendar events."} No AI processing is enabled.</p> : <>
        <div className="schedule-grid">{days.slice(0, 5).map((day) => <SchoolDay key={day.date} day={day} />)}</div>
        {weekend.some((day) => day.entries.length > 0) && <section className="schedule-weekend" aria-labelledby="weekend-heading"><h2 id="weekend-heading">Weekend</h2><div className="schedule-grid weekend-grid">{weekend.map((day) => <SchoolDay key={day.date} day={day} />)}</div></section>}
      </>}
    </section>
  </>;
}

export function EditSuggestion({ suggestion, onClose }: { suggestion: Candidate; onClose: () => void }) {
  const { state, mutate, busy, error: saveError } = useOrganizer();
  const [values, setValues] = useState<EventDetails>(() => suggestionDetails(suggestion, state.agenda));
  const [error, setError] = useState("");
  const [dateConfirmed, setDateConfirmed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.title.trim() || !values.date) {
      setError("Enter a title and confirm the date before adding this item.");
      return;
    }
    const saved = await mutate({ type: "approve", id: suggestion.id, revision: suggestion.revision, details: { ...values, title: values.title.trim(), location: values.location.trim() }, dateConfirmed });
    if (saved) onClose();
  }
  return <Dialog title={suggestion.date ? "Edit & approve" : "Confirm a date before approving"} onClose={onClose}>
    <p className="muted mt-4">Only confirm details you know. Leave the time blank when it is not supplied. No duration is assumed.</p>
    {suggestion.uncertainty && <p className="notice warning mt-4">{suggestion.uncertainty}</p>}
    <details className="edit-evidence"><summary>Original fictional source excerpt</summary><blockquote lang="da">{suggestion.source.excerpt}</blockquote></details>
    <form onSubmit={submit} className="edit-form">
      <div><label htmlFor="event-title">Title</label><input id="event-title" required value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} aria-invalid={error && !values.title.trim() ? true : undefined} aria-describedby={error ? "edit-error" : undefined} /></div>
      <div className="form-grid">
        <div><label htmlFor="event-date">Confirmed date</label><input id="event-date" type="date" required value={values.date} onChange={(event) => setValues({ ...values, date: event.target.value })} aria-describedby="date-help" /><p id="date-help" className="field-help">An unresolved date must stay in review.</p></div>
        <div><label htmlFor="event-time">Time (optional)</label><input id="event-time" type="time" value={values.time} onChange={(event) => setValues({ ...values, time: event.target.value })} aria-describedby="time-help" /><p id="time-help" className="field-help">Blank means date-only, not midnight.</p></div>
      </div>
      <div><label htmlFor="event-location">Location (optional)</label><input id="event-location" value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></div>
      {!suggestion.date && <label className="confirmation"><input type="checkbox" required checked={dateConfirmed} onChange={(event) => setDateConfirmed(event.target.checked)} />I have confirmed this date separately; it is not in the original source.</label>}
      {error && <p id="edit-error" className="form-error" role="alert">{error}</p>}
      {saveError && <p className="form-error" role="alert">{saveError}</p>}
      <div className="form-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="button primary" disabled={busy}>{busy ? "Saving..." : "Approve & save to Orbit"}</button></div>
      <p className="field-help">Changes are saved on this Mac. No external calendar is connected.</p>
    </form>
  </Dialog>;
}

function SuggestionCard({ suggestion }: { suggestion: Candidate }) {
  const { state, mutate, busy } = useOrganizer();
  const [editing, setEditing] = useState(false);
  const previous = state.agenda.find((item) => item.id === suggestion.replacesId);
  const decision = state.decisions[suggestion.id];
  return <article className="panel suggestion-card" aria-label={suggestion.title}>
    <div className="item-topline"><ChildLabel child={suggestion.child} institution /><span className={`pill ${suggestion.replacesId ? "amber" : ""}`}>{suggestion.replacesId ? "Proposed revision" : "Prewritten suggestion"}</span></div>
    <h3>{suggestion.title}</h3>
    {decision ? <div className="decision-result" role="status"><Icon name="check" /><p>{decision === "approved" ? "Saved to Orbit" : "Dismissed from review"}</p>{decision === "approved" && <Link className="text-link" href={`/upcoming#event-${suggestion.replacesId ?? `approved-${suggestion.id}`}`}>View agenda entry<Icon name="arrow" /></Link>}</div> : <>
      <p>{suggestion.summary}</p>
      <p className="suggestion-date">{suggestion.date ? formatDate(suggestion.date) : "Date not confirmed"} · {suggestion.time || "No time specified"}</p>
      {suggestion.location && <p className="muted">{suggestion.location}</p>}
      {suggestion.uncertainty && <p className="notice warning">{suggestion.uncertainty}</p>}
      {previous && <div className="revision-note"><strong>Your existing entry stays unchanged until approval</strong><p>{previous.title} · {formatDate(previous.date)} · {previous.time} · {previous.location}</p><p>Your edited fields are kept when you approve. Edit & approve to change them.</p><SourceButton source={previous.source} /></div>}
    </>}
    <SourceButton source={suggestion.source} />
    {!decision && <div className="card-actions">
      <button className="button primary" disabled={!suggestion.date || busy} onClick={() => void mutate({ type: "approve", id: suggestion.id, revision: suggestion.revision, details: suggestionDetails(suggestion, state.agenda), dateConfirmed: false })}>{suggestion.replacesId ? "Approve revision" : "Approve"}</button>
      <button className="button secondary" disabled={busy} onClick={() => setEditing(true)}>{suggestion.date ? "Edit & approve" : "Resolve & approve"}</button>
      <button className="button quiet" disabled={busy} onClick={() => void mutate({ type: "dismiss", id: suggestion.id, revision: suggestion.revision })}>Dismiss</button>
    </div>}
    {editing && <EditSuggestion suggestion={suggestion} onClose={() => setEditing(false)} />}
  </article>;
}

export function ReviewView() {
  const { state, pending } = useItems();
  const heading = useRef<HTMLHeadingElement>(null);
  const previousDecisions = useRef(state.decisions);
  useEffect(() => {
    if (previousDecisions.current !== state.decisions) heading.current?.focus();
    previousDecisions.current = state.decisions;
  }, [state.decisions]);
  const decided = state.suggestions.filter((item) => state.decisions[item.id] && matchesChild(item, state.child));
  if (state.mode === "live") return <>
    <PageHeading eyebrow="You remain in control" title="Review, then relax." description="AI extraction and suggestions are not enabled. No fictional suggestions are mixed into your Aula data." />
    <section className="panel" aria-labelledby="live-review-heading"><div className="panel-heading"><h2 id="live-review-heading">Suggestions are not enabled</h2></div>
      <p className="panel-description">Phase 3 shows original source previews and structured calendar events. AI-generated suggestions require a separate Phase 4 decision. An empty review queue is not an all-clear for Aula.</p>
      <Link href="/" className="panel-link">Read the original source previews<Icon name="arrow" /></Link>
    </section>
  </>;
  return <>
    <PageHeading eyebrow="A moment of your attention" title="Review, then relax." description="Prewritten demo suggestions, grounded in fictional source excerpts. You decide what belongs in your agenda." />
    {!state.lastSuccess && state.job ? <LoadingState /> : <>
      <section aria-labelledby="pending-heading"><div className="section-heading"><h2 id="pending-heading" ref={heading} tabIndex={-1}>Waiting for you <span className="count-label">{pending.length}</span></h2><p>Approvals save only inside Orbit.</p></div>
        <div className="review-list">{pending.length ? pending.map((item) => <SuggestionCard key={item.id} suggestion={item} />) : <div className="panel"><EmptyState title="You're through this review queue">No pending suggestions for this selection. That does not mean excluded sources are clear.</EmptyState></div>}</div>
      </section>
      {decided.length > 0 && <section className="mt-8" aria-labelledby="decided-heading"><h2 id="decided-heading" className="mb-4">Your saved decisions</h2><div className="review-list">{decided.map((item) => <SuggestionCard key={item.id} suggestion={item} />)}</div></section>}
    </>}
  </>;
}

export function SettingsView() {
  const { state } = useOrganizer();
  if (state.mode === "live") return <LiveSettings />;
  return <>
    <PageHeading eyebrow="A clear picture, including the gaps" title="Behind the overview." description="A persistent local organizer, not a live Aula connection. Every person, message, and event is fictional." />
    <div className="settings-grid">
      <section className="panel" aria-labelledby="coverage-heading">
        <div className="panel-heading"><h2 id="coverage-heading">Source coverage</h2><span className="pill">Synthetic adapter</span></div>
        <dl className="coverage-list">{state.coverage.map((item) => <div key={item.kind}><dt>{item.kind === "Calendar" ? "Calendar events" : `${item.kind}s`}</dt><dd>{item.complete ? "Checked · synthetic" : `Incomplete · ${item.error ?? "not checked"}`}<br />{item.pages} pages · {item.items} items<br />Last success: {item.lastSuccess ? formatSourceTime(item.lastSuccess) : "Never"}</dd></div>)}
          <div><dt>Attachments & images</dt><dd>Not processed</dd></div><div><dt>Weekly plans</dt><dd>Not processed</dd></div><div><dt>Sensitive content</dt><dd>{state.scenario === "partial" ? "Inaccessible · not checked" : "Not covered"}</dd></div>
        </dl>
        <p className="panel-description">A checked source is not complete coverage of Aula. Unprocessed and inaccessible content may contain important information.</p>
      </section>
      <section className="panel" aria-labelledby="demo-heading">
        <div className="panel-heading"><h2 id="demo-heading">A safe place to try things</h2></div>
        <div className="settings-copy"><h3>Stored on this Mac</h3><p>Sources, briefs, approvals, edits, and dismissals are stored in local SQLite. No Aula login, AI provider, analytics, or external calendar is connected.</p><h3>Refresh lifecycle</h3><p>The worker refreshes every 30 minutes while Orbit is running and the Mac is awake. Closing a browser tab does not stop it. Stopping Orbit or sleeping the Mac pauses refresh.</p><h3>Try a different kind of day</h3><p>The demo scenario selector queues an actual worker run against fictional sources. Failures retain previous data. An empty response never deletes saved events. Summaries are deterministic fixtures, not AI output.</p><h3>Start fresh whenever you like</h3><p>Reloading keeps your saved decisions. Reset synthetic dataset clears only the selected synthetic dataset ({state.dataset}) and restores the fictional starting state. Changing scenarios does not reset decisions. Child filters last for in-app navigation.</p><h3>About the starting agenda</h3><p>The lantern walk is a previously approved fixture with an edited title. Its updated source is waiting in Review. Approving replaces the same entry without losing your edits.</p></div>
      </section>
    </div>
  </>;
}

function LiveSettings() {
  const { state, busy, mutate } = useOrganizer();
  const [confirm, setConfirm] = useState<"delete-live" | "disconnect" | null>(null);
  return <>
    <PageHeading eyebrow="A clear picture, including the gaps" title="Behind the overview." description="A read-only Aula connection on this Mac. AI, external calendars, and remote access are not enabled." />
    <div className="settings-grid">
      <section className="panel" aria-labelledby="coverage-heading">
        <div className="panel-heading"><h2 id="coverage-heading">Source coverage</h2><span className="pill">Aula · read-only</span></div>
        <dl className="coverage-list">{state.coverage.map((item) => <div key={item.kind}>
          <dt>{item.kind === "Weekly plan" ? "EasyIQ SkolePortal lessons" : item.kind === "Calendar" ? "Calendar events" : `${item.kind}s`}</dt>
          <dd>{item.complete ? "Checked within the import window" : `Incomplete · ${item.error ?? "not checked"}`}<br />
            {item.pages} pages checked · {item.items} retained items<br />Last success: {item.lastSuccess ? formatSourceTime(item.lastSuccess) : "Never"}
            {item.exclusions?.map((notice) => <p key={notice}>{notice}</p>)}
          </dd>
        </div>)}
          <div><dt>Attachments, other weekly-plan providers, sensitive content</dt><dd>Not fetched</dd></div>
          <div><dt>Unread message bodies</dt><dd>Not fetched · title previews only</dd></div>
          <div><dt>AI summaries & suggestions</dt><dd>Not enabled</dd></div>
        </dl>
        <p className="panel-description">Calendar and EasyIQ SkolePortal: the next 30 dates (weekly provider requests include the intersecting weeks). Posts/messages: at most 90 days. Missing sources must still be checked in Aula.</p>
      </section>
      <section className="panel" aria-labelledby="privacy-heading">
        <div className="panel-heading"><h2 id="privacy-heading">Your data stays local</h2></div>
        <div className="settings-copy">
          <h3>Separate from the demo</h3><p>This live dataset uses a separate SQLite file in the protected, backup-excluded Orbit directory. No source content is sent to AI or analytics.</p>
          <h3>Retention and refresh</h3><p>Imported sources and related records expire within 90 days. Expired items are hidden immediately and purged while the worker runs or on restart. Refresh runs every 30 minutes while this Mac and Orbit are running.</p>
          <h3>Disconnect</h3><p>Remove the locally saved Aula session and pause refresh. Imported data remains until expiry or explicit deletion. Reconnect using guarded terminal login; this is not remote token revocation.</p>
          <button className="button secondary" disabled={busy || Boolean(state.job) || !state.workerOnline} onClick={() => setConfirm("disconnect")}>Disconnect Aula</button>
          <h3>Delete imported data</h3><p>Delete this live dataset&apos;s sources, agenda, and related local records, then pause refresh. Demo data and the saved login are not deleted.</p>
          <button className="button secondary" disabled={busy || Boolean(state.job) || !state.workerOnline} onClick={() => setConfirm("delete-live")}>Delete imported Aula data</button>
        </div>
      </section>
    </div>
    {confirm && <Dialog title={confirm === "delete-live" ? "Delete imported Aula data?" : "Disconnect Aula?"} onClose={() => setConfirm(null)}>
      <p className="mt-6">{confirm === "delete-live" ? "This deletes the live sources, agenda, and related records on this Mac and pauses future imports. It cannot be undone. Your demo data and saved login are kept." : "This removes the local credentials, key, and any leftover session files. Imported data is kept until expiry or deletion. You will need guarded terminal login to reconnect."}</p>
      <div className="form-actions mt-6"><button className="button secondary" onClick={() => setConfirm(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={async () => { if (await mutate({ type: confirm })) setConfirm(null); }}>{confirm === "delete-live" ? "Delete live data & pause" : "Disconnect & keep imported data"}</button></div>
    </Dialog>}
  </>;
}
