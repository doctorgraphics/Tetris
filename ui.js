// ui.js — DOM rendering, attract mode, controls, fireworks, prompts

import { ROWS, COLS } from "./engine.js";

export class UI {
  constructor() {
    // DOM
    this.boardEl = document.querySelector("#board");
    this.nextEl = document.querySelector("#nextPiece");
    this.scoreEl = document.querySelector("#score");
    this.statsEl = document.querySelector("#gameStats");
    this.autoBtn = document.querySelector("#autoBtn");
    this.highScoresEl = document.querySelector("#highScores");
    this.nameModal = document.querySelector("#playerNamePrompt");
    this.nameInput = document.querySelector("#playerNameInput");
    this.nameOk = document.querySelector("#btnNameOk");
    this.fireworks = document.querySelector("#fireworks");
    this.resetBtn = document.querySelector("#resetHighScoresBtn");
    this.dataTA = document.querySelector("#highScoresData");

    // attract state
    this.attractTick = null;
    this.attractX = COLS;
    this.attractY = 0;
    this.attractMode = "scroll";
    this.attractColor = "#888";
    this.attractLines = ["Lets", "Play", "Tetris!"];
    this.ATTRACT_TICK_MS = 120;
    this.ATTRACT_RESPAWN_MS = 1500;

    // fireworks timer
    this.fireworksInterval = null;

    // pre-render an empty board once
    this.#drawGrid(ROWS, COLS);
  }

