/**
 * Host session domain for redpick.v1 (4 seats; fog of hands).
 * Durable KV-backed so canvas /api and shell-forwarded calls share state.
 */

import { RedpickGame } from "./game.js";
import {
  REDPICK_JOIN_POLICY,
  REDPICK_PROTOCOL_API_VERSION,
  REDPICK_PROTOCOL_ID,
  REDPICK_ROLE_LIMITS,
  REDPICK_ROLES,
  REDPICK_SEAT_NAMES,
  REDPICK_STATE_KEY,
  redpickProtocolSpec,
  roleToSeat,
} from "./protocol.js";

/**
 * @typedef {"waiting" | "ready" | "active" | "ended"} MatchStatus
 * @typedef {{ host: boolean, p2: boolean, p3: boolean, p4: boolean }} SeatedMap
 * @typedef {{
 *   sessionId: string | null;
 *   channelName: string | null;
 *   seq: number;
 *   status: MatchStatus;
 *   seated: SeatedMap;
 *   turn: number;
 *   hands: import("./game.js").Card[][];
 *   piles: import("./game.js").Card[][];
 *   bonuses: number[];
 *   streaks: number[];
 *   table: import("./game.js").Card[];
 *   stock: import("./game.js").Card[];
 *   scores: number[];
 *   winner: number | null;
 *   message: string;
 *   lastAct: unknown;
 *   names: string[];
 * }} RedpickStore
 */

function emptySeated() {
  return { host: false, p2: false, p3: false, p4: false };
}

/** @returns {RedpickStore} */
function emptyStore() {
  return {
    sessionId: null,
    channelName: null,
    seq: 0,
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
    names: [...REDPICK_SEAT_NAMES],
  };
}

function cloneCards(cards) {
  return (Array.isArray(cards) ? cards : []).map((c) => ({
    id: Number(c.id),
    rank: Number(c.rank),
    suit: Number(c.suit),
  }));
}

function seatedCount(seated) {
  let n = 0;
  for (const r of REDPICK_ROLES) {
    if (seated?.[r]) n += 1;
  }
  return n;
}

function allSeated(seated) {
  return seatedCount(seated) === REDPICK_ROLES.length;
}

/**
 * @param {unknown} raw
 * @returns {SeatedMap}
 */
function parseSeatedRoles(raw) {
  const out = emptySeated();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const r = String(item || "").trim();
    if (REDPICK_ROLES.includes(r)) out[r] = true;
  }
  return out;
}

/**
 * Derive seated map from presence body.
 * Prefer `seatedRoles`; else roles on `seats` (+ host when playerSeated).
 * @param {Record<string, unknown>} body
 * @returns {SeatedMap}
 */
function parseSeatedFromBody(body) {
  if (Array.isArray(body.seatedRoles) && body.seatedRoles.length > 0) {
    return parseSeatedRoles(body.seatedRoles);
  }
  if (Array.isArray(body.seats) && body.seats.length > 0) {
    const roles = body.seats.map((s) =>
      s && typeof s === "object" ? String(s.role || "").trim() : "",
    );
    const out = parseSeatedRoles(roles);
    if (body.playerSeated && !out.host) out.host = true;
    return out;
  }
  if (body.playerSeated) {
    return { ...emptySeated(), host: true };
  }
  return emptySeated();
}

/**
 * Overlay display names from seat rows onto the 4-seat name vector.
 * @param {string[]} current
 * @param {unknown} seats
 * @returns {string[]}
 */
function namesFromSeats(current, seats) {
  const names =
    Array.isArray(current) && current.length === 4
      ? current.map((n) => String(n || ""))
      : [...REDPICK_SEAT_NAMES];
  if (!Array.isArray(seats)) return names;
  for (const raw of seats) {
    if (!raw || typeof raw !== "object") continue;
    const role = String(raw.role || "").trim();
    const name = String(raw.displayName || raw.name || "").trim();
    const idx = REDPICK_ROLES.indexOf(role);
    if (idx >= 0 && name) names[idx] = name;
  }
  return names;
}

