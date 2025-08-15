// ai.js — simple 1-piece lookahead + board heuristic

import { rotateMatrix, ROWS, COLS } from "./engine.js";

function canPlaceAt(shape, col, row, board) {
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

function deepCopy(m) {
  return m.map((r) => r.slice());
}

function getAggregateHeight(bd) {
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
function getHoles(bd) {
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
function getBumpiness(bd) {
  const h = getColumnHeights(bd);
  let s = 0;
  for (let i = 0; i < h.length - 1; i++) s += Math.abs(h[i] - h[i + 1]);
  return s;
}
function getWellDepth(bd) {
  let t = 0;
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
        t += d;
      }
    }
  }
  return t;
}
function getBlockades(bd) {
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
function isTetrisSetup(bd) {
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

export function findBestMove(board, current, next, ROWS_, COLS_) {
  // one-piece heuristic w/ “survival” mode if stack is tall
  let bestScore = -Infinity,
    bestCol = 0,
    bestRot = 0;
  const origShape = current.shape,
    origColor = current.color;

  const evalBoard = (bd, linesCleared) => {
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
    const setupBonus = !survival && isTetrisSetup(bd) ? 800 : 0;

    return (
      -getAggregateHeight(bd) * 0.7 -
      getHoles(bd) * 7 -
      getBumpiness(bd) * 1.5 -
      getWellDepth(bd) * 1.2 -
      getBlockades(bd) * 2 +
      (survival ? 200 * linesCleared : 0) +
      tetrisBonus +
      setupBonus +
      nonTetrisPenalty
    );
  };

  for (let rot = 0; rot < 4; rot++) {
    let shape = origShape;
    for (let r = 0; r < rot; r++) shape = rotateMatrix(shape);

    for (let col = -2; col < COLS; col++) {
      if (!canPlaceAt(shape, col, 0, board)) continue;

      let row = 0;
      while (canPlaceAt(shape, col, row + 1, board)) row++;

      const tb = deepCopy(board);
      for (let tr = 0; tr < shape.length; tr++)
        for (let tc = 0; tc < shape[0].length; tc++)
          if (shape[tr][tc]) tb[row + tr][col + tc] = origColor;

      let lines = 0;
      for (let rr = 0; rr < ROWS; rr++) if (tb[rr].every((x) => x)) lines++;

      const score = evalBoard(tb, lines);
      if (score > bestScore) {
        bestScore = score;
        bestCol = col;
        bestRot = rot;
      }
    }
  }

  return { col: bestCol, rot: bestRot };
}
