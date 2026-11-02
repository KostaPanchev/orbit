import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditSuggestion } from "@/components/demo-views";
import { initialAgenda, suggestions } from "@/demo/fixtures";
import { OrganizerProvider, useOrganizer } from "@/components/organizer-provider";
import { children, DEMO_DATE, WINDOW_END, mutationSchema, type Snapshot } from "@/domain/model";

afterEach(() => vi.unstubAllGlobals());

function StateProbe() {
  const { state } = useOrganizer();
  return <output aria-label="Agenda state">{JSON.stringify(state.agenda)}</output>;
}

function renderEditor(id: string) {
  const fixture = suggestions.find((item) => item.id === id);
  if (!fixture) throw new Error(`Missing fixture ${id}`);
  const suggestion = { ...fixture, revision: "v1", sourceKey: fixture.source.id, editedFields: [] };
  const snapshot: Snapshot = {
    mode: "synthetic", household: children, today: DEMO_DATE, windowEnd: WINDOW_END, previews: [], connected: false, paused: false,
    dataset: "synthetic-ui", scenario: "normal", agenda: initialAgenda, suggestions: [suggestion],
    brief: [], decisions: {}, lastSuccess: null, briefAt: null, coverage: [],
    syncError: null, job: null, workerOnline: true, stale: false,
  };
  vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => {
    const action = mutationSchema.parse(JSON.parse(String(init.body)));
    if (action.type !== "approve") throw new Error("Unexpected UI mutation");
    return Response.json({
      ...snapshot,
      agenda: [...snapshot.agenda, { ...action.details, id: "approved-trip", child: suggestion.child, source: suggestion.source, origin: "Approved suggestion" }],
      decisions: { [suggestion.id]: "approved" },
    });
  }));
  const onClose = vi.fn();
  render(<OrganizerProvider initialState={snapshot}><EditSuggestion suggestion={suggestion} onClose={onClose} /><StateProbe /></OrganizerProvider>);
  return onClose;
}

describe("review editor", () => {
  it("keeps an unspecified time empty and saves the user's title", async () => {
    const user = userEvent.setup();
    const onClose = renderEditor("trip");
    expect(screen.getByLabelText("Time (optional)")).toHaveValue("");
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Nature trip - packed lunch");
    await user.click(screen.getByRole("button", { name: "Approve & save to Orbit" }));
    await waitFor(() => expect(screen.getByLabelText("Agenda state")).toHaveTextContent("Nature trip - packed lunch"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("requires a confirmed date and separate confirmation for unresolved sources", async () => {
    const user = userEvent.setup();
    const onClose = renderEditor("gathering");
    const date = screen.getByLabelText("Confirmed date");
    expect(date).toBeRequired();
    expect(date).toHaveValue("");
    expect(screen.getByRole("checkbox")).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Approve & save to Orbit" }));
    expect(onClose).not.toHaveBeenCalled();
    await user.type(date, "2026-11-20");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Approve & save to Orbit" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("reports a whitespace-only title instead of silently adding an invalid item", async () => {
    const user = userEvent.setup();
    const onClose = renderEditor("trip");
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "   ");
    await user.click(screen.getByRole("button", { name: "Approve & save to Orbit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a title");
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels without adding an agenda item", async () => {
    const user = userEvent.setup();
    const onClose = renderEditor("trip");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Agenda state")).not.toHaveTextContent("approved-trip");
  });

  it("keeps the editor open with entered values when a stale revision is rejected", async () => {
    const user = userEvent.setup();
    const onClose = renderEditor("trip");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "This suggestion has changed. Reload the latest evidence." }, { status: 409 })));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Keep this edit");
    await user.click(screen.getByRole("button", { name: "Approve & save to Orbit" }));
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent("suggestion has changed");
    expect(screen.getByLabelText("Title")).toHaveValue("Keep this edit");
    expect(onClose).not.toHaveBeenCalled();
  });
});
