// music.js — lightweight procedural music that speeds up with stack height
// Public API:
//   const music = new Music();
//   music.start(); music.stop();
//   music.setEnabled(bool); music.setVolume(0..1);
//   music.setIntensity(0..1);  // 0 = calm, 1 = near top
//   music.setMode('play'|'attract'|'off');

export default class Music {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;

    this.enabled = false;
    this.mode = 'off';
    this.volume = 0.35;
    this.lookahead = 0.075;      // seconds to look ahead
    this.scheduleEvery = 25;     // ms timer for scheduler
    this.nextBeatTime = 0;
    this.bpm = 104;
    this.minBpm = 96;
    this.maxBpm = 196;
    this.intensity = 0;          // 0..1 (based on stack height)

    this.timer = null;
    this.beatIndex = 0;          // 16th-note counter
    this.scaleRoot = 57;         // A3 (MIDI) — folk-ish minor vibe works well
    this.scale = [0, 2, 3, 5, 7, 8, 11]; // A harmonic minor (Korobeiniki-adjacent vibe)
  }

  /* ---------- public ---------- */
  async start() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // iOS sometimes needs an explicit resume inside a click handler
      if (this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch {}
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;

      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 20;
      this.comp.ratio.value = 2;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.25;

      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
    }

    if (this.enabled) return;
    this.enabled = true;
    this.setMode('play');

    this.nextBeatTime = this.ctx.currentTime + 0.05;
    this.beatIndex = 0;

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.#scheduler(), this.scheduleEvery);
  }

  stop() {
    this.enabled = false;
    this.setMode('off');
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setEnabled(on) {
    if (on) this.start(); else this.stop();
  }

  setMode(mode) {
    this.mode = mode; // 'play'|'attract'|'off'
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  // intensity in [0..1], typically maxHeight/ROWS
  setIntensity(ratio) {
    // curve it so the ramp is gentle first, sharper near the top
    const curved = Math.pow(Math.max(0, Math.min(1, ratio)), 0.85);
    this.intensity = curved;
    this.bpm = this.minBpm + (this.maxBpm - this.minBpm) * curved;
  }

  /* ---------- core scheduler ---------- */
  #scheduler() {
    if (!this.enabled || !this.ctx) return;
    const secPerBeat = 60 / this.bpm;        // quarter note
    const sixteenth = secPerBeat / 4;

    while (this.nextBeatTime < this.ctx.currentTime + this.lookahead) {
      // choose arrangement by mode
      if (this.mode === 'play') {
        this.#schedulePlayPattern(this.nextBeatTime, this.beatIndex);
      } else if (this.mode === 'attract') {
        this.#scheduleAttractPattern(this.nextBeatTime, this.beatIndex);
      }

      this.nextBeatTime += sixteenth;
      this.beatIndex = (this.beatIndex + 1) % 64; // 4 bars of 4/4 at 16th-note resolution
    }
  }

  /* ---------- patterns ---------- */
  #schedulePlayPattern(t, i) {
    // Kick on 1 & 3, snare-ish on 2 & 4, closed hat on 8ths
    if (i % 16 === 0 || i % 16 === 8) this.#kick(t, 0.65);
    if (i % 16 === 4 || i % 16 === 12) this.#snare(t, 0.22);
    if (i % 8 === 0) this.#hat(
