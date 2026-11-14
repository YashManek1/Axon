import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AxonBrand from "../components/brand/AxonBrand";

describe("AxonBrand", () => {
  it("links home and uses the canonical logo asset as a decorative crop", () => {
    render(<MemoryRouter><AxonBrand /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Axon home" })).toHaveAttribute("href", "/");
    const logo = document.querySelector('img[src="/axon-logo.png"]');
    expect(logo).toHaveAttribute("alt", "");
  });

  it("can present a static brand mark without adding navigation to an existing flow", () => {
    render(<MemoryRouter><AxonBrand linkTo={null} /></MemoryRouter>);

    expect(screen.queryByRole("link", { name: "Axon home" })).not.toBeInTheDocument();
    expect(screen.getByText("Axon")).toBeVisible();
  });
});
