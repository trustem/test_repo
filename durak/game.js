'use strict';
// ═══════════════════════════════════════════════════════════════
//  БАРДАК — Переводной Дурак  (game.js)
// ═══════════════════════════════════════════════════════════════

// ─── CONSTANTS ───────────────────────────────────────────────
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SYM = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const RANKS = ['6','7','8','9','10','J','Q','K','A'];
const RANK_VAL = { '6':0,'7':1,'8':2,'9':3,'10':4,'J':5,'Q':6,'K':7,'A':8 };
const SCORE_LADDER = ['6','7','8','9','10','J','Q','K','A','joker'];
const BOT_DELAY = 850; // ms between bot actions

// ─── CARD FACTORY ────────────────────────────────────────────
function makeCard(rank, suit) {
  return { rank, suit, id: `${rank}_${suit}` };
}
function makeJoker(type) {
  // type: 'picture', 'deuce_spades', 'deuce_clubs'
  const id = `joker_${type}_${Math.random().toString(36).slice(2,6)}`;
  // ALL jokers have rank: 'joker' — invariant: isJoker() returns true for all 4 joker cards
  // (2 picture + 2 deuce), and cardNominal() returns 'joker' for all of them,
  // so nominalOnTable checks work symmetrically for throwing both directions.
  return { rank: 'joker', suit: type, id, jokerType: type };
}
function isJoker(card) { return card.rank === 'joker'; }
function isPictureJoker(card) { return isJoker(card) && card.jokerType === 'picture'; }
function isDeuceJoker(card) { return isJoker(card) && (card.jokerType === 'deuce_spades' || card.jokerType === 'deuce_clubs'); }
function cardNominal(card) {
  if (isJoker(card)) return 'joker';
  return card.rank;
}
function cardLabel(card) {
  if (isPictureJoker(card)) return { top: '★', center: '🃏', suit: '' };
  if (isDeuceJoker(card)) {
    const sym = card.jokerType === 'deuce_spades' ? '♠' : '♣';
    return { top: `2${sym}*`, center: '★', suit: sym };
  }
  return { top: card.rank, center: SUIT_SYM[card.suit], suit: SUIT_SYM[card.suit] };
}

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(rank, suit));
    }
  }
  deck.push(makeJoker('picture'));
  deck.push(makeJoker('picture'));
  deck.push(makeJoker('deuce_spades'));
  deck.push(makeJoker('deuce_clubs'));
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── GAME STATE ───────────────────────────────────────────────
let G = null; // global game state
let UI = null; // ui interaction state
let undoState = null; // saved state for undo
let debugMode = false; // debug mode: show bot cards, require manual step
let pendingBotAction = null; // in debug mode, stores the next bot action fn
let dragState = null; // drag-and-drop state

function newGameState(playerDefs) {
  const players = playerDefs.map((def, i) => ({
    id: i,
    name: def.name,
    isBot: def.isBot,
    hand: [],
    secretCard: null,
    secretTaken: false,
    secretRevealed: false, // secret card flipped face-up mid-turn (hand ran empty)
    score: 0,       // index into SCORE_LADDER
    exited: false,
    exitOrder: null,
    nakiCards: [],   // cards thrown to this player via nakidyvanie (display only)
  }));

  return {
    players,
    deck: [],
    discardPile: [],
    trumpSuit: null,
    trumpCard: null,         // the visible trump card under deck
    secretTrumpCard: null,   // hidden bottom card
    trumpRevealed: false,    // secret trump revealed yet?
    // turn state
    phase: 'deal',           // deal|attack|defense|transfer|nakidyvanie|draw|roundover
    attackerIdx: null,       // index into active players list
    defenderIdx: null,
    tablePairs: [],          // [{attack, defense}]
    firstBeaten: false,      // has at least one card been beaten?
    transferChain: [],       // list of player indices who transferred
    attackDone: false,       // left neighbor declared done
    rightNeighborThrowing: false,
    throwers: [],            // players who have thrown this turn (in order)
    // nakidyvanie
    nakiPending: [],         // player indices who can still throw in nakidyvanie
    nakiDecisiveIdx: null,   // who played the decisive card
    nakiJokerMode: false,
    nakiJokerThrowers: [],   // who threw jokers in naki
    nakiGiveToHandPending: [],  // players who can "give to hand" (phase 1, before nakidyvanie)
    nakiGiveToHandLimit: 0,    // max additional cards that can be given in give-to-hand phase
    defenderTaking: false,      // defender declared taking; attackers may still throw
    // transfer throw queue
    transferThrowQueue: [],   // players from transfer chain who can still throw
    transferThrowPhase: false, // are we in transfer-chain throw phase
    humanTransferThrowPassed: false, // human in transfer chain has passed their pre-done throw
    // round tracking
    roundNum: 0,
    exitFirstIdx: null,      // player who exited first this round
    jokerThrows: [],         // {fromIdx, toIdx} jokers thrown this round
    roundLoserIdx: null,
    // game end
    gameOver: false,
    gameOverRank: null,
    gameOverPlayer: null,
    // timing
    botTimer: null,
    // multiplayer log sync
    logEntries: [],
  };
}

// ─── SETUP ───────────────────────────────────────────────────
function setupUI() {
  const slots = document.getElementById('player-slots');
  const countBtns = document.querySelectorAll('.count-btn');
  let playerCount = 2;

  function getPlayerName() {
    const lobby = (document.getElementById('lobby-name-input').value || '').trim();
    if (lobby) return lobby;
    return localStorage.getItem('bardak_player_name') || 'Игрок';
  }

  function renderSlots(n) {
    const humanName = getPlayerName();
    slots.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const isBot = i > 0;
      const defaultName = isBot ? 'Бот ' + i : humanName;
      const div = document.createElement('div');
      div.className = 'player-slot';
      div.innerHTML = `
        <span class="player-slot-num">${i + 1}</span>
        <input type="text" value="${defaultName}" maxlength="12" data-idx="${i}">
        <div class="type-toggle">
          <button data-idx="${i}" data-type="human" class="${!isBot ? 'active' : ''}">Человек</button>
          <button data-idx="${i}" data-type="bot" class="${isBot ? 'active' : ''}">Бот</button>
        </div>
      `;
      slots.appendChild(div);
    }
    slots.querySelectorAll('.type-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  countBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      countBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playerCount = +btn.dataset.count;
      renderSlots(playerCount);
    });
  });
  renderSlots(2);

  document.getElementById('start-btn').addEventListener('click', () => {
    const playerDefs = [];
    slots.querySelectorAll('.player-slot').forEach((slot, i) => {
      const name = slot.querySelector('input').value.trim() || `Игрок ${i+1}`;
      const isBot = slot.querySelector('[data-type="bot"]').classList.contains('active');
      playerDefs.push({ name, isBot });
    });
    if (!playerDefs.some(p => !p.isBot)) {
      alert('Нужен хотя бы один живой игрок!');
      return;
    }
    // Save human player name for future sessions
    const humanDef = playerDefs.find(p => !p.isBot);
    if (humanDef) localStorage.setItem('bardak_player_name', humanDef.name);
    startGame(playerDefs);
  });

  // Persist lobby name as user types
  const lobbyNameInput = document.getElementById('lobby-name-input');
  if (lobbyNameInput) {
    // Restore saved name on load
    const saved = localStorage.getItem('bardak_player_name');
    if (saved && !lobbyNameInput.value) lobbyNameInput.value = saved;
    lobbyNameInput.addEventListener('input', () => {
      const v = lobbyNameInput.value.trim();
      if (v) localStorage.setItem('bardak_player_name', v);
    });
  }

  // Mobile log toggle
  const logToggleBtn = document.getElementById('log-toggle-btn');
  const logCloseBtn = document.getElementById('log-close-btn');
  const logArea = document.querySelector('.log-area');
  if (logToggleBtn && logArea) {
    logToggleBtn.addEventListener('click', () => logArea.classList.toggle('mobile-open'));
  }
  if (logCloseBtn && logArea) {
    logCloseBtn.addEventListener('click', () => logArea.classList.remove('mobile-open'));
  }

  document.getElementById('new-game-btn').addEventListener('click', () => {
    if (typeof mp !== 'undefined' && mp.enabled) {
      if (typeof mpResetState === 'function') mpResetState();
    } else {
      showScreen('setup-screen');
    }
  });
  document.getElementById('play-again-btn').addEventListener('click', () => {
    if (typeof mp !== 'undefined' && mp.enabled) {
      if (typeof mpResetState === 'function') mpResetState();
    } else {
      showScreen('setup-screen');
    }
  });
  document.getElementById('debug-btn').addEventListener('click', () => {
    debugMode = !debugMode;
    document.getElementById('debug-btn').classList.toggle('active', debugMode);
    if (!debugMode && pendingBotAction) {
      // Turning off debug mid-game — immediately execute the pending bot action
      const action = pendingBotAction;
      pendingBotAction = null;
      G.botTimer = setTimeout(action, BOT_DELAY);
    }
    if (G && !G.gameOver) renderAll();
  });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── GAME START / DEAL ────────────────────────────────────────
function startGame(playerDefs) {
  G = newGameState(playerDefs);
  UI = {
    selectedCards: [],          // card ids selected by human
    selectedAttackPairIdx: null // which table pair human selected for defense
  };
  // Clear DOM log from previous game
  const logEl = document.getElementById('game-log');
  if (logEl) logEl.innerHTML = '';
  // Show debug button only when there are bots
  const hasBot = playerDefs.some(p => p.isBot);
  document.getElementById('debug-btn').style.display = hasBot ? '' : 'none';
  showScreen('game-screen');
  addLog('=== Новая игра ===', 'round');
  dealRound();
}

function dealRound() {
  G.roundNum++;
  addLog(`=== Раунд ${G.roundNum} ===`, 'round');

  // Reset round state
  G.deck = shuffle(buildDeck());
  G.discardPile = [];
  G.tablePairs = [];
  G.firstBeaten = false;
  G.transferChain = [];
  G.attackDone = false;
  G.rightNeighborThrowing = false;
  G.throwers = [];
  G.nakiPending = [];
  G.nakiDecisiveIdx = null;
  G.nakiJokerMode = false;
  G.nakiJokerThrowers = [];
  G.exitFirstIdx = null;
  G.jokerThrows = [];
  G.roundLoserIdx = null;
  G.gameOver = false;
  G.gameOverRank = null;
  G.gameOverPlayer = null;
  G.transferThrowQueue = [];
  G.transferThrowPhase = false;
  G.humanTransferThrowPassed = false;
  G.nakiGiveToHandPending = [];
  G.nakiGiveToHandLimit = 0;
  G.defenderTaking = false;
  G.phase = 'deal';

  // Reset per-round player state
  G.players.forEach(p => {
    p.hand = [];
    p.secretCard = null;
    p.secretTaken = false;
    p.secretRevealed = false;
    p.exited = false;
    p.exitOrder = null;
    p.nakiCards = [];
  });

  // Deal 6 cards + 1 secret each
  const activePlayers = G.players;
  for (let i = 0; i < 6; i++) {
    for (const p of activePlayers) {
      const card = G.deck.pop();
      if (card) p.hand.push(card);
    }
  }
  for (const p of activePlayers) {
    const card = G.deck.pop();
    if (card) p.secretCard = card;
  }

  // Set trump: last visible card = trump, below it = secret trump
  G.secretTrumpCard = G.deck.shift() || null; // bottom (below trump, face-down)
  G.trumpCard = G.deck[0] || null; // new bottom = last card to be drawn (pop() takes from end)

  if (G.trumpCard && isJoker(G.trumpCard)) {
    // Roll die to choose trump suit
    const suitIdx = Math.floor(Math.random() * 4);
    G.trumpSuit = SUITS[suitIdx];
    addLog(`Козырной джокер! Выпал козырь: ${SUIT_SYM[G.trumpSuit]}`, 'system');
  } else if (G.trumpCard) {
    G.trumpSuit = G.trumpCard.suit;
  } else {
    G.trumpSuit = SUITS[Math.floor(Math.random() * 4)];
  }

  // Find first attacker: player with lowest trump card
  G.attackerIdx = findFirstAttacker();
  G.defenderIdx = nextActiveIdx(G.attackerIdx);

  addLog(`Козырь: ${SUIT_SYM[G.trumpSuit]}. Первый атакует: ${G.players[G.attackerIdx].name}`, 'system');

  sortAllHands();
  G.phase = 'attack';
  renderAll();
  scheduleBot();
}

function findFirstAttacker() {
  let bestIdx = null;
  let bestVal = Infinity;
  G.players.forEach((p, i) => {
    p.hand.forEach(card => {
      if (!isJoker(card) && card.suit === G.trumpSuit) {
        const v = RANK_VAL[card.rank];
        if (v < bestVal) { bestVal = v; bestIdx = i; }
      }
    });
  });
  if (bestIdx === null) bestIdx = Math.floor(Math.random() * G.players.length);
  return bestIdx;
}

