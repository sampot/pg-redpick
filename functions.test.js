/**
 * redpick.v1 session domain — 4 seats, fog of hands, full-table presence.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./functions.js";
import {
  REDPICK_PROTOCOL_ID,
  REDPICK_ROLES,
  REDPICK_STATE_KEY,
} from "./protocol.js";

function jsonRequest(path, { method = "GET", body } = {}) {
  return new Request(`https://sandbox.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

function mockKv(initial = {}) {
  const store = { ...initial };
  return {
    async get(key) {
      return store[key] ?? null;
    },
    async put(key, value) {
      store[key] = value;
    },
    _store: store,
  };
}

function emptySeated() {
  return { host: false, p2: false, p3: false, p4: false };
}

async function seedOpen(KV, extras = {}) {
  await KV.put(
    REDPICK_STATE_KEY,
    JSON.stringify({
      sessionId: "sess-1",
      channelName: "playgrounds-session:sess-1",
      seq: 1,
      status: "waiting",
      seated: emptySeated(),
      turn: 0,
      hands: [[], [], [], []],
      piles: [[], [], [], []],
      bonuses: [0, 0, 0, 0],
      streaks: [0, 0, 0, 0],
      table: [],
      stock: [],
      scores: [0, 0, 0, 0],
      winner: null,
      message: "",
      lastAct: null,
      ...extras,
    }),
  );
}

describe("functions.js meta + open", () => {
  it("GET /api/session/meta returns redpick.v1 four roles", async () => {
    const res = await handler.fetch(jsonRequest("/api/session/meta"), {
      KV: mockKv(),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.protocolId).toBe(REDPICK_PROTOCOL_ID);
    expect(data.roles).toEqual([...REDPICK_ROLES]);
  });

  it("POST /api/session/open seeds waiting store", async () => {
    const KV = mockKv();
    const res = await handler.fetch(
      jsonRequest("/api/session/open", {
        method: "POST",
        body: { sessionId: "sess-1", channelName: "ch-1" },
      }),
      { KV },
    );
    expect(res.status).toBe(200);
    const stored = JSON.parse(await KV.get(REDPICK_STATE_KEY));
    expect(stored.sessionId).toBe("sess-1");
    expect(stored.status).toBe("waiting");
  });
});

describe("functions.js presence (4 seats)", () => {
  /** @type {ReturnType<typeof mockKv>} */
  let KV;

  beforeEach(() => {
    KV = mockKv();
  });

  it("becomes ready only when all four roles are seated", async () => {
    await seedOpen(KV);
    let res = await handler.fetch(
      jsonRequest("/api/session/presence", {
        method: "POST",
        body: { seatedRoles: ["host", "p2", "p3"] },
      }),
      { KV },
    );
    let data = await res.json();
    expect(data.state.status).toBe("waiting");

    res = await handler.fetch(
      jsonRequest("/api/session/presence", {
        method: "POST",
        body: { seatedRoles: ["host", "p2", "p3", "p4"] },
      }),
      { KV },
    );
    data = await res.json();
    expect(data.state.status).toBe("ready");
    expect(data.state.seatedCount).toBe(4);
  });

  it("closes the session when a seat leaves mid-game", async () => {
    await seedOpen(KV, {
      status: "active",
      seated: { host: true, p2: true, p3: true, p4: true },
      seq: 5,
    });
    const res = await handler.fetch(
      jsonRequest("/api/session/presence", {
        method: "POST",
        body: { seatedRoles: ["host", "p2", "p3"] },
      }),
      { KV },
    );
    const data = await res.json();
    expect(data.events[0]).toMatchObject({
      type: "session.closed",
      reason: "opponent_left",
    });
    expect(data.state.sessionId).toBeFalsy();
  });
});

describe("functions.js deal / play / fog", () => {
  /** @type {ReturnType<typeof mockKv>} */
  let KV;

  beforeEach(async () => {
    KV = mockKv();
    await seedOpen(KV, {
      status: "ready",
      seated: { host: true, p2: true, p3: true, p4: true },
    });
  });

  it("rejects deal when not ready", async () => {
    await seedOpen(KV, { status: "waiting" });
    const res = await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "host", payload: { type: "deal" } },
      }),
      { KV },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("act_rejected");
  });

  it("host deal deals 5 each + 4 table; fog hides other hands", async () => {
    const res = await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "host", payload: { type: "deal" } },
      }),
      { KV },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events[0].type).toBe("match.dealt");
    expect(data.state.status).toBe("active");
    expect(data.state.handCounts).toEqual([5, 5, 5, 5]);
    expect(data.state.table).toHaveLength(4);
    expect(data.state.stockCount).toBe(52 - 20 - 4);
    // Host view in act response uses role from body → host sees own hand only
    expect(data.state.hand).toHaveLength(5);
    expect(data.state.hands).toBeUndefined();
    expect(data.state.stock).toBeUndefined();

    const guestView = await handler.fetch(
      jsonRequest("/api/session/state?role=p2"),
      { KV },
    );
    const g = await guestView.json();
    expect(g.hand).toHaveLength(5);
    expect(g.hand.some((c) => data.state.hand.some((h) => h.id === c.id))).toBe(
      false,
    );
    expect(g.stock).toBeUndefined();
  });

  it("rejects play out of turn", async () => {
    await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "host", payload: { type: "deal" } },
      }),
      { KV },
    );
    const stored = JSON.parse(await KV.get(REDPICK_STATE_KEY));
    const p2Card = stored.hands[1][0].id;
    const res = await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "p2", payload: { type: "play", cardId: p2Card } },
      }),
      { KV },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/輪到/);
  });

  it("accepts host play on turn 0", async () => {
    await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "host", payload: { type: "deal" } },
      }),
      { KV },
    );
    const stored = JSON.parse(await KV.get(REDPICK_STATE_KEY));
    const cardId = stored.hands[0][0].id;
    const res = await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "host", payload: { type: "play", cardId } },
      }),
      { KV },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events[0].type).toBe("match.played");
    expect(data.state.turn).toBe(1);
  });

  it("sync returns fogged hand for the caller role", async () => {
    await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "host", payload: { type: "deal" } },
      }),
      { KV },
    );
    const res = await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "p3", payload: { type: "sync" } },
      }),
      { KV },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.state.seat).toBe(2);
    expect(data.state.hand).toHaveLength(5);
    expect(data.state.stock).toBeUndefined();
  });
});

describe("functions.js Guest env.SESSION path", () => {
  it("GET /api/session/seat uses SESSION when present", async () => {
    const SESSION = {
      getSeat: vi.fn(async () => ({ ready: true, role: "p2", seatId: "s1" })),
    };
    const res = await handler.fetch(jsonRequest("/api/session/seat"), {
      SESSION,
      KV: mockKv(),
    });
    expect(res.status).toBe(200);
    expect(SESSION.getSeat).toHaveBeenCalled();
    const data = await res.json();
    expect(data.role).toBe("p2");
  });
});

describe("functions.js Host UI online routes", () => {
  it("POST /api/online/open calls HOST.openSession", async () => {
    const HOST = {
      openSession: vi.fn(async () => ({
        sessionId: "sess-1",
        channelName: "ch-1",
        protocolId: REDPICK_PROTOCOL_ID,
        apiVersion: "1",
        roles: [...REDPICK_ROLES],
      })),
    };
    const res = await handler.fetch(
      jsonRequest("/api/online/open", { method: "POST" }),
      { HOST, KV: mockKv() },
    );
    expect(res.status).toBe(200);
    expect(HOST.openSession).toHaveBeenCalled();
  });
});
