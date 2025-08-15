// engine.js — core state, physics, scoring, storage

import { findBestMove } from "./ai.js";

export const ROWS = 20;
export const COLS = 10;

export const SPEED_MS = { Slow: 400, Normal: 120, Fast: 55, Impossible: 18 };
export const SCORE_MULT = { Slow: 0.75, Normal: 1, Fast: 1.5, Impossible: 2 };

export const SHAPES = [
  { shape: [[1, 1, 1, 1]], color: "#00c3ff" }, // I
  {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: "#ffe600",
  }, // O
  {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    color: "#a259f7",
  }, // T
  {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    color: "#0051ba",
  }, // J
  {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    color: "#ff7f00",
  }, // L
  {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    color: "#00d100",
  }, // S
  {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    color: "#ff1e56",
  }, // Z
];

export const State = { ATTRACT: "ATTRACT", PLAYING: "PLAYING" };

export function deepCopy(m) {
  return m.map((r) => r.slice());
}
export function rotateMatrix(m) {
  return m[0].map((_, i) => m.map((r) => r[i]).reverse());
}

function rngShape() {
  return SHAPES[Math.floor(Math.random() * SHAPES.length)];
}

export class Engine {
  constructor(hooks = {}) {
    this.state = State.ATTRACT;

    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.current = { shape: null, color: null, row: 0, col: 3 };
    this.next = null;

    this.score = 0;
    this.shapesSeen = 0;
    this.linesCompleted = 0;
    this.tetrises = 0;

    this.speed = "Slow";
    this.lineBonusMultiplier = 1;

    this.autoPlay = false;
    this.aiTarget = null;
    this.aiInFlight = false;

    this.lockFrames = 0;
    this.LOCK_DELAY_STEPS = 3;

    this.running = false;
    this.lastTime = 0;
    this.acc = 0;

    // high scores
    this.highScores = [];

    // callbacks
    this.hooks = {
      onRender: hooks.onRender || (() => {}),
      onStats: hooks.onStats || (() => {}),
      onGameOver: hooks.onGameOver || (() => {}),
      onAttractTick: hooks.onAttractTick || (() => {}),
      onHighScoresChanged: hooks.onHighScoresChanged || (() => {}),
    };
  }

  gravityMs() {
    return SPEED_MS[this.speed] || 120;
  }

  /* ---------- setup ---------- */
  setSpeed(mode) {
    this.speed = mode in SPEED_MS ? mode : "Normal";
    this.hooks.onStats(this);
  }

  resetBoard() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  start() {
    // start a fresh game
    this.state = State.PLAYING;
    this.resetBoard();
    this.current = { shape: null, color: null, row: 0, col: 3 };
    this.score = 0;
    this.shapesSeen = 0;
    this.linesCompleted = 0;
    this.tetrises = 0;
    this.next = null;
    this.lockFrames = 0;
    this.spawn();
    this.run();
    this.hooks.onRender(this);
    this.hooks.onStats(this);
  }

  enterAttract() {
    this.state = State.ATTRACT;
    this.resetBoard();
    this.current = { shape: null, color: null, row: 0, col: 3 };
    this.score = 0;
    this.hooks.onRender(this);
    this.hooks.onStats(this);
  }

