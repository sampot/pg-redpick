import { chooseAiCard } from "./ai.js";
import { RedpickAudio } from "./audio.js";
import {
  RedpickGame,
  cardLabel,
  cardPoints,
  isRed,
  previewCapture,
  RANKS,
  SUITS,
} from "./game.js";
import {
  planLifecycleResume,
  planLifecycleSuspend,
} from "./lifecycle.js";
import {
  REDPICK_ROLES,
  REDPICK_SEAT_NAMES,
  roleToSeat,
} from "./protocol.js";
import { readPgSurface } from "./shellSurface.js";
import {
  deriveChromeState,
  shouldShowSoloControls,
} from "./ui-state.js";

const shellSurface = readPgSurface();
document.body.dataset.pgSurface = shellSurface;
const audio = new RedpickAudio();
const game = new RedpickGame();

const statusEl = document.getElementById("status");
const turnLabel = document.getElementById("turn-label");
const stockLabel = document.getElementById("stock-label");
const streakLabel = document.getElementById("streak-label");
const scoreYou = document.getElementById("score-you");
const handEl = document.getElementById("hand");
const tableEl = document.getElementById("table-cards");
const previewEl = document.getElementById("preview");
const floatLayer = document.getElementById("float-layer");
const tableRoot = document.querySelector(".table");
const btnDeal = document.getElementById("btn-deal");
const btnReset = document.getElementById("btn-reset");
const btnPlay = document.getElementById("btn-play");
const btnClear = document.getElementById("btn-clear");
const btnMute = document.getElementById("btn-mute");
const soloControls = document.getElementById("solo-controls");
const onlineControls = document.getElementById("online-controls");
const onlineMeta = document.getElementById("online-meta");
const btnOnlineDeal = document.getElementById("btn-online-deal");
const btnOnlineReset = document.getElementById("btn-online-reset");
const tagline = document.querySelector(".tagline");

/** @type {number | null} */
let selectedId = null;
let aiTimer = 0;
let busy = false;

/** @type {"idle"|"host"|"p2"|"p3"|"p4"} */
let onlineRole = "idle";
/** @type {"waiting"|"ready"|"active"|"ended"|string} */
let onlineStatus = "waiting";
let mySeat = 0;
/** @type {BroadcastChannel | null} */
let sessionChannel = null;
let lastSeq = 0;
let seatPollTimer = 0;

/** Online view (fogged). */
let onlineView = {
  status: "waiting",
  turn: 0,
  table: /** @type {import("./game.js").Card[]} */ ([]),
  hand: /** @type {import("./game.js").Card[]} */ ([]),
  handCounts: [0, 0, 0, 0],
  liveScores: [0, 0, 0, 0],
  streaks: [0, 0, 0, 0],
  stockCount: 0,
  message: "",
  winner: /** @type {number | null} */ (null),
  names: [...REDPICK_SEAT_NAMES],
  seatedCount: 0,
};

function isOnline() {
  return onlineRole !== "idle";
}

function setStatus(msg, tone = "") {
  statusEl.textContent = msg;
  statusEl.dataset.tone = tone;
}

/**
 * Visual index 0 = bottom (me). Map logical seat → visual.
 * @param {number} logical
 */
function toVisual(logical) {
  if (!isOnline()) return logical;
  return (logical - mySeat + 4) % 4;
}

/**
 * @param {number} visual
 */
function toLogical(visual) {
  if (!isOnline()) return visual;
  return (visual + mySeat) % 4;
}

/**
 * @param {import('./game.js').Card} card
 * @param {object} opts
 */
