"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DEMO_DATE, type AgendaEntry, type EventDetails, type Candidate } from "@/domain/model";
import { useOrganizer } from "./organizer-provider";
import { formatDate, formatSourceTime, inWindow, matchesChild, suggestionDetails } from "@/domain/presentation";
import { ChildLabel } from "./child-label";
import { Dialog } from "./dialog";
import { Icon } from "./icon";
import { SourceButton } from "./source-button";

function useItems() {
  const { state } = useOrganizer();
  const pending = state.suggestions.filter((item) => !state.decisions[item.id] && matchesChild(item, state.child));
  const agenda = state.agenda.filter((item) => inWindow(item.date) && matchesChild(item, state.child)).toSorted((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
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
  return <section className="panel loading-panel" aria-busy="true" aria-label="Loading synthetic data"><h2>Getting the local overview ready</h2><p>The worker is importing fictional sources. No Aula or AI service is contacted.</p><div className="skeleton" /><div className="skeleton short" /><div className="skeleton" /></section>;
}

function EventCard({ entry }: { entry: AgendaEntry }) {
  return <article className="agenda-entry" aria-label={entry.title} id={`event-${entry.id}`}>
    <div className="date-tile" aria-hidden="true"><span>{entry.date === DEMO_DATE ? "Today" : formatDate(entry.date, true).split(" ")[1]}</span><strong>{Number(entry.date.slice(8))}</strong></div>
    <div className="event-content">
      <ChildLabel child={entry.child} />
      <h3>{entry.title}</h3>
      <p className="event-time"><time dateTime={`${entry.date}${entry.time ? `T${entry.time}` : ""}`}>{formatDate(entry.date)} · {entry.time || "Date only · no time specified"}</time></p>
      {entry.location && <p className="muted">{entry.location}</p>}
      <span className="origin-label">{entry.origin === "Structured calendar" ? "Structured calendar · synthetic" : "Saved to Orbit"}</span>
      <SourceButton source={entry.source} />
    </div>
  </article>;
}

export function TodayView() {
  const { state, pending, agenda, points } = useItems();
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
          <Link className="panel-link" href="/upcoming">See the next 30 days<Icon name="arrow" /></Link>
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
  return <>
    <PageHeading eyebrow="A little space to plan" title="Coming up." description="2 November - 1 December 2026 · the next 30 demo days. Times are in Europe/Copenhagen." />
    {!state.lastSuccess && state.job ? <LoadingState /> : <section className="panel" aria-labelledby="agenda-heading">
      <div className="panel-heading"><h2 id="agenda-heading">Your Orbit agenda</h2><span className="pill">{agenda.length} {agenda.length === 1 ? "item" : "items"}</span></div>
      <p className="panel-description">Structured calendar facts and your approved suggestions. No external calendar is connected.</p>
      {agenda.length ? <div className="agenda-list full-agenda">{agenda.map((entry) => <EventCard key={entry.id} entry={entry} />)}</div> : <EmptyState title="No upcoming items">There are no agenda items for this child filter and 30-day window. This is not a claim about excluded or unchecked sources.</EmptyState>}
      <Link href="/review" className="panel-link">{pending.length} suggestions still in review<Icon name="arrow" /></Link>
    </section>}
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
