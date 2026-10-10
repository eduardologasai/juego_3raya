/* =========================================================
   TRES EN RAYA - SCRIPT PRINCIPAL
   Lógica de Juego, IA Minimax, Audio Sintetizado y Supabase
   ========================================================= */

// Gestor de Audio Sintetizado (Web Audio API)
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
      // Navegadores que bloquean audio antes de interacción
    }
  }

  playMove() {
    this.playTone(480, 'sine', 0.08);
  }

  playWin() {
    this.playTone(523.25, 'triangle', 0.14, 0);     // C5
    this.playTone(659.25, 'triangle', 0.14, 0.12);  // E5
    this.playTone(783.99, 'triangle', 0.22, 0.24);  // G5
  }

  playTie() {
    this.playTone(330, 'sawtooth', 0.15, 0);
    this.playTone(260, 'sawtooth', 0.22, 0.14);
  }
}

// Gestor de Conexión y Sincronización con Supabase
class CloudManager {
  constructor() {
    this.client = null;
    this.url = '';
    this.key = '';
    this.playerName = 'DMC';
    this.connected = false;
  }

  loadConfig() {
    try {
      // 1. Revisar variables globales de config.js (formato de clase)
      if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
        if (SUPABASE_URL && !SUPABASE_URL.includes('tu-proyecto')) {
          this.url = SUPABASE_URL;
          this.key = SUPABASE_ANON_KEY;
        }
      }

      // 2. Cargar preferencias desde localStorage
      const saved = localStorage.getItem('tictactoe_supabase');
      if (saved) {
        const config = JSON.parse(saved);
        if (!this.url && config.url) this.url = config.url;
        if (!this.key && config.key) this.key = config.key;
        if (config.playerName) this.playerName = config.playerName;
      }

      const savedNick = localStorage.getItem('tictactoe_nickname');
      if (savedNick) {
        this.playerName = savedNick;
      }
    } catch (e) {
      console.warn('Error al cargar config de Supabase:', e);
    }
  }

  init() {
    this.loadConfig();

    if (window.supabase && this.url && this.key) {
      try {
        this.client = window.supabase.createClient(this.url, this.key);
        this.connected = true;
        this.updateBadge(true);
        return true;
      } catch (err) {
        console.error('Error al inicializar Supabase:', err);
        this.connected = false;
        this.updateBadge(false);
        return false;
      }
    } else {
      this.connected = false;
      this.updateBadge(false);
      return false;
    }
  }

  saveConfig(url, key) {
    this.url = url.trim();
    this.key = key.trim();

    localStorage.setItem('tictactoe_supabase', JSON.stringify({
      url: this.url,
      key: this.key,
      playerName: this.playerName
    }));

    return this.init();
  }

  setNickname(name) {
    this.playerName = name.trim() || 'DMC';
    localStorage.setItem('tictactoe_nickname', this.playerName);
    const scoreLabelX = document.getElementById('scoreLabelX');
    if (scoreLabelX) scoreLabelX.textContent = this.playerName.toUpperCase();
  }

  disconnect() {
    localStorage.removeItem('tictactoe_supabase');
    this.client = null;
    this.url = '';
    this.key = '';
    this.connected = false;
    this.updateBadge(false);
  }

  updateBadge(isOnline) {
    const pill = document.getElementById('btnCloudStatus');
    const text = document.getElementById('statusPillText');
    if (!pill || !text) return;

    if (isOnline) {
      pill.classList.add('online');
      text.textContent = 'Supabase';
      pill.title = `Conectado como ${this.playerName} en Supabase`;
    } else {
      pill.classList.remove('online');
      text.textContent = 'Modo Local';
      pill.title = 'Modo Local (Haz clic para conectar Supabase)';
    }

    const scoreLabelX = document.getElementById('scoreLabelX');
    if (scoreLabelX) {
      scoreLabelX.textContent = this.playerName.toUpperCase();
    }
  }

  async recordGame(mode, winner, boardState, winCombo) {
    if (!this.connected || !this.client) return;

    const syncMsg = document.getElementById('victorySyncMsg');
    if (syncMsg) syncMsg.textContent = '☁️ Sincronizando con Supabase...';

    const playerX = this.playerName || 'Logas';
    const playerO = GameState.gameMode === 'pvp' ? 'Jugador O' : 'IA';
    const totalMoves = GameState.moves.length;
    const durationSec = Math.max(1, Math.round((Date.now() - (GameState.startTime || Date.now())) / 1000));

    try {
      // 1. Intentar registrar mediante RPC
      const { error: rpcError } = await this.client.rpc('record_match_and_player', {
        p_game_mode: mode,
        p_player_x_name: playerX,
        p_player_o_name: playerO,
        p_winner: winner,
        p_total_moves: totalMoves,
        p_duration_seconds: durationSec,
        p_final_board: boardState,
        p_moves: GameState.moves
      });

      if (rpcError) {
        // Fallback: Inserción directa en tabla matches
        const { data: matchData, error: matchErr } = await this.client.from('matches').insert([{
          game_mode: mode,
          player_x_name: playerX,
          player_o_name: playerO,
          winner: winner,
          total_moves: totalMoves,
          duration_seconds: durationSec,
          final_board: boardState
        }]).select();

        if (!matchErr && matchData && matchData[0]) {
          const matchId = matchData[0].id;
          if (GameState.moves.length > 0) {
            const movesToInsert = GameState.moves.map(m => ({
              match_id: matchId,
              move_number: m.move_number,
              player: m.player,
              cell_index: m.cell_index
            }));
            await this.client.from('match_moves').insert(movesToInsert);
          }
        }

        // Actualizar tabla players
        const isWin = (winner === 'X');
        const isLoss = (winner === 'O');
        const isTie = (winner === 'tie');

        const { data: existingPlayer } = await this.client
          .from('players')
          .select('*')
          .eq('nickname', playerX)
          .maybeSingle();

        if (existingPlayer) {
          await this.client.from('players').update({
            games_played: existingPlayer.games_played + 1,
            wins: existingPlayer.wins + (isWin ? 1 : 0),
            losses: existingPlayer.losses + (isLoss ? 1 : 0),
            ties: existingPlayer.ties + (isTie ? 1 : 0),
            last_played_at: new Date().toISOString()
          }).eq('nickname', playerX);
        } else {
          await this.client.from('players').insert([{
            nickname: playerX,
            games_played: 1,
            wins: isWin ? 1 : 0,
            losses: isLoss ? 1 : 0,
            ties: isTie ? 1 : 0,
            last_played_at: new Date().toISOString()
          }]);
        }
      }

      if (syncMsg) syncMsg.textContent = '☁️ Partida guardada en Supabase';
    } catch (err) {
      console.warn('Error al guardar en Supabase:', err);
      if (syncMsg) syncMsg.textContent = '⚠️ Error al sincronizar con Supabase';
    }
  }

  async fetchRanking() {
    const tbody = document.getElementById('rankingTableBody');
    if (!tbody) return;

    if (!this.connected || !this.client) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state-cell">
            Conecta tu proyecto Supabase para ver el ranking global.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = `<tr><td colspan="5" class="empty-state-cell">Cargando datos...</td></tr>`;

    try {
      const { data, error } = await this.client
        .from('players')
        .select('*')
        .order('wins', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state-cell">Aún no hay jugadores registrados en Supabase.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map((p, index) => {
        const medal = index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : `${index + 1}. `;
        return `
          <tr>
            <td><strong>${medal}</strong></td>
            <td>${escapeHtml(p.nickname)}</td>
            <td><strong>${p.wins}</strong></td>
            <td>${p.games_played}</td>
            <td>${p.ties} E / ${p.losses} D</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state-cell">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async fetchHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    if (!this.connected || !this.client) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-state-cell">
            Conecta Supabase para ver el historial de partidas.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = `<tr><td colspan="4" class="empty-state-cell">Cargando historial...</td></tr>`;

    try {
      const { data, error } = await this.client
        .from('matches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state-cell">No hay partidas registradas aún.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(m => {
        const modeLabels = { pvp: '1 vs 1', ai_easy: 'IA Fácil', ai_hard: 'IA Imbatible' };
        const resultLabel = m.winner === 'tie' ? 'Empate' : (m.winner === 'X' ? `Ganó ${escapeHtml(m.player_x_name)}` : `Ganó ${escapeHtml(m.player_o_name)}`);
        const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return `
          <tr>
            <td>${escapeHtml(m.player_x_name)} vs ${escapeHtml(m.player_o_name)}</td>
            <td>${modeLabels[m.game_mode] || m.game_mode}</td>
            <td><strong>${resultLabel}</strong></td>
            <td>${timeStr}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state-cell">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Estado del Juego
const GameState = {
  board: Array(9).fill(null),
  currentPlayer: 'X',
  gameActive: true,
  gameMode: 'pvp', // 'pvp', 'ai_easy', 'ai_hard'
  scores: { X: 0, O: 0, ties: 0 },
  sound: new SoundManager(),
  cloud: new CloudManager(),
  moves: [],
  startTime: Date.now(),
  WIN_COMBOS: [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Filas
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columnas
    [0, 4, 8], [2, 4, 6]             // Diagonales
  ]
};

// Elementos DOM
const elements = {
  cells: document.querySelectorAll('.grid-cell'),
  boardGrid: document.getElementById('boardGrid'),
  nicknameInput: document.getElementById('nicknameInput'),
  modeTabs: document.querySelectorAll('.tab-btn'),
  scoreX: document.getElementById('scoreX'),
  scoreTies: document.getElementById('scoreTies'),
  scoreO: document.getElementById('scoreO'),
  scoreLabelX: document.getElementById('scoreLabelX'),
  scoreLabelO: document.getElementById('scoreLabelO'),
  boxX: document.getElementById('boxX'),
  boxO: document.getElementById('boxO'),
  currentTurnBadge: document.getElementById('currentTurnBadge'),
  btnRestart: document.getElementById('btnRestart'),
  btnResetScore: document.getElementById('btnResetScore'),
  btnSound: document.getElementById('btnSound'),
  // Top nav
  btnCloudStatus: document.getElementById('btnCloudStatus'),
  btnOpenRanking: document.getElementById('btnOpenRanking'),
  btnOpenHistory: document.getElementById('btnOpenHistory'),
  // Modal Victoria
  modalVictory: document.getElementById('modalVictory'),
  victoryTitle: document.getElementById('victoryTitle'),
  victoryMessage: document.getElementById('victoryMessage'),
  victorySyncMsg: document.getElementById('victorySyncMsg'),
  btnModalPlayAgain: document.getElementById('btnModalPlayAgain'),
  // Modal Configuración
  modalConfig: document.getElementById('modalConfig'),
  formSupabaseConfig: document.getElementById('formSupabaseConfig'),
  cfgUrl: document.getElementById('cfgUrl'),
  cfgKey: document.getElementById('cfgKey'),
  btnDisconnect: document.getElementById('btnDisconnect'),
  btnCloseConfig: document.getElementById('btnCloseConfig'),
  // Modal Ranking
  modalRanking: document.getElementById('modalRanking'),
  btnRefreshRanking: document.getElementById('btnRefreshRanking'),
  btnCloseRanking: document.getElementById('btnCloseRanking'),
  // Modal Historial
  modalHistory: document.getElementById('modalHistory'),
  btnRefreshHistory: document.getElementById('btnRefreshHistory'),
  btnCloseHistory: document.getElementById('btnCloseHistory')
};

// Inicialización
function init() {
  loadScores();
  GameState.cloud.init();

  if (elements.nicknameInput) {
    elements.nicknameInput.value = GameState.cloud.playerName;
  }

  bindEvents();
  updateUI();
  updateTurnDisplay();
}

function bindEvents() {
  // Clics en casillas
  elements.cells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
  });

  // Cambio de apodo
  elements.nicknameInput.addEventListener('input', (e) => {
    GameState.cloud.setNickname(e.target.value);
    updateTurnDisplay();
  });

  // Selector de Modos (Tabs)
  elements.modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      GameState.gameMode = tab.dataset.mode;
      updateModeLabels();
      restartGame();
    });
  });

  // Controles inferiores
  elements.btnRestart.addEventListener('click', restartGame);
  elements.btnResetScore.addEventListener('click', resetScores);
  elements.btnModalPlayAgain.addEventListener('click', () => {
    elements.modalVictory.classList.add('hidden');
    restartGame();
  });

  // Sonido
  elements.btnSound.addEventListener('click', () => {
    GameState.sound.enabled = !GameState.sound.enabled;
    elements.btnSound.textContent = GameState.sound.enabled ? '🔊' : '🔇';
  });

  // Modal Supabase Config
  elements.btnCloudStatus.addEventListener('click', () => {
    elements.cfgUrl.value = GameState.cloud.url || '';
    elements.cfgKey.value = GameState.cloud.key || '';
    elements.modalConfig.classList.remove('hidden');
  });

  elements.formSupabaseConfig.addEventListener('submit', (e) => {
    e.preventDefault();
    GameState.cloud.saveConfig(elements.cfgUrl.value, elements.cfgKey.value);
    elements.modalConfig.classList.add('hidden');
  });

  elements.btnDisconnect.addEventListener('click', () => {
    GameState.cloud.disconnect();
    elements.cfgUrl.value = '';
    elements.cfgKey.value = '';
    elements.modalConfig.classList.add('hidden');
  });

  elements.btnCloseConfig.addEventListener('click', () => {
    elements.modalConfig.classList.add('hidden');
  });

  // Modal Ranking
  elements.btnOpenRanking.addEventListener('click', () => {
    elements.modalRanking.classList.remove('hidden');
    GameState.cloud.fetchRanking();
  });
  elements.btnRefreshRanking.addEventListener('click', () => GameState.cloud.fetchRanking());
  elements.btnCloseRanking.addEventListener('click', () => elements.modalRanking.classList.add('hidden'));

  // Modal Historial
  elements.btnOpenHistory.addEventListener('click', () => {
    elements.modalHistory.classList.remove('hidden');
    GameState.cloud.fetchHistory();
  });
  elements.btnRefreshHistory.addEventListener('click', () => GameState.cloud.fetchHistory());
  elements.btnCloseHistory.addEventListener('click', () => elements.modalHistory.classList.add('hidden'));
}

