export function bindUI({
  engine,
  btnNew,
  autoBtn,
  btnLeft,
  btnRight,
  btnRotate,
  btnDrop,
  btnNameOk,
  resetBtn,
  speedRadios,
}) {
  // Buttons
  btnNew.addEventListener("click", () => engine.startNewGame());
  autoBtn.addEventListener("click", () => {
    const nowOn = autoBtn.dataset.on !== "true";
    engine.toggleAutoPlay(nowOn);
    autoBtn.dataset.on = String(nowOn);
    autoBtn.textContent = nowOn ? "Stop Auto Play" : "Auto Play";
  });

  btnLeft.addEventListener("mousedown", () => engine.moveLeft());
  btnRight.addEventListener("mousedown", () => engine.moveRight());
  btnRotate.addEventListener("mousedown", () => engine.rotate());
  btnDrop.addEventListener("mousedown", () => engine.softDrop());

  // Speed radios
  speedRadios.forEach((r) => {
    r.addEventListener("change", function () {
      if (this.checked) engine.setSpeed(this.value);
    });
  });

  // Name prompt
  btnNameOk.addEventListener("click", () => {
    const name = document.querySelector("#playerNameInput").value;
    engine.acceptName(name);
  });

  // Keyboard
  window.addEventListener("keydown", (e) => {
    // Let space hard-drop (repeat softDrop until floor)
    if (e.key === "ArrowLeft" || e.key === "a") engine.moveLeft();
    else if (e.key === "ArrowRight" || e.key === "d") engine.moveRight();
    else if (e.key === "ArrowUp" || e.key === "w") engine.rotate();
    else if (e.key === "ArrowDown" || e.key === "s") engine.softDrop();
    else if (e.key === " ") {
      // hard drop: spam softDrop until it locks
      for (let i = 0; i < 40; i++) engine.softDrop();
    }
  });

  // Mouse drag (simple horizontal & down-to-drop)
  let dragging = false,
    startX = 0,
    startCol = 0,
    startY = 0,
    pieceDropped = false;
  const CELL = 20;
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startCol = null;
    pieceDropped = false;
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX,
      dy = e.clientY - startY;
    const moveBy = Math.round(dx / CELL);
    if (startCol === null) startCol = 0;
    if (moveBy < 0) engine.moveLeft();
    else if (moveBy > 0) engine.moveRight();
    if (!pieceDropped && dy > 30) {
      engine.softDrop();
      pieceDropped = true;
      dragging = false;
    }
  });
  document.addEventListener("mouseup", () => (dragging = false));
  document.addEventListener("mouseleave", () => (dragging = false));

  // Reset scores
  resetBtn.addEventListener("click", () => engine.resetScores());
}