  /* ---------- rendering ---------- */
  drawGame(engine) {
    const html = [];
    const active = engine.current.shape || [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let color = engine.board[r][c];
        let isActive = false,
          activeColor = null;

        for (let rr = 0; rr < active.length; rr++) {
          for (let cc = 0; cc < (active[0]?.length || 0); cc++) {
            if (
              active[rr][cc] &&
              r === engine.current.row + rr &&
              c === engine.current.col + cc
            ) {
              isActive = true;
              activeColor = engine.current.color;
            }
          }
        }
        const style = isActive
          ? `background:${activeColor};outline:2px solid #e67e22;z-index:2;`
          : color
          ? `background:${color};`
          : "";
        html.push(
          `<span class="cell${
            isActive ? " active" : color ? " filled" : ""
          }" style="${style}"></span>`
        );
      }
    }
    this.boardEl.innerHTML = html.join("");
    this.drawNextPiece(engine);
    this.updateScore(engine);
  }

  drawAttract() {
    const widths = this.attractLines.map((s) => s.length);
    const maxW = Math.max(...widths);
    const offsets = widths.map((w) => Math.floor((maxW - w) / 2));

    const html = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let ch = "";
        for (let line = 0; line < this.attractLines.length; line++) {
          if (r === this.attractY + line) {
            const i = c - this.attractX - offsets[line];
            if (i >= 0 && i < widths[line]) ch = this.attractLines[line][i];
          }
        }
        const style = ch
          ? `background:${this.attractColor};font-weight:bold;`
          : "";
        const displayChar = !ch || ch === " " ? "&nbsp;" : this.#escape(ch);
        html.push(`<span class="cell" style="${style}">${displayChar}</span>`);
      }
    }
    this.boardEl.innerHTML = html.join("");
  }

  drawNextPiece(engine) {
    const next = engine.next;
    if (!next) {
      this.nextEl.innerHTML = "";
      return;
    }
    const sh = next.shape;
    let inner =
      '<div style="display:flex;flex-direction:column;gap:0;align-items:center;justify-content:center;height:100%;width:100%;">';
    for (let r = 0; r < sh.length; r++) {
      inner += '<div style="display:flex;gap:0;">';
      for (let c = 0; c < sh[0].length; c++) {
        const on = !!sh[r][c];
        inner += `<span style="width:20px;height:20px;border:1px solid #ccc;display:inline-block;${
          on ? `background:${next.color};` : ""
        }"></span>`;
      }
      inner += "</div>";
    }
    inner += "</div>";
    this.nextEl.innerHTML = inner;
  }

  updateScore(engine) {
    this.scoreEl.textContent = `Score: ${engine.score}`;
  }

  updateStats(engine) {
    const heights = this.#getColumnHeights(engine.board);
    const avg = heights.reduce((a, b) => a + b, 0) / COLS;
    const max = heights.reduce((a, b) => (a > b ? a : b), 0);
    const baseMult =
      engine.speed in engine.constructor.SCORE_MULT
        ? engine.constructor.SCORE_MULT[engine.speed]
        : 1;
    const totalMult = ((baseMult || 1) * engine.lineBonusMultiplier).toFixed(3);

    this.statsEl.innerHTML = `
      <div><b>Game Stats</b></div>
      <div style="margin-top:6px;line-height:1.4">
        Lines completed: <b>${engine.linesCompleted}</b><br>
        Tetrises: <b>${engine.tetrises}</b><br>
        Shapes seen: <b>${engine.shapesSeen}</b><br>
        Avg board height: <b>${avg.toFixed(1)}</b><br>
        Current board height: <b>${max}</b><br>
        Speed: <b>${engine.speed}</b> &nbsp; Multiplier: <b>×${totalMult}</b>
      </div>`;
  }

  updateHighScores(list) {
    this.highScoresEl.innerHTML = list
      .map(
        (s) => `
      <li>
        <b title="${this.#escape(s.name)}">${this.#escape(s.name)}</b>
        <span>${s.score}</span>
      </li>`
      )
      .join("");
  }

  /* ---------- attract mode ---------- */
  startAttract(getNextMessage) {
    this.stopAttract();
    const centerY = (lines) => Math.floor((ROWS - lines.length) / 2);
    const centerX = (lines) => {
      const width = Math.max(...lines.map((s) => s.length));
      return Math.floor((COLS - width) / 2);
    };
    const pieceColor = () => {
      const colors = [
        "#ff5252",
        "#ffd700",
        "#00e6ff",
        "#a259f7",
        "#00d100",
        "#ff7f00",
        "#3498db",
      ];
      return colors[(Math.random() * colors.length) | 0];
    };

    let queueNext = () => {
      const msg = getNextMessage();
      this.attractLines = msg.slice();
      this.attractX = COLS;
      this.attractY = centerY(this.attractLines);
      this.attractMode = "scroll";
      this.attractColor = pieceColor();
    };

    queueNext();
    this.attractTick = setInterval(() => {
      if (this.attractMode === "scroll") {
        const target = centerX(this.attractLines);
        if (this.attractX > target) this.attractX--;
        else this.attractMode = "drop";
      } else {
        this.attractY++;
        if (this.attractY > ROWS) {
          clearInterval(this.attractTick);
          setTimeout(() => {
            queueNext();
            this.startAttract(getNextMessage);
          }, this.ATTRACT_RESPAWN_MS);
          return;
        }
      }
      this.drawAttract();
    }, this.ATTRACT_TICK_MS);

    this.drawAttract();
  }

  stopAttract() {
    if (this.attractTick) clearInterval(this.attractTick);
    this.attractTick = null;
  }

  /* ---------- fireworks ---------- */
  fireworksOnce() {
    const cv = this.fireworks;
    cv.width = innerWidth;
    cv.height = innerHeight;
    cv.style.display = "block";
    const ctx = cv.getContext("2d");
    const particles = [];
    const colors = [
      "#ff5252",
      "#ffd700",
      "#00e6ff",
      "#a259f7",
      "#00d100",
      "#ff7f00",
    ];

    const burst = () => {
      const x = Math.random() * cv.width * 0.6 + cv.width * 0.2;
      const y = Math.random() * cv.height * 0.3 + cv.height * 0.2;
      const color = colors[(Math.random() * colors.length) | 0];
      for (let i = 0; i < 32; i++) {
        const a = (Math.PI * 2 * i) / 32;
        const s = Math.random() * 4 + 2;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          alpha: 1,
          color,
        });
      }
    };
    for (let i = 0; i < 3; i++) burst();

    let frame = 0;
    (function animate() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
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
      if (frame < 60) requestAnimationFrame(animate);
      else cv.style.display = "none";
    })();
  }

  /* ---------- prompts ---------- */
  promptForName(onSubmit) {
    this.nameModal.style.display = "flex";
    this.nameInput.value = "";
    setTimeout(() => this.nameInput.focus(), 50);
    const handler = () => {
      const name = (this.nameInput.value || "Player").trim();
      this.nameModal.style.display = "none";
      this.nameOk.removeEventListener("click", handler);
      onSubmit(name);
    };
    this.nameOk.addEventListener("click", handler, { once: true });
  }

  /* ---------- controls binding ---------- */
  bindControls(engine) {
    // buttons
    document.querySelector("#btnNew").addEventListener("click", () => {
      this.stopAttract();
      engine.start();
    });

    this.autoBtn.addEventListener("click", () => {
      // turning AI on always ensures a running game
      const next = !engine.autoPlay;
      if (next && engine.state !== "PLAYING") {
        this.stopAttract();
        engine.start();
      }
      engine.autoPlay = next;
      this.autoBtn.textContent = engine.autoPlay
        ? "Stop Auto Play"
        : "Auto Play";
    });

    document
      .querySelector("#btnLeft")
      .addEventListener("mousedown", () => engine.move(-1));
    document
      .querySelector("#btnRight")
      .addEventListener("mousedown", () => engine.move(1));
    document
      .querySelector("#btnRotate")
      .addEventListener("mousedown", () => engine.rotate());
    document
      .querySelector("#btnDrop")
      .addEventListener("mousedown", () => engine.drop());

    // speed radios
    document.querySelectorAll('input[name="speedMode"]').forEach((r) => {
      r.addEventListener("change", () => {
        if (r.checked) engine.setSpeed(r.value);
      });
    });

    // keyboard
    window.addEventListener("keydown", (e) => {
      if (engine.state !== "PLAYING") return;
      if (e.key === "ArrowLeft" || e.key === "a") engine.move(-1);
      else if (e.key === "ArrowRight" || e.key === "d") engine.move(1);
      else if (e.key === "ArrowUp" || e.key === "w") engine.rotate();
      else if (e.key === "ArrowDown" || e.key === "s") engine.drop();
      else if (e.key === " ") {
        while (engine.canMove(1, 0)) engine.current.row++;
        engine.merge();
        engine.spawn();
      }
    });

    // mouse drag: simple left/right + soft drop on pull
    let dragging = false,
      sx = 0,
      sy = 0,
      startCol = 0,
      dropped = false;
    document.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || engine.state !== "PLAYING") return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      startCol = engine.current.col;
      dropped = false;
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging || engine.state !== "PLAYING") return;
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      const moveBy = Math.round(dx / 20);
      const newCol = Math.max(0, Math.min(COLS - 1, startCol + moveBy));
      if (
        newCol !== engine.current.col &&
        engine.canMove(0, newCol - engine.current.col)
      ) {
        engine.current.col = newCol;
      }
      if (!dropped && dy > 30) {
        while (engine.canMove(1, 0)) engine.current.row++;
        engine.merge();
        engine.spawn();
        dropped = true;
        dragging = false;
      }
    });
    document.addEventListener("mouseup", () => (dragging = false));
    document.addEventListener("mouseleave", () => (dragging = false));
    document.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        engine.rotate();
      },
      { passive: false }
    );

    // reset scores
    this.resetBtn.addEventListener("click", () => {
      const defaults = engine.getDefaultHighScores();
      engine.highScores = defaults;
      localStorage.setItem("tetrisHighScores", JSON.stringify(defaults));
      if (this.dataTA) this.dataTA.value = engine.encodeScores(defaults);
      this.updateHighScores(defaults);
    });
  }

  /* ---------- helpers ---------- */
  #drawGrid(rows, cols) {
    const html = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) html.push('<span class="cell"></span>');
    this.boardEl.innerHTML = html.join("");
  }
  #escape(s) {
    return String(s).replace(
      /[&<>"']/g,
      (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])
    );
  }
  #getColumnHeights(bd) {
    const h = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        if (bd[r][c]) {
          h[c] = ROWS - r;
          break;
        }
      }
    return h;
  }

  /* ---------- attract helpers for high-scores ---------- */
  makeHighScoreLines(entry) {
    const maxWidth = COLS;
    const nameLines = this.wrapName(entry.name, maxWidth, 2);
    const scoreLine = `${entry.score}`;
    return [...nameLines, scoreLine];
  }
  wrapName(name, maxWidth, maxLines) {
    if (name.length <= maxWidth) return [name];
    const words = name.split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      if ((cur ? cur.length + 1 : 0) + w.length <= maxWidth)
        cur = cur ? `${cur} ${w}` : w;
      else {
        if (cur) lines.push(cur);
        cur = w.length > maxWidth ? w.slice(0, maxWidth) : w;
      }
      if (lines.length === maxLines - 1 && cur.length >= maxWidth) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (!lines.length) return [name.slice(0, maxWidth)];
    return lines.slice(0, maxLines);
  }
}
