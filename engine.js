// engine.js — Manages Tetris game state, physics, scoring, and high score storage

import { findBestMove } from "./ai.js";

// Game board dimensions
export const ROWS = 20;
export const COLS = 10;

// Speed settings (milliseconds per gravity tick) and score multipliers
export const SPEED_MS = { Slow: 400, Normal: 120, Fast: 55, Impossible: 18 };
export const SCORE_MULT = { Slow: 0.75, Normal: 1, Fast: 1.5, Impossible: 2 };

// Tetromino shapes and colors
export const SHAPES = [
  { shape: [[1, 1, 1, 1]], color: "#00c3ff" }, // I
  { shape: [[1, 1], [1, 1]], color: "#ffe600" }, // O
  { shape: [[0, 1, 0], [1, 1, 1]], color: "#a259f7" }, // T
  { shape: [[1, 0, 0], [1, 1, 1]], color: "#0051ba" }, // J
  { shape: [[0, 0, 1], [1, 1, 1]], color: "#ff7f00" }, // L
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#00d100" }, // S
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#ff1e56" }, // Z
];

// Game states
export const State = { ATTRACT: "ATTRACT", PLAYING: "PLAYING" };

// Utility functions
export const deepCopy = (matrix) => matrix.map((row) => row.slice());

export const rotateMatrix = (matrix) =>
  matrix[0].map((_, i) => matrix.map((row) => row[i]).reverse());

const randomShape = () => SHAPES[Math.floor(Math.random() * SHAPES.length)];

export class Engine {
  constructor(hooks = {}) {
    // Game state
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
    this.aiStallCounter = 0;
    this.highScores = [];

    // Callbacks for UI updates
    this.hooks = {
      onRender: hooks.onRender || (() => {}),
      onStats: hooks.onStats || (() => {}),
      onGameOver: hooks.onGameOver || (() => {}),
      onAttractTick: hooks.onAttractTick || (() => {}),
      onHighScoresChanged: hooks.onHighScoresChanged || (() => {}),
    };
  }

  // Returns gravity interval based on current speed
  getGravityMs() {
    return SPEED_MS[this.speed] || 120;
  }

  // Sets game speed and updates stats
  setSpeed(mode) {
    this.speed = mode in SPEED_MS ? mode : "Normal";
    this.hooks.onStats(this);
  }

  // Initializes an empty board
  resetBoard() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  // Starts a new game
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
    this.aiStallCounter = 0;
    this.spawn();
    this.run();
    this.hooks.onRender(this);
    this.hooks.onStats(this);
  }

  // Enters attract mode (demo state)
  enterAttract() {
    this.state = State.ATTRACT;
    this.resetBoard();
    this.current = { shape: null, color: null, row: 0, col: 3 };
    this.score = 0;
    this.running = false;
    this.hooks.onRender(this);
    this.hooks.onStats(this);
  }

  // Main game loop
  run() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.acc = 0;
    const MAX_AI_ATTEMPTS = 10;

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
        let moved = false;

        if (this.current.row === 0 && this.current.shape && this.next) {
          const best = findBestMove(this.board, this.current, this.next);
          this.current.targetCol = best.col;
          this.current.targetRot = best.rot;
          this.current.rotationsLeft = best.rot;
          this.aiStallCounter = 0;
        }

        if (this.current.rotationsLeft && this.current.rotationsLeft > 0) {
          if (this.rotate()) {
            this.current.rotationsLeft--;
            moved = true;
          }
        } else if (this.current.col < this.current.targetCol) {
          if (this.move(1)) moved = true;
        } else if (this.current.col > this.current.targetCol) {
          if (this.move(-1)) moved = true;
        }

        if (!this.canMove(1, 0)) {
          if (this.attemptSmartFloorSlide()) {
            moved = true;
            if (!this.canMove(1, 0)) this.lockFrames++;
          }
        }

        if (!moved && !this.canMove(1, 0)) {
          this.aiStallCounter++;
          if (this.aiStallCounter >= MAX_AI_ATTEMPTS) {
            this.merge();
            this.spawn();
            this.aiStallCounter = 0;
          }
        }

        this.aiInFlight = false;
      }

      while (this.acc >= this.getGravityMs()) {
        this.drop();
        this.acc -= this.getGravityMs();
      }

      this.hooks.onRender(this);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Checks if a piece can move or rotate
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

  // Moves the piece left or right
  move(dc) {
    if (this.canMove(0, dc)) {
      this.current.col += dc;
      this.lockFrames = 0;
      return true;
    }
    return false;
  }

  // Rotates the piece with wall-kick attempts
  rotate() {
    const rotated = rotateMatrix(this.current.shape);
    for (let offset = 0; offset < this.current.shape[0].length; offset++) {
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
    }
    return false;
  }

  // Drops the piece one row or locks it
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

  // Merges the current piece into the board and handles line clears
  merge() {
    const { shape, color, row, col } = this.current;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (shape[r][c]) {
          this.board[row + r][col + c] = color;
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
      let bonus = cleared === 4 ? 800 : 0;
      if (cleared === 4) {
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

  // Spawns a new piece
  spawn() {
    if (!this.next) this.next = randomShape();
    this.current = {
      shape: deepCopy(this.next.shape),
      color: this.next.color,
      row: 0,
      col: 3,
    };
    this.next = randomShape();
    this.shapesSeen++;
    this.hooks.onStats(this);

    if (!this.canMove(0, 0)) {
      this.gameOver();
    }
  }

  // Ends the game and transitions to attract mode
  gameOver() {
    const final = this.score;
    const wasAuto = this.autoPlay;
    this.enterAttract();
    this.hooks.onGameOver(final, wasAuto);
  }

  // Heuristic calculations for smart floor slide
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

  #getColumnHeights(board) {
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
    const heights = this.#getColumnHeights(board);
    return heights.slice(0, -1).reduce((sum, h, i) => sum + Math.abs(h - heights[i + 1]), 0);
  }

  #simulateLock(row, col) {
    const testBoard = deepCopy(this.board);
    const { shape, color } = this.current;
    for (let tr = 0; tr < shape.length; tr++) {
      for (let tc = 0; tc < shape[0].length; tc++) {
        if (shape[tr][tc]) testBoard[row + tr][col + tc] = color;
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

  // Attempts to slide the piece left or right when grounded
  attemptSmartFloorSlide() {
    const origCol = this.current.col;
    let bestScore = -Infinity, bestCol = origCol;

    for (let dc = -3; dc <= 3; dc++) {
      const newCol = this.current.col + dc;
      if (this.canMove(0, dc)) {
        const { board: simBoard, linesCleared } = this.#simulateLock(this