// ─── ACTIVE PLAYERS ──────────────────────────────────────────
function activePlayers() {
  return G.players.filter(p => !p.exited);
}

function nextActiveIdx(fromIdx, skipIdx = null) {
  const n = G.players.length;
  let idx = (fromIdx + 1) % n;
  let tries = 0;
  while (tries < n) {
    if (!G.players[idx].exited && idx !== skipIdx) return idx;
    idx = (idx + 1) % n;
    tries++;
  }
  return fromIdx; // fallback
}

function prevActiveIdx(fromIdx) {
  const n = G.players.length;
  let idx = (fromIdx - 1 + n) % n;
  let tries = 0;
  while (tries < n) {
    if (!G.players[idx].exited) return idx;
    idx = (idx - 1 + n) % n;
    tries++;
  }
  return fromIdx;
}

// Left neighbor of defender = physical left neighbor regardless of transfer chain.
// This is who may throw cards as the "attacking" side.
function leftThrowerIdx() {
  return prevActiveIdx(G.defenderIdx);
}

// Right neighbor of defender (clockwise past defender, skipping defender itself)
// In a 3-player game where only attacker and defender remain, attacker IS the right neighbor too
function rightNeighborOfDefender() {
  // Go clockwise from defender, find first active player that is not the defender
  const n = G.players.length;
  let idx = (G.defenderIdx + 1) % n;
  let tries = 0;
  while (tries < n) {
    if (!G.players[idx].exited && idx !== G.defenderIdx) return idx;
    idx = (idx + 1) % n;
    tries++;
  }
  return G.attackerIdx; // fallback
}

// ─── CARD COMPARISON (CAN BEAT) ──────────────────────────────
// Can attackCard be beaten by defenseCard?
function canBeat(attackCard, defenseCard, trumpSuit) {
  // Joker beats everything except:
  if (isJoker(defenseCard)) {
    if (isPictureJoker(defenseCard) && isPictureJoker(attackCard)) return true; // picture beats picture
    if (isPictureJoker(defenseCard) && isDeuceJoker(attackCard)) return true;  // picture beats deuce
    if (isDeuceJoker(defenseCard)) {
      if (isPictureJoker(attackCard)) return false; // deuce cannot beat picture joker
      return true; // deuce beats any non-picture joker or regular card
    }
    return true; // joker beats non-joker
  }
  if (isJoker(attackCard)) return false; // non-joker cannot beat joker (unless joker above)

  const defSuit = defenseCard.suit;
  const atkSuit = attackCard.suit;

  // Untouchable suit rule
  const untouchableSuit = (trumpSuit === 'spades') ? 'clubs' : 'spades';
  if (atkSuit === untouchableSuit) {
    // Can only beat with higher untouchable or joker
    if (defSuit === untouchableSuit) {
      return RANK_VAL[defenseCard.rank] > RANK_VAL[attackCard.rank];
    }
    return false; // trump cannot beat untouchable
  }

  // Normal defense
  if (defSuit === atkSuit) {
    return RANK_VAL[defenseCard.rank] > RANK_VAL[attackCard.rank];
  }
  // Trump beats non-trump (except untouchable)
  if (defSuit === trumpSuit && atkSuit !== trumpSuit) return true;
  return false;
}

// Can attackCard be transferred with transferCard?
// Transfer requires same nominal as all attack cards
function canTransfer(transferCard, tablePairs) {
  if (tablePairs.length === 0) return false;
  // Cannot transfer if any card has already been defended
  if (tablePairs.some(p => p.defense !== null)) return false;
  const targetNominal = cardNominal(tablePairs[0].attack);
  // All attack cards must share nominal
  for (const pair of tablePairs) {
    if (cardNominal(pair.attack) !== targetNominal) return false;
  }
  if (cardNominal(transferCard) !== targetNominal) return false;
  // New defender must have enough cards in hand to cover all attack cards after transfer
  // Secret card does NOT count for this check
  const newDefenderIdx = nextActiveIdx(G.defenderIdx);
  const newDefender = G.players[newDefenderIdx];
  if (newDefender && newDefender.hand.length < tablePairs.length + 1) return false;
  return true;
}

// Nominal exists on table?
function nominalOnTable(nominal) {
  for (const pair of G.tablePairs) {
    if (cardNominal(pair.attack) === nominal) return true;
    if (pair.defense && cardNominal(pair.defense) === nominal) return true;
  }
  return false;
}

function getTableNominals() {
  // Returns a Set of nominals from non-nakidyvanie attack cards on the table
  return new Set(G.tablePairs.filter(p => !p.isNaki).map(p => cardNominal(p.attack)));
}

// ─── ATTACK LOGIC ────────────────────────────────────────────
function getAttackLimit() {
  // Returns the max total number of attack cards allowed on the table
  const defender = G.players[G.defenderIdx];
  if (!defender) return 6;
  // Defender's hand count at start of their defense turn =
  // current hand + cards already played in defense
  const defenseCardsPlayed = G.tablePairs.filter(p => p.defense && p.defender === G.defenderIdx).length;
  const defHandCount = defender.hand.length + defenseCardsPlayed;
  // Max attack cards that can be placed in total this turn
  const max = G.firstBeaten ? 6 : 5;
  return Math.min(max, defHandCount);
}

function canAttackWith(cards) {
  if (cards.length === 0) return false;
  // All cards must share nominal
  const nom = cardNominal(cards[0]);
  if (!cards.every(c => cardNominal(c) === nom)) return false;
  // Limit
  if (G.tablePairs.length + cards.length > getAttackLimit()) return false;
  // If table has cards, nominal must be on table
  if (G.tablePairs.length > 0) {
    if (!nominalOnTable(nom)) return false;
  }
  return true;
}

function doAttack(playerIdx, cards) {
  // Enforce attack limit: never place more cards than defender can receive
  const allowed = getAttackLimit() - G.tablePairs.length;
  if (allowed <= 0) return false;
  cards = cards.slice(0, allowed);
  addLog(`${G.players[playerIdx].name} атакует: ${cards.map(cardStr).join(', ')}`, 'attack');
  for (const card of cards) {
    removeFromHand(playerIdx, card);
    G.tablePairs.push({ attack: card, defense: null, attacker: playerIdx });
  }
  G.phase = 'defense';
  renderAll();
  scheduleBot();
}

// ─── DEFENSE LOGIC ───────────────────────────────────────────
function doDefend(defenderIdx, attackPairIdx, defenseCard) {
  const pair = G.tablePairs[attackPairIdx];
  if (!canBeat(pair.attack, defenseCard, G.trumpSuit)) {
    addLog('Нельзя побить эту карту!', 'system');
    return false;
  }
  pair.defense = defenseCard;
  pair.defender = defenderIdx;
  removeFromHand(defenderIdx, defenseCard);
  addLog(`${G.players[defenderIdx].name} отбивает ${cardStr(pair.attack)} → ${cardStr(defenseCard)}`, 'defense');

  // If hand is now empty and secret card hasn't been taken yet — move it to hand immediately
  const dp = G.players[defenderIdx];
  if (dp.hand.length === 0 && dp.secretCard && !dp.secretTaken) {
    const sc = dp.secretCard;
    dp.hand.push(sc);
    dp.secretCard = null;
    dp.secretTaken = true;
    dp.secretRevealed = false;
    sortHand(defenderIdx);
    addLog(`${dp.name} открывает потайную карту: ${cardStr(sc)}`, 'system');
  }

  if (allBeaten()) {
    // All cards beaten — attacker (or transfer thrower) can throw more or declare done
    G.phase = 'attack'; // allow more throwing
    // Do NOT reset G.attackDone here: once attacker declared done they stay done
    renderAll();
    scheduleBot();
  } else {
    renderAll();
    scheduleBot();
  }
  return true;
}

function allBeaten() {
  return G.tablePairs.length > 0 && G.tablePairs.every(p => p.defense !== null);
}

function hasUnbeaten() {
  return G.tablePairs.some(p => p.defense === null);
}

// ─── TRANSFER LOGIC ──────────────────────────────────────────
function doTransfer(defenderIdx, card) {
  addLog(`${G.players[defenderIdx].name} переводит: ${cardStr(card)}`, 'transfer');
  removeFromHand(defenderIdx, card);
  G.tablePairs.push({ attack: card, defense: null, attacker: defenderIdx, isTransfer: true });
  G.transferChain.push(defenderIdx);

  // New defender = next active after current defender
  const newDefender = nextActiveIdx(G.defenderIdx);
  // New attacker stays the same? No — in переводной: the attack passes
  // Throwing rights pass to the physical left neighbor of the new defender (leftThrowerIdx()).

  G.defenderIdx = newDefender;
  addLog(`Теперь защищается: ${G.players[newDefender].name}`, 'transfer');
  G.phase = 'defense';
  renderAll();
  scheduleBot();
}

// ─── TAKE / DISCARD ──────────────────────────────────────────
function doTake(defenderIdx) {
  addLog(`${G.players[defenderIdx].name} берёт карты`, 'take');
  G.nakiDecisiveIdx = findDecisiveCard();

  // Before nakidyvanie: give attacker (and right neighbor) a chance to throw more cards
  const canThrowMore = G.tablePairs.length < getAttackLimit();
  const throwingNotDone = !G.attackDone || G.rightNeighborThrowing;

  if (canThrowMore && throwingNotDone) {
    G.defenderTaking = true;
    G.phase = 'attack'; // keep in attack phase so throwing logic applies
    renderAll();
    scheduleBot();
  } else {
    G.phase = 'nakidyvanie';
    setupNakidyvanie(defenderIdx);
  }
}

function findDecisiveCard() {
  // The card the defender couldn't beat = last unbeaten attack card
  for (let i = G.tablePairs.length - 1; i >= 0; i--) {
    if (!G.tablePairs[i].defense) return G.tablePairs[i].attacker;
  }
  return G.attackerIdx;
}

function doDiscard() {
  const allCards = G.tablePairs.flatMap(p => [p.attack, p.defense].filter(Boolean));
  G.discardPile.push(...allCards);
  addLog(`Карты сброшены (${allCards.length})`, 'system');
  G.tablePairs = [];
  G.players.forEach(p => { p.nakiCards = []; });
  G.firstBeaten = true; // бита exists — stays true for the rest of the game
  // Save draw order before resetting
  const savedTransferChain = [...G.transferChain];
  const savedThrowers = [...G.throwers];
  const savedAttackerIdx = G.attackerIdx;
  const savedDefenderIdx = G.defenderIdx;
  G.transferChain = [];
  G.attackDone = false;
  G.rightNeighborThrowing = false;
  G.transferThrowQueue = [];
  G.transferThrowPhase = false;
  G.humanTransferThrowPassed = false;
  G.defenderTaking = false;
  G.throwers = [];
  // Next attacker = former defender
  G.attackerIdx = savedDefenderIdx;
  G.defenderIdx = nextActiveIdx(G.attackerIdx);
  G.phase = 'draw';
  // Draw in correct order: original attacker, transferers, throwers, defender (who defended)
  const drawOrder = [];
  const addUniq = idx => { if (!drawOrder.includes(idx)) drawOrder.push(idx); };
  addUniq(savedAttackerIdx);
  for (const idx of savedTransferChain) addUniq(idx);
  for (const idx of savedThrowers) addUniq(idx);
  addUniq(savedDefenderIdx); // defender draws too since they defended successfully
  // Fill in remaining active players
  G.players.forEach((p, i) => { if (!p.exited) addUniq(i); });
  for (const idx of drawOrder) drawUpTo6(idx);
  if (G.pendingNewTrump) {
    G.trumpSuit = G.pendingNewTrump.suit;
    G.pendingNewTrump = null;
    sortAllHands(); // re-sort with new trump
  }
  G.phase = 'attack';
  checkExits();
  revalidateAttackerDefender();
  renderAll();
  if (!G.gameOver) scheduleBot();
}

// ─── NAKIDYVANIE ─────────────────────────────────────────────
function isLowestRankPlayer(playerIdx) {
  const activePl = G.players.filter(p => !p.exited);
  if (activePl.length === 0) return true;
  const minScore = Math.min(...activePl.map(p => p.score));
  return G.players[playerIdx].score <= minScore;
}

function isUniqueLowestRankPlayer(playerIdx) {
  const activePl = G.players.filter(p => !p.exited);
  if (activePl.length === 0) return false;
  const defScore = G.players[playerIdx].score;
  const minScore = Math.min(...activePl.map(p => p.score));
  if (defScore > minScore) return false;
  return activePl.filter(p => p.id !== playerIdx && p.score === defScore).length === 0;
}

