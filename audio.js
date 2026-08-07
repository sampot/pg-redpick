/**
 * Original card-table SFX via Web Audio — no commercial samples.
 */

export class RedpickAudio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.enabled = true;
    this.master = 0.24;
  }

  async unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  }

  setEnabled(on) {
    this.enabled = on;
  }

  /**
   * @param {number} freq
   * @param {number} dur
   * @param {OscillatorType} [type]
   * @param {number} [gain]
   * @param {number} [when]
   */
  tone(freq, dur, type = "square", gain = 0.12, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.master, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.03, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  deal() {
    for (let i = 0; i < 5; i++) {
      this.tone(300 + i * 45, 0.04, "triangle", 0.06, i * 0.035);
    }
  }

  select() {
    this.tone(540, 0.03, "square", 0.06);
  }

  place() {
    this.tone(220, 0.06, "triangle", 0.07);
  }

  capture(points = 0) {
    this.tone(360, 0.05, "square", 0.09);
    this.tone(520, 0.07, "triangle", 0.08, 0.05);
    if (points >= 10) {
      this.tone(780, 0.1, "sine", 0.07, 0.1);
    }
  }

  win() {
    for (let i = 0; i < 5; i++) {
      this.tone(440 * Math.pow(1.2, i), 0.1, "square", 0.09, i * 0.07);
    }
  }

  deny() {
    this.tone(110, 0.08, "sawtooth", 0.05);
  }

  turn() {
    this.tone(660, 0.04, "triangle", 0.05);
  }
}