function updateModeLabels() {
  if (GameState.gameMode === 'pvp') {
    elements.scoreLabelO.textContent = 'JUGADOR O';
  } else {
    elements.scoreLabelO.textContent = 'IA (O)';
  }
}

function handleCellClick(e) {
  const index = parseInt(e.target.dataset.index);

  if (GameState.board[index] !== null || !GameState.gameActive) {
    return;
  }

  // Jugada de X
  makeMove(index, GameState.currentPlayer);

  // Turno de la IA si corresponde
  if (GameState.gameActive && GameState.gameMode !== 'pvp' && GameState.currentPlayer === 'O') {
    elements.boardGrid.style.pointerEvents = 'none';
    setTimeout(() => {
      aiPlay();
      elements.boardGrid.style.pointerEvents = 'auto';
    }, 380);
  }
}

function makeMove(index, player) {
  GameState.board[index] = player;
  GameState.moves.push({
    move_number: GameState.moves.length + 1,
    player: player,
    cell_index: index
  });

  const cell = elements.cells[index];
  cell.textContent = player;
  cell.classList.add('taken', player === 'X' ? 'cell-x' : 'cell-o');
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
  updateTurnDisplay();
}

function updateTurnDisplay() {
  const badge = elements.currentTurnBadge;

  if (GameState.currentPlayer === 'X') {
    const playerXName = GameState.cloud.playerName || 'Tu Turno';
    badge.textContent = playerXName;
    badge.className = 'turn-badge badge-x';
    elements.boxX.classList.add('active-turn-box');
    elements.boxO.classList.remove('active-turn-box');
  } else {
    const playerOName = GameState.gameMode === 'pvp' ? 'Jugador O' : 'IA';
    badge.textContent = playerOName;
    badge.className = 'turn-badge badge-o';
    elements.boxO.classList.add('active-turn-box');
    elements.boxX.classList.remove('active-turn-box');
  }
}

