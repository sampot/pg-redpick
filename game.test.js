import { describe, expect, it } from "vitest";
import {
  cardPoints,
  isRed,
  pileScore,
  previewCapture,
  RedpickGame,
} from "./game.js";

describe("cardPoints", () => {
  it("scores red A as 20 and face as 10", () => {
    expect(cardPoints({ id: 0, rank: 0, suit: 0 })).toBe(20);
    expect(cardPoints({ id: 1, rank: 9, suit: 2 })).toBe(10);
    expect(cardPoints({ id: 2, rank: 4, suit: 0 })).toBe(5);
  });

  it("scores black as 0", () => {
    expect(isRed({ id: 3, rank: 0, suit: 1 })).toBe(false);
    expect(cardPoints({ id: 3, rank: 0, suit: 1 })).toBe(0);
  });
});

describe("capture bonuses", () => {
  it("awards sweep when clearing the whole table", () => {
    const game = new RedpickGame();
    game.status = "playing";
    game.turn = 0;
    game.hands[0] = [{ id: 100, rank: 5, suit: 0 }];
    game.table = [
      { id: 101, rank: 5, suit: 1 },
      { id: 102, rank: 5, suit: 2 },
    ];
    game.streaks = [0, 0, 0, 0];
    const prev = previewCapture(game, 0, 100);
    expect(prev?.capture).toBe(true);
    expect(prev?.swept).toBe(true);
    expect(prev?.tags.some((t) => t.startsWith("清桌"))).toBe(true);
    expect((prev?.bonus ?? 0) >= 15).toBe(true);
  });

  it("pileScore sums red points only", () => {
    expect(
      pileScore([
        { id: 1, rank: 0, suit: 0 },
        { id: 2, rank: 0, suit: 1 },
      ]),
    ).toBe(20);
  });
});

describe("deal to end", () => {
  it("plays first-card policy until over", () => {
    const game = new RedpickGame();
    game.deal();
    expect(game.status).toBe("playing");
    let guard = 0;
    while (game.status === "playing" && guard++ < 200) {
      const hand = game.hands[game.turn];
      expect(hand.length).toBeGreaterThan(0);
      const r = game.play(game.turn, hand[0].id);
      expect(r.ok).toBe(true);
    }
    expect(game.status).toBe("over");
    expect(game.hands.every((h) => h.length === 0)).toBe(true);
    expect(
      game.winner === 0 ||
        game.winner === 1 ||
        game.winner === 2 ||
        game.winner === 3,
    ).toBe(true);
  });
});