function renderCard(card, opts = {}) {
  const el = document.createElement(opts.static ? "div" : "button");
  if (!opts.static) el.type = "button";
  el.className = `card${isRed(card) ? " red" : ""}${opts.selected ? " selected" : ""}${opts.matchable ? " matchable" : ""}${opts.target ? " target" : ""}${opts.static ? " static" : ""}${opts.pop ? " pop" : ""}`;
  el.dataset.id = String(card.id);
  const pts = cardPoints(card);
  el.innerHTML = `<span>${RANKS[card.rank]}</span><span class="suit">${SUITS[card.suit]}</span>${
    pts ? `<span class="pts-badge">+${pts}</span>` : ""
  }`;
  el.setAttribute("aria-label", `${cardLabel(card)}${pts ? ` 紅點${pts}` : ""}`);
  if (!opts.static) {
    el.setAttribute("role", "option");
    el.setAttribute("aria-selected", opts.selected ? "true" : "false");
  }
  return el;
}

function viewScores() {
  if (isOnline()) return onlineView.liveScores;
  return game.status === "over" ? game.scores : game.liveScores();
}

function viewStreaks() {
  return isOnline() ? onlineView.streaks : game.streaks;
}

function viewTurn() {
  return isOnline() ? onlineView.turn : game.turn;
}

function viewStatusPlaying() {
  if (isOnline()) return onlineView.status === "active";
  return game.status === "playing";
}

function viewStatusOver() {
  if (isOnline()) return onlineView.status === "ended";
  return game.status === "over";
}

function viewNames() {
  return isOnline() ? onlineView.names : game.names;
}

function renderScores() {
  const scores = viewScores();
  const best = Math.max(...scores);
  const streaks = viewStreaks();
  const turn = viewTurn();
  const playing = viewStatusPlaying();
  const names = viewNames();

  for (let visual = 0; visual < 4; visual++) {
    const logical = toLogical(visual);
    const sc = document.getElementById(`sc-${visual}`);
    if (sc) sc.textContent = String(scores[logical] ?? 0);
    const chip = document.querySelector(`.score-chip[data-seat="${visual}"]`);
    chip?.classList.toggle("is-turn", playing && turn === logical);
    chip?.classList.toggle(
      "is-lead",
      (scores[logical] ?? 0) === best && best > 0,
    );
    const nameEl = document.querySelector(
      `.who-name[data-name-seat="${visual}"]`,
    );
    if (nameEl) {
      nameEl.textContent =
        visual === 0 ? "你" : names[logical] || `席${logical + 1}`;
    }
    const st = document.getElementById(`streak-${visual}`);
    if (st) {
      if ((streaks[logical] ?? 0) >= 2 && playing) {
        st.hidden = false;
        st.textContent = `連×${streaks[logical]}`;
      } else {
        st.hidden = true;
      }
    }
  }
  scoreYou.textContent = String(scores[mySeat] ?? scores[0] ?? 0);
  streakLabel.textContent = `×${streaks[mySeat] ?? streaks[0] ?? 0}`;
}

function myHand() {
  if (isOnline()) return onlineView.hand || [];
  return game.hands[0];
}

function tableCards() {
  if (isOnline()) return onlineView.table || [];
  return game.table;
}

function updatePreview() {
  const hand = myHand();
  const myTurn =
    viewStatusPlaying() && viewTurn() === mySeat && (!isOnline() || true);
  if (selectedId == null || !myTurn) {
    previewEl.hidden = true;
    previewEl.textContent = "";
    return;
  }
  if (isOnline()) {
    const card = hand.find((c) => c.id === selectedId);
    if (!card) {
      previewEl.hidden = true;
      return;
    }
    const matches = tableCards().filter((t) => t.rank === card.rank);
    previewEl.hidden = false;
    previewEl.textContent = matches.length
      ? `可對 ${matches.length} 張`
      : "對不到 → 放到桌上";
    return;
  }
  const prev = previewCapture(game, 0, selectedId);
  if (!prev?.capture) {
    previewEl.hidden = false;
    previewEl.textContent = "對不到 → 放到桌上";
    return;
  }
  previewEl.hidden = false;
  const tag = prev.tags.length ? `（${prev.tags.join(" · ")}）` : "";
  previewEl.textContent = `可撿 +${prev.total}${tag}`;
}

