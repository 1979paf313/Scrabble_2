const BOARD_ROWS = 5;
const BOARD_COLS = 11;
const MIDDLE_ROW = 2;
const CENTER_ROW = 2;
const CENTER_COL = 5;

let CELL_SIZE = 46;
let CELL_GAP = 5;
let BOARD_PADDING = 14;
let CELL_STEP = CELL_SIZE + CELL_GAP;

const QUICK_CLICK_MAX_MS = 180;
const QUICK_CLICK_MAX_MOVE_PX = 6;
const PENDING_DRAG_START_MOVE_PX = 6;

const gameState = {
  puzzle: null,
  allowedWordsSet: new Set(),
  panels: [],
  board: [],
  foundWords: new Set(),
  recentFinds: [],
  currentVisibleWord: "",
  isSolved: false,
  lastError: "",
  placementOrderCounter: 0,
  selectedPanelId: null,
  heldPanelOrigin: null,
  heldGrabIndex: 1,
  hoverPreview: null,
  hoverPreviewIsLegal: true,
  hoverAnchor: null,
  dragStartClientX: 0,
  dragStartClientY: 0,
  dragStartTimeMs: 0,
  dragMaxDistancePx: 0,
  isMouseDraggingPanel: false,
  lastLegalAnchor: null,
  isTrayHot: false,
  rotationFx: null,
  rotationFxTimer: null,
  pendingPressPanelId: null,
  pendingPressSource: null,
  pendingPressGrabIndex: 1,
  pendingPressStartX: 0,
  pendingPressStartY: 0,
  pendingPressStartTimeMs: 0,
  foundWordFx: null,
  foundWordFxTimer: null,
  foundWordToast: null,
  foundWordToastTimer: null,
  expandedCountLength: null,
  placementFx: null,
  placementFxTimer: null,
  lastLoadedPuzzleId: null,
};

const boardEl = document.getElementById("board");
const panelsListEl = document.getElementById("panelsList");
const recentListEl = document.getElementById("recentList");
const countsListEl = document.getElementById("countsList");
const middleRowReadoutEl = document.getElementById("middleRowReadout");
const puzzleIdPillEl = document.getElementById("puzzleIdPill");
const foundCountPillEl = document.getElementById("foundCountPill");
const messageBoxEl = document.getElementById("messageBox");
const winBoxEl = document.getElementById("winBox");
const loadPuzzleBtn = document.getElementById("loadPuzzleBtn");
const clearBoardBtn = document.getElementById("clearBoardBtn");
const panelOverlaysEl = document.getElementById("panelOverlays");
const openAllWordsBtn = document.getElementById("openAllWordsBtn");
const closeAllWordsBtn = document.getElementById("closeAllWordsBtn");
const allWordsModalEl = document.getElementById("allWordsModal");
const allWordsModalBackdropEl = document.getElementById(
  "allWordsModalBackdrop",
);
const allWordsListEl = document.getElementById("allWordsList");
const howToPlayBtn = document.getElementById("howToPlayBtn");
const howToPlayModalEl = document.getElementById("howToPlayModal");
const howToPlayBackdropEl = document.getElementById("howToPlayBackdrop");

loadPuzzleBtn.addEventListener("click", loadFirstPuzzle);
clearBoardBtn.addEventListener("click", handleClearBoard);
boardEl.addEventListener("mouseover", handleBoardMouseOver);
boardEl.addEventListener("mouseleave", handleBoardMouseLeave);
boardEl.addEventListener("click", handleBoardClick);
openAllWordsBtn.addEventListener("click", openAllWordsModal);
closeAllWordsBtn.addEventListener("click", closeAllWordsModal);
allWordsModalBackdropEl.addEventListener("click", closeAllWordsModal);
howToPlayBtn.addEventListener("click", openHowToPlay);
howToPlayBackdropEl.addEventListener("click", closeHowToPlay);

function readCssPixelVar(element, varName, fallbackValue) {
  const rawValue = getComputedStyle(element).getPropertyValue(varName).trim();

  if (!rawValue) {
    return fallbackValue;
  }

  const parsed = Number.parseFloat(rawValue);

  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return parsed;
}

function syncBoardMetricsFromCss() {
  const metricSourceEl = document.body.classList.contains("game-panels")
    ? document.body
    : document.querySelector(".game-panels");

  if (!metricSourceEl) {
    return;
  }

  CELL_SIZE = readCssPixelVar(metricSourceEl, "--pg-cell-size", 46);
  CELL_GAP = readCssPixelVar(metricSourceEl, "--pg-cell-gap", 5);
  BOARD_PADDING = readCssPixelVar(metricSourceEl, "--pg-board-padding", 14);
  CELL_STEP = CELL_SIZE + CELL_GAP;
}

function handleViewportResize() {
  syncBoardMetricsFromCss();
  renderAll();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !allWordsModalEl.classList.contains("hidden")) {
    closeAllWordsModal();
  }
  if (
    event.key === "Escape" &&
    !howToPlayModalEl.classList.contains("hidden")
  ) {
    closeHowToPlay();
  }
});

syncBoardMetricsFromCss();
window.addEventListener("resize", handleViewportResize);

createEmptyBoardState();
renderAll();