async function loadStore(env) {
  const raw = await env.KV.get(REDPICK_STATE_KEY, "text");
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw);
    const seated = {
      ...emptySeated(),
      ...(parsed.seated && typeof parsed.seated === "object"
        ? parsed.seated
        : {}),
    };
    return {
      sessionId: parsed.sessionId || null,
      channelName: parsed.channelName || null,
      seq: Number(parsed.seq) || 0,
      status: ["waiting", "ready", "active", "ended"].includes(parsed.status)
        ? parsed.status
        : "waiting",
      seated,
      turn: Number.isInteger(parsed.turn) ? parsed.turn % 4 : 0,
      hands: Array.isArray(parsed.hands)
        ? parsed.hands.map(cloneCards)
        : [[], [], [], []],
      piles: Array.isArray(parsed.piles)
        ? parsed.piles.map(cloneCards)
        : [[], [], [], []],
      bonuses: Array.isArray(parsed.bonuses)
        ? parsed.bonuses.map(Number)
        : [0, 0, 0, 0],
      streaks: Array.isArray(parsed.streaks)
        ? parsed.streaks.map(Number)
        : [0, 0, 0, 0],
      table: cloneCards(parsed.table),
      stock: cloneCards(parsed.stock),
      scores: Array.isArray(parsed.scores)
        ? parsed.scores.map(Number)
        : [0, 0, 0, 0],
      winner:
        parsed.winner === 0 ||
        parsed.winner === 1 ||
        parsed.winner === 2 ||
        parsed.winner === 3
          ? parsed.winner
          : null,
      message: String(parsed.message || ""),
      lastAct: parsed.lastAct ?? null,
      names: (() => {
        const base = [...REDPICK_SEAT_NAMES];
        if (!Array.isArray(parsed.names)) return base;
        for (let i = 0; i < 4; i++) {
          const n = String(parsed.names[i] || "").trim();
          if (n) base[i] = n;
        }
        return base;
      })(),
    };
  } catch {
    return emptyStore();
  }
}