function renderHand() {
  handEl.innerHTML = "";
  const hand = myHand();
  const myTurn = viewStatusPlaying() && viewTurn() === mySeat && !busy;
  const table = tableCards();

  for (const card of hand) {
    const matchable = myTurn && table.some((t) => t.rank === card.rank);
    const el = renderCard(card, {
      selected: selectedId === card.id,
      matchable,
    });
    el.addEventListener("click", async () => {
      await audio.unlock();
      if (!myTurn) return;
      if (selectedId === card.id) {
        void doPlay();
        return;
      }
      selectedId = card.id;
      audio.select();
      renderHand();
      renderTable();
      updatePreview();
      syncActions();
    });
    handEl.appendChild(el);
  }
  document.getElementById("count-0").textContent = String(hand.length);
  const vname = document.querySelector('[data-vname="0"]');
  if (vname) vname.textContent = "你的手牌";
}

function renderOpponents() {
  const playing = viewStatusPlaying();
  const turn = viewTurn();
  const names = viewNames();
  const counts = isOnline()
    ? onlineView.handCounts
    : game.hands.map((h) => h.length);
  const streaks = viewStreaks();

  for (const visual of [1, 2, 3]) {
    const logical = toLogical(visual);
    const wrap = document.getElementById(`op-${visual}`);
    const n = counts[logical] ?? 0;
    document.getElementById(`count-${visual}`).textContent = String(n);
    const nameEl = document.querySelector(`[data-vname="${visual}"]`);
    if (nameEl) nameEl.textContent = names[logical] || `席${logical + 1}`;
    wrap.innerHTML = "";
    const show = Math.min(n, 8);
    for (let i = 0; i < show; i++) {
      const back = document.createElement("span");
      back.className = "card-back";
      wrap.appendChild(back);
    }
    document
      .querySelector(`.seat[data-visual="${visual}"]`)
      ?.classList.toggle("is-turn", playing && turn === logical);
    const st = document.getElementById(`streak-${visual}`);
    if (st) {
      if ((streaks[logical] ?? 0) >= 2 && playing) {
        st.hidden = false;
        st.textContent = `連×${streaks[logical]}`;
      } else st.hidden = true;
    }
  }
  document
    .querySelector(`.seat[data-visual="0"]`)
    ?.classList.toggle("is-turn", playing && turn === mySeat);
}

function renderTable() {
  tableEl.innerHTML = "";
  let selectedRank = -1;
  if (selectedId != null) {
    const c = myHand().find((h) => h.id === selectedId);
    if (c) selectedRank = c.rank;
  }
  for (const c of tableCards()) {
    const el = renderCard(c, {
      static: true,
      target: selectedRank === c.rank,
    });
    tableEl.appendChild(el);
  }
  updatePreview();
}

function syncActions() {
  const myTurn = viewStatusPlaying() && viewTurn() === mySeat && !busy;
  btnPlay.disabled = !myTurn || selectedId == null;
  btnClear.disabled = selectedId == null;
  if (!isOnline()) {
    btnDeal.disabled = busy || game.status === "playing";
  }
  const names = viewNames();
  if (viewStatusOver()) {
    turnLabel.textContent = "終局";
  } else if (!viewStatusPlaying() && (!isOnline() ? game.status === "ready" : true)) {
    turnLabel.textContent = isOnline()
      ? onlineStatus === "ready"
        ? "可發牌"
        : "等候"
      : "—";
  } else {
    turnLabel.textContent = names[viewTurn()] || "—";
  }
  stockLabel.textContent = String(
    isOnline() ? onlineView.stockCount : game.stock.length,
  );
  if (myTurn && selectedId != null && !isOnline()) {
    const prev = previewCapture(game, 0, selectedId);
    btnPlay.textContent = prev?.capture ? `撿走 +${prev.total}` : "放到桌上";
  } else if (myTurn && selectedId != null) {
    btnPlay.textContent = "出牌撿點";
  } else {
    btnPlay.textContent = "出牌撿點";
  }
  syncOnlineControls();
}