async function loadFirstPuzzle() {
  try {
    const response = await fetch("puzzles.json");
    if (!response.ok) {
      throw new Error(`Could not load puzzles.json (${response.status})`);
    }

    const puzzles = await response.json();
    if (!Array.isArray(puzzles) || puzzles.length === 0) {
      throw new Error("puzzles.json did not contain any puzzles.");
    }

    let available = puzzles;

    if (gameState.lastLoadedPuzzleId && puzzles.length > 1) {
      available = puzzles.filter(
        (puzzle) => puzzle.id !== gameState.lastLoadedPuzzleId,
      );
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    const selectedPuzzle = available[randomIndex];

    gameState.lastLoadedPuzzleId = selectedPuzzle.id;
    loadPuzzle(selectedPuzzle);
  } catch (error) {
    showError(error.message);
  }
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadPuzzle(puzzleObj) {
  gameState.puzzle = puzzleObj;
  gameState.allowedWordsSet = new Set(
    (puzzleObj.allowedWords || []).map((word) => word.toUpperCase()),
  );
  const shuffledPanels = shuffleArray(puzzleObj.panels || []);

  gameState.panels = shuffledPanels.map((letters, index) => {
    const orientation = Math.random() < 0.5 ? "horizontal" : "vertical";
    const reversed = Math.random() < 0.5;

    return {
      id: index,
      letters: letters.toUpperCase(),
      orientation,
      reversed,
      row: null,
      col: null,
      placed: false,
      placementOrder: null,
    };
  });

  if (gameState.rotationFxTimer) {
    clearTimeout(gameState.rotationFxTimer);
  }
  if (gameState.placementFxTimer) {
    clearTimeout(gameState.placementFxTimer);
  }
  gameState.placementFx = null;
  gameState.placementFxTimer = null;
  gameState.rotationFx = null;
  gameState.rotationFxTimer = null;
  gameState.foundWords = new Set();
  gameState.recentFinds = [];
  gameState.currentVisibleWord = "";
  gameState.isSolved = false;
  gameState.lastError = "";
  gameState.placementOrderCounter = 0;
  gameState.isTrayHot = false;
  gameState.selectedPanelId = null;
  gameState.heldPanelOrigin = null;
  gameState.heldGrabIndex = 1;
  gameState.hoverPreview = null;
  gameState.hoverPreviewIsLegal = true;
  gameState.hoverAnchor = null;
  gameState.dragStartClientX = 0;
  gameState.dragStartClientY = 0;
  gameState.dragStartTimeMs = 0;
  gameState.dragMaxDistancePx = 0;
  gameState.isMouseDraggingPanel = false;
  gameState.lastLegalAnchor = null;

  createEmptyBoardState();
  evaluateBoard();
  renderAll();
}

function createEmptyBoardState() {
  gameState.board = Array.from({ length: BOARD_ROWS }, (_, row) =>
    Array.from({ length: BOARD_COLS }, (_, col) => ({
      row,
      col,
      visibleLetter: null,
      occupants: [],
      isOverlap: false,
    })),
  );
}

function getPanelDisplayLetters(panel) {
  const chars = panel.letters.split("");
  return panel.reversed ? [...chars].reverse() : chars;
}

function getPanelCells(panel) {
  if (!panel.placed || panel.row === null || panel.col === null) {
    return [];
  }

  const letters = getPanelDisplayLetters(panel);
  const cells = [];

  for (let i = 0; i < 3; i++) {
    const row = panel.orientation === "horizontal" ? panel.row : panel.row + i;
    const col = panel.orientation === "horizontal" ? panel.col + i : panel.col;

    cells.push({
      row,
      col,
      letter: letters[i],
      letterIndex: i,
      panelId: panel.id,
    });
  }

  return cells;
}

function getPanelOverlayStyle(panel) {
  syncBoardMetricsFromCss();

  const isHorizontal = panel.orientation === "horizontal";

  const left = BOARD_PADDING + panel.col * CELL_STEP;
  const top = BOARD_PADDING + panel.row * CELL_STEP;

  const width = isHorizontal ? CELL_SIZE * 3 + CELL_GAP * 2 : CELL_SIZE;
  const height = isHorizontal ? CELL_SIZE : CELL_SIZE * 3 + CELL_GAP * 2;

  return { left, top, width, height };
}

function getPanelSegmentBoardPosition(
  panel,
  letterIndex,
  anchorOverride = null,
) {
  const baseRow = anchorOverride ? anchorOverride.row : panel.row;
  const baseCol = anchorOverride ? anchorOverride.col : panel.col;

  if (panel.orientation === "horizontal") {
    return {
      row: baseRow,
      col: baseCol + letterIndex,
    };
  }

  return {
    row: baseRow + letterIndex,
    col: baseCol,
  };
}

function getPreviewOverlayStyle(panel, anchorRow, anchorCol) {
  syncBoardMetricsFromCss();

  const isHorizontal = panel.orientation === "horizontal";

  const left = BOARD_PADDING + anchorCol * CELL_STEP;
  const top = BOARD_PADDING + anchorRow * CELL_STEP;

  const width = isHorizontal ? CELL_SIZE * 3 + CELL_GAP * 2 : CELL_SIZE;
  const height = isHorizontal ? CELL_SIZE : CELL_SIZE * 3 + CELL_GAP * 2;

  return { left, top, width, height };
}

function isInBounds(row, col) {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
}

function isEndLetterIndex(letterIndex) {
  return letterIndex === 0 || letterIndex === 2;
}

function clearSelectedPanel() {
  const heldPanel =
    gameState.selectedPanelId !== null
      ? gameState.panels.find((p) => p.id === gameState.selectedPanelId)
      : null;

  if (heldPanel && gameState.heldPanelOrigin) {
    heldPanel.row = gameState.heldPanelOrigin.row;
    heldPanel.col = gameState.heldPanelOrigin.col;
    heldPanel.orientation = gameState.heldPanelOrigin.orientation;
    heldPanel.reversed = gameState.heldPanelOrigin.reversed;
    heldPanel.placed = true;
    heldPanel.placementOrder = gameState.heldPanelOrigin.placementOrder;
  }

  clearDragStateOnly();
  evaluateBoard();
  renderAll();
}

function getCenterFromAnchor(orientation, row, col) {
  if (orientation === "horizontal") {
    return { row, col: col + 1 };
  }

  return { row: row + 1, col };
}

function getAnchorFromCenterForOrientation(orientation, centerRow, centerCol) {
  if (orientation === "horizontal") {
    return { row: centerRow, col: centerCol - 1 };
  }

  return { row: centerRow - 1, col: centerCol };
}

function getHeldBoardAnchor(panel) {
  if (!gameState.heldPanelOrigin) {
    return null;
  }

  const center = getCenterFromAnchor(
    gameState.heldPanelOrigin.orientation,
    gameState.heldPanelOrigin.row,
    gameState.heldPanelOrigin.col,
  );

  return getAnchorFromCenterForOrientation(
    panel.orientation,
    center.row,
    center.col,
  );
}

function getCellCoordsFromPoint(clientX, clientY) {
  const rect = boardEl.getBoundingClientRect();

  const localX = clientX - rect.left - BOARD_PADDING;
  const localY = clientY - rect.top - BOARD_PADDING;

  if (localX < 0 || localY < 0) {
    return null;
  }

  const col = Math.round(localX / CELL_STEP);
  const row = Math.round(localY / CELL_STEP);

  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return null;
  }

  if (!isInBounds(row, col)) {
    return null;
  }

  return { row, col };
}

function placeHeldPanelAtAnchor(anchor) {
  const panel = gameState.panels.find(
    (p) => p.id === gameState.selectedPanelId,
  );
  if (!panel) {
    return false;
  }

  const panelId = panel.id;

  const didPlace = tryPanelMutation(() => {
    const isReturningToOriginalSpot =
      gameState.heldPanelOrigin &&
      anchor.row === gameState.heldPanelOrigin.row &&
      anchor.col === gameState.heldPanelOrigin.col &&
      panel.orientation === gameState.heldPanelOrigin.orientation &&
      panel.reversed === gameState.heldPanelOrigin.reversed;

    panel.row = anchor.row;
    panel.col = anchor.col;
    panel.placed = true;

    if (isReturningToOriginalSpot) {
      panel.placementOrder = gameState.heldPanelOrigin.placementOrder;
    } else {
      panel.placementOrder = ++gameState.placementOrderCounter;
    }
  });

  if (didPlace) {
    clearDragStateOnly();
    triggerPlacementFx(panelId);
  }

  return didPlace;
}

function startPanelMouseDrag(panelId, source, grabIndex, event) {
  const panel = gameState.panels.find((p) => p.id === panelId);
  if (!panel) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  gameState.selectedPanelId = panelId;
  gameState.heldGrabIndex = grabIndex;
  gameState.dragStartClientX = event.clientX;
  gameState.dragStartClientY = event.clientY;
  gameState.dragStartTimeMs = performance.now();
  gameState.dragMaxDistancePx = 0;
  gameState.isMouseDraggingPanel = true;
  gameState.lastLegalAnchor = null;

  if (source === "board" && panel.placed) {
    gameState.heldPanelOrigin = {
      row: panel.row,
      col: panel.col,
      orientation: panel.orientation,
      reversed: panel.reversed,
      placementOrder: panel.placementOrder,
    };

    panel.row = null;
    panel.col = null;
    panel.placed = false;
    panel.placementOrder = null;
  } else {
    gameState.heldPanelOrigin = null;
  }

  gameState.hoverAnchor = null;
  gameState.hoverPreview = null;
  gameState.hoverPreviewIsLegal = false;

  evaluateBoard();
  renderAll();

  document.addEventListener("pointermove", handlePanelDragMouseMove, true);
  document.addEventListener("pointerup", handlePanelDragMouseUp, true);
  document.addEventListener("pointercancel", handlePanelDragMouseUp, true);
}

function handlePanelDragMouseMove(event) {
  event.preventDefault();
  event.stopPropagation();
  if (!gameState.isMouseDraggingPanel || gameState.selectedPanelId === null) {
    return;
  }

  const dx = event.clientX - gameState.dragStartClientX;
  const dy = event.clientY - gameState.dragStartClientY;
  const distance = Math.hypot(dx, dy);
  gameState.dragMaxDistancePx = Math.max(gameState.dragMaxDistancePx, distance);

  gameState.isTrayHot = isPointInTray(event.clientX, event.clientY);

  const panel = gameState.panels.find(
    (p) => p.id === gameState.selectedPanelId,
  );
  if (!panel) {
    return;
  }

  const coords = getCellCoordsFromPoint(event.clientX, event.clientY);

  if (!coords) {
    gameState.hoverAnchor = null;
    gameState.hoverPreview = null;
    gameState.hoverPreviewIsLegal = false;
    renderAll();
    return;
  }

  const anchor = getAnchorFromGrabbedCell(
    panel,
    coords.row,
    coords.col,
    gameState.heldGrabIndex,
  );

  gameState.hoverAnchor = anchor;
  gameState.hoverPreview = getPreviewCellsForPanel(
    panel,
    anchor.row,
    anchor.col,
  );
  gameState.hoverPreviewIsLegal = isPreviewPlacementLegal(
    panel,
    anchor.row,
    anchor.col,
  );

  if (gameState.hoverPreviewIsLegal) {
    gameState.lastLegalAnchor = { ...anchor };
  }

  renderAll();
}

function handlePanelDragMouseUp(event) {
  if (!gameState.isMouseDraggingPanel || gameState.selectedPanelId === null) {
    return;
  }

  const elapsedMs = performance.now() - gameState.dragStartTimeMs;
  const quickClick =
    elapsedMs <= QUICK_CLICK_MAX_MS &&
    gameState.dragMaxDistancePx <= QUICK_CLICK_MAX_MOVE_PX;

  if (quickClick) {
    const rotated = handleRotatePanel(gameState.selectedPanelId);

    if (!rotated) {
      clearSelectedPanel();
    } else {
      renderAll();
    }

    return;
  }

  if (isPointInTray(event.clientX, event.clientY)) {
    returnHeldPanelToTray();
    return;
  }

  const currentAnchor =
    gameState.hoverPreviewIsLegal && gameState.hoverAnchor
      ? { ...gameState.hoverAnchor }
      : null;

  const fallbackAnchor = gameState.lastLegalAnchor
    ? { ...gameState.lastLegalAnchor }
    : null;

  if (currentAnchor) {
    const placed = placeHeldPanelAtAnchor(currentAnchor);
    if (placed) {
      renderAll();
      return;
    }
  }

  if (fallbackAnchor) {
    const placed = placeHeldPanelAtAnchor(fallbackAnchor);
    if (placed) {
      renderAll();
      return;
    }
  }

  clearSelectedPanel();
}

function sendPlacedPanelToTray(panelId) {
  const panel = gameState.panels.find((p) => p.id === panelId);
  if (!panel || !panel.placed) {
    return;
  }

  tryPanelMutation(() => {
    panel.row = null;
    panel.col = null;
    panel.placed = false;
    panel.placementOrder = null;
  });

  renderAll();
}

function startPanelDrag(panelId, source, grabIndex, event) {
  const panel = gameState.panels.find((p) => p.id === panelId);
  if (!panel) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  gameState.selectedPanelId = panelId;
  gameState.heldGrabIndex = grabIndex;
  gameState.dragStartX = event.clientX;
  gameState.dragStartY = event.clientY;
  gameState.isDraggingHeldPanel = true;
  gameState.lastLegalAnchor = null;

  if (source === "board" && panel.placed) {
    gameState.heldPanelOrigin = {
      row: panel.row,
      col: panel.col,
      orientation: panel.orientation,
      reversed: panel.reversed,
      placementOrder: panel.placementOrder,
    };

    panel.row = null;
    panel.col = null;
    panel.placed = false;
    panel.placementOrder = null;
  } else {
    gameState.heldPanelOrigin = null;
  }

  gameState.hoverAnchor = null;
  gameState.hoverPreview = null;
  gameState.hoverPreviewIsLegal = false;

  evaluateBoard();
  renderAll();

  window.addEventListener("pointermove", handleHeldPanelPointerMove, true);
  window.addEventListener("pointerup", handleHeldPanelPointerUp, true);
  window.addEventListener("pointercancel", handleHeldPanelPointerUp, true);
}

function getAnchorFromGrabbedCell(panel, row, col, grabIndex) {
  if (panel.orientation === "horizontal") {
    return {
      row,
      col: col - grabIndex,
    };
  }

  return {
    row: row - grabIndex,
    col,
  };
}

function getLetterIndexAtCell(panel, row, col) {
  const cells = getPanelCells(panel);
  const match = cells.find((cell) => cell.row === row && cell.col === col);
  return match ? match.letterIndex : null;
}

function getTopVisiblePanelIdAtCell(row, col) {
  const cell = gameState.board[row][col];
  if (!cell || cell.occupants.length === 0) {
    return null;
  }

  // The visible/top panel is the occupant that is not covered.
  const visibleOccupant = cell.occupants.find((occupant) => !occupant.covered);
  return visibleOccupant ? visibleOccupant.panelId : null;
}

function getVisibleOccupant(cell) {
  if (!cell || cell.occupants.length === 0) {
    return null;
  }

  return cell.occupants.find((occupant) => !occupant.covered) || null;
}

function getPanelSegmentClass(panel, letterIndex) {
  const orientation = panel.orientation;

  if (orientation === "horizontal") {
    if (letterIndex === 0) return "cell--panel-horizontal-start";
    if (letterIndex === 1) return "cell--panel-horizontal-middle";
    return "cell--panel-horizontal-end";
  }

  if (letterIndex === 0) return "cell--panel-vertical-start";
  if (letterIndex === 1) return "cell--panel-vertical-middle";
  return "cell--panel-vertical-end";
}

function getPanelCenterCell(panel) {
  if (!panel.placed || panel.row === null || panel.col === null) {
    return null;
  }

  if (panel.orientation === "horizontal") {
    return {
      row: panel.row,
      col: panel.col + 1,
    };
  }

  return {
    row: panel.row + 1,
    col: panel.col,
  };
}

function getPreviewCellsForPanel(panel, anchorRow, anchorCol) {
  const letters = getPanelDisplayLetters(panel);
  const cells = [];

  for (let i = 0; i < 3; i++) {
    const row = panel.orientation === "horizontal" ? anchorRow : anchorRow + i;
    const col = panel.orientation === "horizontal" ? anchorCol + i : anchorCol;

    cells.push({
      row,
      col,
      letter: letters[i],
      letterIndex: i,
      panelId: panel.id,
    });
  }

  return cells;
}

function isPreviewPlacementLegal(panel, anchorRow, anchorCol) {
  const previewCells = getPreviewCellsForPanel(panel, anchorRow, anchorCol);

  let overlapCount = 0;

  for (const previewCell of previewCells) {
    const { row, col } = previewCell;

    if (!isInBounds(row, col)) {
      return false;
    }

    const boardCell = gameState.board[row][col];

    if (boardCell.occupants.length === 0) {
      continue;
    }

    if (boardCell.occupants.length >= 2) {
      return false;
    }

    overlapCount += 1;
    if (overlapCount > 1) {
      return false;
    }

    const existing = boardCell.occupants[0];

    if (!isEndLetterIndex(existing.letterIndex)) {
      return false;
    }
  }

  return true;
}

function isPointInTray(clientX, clientY) {
  const rect = panelsListEl.getBoundingClientRect();

  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function returnHeldPanelToTray() {
  const panel = gameState.panels.find(
    (p) => p.id === gameState.selectedPanelId,
  );
  if (!panel) {
    clearDragStateOnly();
    renderAll();
    return;
  }

  panel.row = null;
  panel.col = null;
  panel.placed = false;
  panel.placementOrder = null;

  clearDragStateOnly();
  evaluateBoard();
  renderAll();
}

function isCellOccupiedByPanel(panel, row, col) {
  if (!panel || !panel.placed) {
    return false;
  }

  const cells = getPanelCells(panel);
  return cells.some((cell) => cell.row === row && cell.col === col);
}

function setPanelAnchorFromCenter(panel, centerRow, centerCol) {
  if (panel.orientation === "horizontal") {
    panel.row = centerRow;
    panel.col = centerCol - 1;
  } else {
    panel.row = centerRow - 1;
    panel.col = centerCol;
  }
}

function clearDragStateOnly() {
  gameState.selectedPanelId = null;
  gameState.heldPanelOrigin = null;
  gameState.heldGrabIndex = 1;
  gameState.hoverPreview = null;
  gameState.hoverPreviewIsLegal = true;
  gameState.hoverAnchor = null;
  gameState.dragStartClientX = 0;
  gameState.dragStartClientY = 0;
  gameState.dragStartTimeMs = 0;
  gameState.dragMaxDistancePx = 0;
  gameState.isMouseDraggingPanel = false;
  gameState.lastLegalAnchor = null;
  gameState.isTrayHot = false;

  document.addEventListener("pointermove", handlePanelDragMouseMove, true);
  document.addEventListener("pointerup", handlePanelDragMouseUp, true);
  document.addEventListener("pointercancel", handlePanelDragMouseUp, true);
}

function rebuildBoardFromPanels() {
  createEmptyBoardState();

  let overlapCount = 0;
  let centerOccupied = false;

  const placedPanels = gameState.panels
    .filter((panel) => panel.placed)
    .sort((a, b) => a.placementOrder - b.placementOrder);

  for (const panel of placedPanels) {
    const cells = getPanelCells(panel);

    for (const cellInfo of cells) {
      const { row, col, letter, letterIndex, panelId } = cellInfo;

      if (!isInBounds(row, col)) {
        return {
          isLegal: false,
          error: "A panel extends off the board.",
        };
      }

      const boardCell = gameState.board[row][col];

      if (boardCell.occupants.length === 0) {
        boardCell.occupants.push({
          panelId,
          letterIndex,
          letter,
          covered: false,
        });
        boardCell.visibleLetter = letter;
      } else if (boardCell.occupants.length === 1) {
        const existing = boardCell.occupants[0];

        overlapCount += 1;
        if (overlapCount > 1) {
          return {
            isLegal: false,
            error: "Only one overlapped cell is allowed.",
          };
        }

        if (!isEndLetterIndex(existing.letterIndex)) {
          return {
            isLegal: false,
            error: "You cannot cover the center letter of a panel.",
          };
        }

        existing.covered = true;

        boardCell.occupants.push({
          panelId,
          letterIndex,
          letter,
          covered: false,
        });

        boardCell.visibleLetter = letter;
        boardCell.isOverlap = true;
      } else {
        return {
          isLegal: false,
          error: "A cell cannot contain more than two overlapping letters.",
        };
      }

      if (row === CENTER_ROW && col === CENTER_COL) {
        centerOccupied = true;
      }
    }
  }

  return {
    isLegal: true,
    error: "",
    overlapCount,
    centerOccupied,
  };
}

function extractMiddleRowWord() {
  const row = gameState.board[MIDDLE_ROW];
  const centerCell = row[CENTER_COL];

  if (!centerCell.visibleLetter) {
    return "";
  }

  let start = CENTER_COL;
  let end = CENTER_COL;

  while (start - 1 >= 0 && row[start - 1].visibleLetter) {
    start -= 1;
  }

  while (end + 1 < BOARD_COLS && row[end + 1].visibleLetter) {
    end += 1;
  }

  let word = "";
  for (let col = start; col <= end; col++) {
    word += row[col].visibleLetter;
  }

  return word;
}

function awardWordIfValid(word, startCol, endCol) {
  if (!gameState.puzzle || !word) {
    return;
  }

  if (word.length < 4 || word.length > 11) {
    return;
  }

  const normalized = word.toUpperCase();

  if (!gameState.allowedWordsSet.has(normalized)) {
    return;
  }

  if (gameState.foundWords.has(normalized)) {
    return;
  }

  gameState.foundWords.add(normalized);
  gameState.recentFinds.unshift(normalized);
  gameState.recentFinds = gameState.recentFinds.slice(0, 5);

  triggerFoundWordFx(normalized, startCol, endCol);

  if (gameState.foundWords.size === gameState.puzzle.allowedWords.length) {
    gameState.isSolved = true;
  }
}

function evaluateBoard() {
  gameState.lastError = "";
  gameState.currentVisibleWord = "";

  const result = rebuildBoardFromPanels();

  if (!result.isLegal) {
    gameState.lastError = result.error;
    return result;
  }

  const middleRun = getCurrentMiddleRun();

  if (middleRun) {
    gameState.currentVisibleWord = middleRun.word;
    awardWordIfValid(middleRun.word, middleRun.startCol, middleRun.endCol);
  }

  return result;
}

function getCurrentMiddleRun() {
  const row = gameState.board[MIDDLE_ROW];
  const centerCell = row[CENTER_COL];

  if (!centerCell.visibleLetter) {
    return null;
  }

  let startCol = CENTER_COL;
  let endCol = CENTER_COL;

  while (startCol - 1 >= 0 && row[startCol - 1].visibleLetter) {
    startCol -= 1;
  }

  while (endCol + 1 < BOARD_COLS && row[endCol + 1].visibleLetter) {
    endCol += 1;
  }

  let word = "";
  for (let col = startCol; col <= endCol; col++) {
    word += row[col].visibleLetter;
  }

  return {
    word,
    startCol,
    endCol,
  };
}

function triggerPlacementFx(panelId) {
  if (gameState.placementFxTimer) {
    clearTimeout(gameState.placementFxTimer);
    gameState.placementFxTimer = null;
  }

  gameState.placementFx = {
    panelId,
    timestamp: Date.now(),
  };

  gameState.placementFxTimer = window.setTimeout(() => {
    gameState.placementFx = null;
    gameState.placementFxTimer = null;
    renderAll();
  }, 180);
}

function triggerFoundWordFx(word, startCol, endCol) {
  if (gameState.foundWordFxTimer) {
    clearTimeout(gameState.foundWordFxTimer);
    gameState.foundWordFxTimer = null;
  }

  if (gameState.foundWordToastTimer) {
    clearTimeout(gameState.foundWordToastTimer);
    gameState.foundWordToastTimer = null;
  }

  gameState.foundWordFx = {
    word,
    startCol,
    endCol,
    timestamp: Date.now(),
  };

  gameState.foundWordToast = {
    word,
    timestamp: Date.now(),
  };

  gameState.foundWordFxTimer = window.setTimeout(() => {
    gameState.foundWordFx = null;
    gameState.foundWordFxTimer = null;
    renderAll();
  }, 520);

  gameState.foundWordToastTimer = window.setTimeout(() => {
    gameState.foundWordToast = null;
    gameState.foundWordToastTimer = null;
    renderAll();
  }, 620);

  renderAll();
}

function getWordCountsByLength() {
  if (!gameState.puzzle) {
    return {};
  }

  const totals = {};
  const found = {};

  for (const word of gameState.puzzle.allowedWords) {
    const len = String(word.length);
    totals[len] = (totals[len] || 0) + 1;

    if (gameState.foundWords.has(word)) {
      found[len] = (found[len] || 0) + 1;
    }
  }

  const result = {};
  for (const len of Object.keys(totals)) {
    result[len] = {
      total: totals[len],
      found: found[len] || 0,
      remaining: totals[len] - (found[len] || 0),
    };
  }

  return result;
}

function getRemainingCountsByLengthAndStart() {
  if (!gameState.puzzle) {
    return {};
  }

  const result = {};

  for (const word of gameState.puzzle.allowedWords) {
    if (gameState.foundWords.has(word)) {
      continue;
    }

    const len = String(word.length);
    const start = word[0];

    if (!result[len]) {
      result[len] = {};
    }

    result[len][start] = (result[len][start] || 0) + 1;
  }

  return result;
}

function handleRotatePanel(panelId, options = {}) {
  const panel = gameState.panels.find((p) => p.id === panelId);
  if (!panel) {
    return false;
  }

  const rotateSource =
    options.source || (gameState.heldPanelOrigin ? "board" : "tray");
  const boardOrigin = options.boardOrigin || gameState.heldPanelOrigin || null;

  const fromOrientation = panel.orientation;
  const fromReversed = panel.reversed;
  const nextState = getNextRotationState(panel.orientation, panel.reversed);

  // Board rotation: always rotate around the center of the board position.
  if (rotateSource === "board" && boardOrigin) {
    const center = getCenterFromAnchor(
      boardOrigin.orientation,
      boardOrigin.row,
      boardOrigin.col,
    );

    const rotatedAnchor = getAnchorFromCenterForOrientation(
      nextState.orientation,
      center.row,
      center.col,
    );

    const savedRow = panel.row;
    const savedCol = panel.col;
    const savedPlaced = panel.placed;
    const savedPlacementOrder = panel.placementOrder;

    const didRotate = tryPanelMutation(() => {
      panel.orientation = nextState.orientation;
      panel.reversed = nextState.reversed;
      panel.row = rotatedAnchor.row;
      panel.col = rotatedAnchor.col;
      panel.placed = true;
      panel.placementOrder = boardOrigin.placementOrder;
    });

    if (!didRotate) {
      panel.orientation = fromOrientation;
      panel.reversed = fromReversed;
      panel.row = savedRow;
      panel.col = savedCol;
      panel.placed = savedPlaced;
      panel.placementOrder = savedPlacementOrder;
      return false;
    }

    clearDragStateOnly();
    triggerRotationFx(panelId, "board", fromOrientation, nextState.orientation);
    return true;
  }

  // Tray rotation: rotate in place, no board anchor math.
  const didRotate = tryPanelMutation(() => {
    panel.orientation = nextState.orientation;
    panel.reversed = nextState.reversed;
  });

  if (!didRotate) {
    panel.orientation = fromOrientation;
    panel.reversed = fromReversed;
    return false;
  }

  clearDragStateOnly();
  triggerRotationFx(panelId, "tray", fromOrientation, nextState.orientation);
  return true;
}

function triggerRotationFx(panelId, source, fromOrientation, toOrientation) {
  if (gameState.rotationFxTimer) {
    clearTimeout(gameState.rotationFxTimer);
    gameState.rotationFxTimer = null;
  }

  gameState.rotationFx = {
    panelId,
    source,
    fromOrientation,
    toOrientation,
  };

  gameState.rotationFxTimer = window.setTimeout(() => {
    gameState.rotationFx = null;
    gameState.rotationFxTimer = null;
    renderAll();
  }, 170);
}

function getNextRotationState(orientation, reversed) {
  const states = [
    { orientation: "horizontal", reversed: false },
    { orientation: "vertical", reversed: false },
    { orientation: "horizontal", reversed: true },
    { orientation: "vertical", reversed: true },
  ];

  const index = states.findIndex(
    (state) => state.orientation === orientation && state.reversed === reversed,
  );

  return states[(index + 1) % states.length];
}

function clonePanelsState(panels) {
  return panels.map((panel) => ({
    id: panel.id,
    letters: panel.letters,
    orientation: panel.orientation,
    reversed: panel.reversed,
    row: panel.row,
    col: panel.col,
    placed: panel.placed,
    placementOrder: panel.placementOrder,
  }));
}

function restorePanelsState(savedPanels) {
  gameState.panels = clonePanelsState(savedPanels);
}

function tryPanelMutation(mutateFn) {
  const savedPanels = clonePanelsState(gameState.panels);
  const savedPlacementOrderCounter = gameState.placementOrderCounter;
  const savedRecentFinds = [...gameState.recentFinds];
  const savedFoundWords = new Set(gameState.foundWords);
  const savedCurrentVisibleWord = gameState.currentVisibleWord;
  const savedIsSolved = gameState.isSolved;
  const savedLastError = gameState.lastError;

  mutateFn();

  const result = evaluateBoard();

  if (!result.isLegal) {
    restorePanelsState(savedPanels);
    gameState.placementOrderCounter = savedPlacementOrderCounter;
    gameState.recentFinds = savedRecentFinds;
    gameState.foundWords = savedFoundWords;
    gameState.currentVisibleWord = savedCurrentVisibleWord;
    gameState.isSolved = savedIsSolved;
    gameState.lastError = result.error || savedLastError;

    evaluateBoard();
    return false;
  }

  gameState.lastError = "";
  return true;
}

function handleRemovePanel(panelId) {
  const panel = gameState.panels.find((p) => p.id === panelId);
  if (!panel) {
    return;
  }

  tryPanelMutation(() => {
    panel.row = null;
    panel.col = null;
    panel.placed = false;
    panel.placementOrder = null;
  });

  renderAll();
}

function handleClearBoard() {
  tryPanelMutation(() => {
    for (const panel of gameState.panels) {
      panel.row = null;
      panel.col = null;
      panel.placed = false;
      panel.placementOrder = null;
    }
    gameState.placementOrderCounter = 0;
    gameState.selectedPanelId = null;
    gameState.hoverPreview = null;
    gameState.hoverPreviewIsLegal = true;
    gameState.hoverAnchor = null;
  });

  renderAll();
}

function getRemainingCountsByLength() {
  if (!gameState.puzzle) {
    return {};
  }

  const remaining = {};

  for (const word of gameState.puzzle.allowedWords) {
    if (gameState.foundWords.has(word)) {
      continue;
    }

    const key = String(word.length);
    remaining[key] = (remaining[key] || 0) + 1;
  }

  return remaining;
}

function showError(message) {
  gameState.lastError = message;
  renderMessage();
}

function renderAll() {
  syncBoardMetricsFromCss();
  renderBoard();
  renderPanelOverlays();
  renderPanels();
  renderMiddleRowReadout();
  renderRecentFinds();
  renderCounts();
  renderStatus();
  renderMessage();
  renderWinState();
  renderFoundWordToast();
}

function getCellCoordsFromPoint(clientX, clientY) {
  syncBoardMetricsFromCss();

  const rect = boardEl.getBoundingClientRect();

  const localX = clientX - rect.left - BOARD_PADDING;
  const localY = clientY - rect.top - BOARD_PADDING;

  const totalGridWidth = BOARD_COLS * CELL_SIZE + (BOARD_COLS - 1) * CELL_GAP;
  const totalGridHeight = BOARD_ROWS * CELL_SIZE + (BOARD_ROWS - 1) * CELL_GAP;

  if (
    localX < -CELL_GAP ||
    localY < -CELL_GAP ||
    localX > totalGridWidth + CELL_GAP ||
    localY > totalGridHeight + CELL_GAP
  ) {
    return null;
  }

  const col = Math.round(localX / CELL_STEP);
  const row = Math.round(localY / CELL_STEP);

  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return null;
  }

  if (!isInBounds(row, col)) {
    return null;
  }

  return { row, col };
}

function handleBoardMouseOver(event) {
  const coords = getCellCoordsFromEventTarget(event.target);
  if (!coords) {
    return;
  }

  handleBoardCellMouseEnter(coords.row, coords.col);
}

function handleBoardClick(event) {
  return;
}

function handleBoardCellMouseEnter(row, col) {
  if (!gameState.isDraggingHeldPanel || gameState.selectedPanelId === null) {
    return;
  }

  const panel = gameState.panels.find(
    (p) => p.id === gameState.selectedPanelId,
  );
  if (!panel) {
    return;
  }

  const anchor = getAnchorFromGrabbedCell(
    panel,
    row,
    col,
    gameState.heldGrabIndex,
  );

  gameState.hoverAnchor = anchor;
  gameState.hoverPreview = getPreviewCellsForPanel(
    panel,
    anchor.row,
    anchor.col,
  );
  gameState.hoverPreviewIsLegal = isPreviewPlacementLegal(
    panel,
    anchor.row,
    anchor.col,
  );

  if (gameState.hoverPreviewIsLegal) {
    gameState.lastLegalAnchor = { ...anchor };
  }

  renderAll();
}

function handleBoardMouseLeave() {
  if (gameState.isDraggingHeldPanel) {
    gameState.hoverAnchor = null;
    gameState.hoverPreview = null;
    gameState.hoverPreviewIsLegal = false;
    renderAll();
  }
}

function beginPendingPress(panelId, source, grabIndex, event) {
  gameState.pendingPressPanelId = panelId;
  gameState.pendingPressSource = source;
  gameState.pendingPressGrabIndex = grabIndex;
  gameState.pendingPressStartX = event.clientX;
  gameState.pendingPressStartY = event.clientY;
  gameState.pendingPressStartTimeMs = performance.now();

  document.addEventListener("pointermove", handlePendingPressMouseMove, true);
  document.addEventListener("pointerup", handlePendingPressMouseUp, true);
  document.addEventListener("pointercancel", handlePendingPressMouseUp, true);
}

function clearPendingPress() {
  gameState.pendingPressPanelId = null;
  gameState.pendingPressSource = null;
  gameState.pendingPressGrabIndex = 1;
  gameState.pendingPressStartX = 0;
  gameState.pendingPressStartY = 0;
  gameState.pendingPressStartTimeMs = 0;

  document.removeEventListener("pointermove", handlePendingPressMouseMove, true);
  document.removeEventListener("pointerup", handlePendingPressMouseUp, true);
  document.removeEventListener("pointercancel", handlePendingPressMouseUp, true);
}

function handlePendingPressMouseMove(event) {
  event.preventDefault();
  event.stopPropagation();
  if (gameState.pendingPressPanelId === null) {
    return;
  }

  const dx = event.clientX - gameState.pendingPressStartX;
  const dy = event.clientY - gameState.pendingPressStartY;
  const distance = Math.hypot(dx, dy);

  if (distance < PENDING_DRAG_START_MOVE_PX) {
    return;
  }

  const panelId = gameState.pendingPressPanelId;
  const source = gameState.pendingPressSource;
  const grabIndex = gameState.pendingPressGrabIndex;

  clearPendingPress();

  startPanelMouseDragFromExistingPointer(panelId, source, grabIndex, event);
}

function handlePendingPressMouseUp(event) {
  if (gameState.pendingPressPanelId === null) {
    return;
  }

  const panelId = gameState.pendingPressPanelId;
  const source = gameState.pendingPressSource;
  const elapsedMs = performance.now() - gameState.pendingPressStartTimeMs;

  let boardOrigin = null;
  if (source === "board") {
    const panel = gameState.panels.find((p) => p.id === panelId);
    if (panel && panel.placed) {
      boardOrigin = {
        row: panel.row,
        col: panel.col,
        orientation: panel.orientation,
        reversed: panel.reversed,
        placementOrder: panel.placementOrder,
      };
    }
  }

  clearPendingPress();

  if (elapsedMs <= QUICK_CLICK_MAX_MS) {
    const rotated = handleRotatePanel(panelId, {
      source,
      boardOrigin,
    });

    if (!rotated) {
      renderAll();
    } else {
      renderAll();
    }
  }
}
function startPanelMouseDragFromExistingPointer(
  panelId,
  source,
  grabIndex,
  event,
) {
  const panel = gameState.panels.find((p) => p.id === panelId);
  if (!panel) {
    return;
  }

  gameState.selectedPanelId = panelId;
  gameState.heldGrabIndex = grabIndex;
  gameState.dragStartClientX = event.clientX;
  gameState.dragStartClientY = event.clientY;
  gameState.dragStartTimeMs = performance.now();
  gameState.dragMaxDistancePx = 0;
  gameState.isMouseDraggingPanel = true;
  gameState.lastLegalAnchor = null;

  if (source === "board" && panel.placed) {
    gameState.heldPanelOrigin = {
      row: panel.row,
      col: panel.col,
      orientation: panel.orientation,
      reversed: panel.reversed,
      placementOrder: panel.placementOrder,
    };

    panel.row = null;
    panel.col = null;
    panel.placed = false;
    panel.placementOrder = null;
  } else {
    gameState.heldPanelOrigin = null;
  }

  gameState.hoverAnchor = null;
  gameState.hoverPreview = null;
  gameState.hoverPreviewIsLegal = false;

  evaluateBoard();
  renderAll();

  document.addEventListener("pointermove", handlePanelDragMouseMove, true);
  document.addEventListener("pointerup", handlePanelDragMouseUp, true);
  document.addEventListener("pointercancel", handlePanelDragMouseUp, true);
}

function handleBoardCellClick(row, col) {
  return;
}

function renderBoard() {
  boardEl.innerHTML = "";

  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const cell = gameState.board[row][col];
      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      cellEl.dataset.row = String(row);
      cellEl.dataset.col = String(col);

      if (row === MIDDLE_ROW) {
        cellEl.classList.add("cell--middle-row");
      }

      if (row === CENTER_ROW && col === CENTER_COL) {
        cellEl.classList.add("cell--center");
      }

      if (cell.visibleLetter) {
        cellEl.classList.add("cell--occupied");
      }

      if (cell.isOverlap) {
        cellEl.classList.add("cell--overlap");
      }

      if (gameState.selectedPanelId !== null) {
        cellEl.classList.add("cell--clickable");
      }

      const coordsEl = document.createElement("div");
      coordsEl.className = "cell-coords";
      coordsEl.textContent = `${row},${col}`;
      cellEl.appendChild(coordsEl);

      boardEl.appendChild(cellEl);
    }
  }
}

