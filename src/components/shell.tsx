"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BRIEF_TIME, REFRESH_TIME, children, isScenario, scenarios, suggestions } from "@/demo/fixtures";
import { useDemo } from "@/demo/provider";
import { matchesChild } from "@/demo/state";
import { Icon } from "./icon";

const navigation = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/upcoming", label: "Upcoming", icon: "upcoming" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/settings", label: "Demo settings", icon: "settings" },
] as const;

export function Shell({ children: content }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, dispatch } = useDemo();
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const count = ["empty", "loading"].includes(state.scenario) ? 0 : suggestions.filter((item) => !state.decisions[item.id] && (!item.busyOnly || state.scenario === "busy") && matchesChild(item, state.child)).length;
  const scenario = scenarios[state.scenario];

  function simulateRefresh() {
    if (timer.current) clearTimeout(timer.current);
    setRefreshing(true);
    dispatch({ type: "announce", message: "Simulating refresh. No connection to Aula or AI." });
    timer.current = setTimeout(() => {
      setRefreshing(false);
      dispatch({ type: "announce", message: `Demo refresh simulation finished. ${scenario.title}. Timestamps are fixed fictional values; no service was contacted.` });
      timer.current = null;
    }, 900);
  }

  function cancelRefresh() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRefreshing(false);
  }

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
        <header className="topbar"><span className="eyebrow">Your family&apos;s orbit</span><span className="demo-tag">Interactive prototype · Demo</span></header>
        <div className="demo-toolbar" aria-label="Demo controls">
          <div><span className="demo-date">Mon, 2 November 2026</span><span className="muted">Fixed demo date · Copenhagen time</span></div>
          <div className="toolbar-actions">
            <label htmlFor="scenario">Demo scenario</label>
            <select id="scenario" value={state.scenario} onChange={(event) => {
              const value = event.target.value;
              if (!isScenario(value)) throw new Error(`Unknown demo scenario: ${value}`);
              cancelRefresh();
              dispatch({ type: "scenario", scenario: value });
            }}>{Object.entries(scenarios).map(([id, option]) => <option value={id} key={id}>{option.label}</option>)}</select>
            <button className="button secondary" onClick={simulateRefresh} disabled={refreshing || state.scenario === "loading"}><Icon name="refresh" />{refreshing ? "Simulating..." : "Simulate refresh"}</button>
          </div>
        </div>
        <div className="page-content">
          <div className={`connection-note ${scenario.tone === "warning" ? "warning" : ""}`}>
            <span className="status-marker" aria-hidden="true" />
            <div><strong>{scenario.title}</strong><p>{scenario.detail}</p></div>
            <Link href="/settings" className="text-link">Coverage details<Icon name="arrow" /></Link>
          </div>
          <fieldset className="child-filters">
            <legend>Show information for</legend>
            {(["all", "emma", "alex"] as const).map((child) => <label key={child} className={state.child === child ? "filter selected" : "filter"}><input type="radio" name="child-filter" value={child} checked={state.child === child} onChange={() => dispatch({ type: "filter", child })} />{child === "all" ? "Both children" : children[child].name}</label>)}
          </fieldset>
          <main id="main" tabIndex={-1}>{content}</main>
          <footer className="page-footer">
            <p><strong>Demo only.</strong> Changes reset on reload. No external calendar is connected.</p>
            <div className="refresh-metadata"><span>Last successful demo refresh: {REFRESH_TIME}</span><span>Prewritten brief as of: {BRIEF_TIME}</span></div>
            <p>Orbit supplements Aula. Attachments, weekly plans, and sensitive content are not covered.</p>
            <button className="text-link" onClick={() => { cancelRefresh(); dispatch({ type: "reset" }); }}>Reset demo</button>
          </footer>
        </div>
      </div>
      <div className={`live-message ${state.announcement ? "visible" : ""}`} role="status" aria-live="polite" aria-atomic="true">{state.announcement}</div>
    </div>
  );
}
