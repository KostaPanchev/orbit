import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditSuggestion } from "@/components/demo-views";
import { suggestions } from "@/demo/fixtures";
import { DemoProvider, useDemo } from "@/demo/provider";

function StateProbe() {
  const { state } = useDemo();
  return <output aria-label="Agenda state">{JSON.stringify(state.agenda)}</output>;
}

function renderEditor(id: string) {
  const suggestion = suggestions.find((item) => item.id === id);
  if (!suggestion) throw new Error(`Missing fixture ${id}`);
  const onClose = vi.fn();
  render(<DemoProvider><EditSuggestion suggestion={suggestion} onClose={onClose} /><StateProbe /></DemoProvider>);
  return onClose;
}

describe("review editor", () => {
  it("keeps an unspecified time empty and saves the user's title", async () => {
    const user = userEvent.setup();
    const onClose = renderEditor("trip");
    expect(screen.getByLabelText("Time (optional)")).toHaveValue("");
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Nature trip - packed lunch");
    await user.click(screen.getByRole("button", { name: "Approve & add to demo" }));
    expect(screen.getByLabelText("Agenda state")).toHaveTextContent("Nature trip - packed lunch");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("requires a confirmed date and separate confirmation for unresolved sources", async () => {
    const user = userEvent.setup();
    const onClose = renderEditor("gathering");
    const date = screen.getByLabelText("Confirmed date");
    expect(date).toBeRequired();
    expect(date).toHaveValue("");
    expect(screen.getByRole("checkbox")).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Approve & add to demo" }));
    expect(onClose).not.toHaveBeenCalled();
    await user.type(date, "2026-11-20");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Approve & add to demo" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reports a whitespace-only title instead of silently adding an invalid item", async () => {
    const user = userEvent.setup();
    const onClose = renderEditor("trip");
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "   ");
    await user.click(screen.getByRole("button", { name: "Approve & add to demo" }));
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
});