function renderPanelOverlays() {
  panelOverlaysEl.innerHTML = "";

  const placedPanels = gameState.panels
    .filter((panel) => panel.placed)
    .sort((a, b) => a.placementOrder - b.placementOrder);

  for (const panel of placedPanels) {
    const overlay = document.createElement("div");
    overlay.className = "panel-overlay";
    overlay.style.pointerEvents = "auto";
    overlay.draggable = false;

    overlay.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });

    if (panel.orientation === "horizontal") {
      overlay.classList.add("panel-overlay--horizontal");
    } else {
      overlay.classList.add("panel-overlay--vertical");
    }

    const isRotating =
      gameState.rotationFx &&
      gameState.rotationFx.source === "board" &&
      gameState.rotationFx.panelId === panel.id;

    if (isRotating) {
      overlay.classList.add("panel-overlay--rotating");
      overlay.style.setProperty("--panel-rotate-from", "-90deg");
      overlay.style.setProperty("--panel-letter-rotate-from", "90deg");
    }

    const isSettling =
      gameState.placementFx && gameState.placementFx.panelId === panel.id;

    if (isSettling) {
      overlay.classList.add("panel-overlay--settling");
    }

    const { left, top, width, height } = getPanelOverlayStyle(panel);
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.style.zIndex = String(10 + (panel.placementOrder || 0));

    const cells = getPanelCells(panel);

    for (let i = 0; i < 3; i++) {
      const segment = document.createElement("div");
      segment.className = "panel-overlay__segment";

      if (i === 1) {
        segment.classList.add("panel-overlay__segment--middle");
      }

      const segmentPos = getPanelSegmentBoardPosition(panel, i);

      if (segmentPos.row === MIDDLE_ROW) {
        segment.classList.add("panel-overlay__segment--in-middle-row");
      }

      const cellInfo = cells[i];
      if (
        gameState.foundWordFx &&
        cellInfo &&
        cellInfo.row === MIDDLE_ROW &&
        cellInfo.col >= gameState.foundWordFx.startCol &&
        cellInfo.col <= gameState.foundWordFx.endCol
      ) {
        segment.classList.add("panel-overlay__segment--found-scan");
        segment.style.setProperty(
          "--scan-index",
          String(cellInfo.col - gameState.foundWordFx.startCol),
        );
      }

      const letter = document.createElement("div");
      letter.className = "panel-overlay__letter";
      letter.textContent = getPanelDisplayLetters(panel)[i];
      letter.draggable = false;

      if (segmentPos.row === MIDDLE_ROW) {
        letter.classList.add("panel-overlay__letter--in-middle-row");
      }

      letter.addEventListener("dragstart", (event) => {
        event.preventDefault();
      });

      segment.appendChild(letter);
      overlay.appendChild(segment);
    }