function setupNakidyvanie(defenderIdx) {
  const defScoreNom = SCORE_LADDER[G.players[defenderIdx].score];
  G.nakiJokerMode = (defScoreNom === 'joker');
  G.nakiJokerThrowers = [];

  G.nakiPending = [];

  // Phase 1: give-to-hand (attack-table nominals) → Phase 2: nakidyvanie (score nominal)
  // Limit: total cards given cannot exceed defender's original hand count (secret card NOT counted)
  const defenseCardsPlayed = G.tablePairs.filter(p => p.defense && p.defender === defenderIdx).length;
  const handOnlyCount = G.players[defenderIdx].hand.length + defenseCardsPlayed;
  const attackCardsOnTable = G.tablePairs.filter(p => !p.isNaki).length;
  G.nakiGiveToHandLimit = Math.max(0, handOnlyCount - attackCardsOnTable);
  G.nakiGiveToHandPending = (G.nakiJokerMode || G.nakiGiveToHandLimit === 0) ? [] : buildGiveToHandOrder(defenderIdx);

  if (G.nakiGiveToHandPending.length > 0) {
    renderAll();
    scheduleBot();
  } else {
    startNakidyvaniePhase();
  }
}

function buildNakiOrder(defenderIdx, scoreNom) {
  // Who has the score-nominal card
  const hasCard = idx => !G.players[idx].exited
    && idx !== defenderIdx
    && G.players[idx].hand.some(c => cardNominal(c) === scoreNom);

  const order = [];
  const decisive = G.nakiDecisiveIdx;

  // Priority: decisive → transfer chain reverse → first attacker → others
  if (decisive !== null && decisive !== defenderIdx && hasCard(decisive)) {
    order.push(decisive);
  }
  // Transfer chain in reverse
  for (let i = G.transferChain.length - 1; i >= 0; i--) {
    const idx = G.transferChain[i];
    if (!order.includes(idx) && idx !== defenderIdx && hasCard(idx)) {
      order.push(idx);
    }
  }
  // First attacker
  if (!order.includes(G.attackerIdx) && G.attackerIdx !== defenderIdx && hasCard(G.attackerIdx)) {
    order.push(G.attackerIdx);
  }
  // Others (clockwise from attacker)
  let cur = nextActiveIdx(G.attackerIdx);
  let count = 0;
  while (count < G.players.length) {
    if (!order.includes(cur) && cur !== defenderIdx && hasCard(cur)) {
      order.push(cur);
    }
    cur = nextActiveIdx(cur);
    count++;
    if (cur === G.attackerIdx) break;
  }
  return order;
}

// Build priority order for give-to-hand phase.
// Only the two physical neighbors of the defender can give cards to hand,
// regardless of transfer chain. Left neighbor first, then right neighbor.
function buildGiveToHandOrder(defenderIdx) {
  const tableNominals = getTableNominals();
  if (tableNominals.size === 0) return [];
  const hasCard = idx => !G.players[idx].exited
    && idx !== defenderIdx
    && G.players[idx].hand.some(c => tableNominals.has(cardNominal(c)));

  const leftNeighbor  = prevActiveIdx(defenderIdx);
  const rightNeighbor = nextActiveIdx(defenderIdx);

  const order = [];
  if (leftNeighbor !== defenderIdx && hasCard(leftNeighbor))   order.push(leftNeighbor);
  if (rightNeighbor !== defenderIdx && rightNeighbor !== leftNeighbor && hasCard(rightNeighbor)) order.push(rightNeighbor);
  return order;
}

// Start the nakidyvanie (score) phase — called after give-to-hand phase completes
function startNakidyvaniePhase() {
  const defenderIdx = G.defenderIdx;
  const defScoreNom = SCORE_LADDER[G.players[defenderIdx].score];
  if (G.nakiJokerMode) {
    G.nakiPending = G.players
      .filter(p => !p.exited && p.id !== defenderIdx && p.hand.some(c => isJoker(c)))
      .map(p => p.id);
  } else {
    G.nakiPending = buildNakiOrder(defenderIdx, defScoreNom);
  }
  if (G.nakiPending.length === 0) {
    finishNakidyvanie(defenderIdx);
  } else {
    renderAll();
    scheduleBot();
  }
}

// Called when nakiPending becomes empty — finish nakidyvanie
function afterNakiPending() {
  finishNakidyvanie(G.defenderIdx);
}

function doNakiThrow(throwerIdx, card) {
  const defenderIdx = G.defenderIdx;
  addLog(`${G.players[throwerIdx].name} накидывает ${cardStr(card)} → ${G.players[defenderIdx].name}`, 'take');

  if (isJoker(card)) {
    G.jokerThrows.push({ fromIdx: throwerIdx, toIdx: defenderIdx });
    G.nakiJokerThrowers.push(throwerIdx);
    G.players[defenderIdx].score = Math.min(G.players[defenderIdx].score + 1, SCORE_LADDER.length - 1);
    removeFromHand(throwerIdx, card);
    G.players[defenderIdx].nakiCards.push(card);

    // In joker mode, remove this player from pending
    G.nakiPending = G.nakiPending.filter(i => i !== throwerIdx);
    if (G.nakiPending.length === 0 || G.nakiJokerMode) {
      // Give a moment for others, then finish
    }
  } else {
    G.players[defenderIdx].score = Math.min(G.players[defenderIdx].score + 1, SCORE_LADDER.length - 1);
    removeFromHand(throwerIdx, card);
    G.players[defenderIdx].nakiCards.push(card);
    G.nakiPending = [];
  }

  // Add card to table so defender takes it too
  G.tablePairs.push({ attack: card, defense: null, attacker: throwerIdx, isNaki: true });

  checkGameEnd(defenderIdx);
  if (!G.gameOver) {
    if (G.nakiPending.length === 0) {
      afterNakiPending();
    } else {
      renderAll();
      scheduleBot();
    }
  }
}

// Throw multiple cards at once in nakidyvanie (for human multi-select)
function doNakiThrowMultiple(throwerIdx, cards) {
  if (!cards || cards.length === 0) return;
  const defenderIdx = G.defenderIdx;
  // Score increases by exactly +1 regardless of how many cards are thrown
  G.players[defenderIdx].score = Math.min(G.players[defenderIdx].score + 1, SCORE_LADDER.length - 1);
  for (const card of cards) {
    addLog(`${G.players[throwerIdx].name} накидывает ${cardStr(card)} → ${G.players[defenderIdx].name}`, 'take');
    removeFromHand(throwerIdx, card);
    G.players[defenderIdx].nakiCards.push(card);
    G.tablePairs.push({ attack: card, defense: null, attacker: throwerIdx, isNaki: true });
    checkGameEnd(defenderIdx);
    if (G.gameOver) return;
  }
  G.nakiPending = [];
  afterNakiPending();
}

// Combined nakidyvanie: throw score-nominal cards (+1 score) AND give attack-table-nominal cards to hand
function doNakiCombined(throwerIdx, nakiCards, giveCards) {
  const defenderIdx = G.defenderIdx;
  if (nakiCards.length > 0) {
    G.players[defenderIdx].score = Math.min(G.players[defenderIdx].score + 1, SCORE_LADDER.length - 1);
    for (const card of nakiCards) {
      addLog(`${G.players[throwerIdx].name} накидывает ${cardStr(card)} → ${G.players[defenderIdx].name}`, 'take');
      removeFromHand(throwerIdx, card);
      G.players[defenderIdx].nakiCards.push(card);
      G.tablePairs.push({ attack: card, defense: null, attacker: throwerIdx, isNaki: true });
      checkGameEnd(defenderIdx);
      if (G.gameOver) return;
    }
  }
  for (const card of giveCards) {
    addLog(`${G.players[throwerIdx].name} даёт в руку ${cardStr(card)} → ${G.players[defenderIdx].name}`, 'take');
    removeFromHand(throwerIdx, card);
    G.players[defenderIdx].hand.push(card);
    sortHand(defenderIdx);
  }
  G.nakiPending = [];
  afterNakiPending();
}

function doNakiPass(playerIdx) {
  G.nakiPending = G.nakiPending.filter(i => i !== playerIdx);
  if (G.nakiPending.length === 0) {
    afterNakiPending();
  } else {
    renderAll();
    scheduleBot();
  }
}

// Give one or more cards to the defender's hand (give-to-hand phase)
function doNakiGiveToHand(throwerIdx, cards) {
  const defenderIdx = G.defenderIdx;
  const all = Array.isArray(cards) ? cards : [cards];
  const allowed = Math.min(all.length, G.nakiGiveToHandLimit);
  const cardsToGive = all.slice(0, allowed);
  for (const card of cardsToGive) {
    removeFromHand(throwerIdx, card);
    G.players[defenderIdx].hand.push(card);
    sortHand(defenderIdx);
    addLog(`${G.players[throwerIdx].name} даёт в руку ${cardStr(card)} → ${G.players[defenderIdx].name}`, 'take');
  }
  G.nakiGiveToHandLimit -= cardsToGive.length;
  G.nakiGiveToHandPending = G.nakiGiveToHandPending.filter(i => i !== throwerIdx);
  if (G.nakiGiveToHandPending.length === 0 || G.nakiGiveToHandLimit === 0) {
    G.nakiGiveToHandPending = [];
    startNakidyvaniePhase();
  } else {
    renderAll();
    scheduleBot();
  }
}

function doNakiGiveToHandPass(throwerIdx) {
  G.nakiGiveToHandPending = G.nakiGiveToHandPending.filter(i => i !== throwerIdx);
  if (G.nakiGiveToHandPending.length === 0) {
    startNakidyvaniePhase();
  } else {
    renderAll();
    scheduleBot();
  }
}

function finishNakidyvanie(defenderIdx) {
  // Naki cards go to discard (not into defender's hand); regular table cards go to defender's hand
  const nakiCards = G.tablePairs.filter(pair => pair.isNaki).map(pair => pair.attack).filter(Boolean);
  const regularCards = G.tablePairs.filter(pair => !pair.isNaki).flatMap(pair => [pair.attack, pair.defense].filter(Boolean));
  G.discardPile.push(...nakiCards);
  G.players[defenderIdx].hand.push(...regularCards);
  sortHand(defenderIdx);
  G.tablePairs = [];
  // Clear naki display for all players
  G.players.forEach(p => { p.nakiCards = []; });
  // firstBeaten is NOT reset here — when defender takes, the бита state doesn't change
  // Save attacker for draw order before resetting
  const savedAttackerIdx = G.attackerIdx;
  G.transferChain = [];
  G.attackDone = false;
  G.rightNeighborThrowing = false;
  G.transferThrowQueue = [];
  G.transferThrowPhase = false;
  G.humanTransferThrowPassed = false;
  G.defenderTaking = false;
  G.throwers = [];

  // Draw: attacker and others (not defender since they just took)
  const drawOrder = [];
  const addUniq = idx => { if (!drawOrder.includes(idx)) drawOrder.push(idx); };
  addUniq(savedAttackerIdx);
  G.players.forEach((p, i) => {
    if (!p.exited && i !== defenderIdx) addUniq(i);
  });
  for (const idx of drawOrder) drawUpTo6(idx);

  if (G.pendingNewTrump) {
    G.trumpSuit = G.pendingNewTrump.suit;
    G.pendingNewTrump = null;
    sortAllHands(); // re-sort with new trump
  }

  // Next attacker = player after defender (defender skips attack)
  G.attackerIdx = nextActiveIdx(defenderIdx);
  G.defenderIdx = nextActiveIdx(G.attackerIdx);
  G.phase = 'attack';
  checkExits();
  revalidateAttackerDefender();
  renderAll();
  if (!G.gameOver) scheduleBot();
}


function drawUpTo6(playerIdx) {
  const p = G.players[playerIdx];
  if (p.exited) return;

  while (p.hand.length < 6 && G.deck.length > 0) {
    const card = G.deck.pop();
    if (!card) break;

    // If this was the trump card (last in deck), reveal secret trump next turn
    if (G.trumpCard && card.id === G.trumpCard.id) {
      p.hand.push(card);
      // Reveal secret trump
      if (G.secretTrumpCard) {
        if (isJoker(G.secretTrumpCard)) {
          // Joker secret: trump doesn't change, give joker to this player
          addLog(`Секретный козырь — джокер! ${p.name} получает джокер, козырь не меняется.`, 'system');
          p.hand.push(G.secretTrumpCard);
          G.secretTrumpCard = null;
        } else {
          // Reveal new trump from next turn
          addLog(`Козырная карта взята. Новый козырь с следующего хода: ${SUIT_SYM[G.secretTrumpCard.suit]}`, 'system');
          // Trump changes after this draw phase
          G.pendingNewTrump = G.secretTrumpCard;
          G.secretTrumpCard = null;
        }
      }
      G.trumpCard = null;
    } else {
      p.hand.push(card);
    }
  }

  // If hand empty, take secret card
  if (p.hand.length === 0 && !p.secretTaken && p.secretCard) {
    p.hand.push(p.secretCard);
    p.secretTaken = true;
    p.secretRevealed = false;
    addLog(`${p.name} берёт секретную карту`, 'system');
  }

  sortHand(playerIdx);
}