function spawnFloat(text, big = false) {
  const el = document.createElement("div");
  el.className = `float-pts${big ? " big" : ""}`;
  el.textContent = text;
  floatLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 950);
}

function celebrate(result) {
  if (!result) return;
  const gain = (result.base || 0) + (result.bonus || 0);
  if (gain > 0) spawnFloat(`+${gain}`, result.swept || result.bonus >= 15);
  if (result.swept) {
    tableRoot?.classList.remove("sweep-flash");
    void tableRoot?.offsetWidth;
    tableRoot?.classList.add("sweep-flash");
    audio.sweep();
  } else if (result.bonus > 0) {
    audio.bonus();
  }
}

function syncLayoutChrome() {
  const online = isOnline();
  const mode = online || shellSurface === "room" ? "online" : "solo";
  const status = online
    ? onlineView.status || onlineStatus
    : shellSurface === "room"
      ? onlineStatus || "waiting"
      : game.status;
  const chrome = deriveChromeState({ mode, status });
  document.body.dataset.layout = chrome.layout;
  document.body.dataset.onlineRole = online ? onlineRole : "";

  const showSolo = shouldShowSoloControls({
    shellSurface,
    online,
  });
  if (!showSolo) {
    soloControls.hidden = true;
    return;
  }

  if (chrome.layout === "match") {
    soloControls.hidden = true;
  } else if (chrome.layout === "over") {
    soloControls.hidden = false;
    btnDeal.hidden = true;
    btnReset.hidden = false;
    btnReset.textContent = "再來一局";
  } else {
    soloControls.hidden = false;
    btnDeal.hidden = false;
    btnReset.hidden = false;
    btnReset.textContent = "重來";
  }
}

function renderAll(tone = "") {
  renderHand();
  renderOpponents();
  renderTable();
  renderScores();
  const msg = isOnline()
    ? onlineView.message || statusEl.textContent
    : game.message;
  const autoTone =
    tone ||
    (viewStatusOver()
      ? "win"
      : viewTurn() === mySeat && viewStatusPlaying()
        ? "turn"
        : "");
  if (!isOnline() || onlineView.message) setStatus(msg, autoTone);
  syncLayoutChrome();
  syncActions();
}

function scheduleAi() {
  if (isOnline()) return;
  window.clearTimeout(aiTimer);
  if (game.status !== "playing" || game.turn === 0 || busy) return;
  busy = true;
  syncActions();
  aiTimer = window.setTimeout(() => {
    void runAiTurn();
  }, 420 + Math.random() * 380);
}

async function runAiTurn() {
  await audio.unlock();
  if (game.status !== "playing" || game.turn === 0) {
    busy = false;
    syncActions();
    return;
  }
  const seat = game.turn;
  if (!game.hands[seat].length) {
    game.advanceTurn();
    busy = false;
    renderAll();
    if (game.status === "playing" && game.turn !== 0) scheduleAi();
    return;
  }
  const id = chooseAiCard(game, seat);
  const r = game.play(seat, id);
  busy = false;
  if (!r.ok) {
    audio.deny();
    setStatus(r.reason || "AI 出錯", "warn");
    syncActions();
    return;
  }
  if (r.captured) {
    audio.capture(r.points || 0);
    celebrate(r.result);
  } else audio.place();
  if (r.over) audio.win();
  renderAll(r.captured ? "capture" : "");
  if (game.status === "playing" && game.turn !== 0) scheduleAi();
  else if (game.turn === 0 && game.status === "playing") audio.turn();
}