overlay.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const clickedLetterIndex = getLetterIndexAtPlacedPanelFromEvent(
    panel,
    event,
  );

  beginPendingPress(panel.id, "board", clickedLetterIndex, event);
});

    overlay.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      sendPlacedPanelToTray(panel.id);
    });

    panelOverlaysEl.appendChild(overlay);
  }

  if (
    gameState.selectedPanelId !== null &&
    gameState.isMouseDraggingPanel &&
    gameState.hoverAnchor
  ) {
    const panel = gameState.panels.find(
      (p) => p.id === gameState.selectedPanelId,
    );

    if (panel) {
      const preview = document.createElement("div");
      preview.className = "panel-overlay panel-overlay--preview";
      preview.style.pointerEvents = "none";
      preview.draggable = false;

      preview.addEventListener("dragstart", (event) => {
        event.preventDefault();
      });

      if (panel.orientation === "horizontal") {
        preview.classList.add("panel-overlay--horizontal");
      } else {
        preview.classList.add("panel-overlay--vertical");
      }

      if (!gameState.hoverPreviewIsLegal) {
        preview.classList.add("panel-overlay--preview-illegal");
      }

      const { left, top, width, height } = getPreviewOverlayStyle(
        panel,
        gameState.hoverAnchor.row,
        gameState.hoverAnchor.col,
      );

      preview.style.left = `${left}px`;
      preview.style.top = `${top}px`;
      preview.style.width = `${width}px`;
      preview.style.height = `${height}px`;
      preview.style.zIndex = "1000";

      const letters = getPanelDisplayLetters(panel);

      for (let i = 0; i < 3; i++) {
        const segment = document.createElement("div");
        segment.className = "panel-overlay__segment";

        if (i === 1) {
          segment.classList.add("panel-overlay__segment--middle");
        }

        const segmentPos = getPanelSegmentBoardPosition(
          panel,
          i,
          gameState.hoverAnchor,
        );

        if (segmentPos.row === MIDDLE_ROW) {
          segment.classList.add("panel-overlay__segment--in-middle-row");
        }

        const letter = document.createElement("div");
        letter.className = "panel-overlay__letter";
        letter.textContent = letters[i];
        letter.draggable = false;

        if (segmentPos.row === MIDDLE_ROW) {
          letter.classList.add("panel-overlay__letter--in-middle-row");
        }

        letter.addEventListener("dragstart", (event) => {
          event.preventDefault();
        });

        segment.appendChild(letter);
        preview.appendChild(segment);
      }

      panelOverlaysEl.appendChild(preview);
    }
  }
}

