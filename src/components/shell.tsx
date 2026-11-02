"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { scenarioSchema, scenarios } from "@/domain/model";
import { useOrganizer } from "./organizer-provider";
import { formatDate, formatSourceTime, matchesChild, syncStatus } from "@/domain/presentation";
import { Icon } from "./icon";

const navigation = [
  { href: "/", label: "Overview", icon: "today" },
  { href: "/upcoming", label: "Upcoming", icon: "upcoming" },
  { href: "/school-schedule", label: "School schedule", icon: "schedule" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/settings", label: "Local settings", icon: "settings" },
] as const;

export function Shell({ children: content }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, busy, error, mutate, setChild } = useOrganizer();
  const count = state.suggestions.filter((item) => !state.decisions[item.id] && matchesChild(item, state.child)).length;
  const status = syncStatus(state);
  const live = state.mode === "live";
  const household = Object.entries(state.household).filter(([id]) => id !== "household");
  const checkedAt = state.coverage.flatMap((item) => item.checkedAt ? [item.checkedAt] : []).toSorted().at(-1);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar">
        <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">o</span>orbit<span className="brand-dot" aria-hidden="true">.</span></Link>
        <p className="sidebar-caption">A little less to keep in mind.</p>
        <nav aria-label="Main navigation">
          {navigation.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className="nav-link"><Icon name={item.icon} /><span>{item.label}</span>{item.href === "/review" && count > 0 && <span className="nav-count" aria-label={`${count} pending`}>{count}</span>}</Link>)}
        </nav>
        <div className="sidebar-footer"><span className="household-mark" aria-hidden="true">{live ? household.map(([, child]) => child.initial).join(" + ") || "Aula" : "E + A"}</span><strong>{live ? "Your Aula household" : "The demo household"}</strong><p>{live ? `${household.length} children. One calm overview.` : "Two children. One calm overview."}</p><span className="pill">{live ? "Read-only · AI off" : "Fictional data only"}</span></div>
      </aside>
      <div className="workspace">
        <header className="topbar"><span className="eyebrow">Your family&apos;s orbit</span><span className="demo-tag">{live ? "Local organizer · Real Aula data" : "Local organizer · Synthetic data"}</span></header>
        <section className="demo-toolbar" aria-label={live ? "Live data controls" : "Demo controls"}>
          <div><span className="demo-date">{live ? `${formatDate(state.today)} ${state.today.slice(0, 4)}` : "Mon, 2 November 2026"}</span><span className="muted">{live ? "Current date · Copenhagen time" : "Fixed demo date · Copenhagen time"}</span></div>
          <div className="toolbar-actions">
            {!live && <><label htmlFor="scenario">Demo scenario</label>
            <select id="scenario" value={state.scenario} disabled={busy || Boolean(state.job)} onChange={(event) => {
              void mutate({ type: "scenario", scenario: scenarioSchema.parse(event.target.value) });
            }}>{Object.entries(scenarios).map(([id, option]) => <option value={id} key={id}>{option.label}</option>)}</select></>}
            <button className="button secondary" onClick={() => void mutate({ type: "refresh" })} disabled={busy || Boolean(state.job) || live && !state.connected}><Icon name="refresh" />{state.job ? "Refresh pending..." : live ? state.paused ? "Resume Aula refresh" : "Refresh Aula" : "Refresh synthetic data"}</button>
          </div>
        </section>
        <div className="page-content">
          <main id="main" tabIndex={-1}>
          <div className={`connection-note ${status.warning ? "warning" : ""}`} role="status" aria-live="polite">
            <span className="status-marker" aria-hidden="true" />
            <div><strong>{status.title}</strong><p>{status.detail}</p></div>
            <Link href="/settings" className="text-link">Coverage details<Icon name="arrow" /></Link>
          </div>
          {error && <p className="notice warning" role="alert">{error}</p>}
          <fieldset className="child-filters">
            <legend>Show information for</legend>
            {["all", ...household.map(([id]) => id)].map((child) => <label key={child} className={state.child === child ? "filter selected" : "filter"}><input type="radio" name="child-filter" value={child} checked={state.child === child} onChange={() => setChild(child)} />{child === "all" ? live ? "All children" : "Both children" : state.household[child].name}</label>)}
          </fieldset>
          {content}
          </main>
          <footer className="page-footer">
            <p><strong>{live ? "Real Aula data · read-only." : "Synthetic data only."}</strong> {live ? "90-day retention limit; cleanup runs while Orbit is active or on restart. No AI or external calendar is connected." : "Decisions are saved locally across reloads and restarts. No external calendar is connected."}</p>
            <div className="refresh-metadata"><span>{live ? "Last checked" : "Last successful synthetic refresh"}: {(live ? checkedAt : state.lastSuccess) ? formatSourceTime((live ? checkedAt : state.lastSuccess)!) : "Not yet completed"}</span><span>{live ? "AI summaries and suggestions: not enabled" : `Prewritten brief as of: ${state.briefAt ? formatSourceTime(state.briefAt) : "Not yet generated"}`}</span></div>
            <p>Orbit supplements Aula. Attachments, {live ? "weekly-plan providers other than EasyIQ SkolePortal" : "weekly plans"}, and sensitive content are not covered.</p>
            {!live && <button className="text-link" disabled={busy || Boolean(state.job)} onClick={() => void mutate({ type: "reset" })}>Reset synthetic dataset</button>}
          </footer>
        </div>
      </div>
      <div className={`live-message ${state.announcement ? "visible" : ""}`} role="status" aria-live="polite" aria-atomic="true">{state.announcement}</div>
    </div>
  );
}