function revalidateAttackerDefender() {
  if (G.gameOver) return;
  if (activePlayers().length <= 1) return;
  if (G.players[G.attackerIdx] && G.players[G.attackerIdx].exited) {
    G.attackerIdx = nextActiveIdx(G.attackerIdx);
  }
  if (G.players[G.defenderIdx] && (G.players[G.defenderIdx].exited || G.defenderIdx === G.attackerIdx)) {
    G.defenderIdx = nextActiveIdx(G.attackerIdx);
  }
}

function checkExits() {
  G.players.forEach((p, i) => {
    if (!p.exited && p.hand.length === 0 && G.deck.length === 0 && (p.secretTaken || !p.secretCard)) {
      // Player exits
      p.exited = true;
      p.exitOrder = activePlayers().filter(x => x.id !== i).length; // how many still playing
      addLog(`${p.name} выходит из раунда!`, 'round');

      if (G.exitFirstIdx === null) {
        G.exitFirstIdx = i;
        p.score = Math.max(0, p.score - 1);
        addLog(`${p.name} вышел первым! -1 к счёту`, 'system');
      }
    }
  });
  checkRoundEnd();
}

function checkRoundEnd() {
  const still = activePlayers();
  if (still.length <= 1) {
    if (still.length === 1) {
      const loser = still[0];
      G.roundLoserIdx = loser.id;
      loser.score = Math.min(loser.score + 1, SCORE_LADDER.length - 1);
      addLog(`${loser.name} — ДУРАК! +1 к счёту`, 'round');
      loser.exited = true;
      checkGameEnd(loser.id);
    }
    if (!G.gameOver) {
      endRound();
    }
  }
}

function endRound() {
  G.phase = 'roundover';
  addLog(`=== Конец раунда ${G.roundNum} ===`, 'round');
  setTimeout(() => {
    if (!G.gameOver) dealRound();
  }, 2000);
  renderAll();
}

// ─── GAME END CHECK ──────────────────────────────────────────
function checkGameEnd(targetIdx) {
  const p = G.players[targetIdx];
  const scoreNom = SCORE_LADDER[p.score];
  const isLoser = (G.roundLoserIdx === targetIdx);
  const lastAttack8 = isLastAttackAllEights();
  const wasLastRemaining = (activePlayers().length === 0 || (activePlayers().length === 1 && G.players[targetIdx].exited));

  // Check joker-thrown conditions
  const jokerThrownToTarget = G.jokerThrows.some(j => j.toIdx === targetIdx);

  if (isLoser && jokerThrownToTarget) {
    const rank = (lastAttack8 && wasLastRemaining) ? 'Супермегаотсосал' : 'Супермегапроебал';
    G.gameOver = true;
    G.gameOverRank = rank;
    G.gameOverPlayer = targetIdx;
    showGameOver();
    return;
  }

  if (isLoser && scoreNom === 'joker') {
    // Score reached joker through aces being thrown
    const rank = (lastAttack8 && wasLastRemaining) ? 'Суперотсосал' : 'Суперпроебал';
    G.gameOver = true;
    G.gameOverRank = rank;
    G.gameOverPlayer = targetIdx;
    showGameOver();
    return;
  }

  // Joker thrown to non-loser non-first: "Проебал"
  if (jokerThrownToTarget && !isLoser && G.exitFirstIdx !== targetIdx) {
    G.gameOver = true;
    G.gameOverRank = 'Проебал';
    G.gameOverPlayer = targetIdx;
    showGameOver();
    return;
  }
}

function isLastAttackAllEights() {
  const eights = G.tablePairs.filter(p => !p.isNaki && cardNominal(p.attack) === '8');
  return eights.length === 4 && G.tablePairs.filter(p => !p.isNaki).length === 4;
}

function showGameOver() {
  clearTimeout(G.botTimer);
  const p = G.players[G.gameOverPlayer];
  const rank = G.gameOverRank;
  const titles = {
    'Проебал': 'ПРОЕБАЛ',
    'Суперпроебал': 'СУПЕРПРОЕБАЛ',
    'Супермегапроебал': 'СУПЕРМЕГАПРОЕБАЛ',
    'Суперотсосал': 'СУПЕРОТСОСАЛ',
    'Супермегаотсосал': 'СУПЕРМЕГАОТСОСАЛ',
    'Королевский отсос': '👑 КОРОЛЕВСКИЙ ОТСОС 👑',
  };

  document.getElementById('gameover-title').textContent = titles[rank] || rank;
  document.getElementById('gameover-details').innerHTML =
    `<strong>${p.name}</strong> — ${rank}<br>Счёт: ${SCORE_LADDER[p.score]}`;

  const scoresEl = document.getElementById('scores-display');
  scoresEl.innerHTML = '<h3>Итоговые счета:</h3>';
  G.players.forEach(player => {
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML = `<span class="score-row-name">${player.name}</span>
      <span class="score-row-val">${SCORE_LADDER[player.score]}</span>`;
    scoresEl.appendChild(row);
  });

  G.phase = 'gameover';
  setTimeout(() => showScreen('gameover-screen'), 1200);
}

// ─── HAND MANIPULATION ───────────────────────────────────────
function removeFromHand(playerIdx, card) {
  const p = G.players[playerIdx];
  const idx = p.hand.findIndex(c => c.id === card.id);
  if (idx !== -1) p.hand.splice(idx, 1);
}

// Returns all cards a player can throw (just their hand)
function getThrowableCandidates(playerIdx) {
  return [...G.players[playerIdx].hand];
}

// ─── BOT AI ──────────────────────────────────────────────────
function scheduleBot() {
  if (G.gameOver) return;
  clearTimeout(G.botTimer);
  if (debugMode && !isHumanTurn()) {
    pendingBotAction = doBotAction;
    renderActionButtons();
  } else {
    pendingBotAction = null;
    G.botTimer = setTimeout(doBotAction, BOT_DELAY);
  }
}

function doBotAction() {
  if (!G || G.gameOver) return;
  if (G.phase === 'deal' || G.phase === 'draw' || G.phase === 'roundover') return;
  if (isHumanTurn()) return;
  undoState = null; // clear undo once bots have moved
  const phase = G.phase;

  if (phase === 'attack') {
    if (G.attackDone && G.rightNeighborThrowing) {
      // Right-neighbor throw phase
      const rn = rightNeighborOfDefender();
      if (G.players[rn] && G.players[rn].isBot) {
        botDoRightNeighborThrow(rn);
      }
    } else if (!G.attackDone) {
      // Only the physical left neighbor of the defender may attack/throw
      const lt = leftThrowerIdx();
      const attacker = G.players[lt];
      if (attacker && attacker.isBot) {
        botDoAttack(lt);
      }
    }
  } else if (phase === 'defense') {
    const defender = G.players[G.defenderIdx];
    if (defender && defender.isBot && !G.defenderTaking) {
      botDoDefense(G.defenderIdx);
    }
  } else if (phase === 'nakidyvanie') {
    if (G.nakiGiveToHandPending.length > 0) {
      const nextIdx = G.nakiGiveToHandPending[0];
      if (G.players[nextIdx] && G.players[nextIdx].isBot) {
        botDoGiveToHand(nextIdx);
      }
    } else if (G.nakiPending.length > 0) {
      const nextIdx = G.nakiPending[0];
      if (G.players[nextIdx] && G.players[nextIdx].isBot) {
        botDoNaki(nextIdx);
      }
    }
  }
}

function botDoAttack(botIdx) {
  if (G.tablePairs.length === 0) {
    // Initial attack
    const card = botChooseAttackCard(botIdx);
    if (card) {
      doAttack(botIdx, [card]);
    } else {
      declareAttackDone(botIdx);
    }
  } else if (allBeaten()) {
    // Can throw more cards as additional attack
    const throwable = getThrowableCandidates(botIdx).filter(c => nominalOnTable(cardNominal(c)));
    const toThrow = botChooseThrow(throwable);
    if (toThrow && G.tablePairs.length < getAttackLimit()) {
      doThrow(botIdx, toThrow);
    } else {
      declareAttackDone(botIdx);
    }
  } else {
    // Table has unbeaten cards - wait or declare done
    declareAttackDone(botIdx);
  }
}

function botDoRightNeighborThrow(botIdx) {
  const throwable = getThrowableCandidates(botIdx).filter(c => nominalOnTable(cardNominal(c)));
  const toThrow = botChooseThrow(throwable);
  if (toThrow && G.tablePairs.length < getAttackLimit()) {
    doThrow(botIdx, toThrow);
  } else {
    doRightNeighborPass(botIdx);
  }
}


function botDoDefense(botIdx) {
  // Find unbeaten cards
  const unbeaten = G.tablePairs.filter(p => !p.defense);
  if (unbeaten.length === 0) {
    // All beaten, declare done from defender's side (attacker should declare done)
    return;
  }

  // Try to transfer first — always prefer it over defending if rules allow
  const transferCandidates = G.players[botIdx].hand.filter(c => canTransfer(c, G.tablePairs));
  if (transferCandidates.length > 0) {
    doTransfer(botIdx, transferCandidates[0]);
    return;
  }

  // Try to beat each unbeaten card
  for (const pair of unbeaten) {
    const beatCard = botFindBeatCard(botIdx, pair.attack);
    if (beatCard) {
      const pairIdx = G.tablePairs.indexOf(pair);
      doDefend(botIdx, pairIdx, beatCard);
      return; // one at a time
    }
  }

  // Cannot beat → take
  doTake(botIdx);
}

function botFindBeatCard(botIdx, attackCard) {
  const candidates = G.players[botIdx].hand
    .filter(c => canBeat(attackCard, c, G.trumpSuit))
    .sort((a, b) => {
      // Prefer weakest beater
      if (isJoker(a) && !isJoker(b)) return 1;
      if (!isJoker(a) && isJoker(b)) return -1;
      const va = isJoker(a) ? 100 : (a.suit === G.trumpSuit ? 50 : 0) + RANK_VAL[a.rank];
      const vb = isJoker(b) ? 100 : (b.suit === G.trumpSuit ? 50 : 0) + RANK_VAL[b.rank];
      return va - vb;
    });
  return candidates[0] || null;
}

function botChooseAttackCard(botIdx) {
  const hand = G.players[botIdx].hand;
  // Prefer non-trump, non-joker, lowest rank
  const nonTrump = hand.filter(c => !isJoker(c) && c.suit !== G.trumpSuit)
    .sort((a, b) => RANK_VAL[a.rank] - RANK_VAL[b.rank]);
  if (nonTrump.length > 0) return nonTrump[0];
  const trumpCards = hand.filter(c => !isJoker(c))
    .sort((a, b) => RANK_VAL[a.rank] - RANK_VAL[b.rank]);
  if (trumpCards.length > 0) return trumpCards[0];
  return hand[0] || null;
}

function botChooseThrow(candidates) {
  if (candidates.length === 0) return null;
  // Prefer non-joker, lowest value
  const sorted = [...candidates].sort((a, b) => {
    if (isJoker(a) && !isJoker(b)) return 1;
    if (!isJoker(a) && isJoker(b)) return -1;
    const va = isJoker(a) ? 99 : (a.suit === G.trumpSuit ? 50 : 0) + (RANK_VAL[a.rank] || 0);
    const vb = isJoker(b) ? 99 : (b.suit === G.trumpSuit ? 50 : 0) + (RANK_VAL[b.rank] || 0);
    return va - vb;
  });
  return sorted[0];
}

function botDoGiveToHand(botIdx) {
  const tableNominals = getTableNominals();
  const scoreNom = SCORE_LADDER[G.players[G.defenderIdx].score];
  // If bot has multiple cards of the score nominal, give all but one to hand; save one for nakidyvanie
  const nakiCandidates = G.players[botIdx].hand.filter(c =>
    tableNominals.has(cardNominal(c)) && cardNominal(c) === scoreNom
  );
  const keepForNaki = nakiCandidates.length > 0 ? 1 : 0;
  let nakiKept = 0;
  const limit = G.nakiGiveToHandLimit || 0;
  const giveCards = G.players[botIdx].hand.filter(c => {
    if (!tableNominals.has(cardNominal(c))) return false;
    if (cardNominal(c) === scoreNom) {
      if (nakiKept < keepForNaki) { nakiKept++; return false; }
    }
    return true;
  }).slice(0, limit);
  setTimeout(() => {
    if (G.nakiGiveToHandPending.length > 0 && G.nakiGiveToHandPending[0] === botIdx) {
      if (giveCards.length > 0) {
        doNakiGiveToHand(botIdx, giveCards);
      } else {
        doNakiGiveToHandPass(botIdx);
      }
    }
  }, BOT_DELAY);
}

