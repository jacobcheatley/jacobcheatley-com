import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Projects } from "./Projects";

vi.mock("@tanstack/react-router", () => import("@/test/router-stub"));

it("links the Sticky Notes Cover to its Project by name", () => {
  render(<Projects />);
  const link = screen.getByRole("link", { name: "Sticky Notes" });
  expect(link).toHaveAttribute("href", "/sticky-notes");
  expect(
    within(link).getAllByRole("img", { name: "sticky note" }).length,
  ).toBeGreaterThan(0);
});