async function doPlay() {
  await audio.unlock();
  if (busy || selectedId == null) return;
  if (viewTurn() !== mySeat || !viewStatusPlaying()) return;

  if (isOnline()) {
    busy = true;
    syncActions();
    try {
      let data;
      if (onlineRole === "host") {
        data = await hostDomain("/api/session/act", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            role: "host",
            payload: { type: "play", cardId: selectedId },
          }),
        });
      } else {
        // Guest SESSION.act: payload only (shell adds role).
        data = await domain("/api/session/act", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "play", cardId: selectedId }),
        });
      }
      selectedId = null;
      if (data.state) applyOnlineState(data.state);
      if (data.events) {
        for (const ev of data.events) applyEvent(ev);
      }
      if (data.state?.lastAct?.result) {
        const r = data.state.lastAct.result;
        audio.capture((r.base || 0) + (r.bonus || 0));
        celebrate(r);
      } else if (data.events?.[0]?.captured) {
        audio.capture(data.events[0].points || 0);
      } else audio.place();
      if (onlineView.status === "ended") audio.win();
      renderAll();
    } catch (e) {
      audio.deny();
      setStatus(String(e.message || e), "warn");
    } finally {
      busy = false;
      syncActions();
    }
    return;
  }

  const r = game.play(0, selectedId);
  if (!r.ok) {
    audio.deny();
    setStatus(r.reason || "無法出牌", "warn");
    return;
  }
  selectedId = null;
  if (r.captured) {
    audio.capture(r.points || 0);
    celebrate(r.result);
  } else audio.place();
  if (r.over) audio.win();
  renderAll(r.captured ? "capture" : "");
  if (game.status === "playing") scheduleAi();
}

/* ——— Online (redpick.v1) ——— */

async function online(path, init) {
  const res = await fetch("/api/online" + path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.code || res.statusText);
    err.code = data.code;
    throw err;
  }
  return data;
}

async function domain(path, init) {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.code || res.statusText);
    err.code = data.code;
    throw err;
  }
  return data;
}

async function hostDomain(path, init) {
  const method = (init && init.method) || "GET";
  const headers = (init && init.headers) || undefined;
  const body = init && typeof init.body === "string" ? init.body : undefined;
  return online("/domain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, method, headers, body }),
  });
}

function applyOnlineState(state) {
  if (!state || typeof state !== "object") return;
  if (typeof state.seq === "number") lastSeq = Math.max(lastSeq, state.seq);
  onlineStatus = state.status || onlineStatus;
  onlineView = {
    status: state.status || onlineView.status,
    turn: Number(state.turn) || 0,
    table: Array.isArray(state.table) ? state.table : onlineView.table,
    hand: Array.isArray(state.hand) ? state.hand : onlineView.hand,
    handCounts: Array.isArray(state.handCounts)
      ? state.handCounts
      : onlineView.handCounts,
    liveScores: Array.isArray(state.liveScores)
      ? state.liveScores
      : Array.isArray(state.scores)
        ? state.scores
        : onlineView.liveScores,
    streaks: Array.isArray(state.streaks) ? state.streaks : onlineView.streaks,
    stockCount:
      typeof state.stockCount === "number"
        ? state.stockCount
        : onlineView.stockCount,
    message: state.message || onlineView.message,
    winner:
      state.winner === 0 ||
      state.winner === 1 ||
      state.winner === 2 ||
      state.winner === 3
        ? state.winner
        : state.winner == null
          ? null
          : onlineView.winner,
    names: Array.isArray(state.names) ? state.names : onlineView.names,
    seatedCount:
      typeof state.seatedCount === "number"
        ? state.seatedCount
        : onlineView.seatedCount,
  };
  if (state.channelName) bindSessionChannel(state.channelName);
  renderAll();
}