function botDoNaki(botIdx) {
  const defIdx = G.defenderIdx;
  const scoreNom = SCORE_LADDER[G.players[defIdx].score];

  if (G.nakiJokerMode) {
    // Prefer deuce joker
    const joker = G.players[botIdx].hand.find(c => isDeuceJoker(c))
      || G.players[botIdx].hand.find(c => isJoker(c));
    if (joker) {
      doNakiThrow(botIdx, joker);
    } else {
      doNakiPass(botIdx);
    }
  } else {
    const card = G.players[botIdx].hand.find(c => cardNominal(c) === scoreNom);
    if (card) {
      doNakiThrow(botIdx, card);
    } else {
      doNakiPass(botIdx);
    }
  }
}

// ─── UNDO STATE ──────────────────────────────────────────────
function saveUndoState() {
  undoState = {
    deck: [...G.deck],
    discardPile: [...G.discardPile],
    trumpSuit: G.trumpSuit,
    trumpCard: G.trumpCard ? {...G.trumpCard} : null,
    secretTrumpCard: G.secretTrumpCard ? {...G.secretTrumpCard} : null,
    pendingNewTrump: G.pendingNewTrump ? {...G.pendingNewTrump} : null,
    phase: G.phase,
    attackerIdx: G.attackerIdx,
    defenderIdx: G.defenderIdx,
    tablePairs: G.tablePairs.map(p => ({...p})),
    firstBeaten: G.firstBeaten,
    transferChain: [...G.transferChain],
    attackDone: G.attackDone,
    rightNeighborThrowing: G.rightNeighborThrowing,
    throwers: [...G.throwers],
    nakiPending: [...G.nakiPending],
    nakiDecisiveIdx: G.nakiDecisiveIdx,
    nakiJokerMode: G.nakiJokerMode,
    nakiJokerThrowers: [...G.nakiJokerThrowers],
    nakiGiveToHandPending: [...G.nakiGiveToHandPending],
    nakiGiveToHandLimit: G.nakiGiveToHandLimit,
    transferThrowQueue: [...G.transferThrowQueue],
    transferThrowPhase: G.transferThrowPhase,
    humanTransferThrowPassed: G.humanTransferThrowPassed,
    defenderTaking: G.defenderTaking,
    roundNum: G.roundNum,
    exitFirstIdx: G.exitFirstIdx,
    jokerThrows: G.jokerThrows.map(j => ({...j})),
    roundLoserIdx: G.roundLoserIdx,
    players: G.players.map(p => ({...p, hand: [...p.hand], nakiCards: [...p.nakiCards]})),
  };
}

function applyUndo() {
  if (!undoState) return;
  const s = undoState;
  undoState = null;
  clearTimeout(G.botTimer);
  G.deck = s.deck;
  G.discardPile = s.discardPile;
  G.trumpSuit = s.trumpSuit;
  G.trumpCard = s.trumpCard;
  G.secretTrumpCard = s.secretTrumpCard;
  G.pendingNewTrump = s.pendingNewTrump;
  G.phase = s.phase;
  G.attackerIdx = s.attackerIdx;
  G.defenderIdx = s.defenderIdx;
  G.tablePairs = s.tablePairs;
  G.firstBeaten = s.firstBeaten;
  G.transferChain = s.transferChain;
  G.attackDone = s.attackDone;
  G.rightNeighborThrowing = s.rightNeighborThrowing;
  G.throwers = s.throwers;
  G.nakiPending = s.nakiPending;
  G.nakiDecisiveIdx = s.nakiDecisiveIdx;
  G.nakiJokerMode = s.nakiJokerMode;
  G.nakiJokerThrowers = s.nakiJokerThrowers;
  G.nakiGiveToHandPending = s.nakiGiveToHandPending;
  G.nakiGiveToHandLimit = s.nakiGiveToHandLimit;
  G.transferThrowQueue = s.transferThrowQueue;
  G.transferThrowPhase = s.transferThrowPhase;
  G.humanTransferThrowPassed = s.humanTransferThrowPassed;
  G.defenderTaking = s.defenderTaking;
  G.roundNum = s.roundNum;
  G.exitFirstIdx = s.exitFirstIdx;
  G.jokerThrows = s.jokerThrows;
  G.roundLoserIdx = s.roundLoserIdx;
  G.players = s.players;
  UI.selectedCards = [];
  UI.selectedAttackPairIdx = null;
  addLog('Ход отменён', 'system');
  renderAll();
  scheduleBot();
}