function getLetterIndexAtPlacedPanelFromEvent(panel, event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;

  if (panel.orientation === "horizontal") {
    const segmentWidth = rect.width / 3;
    return Math.max(0, Math.min(2, Math.floor(localX / segmentWidth)));
  }

  const segmentHeight = rect.height / 3;
  return Math.max(0, Math.min(2, Math.floor(localY / segmentHeight)));
}

function renderPanels() {
  panelsListEl.innerHTML = "";

  if (gameState.isTrayHot) {
    panelsListEl.classList.add("panels-list--hot");
  } else {
    panelsListEl.classList.remove("panels-list--hot");
  }

  for (const panel of gameState.panels) {
    const selectedFromBoard =
      panel.id === gameState.selectedPanelId &&
      gameState.heldPanelOrigin !== null;

    if (panel.placed || selectedFromBoard) {
      const emptySlot = document.createElement("div");
      emptySlot.className = "tray-slot tray-slot--empty";
      emptySlot.draggable = false;

      emptySlot.addEventListener("dragstart", (event) => {
        event.preventDefault();
      });

      emptySlot.addEventListener("contextmenu", (event) => {
        event.preventDefault();
      });

      panelsListEl.appendChild(emptySlot);
      continue;
    }

    const item = document.createElement("div");
    item.className = "tray-slot";
    item.draggable = false;

    item.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });

    const piece = document.createElement("div");
    piece.className = "tray-piece";
    piece.draggable = false;

    piece.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });

    if (panel.orientation === "horizontal") {
      piece.classList.add("tray-piece--horizontal");
    } else {
      piece.classList.add("tray-piece--vertical");
    }

    const isRotating =
      gameState.rotationFx &&
      gameState.rotationFx.source === "tray" &&
      gameState.rotationFx.panelId === panel.id;

    if (isRotating) {
      piece.classList.add("tray-piece--rotating");

      const rotateFrom = "-90deg";

      piece.style.setProperty("--panel-rotate-from", rotateFrom);
      piece.style.setProperty("--panel-letter-rotate-from", "90deg");
    }

    const letters = getPanelDisplayLetters(panel);

    for (let i = 0; i < 3; i++) {
      const segment = document.createElement("div");
      segment.className = "tray-piece__segment";

      if (i === 1) {
        segment.classList.add("tray-piece__segment--middle");
      }

      const letter = document.createElement("div");
      letter.className = "tray-piece__letter";
      letter.textContent = letters[i];
      letter.draggable = false;

      letter.addEventListener("dragstart", (event) => {
        event.preventDefault();
      });

      segment.appendChild(letter);
      piece.appendChild(segment);
    }

    item.appendChild(piece);

    item.addEventListener("pointerdown", (event) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      if (event.button !== 0) {
        return;
      }

      startPanelMouseDrag(panel.id, "tray", 1, event);
    });

    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    panelsListEl.appendChild(item);
  }
}

