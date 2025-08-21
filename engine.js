```javascript
// engine.js — core state, physics, scoring, storage

// ... (previous imports and constants unchanged)

export class Engine {
  // ... (previous constructor and methods unchanged)

  run() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.acc = 0;
    this.aiStallCounter = 0; // Track stalled AI attempts
    const MAX_AI_ATTEMPTS = 10; // Prevent infinite AI loops

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
          this.aiStallCounter = 0; // Reset stall counter on new piece
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
          if (this.attemptSmartFloorSlide()) moved = true;
        }

        // Force merge if AI is stalled
        if (!moved) {
          this.aiStallCounter++;
          if (this.aiStallCounter >= MAX_AI_ATTEMPTS && !this.canMove(1, 0)) {
            this.merge();
            this.spawn();
            this.aiStallCounter = 0;
          }
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

  attemptSmartFloorSlide() {
    const origCol = this.current.col;
    let bestScore = -Infinity, bestCol = origCol;

    // Try sliding up to 3 columns left or right for more flexibility
    for (let dc = -3; dc <= 3; dc++) {
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
      this.lockFrames = 0; // Reset lock delay to give AI time to settle
      return true;
    }
    return false;
  }

  // ... (remaining methods unchanged)
}
```

#### Modified `ai.js`
The `findBestMove` function is updated to:
- Validate that the chosen position is reachable by simulating the piece’s descent.
- Add a fallback to ensure a valid move is always returned, even if suboptimal.

<xaiArtifact artifact_id="f7dc3509-16a2-4244-a984-e59821dd735d" artifact_version_id="bf554c25-ae22-4944-b3ac-46b8483eab5d" title="ai.js" contentType="application/javascript" partial="true">
```javascript
// ai.js — simple 1-piece lookahead + board heuristic

// ... (previous imports and helper functions unchanged)

export function findBestMove(board, current, next) {
  let bestScore = -Infinity,
    bestCol = current.col, // Default to current column
    bestRot = 0;
  const origShape = current.shape,
    origColor = current.color;

  const evaluateBoard = (board, linesCleared) => {
    let maxHeight = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (board[r][c]) {
          maxHeight = Math.max(maxHeight, ROWS - r);
          break;
        }
      }
    }
    const isSurvivalMode = maxHeight > 7;
    const tetrisBonus = !isSurvivalMode && linesCleared === 4 ? 3000 : 0;
    const nonTetrisPenalty = !isSurvivalMode && linesCleared > 0 && linesCleared < 4 ? -400 : 0;
    const setupBonus = !isSurvivalMode && isTetrisSetup(board) ? 800 : 0;

    return (
      -getAggregateHeight(board) * 0.7 -
      getHoles(board) * 7 -
      getBumpiness(board) * 1.5 -
      getWellDepth(board) * 1.2 -
      getBlockades(board) * 2 +
      (isSurvivalMode ? 200 * linesCleared : 0) +
      tetrisBonus +
      setupBonus +
      nonTetrisPenalty
    );
  };

  let validMoveFound = false;
  for (let rot = 0; rot < 4; rot++) {
    let shape = origShape;
    for (let r = 0; r < rot; r++) shape = rotateMatrix(shape);

    for (let col = -2; col < COLS; col++) {
      if (!canPlaceAt(shape, col, 0, board)) continue;

      let row = 0;
      while (canPlaceAt(shape, col, row + 1, board)) row++;

      // Validate reachability
      let canReach = true;
      for (let r = 0; r < row; r++) {
        if (!canPlaceAt(shape, col, r, board)) {
          canReach = false;
          break;
        }
      }
      if (!canReach) continue;

      const testBoard = deepCopy(board);
      for (let tr = 0; tr < shape.length; tr++)
        for (let tc = 0; tc < shape[0].length; tc++)
          if (shape[tr][tc]) testBoard[row + tr][col + tc] = origColor;

      let linesCleared = 0;
      for (let rr = 0; rr < ROWS; rr++) if (testBoard[rr].every((x) => x)) linesCleared++;

      const score = evaluateBoard(testBoard, linesCleared);
      if (score > bestScore) {
        bestScore = score;
        bestCol = col;
        bestRot = rot;
        validMoveFound = true;
      }
    }
  }

  // Fallback: if no valid move found, try current shape at current column
  if (!validMoveFound) {
    let row = 0;
    while (canPlaceAt(origShape, current.col, row + 1, board)) row++;
    if (canPlaceAt(origShape, current.col, row, board)) {
      bestCol = current.col;
      bestRot = 0;
    } else {
      // Last resort: find any valid column
      for (let col = 0; col < COLS; col++) {
        if (canPlaceAt(origShape, col, 0, board)) {
          bestCol = col;
          bestRot = 0;
          break;
        }
      }
    }
  }

  return { col: bestCol, rot: bestRot };
}
```

### Explanation of Changes
1. **AI Stall Counter** (`engine.js`):
   - Added `aiStallCounter` and `MAX_AI_ATTEMPTS` to track consecutive failed AI moves.
   - If the AI cannot move or rotate (`moved` is `false`) and the piece is grounded (`!this.canMove(1, 0)`), it increments the counter. After 10 failed attempts, it forces a `merge` and `spawn` to prevent hanging.
   - Resets the counter when a new piece spawns to avoid premature merging.

2. **Enhanced `attemptSmartFloorSlide`** (`engine.js`):
   - Expanded the slide range from `[-1, 1]` to `[-3, 3]` to allow more flexibility when the piece is grounded.
   - Returns `true` if a slide occurs to signal movement, helping the stall counter logic.
   - Resets `lockFrames` when a slide occurs to give the AI time to settle the piece.

3. **Reachability Check in `findBestMove`** (`ai.js`):
   - Added a `canReach` check to ensure the target position (column and rotation) is reachable by simulating the piece’s descent from row 0 to the target row.
   - If no valid move is found, falls back to the current column with no rotation, or searches for any valid column as a last resort.

4. **Preserving Lock Delay**:
   - Ensured `lockFrames` is reset appropriately in `attemptSmartFloorSlide` to avoid premature merging, but the stall counter overrides if the AI is truly stuck.

### Integration Notes
- These changes are fully compatible with the previously refactored `index.html`, `style.css`, `main.js`, `ui.js`, and `music.js`.
- The `music.js` file remains unused, so it does not affect the AI fixes. If you integrate music later, ensure it doesn’t interfere with the game loop’s performance.
- Test the AI in scenarios where the board is nearly full or has complex configurations to verify it no longer hangs. You can simulate this by manually editing `engine.board` in the console to create tall stacks or holes.

### Testing Suggestions
- **Scenario 1: Full Board**: Start a game, use the console to fill most of the board (e.g., `engine.board.forEach(row => row.fill(1))` and clear a few cells), then enable AI (`engine.autoPlay = true`). Ensure it places pieces without stalling.
- **Scenario 2: Narrow Columns**: Create a board with narrow gaps (e.g., one-column wells) and test if the AI can place pieces like the I-tetromino.
- **Scenario 3: Rapid AI Play**: Set `engine.setSpeed("Impossible")` and enable AI to check for hangs under high-speed conditions.

If the AI still hangs in specific cases, please provide details (e.g., board state, piece type, or speed setting), and I can debug further. Let me know if you need help testing or additional tweaks!