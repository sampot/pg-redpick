/**
 * Prefer high-value captures (sweep / multi-red / streak); else dump carefully.
 */

import { cardPoints, isRed, previewCapture } from "./game.js";

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
    const prev = previewCapture(game, seat, c.id);
    let score = -100;
    if (prev?.capture) {
      score = 2000 + prev.total * 12 + (prev.swept ? 80 : 0) + prev.streak * 15;
    } else {
      // Avoid seeding rich red for opponents; prefer black / low
      const danger = game.hands.some(
        (h, i) => i !== seat && h.some((hc) => hc.rank === c.rank),
      );
      score = isRed(c) ? -cardPoints(c) * 3 : 40 - c.rank;
      if (danger && isRed(c)) score -= 25;
    }
    return { id: c.id, score };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].id;
}
