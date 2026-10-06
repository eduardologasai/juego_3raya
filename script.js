/* =========================================================
   Juego de Tres en Raya - L├│gica, IA Minimax y Efectos de Audio
   ========================================================= */

// Audio sintetizado con Web Audio API (sin archivos externos)
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playTone(freq, type = 'sine', duration = 0.1, delay = 0) {
    if (!this.enabled) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + delay + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + delay);
      osc.stop(this.ctx.currentTime + delay + duration);
    } catch (e) {
      // Navegadores que bloquean audio antes de interacci├│n
    }
  }

  playMove() {
    this.playTone(480, 'sine', 0.08);
  }

  playWin() {
    this.playTone(523.25, 'triangle', 0.15, 0);     // C5
    this.playTone(659.25, 'triangle', 0.15, 0.12);  // E5
    this.playTone(783.99, 'triangle', 0.25, 0.24);  // G5
  }

  playTie() {
    this.playTone(330, 'sawtooth', 0.15, 0);
    this.playTone(260, 'sawtooth', 0.25, 0.15);
  }
}

// Estado del Juego
const GameState = {
  board: Array(9).fill(null),
  currentPlayer: 'X',
  gameActive: true,
  gameMode: 'ai_hard', // 'pvp', 'ai_easy', 'ai_hard'
  scores: { X: 0, O: 0, ties: 0 },
  sound: new SoundManager(),
  WIN_COMBOS: [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Filas
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columnas
    [0, 4, 8], [2, 4, 6]             // Diagonales
  ]
};

// Elementos DOM
const elements = {
  cells: document.querySelectorAll('.cell'),
  board: document.getElementById('board'),
  gameMode: document.getElementById('gameMode'),
  turnIndicator: document.getElementById('turnIndicator'),
  statusBanner: document.getElementById('statusBanner'),
  scoreX: document.getElementById('scoreX'),
  scoreO: document.getElementById('scoreO'),
  scoreTies: document.getElementById('scoreTies'),
  labelO: document.getElementById('labelO'),
  btnRestart: document.getElementById('btnRestart'),
  btnResetScore: document.getElementById('btnResetScore'),
  btnSound: document.getElementById('btnSound'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalTitle: document.getElementById('modalTitle'),
  modalMessage: document.getElementById('modalMessage'),
  btnModalNext: document.getElementById('btnModalNext')
};

// Inicializaci├│n
function init() {
  loadScores();
  bindEvents();
  updateUI();
  updateModeLabel();
}

function bindEvents() {
  elements.cells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
  });

  elements.gameMode.addEventListener('change', (e) => {
    GameState.gameMode = e.target.value;
    updateModeLabel();
    restartGame();
  });

  elements.btnRestart.addEventListener('click', restartGame);
  elements.btnResetScore.addEventListener('click', resetScores);
  elements.btnModalNext.addEventListener('click', () => {
    elements.modalOverlay.classList.add('hidden');
    restartGame();
  });

  elements.btnSound.addEventListener('click', () => {
    GameState.sound.enabled = !GameState.sound.enabled;
    elements.btnSound.textContent = GameState.sound.enabled ? '≡ƒöè' : '≡ƒöç';
  });
}

function updateModeLabel() {
  if (GameState.gameMode === 'pvp') {
    elements.labelO.textContent = 'JUGADOR O';
  } else {
    elements.labelO.textContent = 'IA (O)';
  }
}

// Manejo de clic en casilla
function handleCellClick(e) {
  const index = parseInt(e.target.dataset.index);

  if (GameState.board[index] !== null || !GameState.gameActive) {
    return;
  }

  // Jugada del jugador
  makeMove(index, GameState.currentPlayer);

  // Turno de la IA si corresponde
  if (GameState.gameActive && GameState.gameMode !== 'pvp' && GameState.currentPlayer === 'O') {
    elements.board.style.pointerEvents = 'none';
    setTimeout(() => {
      aiPlay();
      elements.board.style.pointerEvents = 'auto';
    }, 350);
  }
}

function makeMove(index, player) {
  GameState.board[index] = player;
  const cell = elements.cells[index];
  cell.textContent = player;
  cell.classList.add('taken', player.toLowerCase());
  GameState.sound.playMove();

  const winCombo = checkWin(GameState.board, player);
  if (winCombo) {
    handleGameOver(player, winCombo);
    return;
  }

  if (isBoardFull(GameState.board)) {
    handleGameOver('tie');
    return;
  }

  // Alternar turno
  GameState.currentPlayer = GameState.currentPlayer === 'X' ? 'O' : 'X';
  updateUI();
}