async function saveStore(env, store) {
  await env.KV.put(REDPICK_STATE_KEY, JSON.stringify(store));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function err(code, error, status = 400) {
  return json({ error, code }, status);
}

/**
 * Public + optional private hand for viewerRole.
 * Spectator／unknown role → table＋counts only（never any seat's hand）.
 * @param {RedpickStore} store
 * @param {string | null | undefined} viewerRole
 */
function viewForRole(store, viewerRole) {
  const handCounts = [0, 1, 2, 3].map((i) => store.hands[i]?.length ?? 0);
  const base = {
    protocolId: REDPICK_PROTOCOL_ID,
    apiVersion: REDPICK_PROTOCOL_API_VERSION,
    sessionId: store.sessionId,
    channelName: store.channelName,
    seq: store.seq,
    status: store.status,
    seated: { ...store.seated },
    seatedCount: seatedCount(store.seated),
    turn: store.turn,
    table: cloneCards(store.table),
    stockCount: store.stock.length,
    handCounts,
    piles: store.piles.map(cloneCards),
    bonuses: store.bonuses.slice(),
    streaks: store.streaks.slice(),
    scores:
      store.status === "ended"
        ? store.scores.slice()
        : [0, 1, 2, 3].map(
            (s) =>
              (store.piles[s] || []).reduce((n, c) => {
                /* live score approx via piles+bonuses — UI may recompute */
                return n;
              }, 0) + (store.bonuses[s] || 0),
          ),
    liveScores: liveScoresFromStore(store),
    winner: store.winner,
    message: store.message,
    lastAct: store.lastAct,
    names: Array.isArray(store.names) && store.names.length === 4
      ? store.names.slice()
      : [...REDPICK_SEAT_NAMES],
    roles: [...REDPICK_ROLES],
  };

  // Prefer liveScores for UI
  base.scores =
    store.status === "ended" ? store.scores.slice() : base.liveScores;

  const role = typeof viewerRole === "string" ? viewerRole.trim() : "";
  if (role === "spectator") {
    return {
      ...base,
      role: "spectator",
      seat: -1,
      hand: [],
    };
  }

  const seat = role ? roleToSeat(role) : -1;
  if (seat >= 0) {
    return {
      ...base,
      role,
      seat,
      hand: cloneCards(store.hands[seat] || []),
    };
  }
  return base;
}

function liveScoresFromStore(store) {
  return [0, 1, 2, 3].map((s) => {
    const pile = store.piles[s] || [];
    let pts = 0;
    for (const c of pile) {
      if (c.suit !== 0 && c.suit !== 2) continue;
      if (c.rank === 0) pts += 20;
      else if (c.rank >= 9) pts += 10;
      else pts += c.rank + 1;
    }
    return pts + (store.bonuses[s] || 0);
  });
}

/** @param {RedpickStore} store */
function gameFromStore(store) {
  const game = new RedpickGame();
  game.names =
    Array.isArray(store.names) && store.names.length === 4
      ? store.names.slice()
      : [...REDPICK_SEAT_NAMES];
  game.hands = store.hands.map(cloneCards);
  game.piles = store.piles.map(cloneCards);
  game.bonuses = store.bonuses.slice();
  game.streaks = store.streaks.slice();
  game.table = cloneCards(store.table);
  game.stock = cloneCards(store.stock);
  game.turn = store.turn;
  game.status =
    store.status === "active"
      ? "playing"
      : store.status === "ended"
        ? "over"
        : "ready";
  game.winner = store.winner;
  game.scores = store.scores.slice();
  game.message = store.message;
  game.lastAct = store.lastAct;
  return game;
}

/** @param {RedpickStore} store @param {RedpickGame} game */
function applyGameToStore(store, game) {
  store.hands = game.hands.map(cloneCards);
  store.piles = game.piles.map(cloneCards);
  store.bonuses = game.bonuses.slice();
  store.streaks = game.streaks.slice();
  store.table = cloneCards(game.table);
  store.stock = cloneCards(game.stock);
  store.turn = game.turn;
  store.message = game.message;
  store.lastAct = game.lastAct
    ? {
        seat: game.lastAct.seat,
        played: game.lastAct.played,
        captured: game.lastAct.captured,
        placed: game.lastAct.placed,
        result: game.lastAct.result,
      }
    : null;
  if (game.status === "over") {
    store.status = "ended";
    store.winner = game.winner;
    store.scores = game.scores.slice();
  } else if (game.status === "playing") {
    store.status = "active";
    store.scores = game.liveScores();
  }
}

function hostUnavailable() {
  return err("host_unavailable", "此環境未提供 env.HOST（無法邀請對弈）", 503);
}

function mapHostError(e) {
  const code =
    e && typeof e === "object" && "code" in e
      ? String(e.code)
      : /not_provisioned|通行證|登入/i.test(String(e?.message || e))
        ? "not_provisioned"
        : "error";
  const status =
    code === "not_provisioned"
      ? 401
      : code === "host_unavailable" || code === "session_inactive"
        ? code === "session_inactive"
          ? 409
          : 503
        : 400;
  return err(code, e?.message || String(e), status);
}

async function handleOnlineHostApi(request, env, path, method) {
  const HOST = env?.HOST;
  if (!HOST) return hostUnavailable();

  try {
    if (path.endsWith("/api/online/open") && method === "POST") {
      const opened = await HOST.openSession();
      return json({
        ok: true,
        sessionId: opened.sessionId,
        channelName: opened.channelName,
        protocolId: opened.protocolId,
        apiVersion: opened.apiVersion,
        roles: opened.roles,
      });
    }

    if (path.endsWith("/api/online/close") && method === "POST") {
      await HOST.closeSession();
      await saveStore(env, emptyStore());
      return json({ ok: true });
    }

    if (path.endsWith("/api/online/status") && method === "GET") {
      const session = await HOST.getSession();
      const seats = (await HOST.listSeats()) || [];
      if (!session) {
        return json({ active: false, seats: [] });
      }
      return json({
        active: true,
        status: session.status || "open",
        sessionId: session.sessionId,
        channelName: session.channelName,
        protocolId: session.protocolId,
        apiVersion: session.apiVersion,
        roles: session.roles,
        seats,
      });
    }

    if (path.endsWith("/api/online/domain") && method === "POST") {
      const body = (await request.json().catch(() => null)) || {};
      const domainPath = String(body.path || "");
      if (!domainPath.includes("/api/session/")) {
        return err("forbidden", "僅允許轉發 /api/session/*", 403);
      }
      const result = await HOST.hostSessionFetch(domainPath, {
        method: body.method || "GET",
        headers: body.headers,
        body: body.body,
      });
      return json(result);
    }

    if (path.endsWith("/api/online/invite") && method === "POST") {
      const body = (await request.json().catch(() => ({}))) || {};
      const created = await HOST.createPlatformInvite({
        kind: body.kind,
        intent: body.intent,
        ttlMs: body.ttlMs,
        targetField: body.targetField,
      });
      return json(created);
    }

    if (path.endsWith("/api/online/invite/revoke") && method === "POST") {
      const body = (await request.json().catch(() => ({}))) || {};
      const inviteId = String(body.inviteId || "").trim();
      if (!inviteId) return err("bad_args", "缺少 inviteId", 400);
      await HOST.revokePlatformInvite({ inviteId });
      return json({ ok: true });
    }

    return null;
  } catch (e) {
    return mapHostError(e);
  }
}

/**
 * Resolve viewer role from query, JSON body, or SESSION seat.
 * @param {Request} request
 * @param {URL} url
 * @param {object} env
 */
async function resolveViewerRole(request, url, env) {
  const q = String(url.searchParams.get("role") || "").trim();
  if (q === "spectator") return "spectator";
  if (q && REDPICK_ROLES.includes(q)) return q;
  if (env?.SESSION) {
    try {
      const seat = await env.SESSION.getSeat();
      const r = String(seat?.role || "").trim();
      if (r === "spectator") return "spectator";
      if (REDPICK_ROLES.includes(r)) return r;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    if (path.includes("/api/online/")) {
      const onlineRes = await handleOnlineHostApi(request, env, path, method);
      if (onlineRes) return onlineRes;
    }

    if (env?.SESSION) {
      const isProbe =
        request.method === "GET" &&
        (path.endsWith("/api/session/seat") ||
          path.endsWith("/api/session/channel") ||
          path.endsWith("/api/session/state"));
      try {
        const SESSION = env.SESSION;
        if (path.endsWith("/api/session/seat") && request.method === "GET") {
          return json(await SESSION.getSeat());
        }
        if (path.endsWith("/api/session/channel") && request.method === "GET") {
          return json(await SESSION.getEventChannel());
        }
        if (path.endsWith("/api/session/state") && request.method === "GET") {
          // Prefer tunnel state; fog locally if shell returns raw store fields.
          const raw = await SESSION.getState();
          if (raw && typeof raw === "object" && Array.isArray(raw.hands)) {
            const role = await resolveViewerRole(request, url, env);
            return json(viewForRole(/** @type {RedpickStore} */ (raw), role));
          }
          return json(raw);
        }
        if (path.endsWith("/api/session/act") && request.method === "POST") {
          const body = await request.json();
          return json(await SESSION.act(body));
        }
        if (path.endsWith("/api/session/leave") && request.method === "POST") {
          return json(await SESSION.leave());
        }
        if (path.endsWith("/api/session/meta") && request.method === "GET") {
          return json({
            protocolId: REDPICK_PROTOCOL_ID,
            apiVersion: REDPICK_PROTOCOL_API_VERSION,
            roles: [...REDPICK_ROLES],
          });
        }
      } catch (e) {
        if (e?.code === "session_inactive" && isProbe) {
          return json({
            ready: false,
            code: "session_inactive",
            error: e?.message || "未入座",
          });
        }
        const status = e?.code === "session_inactive" ? 409 : 400;
        return err(e?.code || "error", e?.message || String(e), status);
      }
    }

    if (path.endsWith("/api/session/meta") && request.method === "GET") {
      const spec = redpickProtocolSpec();
      return json({
        protocolId: spec.protocolId,
        apiVersion: spec.apiVersion,
        roles: spec.roles,
        roleLimits: spec.roleLimits,
        joinPolicy: REDPICK_JOIN_POLICY,
        capabilities: spec.capabilities,
      });
    }

    if (path.endsWith("/api/session/open") && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) || {};
      const store = emptyStore();
      store.sessionId = String(body.sessionId || "");
      store.channelName = String(body.channelName || "");
      store.status = "waiting";
      await saveStore(env, store);
      return json({
        ok: true,
        sessionId: store.sessionId,
        channelName: store.channelName,
      });
    }

    if (path.endsWith("/api/session/state") && request.method === "GET") {
      const store = await loadStore(env);
      const role = await resolveViewerRole(request, url, env);
      return json(viewForRole(store, role));
    }

    if (path.endsWith("/api/session/presence") && request.method === "POST") {
      const store = await loadStore(env);
      if (!store.sessionId) {
        return err("session_inactive", "通道尚未開啟", 409);
      }
      const body = (await request.json().catch(() => null)) || {};
      const nextSeated = parseSeatedFromBody(body);
      const nextCount = seatedCount(nextSeated);
      const wasFull = allSeated(store.seated);
      store.names = namesFromSeats(store.names, body.seats);

      if (
        !allSeated(nextSeated) &&
        store.sessionId &&
        (store.status === "ready" ||
          store.status === "active" ||
          store.status === "ended") &&
        wasFull
      ) {
        const seq = store.seq + 1;
        const channelName = store.channelName;
        const closeReason =
          String(body.reason || "").trim() === "host_closed"
            ? "host_closed"
            : "opponent_left";
        await saveStore(env, emptyStore());
        const event = {
          type: "session.closed",
          reason: closeReason,
          seq,
        };
        return json({
          ok: true,
          events: [event],
          state: viewForRole(emptyStore(), null),
          seq,
          sessionId: null,
          channelName,
        });
      }

      // Leaving while waiting (not yet full) — just update seated map
      if (
        nextCount < seatedCount(store.seated) &&
        (store.status === "active" || store.status === "ended")
      ) {
        const seq = store.seq + 1;
        const channelName = store.channelName;
        await saveStore(env, emptyStore());
        return json({
          ok: true,
          events: [
            { type: "session.closed", reason: "opponent_left", seq },
          ],
          state: viewForRole(emptyStore(), null),
          seq,
          sessionId: null,
          channelName,
        });
      }

      store.seated = nextSeated;
      if (allSeated(store.seated) && store.status === "waiting") {
        store.status = "ready";
      } else if (!allSeated(store.seated) && store.status === "ready") {
        store.status = "waiting";
      }
      store.seq += 1;
      await saveStore(env, store);
      const event = {
        type: "match.status",
        status: store.status,
        seatedCount: seatedCount(store.seated),
        seated: { ...store.seated },
        seq: store.seq,
      };
      return json({
        ok: true,
        events: [event],
        state: viewForRole(store, null),
        seq: store.seq,
        sessionId: store.sessionId,
        channelName: store.channelName,
      });
    }

    if (path.endsWith("/api/session/act") && request.method === "POST") {
      const store = await loadStore(env);
      if (!store.sessionId) {
        return err("session_inactive", "通道尚未開啟（請先開局）", 409);
      }
      const body = (await request.json().catch(() => null)) || {};
      const role = String(body.role || "");
      const isSpectator = role === "spectator";
      if (!REDPICK_ROLES.includes(role) && !isSpectator) {
        return err("role_forbidden", "role 不允許");
      }
      const payload =
        body.payload && typeof body.payload === "object" ? body.payload : {};
      const type = String(payload.type || body.type || "").trim();

      if (isSpectator && type !== "sync") {
        return err("role_forbidden", "觀戰只能同步明面狀態");
      }

      if (type === "deal") {
        if (role !== "host") {
          return err("role_forbidden", "僅主持可發牌");
        }
        if (store.status !== "ready" && store.status !== "ended") {
          return err(
            "act_rejected",
            store.status === "waiting"
              ? "尚未滿席，無法發牌"
              : store.status === "active"
                ? "對局進行中"
                : "目前無法發牌",
          );
        }
        if (!allSeated(store.seated)) {
          return err("act_rejected", "尚未滿席，無法發牌");
        }
        const game = new RedpickGame();
        game.names =
          Array.isArray(store.names) && store.names.length === 4
            ? store.names.slice()
            : [...REDPICK_SEAT_NAMES];
        game.deal();
        applyGameToStore(store, game);
        store.status = "active";
        store.seq += 1;
        await saveStore(env, store);
        const event = {
          type: "match.dealt",
          status: store.status,
          turn: store.turn,
          handCounts: [5, 5, 5, 5],
          stockCount: store.stock.length,
          table: cloneCards(store.table),
          liveScores: liveScoresFromStore(store),
          streaks: store.streaks.slice(),
          message: store.message,
          seq: store.seq,
        };
        return json({
          ok: true,
          events: [event],
          state: viewForRole(store, role),
          seq: store.seq,
          sessionId: store.sessionId,
          channelName: store.channelName,
        });
      }

      if (type === "reset") {
        if (role !== "host") {
          return err("role_forbidden", "僅主持可再來一局");
        }
        if (store.status !== "ended") {
          return err("act_rejected", "僅在終局後可再來一局");
        }
        store.hands = [[], [], [], []];
        store.piles = [[], [], [], []];
        store.bonuses = [0, 0, 0, 0];
        store.streaks = [0, 0, 0, 0];
        store.table = [];
        store.stock = [];
        store.turn = 0;
        store.winner = null;
        store.scores = [0, 0, 0, 0];
        store.lastAct = null;
        store.message = allSeated(store.seated)
          ? "可發牌再開一局"
          : "等候入座";
        store.status = allSeated(store.seated) ? "ready" : "waiting";
        store.seq += 1;
        await saveStore(env, store);
        return json({
          ok: true,
          events: [
            {
              type: "match.reset",
              status: store.status,
              seq: store.seq,
            },
          ],
          state: viewForRole(store, role),
          seq: store.seq,
          sessionId: store.sessionId,
          channelName: store.channelName,
        });
      }

      if (type === "play") {
        if (store.status !== "active") {
          return err("act_rejected", "尚未開始或已結束，無法出牌");
        }
        const seat = roleToSeat(role);
        if (seat < 0) return err("role_forbidden", "role 不允許出牌");
        if (seat !== store.turn) {
          return err("act_rejected", "尚未輪到你");
        }
        const cardId = Number(payload.cardId);
        if (!Number.isInteger(cardId)) {
          return err("act_rejected", "牌無效");
        }
        const game = gameFromStore(store);
        const result = game.play(seat, cardId);
        if (!result.ok) {
          return err("act_rejected", result.reason || "無法出牌");
        }
        applyGameToStore(store, game);
        store.seq += 1;
        await saveStore(env, store);
        const event = {
          type: "match.played",
          seat,
          cardId,
          status: store.status,
          turn: store.turn,
          winner: store.winner,
          over: Boolean(result.over),
          captured: Boolean(result.captured),
          points: result.points || 0,
          table: cloneCards(store.table),
          handCounts: [0, 1, 2, 3].map((i) => store.hands[i]?.length ?? 0),
          stockCount: store.stock.length,
          liveScores: liveScoresFromStore(store),
          streaks: store.streaks.slice(),
          message: store.message,
          seq: store.seq,
        };
        return json({
          ok: true,
          events: [
            event,
            ...(result.over
              ? [
                  {
                    type: "match.over",
                    winner: store.winner,
                    scores: store.scores.slice(),
                    liveScores: store.scores.slice(),
                    message: store.message,
                    seq: store.seq,
                  },
                ]
              : []),
          ],
          state: viewForRole(store, role),
          seq: store.seq,
          sessionId: store.sessionId,
          channelName: store.channelName,
        });
      }

      if (type === "sync") {
        // Guest tunnel has no real getState — sync returns fogged snapshot.
        if (store.status === "waiting" && !store.sessionId) {
          return err("session_inactive", "通道尚未開啟", 409);
        }
        return json({
          ok: true,
          events: [],
          state: viewForRole(store, role),
          seq: store.seq,
          sessionId: store.sessionId,
          channelName: store.channelName,
        });
      }

      return err("act_rejected", "未知 act（需要 deal、play、reset 或 sync）");
    }

    return json({
      ok: true,
      name: "pg-redpick",
      path,
      roles: REDPICK_ROLES,
      roleLimits: REDPICK_ROLE_LIMITS,
    });
  },
};
