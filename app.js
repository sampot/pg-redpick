import { chooseAiCard } from "./ai.js";
import { RedpickAudio } from "./audio.js";
import {
  RedpickGame,
  cardLabel,
  isRed,
  pileScore,
  RANKS,
  SUITS,
} from "./game.js";

const audio = new RedpickAudio();
const game = new RedpickGame();

const statusEl = document.getElementById("status");
const turnLabel = document.getElementById("turn-label");
const stockLabel = document.getElementById("stock-label");
const scoreYou = document.getElementById("score-you");
const handEl = document.getElementById("hand");
const tableEl = document.getElementById("table-cards");
const btnDeal = document.getElementById("btn-deal");
const btnReset = document.getElementById("btn-reset");
const btnPlay = document.getElementById("btn-play");
const btnClear = document.getElementById("btn-clear");
const btnMute = document.getElementById("btn-mute");

/** @type {number | null} */
let selectedId = null;
let aiTimer = 0;
let busy = false;

function setStatus(msg, tone = "") {
  statusEl.textContent = msg;
  statusEl.dataset.tone = tone;
}

function renderCard(card, opts = {}) {
  const el = document.createElement(opts.static ? "div" : "button");
  if (!opts.static) el.type = "button";
  el.className = `card${isRed(card) ? " red" : ""}${opts.selected ? " selected" : ""}${opts.matchable ? " matchable" : ""}${opts.static ? " static" : ""}`;
  el.dataset.id = String(card.id);
  el.innerHTML = `<span>${RANKS[card.rank]}</span><span class="suit">${SUITS[card.suit]}</span>`;
  el.setAttribute("aria-label", cardLabel(card));
  if (!opts.static) {
    el.setAttribute("role", "option");
    el.setAttribute("aria-selected", opts.selected ? "true" : "false");
  }
  return el;
}

function liveScores() {
  return game.piles.map(pileScore);
}

function renderScores() {
  const scores = game.status === "over" ? game.scores : liveScores();
  for (let i = 0; i < 4; i++) {
    document.getElementById(`sc-${i}`).textContent = String(scores[i]);
    document
      .querySelector(`.score-chip[data-seat="${i}"]`)
      ?.classList.toggle("is-turn", game.status === "playing" && game.turn === i);
  }
  scoreYou.textContent = String(scores[0]);
}

function renderHand() {
  handEl.innerHTML = "";
  const hand = game.hands[0];
  for (const card of hand) {
    const matchable =
      game.status === "playing" &&
      game.turn === 0 &&
      game.table.some((t) => t.rank === card.rank);
    const el = renderCard(card, {
      selected: selectedId === card.id,
      matchable,
    });
    el.addEventListener("click", async () => {
      await audio.unlock();
      if (game.status !== "playing" || game.turn !== 0 || busy) return;
      selectedId = selectedId === card.id ? null : card.id;
      audio.select();
      renderHand();
      syncActions();
    });
    handEl.appendChild(el);
  }
  document.getElementById("count-0").textContent = String(hand.length);
}

function renderOpponents() {
  for (const seat of [1, 2, 3]) {
    const wrap = document.getElementById(`op-${seat}`);
    const n = game.hands[seat].length;
    document.getElementById(`count-${seat}`).textContent = String(n);
    wrap.innerHTML = "";
    const show = Math.min(n, 8);
    for (let i = 0; i < show; i++) {
      const back = document.createElement("span");
      back.className = "card-back";
      wrap.appendChild(back);
    }
    document
      .querySelector(`.seat[data-seat="${seat}"]`)
      ?.classList.toggle("is-turn", game.status === "playing" && game.turn === seat);
  }
  document
    .querySelector(`.seat[data-seat="0"]`)
    ?.classList.toggle("is-turn", game.status === "playing" && game.turn === 0);
}

function renderTable() {
  tableEl.innerHTML = "";
  for (const c of game.table) {
    tableEl.appendChild(renderCard(c, { static: true }));
  }
}

function syncActions() {
  const myTurn = game.status === "playing" && game.turn === 0 && !busy;
  btnPlay.disabled = !myTurn || selectedId == null;
  btnClear.disabled = selectedId == null;
  btnDeal.disabled = busy || game.status === "playing";
  turnLabel.textContent =
    game.status === "ready" ? "—" : game.status === "over" ? "終局" : game.names[game.turn];
  stockLabel.textContent = String(game.stock.length);
}

function renderAll(tone = "") {
  renderHand();
  renderOpponents();
  renderTable();
  renderScores();
  const autoTone =
    tone ||
    (game.status === "over"
      ? "win"
      : game.turn === 0 && game.status === "playing"
        ? "turn"
        : "");
  setStatus(game.message, autoTone);
  syncActions();
}

function scheduleAi() {
  window.clearTimeout(aiTimer);
  if (game.status !== "playing" || game.turn === 0 || busy) return;
  busy = true;
  syncActions();
  aiTimer = window.setTimeout(() => {
    void runAiTurn();
  }, 480 + Math.random() * 420);
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
  if (r.captured) audio.capture(r.points || 0);
  else audio.place();
  if (r.over) audio.win();
  renderAll(r.captured ? "capture" : "");
  if (game.status === "playing" && game.turn !== 0) scheduleAi();
  else if (game.turn === 0 && game.status === "playing") audio.turn();
}

btnDeal.addEventListener("click", async () => {
  await audio.unlock();
  selectedId = null;
  game.deal();
  audio.deal();
  renderAll("turn");
  if (game.turn !== 0) scheduleAi();
});

btnReset.addEventListener("click", async () => {
  await audio.unlock();
  window.clearTimeout(aiTimer);
  busy = false;
  selectedId = null;
  game.reset();
  renderAll();
});

btnPlay.addEventListener("click", async () => {
  await audio.unlock();
  if (busy || game.turn !== 0 || selectedId == null) return;
  const r = game.play(0, selectedId);
  if (!r.ok) {
    audio.deny();
    setStatus(r.reason || "無法出牌", "warn");
    return;
  }
  selectedId = null;
  if (r.captured) audio.capture(r.points || 0);
  else audio.place();
  if (r.over) audio.win();
  renderAll(r.captured ? "capture" : "");
  if (game.status === "playing") scheduleAi();
});

btnClear.addEventListener("click", async () => {
  await audio.unlock();
  selectedId = null;
  renderHand();
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

renderAll();