function renderMiddleRowReadout() {
  if (!middleRowReadoutEl) {
    return;
  }

  middleRowReadoutEl.textContent = "";
  middleRowReadoutEl.classList.add("hidden");
}

function renderRecentFinds() {
  recentListEl.innerHTML = "";

  const words = gameState.recentFinds.slice(0, 5);

  if (words.length === 0) {
    const empty = document.createElement("div");
    empty.className = "recent-strip__empty";
    empty.textContent = "No words found yet.";
    recentListEl.appendChild(empty);
    return;
  }

  for (const word of words) {
    const pill = document.createElement("div");
    pill.className = "recent-strip__item";

    if (gameState.foundWordFx && gameState.foundWordFx.word === word) {
      pill.classList.add("recent-strip__item--fresh");
    }

    pill.textContent = word;
    recentListEl.appendChild(pill);
  }
}

function renderCounts() {
  countsListEl.innerHTML = "";

  if (!gameState.puzzle) {
    const empty = document.createElement("div");
    empty.className = "count-accordion-item count-accordion-item--empty";
    empty.textContent = "Load a puzzle to see clues.";
    countsListEl.appendChild(empty);
    return;
  }

  const counts = getWordCountsByLength();
  const breakdowns = getRemainingCountsByLengthAndStart();
  const lengths = Object.keys(counts).sort((a, b) => Number(a) - Number(b));

  for (const length of lengths) {
    const data = counts[length];
    const percent = data.total === 0 ? 0 : (data.found / data.total) * 100;
    const isOpen = gameState.expandedCountLength === length;

    const item = document.createElement("div");
    item.className = "count-accordion-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "count-accordion-button";
    button.setAttribute("aria-expanded", String(isOpen));

    button.addEventListener("click", () => {
      gameState.expandedCountLength =
        gameState.expandedCountLength === length ? null : length;
      renderCounts();
    });

    const top = document.createElement("div");
    top.className = "count-accordion-top";

    const left = document.createElement("div");
    left.className = "count-accordion-left";

    const lengthEl = document.createElement("div");
    lengthEl.className = "count-accordion-length";
    lengthEl.textContent = `${length}`;

    const lengthLabelEl = document.createElement("div");
    lengthLabelEl.className = "count-accordion-length-label";
    lengthLabelEl.textContent = `${length}-letter words`;

    left.appendChild(lengthEl);
    left.appendChild(lengthLabelEl);

    const right = document.createElement("div");
    right.className = "count-accordion-right";

    const foundEl = document.createElement("div");
    foundEl.className = "count-accordion-found";
    foundEl.textContent = `${data.found}/${data.total}`;

    const remainingEl = document.createElement("div");
    remainingEl.className = "count-accordion-remaining";
    remainingEl.textContent = `${data.remaining} left`;

    right.appendChild(foundEl);
    right.appendChild(remainingEl);

    top.appendChild(left);
    top.appendChild(right);

    const bar = document.createElement("div");
    bar.className = "count-accordion-bar";

    const fill = document.createElement("div");
    fill.className = "count-accordion-bar-fill";
    fill.style.width = `${percent}%`;

    bar.appendChild(fill);

    button.appendChild(top);
    button.appendChild(bar);

    item.appendChild(button);

    if (isOpen) {
      const detail = document.createElement("div");
      detail.className = "count-accordion-detail";

      const starts = breakdowns[length] || {};
      const letters = Object.keys(starts).sort();

      if (letters.length === 0) {
        const empty = document.createElement("div");
        empty.className = "count-accordion-detail-empty";
        empty.textContent = "None left";
        detail.appendChild(empty);
      } else {
        for (const start of letters) {
          const row = document.createElement("div");
          row.className = "count-accordion-detail-row";

          const startEl = document.createElement("span");
          startEl.className = "count-accordion-detail-start";
          startEl.textContent = start;

          const countEl = document.createElement("span");
          countEl.className = "count-accordion-detail-count";
          countEl.textContent = starts[start];

          row.appendChild(startEl);
          row.appendChild(countEl);
          detail.appendChild(row);
        }
      }

      item.appendChild(detail);
    }

    countsListEl.appendChild(item);
  }
}

