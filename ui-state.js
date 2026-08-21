/**
 * Map gameplay／online status → page chrome phases (§3.6).
 * Setup＝hero／開局控件／規則；match／over＝牌桌優先。
 */

/**
 * Solo「開局／重來」僅單機且非包廂面。
 * `room` 面在尚未入座時也不可露單機控件（§8.4）。
 * @param {{ shellSurface: string, online: boolean }} opts
 */
export function shouldShowSoloControls({ shellSurface, online }) {
  if (shellSurface === "room" || online) return false;
  return true;
}

/**
 * @param {{
 *   mode: "solo" | "online",
 *   status: string,
 * }} opts
 */
export function deriveChromeState({ mode, status }) {
  if (mode === "online") {
    if (status === "active") {
      return {
        layout: "match",
        phase: "active",
        showSetup: false,
        showRules: false,
      };
    }
    if (status === "ended") {
      return {
        layout: "over",
        phase: "ended",
        showSetup: false,
        showRules: false,
      };
    }
    return {
      layout: "setup",
      phase: status || "waiting",
      showSetup: true,
      showRules: true,
    };
  }

  if (status === "playing") {
    return {
      layout: "match",
      phase: "playing",
      showSetup: false,
      showRules: false,
    };
  }
  if (status === "over") {
    return {
      layout: "over",
      phase: "over",
      showSetup: false,
      showRules: false,
    };
  }
  return {
    layout: "setup",
    phase: "ready",
    showSetup: true,
    showRules: true,
  };
}
