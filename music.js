// music.js — procedural background music for Tetris using Web Audio API

export class Music {
  #audioCtx;
  #isPlaying;
  #bpm;
  #nextNoteTime;
  #scheduleAheadTime;
  #noteLength;
  #patterns;
  #currentPattern;
  #currentNote;

  constructor(bpm = 120) {
    this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.#isPlaying = false;
    this.#bpm = bpm;
    this.#nextNoteTime = 0;
    this.#scheduleAheadTime = 0.1; // Schedule notes 100ms ahead
    this.#noteLength = 0.05; // Short note duration (seconds)
    this.#patterns = [
      // Simple 4/4 beat pattern: kick (40 Hz), snare (120 Hz), hi-hat (200 Hz)
      [
        { freq: 40, type: 'sine', gain: 0.5 }, // Kick
        null,
        { freq: 120, type: 'square', gain: 0.3 }, // Snare
        null,
        { freq: 200, type: 'triangle', gain: 0.2 }, // Hi-hat
        null,
        { freq: 200, type: 'triangle', gain: 0.2 }, // Hi-hat
        null,
      ],
      // Alternate pattern with more hi-hats
      [
        { freq: 40, type: 'sine', gain: 0.5 }, // Kick
        { freq: 200, type: 'triangle', gain: 0.2 }, // Hi-hat
        { freq: 120, type: 'square', gain: 0.3 }, // Snare
        { freq: 200, type: 'triangle', gain: 0.2 }, // Hi-hat
        { freq: 40, type: 'sine', gain: 0.5 }, // Kick
        { freq: 200, type: 'triangle', gain: 0.2 }, // Hi-hat
        { freq: 120, type: 'square', gain: 0.3 }, // Snare
        { freq: 200, type: 'triangle', gain: 0.2 }, // Hi-hat
      ],
    ];
    this.#currentPattern = 0;
    this.#currentNote = 0;
  }

  #playNote(freq, type, gain) {
    const oscillator = this.#audioCtx.createOscillator();
    const gainNode = this.#audioCtx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, this.#audioCtx.currentTime);
    gainNode.gain.setValueAtTime(gain, this.#audioCtx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(this.#audioCtx.destination);
    oscillator.start();
    oscillator.stop(this.#audioCtx.currentTime + this.#noteLength);
  }

  #scheduleNotes() {
    while (this.#nextNoteTime < this.#audioCtx.currentTime + this.#scheduleAheadTime) {
      const note = this.#patterns[this.#currentPattern][this.#currentNote];
      if (note) {
        this.#playNote(note.freq, note.type, note.gain);
      }
      this.#currentNote = (this.#currentNote + 1) % this.#patterns[this.#currentPattern].length;
      if (this.#currentNote === 0) {
        this.#currentPattern = (this.#currentPattern + 1) % this.#patterns.length;
      }
      this.#nextNoteTime += 60 / this.#bpm / 4; // 16th note intervals
    }
  }

  play() {
    if (this.#isPlaying) return;
    this.#isPlaying = true;
    this.#nextNoteTime = this.#audioCtx.currentTime;
    const tick = () => {
      if (!this.#isPlaying) return;
      this.#scheduleNotes();
      setTimeout(tick, this.#scheduleAheadTime * 1000);
    };
    tick();
  }

  stop() {
    this.#isPlaying = false;
  }

  setBpm(bpm) {
    this.#bpm = bpm;
  }
}