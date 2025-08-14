import { createEngine } from "./engine.js";
import { bindUI } from "./ui.js";

const $ = (s) => document.querySelector(s);

window.addEventListener("DOMContentLoaded", () => {
  const engine = createEngine({
    boardCanvas: $("#boardCanvas"),
    nextCanvas: $("#nextCanvas"),
    scoreEl: $("#score"),
    statsEl: $("#gameStats"),
    highListEl: $("#highScores"),
    base64Box: $("#highScoresData"),
    fireworks: $("#fireworks"),
    promptWrap: $("#playerNamePrompt"),
    promptInput: $("#playerNameInput"),
  });

  bindUI({
    engine,
    btnNew: $("#btnNew"),
    autoBtn: $("#autoBtn"),
    btnLeft: $("#btnLeft"),
    btnRight: $("#btnRight"),
    btnRotate: $("#btnRotate"),
    btnDrop: $("#btnDrop"),
    btnNameOk: $("#btnNameOk"),
    resetBtn: $("#resetHighScoresBtn"),
    speedRadios: document.querySelectorAll('input[name="speedMode"]'),
  });

  // Auto-start attract mode on load
  engine.enterAttract();
});
