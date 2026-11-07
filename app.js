// Data del giorno (Seed)
const todayKey = new Date().toISOString().split('T')[0];

// Stato della sessione Daily
let dailyState = {
  clash: null,   // memorizza il tempo in ms (es. 185)
  deflect: null, // memorizza lo scostamento in ms (es. 12)
  pulse: null    // memorizza il tempo medio di tap (es. 240)
};

let currentGame = null; // 'clash', 'deflect', 'pulse'
let gameState = 'IDLE'; // 'IDLE', 'PLAYING', 'FINISHED'

// Riferimenti DOM
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const gameArena = document.getElementById('game-arena');
const currentGameTitle = document.getElementById('current-game-title');
const gameStatusText = document.getElementById('game-status-text');
const gameScoreText = document.getElementById('game-score-text');
const shareAllBtn = document.getElementById('share-all-btn');

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('daily-date').textContent = todayKey;
  loadDailyState();
  setupEvents();
});

function setupEvents() {
  // Pulsanti Play nel menu
  document.querySelectorAll('.game-card').forEach(card => {
    const gameType = card.dataset.game;
    const btn = card.querySelector('.btn-play');
    btn.addEventListener('click', () => openGame(gameType));
  });

  // Torna al menu
  document.getElementById('back-to-menu').addEventListener('click', showMenu);
  
  // Interazione nell'Arena di gioco
  gameArena.addEventListener('pointerdown', handleArenaInput);
  
  // Condivisione generale
  shareAllBtn.addEventListener('click', shareDailyResults);
}

// Navigation Functions
function openGame(gameType) {
  currentGame = gameType;
  menuScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  
  currentGameTitle.textContent = gameType.toUpperCase();
  resetArenaUI();

  if (dailyState[gameType] !== null) {
    gameState = 'FINISHED';
    gameStatusText.textContent = "Completato";
    gameScoreText.textContent = `${dailyState[gameType]} ms`;
    gameArena.innerHTML = `<p>Hai già completato ${gameType.toUpperCase()} oggi!</p>`;
  } else {
    gameState = 'IDLE';
    gameStatusText.textContent = "Pronto";
    gameScoreText.textContent = "---";
    initGameEngine(gameType);
  }
}

function showMenu() {
  gameScreen.classList.add('hidden');
  menuScreen.classList.remove('hidden');
  updateMenuBadges();
}

// Inizializzazione dei motori di gioco
let gameTimerId = null;
let startTime = 0;

function initGameEngine(type) {
  gameArena.innerHTML = `<p style="font-size:1.2rem; font-weight:bold;">CLICCA PER INIZIARE</p>`;
}

function handleArenaInput(e) {
  e.preventDefault();
  if (dailyState[currentGame] !== null) return;

  if (currentGame === 'clash') handleClashLogic();
  else if (currentGame === 'deflect') handleDeflectLogic();
  else if (currentGame === 'pulse') handlePulseLogic();
}

// --- LOGICA GIOCO 1: CLASH ---
function handleClashLogic() {
  if (gameState === 'IDLE') {
    gameState = 'WAITING';
    gameArena.className = 'arena-clash-waiting';
    gameArena.innerHTML = `<p>ATTENDI IL VERDE...</p>`;
    
    const delay = Math.floor(Math.random() * 2500) + 1500;
    gameTimerId = setTimeout(() => {
      gameState = 'READY';
      startTime = performance.now();
      gameArena.className = 'arena-clash-ready';
      gameArena.innerHTML = `<p>CLICCA ORA!</p>`;
    }, delay);
  } 
  else if (gameState === 'WAITING') {
    // False start
    clearTimeout(gameTimerId);
    gameState = 'IDLE';
    gameArena.className = 'arena-error';
    gameArena.innerHTML = `<p>FALSE START! Clicca per riprovare.</p>`;
  } 
  else if (gameState === 'READY') {
    const score = Math.round(performance.now() - startTime);
    finishGame(score);
  }
}

// --- LOGICA GIOCO 2: DEFLECT (Parry Timing) ---
let ringSize = 200;
let ringAnimId = null;

