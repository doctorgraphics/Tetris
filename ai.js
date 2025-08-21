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

function getAggregateHeight(board) {
  let total = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) {
        total += ROWS - r;
        break;
      }
    }
  }
  return total;
}

function getHoles(board) {
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

function getColumnHeights(board) {
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

function getBumpiness(board) {
  const heights = getColumnHeights(board);
  let sum = 0;
  for (let i = 0; i < heights.length - 1; i++) sum += Math.abs(heights[i] - heights[i + 1]);
  return sum;
}

function getWellDepth(board) {
  let total = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (
        !board[r][c] &&
        (c === 0 || board[r][c - 1]) &&
        (c === COLS - 1 || board[r][c + 1])
      ) {
        let depth = 1,
          rr = r + 1;
        while (rr < ROWS && !board[rr][c]) {
          depth++;
          rr++;
        }
        total += depth;
      }
    }
  }
  return total;
}

function getBlockades(board) {
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

function isTetrisSetup(board) {
  for (const c of [0, COLS - 1]) {
    let well = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!board[r][c]) well++;
      else break;
    }
    if (well >= 4) return true;
  }
  return false;
}

export function findBestMove(board, current, next) {
  let bestScore = -Infinity,
    bestCol = 0,
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

  for (let rot = 0; rot < 4; rot++) {
    let shape = origShape;
    for (let r = 0; r < rot; r++) shape = rotateMatrix(shape);

    for (let col = -2; col < COLS; col++) {
      if (!canPlaceAt(shape, col, 0, board)) continue;

      let row = 0;
      while (canPlaceAt(shape, col, row + 1, board)) row++;

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
      }
    }
  }

  return { col: bestCol, rot: bestRot };
}