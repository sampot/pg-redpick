/** redpick.v1 — shared protocol constants (UI + functions.js). */

export const REDPICK_PROTOCOL_ID = "redpick.v1";
export const REDPICK_PROTOCOL_API_VERSION = "1";
/** Four distinct seats — host is booth host / seat 0. */
export const REDPICK_ROLES = ["host", "p2", "p3", "p4"];
export const REDPICK_ROLE_LIMITS = { host: 1, p2: 1, p3: 1, p4: 1 };
export const REDPICK_JOIN_POLICY = "invite_only";
export const REDPICK_STATE_KEY = "session:redpick:v1";
export const REDPICK_CATALOG_ID = "pg-redpick";
export const REDPICK_SOURCE = "sampot/pg-redpick";
export const REDPICK_SEAT_NAMES = ["主持", "席二", "席三", "席四"];

/** @param {string} role */
export function roleToSeat(role) {
  const i = REDPICK_ROLES.indexOf(role);
  return i >= 0 ? i : -1;
}

/** @param {number} seat */
export function seatToRole(seat) {
  return REDPICK_ROLES[seat] ?? null;
}

/** Full protocol object for invites / session meta. */
export function redpickProtocolSpec() {
  return {
    protocolId: REDPICK_PROTOCOL_ID,
    apiVersion: REDPICK_PROTOCOL_API_VERSION,
    roles: [...REDPICK_ROLES],
    roleLimits: { ...REDPICK_ROLE_LIMITS },
    joinPolicy: REDPICK_JOIN_POLICY,
    capabilities: ["deal", "play", "reset", "sync"],
    acts: [
      {
        type: "deal",
        roles: ["host"],
        payload: { note: "滿席後發牌開局" },
      },
      {
        type: "play",
        roles: [...REDPICK_ROLES],
        payload: { cardId: "number" },
      },
      {
        type: "reset",
        roles: ["host"],
        payload: { note: "終局後再來一局（需仍滿席）" },
      },
    ],
  };
}
