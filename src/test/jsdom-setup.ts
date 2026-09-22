import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Globals are off, so React Testing Library's auto-cleanup never registers;
// unmount between tests ourselves.
afterEach(cleanup);

// jsdom lays nothing out and so implements no scrolling; a component that
// moves the viewport is asserted on by what it renders, not where it sits.
Element.prototype.scrollIntoView = () => {};

// It implements no pointer capture either; a drag test sends the moves that
// follow a press to the element that took the pointer itself.
Element.prototype.setPointerCapture = () => {};