// Algoritmos de IA
function aiPlay() {
  if (!GameState.gameActive) return;

  let moveIndex;
  if (GameState.gameMode === 'ai_easy') {
    const available = getAvailableMoves(GameState.board);
    moveIndex = available[Math.floor(Math.random() * available.length)];
  } else {
    moveIndex = getBestMove(GameState.board);
  }

  if (moveIndex !== undefined && moveIndex !== null) {
    makeMove(moveIndex, 'O');
  }
}

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
  elements.victorySyncMsg.textContent = '';

  if (result === 'tie') {
    GameState.scores.ties++;
    GameState.sound.playTie();
    showModal('¡Empate!', 'Nadie ha logrado hacer tres en raya.');
  } else {
    GameState.scores[result]++;
    GameState.sound.playWin();

    if (winCombo) {
      winCombo.forEach(idx => elements.cells[idx].classList.add('win-highlight'));
    }

    const winnerName = (result === 'O' && GameState.gameMode !== 'pvp')
      ? 'La IA'
      : (result === 'X')
        ? GameState.cloud.playerName
        : `El Jugador ${result}`;

    showModal(`¡Ganador: ${result}!`, `${winnerName} ha ganado la partida.`);
  }

  saveScores();
  updateUI();

  // Guardar en Supabase
  GameState.cloud.recordGame(GameState.gameMode, result, GameState.board, winCombo);
}

function showModal(title, msg) {
  elements.victoryTitle.textContent = title;
  elements.victoryMessage.textContent = msg;
  elements.modalVictory.classList.remove('hidden');
}

function updateUI() {
  elements.scoreX.textContent = GameState.scores.X;
  elements.scoreO.textContent = GameState.scores.O;
  elements.scoreTies.textContent = GameState.scores.ties;
  elements.scoreLabelX.textContent = GameState.cloud.playerName.toUpperCase();
}

function restartGame() {
  GameState.board.fill(null);
  GameState.currentPlayer = 'X';
  GameState.gameActive = true;
  GameState.moves = [];
  GameState.startTime = Date.now();
  elements.boardGrid.style.pointerEvents = 'auto';

  elements.cells.forEach(cell => {
    cell.textContent = '';
    cell.className = 'grid-cell';
  });

  elements.modalVictory.classList.add('hidden');
  updateTurnDisplay();
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
