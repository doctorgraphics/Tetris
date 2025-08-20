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

// expose these so UI can read constants (optional)
Engine.SPEED_MS = SPEED_MS;
Engine.SCORE_MULT = SCORE_MULT;

 function startAttractCycle() {
   engine.enterAttract();
   // cycle: banner → top 10 (name lines + score line), repeat
   function* queue() {
     yield ["Let's", "Play", "Tetris!"];
     const scores = engine.highScores.slice(0, 10);
     for (const s of scores) yield ui.makeHighScoreLines(s);
   }
   let iter = null;
   const getNext = () => {
     if (!iter) iter = queue();
     const n = iter.next();
-    if (n.done) {
-      iter = null;
-      return ["Let's", "Play", "Tetris!"];
-    }
+    if (n.done) {
+      // After banner + 10 highscores, auto-start a Fast AI game
+      ui.stopAttract();
+      engine.setSpeed("Fast");          // uses the built-in SPEED_MS table
+      engine.start();                   // fresh game
+      engine.autoPlay = true;           // let the AI drive
+      if (ui.autoBtn) ui.autoBtn.textContent = "Stop Auto Play";
+      return null;                      // signal attract to stop
+    }
     return n.value;
   };
   ui.startAttract(getNext);
 }


function init() {
  // read CSS vars for grid (in case you tweak)
  document.documentElement.style.setProperty("--cols", 10);
  document.documentElement.style.setProperty("--rows", 20);

  // bind controls to engine
  ui.bindControls(engine);

  // load scores → render them once
  engine.loadHighScores(ui.dataTA);

  // default speed
  engine.setSpeed("Slow");

  // draw empty scene & start attract mode immediately on load
  ui.drawGame(engine);
  startAttractCycle();

  // prepare a next piece so the first “New Game”/AI start is instant
  engine.next = engine.next || engine.constructor ? null : null; // harmless; spawn() will set it
}

init();