function openAllWordsModal() {
  renderAllWordsModalContent();
  allWordsModalEl.classList.remove("hidden");
  allWordsModalEl.setAttribute("aria-hidden", "false");
}

function closeAllWordsModal() {
  allWordsModalEl.classList.add("hidden");
  allWordsModalEl.setAttribute("aria-hidden", "true");
}

function openHowToPlay() {
  howToPlayModalEl.classList.remove("hidden");
  howToPlayModalEl.setAttribute("aria-hidden", "false");
}

function closeHowToPlay() {
  howToPlayModalEl.classList.add("hidden");
  howToPlayModalEl.setAttribute("aria-hidden", "true");
}

function renderAllWordsModalContent() {
  allWordsListEl.innerHTML = "";

  if (!gameState.puzzle) {
    const empty = document.createElement("div");
    empty.className = "all-words-empty";
    empty.textContent = "Load a puzzle to see found words.";
    allWordsListEl.appendChild(empty);
    return;
  }

  const foundWords = [...gameState.foundWords].sort((a, b) => {
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    return a.localeCompare(b);
  });

  if (foundWords.length === 0) {
    const empty = document.createElement("div");
    empty.className = "all-words-empty";
    empty.textContent = "No words found yet.";
    allWordsListEl.appendChild(empty);
    return;
  }

  const groups = new Map();

  for (const word of foundWords) {
    const len = String(word.length);
    if (!groups.has(len)) {
      groups.set(len, []);
    }
    groups.get(len).push(word);
  }

  for (const [length, words] of groups.entries()) {
    const section = document.createElement("div");
    section.className = "all-words-group";

    const title = document.createElement("div");
    title.className = "all-words-group__title";
    title.textContent = `${length}-letter words`;

    const grid = document.createElement("div");
    grid.className = "all-words-group__grid";

    for (const word of words) {
      const pill = document.createElement("div");
      pill.className = "all-words-pill";
      pill.textContent = word;
      grid.appendChild(pill);
    }

    section.appendChild(title);
    section.appendChild(grid);
    allWordsListEl.appendChild(section);
  }
}