// Algoritmos de IA
function aiPlay() {
  if (!GameState.gameActive) return;

  let moveIndex;
  if (GameState.gameMode === 'ai_easy') {
    // Modo F├ícil: Movimiento aleatorio
    const available = getAvailableMoves(GameState.board);
    moveIndex = available[Math.floor(Math.random() * available.length)];
  } else {
    // Modo Imposible: Minimax
    moveIndex = getBestMove(GameState.board);
  }

  if (moveIndex !== undefined && moveIndex !== null) {
    makeMove(moveIndex, 'O');
  }
}

// Minimax Algorithm
function getBestMove(board) {
  let bestScore = -Infinity;
  let move = null;
  const availableMoves = getAvailableMoves(board);

  for (const idx of availableMoves) {
    board[idx] = 'O';
    const score = minimax(board, 0, false, -Infinity, Infinity);
    board[idx] = null;
    if (score > bestScore) {
      bestScore = score;
      move = idx;
    }
  }
  return move;
}

function minimax(board, depth, isMaximizing, alpha, beta) {
  if (checkWin(board, 'O')) return 10 - depth;
  if (checkWin(board, 'X')) return depth - 10;
  if (isBoardFull(board)) return 0;

  const availableMoves = getAvailableMoves(board);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const idx of availableMoves) {
      board[idx] = 'O';
      const evaluation = minimax(board, depth + 1, false, alpha, beta);
      board[idx] = null;
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const idx of availableMoves) {
      board[idx] = 'X';
      const evaluation = minimax(board, depth + 1, true, alpha, beta);
      board[idx] = null;
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getAvailableMoves(board) {
  return board
    .map((val, idx) => (val === null ? idx : null))
    .filter(val => val !== null);
}

function isBoardFull(board) {
  return board.every(cell => cell !== null);
}

function checkWin(board, player) {
  for (const combo of GameState.WIN_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] === player && board[b] === player && board[c] === player) {
      return combo;
    }
  }
  return null;
}

// Fin de Partida
function handleGameOver(result, winCombo = null) {
  GameState.gameActive = false;

  if (result === 'tie') {
    GameState.scores.ties++;
    GameState.sound.playTie();
    showModal('┬íEmpate!', 'Nadie ha logrado hacer tres en raya.');
  } else {
    GameState.scores[result]++;
    GameState.sound.playWin();

    // Resaltar celdas ganadoras
    if (winCombo) {
      winCombo.forEach(idx => elements.cells[idx].classList.add('win'));
    }

    const winnerName = (result === 'O' && GameState.gameMode !== 'pvp') ? 'La IA' : `El Jugador ${result}`;
    showModal(`┬íGanador: ${result}!`, `${winnerName} ha ganado la partida.`);
  }

  saveScores();
  updateUI();
}

function showModal(title, msg) {
  elements.modalTitle.textContent = title;
  elements.modalMessage.textContent = msg;
  elements.modalOverlay.classList.remove('hidden');
}

function updateUI() {
  elements.scoreX.textContent = GameState.scores.X;
  elements.scoreO.textContent = GameState.scores.O;
  elements.scoreTies.textContent = GameState.scores.ties;

  elements.turnIndicator.textContent = GameState.currentPlayer;
  elements.turnIndicator.className = `current-turn ${GameState.currentPlayer.toLowerCase()}-turn`;

  // Resaltar tarjeta activa
  document.querySelector('.player-x').classList.toggle('active-player', GameState.currentPlayer === 'X');
  document.querySelector('.player-o').classList.toggle('active-player', GameState.currentPlayer === 'O');
}

function restartGame() {
  GameState.board.fill(null);
  GameState.currentPlayer = 'X';
  GameState.gameActive = true;
  elements.board.style.pointerEvents = 'auto';

  elements.cells.forEach(cell => {
    cell.textContent = '';
    cell.className = 'cell';
  });

  elements.modalOverlay.classList.add('hidden');
  updateUI();
}

function resetScores() {
  GameState.scores = { X: 0, O: 0, ties: 0 };
  saveScores();
  restartGame();
}

function saveScores() {
  localStorage.setItem('tictactoe_scores', JSON.stringify(GameState.scores));
}

function loadScores() {
  const saved = localStorage.getItem('tictactoe_scores');
  if (saved) {
    try {
      GameState.scores = JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
  }
}

// Iniciar al cargar
init();