function applyEvent(event) {
  if (!event || typeof event !== "object") return;
  const type = String(event.type || "");
  if (typeof event.seq === "number") {
    if (event.seq <= lastSeq && type !== "session.closed") return;
    lastSeq = Math.max(lastSeq, event.seq);
  }
  if (type === "session.closed") {
    onlineStatus = "waiting";
    setStatus(
      event.reason === "host_closed"
        ? "主持已結束這一場"
        : "有人離開，這一局結束",
      "warn",
    );
    onlineView.message = statusEl.textContent;
    syncOnlineControls();
    return;
  }
  if (type === "match.status") {
    onlineStatus = event.status || onlineStatus;
    onlineView.status = onlineStatus;
    onlineView.seatedCount =
      typeof event.seatedCount === "number"
        ? event.seatedCount
        : onlineView.seatedCount;
    syncOnlineControls();
    return;
  }
  if (type === "match.dealt" || type === "match.played" || type === "match.over") {
    applyPublicEventFields(event);
    // Guest needs private hand via sync act (tunnel getState is a stub).
    void loadOnlineState();
    return;
  }
  if (type === "match.reset") {
    applyPublicEventFields(event);
    onlineView.hand = [];
    void loadOnlineState();
  }
}

function applyPublicEventFields(event) {
  if (event.status) {
    onlineStatus = event.status;
    onlineView.status = event.status;
  }
  if (typeof event.turn === "number") onlineView.turn = event.turn;
  if (Array.isArray(event.table)) onlineView.table = event.table;
  if (Array.isArray(event.handCounts)) onlineView.handCounts = event.handCounts;
  if (typeof event.stockCount === "number") {
    onlineView.stockCount = event.stockCount;
  }
  if (Array.isArray(event.liveScores)) onlineView.liveScores = event.liveScores;
  if (Array.isArray(event.scores)) onlineView.liveScores = event.scores;
  if (Array.isArray(event.streaks)) onlineView.streaks = event.streaks;
  if (typeof event.message === "string") onlineView.message = event.message;
  if (
    event.winner === 0 ||
    event.winner === 1 ||
    event.winner === 2 ||
    event.winner === 3
  ) {
    onlineView.winner = event.winner;
  }
  renderAll();
}

function bindSessionChannel(channelName) {
  if (!channelName) return;
  if (sessionChannel) {
    try {
      sessionChannel.close();
    } catch {
      /* ignore */
    }
  }
  sessionChannel = new BroadcastChannel(channelName);
  sessionChannel.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || msg.type !== "session-event") return;
    if (msg.event) applyEvent(msg.event);
  };
}

async function loadOnlineState() {
  if (onlineRole === "idle") return null;
  try {
    if (onlineRole === "host") {
      const state = await hostDomain(
        `/api/session/state?role=${encodeURIComponent(onlineRole)}`,
        { method: "GET" },
      );
      applyOnlineState(state);
      return state;
    }
    // Guest: SESSION.getState is a stub — pull fogged snapshot via sync act.
    const data = await domain("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "sync" }),
    });
    if (data.state) applyOnlineState(data.state);
    return data.state ?? null;
  } catch {
    return null;
  }
}

async function syncSeatedPresence() {
  if (onlineRole !== "host") return;
  try {
    const st = await online("/status");
    const seats = st.seats || [];
    const seatedRoles = ["host"];
    for (const r of REDPICK_ROLES) {
      if (r === "host") continue;
      if (seats.some((s) => s.role === r)) seatedRoles.push(r);
    }
    // Host is always seated when booth play is open
    if (!seatedRoles.includes("host")) seatedRoles.unshift("host");
    const data = await hostDomain("/api/session/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seatedRoles,
        seats: seats.map((s) => ({
          role: s.role,
          name: s.name || s.displayName || undefined,
          displayName: s.displayName || s.name || undefined,
        })),
      }),
    });
    if (data.state) applyOnlineState(data.state);
    if (data.events) for (const ev of data.events) applyEvent(ev);
  } catch {
    /* ignore */
  }
}