function renderFoundWordToast() {
  const existing = document.getElementById("foundWordToast");

  if (!gameState.foundWordToast) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  const toastKey = `${gameState.foundWordToast.word}-${gameState.foundWordToast.timestamp}`;

  if (existing && existing.dataset.toastKey === toastKey) {
    return;
  }

  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.id = "foundWordToast";
  toast.className = "found-word-toast";
  toast.textContent = gameState.foundWordToast.word;
  toast.dataset.toastKey = toastKey;

  const boardWrap = boardEl.parentElement || boardEl;
  boardWrap.appendChild(toast);
}

function renderStatus() {
  if (puzzleIdPillEl) {
    puzzleIdPillEl.textContent = "";
    puzzleIdPillEl.classList.add("hidden");
  }

  if (!foundCountPillEl) {
    return;
  }

  if (!gameState.puzzle) {
    foundCountPillEl.textContent = "Found: 0";
    return;
  }

  foundCountPillEl.textContent = `Found: ${gameState.foundWords.size} / ${gameState.puzzle.allowedWords.length}`;
}

function renderMessage() {
  if (gameState.lastError) {
    messageBoxEl.textContent = gameState.lastError;
    messageBoxEl.classList.remove("hidden");
  } else {
    messageBoxEl.textContent = "";
    messageBoxEl.classList.add("hidden");
  }
}

function renderWinState() {
  if (gameState.isSolved) {
    winBoxEl.classList.remove("hidden");
  } else {
    winBoxEl.classList.add("hidden");
  }
}
