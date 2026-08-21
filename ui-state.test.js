import { describe, expect, it } from "vitest";
import {
  deriveChromeState,
  shouldShowSoloControls,
} from "./ui-state.js";

describe("shouldShowSoloControls", () => {
  it("hides solo deal／reset on room surface even before online seat", () => {
    expect(
      shouldShowSoloControls({ shellSurface: "room", online: false }),
    ).toBe(false);
  });

  it("hides solo controls once online on any surface", () => {
    expect(
      shouldShowSoloControls({ shellSurface: "solo", online: true }),
    ).toBe(false);
  });

  it("allows solo controls only for solo surface offline", () => {
    expect(
      shouldShowSoloControls({ shellSurface: "solo", online: false }),
    ).toBe(true);
  });
});

describe("deriveChromeState", () => {
  it("keeps solo ready chrome before deal", () => {
    expect(deriveChromeState({ mode: "solo", status: "ready" })).toEqual({
      layout: "setup",
      phase: "ready",
      showSetup: true,
      showRules: true,
    });
  });

  it("hides setup／rules while solo playing", () => {
    expect(deriveChromeState({ mode: "solo", status: "playing" })).toEqual({
      layout: "match",
      phase: "playing",
      showSetup: false,
      showRules: false,
    });
  });

  it("uses over layout after solo settle", () => {
    expect(deriveChromeState({ mode: "solo", status: "over" })).toEqual({
      layout: "over",
      phase: "over",
      showSetup: false,
      showRules: false,
    });
  });

  it("keeps online waiting／ready in setup", () => {
    for (const status of ["waiting", "ready"]) {
      expect(deriveChromeState({ mode: "online", status })).toMatchObject({
        layout: "setup",
        phase: status,
        showSetup: true,
        showRules: true,
      });
    }
  });

  it("hides setup during online active play", () => {
    expect(deriveChromeState({ mode: "online", status: "active" })).toEqual({
      layout: "match",
      phase: "active",
      showSetup: false,
      showRules: false,
    });
  });

  it("uses over layout when online match ends", () => {
    expect(deriveChromeState({ mode: "online", status: "ended" })).toEqual({
      layout: "over",
      phase: "ended",
      showSetup: false,
      showRules: false,
    });
  });
});