function showUndoApproval() {
  // Remove existing overlay if any
  const existing = document.getElementById('undo-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'undo-overlay';
  overlay.innerHTML = `
    <div class="undo-modal">
      <div class="undo-title">Отменить ход?</div>
      <div class="undo-subtitle">Боты всегда согласны — авто-подтверждение через 1 сек</div>
      <div class="undo-countdown" id="undo-countdown">10</div>
      <div class="undo-buttons">
        <button class="action-btn btn-undo" id="undo-confirm-btn">Подтвердить отмену</button>
        <button class="action-btn btn-pass" id="undo-cancel-btn">Не отменять</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let seconds = 10;
  const countdownEl = document.getElementById('undo-countdown');

  // Bots auto-approve after 1 second
  const autoApproveTimer = setTimeout(() => {
    clearInterval(tickInterval);
    overlay.remove();
    applyUndo();
  }, 1000);

  // Countdown display
  const tickInterval = setInterval(() => {
    seconds--;
    if (countdownEl) countdownEl.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(tickInterval);
      clearTimeout(autoApproveTimer);
      overlay.remove();
      undoState = null; // expired — cancel undo
      scheduleBot();
    }
  }, 1000);

  document.getElementById('undo-confirm-btn').addEventListener('click', () => {
    clearTimeout(autoApproveTimer);
    clearInterval(tickInterval);
    overlay.remove();
    applyUndo();
  });

  document.getElementById('undo-cancel-btn').addEventListener('click', () => {
    clearTimeout(autoApproveTimer);
    clearInterval(tickInterval);
    overlay.remove();
    undoState = null;
    scheduleBot();
  });
}

// ─── TURN FLOW HELPERS ───────────────────────────────────────
function declareAttackDone(playerIdx) {
  // Only the current left thrower (physical left neighbor of defender) can declare done
  if (playerIdx !== leftThrowerIdx()) return;

  if (!G.attackDone) {
    G.attackDone = true;
    addLog(`${G.players[playerIdx].name} завершает атаку`, 'system');

    // Check if right neighbor exists and is different from left thrower
    const rn = rightNeighborOfDefender();
    if (rn !== leftThrowerIdx()) {
      G.rightNeighborThrowing = true;
      G.phase = 'attack'; // right neighbor can still throw
      renderAll();
      scheduleBot();
      return;
    }
  }

  // Attacker done AND no right-neighbor phase (or already done)
  G.rightNeighborThrowing = false;

  // If defender is taking, skip transfer-throw queue and go straight to nakidyvanie
  if (G.defenderTaking) {
    G.phase = 'nakidyvanie';
    setupNakidyvanie(G.defenderIdx);
    return;
  }

  G.transferThrowQueue = [];
  G.transferThrowPhase = false;
  resolveAfterThrowing();
}

function doThrow(throwerIdx, card) {
  if (G.tablePairs.length >= getAttackLimit()) return false;
  addLog(`${G.players[throwerIdx].name} подкидывает: ${cardStr(card)}`, 'attack');
  removeFromHand(throwerIdx, card);
  G.tablePairs.push({ attack: card, defense: null, attacker: throwerIdx });
  if (!G.throwers.includes(throwerIdx)) G.throwers.push(throwerIdx);
  // When defender is already committed to taking, stay in attack phase (no defense needed)
  G.phase = G.defenderTaking ? 'attack' : 'defense';
  renderAll();
  scheduleBot();
}

function resolveAfterThrowing() {
  if (G.defenderTaking) {
    G.phase = 'nakidyvanie';
    setupNakidyvanie(G.defenderIdx);
    return;
  }
  if (hasUnbeaten()) {
    G.phase = 'defense';
    renderAll();
    scheduleBot();
  } else {
    doDiscard();
  }
}

function doRightNeighborPass(playerIdx) {
  addLog(`${G.players[playerIdx].name} пас (правый сосед)`, 'system');
  G.rightNeighborThrowing = false;

  // If defender is taking, skip transfer-throw queue and go to nakidyvanie
  if (G.defenderTaking) {
    G.phase = 'nakidyvanie';
    setupNakidyvanie(G.defenderIdx);
    return;
  }

  G.transferThrowQueue = [];
  G.transferThrowPhase = false;
  resolveAfterThrowing();
}


// ─── HUMAN PLAYER INTERACTION ────────────────────────────────
function humanPlayerIdx() {
  if (typeof mp !== 'undefined' && mp.enabled) return mp.seatIndex;
  return G.players.findIndex(p => !p.isBot);
}

function isHumanTurn() {
  const hi = humanPlayerIdx();
  if (hi === -1) return false;
  if (G.phase === 'attack') {
    if (!G.attackDone && leftThrowerIdx() === hi) return true;
    if (G.attackDone && G.rightNeighborThrowing && rightNeighborOfDefender() === hi) return true;
  }
  if (G.phase === 'defense' && G.defenderIdx === hi) return true;
  if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length > 0 && G.nakiGiveToHandPending[0] === hi) return true;
  if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length === 0 && G.nakiPending.length > 0 && G.nakiPending[0] === hi) return true;
  return false;
}

// ─── HAND SORTING ────────────────────────────────────────────
function sortHand(playerIdx) {
  const p = G.players[playerIdx];
  if (!p || !G.trumpSuit) return;
  const trump = G.trumpSuit;

  // Groups: 0=picture joker, 1=deuce joker, 2=trump, 3=non-trump
  function groupOf(card) {
    if (isPictureJoker(card)) return 0;
    if (isDeuceJoker(card)) return 1;
    if (!isJoker(card) && card.suit === trump) return 2;
    return 3;
  }

  const suitOrder = { spades: 0, clubs: 1, hearts: 2, diamonds: 3 };

  p.hand.sort((a, b) => {
    const ga = groupOf(a), gb = groupOf(b);
    if (ga !== gb) return ga - gb;
    // Same group: sort by rank ascending (6 first, A last)
    const va = isJoker(a) ? 99 : RANK_VAL[a.rank];
    const vb = isJoker(b) ? 99 : RANK_VAL[b.rank];
    if (va !== vb) return vb - va; // descending by nominal (high first)
    // Same nominal: by suit order
    const sa = suitOrder[a.suit] ?? 9;
    const sb = suitOrder[b.suit] ?? 9;
    return sa - sb;
  });
}

function sortAllHands() {
  G.players.forEach((_, i) => sortHand(i));
}

// ─── RENDER ──────────────────────────────────────────────────
// Maps playerIdx → CSS position name (populated by renderPlayers each render)
var playerPosMap = {};

// Approximate center coordinates (x%, y% of viewport) for each position
const TABLE_POS_COORDS = {
  'top':       [50, 16],
  'top-left':  [23, 21],
  'top-right': [77, 21],
  'left':      [10, 50],
  'right':     [90, 50],
  'bottom':    [50, 82],
};

function updateTablePosition() {
  const tableArea = document.querySelector('.table-area');
  if (!tableArea || !G) return;

  const aPos = playerPosMap[leftThrowerIdx()];
  const dPos = playerPosMap[G.defenderIdx];

  // No cards or positions unknown → neutral center
  if (!aPos || !dPos || !G.tablePairs || G.tablePairs.length === 0) {
    tableArea.style.left = '50%';
    tableArea.style.top  = '55%';
    return;
  }

  const [ax, ay] = TABLE_POS_COORDS[aPos] || [50, 50];
  const [dx, dy] = TABLE_POS_COORDS[dPos] || [50, 50];

  // Midpoint between attacker and defender
  tableArea.style.left = `${(ax + dx) / 2}%`;
  tableArea.style.top  = `${(ay + dy) / 2}%`;
}

function renderAll() {
  renderTrump();
  renderDeck();
  renderPlayers();
  renderTable();
  renderHumanHand();
  renderActionButtons();
  renderPhase();
  updateTablePosition();
  if (typeof mpAfterRender === 'function') mpAfterRender();
}

function renderTrump() {
  if (!G || !G.trumpSuit) return;

  // Update trump panel suit symbol
  const suitEl = document.getElementById('trump-panel-suit');
  if (suitEl) {
    suitEl.textContent = SUIT_SYM[G.trumpSuit];
    suitEl.className = 'trump-panel-suit ' + G.trumpSuit;
  }

  // Update trump card display in panel
  const cardEl = document.getElementById('trump-card-panel');
  if (cardEl) {
    cardEl.innerHTML = '';
    if (G.trumpCard && G.deck.length > 0) {
      const cardNode = makeCardElement(G.trumpCard, true);
      cardEl.appendChild(cardNode);
    } else {
      cardEl.style.background = 'rgba(255,255,255,0.1)';
      cardEl.style.border = '2px dashed rgba(255,255,255,0.2)';
    }
  }

  // Show untouchable suit info
  const untouchEl = document.getElementById('untouchable-panel');
  if (untouchEl && G.trumpSuit) {
    const untouchable = G.trumpSuit === 'spades' ? 'clubs' : 'spades';
    const untouchSym = SUIT_SYM[untouchable];
    const untouchName = { spades: 'пики', clubs: 'крести' }[untouchable];
    untouchEl.textContent = `${untouchSym} ${untouchName} неприкосновенны`;
  }
}

function renderDeck() {
  const count = G.deck.length;
  const el = document.getElementById('deck-count');
  if (el) el.textContent = count;

  const vis = document.getElementById('deck-visual');
  if (vis) {
    vis.style.opacity = count > 0 ? '1' : '0.3';
    // Volumetric size class based on card count
    vis.className = 'deck-visual ' + (
      count >= 32 ? 'size-xl' :
      count >= 22 ? 'size-lg' :
      count >= 12 ? 'size-md' :
      count >= 5  ? 'size-sm' :
      count >= 1  ? 'size-xs' : 'size-empty'
    );
  }

  // Discard pile count
  const discardEl = document.getElementById('discard-count');
  if (discardEl) discardEl.textContent = G.discardPile ? G.discardPile.length : 0;
  const discardVis = document.getElementById('discard-visual');
  if (discardVis) {
    const n = G.discardPile ? G.discardPile.length : 0;
    discardVis.style.opacity = n > 0 ? '1' : '0.35';
    discardVis.classList.toggle('has-cards', n > 0);
  }
}

function renderNakiCards(playerIdx) {
  const p = G.players[playerIdx];
  if (!p.nakiCards || p.nakiCards.length === 0) return '';
  const cards = p.nakiCards.map(card => {
    if (isJoker(card)) {
      return `<div class="naki-card-mini joker" title="Накинуто: ${cardStr(card)}">🃏</div>`;
    }
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    const sym = SUIT_SYM[card.suit];
    return `<div class="naki-card-mini ${isRed ? 'red' : 'black'}" title="Накинуто: ${card.rank}${sym}">${card.rank}<br>${sym}</div>`;
  }).join('');
  return `<div class="naki-panel">
    <div class="naki-panel-label">Накидка</div>
    <div class="naki-cards-row">${cards}</div>
  </div>`;
}

// Position map: non-human players in clockwise order from human's left
const PLAYER_POS_MAP = {
  1: ['top'],
  2: ['top-left', 'top-right'],
  3: ['left', 'top', 'right'],
  4: ['left', 'top-left', 'top-right', 'right'],
  5: ['left', 'top-left', 'top', 'top-right', 'right'],
};

function renderPlayers() {
  const area = document.getElementById('players-area');
  area.innerHTML = '';

  const hi = humanPlayerIdx();
  const n = G.players.length;

  const currentAttackerIdx = G.transferChain && G.transferChain.length > 0
    ? G.transferChain[G.transferChain.length - 1]
    : G.attackerIdx;

  // Reset position map for this render cycle
  playerPosMap = {};
  if (hi !== -1) playerPosMap[hi] = 'bottom';

  // Non-human players in clockwise seat order starting from the player after human
  const nonHumanOrdered = [];
  for (let i = 1; i < n; i++) {
    const idx = (hi + i) % n;
    nonHumanOrdered.push({ p: G.players[idx], pi: idx });
  }

  const positions = PLAYER_POS_MAP[nonHumanOrdered.length] || PLAYER_POS_MAP[5];

  nonHumanOrdered.forEach(({ p, pi }, posIdx) => {
    const pos = positions[posIdx] || 'top';
    const isVertical = pos === 'left' || pos === 'right';

    playerPosMap[pi] = pos; // record position for table placement

    const box = document.createElement('div');
    box.className = `player-info-box player-pos-${pos}`;
    if (pi === currentAttackerIdx) box.classList.add('attacker');
    if (pi === G.defenderIdx) box.classList.add('defender');
    if (p.exited) box.classList.add('exited');

    let roleBadge = '';
    if (pi === G.defenderIdx) roleBadge = '<span class="player-role-badge badge-defender">Защита</span>';
    else if (pi === currentAttackerIdx) roleBadge = '<span class="player-role-badge badge-attacker">Атака</span>';
    else if (p.exited) roleBadge = '<span class="player-role-badge badge-out">Вышел</span>';

    // Card backs
    let cardsHtml = '';
    if (p.isBot) {
      let handHtml;
      if (debugMode) {
        handHtml = p.hand.map(card => {
          const lbl = cardLabel(card);
          const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
          const colorCls = isJoker(card) ? 'joker' : (isRed ? 'red' : 'black');
          return `<div class="card-mini-debug ${colorCls}" title="${cardStr(card)}">${lbl.top}${lbl.suit}</div>`;
        }).join('');
      } else {
        handHtml = p.hand.map(() => '<div class="card-back-mini"></div>').join('');
      }

      let secretHtml = '';
      if (!p.secretTaken && p.secretCard) {
        if (p.secretRevealed || debugMode) {
          const lbl = cardLabel(p.secretCard);
          const isRed = p.secretCard.suit === 'hearts' || p.secretCard.suit === 'diamonds';
          const colorCls = isJoker(p.secretCard) ? 'joker' : (isRed ? 'red' : 'black');
          const title = p.secretRevealed
            ? `Потайная (открыта): ${cardStr(p.secretCard)}`
            : `Потайная (отладка): ${cardStr(p.secretCard)}`;
          const debugBorder = debugMode ? ' style="border:2px dashed #9333ea"' : '';
          secretHtml = `<div class="secret-card-wrap">
            <div class="card-back-mini secret-card ${p.secretRevealed ? 'secret-revealed' : ''} ${debugMode ? colorCls : ''}"${debugBorder} title="${title}">
              ${p.secretRevealed || debugMode ? lbl.top : ''}
            </div>
            <span class="secret-label">⚠ Потайная</span>
          </div>`;
        } else {
          secretHtml = `<div class="secret-card-wrap">
            <div class="card-back-mini secret-card" title="Потайная карта (скрыта)"></div>
            <span class="secret-label">⚠ Потайная</span>
          </div>`;
        }
      }

      const wrapCls = isVertical ? 'bot-cards-wrap vertical' : 'bot-cards-wrap';
      cardsHtml = `<div class="${wrapCls}">
        <div class="bot-cards">${handHtml}</div>${secretHtml}
      </div>`;
    }

    const nakiHtml = renderNakiCards(pi);
    const countStr = p.hand.length + (p.secretCard && !p.secretTaken ? '+1' : '');
    const scoreDots = renderScoreDots(p.score);

    box.innerHTML = `
      ${cardsHtml}
      <div class="player-nameplate">
        <span class="player-nameplate-name">${escHtml(p.name)}</span>
        <span class="player-nameplate-count">Карт: ${countStr}</span>
      </div>
      <div class="player-score-mini">${scoreDots}</div>
      ${roleBadge}
      ${nakiHtml}
    `;
    area.appendChild(box);
  });

  // Human player badge (bottom-center, above hand)
  if (hi !== -1) {
    const hp = G.players[hi];
    const hbox = document.createElement('div');
    hbox.className = 'player-info-box player-pos-bottom';
    if (hi === currentAttackerIdx) hbox.classList.add('attacker');
    if (hi === G.defenderIdx) hbox.classList.add('defender');
    if (isHumanTurn()) hbox.classList.add('active-turn');

    let hbadge = '';
    if (hi === G.defenderIdx) hbadge = '<span class="player-role-badge badge-defender">Защита</span>';
    else if (hi === currentAttackerIdx) hbadge = '<span class="player-role-badge badge-attacker">Атака</span>';

    const hCountStr = hp.hand.length + (hp.secretCard && !hp.secretTaken ? '+1' : '');
    hbox.innerHTML = `
      <div class="player-nameplate human">
        <span class="player-nameplate-name">Вы</span>
        <span class="player-nameplate-count">Карт: ${hCountStr}</span>
      </div>
      ${hbadge}
      ${renderNakiCards(hi)}
    `;
    area.appendChild(hbox);
  }
}

function renderScoreDots(score) {
  return SCORE_LADDER.map((nom, i) => {
    let cls = 'score-pip';
    if (i < score) cls += ' filled';
    if (i === score) cls += ' current';
    if (nom === 'joker') cls += ' joker-pip';
    return `<span class="${cls}" title="${nom}"></span>`;
  }).join('');
}

function renderTable() {
  const table = document.getElementById('table-cards');
  table.innerHTML = '';

  const hi = humanPlayerIdx();
  const isDefending = hi !== -1 && G.defenderIdx === hi && G.phase === 'defense';

  // DnD: table area drop zone for attack (empty table or allBeaten)
  const isHumanAttacking = hi !== -1 && isHumanTurn() && (
    (G.phase === 'attack' && !G.attackDone && leftThrowerIdx() === hi) ||
    (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing && rightNeighborOfDefender() === hi)
  );

  if (isHumanAttacking && window.innerWidth > 600) {
    table.addEventListener('dragover', (e) => {
      if (dragState && dragState.type === 'hand') {
        const card = G.players[hi].hand.find(c => c.id === dragState.cardId);
        if (card) {
          // Check if this is a valid attack/throw to the table area
          const isValidThrow = (G.tablePairs.length === 0 && !G.attackDone) ||
            (allBeaten() && nominalOnTable(cardNominal(card)) && G.tablePairs.length < getAttackLimit());
          if (isValidThrow) {
            e.preventDefault();
            table.classList.add('drag-valid-zone');
          }
        }
      }
    });
    table.addEventListener('dragleave', (e) => {
      if (!table.contains(e.relatedTarget)) {
        table.classList.remove('drag-valid-zone');
      }
    });
    table.addEventListener('drop', (e) => {
      e.preventDefault();
      table.classList.remove('drag-valid-zone');
      if (!dragState || dragState.type !== 'hand') return;
      const card = G.players[hi].hand.find(c => c.id === dragState.cardId);
      if (!card) return;
      dragState = null;
      UI.selectedCards = [];
      // Determine what kind of action
      if (G.tablePairs.length === 0 && G.phase === 'attack' && !G.attackDone && leftThrowerIdx() === hi) {
        mpAction('attack', { playerIdx: hi, cardIds: [card.id] },
          () => { saveUndoState(); doAttack(hi, [card]); });
      } else if (allBeaten() && nominalOnTable(cardNominal(card)) && G.tablePairs.length < getAttackLimit()) {
        if (G.attackDone && G.rightNeighborThrowing && rightNeighborOfDefender() === hi) {
          mpAction('throw', { playerIdx: hi, cardId: card.id },
            () => { saveUndoState(); doThrow(hi, card); });
        } else if (!G.attackDone && leftThrowerIdx() === hi) {
          mpAction('throw', { playerIdx: hi, cardId: card.id },
            () => { saveUndoState(); doThrow(hi, card); });
        }
      }
    });
  }

  G.tablePairs.forEach((pair, pairIdx) => {
    const div = document.createElement('div');
    div.className = 'table-pair';

    if (isDefending && !pair.defense && UI.selectedAttackPairIdx === null) {
      div.classList.add('awaiting-defense');
      div.title = 'Нажмите чтобы выбрать для отбоя';
      div.addEventListener('click', () => selectAttackPair(pairIdx));
    }
    if (UI.selectedAttackPairIdx === pairIdx) {
      div.style.background = 'rgba(46,204,113,0.15)';
      div.style.borderRadius = '6px';
    }

    const atkEl = makeCardElement(pair.attack, true);
    atkEl.classList.add('attack-card', 'small');

    // DnD: unbeaten attack card is a drop target for defense from hand (desktop only)
    if (isDefending && !pair.defense && window.innerWidth > 600) {
      atkEl.addEventListener('dragover', (e) => {
        if (dragState) {
          let card = null;
          if (dragState.type === 'hand') {
            card = G.players[hi].hand.find(c => c.id === dragState.cardId);
          } else if (dragState.type === 'defcard') {
            // A defense card being reassigned — it was already played, find it among existing defense pairs
            const srcPair = G.tablePairs[dragState.fromPairIdx];
            card = srcPair ? srcPair.defense : null;
          }
          if (card && canBeat(pair.attack, card, G.trumpSuit)) {
            e.preventDefault();
            div.classList.add('drag-valid-target');
          }
        }
      });
      atkEl.addEventListener('dragleave', () => {
        div.classList.remove('drag-valid-target');
      });
      atkEl.addEventListener('drop', (e) => {
        e.preventDefault();
        div.classList.remove('drag-valid-target');
        if (!dragState) return;

        if (dragState.type === 'hand') {
          const card = G.players[hi].hand.find(c => c.id === dragState.cardId);
          if (!card) { dragState = null; return; }
          if (canBeat(pair.attack, card, G.trumpSuit)) {
            dragState = null;
            UI.selectedAttackPairIdx = null;
            UI.selectedCards = [];
            mpAction('defense', { playerIdx: hi, attackPairIdx: pairIdx, defenseCardId: card.id },
              () => { saveUndoState(); doDefend(hi, pairIdx, card); });
          }
        } else if (dragState.type === 'defcard') {
          // Reassign defense card from another pair to this pair
          const fromPairIdx = dragState.fromPairIdx;
          if (fromPairIdx === pairIdx) { dragState = null; return; }
          const srcPair = G.tablePairs[fromPairIdx];
          if (!srcPair || !srcPair.defense) { dragState = null; return; }
          const defCard = srcPair.defense;
          if (canBeat(pair.attack, defCard, G.trumpSuit)) {
            dragState = null;
            // Reassign: direct G mutation, only works in solo/host mode
            if (typeof mp === 'undefined' || !mp.enabled || mp.isHost) {
              pair.defense = defCard;
              pair.defender = hi;
              srcPair.defense = null;
              srcPair.defender = undefined;
              // firstBeaten is only set by doDiscard(), don't change it here
              UI.selectedAttackPairIdx = null;
              UI.selectedCards = [];
              renderAll();
              scheduleBot();
            }
          } else {
            dragState = null;
          }
        }
      });
    }

    div.appendChild(atkEl);

    if (pair.defense) {
      const defEl = makeCardElement(pair.defense, true);
      defEl.classList.add('defense-card', 'small');

      // DnD: defense cards are draggable if it's human's defense turn (desktop only)
      if (isDefending && pair.defender === hi && window.innerWidth > 600) {
        defEl.setAttribute('draggable', 'true');
        defEl.addEventListener('dragstart', (e) => {
          dragState = { type: 'defcard', cardId: pair.defense.id, fromPairIdx: pairIdx };
          div.classList.add('drag-reassign-source');
          e.dataTransfer.effectAllowed = 'move';
        });
        defEl.addEventListener('dragend', () => {
          div.classList.remove('drag-reassign-source');
          clearDragHighlights();
        });
      }

      div.appendChild(defEl);
    }

    table.appendChild(div);
  });
}

function clearDragHighlights() {
  dragState = null;
  document.querySelectorAll('.drag-valid-zone').forEach(el => el.classList.remove('drag-valid-zone'));
  document.querySelectorAll('.drag-valid-target').forEach(el => el.classList.remove('drag-valid-target'));
  document.querySelectorAll('.drag-reassign-source').forEach(el => el.classList.remove('drag-reassign-source'));
}

function renderHumanHand() {
  const hi = humanPlayerIdx();
  const hand = document.getElementById('human-hand');
  hand.innerHTML = '';
  if (hi === -1) return;

  const p = G.players[hi];
  const isMyTurn = isHumanTurn();

  p.hand.forEach(card => {
    const el = makeCardElement(card, true);

    const isSelected = UI.selectedCards.includes(card.id);
    if (isSelected) el.classList.add('selected');

    if (isMyTurn) {
      el.classList.add('clickable');

      if (G.phase === 'attack' && !G.attackDone) {
        if (isValidAttackCard(card)) el.classList.add('valid-attack');
      } else if (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing) {
        if (nominalOnTable(cardNominal(card))) el.classList.add('valid-attack');
      } else if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length > 0 && G.nakiGiveToHandPending[0] === hi) {
        // Give-to-hand phase: highlight attack-table-matching cards
        const tableNoms = getTableNominals();
        if (tableNoms.has(cardNominal(card))) el.classList.add('valid-transfer');
      } else if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length === 0 && G.nakiPending.length > 0 && G.nakiPending[0] === hi && !G.nakiJokerMode) {
        // Nakidyvanie phase: highlight score-nominal cards
        const scoreNom = SCORE_LADDER[G.players[G.defenderIdx].score];
        if (cardNominal(card) === scoreNom) el.classList.add('valid-attack');
      } else if (G.phase === 'defense') {
        if (UI.selectedAttackPairIdx !== null) {
          const pair = G.tablePairs[UI.selectedAttackPairIdx];
          if (pair && canBeat(pair.attack, card, G.trumpSuit)) el.classList.add('valid-target');
        }
        // Check if transferable
        if (canTransfer(card, G.tablePairs, G.trumpSuit)) el.classList.add('valid-attack');
      }

      el.addEventListener('click', () => humanCardClick(card));
    }

    // ── DnD: make hand cards draggable (skip on mobile — tap-based interaction works fine)
    if (isMyTurn && window.innerWidth > 600) {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (e) => {
        dragState = { type: 'hand', cardId: card.id };
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        clearDragHighlights();
      });
    }

    hand.appendChild(el);
  });

  // Secret card — shown face-up only when hand is empty (not yet taken into hand)
  if (p.secretCard && !p.secretTaken) {
    const sec = document.createElement('div');
    if (p.hand.length === 0) {
      // Owner sees their own secret face-up while waiting for draw phase
      const lbl = cardLabel(p.secretCard);
      const isRed = p.secretCard.suit === 'hearts' || p.secretCard.suit === 'diamonds';
      sec.className = `card small own-secret ${isRed ? 'red' : 'black'}`;
      sec.title = 'Ваша потайная карта';
      sec.innerHTML = `<div class="card-top">${lbl.top}</div><div class="card-center">${lbl.center}</div>`;
    } else {
      // Hand not empty — show as card back (hidden)
      sec.className = 'card small secret-back';
      sec.title = 'Ваша потайная карта (скрыта)';
    }
    hand.appendChild(sec);
  }
}

function isValidAttackCard(card) {
  // On initial attack, any card is valid
  if (G.tablePairs.length === 0) return true;
  // On throws: must match a nominal on the table and fit limit
  if (allBeaten() && nominalOnTable(cardNominal(card)) && G.tablePairs.length < getAttackLimit()) return true;
  return false;
}

function humanCardClick(card) {
  const hi = humanPlayerIdx();
  if (!isHumanTurn()) return;

  if (G.phase === 'attack' && !G.attackDone) {
    // Toggle selection, then if all same nominal can attack
    const idx = UI.selectedCards.indexOf(card.id);
    if (idx === -1) {
      // Check if same nominal as already selected
      if (UI.selectedCards.length > 0) {
        const firstCard = G.players[hi].hand.find(c => c.id === UI.selectedCards[0]);
        if (firstCard && cardNominal(firstCard) !== cardNominal(card)) {
          UI.selectedCards = [card.id];
          renderHumanHand();
          return;
        }
      }
      // Don't exceed attack limit (limit = how many more cards can be placed on table)
      const availableSlots = getAttackLimit() - G.tablePairs.length;
      if (UI.selectedCards.length >= availableSlots) {
        renderHumanHand();
        return;
      }
      UI.selectedCards.push(card.id);
    } else {
      UI.selectedCards.splice(idx, 1);
    }
    renderHumanHand();
    renderActionButtons();
  } else if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length > 0 && G.nakiGiveToHandPending[0] === hi) {
    // Multi-select in give-to-hand phase
    const tableNoms = getTableNominals();
    const limit = G.nakiGiveToHandLimit || 0;
    if (tableNoms.has(cardNominal(card))) {
      const idx = UI.selectedCards.indexOf(card.id);
      if (idx === -1) {
        if (UI.selectedCards.length < limit) UI.selectedCards.push(card.id);
      } else {
        UI.selectedCards.splice(idx, 1);
      }
      renderHumanHand();
      renderActionButtons();
    }
  } else if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length === 0 && G.nakiPending.length > 0 && G.nakiPending[0] === hi && !G.nakiJokerMode) {
    // Multi-select in nakidyvanie phase
    const scoreNom = SCORE_LADDER[G.players[G.defenderIdx].score];
    if (cardNominal(card) === scoreNom) {
      const idx = UI.selectedCards.indexOf(card.id);
      if (idx === -1) UI.selectedCards.push(card.id);
      else UI.selectedCards.splice(idx, 1);
      renderHumanHand();
      renderActionButtons();
    }
  } else if (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing) {
    // Right neighbor throwing
    if (nominalOnTable(cardNominal(card)) && G.tablePairs.length < getAttackLimit()) {
      UI.selectedCards = [];
      mpAction('throw', { playerIdx: hi, cardId: card.id },
        () => { saveUndoState(); doThrow(hi, card); });
    }
  } else if (G.phase === 'defense') {
    if (UI.selectedAttackPairIdx !== null) {
      // Try to defend selected attack pair with this card
      const pair = G.tablePairs[UI.selectedAttackPairIdx];
      if (pair && !pair.defense && canBeat(pair.attack, card, G.trumpSuit)) {
        const atkPairIdx = UI.selectedAttackPairIdx;
        UI.selectedAttackPairIdx = null;
        UI.selectedCards = [];
        mpAction('defense', { playerIdx: hi, attackPairIdx: atkPairIdx, defenseCardId: card.id },
          () => { saveUndoState(); doDefend(hi, atkPairIdx, card); });
        return;
      }
    }
    // Select this card and look for matching attack pair
    UI.selectedCards = [card.id];
    // Auto-select first unbeaten pair this card can beat
    for (let i = 0; i < G.tablePairs.length; i++) {
      const pair = G.tablePairs[i];
      if (!pair.defense && canBeat(pair.attack, card, G.trumpSuit)) {
        UI.selectedAttackPairIdx = i;
        break;
      }
    }
    renderTable();
    renderHumanHand();
  }
}

function selectAttackPair(pairIdx) {
  UI.selectedAttackPairIdx = pairIdx;
  // If a card is already selected, try to defend
  if (UI.selectedCards.length > 0) {
    const hi = humanPlayerIdx();
    const card = G.players[hi].hand.find(c => c.id === UI.selectedCards[0]);
    if (card) {
      const pair = G.tablePairs[pairIdx];
      if (pair && !pair.defense && canBeat(pair.attack, card, G.trumpSuit)) {
        UI.selectedAttackPairIdx = null;
        UI.selectedCards = [];
        mpAction('defense', { playerIdx: hi, attackPairIdx: pairIdx, defenseCardId: card.id },
          () => { saveUndoState(); doDefend(hi, pairIdx, card); });
        return;
      }
    }
  }
  renderTable();
  renderHumanHand();
}

function getNextBotActionDescription() {
  if (!G) return 'бот';
  const phase = G.phase;
  if (phase === 'attack') {
    if (G.attackDone && G.rightNeighborThrowing) {
      const rn = rightNeighborOfDefender();
      return `${G.players[rn]?.name} — правый сосед`;
    }
    if (!G.attackDone) return `${G.players[leftThrowerIdx()]?.name} — атака`;
  }
  if (phase === 'defense') return `${G.players[G.defenderIdx]?.name} — защита`;
  if (phase === 'nakidyvanie') {
    if (G.nakiGiveToHandPending.length > 0) return `${G.players[G.nakiGiveToHandPending[0]]?.name} — дать в руку`;
    if (G.nakiPending.length > 0) return `${G.players[G.nakiPending[0]]?.name} — накидывание`;
  }
  return 'бот';
}

function renderActionButtons() {
  const container = document.getElementById('action-buttons');
  container.innerHTML = '';
  if (!G || G.gameOver) return;

  const hi = humanPlayerIdx();

  // Show "Отменить" button if undo state exists (regardless of whose turn it is)
  if (undoState !== null) {
    container.appendChild(btn('Отменить', 'btn-pass btn-undo', () => {
      showUndoApproval();
    }));
  }

  // Debug mode: show "allow bot" button when it's the bot's turn
  if (debugMode && pendingBotAction && !isHumanTurn()) {
    const desc = getNextBotActionDescription();
    container.appendChild(btn(`▶ Разрешить: ${desc}`, 'btn-debug', () => {
      const action = pendingBotAction;
      pendingBotAction = null;
      action();
    }));
    return;
  }

  if (hi === -1 || !isHumanTurn()) return;

  const p = G.players[hi];

  if (G.phase === 'attack' && !G.attackDone && leftThrowerIdx() === hi) {
    // Throw/attack button: only if table has cards and nominal matches, or no cards yet
    const selectedCards = UI.selectedCards.map(id => p.hand.find(c => c.id === id)).filter(Boolean);
    const canAtk = selectedCards.length > 0 && canAttackWith(selectedCards);

    if (G.tablePairs.length === 0) {
      // Initial attack
      const attackBtn = btn('Атаковать', 'btn-attack', () => {
        if (canAtk) {
          UI.selectedCards = [];
          mpAction('attack', { playerIdx: hi, cardIds: selectedCards.map(c => c.id) },
            () => { saveUndoState(); doAttack(hi, selectedCards); });
        }
      });
      if (!canAtk) attackBtn.disabled = true;
      container.appendChild(attackBtn);
    } else if (allBeaten() || G.defenderTaking) {
      // Can throw more OR declare done
      const throwBtn = btn('Подкинуть', 'btn-attack', () => {
        if (canAtk) {
          UI.selectedCards = [];
          mpAction('throw', { playerIdx: hi, cardId: selectedCards[0].id },
            () => { saveUndoState(); doThrow(hi, selectedCards[0]); });
        }
      });
      if (!canAtk) throwBtn.disabled = true;
      container.appendChild(throwBtn);
      container.appendChild(btn('Готово', 'btn-done', () => {
        UI.selectedCards = [];
        mpAction('attackDone', { playerIdx: hi }, () => { declareAttackDone(hi); });
      }));
    }
  }

  if (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing && rightNeighborOfDefender() === hi) {
    // Right neighbor can throw or pass
    const selectedCards = UI.selectedCards.map(id => p.hand.find(c => c.id === id)).filter(Boolean);
    const canThrow = selectedCards.length === 1 && nominalOnTable(cardNominal(selectedCards[0]))
      && G.tablePairs.length < getAttackLimit();
    const throwBtn = btn('Подкинуть', 'btn-attack', () => {
      if (canThrow) {
        UI.selectedCards = [];
        mpAction('throw', { playerIdx: hi, cardId: selectedCards[0].id },
          () => { saveUndoState(); doThrow(hi, selectedCards[0]); });
      }
    });
    if (!canThrow) throwBtn.disabled = true;
    container.appendChild(throwBtn);
    container.appendChild(btn('Пас', 'btn-pass', () => {
      UI.selectedCards = [];
      mpAction('rightNeighborPass', { playerIdx: hi }, () => { doRightNeighborPass(hi); });
    }));
  }

  if (G.phase === 'defense' && hi === G.defenderIdx) {
    // Transfer buttons — one per candidate card so player can choose which to use
    const transferCandidates = p.hand.filter(c => canTransfer(c, G.tablePairs, G.trumpSuit));
    transferCandidates.forEach(tc => {
      container.appendChild(btn(`Перевод ${cardStr(tc)}`, 'btn-transfer', () => {
        UI.selectedCards = [];
        mpAction('transfer', { playerIdx: hi, cardId: tc.id },
          () => { saveUndoState(); doTransfer(hi, tc); });
      }));
    });
    // Take button
    container.appendChild(btn('Взять', 'btn-take', () => {
      UI.selectedCards = [];
      UI.selectedAttackPairIdx = null;
      mpAction('take', {}, () => { saveUndoState(); doTake(hi); });
    }));
  }

  // Phase 1: Give-to-hand
  if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length > 0 && G.nakiGiveToHandPending[0] === hi) {
    const tableNoms = getTableNominals();
    const giveMatches = p.hand.filter(c => tableNoms.has(cardNominal(c)));
    const limit = G.nakiGiveToHandLimit || 0;
    if (limit > 0 && giveMatches.length > 0) {
      const selected = giveMatches.filter(c => UI.selectedCards.includes(c.id));
      const toGive = selected.length > 0 ? selected : giveMatches.slice(0, limit);
      const label = selected.length > 0 ? `Дать в руку (${selected.length})` : `Дать все в руку (${Math.min(giveMatches.length, limit)})`;
      container.appendChild(btn(label, 'btn-transfer', () => {
        UI.selectedCards = [];
        mpAction('nakiGiveToHand', { throwerIdx: hi, cardIds: toGive.map(c => c.id) },
          () => { saveUndoState(); doNakiGiveToHand(hi, toGive); });
      }));
    }
    container.appendChild(btn('Пас', 'btn-pass', () => {
      UI.selectedCards = [];
      mpAction('nakiGiveToHandPass', { throwerIdx: hi }, () => { doNakiGiveToHandPass(hi); });
    }));
  }

  // Phase 2: Nakidyvanie (score)
  if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length === 0 && G.nakiPending.length > 0 && G.nakiPending[0] === hi) {
    const defIdx = G.defenderIdx;
    const scoreNom = SCORE_LADDER[G.players[defIdx].score];

    if (G.nakiJokerMode) {
      const jokers = p.hand.filter(c => isJoker(c));
      jokers.forEach(joker => {
        container.appendChild(btn(`Накинуть ${cardStr(joker)}`, 'btn-throw', () => {
          mpAction('nakiThrow', { throwerIdx: hi, cardId: joker.id },
            () => { saveUndoState(); doNakiThrow(hi, joker); });
        }));
      });
    } else {
      const matches = p.hand.filter(c => cardNominal(c) === scoreNom);
      const canThrowMultiple = isUniqueLowestRankPlayer(defIdx);
      if (matches.length > 0) {
        if (canThrowMultiple) {
          const selected = matches.filter(c => UI.selectedCards.includes(c.id));
          container.appendChild(btn(
            selected.length > 0 ? `Накинуть (${selected.length})` : `Накинуть все (${matches.length})`,
            'btn-throw',
            () => {
              const cards = selected.length > 0 ? selected : matches;
              UI.selectedCards = [];
              mpAction('nakiThrowMultiple', { throwerIdx: hi, cardIds: cards.map(c => c.id) },
                () => { saveUndoState(); doNakiThrowMultiple(hi, cards); });
            }
          ));
        } else {
          matches.forEach(mc => {
            container.appendChild(btn(`Накинуть ${cardStr(mc)}`, 'btn-throw', () => {
              UI.selectedCards = [];
              mpAction('nakiThrow', { throwerIdx: hi, cardId: mc.id },
                () => { saveUndoState(); doNakiThrow(hi, mc); });
            }));
          });
        }
      }
    }
    container.appendChild(btn('Передать', 'btn-pass', () => {
      UI.selectedCards = [];
      doNakiPass(hi);
    }));
  }
}

function btn(text, cls, onClick) {
  const b = document.createElement('button');
  b.className = 'action-btn ' + cls;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function renderPhase() {
  const el = document.getElementById('phase-indicator');
  const hint = document.getElementById('action-hint');

  const phases = {
    attack: 'Атака',
    defense: 'Защита',
    nakidyvanie: 'Накидывание',
    draw: 'Добор карт',
    roundover: 'Конец раунда',
    gameover: 'Игра окончена',
  };
  el.textContent = phases[G.phase] || G.phase;

  let hintText = '';
  const hi = humanPlayerIdx();

  if (hi !== -1 && isHumanTurn()) {
    if (G.phase === 'attack' && !G.attackDone && leftThrowerIdx() === hi) {
      if (G.defenderTaking) hintText = 'Защищающийся берёт — можете подкинуть ещё или нажать Готово';
      else if (G.tablePairs.length === 0) hintText = 'Выберите карты для атаки';
      else if (allBeaten()) hintText = 'Можете подкинуть ещё или нажать Готово';
    } else if (G.phase === 'defense' && G.defenderIdx === hi) {
      if (UI.selectedAttackPairIdx !== null) hintText = 'Выберите карту для отбоя';
      else hintText = 'Выберите карту атаки, затем карту для отбоя';
    } else if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length > 0 && G.nakiGiveToHandPending[0] === hi) {
      hintText = 'Можете докинуть карты защищающемуся в руку';
    } else if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length === 0 && G.nakiPending.length > 0 && G.nakiPending[0] === hi) {
      hintText = 'Ваша очередь накидывать';
    }
  } else if (hi !== -1 && !isHumanTurn()) {
    const cur = G.phase === 'attack' ? G.players[leftThrowerIdx()]?.name :
                G.phase === 'defense' ? G.players[G.defenderIdx]?.name : '';
    if (cur) hintText = `Ход: ${cur}`;
  }
  hint.textContent = hintText;
}

// ─── CARD RENDERING ──────────────────────────────────────────
function makeCardElement(card, faceUp = true) {
  const el = document.createElement('div');
  el.className = 'card';
  if (!faceUp) {
    el.classList.add('face-down');
    return el;
  }

  if (isJoker(card)) {
    el.classList.add('joker-card');
    if (isPictureJoker(card)) {
      el.classList.add('picture-joker');
      el.innerHTML = `<div class="card-rank-suit-top">★</div><div class="card-center">🃏</div><div class="card-rank-suit-bottom">★</div>`;
    } else {
      const sym = card.jokerType === 'deuce_spades' ? '♠' : '♣';
      el.innerHTML = `<div class="card-rank-suit-top">2${sym}*</div><div class="card-center">★</div><div class="card-rank-suit-bottom">2${sym}*</div>`;
    }
  } else {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    el.classList.add(isRed ? 'red' : 'black');
    const sym = SUIT_SYM[card.suit];
    el.innerHTML = `
      <div class="card-rank-suit-top">${card.rank}<br>${sym}</div>
      <div class="card-center">${sym}</div>
      <div class="card-rank-suit-bottom">${card.rank}<br>${sym}</div>
    `;
  }
  return el;
}

function cardInnerHTML(card, small = false) {
  if (!card) return '';
  if (isJoker(card)) {
    return `<span style="color:#7c3aed;font-weight:800;font-size:${small?'0.55rem':'0.7rem'}">🃏</span>`;
  }
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const color = isRed ? '#cc2200' : '#1a1a1a';
  return `<span style="color:${color};font-weight:800;font-size:${small?'0.55rem':'0.7rem'}">${card.rank}${SUIT_SYM[card.suit]}</span>`;
}

function cardStr(card) {
  if (!card) return '?';
  if (isPictureJoker(card)) return '🃏';
  if (isDeuceJoker(card)) return `2${card.jokerType === 'deuce_spades' ? '♠' : '♣'}*`;
  return `${card.rank}${SUIT_SYM[card.suit]}`;
}

// ─── LOGGING ─────────────────────────────────────────────────
function addLog(msg, type = 'system', skipState = false) {
  const log = document.getElementById('game-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  el.textContent = msg;
  log.appendChild(el);
  // Only auto-scroll if user hasn't scrolled up manually
  const isNearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  if (isNearBottom) log.scrollTop = log.scrollHeight;
  // Keep log trim
  while (log.children.length > 120) log.removeChild(log.firstChild);
  updateLogSlider();
  // Store in G for multiplayer sync (only on host/solo, not when replaying on client)
  if (!skipState && typeof G !== 'undefined' && G) {
    if (!G.logEntries) G.logEntries = [];
    G.logEntries.push({ msg, type });
  }
}

// ─── LOG SLIDER ───────────────────────────────────────────────
function updateLogSlider() {
  const log = document.getElementById('game-log');
  const thumb = document.getElementById('log-slider-thumb');
  const track = document.getElementById('log-slider-track');
  if (!log || !thumb || !track) return;

  const trackH = track.clientHeight;
  const scrollable = log.scrollHeight - log.clientHeight;

  if (scrollable <= 0) {
    thumb.style.height = trackH + 'px';
    thumb.style.top = '0px';
    return;
  }

  const thumbH = Math.max(24, (log.clientHeight / log.scrollHeight) * trackH);
  const maxTop = trackH - thumbH;
  const top = (log.scrollTop / scrollable) * maxTop;
  thumb.style.height = thumbH + 'px';
  thumb.style.top = top + 'px';
}

function initLogSlider() {
  const log = document.getElementById('game-log');
  const thumb = document.getElementById('log-slider-thumb');
  const track = document.getElementById('log-slider-track');
  const slider = document.getElementById('log-slider');
  if (!log || !thumb || !track || !slider) return;

  // Sync thumb when log scrolls natively
  log.addEventListener('scroll', updateLogSlider);

  // Mouse wheel on slider scrolls the log
  slider.addEventListener('wheel', (e) => {
    e.preventDefault();
    log.scrollTop += e.deltaY;
  }, { passive: false });

  // Click on track jumps to that position
  track.addEventListener('mousedown', (e) => {
    if (e.target === thumb) return;
    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const thumbH = thumb.offsetHeight;
    const maxTop = track.clientHeight - thumbH;
    const ratio = Math.max(0, Math.min(1, (clickY - thumbH / 2) / maxTop));
    log.scrollTop = ratio * (log.scrollHeight - log.clientHeight);
  });

  // Drag thumb
  let dragging = false, startY = 0, startScrollTop = 0;
  thumb.addEventListener('mousedown', (e) => {
    dragging = true;
    startY = e.clientY;
    startScrollTop = log.scrollTop;
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const trackH = track.clientHeight;
    const thumbH = thumb.offsetHeight;
    const maxTop = trackH - thumbH;
    if (maxTop <= 0) return;
    const dy = e.clientY - startY;
    const scrollable = log.scrollHeight - log.clientHeight;
    log.scrollTop = startScrollTop + (dy / maxTop) * scrollable;
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  updateLogSlider();
}

// ─── UTILS ───────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupUI();
  initLogSlider();
});
