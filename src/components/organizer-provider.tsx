"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { snapshotSchema, type ChildFilter, type Mutation, type Snapshot } from "@/domain/model";
import { inWindow } from "@/domain/presentation";

interface OrganizerContextValue {
  state: Snapshot & { child: ChildFilter; announcement: string };
  busy: boolean;
  error: string;
  setChild: (child: ChildFilter) => void;
  mutate: (action: Mutation) => Promise<boolean>;
}
const OrganizerContext = createContext<OrganizerContextValue | null>(null);

export function OrganizerProvider({ children, initialState }: { children: ReactNode; initialState: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialState);
  const [child, updateChild] = useState<ChildFilter>("all");
  const [announcement, announce] = useState("");
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [busy, setBusy] = useState(false);
  const mutating = useRef(false);
  const sequence = useRef(0);
  const request = useCallback(async (action?: Mutation, signal?: AbortSignal) => {
    const id = ++sequence.current;
    const response = await fetch("/api/organizer", {
      method: action ? "POST" : "GET", cache: "no-store", signal,
      ...(action ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The local request failed.");
    const next = snapshotSchema.parse(result);
    if (id === sequence.current) setSnapshot((previous) => ({
      ...next,
      decisions: JSON.stringify(previous.decisions) === JSON.stringify(next.decisions) ? previous.decisions : next.decisions,
    }));
    return next;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(async () => {
      if (mutating.current) return;
      try { await request(undefined, controller.signal); setReadError(""); }
      catch (error) {
        if (!controller.signal.aborted) setReadError(error instanceof Error ? error.message : "Could not read local storage.");
      }
    }, 2000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [request]);
  const mutate = async (action: Mutation) => {
    if (mutating.current) return false;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      await request(action);
      if (action.type === "reset") { updateChild("all"); announce("Synthetic reset queued. Only this dataset will be reset."); }
      else if (action.type === "approve") announce(`Saved to Orbit. ${inWindow(action.details.date, snapshot.today, snapshot.windowEnd) ? "" : "This date is outside the displayed 30-day window. "}No external calendar is connected.`);
      else if (action.type === "dismiss") announce("Suggestion dismissed. Your decision is saved to Orbit.");
      else if (action.type === "delete-live") announce("Live-data deletion queued. Refresh will be paused.");
      else if (action.type === "disconnect") announce("Disconnect queued. Imported data will be retained until expiry or deletion.");
      else announce(snapshot.mode === "live" ? "Aula refresh queued for the local worker. AI remains disabled." : "Synthetic refresh queued for the local worker.");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "The change could not be saved.");
      return false;
    } finally { mutating.current = false; setBusy(false); }
  };
  const setChild = (value: ChildFilter) => {
    updateChild(value);
    announce(`Showing ${value === "all" ? snapshot.mode === "live" ? "all children and household sources" : "both children" : snapshot.household[value]?.name ?? "the selected audience"}.`);
  };
  const selectedChild = child === "all" || snapshot.household[child] ? child : "all";
  return <OrganizerContext.Provider value={{ state: { ...snapshot, child: selectedChild, announcement }, busy, error: error || readError, setChild, mutate }}>{children}</OrganizerContext.Provider>;
}
export function useOrganizer() {
  const context = useContext(OrganizerContext);
  if (!context) throw new Error("Organizer components require OrganizerProvider.");
  return context;
}
