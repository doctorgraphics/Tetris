import { findBestMove, evaluateBoardScore, simulateLock } from "./ai.js";

export function createEngine(dom) {
  // ---------- Consts ----------
  const ROWS = 20,
    COLS = 10,
    CELL = 20;
  const SPEED_MS = { Slow: 400, Normal: 120, Fast: 50, Impossible: 15 };
  const SCORE_MULT = { Slow: 0.75, Normal: 1, Fast: 1.5, Impossible: 2 };
  const LOCK_DELAY_STEPS = 3;

  const BANNER = ["LET'S", "PLAY", "TETRIS!"]; // centered 3 lines per your spec

  // ---------- Canvas & Contexts ----------
  const boardCv = dom.boardCanvas,
    bctx = boardCv.getContext("2d");
  const nextCv = dom.nextCanvas,
    nctx = nextCv.getContext("2d");

  // ---------- State ----------
  const State = { ATTRACT: "ATTRACT", PLAYING: "PLAYING" };
  let state = State.ATTRACT;

  const SHAPES = [
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

  let board = emptyBoard();
  let next = null;
  let current = { shape: null, color: null, row: 0, col: 3 };
  let score = 0,
    shapesSeen = 0,
    linesCompleted = 0,
    tetrises = 0;
  let currentSpeed = "Slow",
    lineBonusMultiplier = 1;

  // Gravity/loop
  let rAF = 0,
    lastT = 0,
    gravAcc = 0;
  // lock timing in gravity-steps
  let lockSteps = 0;

  // Autoplay
  let autoPlay = false;
  let aiTarget = null; // {col, rot, rotationsLeft}

  // Attract
  const ATTRACT_TICK_MS = 120;
  const ATTRACT_RESPAWN_MS = 1500;
  let attractTimer = 0,
    attractMsg = BANNER.slice(),
    attractX = COLS,
    attractY = centerYFor(attractMsg.length),
    attractMode = "scroll",
    attractColor = randomPieceColor();

  // High scores & prompt
  let highScores = [];
  let pendingScore = null;
  let fireworksTimer = null;

  // ---------- Init ----------
  loadHighScores();
  updateHighList();
  drawNextPiece(null);
  updateScoreUI();
  updateStatsUI();

  // Public API ------------------------------------------------------
  const api = {
    startNewGame,
    setSpeed,
    toggleAutoPlay,
    moveLeft: () => tryMove(-1),
    moveRight: () => tryMove(1),
    rotate: () => rotate(),
    softDrop: () => dropOnce(),
    enterAttract,
    acceptName(name) {
      hidePrompt();
      if (pendingScore != null) {
        saveHighScore({
          name: (name || "Player").trim() || "Player",
          score: pendingScore,
        });
        pendingScore = null;
        enterAttract();
      }
    },
    resetScores() {
      highScores = defaultHighScores();
      persistScores();
      updateHighList();
    },
    get ROWS() {
      return ROWS;
    },
    get COLS() {
      return COLS;
    },
  };

  // ---------- Game loop ----------
  function loop(ts) {
    rAF = requestAnimationFrame(loop);
    const dt = Math.min(48, ts - (lastT || ts)); // clamp big tab jumps
    lastT = ts;

    if (state === State.ATTRACT) {
      attractTimer += dt;
      if (attractTimer >= ATTRACT_TICK_MS) {
        attractTimer = 0;
        stepAttract();
      }
      drawAttract();
      return;
    }

    // PLAYING
    // rAF updates rendering every frame, but gravity is time-accumulated
    gravAcc += dt;
    const gms = SPEED_MS[currentSpeed] || 120;
    while (gravAcc >= gms) {
      gravAcc -= gms;
      tickGravity();
    }
    drawBoard();
  }

  // ---------- Start/Stop ----------
  function startLoop() {
    if (!rAF) rAF = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (rAF) cancelAnimationFrame(rAF);
    rAF = 0;
    lastT = 0;
    gravAcc = 0;
  }

  // ---------- Board helpers ----------
  function emptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }
  function rotateMatrix(m) {
    return m[0].map((_, i) => m.map((r) => r[i]).reverse());
  }
  function canPlaceAt(shape, col, row = 0, bd = board) {
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[0].length; c++)
        if (shape[r][c]) {
          const nr = row + r,
            nc = col + c;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || bd[nr][nc])
            return false;
        }
    return true;
  }

  // ---------- Rendering ----------
  function clear(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
  }
  function drawCell(ctx, c, r, color) {
    ctx.fillStyle = color;
    ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    ctx.strokeStyle = "#ccc";
    ctx.strokeRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1);
  }
  function drawBoard() {
    clear(bctx, boardCv.width, boardCv.height);
    // settled
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (board[r][c]) drawCell(bctx, c, r, board[r][c]);
    // active
    if (current.shape) {
      for (let rr = 0; rr < current.shape.length; rr++)
        for (let cc = 0; cc < current.shape[0].length; cc++)
          if (current.shape[rr][cc])
            drawCell(bctx, current.col + cc, current.row + rr, current.color);
    }
  }
  function drawNextPiece(piece) {
    clear(nctx, nextCv.width, nextCv.height);
    if (!piece) return;
    const s = piece.shape;
    const rows = s.length,
      cols = s[0].length;
    const size = 20,
      offx = (nextCv.width - cols * size) / 2,
      offy = (nextCv.height - rows * size) / 2;
    nctx.fillStyle = "#ccc";
    nctx.lineWidth = 1;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (s[r][c]) {
          nctx.fillStyle = piece.color;
          nctx.fillRect(offx + c * size, offy + r * size, size, size);
          nctx.strokeStyle = "#ddd";
          nctx.strokeRect(
            offx + c * size + 0.5,
            offy + r * size + 0.5,
            size - 1,
            size - 1
          );
        }
  }

  // ---------- UI updates ----------
  function updateScoreUI() {
    dom.scoreEl.textContent = `Score: ${score}`;
  }
  function updateStatsUI() {
    const heights = getColumnHeights(board);
    const avgHeight = (heights.reduce((a, b) => a + b, 0) / COLS).toFixed(1);
    const maxHeight = Math.max(0, ...heights);
    const baseMult = SCORE_MULT[currentSpeed] || 1;
    const totalMult = (baseMult * lineBonusMultiplier).toFixed(3);
    dom.statsEl.innerHTML = `
      <div><b>Game Stats</b></div>
      <div style="margin-top:6px;line-height:1.4">
        Lines completed: <b>${linesCompleted}</b><br>
        Tetrises: <b>${tetrises}</b><br>
        Shapes seen: <b>${shapesSeen}</b><br>
        Avg board height: <b>${avgHeight}</b><br>
        Current board height: <b>${maxHeight}</b><br>
        Speed: <b>${currentSpeed}</b> &nbsp; Multiplier: <b>×${totalMult}</b>
      </div>`;
  }
  function updateHighList() {
    const el = dom.highListEl;
    el.innerHTML = highScores
      .map(
        (s) => `
      <li>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px;"><b>${escapeHtml(
          s.name
        )}</b></span>
        <span style="text-align:right;min-width:50px;display:inline-block;font-variant-numeric:tabular-nums;">${
          s.score
        }</span>
      </li>
    `
      )
      .join("");
  }
  const htmlEsc = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => htmlEsc[c]);
  }

  // ---------- Game control ----------
  function startNewGame() {
    state = State.PLAYING;
    board = emptyBoard();
    score = 0;
    shapesSeen = 0;
    linesCompleted = 0;
    tetrises = 0;
    next = null;
    current = { shape: null, color: null, row: 0, col: 3 };
    lockSteps = 0;
    lineBonusMultiplier = 1;
    updateScoreUI();
    updateStatsUI();
    newPiece();
    startLoop();
  }
  function enterAttract() {
    state = State.ATTRACT;
    board = emptyBoard();
    current = { shape: null, color: null, row: 0, col: 3 };
    score = 0;
    updateScoreUI();
    updateStatsUI();
    attractMsg = BANNER.slice();
    attractX = COLS;
    attractY = centerYFor(attractMsg.length);
    attractMode = "scroll";
    attractColor = randomPieceColor();
    startLoop();
  }

  function setSpeed(mode) {
    currentSpeed = mode in SPEED_MS ? mode : "Normal";
  }
  function toggleAutoPlay(force) {
    autoPlay = typeof force === "boolean" ? force : !autoPlay;
  }

  // ---------- Piece ops ----------
  function tryMove(dx) {
    if (state !== State.PLAYING || !current.shape) return;
    if (canPlaceAt(current.shape, current.col + dx, current.row)) {
      current.col += dx;
      lockSteps = 0;
    }
  }
  function rotate() {
    if (state !== State.PLAYING || !current.shape) return false;
    const rotated = rotateMatrix(current.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (canPlaceAt(rotated, current.col + k, current.row)) {
        current.shape = rotated;
        current.col += k;
        lockSteps = 0;
        return true;
      }
    }
    return false;
  }

  function dropOnce() {
    if (state !== State.PLAYING || !current.shape) return;
    if (canPlaceAt(current.shape, current.col, current.row + 1)) {
      current.row++;
      lockSteps = 0;
    } else {
      // on floor: try smart floor slide that *improves* board & falls at least one
      if (attemptSmartFloorSlide()) {
        lockSteps = 0; // we slid & moved down
      } else {
        // lock delay (counts gravity ticks at floor)
        lockSteps++;
        if (lockSteps >= LOCK_DELAY_STEPS) {
          lockSteps = 0;
          merge();
          newPiece();
        }
      }
    }
  }

  function merge() {
    // stick piece
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[0].length; c++)
        if (current.shape[r][c])
          board[current.row + r][current.col + c] = current.color;

    // clear lines
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((x) => x)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared) {
      let bonus = 0;
      if (cleared === 4) {
        bonus = 800;
        tetrises++;
        fireworksBurst();
      }
      linesCompleted += cleared;
      lineBonusMultiplier = 1 + linesCompleted * 0.001;
      const mult = (SCORE_MULT[currentSpeed] || 1) * lineBonusMultiplier;
      score += Math.round((cleared * 100 + bonus) * mult);
      updateScoreUI();
      updateStatsUI();
    }
  }

  function newPiece() {
    if (!next) next = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    current = {
      shape: next.shape.map((r) => r.slice()),
      color: next.color,
      row: 0,
      col: 3,
    };
    next = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    drawNextPiece(next);
    shapesSeen++;
    updateStatsUI();

    // game over?
    if (!canPlaceAt(current.shape, current.col, current.row)) {
      addHighScore(score);
      // back to attract
      enterAttract();
    }

    // reset AI plan
    aiTarget = null;
  }

  function tickGravity() {
    // If autoplay, steer toward planned spot
    if (autoPlay && current.shape) {
      if (!aiTarget) {
        const best = findBestMove(board, current, next, COLS, ROWS);
        aiTarget = { col: best.col, rot: best.rot, rotationsLeft: best.rot };
      }
      if (aiTarget.rotationsLeft > 0) {
        if (rotate()) aiTarget.rotationsLeft--;
      } else if (current.col < aiTarget.col) {
        tryMove(1);
      } else if (current.col > aiTarget.col) {
        tryMove(-1);
      }
    }
    dropOnce();
  }

  // ---------- Smart floor slide that won't leave gaps ----------
  function attemptSmartFloorSlide() {
    const MAX_SLIDE = 4,
      IMPROVE_EPS = 100;

    // baseline: locking right here
    const { score: baseScore } = scoreIfLockHere();

    let best = null;
    for (const dir of [1, -1]) {
      for (let step = 1; step <= MAX_SLIDE; step++) {
        const testCol = current.col + dir * step;
        if (testCol < 0 || testCol > COLS - 1) break;

        // path clear at current row (step-by-step)
        if (!canPlaceAt(current.shape, testCol, current.row)) break;

        // must be able to drop at least 1 from there
        if (!canPlaceAt(current.shape, testCol, current.row + 1)) continue;

        // find rest row after sliding
        let rr = current.row;
        while (canPlaceAt(current.shape, testCol, rr + 1)) rr++;

        const { score: sc } = simulateAndScore(testCol, rr);
        // prefer deeper falls, then heuristic
        const fall = rr - current.row;
        const combined = fall * 10 + sc;

        if (!best || combined > best.combined)
          best = { col: testCol, row: rr, combined, sc, fall };
      }
    }

    if (best && best.sc >= baseScore + IMPROVE_EPS && best.fall >= 1) {
      // commit slide & move down one row now (gravity will continue next tick)
      current.col = best.col;
      current.row++;
      return true;
    }
    return false;
  }

  function scoreIfLockHere() {
    const rr = settleRowAt(current.shape, current.col, current.row, board);
    return simulateAndScore(current.col, rr);
  }
  function simulateAndScore(col, row) {
    const { board: tb, linesCleared } = simulateLock(
      board,
      current.shape,
      row,
      col,
      current.color
    );
    const score = evaluateBoardScore(tb, linesCleared);
    return { score, linesCleared, board: tb };
  }
  function settleRowAt(shape, col, startRow, bd) {
    let r = startRow;
    while (canPlaceAt(shape, col, r + 1, bd)) r++;
    return r;
  }

  // ---------- Heuristics helpers for stats ----------
  function getColumnHeights(bd) {
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

  // ---------- Attract Mode ----------
  function centerXFor(lines) {
    const w = Math.max(...lines.map((s) => s.length));
    return Math.floor((COLS - w) / 2);
  }
  function centerYFor(count) {
    return Math.floor((ROWS - count) / 2);
  }
  function randomPieceColor() {
    return SHAPES[Math.floor(Math.random() * SHAPES.length)].color;
  }

  function drawAttract() {
    clear(bctx, boardCv.width, boardCv.height);
    const widths = attractMsg.map((s) => s.length);
    const maxW = Math.max(...widths);
    const offsets = widths.map((w) => Math.floor((maxW - w) / 2));
    bctx.font = `${CELL - 4}px monospace`;
    bctx.textBaseline = "top";
    bctx.fillStyle = attractColor;

    for (let line = 0; line < attractMsg.length; line++) {
      const str = attractMsg[line];
      for (let i = 0; i < str.length; i++) {
        const col = attractX + i + offsets[line];
        const row = attractY + line;
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
          bctx.fillRect(col * CELL, row * CELL, CELL, CELL);
          bctx.fillStyle = "#000";
          bctx.fillText(str[i], col * CELL + 5, row * CELL + 2);
          bctx.fillStyle = attractColor;
        }
      }
    }
  }
  function stepAttract() {
    if (attractMode === "scroll") {
      const target = centerXFor(attractMsg);
      if (attractX > target) attractX--;
      else attractMode = "drop";
    } else {
      attractY++;
      if (attractY > ROWS) {
        // queue next message
        setTimeout(() => {
          const nextMsg = nextAttractMessage();
          setAttractMessage(nextMsg);
        }, ATTRACT_RESPAWN_MS);
      }
    }
  }
  function setAttractMessage(lines) {
    attractMsg = lines.slice();
    attractX = COLS;
    attractY = centerYFor(attractMsg.length);
    attractMode = "scroll";
    attractColor = randomPieceColor();
  }
  function* makeAttractQueue() {
    yield BANNER;
    for (const s of highScores.slice(0, 10)) {
      const lines = makeHighScoreLines(s);
      yield lines;
    }
  }
  let attractIter = null;
  function nextAttractMessage() {
    if (!attractIter) attractIter = makeAttractQueue();
    const n = attractIter.next();
    if (n.done) {
      attractIter = null;
      return BANNER;
    }
    return n.value;
  }
  function wrapName(name, maxWidth, maxLines) {
    if (name.length <= maxWidth) return [name];
    const words = name.split(/\s+/),
      lines = [],
      push = (s) => s && lines.push(s);
    let cur = "";
    for (const w of words) {
      if ((cur ? cur.length + 1 : 0) + w.length <= maxWidth)
        cur = cur ? cur + " " + w : w;
      else {
        push(cur);
        cur = w.length > maxWidth ? w.slice(0, maxWidth) : w;
      }
      if (lines.length === maxLines - 1 && cur.length >= maxWidth) break;
    }
    push(cur);
    return lines.slice(0, maxLines);
  }
  function makeHighScoreLines(entry) {
    const maxWidth = COLS;
    const nameLines = wrapName(entry.name, maxWidth, 2);
    const scoreLine = `${entry.score}`;
    return [...nameLines, scoreLine];
  }

  // ---------- Scores ----------
  function defaultHighScores() {
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
  function encodeScores(scores) {
    const json = JSON.stringify(scores);
    return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  }
  function decodeScores(str) {
    try {
      const bytes = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return [];
    }
  }
  function loadHighScores() {
    const ta = dom.base64Box;
    let loaded = false;
    if (ta && ta.value) {
      const dec = decodeScores(ta.value);
      if (Array.isArray(dec) && dec.length) {
        highScores = dec;
        loaded = true;
      }
    }
    if (!loaded) {
      try {
        const data = localStorage.getItem("tetrisHighScores");
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && parsed.length) {
            highScores = parsed;
            loaded = true;
          }
        }
      } catch {}
    }
    if (!loaded) {
      highScores = defaultHighScores();
      persistScores();
    }
    highScores.sort((a, b) => b.score - a.score);
    highScores.length = Math.min(highScores.length, 10);
  }
  function persistScores() {
    localStorage.setItem("tetrisHighScores", JSON.stringify(highScores));
    if (dom.base64Box) dom.base64Box.value = encodeScores(highScores);
  }
  function saveHighScore(entry) {
    highScores.push(entry);
    highScores.sort((a, b) => b.score - a.score);
    if (highScores.length > 10) highScores.length = 10;
    persistScores();
    updateHighList();
  }
  function addHighScore(newScore) {
    if (newScore <= 0) return;
    pendingScore = newScore;
    showPrompt();
  }

  // ---------- Fireworks + Prompt ----------
  function fireworksBurst() {
    const cv = dom.fireworks,
      ctx = cv.getContext("2d");
    cv.width = innerWidth;
    cv.height = innerHeight;
    cv.style.display = "block";
    const particles = [],
      colors = [
        "#ff5252",
        "#ffd700",
        "#00e6ff",
        "#a259f7",
        "#00d100",
        "#ff7f00",
      ];
    function spawn() {
      const x = Math.random() * cv.width * 0.6 + cv.width * 0.2;
      const y = Math.random() * cv.height * 0.3 + cv.height * 0.2;
      const color = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 32; i++) {
        const a = (Math.PI * 2 * i) / 32,
          s = Math.random() * 4 + 2;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          alpha: 1,
          color,
        });
      }
    }
    for (let i = 0; i < 3; i++) spawn();
    let frame = 0;
    (function anim() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy = p.vy * 0.96 + 0.05;
        p.alpha *= 0.96;
      }
      frame++;
      if (frame < 60) requestAnimationFrame(anim);
      else cv.style.display = "none";
    })();
  }

  function showPrompt() {
    const wrap = dom.promptWrap;
    wrap.style.display = "flex";
    dom.promptInput.value = "";
    setTimeout(() => dom.promptInput.focus(), 50);
    if (!fireworksTimer) {
      fireworksBurst();
      fireworksTimer = setInterval(fireworksBurst, 1800);
    }
  }
  function hidePrompt() {
    dom.promptWrap.style.display = "none";
    if (fireworksTimer) {
      clearInterval(fireworksTimer);
      fireworksTimer = null;
    }
  }

  // ---------- Keyboard small helpers (optional external) ----------
  // (UI module binds keys and calls api methods)

  // ---------- Expose & start idle loop ----------
  startLoop();
  return api;
}
