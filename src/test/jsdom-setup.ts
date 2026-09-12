import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Globals are off, so React Testing Library's auto-cleanup never registers;
// unmount between tests ourselves.
afterEach(cleanup);
