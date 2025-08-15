// ai.js  — pure AI helpers (no DOM)

// ----- board metrics -----
function getColumnHeights(bd, ROWS, COLS) {
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
function getAggregateHeight(bd, ROWS, COLS) {
  let total = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (bd[r][c]) {
        total += ROWS - r;
        break;
      }
    }
  }
  return total;
}
function getHoles(bd, ROWS, COLS) {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let seen = false;
    for (let r = 0; r < ROWS; r++) {
      if (bd[r][c]) seen = true;
      else if (seen) holes++;
    }
  }
  return holes;
}
function getBumpiness(bd, ROWS, COLS) {
  const h = getColumnHeights(bd, ROWS, COLS);
  let s = 0;
  for (let i = 0; i < COLS - 1; i++) s += Math.abs(h[i] - h[i + 1]);
  return s;
}
function getWellDepth(bd, ROWS, COLS) {
  let total = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (
        !bd[r][c] &&
        (c === 0 || bd[r][c - 1]) &&
        (c === COLS - 1 || bd[r][c + 1])
      ) {
        let d = 1,
          rr = r + 1;
        while (rr < ROWS && !bd[rr][c]) {
          d++;
          rr++;
        }
        total += d;
      }
    }
  }
  return total;
}
function getBlockades(bd, ROWS, COLS) {
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
function isTetrisSetup(bd, ROWS, COLS) {
  for (const c of [0, COLS - 1]) {
    let well = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!bd[r][c]) well++;
      else break;
    }
    if (well >= 4) return true;
  }
  return false;
}

// ----- geometry -----
export function rotateMatrix(m) {
  return m[0].map((_, i) => m.map((row) => row[i]).reverse());
}
export function canPlaceAt(shape, col, row, board, ROWS, COLS) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[0].length; c++) {
      if (!shape[r][c]) continue;
      const nr = row + r,
        nc = col + c;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc])
        return false;
    }
  }
  return true;
}

export function simulateLock(board, shape, row, col, color) {
  const ROWS = board.length,
    COLS = board[0].length;
  const tb = board.map((r) => r.slice());
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[0].length; c++) {
      if (shape[r][c]) tb[row + r][col + c] = color || 1;
    }
  }
  // clear lines
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

export function evaluateBoardScore(bd, linesCleared) {
  const ROWS = bd.length,
    COLS = bd[0].length;

  // survival mode if stack is tall
  let maxH = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (bd[r][c]) {
        maxH = Math.max(maxH, ROWS - r);
        break;
      }
    }
  }
  const survival = maxH > 7;
  const tetrisBonus = !survival && linesCleared === 4 ? 3000 : 0;
  const nonTetrisPenalty =
    !survival && linesCleared > 0 && linesCleared < 4 ? -400 : 0;
  const setupBonus = !survival && isTetrisSetup(bd, ROWS, COLS) ? 800 : 0;

  return (
    -getAggregateHeight(bd, ROWS, COLS) * 0.7 -
    getHoles(bd, ROWS, COLS) * 7 -
    getBumpiness(bd, ROWS, COLS) * 1.5 -
    getWellDepth(bd, ROWS, COLS) * 1.2 -
    getBlockades(bd, ROWS, COLS) * 2 +
    (survival ? 200 * linesCleared : 0) +
    tetrisBonus +
    setupBonus +
    nonTetrisPenalty
  );
}

// Best move search (current piece only; “next” look-ahead can be added later)
export function findBestMove(board, pieceShape, pieceColor) {
  const ROWS = board.length,
    COLS = board[0].length;
  let best = { col: 0, rot: 0, score: -Infinity };

  for (let rot = 0; rot < 4; rot++) {
    let shape = pieceShape;
    for (let i = 0; i < rot; i++) shape = rotateMatrix(shape);

    for (let col = -2; col < COLS; col++) {
      if (!canPlaceAt(shape, col, 0, board, ROWS, COLS)) continue;

      // drop to rest
      let row = 0;
      while (canPlaceAt(shape, col, row + 1, board, ROWS, COLS)) row++;

      const { board: tb, linesCleared } = simulateLock(
        board,
        shape,
        row,
        col,
        pieceColor
      );
      const score = evaluateBoardScore(tb, linesCleared);
      if (score > best.score) best = { col, rot, score };
    }
  }
  return { col: best.col, rot: best.rot };
}

export const AI = {
  findBestMove,
  evaluateBoardScore,
  simulateLock,
  canPlaceAt,
  rotateMatrix,
};
export default AI;