function handleDeflectLogic() {
  if (gameState === 'IDLE') {
    gameState = 'PLAYING';
    ringSize = 220;
    gameArena.innerHTML = `
      <div class="deflect-target"></div>
      <div id="deflect-ring" class="deflect-ring" style="width:220px; height:220px;"></div>
    `;
    
    function animateRing() {
      ringSize -= 2.5; // velocità contrazione
      const ring = document.getElementById('deflect-ring');
      if (ring) {
        ring.style.width = `${ringSize}px`;
        ring.style.height = `${ringSize}px`;
      }

      if (ringSize <= 20) {
        // Miss completo
        cancelAnimationFrame(ringAnimId);
        finishGame(300); // Penaltà ms
      } else if (gameState === 'PLAYING') {
        ringAnimId = requestAnimationFrame(animateRing);
      }
    }
    startTime = performance.now();
    ringAnimId = requestAnimationFrame(animateRing);
  } 
  else if (gameState === 'PLAYING') {
    cancelAnimationFrame(ringAnimId);
    // Il target centrale è 60px. Calcoliamo la differenza di dimensione rispetto al target
    const diff = Math.abs(Math.round(ringSize - 60));
    finishGame(diff);
  }
}

// --- LOGICA GIOCO 3: PULSE (Grid Speed Tap) ---
let pulseTargetIndex = 0;
let pulseTaps = 0;

function handlePulseLogic() {
  if (gameState === 'IDLE') {
    gameState = 'PLAYING';
    pulseTaps = 0;
    renderPulseGrid();
    activateRandomPulseNode();
    startTime = performance.now();
  }
}

function renderPulseGrid() {
  let gridHTML = '<div class="pulse-grid">';
  for (let i = 0; i < 9; i++) {
    gridHTML += `<div class="pulse-node" data-index="${i}"></div>`;
  }
  gridHTML += '</div>';
  gameArena.innerHTML = gridHTML;

  // Listener specifico per i nodi della griglia
  gameArena.querySelectorAll('.pulse-node').forEach(node => {
    node.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const idx = parseInt(node.dataset.index, 10);
      if (idx === pulseTargetIndex && gameState === 'PLAYING') {
        pulseTaps++;
        if (pulseTaps >= 5) { // 5 tap consecutivi
          const totalTime = Math.round((performance.now() - startTime) / 5);
          finishGame(totalTime);
        } else {
          activateRandomPulseNode();
        }
      }
    });
  });
}

function activateRandomPulseNode() {
  const nodes = gameArena.querySelectorAll('.pulse-node');
  nodes.forEach(n => n.classList.remove('active'));
  pulseTargetIndex = Math.floor(Math.random() * 9);
  nodes[pulseTargetIndex].classList.add('active');
}

// Completamento di un gioco
function finishGame(score) {
  gameState = 'FINISHED';
  dailyState[currentGame] = score;
  
  gameStatusText.textContent = "Completato";
  gameScoreText.textContent = `${score} ms`;
  gameArena.className = '';
  gameArena.innerHTML = `<h3 style="color:var(--accent-green);">RISULTATO: ${score} ms</h3><p>Registrato nel Daily!</p>`;

  saveDailyState();
}

function resetArenaUI() {
  gameArena.className = '';
  gameArena.innerHTML = '';
}

// Persistence & Badges
function saveDailyState() {
  localStorage.setItem(`daily_nexus_${todayKey}`, JSON.stringify(dailyState));
  checkAllCompleted();
}

function loadDailyState() {
  const saved = localStorage.getItem(`daily_nexus_${todayKey}`);
  if (saved) {
    dailyState = JSON.parse(saved);
  }
  updateMenuBadges();
  checkAllCompleted();
}

function updateMenuBadges() {
  ['clash', 'deflect', 'pulse'].forEach(game => {
    const badge = document.getElementById(`status-${game}`);
    if (dailyState[game] !== null) {
      badge.textContent = `Fatto (${dailyState[game]}ms)`;
      badge.classList.add('completed');
    }
  });
}

function checkAllCompleted() {
  const allDone = dailyState.clash !== null && dailyState.deflect !== null && dailyState.pulse !== null;
  shareAllBtn.disabled = !allDone;
}

// Condivisione Risultati Daily
function shareDailyResults() {
  const shareText = `NEXUS REFLEX Daily #${todayKey}\n` +
    `⚡ CLASH: ${dailyState.clash} ms\n` +
    `🛡️ DEFLECT: ±${dailyState.deflect} ms\n` +
    `🎯 PULSE: ${dailyState.pulse} ms/tap\n\n` +
    `Sei più veloce di me? Link al gioco!`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareText);
    alert('Risultato complessivo copiato negli appunti! 🚀');
  }
}