import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "../pages/HomePage";
import { useThemeStore } from "../stores/themeStore";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Axon public product story", () => {
  it("explains the reviewed workflow and current pilot scope without unverified promises", () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The server task.The right machine.A clear handoff.");
    expect(screen.getByText("Example — no command is run")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Check staging application version" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Existing user\? Sign in/ })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /Explore the workflow/ })).toHaveAttribute("href", "#workflow");
    expect(document.body.textContent).not.toMatch(/tamper-proof|every server|exactly.once|curl|api\.axon\.run/i);
  });

  it("keeps the local walkthrough and outcome examples free of requests", () => {
    const request = vi.spyOn(globalThis, "fetch");
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "View review step" }));
    expect(screen.getByRole("region", { name: "Workflow explanation" })).toHaveTextContent("Review the command and exact machine.");
    expect(screen.getByRole("button", { name: "View review step" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "View task step" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Illustrative only. No request is sent and no command is run.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unknown" }));
    expect(screen.getByRole("button", { name: "Unknown" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Outcome unknown" })).toBeInTheDocument();
    expect(screen.getByText(/Check evidence and the server before considering another run/)).toBeInTheDocument();
    expect(screen.getByText("UNKNOWN · Check before considering another run")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Failure" }));
    expect(screen.getByRole("heading", { name: "Failure recorded" })).toBeInTheDocument();
    expect(screen.getByText("Nonzero exit · Result recorded")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the existing functional theme control and a keyboard skip link", () => {
    useThemeStore.setState({ theme: "dark" });
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });
});