function startSeatPoll() {
  stopSeatPoll();
  seatPollTimer = window.setInterval(() => {
    void syncSeatedPresence();
  }, 2000);
}

function stopSeatPoll() {
  if (seatPollTimer) {
    clearInterval(seatPollTimer);
    seatPollTimer = 0;
  }
}

function syncOnlineControls() {
  if (!isOnline()) {
    onlineControls.hidden = true;
    return;
  }
  onlineControls.hidden = false;
  const hosting = onlineRole === "host";
  const room = shellSurface === "room";
  btnOnlineDeal.hidden = !(hosting && onlineStatus === "ready");
  btnOnlineReset.hidden = !(hosting && onlineStatus === "ended");
  const roleLabel =
    onlineRole === "host" ? "主持" : `席${mySeat + 1}`;
  if (onlineStatus === "waiting") {
    onlineMeta.textContent = room
      ? `包廂 · ${roleLabel} · 等候滿席（${onlineView.seatedCount}/4）`
      : `連線 · ${roleLabel} · 等候滿席`;
  } else if (onlineStatus === "ready") {
    onlineMeta.textContent = hosting
      ? "滿席 — 可發牌開局"
      : "已入座 — 等候主持發牌";
  } else if (onlineStatus === "active") {
    onlineMeta.textContent =
      viewTurn() === mySeat ? "輪到你出牌" : `輪到 ${onlineView.names[viewTurn()]}`;
  } else if (onlineStatus === "ended") {
    onlineMeta.textContent = "終局";
  }
}

async function onOnlineDeal() {
  if (onlineRole !== "host") return;
  setStatus("發牌中…");
  try {
    const data = await hostDomain("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "host", payload: { type: "deal" } }),
    });
    selectedId = null;
    if (data.state) applyOnlineState(data.state);
    audio.deal();
    setStatus(onlineView.message || "已發牌", "turn");
    renderAll("turn");
  } catch (e) {
    setStatus(String(e.message || e), "warn");
  }
}

async function onOnlineReset() {
  if (onlineRole !== "host") return;
  try {
    const data = await hostDomain("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "host", payload: { type: "reset" } }),
    });
    selectedId = null;
    if (data.state) applyOnlineState(data.state);
    setStatus("可再發牌", "");
  } catch (e) {
    setStatus(String(e.message || e), "warn");
  }
}

async function tryBootAsPlayer() {
  try {
    const seat = await domain("/api/session/seat");
    if (!seat || seat.ready === false) return false;
    const role = String(seat.role || "");
    if (!REDPICK_ROLES.includes(role)) return false;
    onlineRole = /** @type {typeof onlineRole} */ (role);
    mySeat = roleToSeat(role);
    const ch = await domain("/api/session/channel");
    if (ch?.name) bindSessionChannel(ch.name);
    await loadOnlineState();
    syncOnlineControls();
    setStatus(
      onlineStatus === "ready" || onlineStatus === "active"
        ? "已入座"
        : "已入座 — 等候滿席與發牌",
    );
    return true;
  } catch {
    return false;
  }
}

async function tryBootAsRoomHost() {
  if (shellSurface !== "room") return false;
  try {
    const st = await online("/status");
    if (!st?.active || !st.channelName) return false;
    onlineRole = "host";
    mySeat = 0;
    bindSessionChannel(st.channelName);
    lastSeq = 0;
    // Ensure domain store exists for booth play
    try {
      await hostDomain("/api/session/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: st.sessionId,
          channelName: st.channelName,
        }),
      });
    } catch {
      /* may already be open via shell */
    }
    await loadOnlineState();
    startSeatPoll();
    await syncSeatedPresence();
    syncOnlineControls();
    setStatus(
      onlineStatus === "ready"
        ? "滿席 — 按「發牌開局」"
        : "包廂開局 — 等候三人入座",
    );
    return true;
  } catch {
    return false;
  }
}

