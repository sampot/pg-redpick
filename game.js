/**
 * 撿紅點 — fishing / capture (Taiwan-style homage).
 * Match ranks; score red ♦♥ + combo bonuses. Not a commercial clone.
 */

export const SUITS = ["♦", "♣", "♥", "♠"];
/** A,2,3…10,J,Q,K */
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/**
 * @typedef {{ id: number, rank: number, suit: number }} Card
 * @typedef {{ base: number, bonus: number, tags: string[], streak: number, swept: boolean, redCount: number }} CaptureResult
 */

export function isRed(c) {
  return c.suit === 0 || c.suit === 2;
}

export function cardLabel(c) {
  return `${SUITS[c.suit]}${RANKS[c.rank]}`;
}

/** Red-point score for one card (black = 0). */
export function cardPoints(c) {
  if (!isRed(c)) return 0;
  if (c.rank === 0) return 20; // A
  if (c.rank >= 9) return 10; // 10,J,Q,K
  return c.rank + 1; // 2..9 → face value
}

/** @returns {Card[]} */
export function makeDeck() {
  /** @type {Card[]} */
  const d = [];
  for (let rank = 0; rank < 13; rank++) {
    for (let suit = 0; suit < 4; suit++) {
      d.push({ id: rank * 4 + suit, rank, suit });
    }
  }
  return d;
}

/** @param {Card[]} deck */
export function shuffle(deck) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** @param {Card[]} cards */
export function sortCards(cards) {
  return cards.slice().sort((a, b) => a.rank - b.rank || a.suit - b.suit);
}

/** @param {Card[]} pile */
export function pileScore(pile) {
  return pile.reduce((s, c) => s + cardPoints(c), 0);
}

/**
 * Preview points if seat plays cardId now (no state change).
 * @param {RedpickGame} game
 * @param {number} seat
 * @param {number} cardId
 */
export function previewCapture(game, seat, cardId) {
  const card = game.hands[seat].find((c) => c.id === cardId);
  if (!card) return null;
  const matches = game.table.filter((t) => t.rank === card.rank);
  if (!matches.length) {
    return { capture: false, matches: [], base: 0, bonus: 0, total: 0, tags: [], swept: false };
  }
  const captured = [card, ...matches];
  const base = pileScore(captured);
  const redCount = captured.filter(isRed).length;
  const swept = matches.length === game.table.length;
  const nextStreak = game.streaks[seat] + 1;
  /** @type {string[]} */
  const tags = [];
  let bonus = 0;
  if (swept && game.table.length >= 2) {
    bonus += 15;
    tags.push("清桌 +15");
  }
  if (redCount >= 2) {
    const extra = 5 * (redCount - 1);
    bonus += extra;
    tags.push(`多紅 +${extra}`);
  }
  if (captured.some((c) => isRed(c) && c.rank === 0)) {
    bonus += 10;
    tags.push("紅 A +10");
  }
  if (nextStreak >= 2) {
    const s = (nextStreak - 1) * 5;
    bonus += s;
    tags.push(`連撿×${nextStreak} +${s}`);
  }
  return {
    capture: true,
    matches,
    base,
    bonus,
    total: base + bonus,
    tags,
    swept,
    redCount,
    streak: nextStreak,
  };
}

export const HAND_SIZE = 5;
export const TABLE_START = 4;
export const PLAYERS = 4;

export class RedpickGame {
  constructor() {
    /** @type {Card[][]} */
    this.hands = [[], [], [], []];
    /** @type {Card[][]} */
    this.piles = [[], [], [], []];
    /** @type {number[]} combo bonus bank per seat */
    this.bonuses = [0, 0, 0, 0];
    /** @type {number[]} consecutive capture streak */
    this.streaks = [0, 0, 0, 0];
    /** @type {Card[]} */
    this.table = [];
    /** @type {Card[]} */
    this.stock = [];
    /** @type {string[]} */
    this.names = ["你", "小梅", "阿心", "黑哥"];
    this.human = 0;
    this.turn = 0;
    /** @type {'ready'|'playing'|'over'} */
    this.status = "ready";
    /** @type {number | null} */
    this.winner = null;
    /** @type {number[]} */
    this.scores = [0, 0, 0, 0];
    this.lastCapturer = -1;
    this.sweepCount = [0, 0, 0, 0];
    this.message = "點「開局」發牌撿紅點";
    /** @type {{ seat: number, played: Card, captured: Card[], placed: boolean, result: CaptureResult | null } | null} */
    this.lastAct = null;
  }

  reset() {
    this.hands = [[], [], [], []];
    this.piles = [[], [], [], []];
    this.bonuses = [0, 0, 0, 0];
    this.streaks = [0, 0, 0, 0];
    this.sweepCount = [0, 0, 0, 0];
    this.table = [];
    this.stock = [];
    this.turn = 0;
    this.status = "ready";
    this.winner = null;
    this.scores = [0, 0, 0, 0];
    this.lastCapturer = -1;
    this.lastAct = null;
    this.message = "點「開局」發牌撿紅點";
  }

