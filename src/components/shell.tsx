"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { children, scenarioSchema, scenarios } from "@/domain/model";
import { useOrganizer } from "./organizer-provider";
import { formatSourceTime, matchesChild, syncStatus } from "@/domain/presentation";
import { Icon } from "./icon";

const navigation = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/upcoming", label: "Upcoming", icon: "upcoming" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/settings", label: "Local settings", icon: "settings" },
] as const;

export function Shell({ children: content }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, busy, error, mutate, setChild } = useOrganizer();
  const count = state.suggestions.filter((item) => !state.decisions[item.id] && matchesChild(item, state.child)).length;
  const status = syncStatus(state);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Orbit home"><span className="brand-mark" aria-hidden="true">o</span>orbit<span className="brand-dot" aria-hidden="true">.</span></Link>
        <p className="sidebar-caption">A little less to keep in mind.</p>
        <nav aria-label="Main navigation">
          {navigation.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className="nav-link"><Icon name={item.icon} /><span>{item.label}</span>{item.href === "/review" && count > 0 && <span className="nav-count" aria-label={`${count} pending`}>{count}</span>}</Link>)}
        </nav>
        <div className="sidebar-footer"><span className="household-mark" aria-hidden="true">E + A</span><strong>The demo household</strong><p>Two children. One calm overview.</p><span className="pill">Fictional data only</span></div>
      </aside>
      <div className="workspace">
        <header className="topbar"><span className="eyebrow">Your family&apos;s orbit</span><span className="demo-tag">Local organizer · Synthetic data</span></header>
        <div className="demo-toolbar" aria-label="Demo controls">
          <div><span className="demo-date">Mon, 2 November 2026</span><span className="muted">Fixed demo date · Copenhagen time</span></div>
          <div className="toolbar-actions">
            <label htmlFor="scenario">Demo scenario</label>
            <select id="scenario" value={state.scenario} disabled={busy || Boolean(state.job)} onChange={(event) => {
              void mutate({ type: "scenario", scenario: scenarioSchema.parse(event.target.value) });
            }}>{Object.entries(scenarios).map(([id, option]) => <option value={id} key={id}>{option.label}</option>)}</select>
            <button className="button secondary" onClick={() => void mutate({ type: "refresh" })} disabled={busy || Boolean(state.job)}><Icon name="refresh" />{state.job ? "Refresh pending..." : "Refresh synthetic data"}</button>
          </div>
        </div>
        <div className="page-content">
          <div className={`connection-note ${status.warning ? "warning" : ""}`} role="status" aria-live="polite">
            <span className="status-marker" aria-hidden="true" />
            <div><strong>{status.title}</strong><p>{status.detail}</p></div>
            <Link href="/settings" className="text-link">Coverage details<Icon name="arrow" /></Link>
          </div>
          {error && <p className="notice warning" role="alert">{error}</p>}
          <fieldset className="child-filters">
            <legend>Show information for</legend>
            {(["all", "emma", "alex"] as const).map((child) => <label key={child} className={state.child === child ? "filter selected" : "filter"}><input type="radio" name="child-filter" value={child} checked={state.child === child} onChange={() => setChild(child)} />{child === "all" ? "Both children" : children[child].name}</label>)}
          </fieldset>
          <main id="main" tabIndex={-1}>{content}</main>
          <footer className="page-footer">
            <p><strong>Synthetic data only.</strong> Decisions are saved locally across reloads and restarts. No external calendar is connected.</p>
            <div className="refresh-metadata"><span>Last successful synthetic refresh: {state.lastSuccess ? formatSourceTime(state.lastSuccess) : "Not yet completed"}</span><span>Prewritten brief as of: {state.briefAt ? formatSourceTime(state.briefAt) : "Not yet generated"}</span></div>
            <p>Orbit supplements Aula. Attachments, weekly plans, and sensitive content are not covered.</p>
            <button className="text-link" disabled={busy || Boolean(state.job)} onClick={() => void mutate({ type: "reset" })}>Reset synthetic dataset</button>
          </footer>
        </div>
      </div>
      <div className={`live-message ${state.announcement ? "visible" : ""}`} role="status" aria-live="polite" aria-atomic="true">{state.announcement}</div>
    </div>
  );
}