  run() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.acc = 0;
    const tick = (now) => {
      if (!this.running) return;
      const delta = Math.min(1000 / 30, now - (this.lastTime || now));
      this.lastTime = now;
      this.acc += delta;

      if (this.state === State.ATTRACT) {
        this.hooks.onAttractTick(this, delta);
        this.hooks.onRender(this);
        requestAnimationFrame(tick);
        return;
      }

      // AI (lightweight) – set target on spawn; nudge toward target
      if (this.autoPlay && !this.aiInFlight) {
        this.aiInFlight = true;

        if (this.current.row === 0 && this.current.shape) {
          const best = findBestMove(
            this.board,
            this.current,
            this.next,
            ROWS,
            COLS
          );
          this.current.targetCol = best.col;
          this.current.targetRot = best.rot;
          this.current.rotationsLeft = best.rot;
        }

        // move toward the plan
        let moved = false;
        if (this.current.rotationsLeft && this.current.rotationsLeft > 0) {
          if (this.rotate()) {
            this.current.rotationsLeft--;
            moved = true;
          }
        } else if (this.current.col < this.current.targetCol) {
          this.move(1);
          moved = true;
        } else if (this.current.col > this.current.targetCol) {
          this.move(-1);
          moved = true;
        }

        // if touching down, try one smart slide (non-destructive)
        if (!this.canMove(1, 0)) {
          this.attemptSmartFloorSlide();
        }

        this.aiInFlight = false;
      }

      // fixed-step gravity
      while (this.acc >= this.gravityMs()) {
        this.drop();
        this.acc -= this.gravityMs();
      }

      this.hooks.onRender(this);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- collision & motion ---------- */
  canMove(
    dr,
    dc,
    shape = this.current.shape,
    row = this.current.row,
    col = this.current.col
  ) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (!shape[r][c]) continue;
        const nr = row + r + dr;
        const nc = col + c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return false;
        if (this.board[nr][nc]) return false;
      }
    }
    return true;
  }

  move(dir) {
    if (this.state !== State.PLAYING) return false;
    if (this.canMove(0, dir)) {
      this.current.col += dir;
      this.lockFrames = 0;
      return true;
    }
    return false;
  }

  rotate() {
    if (this.state !== State.PLAYING) return false;
    if (!this.current.shape) return false;
    const rotated = rotateMatrix(this.current.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (this.canMove(0, 0, rotated, this.current.row, this.current.col + k)) {
        this.current.shape = rotated;
        this.current.col += k;
        this.lockFrames = 0;
        return true;
      }
    }
    return false;
  }

  drop() {
    if (this.state !== State.PLAYING) return;

    if (this.canMove(1, 0)) {
      this.current.row++;
      this.lockFrames = 0;
      return;
    }

    // try a smart slide into an adjacent gap BEFORE locking
    if (this.attemptSmartFloorSlide()) {
      this.lockFrames = 0;
      return;
    }

    // small lock delay to allow last-moment adjustments
    this.lockFrames++;
    if (this.lockFrames < this.LOCK_DELAY_STEPS) return;

    this.lockFrames = 0;
    this.merge();
    this.spawn();
  }

  /* ---------- “smart” floor slide that avoids leaving new gaps ---------- */
  attemptSmartFloorSlide() {
    const MAX_STEP = 4;

    // baseline: if we lock here, what holes?
    const base = this.#simulateLock(this.current.row, this.current.col);
    const baseHoles = this.#countHoles(base.board);
    const baseFall = 0; // at floor, no fall

    let best = null;

    for (const dir of [1, -1]) {
      for (let s = 1; s <= MAX_STEP; s++) {
        const targetCol = this.current.col + dir * s;

        // path at current row must be clear step-by-step
        if (!this.canMove(0, targetCol - this.current.col)) break;

        // must be able to descend at least one cell
        if (
          !this.canMove(1, 0, this.current.shape, this.current.row, targetCol)
        )
          continue;

        // from that column, how far can we fall?
        let r = this.current.row;
        while (this.canMove(1, 0, this.current.shape, r, targetCol)) r++;

        const sim = this.#simulateLock(r, targetCol);
        const holes = this.#countHoles(sim.board);
        const fall = r - this.current.row;

        // prefer options that FALL further and DO NOT increase holes
        if (fall > baseFall && holes <= baseHoles) {
          // secondary: less bumpiness, less blockades
          const quality =
            -this.#getBumpiness(sim.board) - this.#getBlockades(sim.board);
          const score = fall * 100 + (baseHoles - holes) * 40 + quality * 0.5;
          if (!best || score > best.score)
            best = { col: targetCol, row: this.current.row + 1, score };
        }
      }
    }

    if (best) {
      this.current.col = best.col;
      this.current.row = Math.min(best.row, ROWS - 1);
      return true;
    }
    return false;
  }

  /* ---------- merge/clear/score ---------- */
  merge() {
    const sh = this.current.shape;
    for (let r = 0; r < sh.length; r++) {
      for (let c = 0; c < sh[0].length; c++) {
        if (sh[r][c])
          this.board[this.current.row + r][this.current.col + c] =
            this.current.color;
      }
    }

    // clear lines
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r].every((x) => x)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }

    if (cleared) {
      let bonus = 0;
      if (cleared === 4) {
        bonus = 800;
        this.tetrises++;
        this.hooks.onRender(this, { fireworks: true });
      }
      this.linesCompleted += cleared;
      this.lineBonusMultiplier = 1 + this.linesCompleted * 0.001;
      const mult = (SCORE_MULT[this.speed] || 1) * this.lineBonusMultiplier;
      this.score += Math.round((cleared * 100 + bonus) * mult);
      this.hooks.onStats(this);
    }
  }

  spawn() {
    if (!this.next) this.next = rngShape();
    this.current = {
      shape: this.next.shape.map((r) => r.slice()),
      color: this.next.color,
      row: 0,
      col: 3,
    };
    this.next = rngShape();
    this.shapesSeen++;
    this.hooks.onStats(this);

    // game over?
    if (
      !this.canMove(
        0,
        0,
        this.current.shape,
        this.current.row,
        this.current.col
      )
    ) {
      this.gameOver();
    }
  }

  gameOver() {
    const final = this.score;
    const wasAuto = this.autoPlay;
    // reset “visible” state and go to attract; UI will prompt for name if manual play
    this.enterAttract();
    this.hooks.onGameOver(final, wasAuto);
  }

  /* ---------- board metrics used by slide heuristic ---------- */
  #countHoles(bd) {
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let block = false;
      for (let r = 0; r < ROWS; r++) {
        if (bd[r][c]) block = true;
        else if (block) holes++;
      }
    }
    return holes;
  }
  #getHeights(bd) {
    const h = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (bd[r][c]) {
          h[c] = ROWS - r;
          break;
        }
      }
    }
    return h;
  }
  #getBumpiness(bd) {
    const h = this.#getHeights(bd);
    let s = 0;
    for (let i = 0; i < h.length - 1; i++) s += Math.abs(h[i] - h[i + 1]);
    return s;
  }
  #getBlockades(bd) {
    let b = 0;
    for (let c = 0; c < COLS; c++) {
      let hole = false;
      for (let r = 0; r < ROWS; r++) {
        if (!bd[r][c]) hole = true;
        else if (hole) b++;
      }
    }
    return b;
  }

  #simulateLock(row, col) {
    const tb = this.board.map((r) => r.slice());
    const sh = this.current.shape;
    for (let tr = 0; tr < sh.length; tr++) {
      for (let tc = 0; tc < sh[0].length; tc++) {
        if (sh[tr][tc]) tb[row + tr][col + tc] = this.current.color;
      }
    }
    // clear lines in the simulation
    let lines = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (tb[r].every((x) => x)) {
        tb.splice(r, 1);
        tb.unshift(Array(COLS).fill(0));
        lines++;
        r++;
      }
    }
    return { board: tb, linesCleared: lines };
  }

  /* ---------- storage ---------- */
  getDefaultHighScores() {
    return [
      { name: "Paul Atreides", score: 12840 },
      { name: "Ender Wiggin", score: 11320 },
      { name: "Hari Seldon", score: 10680 },
      { name: "Valentine Michael Smith", score: 9950 },
      { name: "Case", score: 9420 },
      { name: "R. Daneel Olivaw", score: 8870 },
      { name: "Gully Foyle", score: 8450 },
      { name: "Trillian", score: 7930 },
      { name: "Rick Deckard", score: 7610 },
      { name: "Mark Watney", score: 7240 },
    ];
  }

  encodeScores(list) {
    const json = JSON.stringify(list);
    return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  }
  decodeScores(str) {
    try {
      const bytes = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return [];
    }
  }

  loadHighScores(textareaEl) {
    let loaded = false,
      list;

    if (textareaEl && textareaEl.value) {
      const decoded = this.decodeScores(textareaEl.value);
      if (Array.isArray(decoded) && decoded.length) {
        list = decoded;
        loaded = true;
      }
    }
    if (!loaded) {
      try {
        const data = localStorage.getItem("tetrisHighScores");
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && parsed.length) {
            list = parsed;
            loaded = true;
          }
        }
      } catch {}
    }
    if (!loaded) {
      list = this.getDefaultHighScores();
      localStorage.setItem("tetrisHighScores", JSON.stringify(list));
      if (textareaEl) textareaEl.value = this.encodeScores(list);
    }
    list.sort((a, b) => b.score - a.score);
    if (list.length > 10) list.length = 10;
    this.highScores = list;
    this.hooks.onHighScoresChanged(this.highScores);
  }

  saveHighScore(entry, textareaEl) {
    this.highScores.push(entry);
    this.highScores.sort((a, b) => b.score - a.score);
    if (this.highScores.length > 10) this.highScores.length = 10;
    localStorage.setItem("tetrisHighScores", JSON.stringify(this.highScores));
    if (textareaEl) textareaEl.value = this.encodeScores(this.highScores);
    this.hooks.onHighScoresChanged(this.highScores);
  }
}
