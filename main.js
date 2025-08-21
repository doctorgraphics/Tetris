// main.js — bootstraps Engine + UI, wires events, starts Attract on load

import { Engine, State, SPEED_MS, SCORE_MULT } from "./engine.js";
import { UI } from "./ui.js";

const ui = new UI();
const engine = new Engine({
  onRender: (eng, extras) => {
    if (extras && extras.fireworks) ui.fireworksOnce();
    if (eng.state === State.ATTRACT) ui.drawAttract();
    else ui.drawGame(eng);
  },
  onStats: (eng) => ui.updateStats(eng),
  onAttractTick: () => {}, // rendering handled by UI's interval
  onHighScoresChanged: (list) => ui.updateHighScores(list),
  onGameOver: (finalScore, wasAuto) => {
    if (finalScore <= 0) {
      startAttractCycle();
      return;
    }
    if (wasAuto) {
      engine.saveHighScore({ name: "AI", score: finalScore }, ui.dataTA);
      startAttractCycle();
    } else {
      ui.promptForName((name) => {
        engine.saveHighScore({ name, score: finalScore }, ui.dataTA);
        startAttractCycle();
      });
    }
  },
});

// Expose constants for UI access
Engine.SPEED_MS = SPEED_MS;
Engine.SCORE_MULT = SCORE_MULT;

function startAttractCycle() {
  engine.enterAttract();
  // Cycle: banner → top 10 (name lines + score line), repeat
  function* queue() {
    yield ["Let's", "Play", "Tetris!"];
    const scores = engine.highScores.slice(0, 10);
    for (const s of scores) yield ui.makeHighScoreLines(s);
  }
  let iter = null;
  const getNext = () => {
    if (!iter) iter = queue();
    const n = iter.next();
    if (n.done) {
      // After banner + 10 highscores, auto-start a Fast AI game
      ui.stopAttract();
      engine.setSpeed("Fast");
      engine.start();
      engine.autoPlay = true;
      if (ui.autoBtn) ui.autoBtn.textContent = "Stop Auto Play";
      return null; // Signal attract to stop
    }
    return n.value;
  };
  ui.startAttract(getNext);
}

function init() {
  // Set CSS vars for grid
  document.documentElement.style.setProperty("--cols", 10);
  document.documentElement.style.setProperty("--rows", 20);

  // Bind controls to engine
  ui.bindControls(engine);

  // Load and render high scores
  engine.loadHighScores(ui.dataTA);

  // Set default speed
  engine.setSpeed("Slow");

  // Draw initial scene and start attract mode
  ui.drawGame(engine);
  startAttractCycle();
}

init();