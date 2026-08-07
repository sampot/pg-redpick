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

/** @type {number | null} */
let selectedId = null;
let aiTimer = 0;
let busy = false;

function setStatus(msg, tone = "") {
  statusEl.textContent = msg;
  statusEl.dataset.tone = tone;
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

function renderScores() {
  const scores = game.status === "over" ? game.scores : game.liveScores();
  const best = Math.max(...scores);
  for (let i = 0; i < 4; i++) {
    document.getElementById(`sc-${i}`).textContent = String(scores[i]);
    const chip = document.querySelector(`.score-chip[data-seat="${i}"]`);
    chip?.classList.toggle("is-turn", game.status === "playing" && game.turn === i);
    chip?.classList.toggle("is-lead", scores[i] === best && best > 0);
    const st = document.getElementById(`streak-${i}`);
    if (st) {
      if (game.streaks[i] >= 2 && game.status === "playing") {
        st.hidden = false;
        st.textContent = `連×${game.streaks[i]}`;
      } else {
        st.hidden = true;
      }
    }
  }
  scoreYou.textContent = String(scores[0]);
  streakLabel.textContent = `×${game.streaks[0]}`;
}

function updatePreview() {
  if (selectedId == null || game.turn !== 0 || game.status !== "playing") {
    previewEl.hidden = true;
    previewEl.textContent = "";
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
      if (selectedId === card.id) {
        // Second tap = play
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
  let selectedRank = -1;
  if (selectedId != null) {
    const c = game.hands[0].find((h) => h.id === selectedId);
    if (c) selectedRank = c.rank;
  }
  for (const c of game.table) {
    const el = renderCard(c, {
      static: true,
      target: selectedRank === c.rank,
      pop: game.lastAct?.captured?.some((x) => x.id === c.id),
    });
    tableEl.appendChild(el);
  }
  updatePreview();
}

function syncActions() {
  const myTurn = game.status === "playing" && game.turn === 0 && !busy;
  btnPlay.disabled = !myTurn || selectedId == null;
  btnClear.disabled = selectedId == null;
  btnDeal.disabled = busy || game.status === "playing";
  turnLabel.textContent =
    game.status === "ready" ? "—" : game.status === "over" ? "終局" : game.names[game.turn];
  stockLabel.textContent = String(game.stock.length);
  if (myTurn && selectedId != null) {
    const prev = previewCapture(game, 0, selectedId);
    btnPlay.textContent = prev?.capture ? `撿走 +${prev.total}` : "放到桌上";
  } else {
    btnPlay.textContent = "出牌撿點";
  }
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
  const gain = result.base + result.bonus;
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
  if (busy || game.turn !== 0 || selectedId == null) return;
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

renderAll();
