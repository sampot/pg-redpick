/**
 * Prefer capturing red points; else dump black; else lowest table clutter.
 */

import { cardPoints, isRed } from "./game.js";

/**
 * @param {import('./game.js').RedpickGame} game
 * @param {number} seat
 * @returns {number} card id
 */
export function chooseAiCard(game, seat) {
  const hand = game.hands[seat];
  if (!hand.length) return -1;

  /** @type {{ id: number, score: number }[]} */
  const ranked = hand.map((c) => {
    const matches = game.table.filter((t) => t.rank === c.rank);
    let score = -100;
    if (matches.length) {
      const gained = cardPoints(c) + matches.reduce((s, t) => s + cardPoints(t), 0);
      score = 1000 + gained * 10 + matches.length;
    } else {
      // No capture: prefer placing black / low red so opponent can't easily take
      score = isRed(c) ? -cardPoints(c) : 50 - c.rank;
    }
    return { id: c.id, score };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].id;
}
