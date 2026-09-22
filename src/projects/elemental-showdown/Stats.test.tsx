import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Stats } from "./Stats";
import type { LockedStats } from "./showdown-stats";

// The route's only contribution is what the loader gated, so the tests hand
// that in.
vi.mock("@tanstack/react-router", () => import("@/test/router-stub"));

const locked = (counts: Partial<LockedStats> = {}): LockedStats => ({
  state: "locked",
  ownVoteCount: 17,
  everyVoteCount: 240,
  elementCount: 52,
  ...counts,
});

describe("the locked Stats", () => {
  it("shows both meters against the numbers that open them", () => {
    render(<Stats stats={locked()} />);

    expect(screen.getByText("your Votes: 17 of 20")).toBeInTheDocument();
    expect(
      screen.getByText("everyone’s Votes: 240 of 250"),
    ).toBeInTheDocument();
  });

  it("holds a met meter at its number rather than running past it", () => {
    render(<Stats stats={locked({ ownVoteCount: 23 })} />);

    expect(screen.getByText("your Votes: 20 of 20")).toBeInTheDocument();
  });

  it("says how many more Votes the Voter owes", () => {
    render(<Stats stats={locked({ ownVoteCount: 17 })} />);

    expect(
      screen.getByText("3 more from you and it opens."),
    ).toBeInTheDocument();
  });

  it("leaves it to the crowd once the Voter has done their part", () => {
    render(<Stats stats={locked({ ownVoteCount: 20 })} />);

    expect(
      screen.getByText(
        "You have done your part. It opens when the crowd catches up.",
      ),
    ).toBeInTheDocument();
  });

  it("sends the Voter back to the Matchups", () => {
    render(<Stats stats={locked()} />);

    expect(screen.getByRole("link", { name: "keep voting" })).toHaveAttribute(
      "href",
      "/elemental-showdown",
    );
  });

  it("asks for a friend while the crowd is the number that is short", () => {
    render(<Stats stats={locked({ everyVoteCount: 240 })} />);

    expect(
      screen.getByRole("button", { name: "bring a friend, fill the bar" }),
    ).toBeInTheDocument();
  });
});

describe("the Stats once they are open", () => {
  it("has no lock left to show", () => {
    render(<Stats stats={{ state: "unlocked" }} />);

    expect(screen.queryByText("the stats are locked")).toBeNull();
    expect(screen.queryByText(/of 250/)).toBeNull();
  });
});
