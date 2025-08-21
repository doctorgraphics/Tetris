// engine.js — core state, physics, scoring, storage

import { findBestMove } from "./ai.js";

export const ROWS = 20;
export const COLS = 10;

export const SPEED_MS = { Slow: 400, Normal: 120, Fast: 55, Impossible: 18 };
export const SCORE_MULT = { Slow: 0.75, Normal: 1, Fast: 1.5, Impossible: 2 };

export const SHAPES = [
  { shape: [[1, 1, 1, 1]], color: "#00c3ff" }, // I
  { shape: [[1, 1], [1, 1]], color: "#ffe600" }, // O
  { shape: [[0, 1, 0], [1, 1, 1]], color: "#a259f7" }, // T
  { shape: [[1, 0, 0], [1, 1, 1]], color: "#0051ba" }, // J
  { shape: [[0, 0, 1], [1, 1, 1]], color: "#ff7f00" }, // L
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#00d100" }, // S
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#ff1e56" }, // Z
];

export const State = { ATTRACT: "ATTRACT", PLAYING: "PLAYING" };

export function deepCopy(matrix) {
  return matrix.map((row) => row.slice());
}

export function rotateMatrix(matrix) {
  return matrix[0].map((_, i) => matrix.map((row) => row[i]).reverse());
}

function randomShape() {
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
    this.aiInFlight = false;
    this.lockFrames = 0;
    this.LOCK_DELAY_STEPS = 3;
    this.running = false;
    this.lastTime = 0;
    this.acc = 0;
    this.highScores = [];

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

  setSpeed(mode) {
    this.speed = mode in SPEED_MS ? mode : "Normal";
    this.hooks.onStats(this);
  }

  resetBoard() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  start() {
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
    this.running = false;
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

      if (this.autoPlay && !this.aiInFlight) {
        this.aiInFlight = true;
        if (this.current.row === 0 && this.current.shape && this.next) {
          const best = findBestMove(this.board, this.current, this.next);
          this.current.targetCol = best.col;
          this.current.targetRot = best.rot;
          this.current.rotationsLeft = best.rot;
        }

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

        if (!this.canMove(1, 0)) {
          this.attemptSmartFloorSlide();
        }

        this.aiInFlight = false;
      }

      while (this.acc >= this.gravityMs()) {
        this.drop();
        this.acc -= this.gravityMs();
      }

      this.hooks.onRender(this);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  canMove(dr, dc, shape = this.current.shape, row = this.current.row, col = this.current.col) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (!shape[r][c]) continue;
        const nr = row + r + dr;
        const nc = col + c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || this.board[nr][nc]) {
          return false;
        }
      }
    }
    return true;
  }

  move(dc) {
    if (this.canMove(0, dc)) {
      this.current.col += dc;
      this.lockFrames = 0;
      return true;
    }
    return false;
  }

  rotate() {
    const rotated = rotateMatrix(this.current.shape);
    let offset = 0;
    while (offset < this.current.shape[0].length) {
      if (this.canMove(0, 0, rotated)) {
        this.current.shape = rotated;
        this.lockFrames = 0;
        return true;
      }
      if (this.canMove(0, -1, rotated)) {
        this.current.col--;
        this.current.shape = rotated;
        this.lockFrames = 0;
        return true;
      }
      if (this.canMove(0, 1, rotated)) {
        this.current.col++;
        this.current.shape = rotated;
        this.lockFrames = 0;
        return true;
      }
      offset++;
    }
    return false;
  }

  drop() {
    if (this.canMove(1, 0)) {
      this.current.row++;
      this.lockFrames = 0;
    } else {
      this.lockFrames++;
      if (this.lockFrames >= this.LOCK_DELAY_STEPS) {
        this.merge();
        this.spawn();
      }
    }
  }

  merge() {
    const shape = this.current.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (shape[r][c]) {
          this.board[this.current.row + r][this.current.col + c] = this.current.color;
        }
      }
    }

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
    if (!this.next) this.next = randomShape();
    this.current = {
      shape: this.next.shape.map((r) => r.slice()),
      color: this.next.color,
      row: 0,
      col: 3,
    };
    this.next = randomShape();
    this.shapesSeen++;
    this.hooks.onStats(this);

    if (!this.canMove(0, 0, this.current.shape, this.current.row, this.current.col)) {
      this.gameOver();
    }
  }

  gameOver() {
    const final = this.score;
    const wasAuto = this.autoPlay;
    this.enterAttract();
    this.hooks.onGameOver(final, wasAuto);
  }

  #countHoles(board) {
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let block = false;
      for (let r = 0; r < ROWS; r++) {
        if (board[r][c]) block = true;
        else if (block) holes++;
      }
    }
    return holes;
  }

  #getHeights(board) {
    const heights = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (board[r][c]) {
          heights[c] = ROWS - r;
          break;
        }
      }
    }
    return heights;
  }

  #getBumpiness(board) {
    const heights = this.#getHeights(board);
    let sum = 0;
    for (let i = 0; i < heights.length - 1; i++) sum += Math.abs(heights[i] - heights[i + 1]);
    return sum;
  }

  #getBlockades(board) {
    let blockades = 0;
    for (let c = 0; c < COLS; c++) {
      let hole = false;
      for (let r = 0; r < ROWS; r++) {
        if (!board[r][c]) hole = true;
        else if (hole) blockades++;
      }
    }
    return blockades;
  }

  #simulateLock(row, col) {
    const testBoard = this.board.map((r) => r.slice());
    const shape = this.current.shape;
    for (let tr = 0; tr < shape.length; tr++) {
      for (let tc = 0; tc < shape[0].length; tc++) {
        if (shape[tr][tc]) testBoard[row + tr][col + tc] = this.current.color;
      }
    }
    let linesCleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (testBoard[r].every((x) => x)) {
        testBoard.splice(r, 1);
        testBoard.unshift(Array(COLS).fill(0));
        linesCleared++;
        r++;
      }
    }
    return { board: testBoard, linesCleared };
  }

  attemptSmartFloorSlide() {
    const origCol = this.current.col;
    let bestScore = -Infinity, bestCol = origCol;

    for (let dc = -1; dc <= 1; dc++) {
      const newCol = this.current.col + dc;
      if (this.canMove(0, dc)) {
        const { board: simBoard, linesCleared } = this.#simulateLock(this.current.row, newCol);
        const score =
          -this.#countHoles(simBoard) * 7 -
          this.#getBumpiness(simBoard) * 1.5 +
          linesCleared * 200;
        if (score > bestScore) {
          bestScore = score;
          bestCol = newCol;
        }
      }
    }

    if (bestCol !== origCol) {
      this.current.col = bestCol;
    }
  }

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
    } catch (e) {
      console.warn("Failed to decode high scores:", e.message);
      return [];
    }
  }

  loadHighScores(textareaEl) {
    let loaded = false, list;
    if (textareaEl && textareaEl.value) {
      try {
        const decoded = this.decodeScores(textareaEl.value);
        if (Array.isArray(decoded) && decoded.length) {
          list = decoded;
          loaded = true;
        } else {
          console.warn("Textarea contains invalid or empty high score data");
        }
      } catch (e) {
        console.warn("Error decoding textarea high scores:", e.message);
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
      } catch {
        console.warn("Error loading high scores from localStorage");
      }
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