function applySoloShell() {
  soloControls.hidden = false;
  onlineControls.hidden = true;
  if (tagline) tagline.textContent = "對點數 · 連撿加成 · 清桌大獎";
}

function applyRoomShell() {
  soloControls.hidden = true;
  onlineControls.hidden = false;
  if (tagline) tagline.textContent = "包廂四人連線 · 對點數撿紅點";
  window.clearTimeout(aiTimer);
}

btnDeal.addEventListener("click", async () => {
  if (isOnline()) return;
  await audio.unlock();
  selectedId = null;
  game.deal();
  audio.deal();
  renderAll("turn");
  if (game.turn !== 0) scheduleAi();
});

btnReset.addEventListener("click", async () => {
  if (isOnline()) return;
  await audio.unlock();
  window.clearTimeout(aiTimer);
  busy = false;
  selectedId = null;
  game.reset();
  renderAll();
});

btnOnlineDeal?.addEventListener("click", () => {
  void onOnlineDeal();
});
btnOnlineReset?.addEventListener("click", () => {
  void onOnlineReset();
});

btnPlay.addEventListener("click", () => {
  void doPlay();
});

btnClear.addEventListener("click", async () => {
  await audio.unlock();
  selectedId = null;
  renderHand();
  renderTable();
  updatePreview();
  syncActions();
});

btnMute.addEventListener("click", async () => {
  await audio.unlock();
  audio.setEnabled(!audio.enabled);
  btnMute.textContent = audio.enabled ? "音效開" : "音效關";
  btnMute.setAttribute("aria-pressed", audio.enabled ? "true" : "false");
});

document.body.addEventListener(
  "pointerdown",
  () => {
    void audio.unlock();
  },
  { once: true },
);

/** @type {{ resumeAi: boolean, resumeSeatPoll: boolean } | null} */
let lifecycleSnap = null;

function suspendGame() {
  const plan = planLifecycleSuspend({
    aiRunning: Boolean(aiTimer),
    seatPollRunning: Boolean(seatPollTimer),
  });
  lifecycleSnap = {
    resumeAi: Boolean(lifecycleSnap?.resumeAi) || plan.resumeAi,
    resumeSeatPoll:
      Boolean(lifecycleSnap?.resumeSeatPoll) || plan.resumeSeatPoll,
  };
  if (plan.stopAi) {
    window.clearTimeout(aiTimer);
    aiTimer = 0;
    busy = false;
  }
  if (plan.stopSeatPoll) stopSeatPoll();
  if (plan.clearSelection) {
    selectedId = null;
  }
  if (plan.suspendAudio) audio.suspend();
  syncActions();
}

function resumeGame() {
  if (!lifecycleSnap) return;
  const plan = planLifecycleResume(lifecycleSnap, {
    soloPlaying: !isOnline() && game.status === "playing",
    hosting: onlineRole === "host",
  });
  lifecycleSnap = null;
  if (plan.resumeAudio) audio.resume();
  if (plan.resumeSeatPoll) startSeatPoll();
  if (plan.resumeAi) scheduleAi();
  renderAll();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") suspendGame();
  else resumeGame();
});
window.addEventListener("pagehide", suspendGame);

async function bootShellSurface() {
  if (shellSurface === "solo") {
    applySoloShell();
    renderAll();
    return;
  }
  if (shellSurface === "room") {
    applyRoomShell();
    renderAll();
    if (await tryBootAsPlayer()) return;
    for (let i = 0; i < 20; i++) {
      if (await tryBootAsRoomHost()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    setStatus("包廂開局中 — 等候通道就緒…");
    return;
  }
  applySoloShell();
  renderAll();
  void tryBootAsPlayer();
}

async function boot() {
  try {
    const pg = /** @type {any} */ (window).PG;
    if (pg?.ready && typeof pg.ready.then === "function") {
      await pg.ready;
    }
  } catch {
    /* static serve without host SDK */
  }
  await bootShellSurface();
}

void boot();