  deal() {
    const deck = shuffle(makeDeck());
    this.hands = [[], [], [], []];
    this.piles = [[], [], [], []];
    this.bonuses = [0, 0, 0, 0];
    this.streaks = [0, 0, 0, 0];
    this.sweepCount = [0, 0, 0, 0];
    let i = 0;
    for (let r = 0; r < HAND_SIZE; r++) {
      for (let p = 0; p < PLAYERS; p++) {
        this.hands[p].push(deck[i++]);
      }
    }
    this.table = deck.slice(i, i + TABLE_START);
    i += TABLE_START;
    this.stock = deck.slice(i);
    this.hands = this.hands.map(sortCards);
    this.table = sortCards(this.table);
    this.turn = 0;
    this.status = "playing";
    this.winner = null;
    this.scores = [0, 0, 0, 0];
    this.lastCapturer = -1;
    this.lastAct = null;
    this.message = "輪到你：選牌出牌 · 連撿／清桌有加成";
  }

  /** Live total = red pile + bonuses */
  totalScore(seat) {
    return pileScore(this.piles[seat]) + this.bonuses[seat];
  }

  liveScores() {
    return [0, 1, 2, 3].map((s) => this.totalScore(s));
  }

  /**
   * @param {number} seat
   * @param {number} cardId
   */
  play(seat, cardId) {
    if (this.status !== "playing") return { ok: false, reason: "未開局" };
    if (seat !== this.turn) return { ok: false, reason: "還沒輪到" };
    const hand = this.hands[seat];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) return { ok: false, reason: "手牌沒有這張" };

    const played = hand[idx];
    this.hands[seat] = hand.filter((c) => c.id !== cardId);

    const matches = this.table.filter((c) => c.rank === played.rank);
    /** @type {Card[]} */
    let captured = [];
    let placed = false;
    /** @type {CaptureResult | null} */
    let result = null;

    if (matches.length) {
      const tableBefore = this.table.length;
      captured = [played, ...matches];
      this.table = this.table.filter((c) => c.rank !== played.rank);
      this.piles[seat].push(...captured);
      this.lastCapturer = seat;

      const base = pileScore(captured);
      const redCount = captured.filter(isRed).length;
      const swept = matches.length === tableBefore && tableBefore >= 2;
      this.streaks[seat] += 1;
      /** @type {string[]} */
      const tags = [];
      let bonus = 0;
      if (swept) {
        bonus += 15;
        tags.push("清桌");
        this.sweepCount[seat] += 1;
      }
      if (redCount >= 2) {
        bonus += 5 * (redCount - 1);
        tags.push("多紅");
      }
      if (captured.some((c) => isRed(c) && c.rank === 0)) {
        bonus += 10;
        tags.push("紅A");
      }
      if (this.streaks[seat] >= 2) {
        bonus += (this.streaks[seat] - 1) * 5;
        tags.push(`連撿×${this.streaks[seat]}`);
      }
      this.bonuses[seat] += bonus;
      result = {
        base,
        bonus,
        tags,
        streak: this.streaks[seat],
        swept,
        redCount,
      };
      const totalGain = base + bonus;
      const tagTxt = tags.length ? ` · ${tags.join(" ")}` : "";
      this.message =
        totalGain > 0
          ? `${this.names[seat]} 撿到 +${totalGain}${tagTxt}`
          : `${this.names[seat]} 對到 ${cardLabel(played)}`;
    } else {
      this.table.push(played);
      this.table = sortCards(this.table);
      placed = true;
      this.streaks[seat] = 0;
      this.message = `${this.names[seat]} 放 ${cardLabel(played)} 在桌上`;
    }

    this.lastAct = { seat, played, captured, placed, result };

    if (this.stock.length) {
      const drawn = this.stock.shift();
      this.hands[seat].push(drawn);
      this.hands[seat] = sortCards(this.hands[seat]);
    }

    if (this.isRoundOver()) {
      this.finish();
      return {
        ok: true,
        over: true,
        captured: captured.length > 0,
        result,
        points: result ? result.base + result.bonus : 0,
      };
    }

    this.advanceTurn();
    return {
      ok: true,
      captured: captured.length > 0,
      result,
      points: result ? result.base + result.bonus : 0,
    };
  }

  isRoundOver() {
    if (this.stock.length) return false;
    return this.hands.every((h) => h.length === 0);
  }

  finish() {
    if (this.table.length && this.lastCapturer >= 0) {
      this.piles[this.lastCapturer].push(...this.table);
      this.table = [];
    } else {
      this.table = [];
    }
    this.scores = this.liveScores();
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < PLAYERS; i++) {
      if (this.scores[i] > bestScore) {
        bestScore = this.scores[i];
        best = i;
      }
    }
    const tied = this.scores.filter((s) => s === bestScore).length > 1;
    this.winner = best;
    this.status = "over";
    this.message = tied
      ? `終局平手最高 ${bestScore} 分（${this.names.filter((_, i) => this.scores[i] === bestScore).join("、")}）`
      : `${this.names[best]} 獲勝！合計 ${bestScore} 分`;
  }

  advanceTurn() {
    let guard = 0;
    do {
      this.turn = (this.turn + 1) % PLAYERS;
      guard += 1;
      if (this.hands[this.turn].length > 0 || this.stock.length > 0) break;
    } while (guard < PLAYERS);

    guard = 0;
    while (
      this.hands[this.turn].length === 0 &&
      this.stock.length === 0 &&
      !this.isRoundOver() &&
      guard++ < PLAYERS
    ) {
      this.turn = (this.turn + 1) % PLAYERS;
    }
  }
}
