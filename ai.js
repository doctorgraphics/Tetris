// Shared heuristics
export const heur = {
  getAggregateHeight(bd) {
    const ROWS = bd.length,
      COLS = bd[0].length;
    let t = 0;
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        if (bd[r][c]) {
          t += ROWS - r;
          break;
        }
      }
    return t;
  },
  getHoles(bd) {
    const ROWS = bd.length,
      COLS = bd[0].length;
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let block = false;
      for (let r = 0; r < ROWS; r++) {
        if (bd[r][c]) block = true;
        else if (block) holes++;
      }
    }
    return holes;
  },
  getColumnHeights(bd) {
    const ROWS = bd.length,
      COLS = bd[0].length;
    const h = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++)
        if (bd[r][c]) {
          h[c] = ROWS - r;
          break;
        }
    return h;
  },
  getBumpiness(bd) {
    const h = heur.getColumnHeights(bd);
    let s = 0;
    for (let i = 0; i < h.length - 1; i++) s += Math.abs(h[i] - h[i + 1]);
    return s;
  },
  getWellDepth(bd) {
    const ROWS = bd.length,
      COLS = bd[0].length;
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
  },
  getBlockades(bd) {
    const ROWS = bd.length,
      COLS = bd[0].length;
    let b = 0;
    for (let c = 0; c < COLS; c++) {
      let hole = false;
      for (let r = 0; r < ROWS; r++) {
        if (!bd[r][c]) hole = true;
        else if (hole) b++;
      }
    }
    return b;
  },
  isTetrisSetup(bd) {
    const ROWS = bd.length,
      COLS = bd[0].length;
    for (const c of [0, COLS - 1]) {
      let well = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (!bd[r][c]) well++;
        else break;
      }
      if (well >= 4) return true;
    }
    return false;
  },
};

export function evaluateBoardScore(bd, linesCleared) {
  const ROWS = bd.length;
  // derive survival from max height
  let maxH = 0;
  for (let c = 0; c < bd[0].length; c++)
    for (let r = 0; r < ROWS; r++)
      if (bd[r][c]) {
        maxH = Math.max(maxH, ROWS - r);
        break;
      }

  const survival = maxH > 7;
  const tetrisBonus = !survival && linesCleared === 4 ? 3000 : 0;
  const nonTetrisPenalty =
    !survival && linesCleared > 0 && linesCleared < 4 ? -400 : 0;
  const setupBonus = !survival && heur.isTetrisSetup(bd) ? 800 : 0;

  return (
    -heur.getAggregateHeight(bd) * 0.7 -
    heur.getHoles(bd) * 7 -
    heur.getBumpiness(bd) * 1.5 -
    heur.getWellDepth(bd) * 1.2 -
    heur.getBlockades(bd) * 2 +
    (survival ? 200 * linesCleared : 0) +
    tetrisBonus +
    setupBonus +
    nonTetrisPenalty
  );
}

export function simulateLock(bd, shape, row, col, color) {
  const ROWS = bd.length,
    COLS = bd[0].length;
  const tb = bd.map((r) => r.slice());
  for (let tr = 0; tr < shape.length; tr++)
    for (let tc = 0; tc < shape[0].length; tc++)
      if (shape[tr][tc]) tb[row + tr][col + tc] = color;

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

function rotateMatrix(m) {
  return m[0].map((_, i) => m.map((r) => r[i]).reverse());
}
function canPlaceAt(bd, shape, col, row = 0) {
  const ROWS = bd.length,
    COLS = bd[0].length;
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

export function findBestMove(board, current, next, COLS, ROWS) {
  let bestScore = -Infinity,
    bestCol = 0,
    bestRot = 0;
  const origShape = current.shape,
    origColor = current.color;

  const evalBoard = (bd, linesCleared) => {
    const s = evaluateBoardScore(bd, linesCleared);
    return s;
  };

  for (let rot = 0; rot < 4; rot++) {
    let testShape = origShape;
    for (let r = 0; r < rot; r++) testShape = rotateMatrix(testShape);

    for (let col = -2; col < COLS; col++) {
      if (!canPlaceAt(board, testShape, col, 0)) continue;
      let row = 0;
      while (canPlaceAt(board, testShape, col, row + 1)) row++;
      const tb = board.map((r) => r.slice());
      for (let tr = 0; tr < testShape.length; tr++)
        for (let tc = 0; tc < testShape[0].length; tc++)
          if (testShape[tr][tc]) tb[row + tr][col + tc] = origColor;

      let lines = 0;
      for (let r = 0; r < ROWS; r++) if (tb[r].every((x) => x)) lines++;

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
