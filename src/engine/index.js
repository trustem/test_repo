// ═══════════════════════════════════════════════════════════════
//  БАРДАК — Game Engine  (pure logic, no DOM)
// ═══════════════════════════════════════════════════════════════

// ─── CONSTANTS ───────────────────────────────────────────────
export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
export const SUIT_SYM = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
export const RANKS = ['6','7','8','9','10','J','Q','K','A'];
export const RANK_VAL = { '6':0,'7':1,'8':2,'9':3,'10':4,'J':5,'Q':6,'K':7,'A':8 };
export const SCORE_LADDER = ['6','7','8','9','10','J','Q','K','A','joker'];
const BOT_DELAY = 850;

// ─── CARD FACTORY ────────────────────────────────────────────
export function makeCard(rank, suit) {
  return { rank, suit, id: `${rank}_${suit}` };
}
export function makeJoker(type) {
  const id = `joker_${type}_${Math.random().toString(36).slice(2,6)}`;
  return { rank: 'joker', suit: type, id, jokerType: type };
}
export function isJoker(card) { return card.rank === 'joker'; }
export function isPictureJoker(card) { return isJoker(card) && card.jokerType === 'picture'; }
export function isDeuceJoker(card) {
  return isJoker(card) && (card.jokerType === 'deuce_spades' || card.jokerType === 'deuce_clubs');
}
export function cardNominal(card) {
  if (isJoker(card)) return 'joker';
  return card.rank;
}
export function cardLabel(card) {
  if (isPictureJoker(card)) return { top: '★', center: '🃏', suit: '' };
  if (isDeuceJoker(card)) {
    const sym = card.jokerType === 'deuce_spades' ? '♠' : '♣';
    return { top: `2${sym}*`, center: '★', suit: sym };
  }
  return { top: card.rank, center: SUIT_SYM[card.suit], suit: SUIT_SYM[card.suit] };
}
export function cardStr(card) {
  if (!card) return '?';
  if (isPictureJoker(card)) return '🃏';
  if (isDeuceJoker(card)) return `2${card.jokerType === 'deuce_spades' ? '♠' : '♣'}*`;
  return `${card.rank}${SUIT_SYM[card.suit]}`;
}

export function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(makeCard(rank, suit));
  }
  deck.push(makeJoker('picture'));
  deck.push(makeJoker('picture'));
  deck.push(makeJoker('deuce_spades'));
  deck.push(makeJoker('deuce_clubs'));
  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── GAME STATE ───────────────────────────────────────────────
export function newGameState(playerDefs) {
  const players = playerDefs.map((def, i) => ({
    id: i,
    name: def.name,
    isBot: def.isBot,
    hand: [],
    secretCard: null,
    secretTaken: false,
    secretRevealed: false,
    score: 0,
    exited: false,
    exitOrder: null,
    nakiCards: [],
  }));
  return {
    players,
    deck: [],
    discardPile: [],
    trumpSuit: null,
    trumpCard: null,
    secretTrumpCard: null,
    trumpRevealed: false,
    phase: 'deal',
    attackerIdx: null,
    defenderIdx: null,
    tablePairs: [],
    firstBeaten: false,
    transferChain: [],
    attackDone: false,
    rightNeighborThrowing: false,
    throwers: [],
    nakiPending: [],
    nakiDecisiveIdx: null,
    nakiJokerMode: false,
    nakiJokerThrowers: [],
    nakiGiveToHandPending: [],
    nakiGiveToHandLimit: 0,
    defenderTaking: false,
    transferThrowQueue: [],
    transferThrowPhase: false,
    humanTransferThrowPassed: false,
    roundNum: 0,
    exitFirstIdx: null,
    jokerThrows: [],
    roundLoserIdx: null,
    gameOver: false,
    gameOverRank: null,
    gameOverPlayer: null,
    botTimer: null,
    logEntries: [],
    humanJustTook: false,
    pendingNewTrump: null,
    trumpAnnouncement: null,
  };
}

// ─── ENGINE FACTORY ──────────────────────────────────────────
// Creates a game engine instance.
// onUpdate(G, UI, logEntry?) is called after every state change.
// onGameOver(G) is called when game ends.
// onLog(msg, type) is called for each new log entry.
export function createEngine({ onUpdate, onGameOver, onLog, getMpSeatIndex }) {
  let G = null;
  let UI = { selectedCards: [], selectedAttackPairIdx: null };
  let undoState = null;
  let debugMode = false;
  let pendingBotAction = null;

  function humanPlayerIdx() {
    if (typeof getMpSeatIndex === 'function') {
      const seat = getMpSeatIndex();
      if (seat !== null && seat !== undefined) return seat;
    }
    if (!G) return -1;
    return G.players.findIndex(p => !p.isBot);
  }

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
    return fromIdx;
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

  function leftThrowerIdx() { return prevActiveIdx(G.defenderIdx); }

  function rightNeighborOfDefender() {
    const n = G.players.length;
    let idx = (G.defenderIdx + 1) % n;
    let tries = 0;
    while (tries < n) {
      if (!G.players[idx].exited && idx !== G.defenderIdx) return idx;
      idx = (idx + 1) % n;
      tries++;
    }
    return G.attackerIdx;
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

  function addLog(msg, type = 'system') {
    if (G) {
      if (!G.logEntries) G.logEntries = [];
      G.logEntries.push({ msg, type, id: Date.now() + Math.random() });
    }
    if (onLog) onLog(msg, type);
  }

  function notify() {
    if (onUpdate) onUpdate({ ...G }, { ...UI });
  }

  function canBeat(attackCard, defenseCard, trumpSuit) {
    if (isJoker(defenseCard)) {
      if (isPictureJoker(defenseCard) && isPictureJoker(attackCard)) return true;
      if (isPictureJoker(defenseCard) && isDeuceJoker(attackCard)) return true;
      if (isDeuceJoker(defenseCard)) {
        if (isPictureJoker(attackCard)) return false;
        return true;
      }
      return true;
    }
    if (isJoker(attackCard)) return false;
    const defSuit = defenseCard.suit;
    const atkSuit = attackCard.suit;
    const untouchableSuit = (trumpSuit === 'spades') ? 'clubs' : 'spades';
    if (atkSuit === untouchableSuit) {
      if (defSuit === untouchableSuit) return RANK_VAL[defenseCard.rank] > RANK_VAL[attackCard.rank];
      return false;
    }
    if (defSuit === atkSuit) return RANK_VAL[defenseCard.rank] > RANK_VAL[attackCard.rank];
    if (defSuit === trumpSuit && atkSuit !== trumpSuit) return true;
    return false;
  }

  function canTransfer(transferCard, tablePairs) {
    if (!tablePairs || tablePairs.length === 0) return false;
    if (tablePairs.some(p => p.defense !== null)) return false;
    const targetNominal = cardNominal(tablePairs[0].attack);
    for (const pair of tablePairs) {
      if (cardNominal(pair.attack) !== targetNominal) return false;
    }
    if (cardNominal(transferCard) !== targetNominal) return false;
    const newDefenderIdx = nextActiveIdx(G.defenderIdx);
    const newDefender = G.players[newDefenderIdx];
    if (newDefender && newDefender.hand.length < tablePairs.length + 1) return false;
    return true;
  }

  function nominalOnTable(nominal) {
    for (const pair of G.tablePairs) {
      if (cardNominal(pair.attack) === nominal) return true;
      if (pair.defense && cardNominal(pair.defense) === nominal) return true;
    }
    return false;
  }

  function getTableNominals() {
    return new Set(G.tablePairs.filter(p => !p.isNaki).map(p => cardNominal(p.attack)));
  }

  function allBeaten() {
    return G.tablePairs.length > 0 && G.tablePairs.every(p => p.defense !== null);
  }

  function hasUnbeaten() {
    return G.tablePairs.some(p => p.defense === null);
  }

  function getAttackLimit() {
    const defender = G.players[G.defenderIdx];
    if (!defender) return 6;
    const defenseCardsPlayed = G.tablePairs.filter(p => p.defense && p.defender === G.defenderIdx).length;
    const defHandCount = defender.hand.length + defenseCardsPlayed;
    const max = G.firstBeaten ? 6 : 5;
    return Math.min(max, defHandCount);
  }

  function canAttackWith(cards) {
    if (cards.length === 0) return false;
    const nom = cardNominal(cards[0]);
    if (!cards.every(c => cardNominal(c) === nom)) return false;
    if (G.tablePairs.length + cards.length > getAttackLimit()) return false;
    if (G.tablePairs.length > 0 && !nominalOnTable(nom)) return false;
    return true;
  }

  function removeFromHand(playerIdx, card) {
    const p = G.players[playerIdx];
    const idx = p.hand.findIndex(c => c.id === card.id);
    if (idx !== -1) p.hand.splice(idx, 1);
  }

  function sortHand(playerIdx) {
    const p = G.players[playerIdx];
    if (!p || !G.trumpSuit) return;
    const trump = G.trumpSuit;
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
      const va = isJoker(a) ? 99 : RANK_VAL[a.rank];
      const vb = isJoker(b) ? 99 : RANK_VAL[b.rank];
      if (va !== vb) return vb - va;
      const sa = suitOrder[a.suit] ?? 9;
      const sb = suitOrder[b.suit] ?? 9;
      return sa - sb;
    });
  }

  function sortAllHands() {
    G.players.forEach((_, i) => sortHand(i));
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

  function scheduleBot() {
    if (G.gameOver) return;
    clearTimeout(G.botTimer);
    if (debugMode && !isHumanTurn()) {
      pendingBotAction = doBotAction;
      notify();
    } else {
      pendingBotAction = null;
      G.botTimer = setTimeout(doBotAction, BOT_DELAY);
    }
  }

  function drawUpTo6(playerIdx) {
    const p = G.players[playerIdx];
    if (p.exited) return;
    while (p.hand.length < 6 && G.deck.length > 0) {
      const card = G.deck.pop();
      if (!card) break;
      if (G.trumpCard && card.id === G.trumpCard.id) {
        p.hand.push(card);
        if (G.secretTrumpCard) {
          if (isJoker(G.secretTrumpCard)) {
            addLog(`Секретный козырь — джокер! ${p.name} получает джокер.`, 'system');
            p.hand.push(G.secretTrumpCard);
            G.trumpAnnouncement = { suit: G.trumpSuit, key: Date.now() };
            G.secretTrumpCard = null;
          } else {
            addLog(`Козырная карта взята. Новый козырь: ${SUIT_SYM[G.secretTrumpCard.suit]}`, 'system');
            G.pendingNewTrump = G.secretTrumpCard;
            G.trumpAnnouncement = { suit: G.secretTrumpCard.suit, key: Date.now() };
            G.secretTrumpCard = null;
          }
        }
        G.trumpCard = null;
      } else {
        p.hand.push(card);
      }
    }
    if (p.hand.length === 0 && !p.secretTaken && p.secretCard) {
      p.hand.push(p.secretCard);
      p.secretTaken = true;
      p.secretRevealed = false;
      addLog(`${p.name} берёт секретную карту`, 'system');
      G.trumpAnnouncement = { suit: G.trumpSuit, key: Date.now() };
    }
    sortHand(playerIdx);
  }

  function checkExits() {
    G.players.forEach((p, i) => {
      if (!p.exited && p.hand.length === 0 && G.deck.length === 0 && (p.secretTaken || !p.secretCard)) {
        p.exited = true;
        p.exitOrder = activePlayers().filter(x => x.id !== i).length;
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

  function isLastAttackAllEights() {
    const eights = G.tablePairs.filter(p => !p.isNaki && cardNominal(p.attack) === '8');
    return eights.length === 4 && G.tablePairs.filter(p => !p.isNaki).length === 4;
  }

  function checkGameEnd(targetIdx) {
    const p = G.players[targetIdx];
    const scoreNom = SCORE_LADDER[p.score];
    const isLoser = (G.roundLoserIdx === targetIdx);
    const lastAttack8 = isLastAttackAllEights();
    const wasLastRemaining = (activePlayers().length === 0 || (activePlayers().length === 1 && G.players[targetIdx].exited));
    const jokerThrownToTarget = G.jokerThrows.some(j => j.toIdx === targetIdx);

    if (isLoser && jokerThrownToTarget) {
      const rank = (lastAttack8 && wasLastRemaining) ? 'Супермегаотсосал' : 'Супермегапроебал';
      G.gameOver = true; G.gameOverRank = rank; G.gameOverPlayer = targetIdx;
      if (onGameOver) onGameOver({ ...G });
      return;
    }
    if (isLoser && scoreNom === 'joker') {
      const rank = (lastAttack8 && wasLastRemaining) ? 'Суперотсосал' : 'Суперпроебал';
      G.gameOver = true; G.gameOverRank = rank; G.gameOverPlayer = targetIdx;
      if (onGameOver) onGameOver({ ...G });
      return;
    }
    if (jokerThrownToTarget && !isLoser && G.exitFirstIdx !== targetIdx) {
      G.gameOver = true; G.gameOverRank = 'Проебал'; G.gameOverPlayer = targetIdx;
      if (onGameOver) onGameOver({ ...G });
    }
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
      if (!G.gameOver) endRound();
    }
  }

  function endRound() {
    G.phase = 'roundover';
    addLog(`=== Конец раунда ${G.roundNum} ===`, 'round');
    notify();
    setTimeout(() => { if (!G.gameOver) dealRound(); }, 2000);
  }

  // ─── DEAL ────────────────────────────────────────────────────
  function dealRound() {
    G.roundNum++;
    addLog(`=== Раунд ${G.roundNum} ===`, 'round');
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
    G.humanJustTook = false;

    G.players.forEach(p => {
      p.hand = [];
      p.secretCard = null;
      p.secretTaken = false;
      p.secretRevealed = false;
      p.exited = false;
      p.exitOrder = null;
      p.nakiCards = [];
    });

    const activePl = G.players;
    for (let i = 0; i < 6; i++) {
      for (const p of activePl) {
        const card = G.deck.pop();
        if (card) p.hand.push(card);
      }
    }
    for (const p of activePl) {
      const card = G.deck.pop();
      if (card) p.secretCard = card;
    }

    G.secretTrumpCard = G.deck.shift() || null;
    G.trumpCard = G.deck[0] || null;

    if (G.trumpCard && isJoker(G.trumpCard)) {
      const suitIdx = Math.floor(Math.random() * 4);
      G.trumpSuit = SUITS[suitIdx];
      addLog(`Козырной джокер! Выпал козырь: ${SUIT_SYM[G.trumpSuit]}`, 'system');
    } else if (G.trumpCard) {
      G.trumpSuit = G.trumpCard.suit;
    } else {
      G.trumpSuit = SUITS[Math.floor(Math.random() * 4)];
    }

    G.attackerIdx = findFirstAttacker();
    G.defenderIdx = nextActiveIdx(G.attackerIdx);
    addLog(`Козырь: ${SUIT_SYM[G.trumpSuit]}. Первый атакует: ${G.players[G.attackerIdx].name}`, 'system');
    sortAllHands();
    G.phase = 'attack';
    notify();
    scheduleBot();
  }

  // ─── ACTIONS ─────────────────────────────────────────────────
  function doAttack(playerIdx, cards) {
    const allowed = getAttackLimit() - G.tablePairs.length;
    if (allowed <= 0) return false;
    cards = cards.slice(0, allowed);
    addLog(`${G.players[playerIdx].name} атакует: ${cards.map(cardStr).join(', ')}`, 'attack');
    for (const card of cards) {
      removeFromHand(playerIdx, card);
      G.tablePairs.push({ attack: card, defense: null, attacker: playerIdx });
    }
    G.phase = 'defense';
    notify();
    scheduleBot();
  }

  function doDefend(defenderIdx, attackPairIdx, defenseCard) {
    const pair = G.tablePairs[attackPairIdx];
    if (!pair || !canBeat(pair.attack, defenseCard, G.trumpSuit)) return false;
    pair.defense = defenseCard;
    pair.defender = defenderIdx;
    removeFromHand(defenderIdx, defenseCard);
    addLog(`${G.players[defenderIdx].name} отбивает ${cardStr(pair.attack)} → ${cardStr(defenseCard)}`, 'defense');
    const dp = G.players[defenderIdx];
    if (dp.hand.length === 0 && dp.secretCard && !dp.secretTaken) {
      const sc = dp.secretCard;
      dp.hand.push(sc);
      dp.secretCard = null;
      dp.secretTaken = true;
      dp.secretRevealed = false;
      sortHand(defenderIdx);
      addLog(`${dp.name} открывает потайную карту: ${cardStr(sc)}`, 'system');
      G.trumpAnnouncement = { suit: G.trumpSuit, key: Date.now() };
    }
    if (allBeaten()) G.phase = 'attack';
    notify();
    scheduleBot();
    return true;
  }

  function doTransfer(defenderIdx, card) {
    addLog(`${G.players[defenderIdx].name} переводит: ${cardStr(card)}`, 'transfer');
    removeFromHand(defenderIdx, card);
    G.tablePairs.push({ attack: card, defense: null, attacker: defenderIdx, isTransfer: true });
    G.transferChain.push(defenderIdx);
    const newDefender = nextActiveIdx(G.defenderIdx);
    G.defenderIdx = newDefender;
    addLog(`Теперь защищается: ${G.players[newDefender].name}`, 'transfer');
    G.phase = 'defense';
    notify();
    scheduleBot();
  }

  function doTake(defenderIdx) {
    addLog(`${G.players[defenderIdx].name} берёт карты`, 'take');
    G.nakiDecisiveIdx = findDecisiveCard();
    const hi = humanPlayerIdx();
    if (defenderIdx === hi) G.humanJustTook = true;
    const canThrowMore = G.tablePairs.length < getAttackLimit();
    const throwingNotDone = !G.attackDone || G.rightNeighborThrowing;
    if (canThrowMore && throwingNotDone) {
      G.defenderTaking = true;
      G.phase = 'attack';
      notify();
      scheduleBot();
    } else {
      G.phase = 'nakidyvanie';
      setupNakidyvanie(defenderIdx);
    }
  }

  function findDecisiveCard() {
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
    G.firstBeaten = true;
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
    G.attackerIdx = savedDefenderIdx;
    G.defenderIdx = nextActiveIdx(G.attackerIdx);
    G.phase = 'draw';
    const drawOrder = [];
    const addUniq = idx => { if (!drawOrder.includes(idx)) drawOrder.push(idx); };
    addUniq(savedAttackerIdx);
    for (const idx of savedTransferChain) addUniq(idx);
    for (const idx of savedThrowers) addUniq(idx);
    addUniq(savedDefenderIdx);
    G.players.forEach((p, i) => { if (!p.exited) addUniq(i); });
    for (const idx of drawOrder) drawUpTo6(idx);
    if (G.pendingNewTrump) {
      G.trumpSuit = G.pendingNewTrump.suit;
      G.pendingNewTrump = null;
      sortAllHands();
    }
    G.phase = 'attack';
    checkExits();
    revalidateAttackerDefender();
    notify();
    if (!G.gameOver) scheduleBot();
  }

  function doThrow(throwerIdx, card) {
    if (G.tablePairs.length >= getAttackLimit()) return false;
    UI.selectedCards = [];
    addLog(`${G.players[throwerIdx].name} подкидывает: ${cardStr(card)}`, 'attack');
    removeFromHand(throwerIdx, card);
    G.tablePairs.push({ attack: card, defense: null, attacker: throwerIdx });
    if (!G.throwers.includes(throwerIdx)) G.throwers.push(throwerIdx);
    G.phase = G.defenderTaking ? 'attack' : 'defense';
    notify();
    scheduleBot();
  }

  function declareAttackDone(playerIdx) {
    if (playerIdx !== leftThrowerIdx()) return;
    if (!G.attackDone) {
      G.attackDone = true;
      addLog(`${G.players[playerIdx].name} завершает атаку`, 'system');
      const rn = rightNeighborOfDefender();
      if (rn !== leftThrowerIdx()) {
        G.rightNeighborThrowing = true;
        G.phase = 'attack';
        notify();
        scheduleBot();
        return;
      }
    }
    G.rightNeighborThrowing = false;
    if (G.defenderTaking) {
      G.phase = 'nakidyvanie';
      setupNakidyvanie(G.defenderIdx);
      return;
    }
    G.transferThrowQueue = [];
    G.transferThrowPhase = false;
    resolveAfterThrowing();
  }

  function doRightNeighborPass(playerIdx) {
    addLog(`${G.players[playerIdx].name} пас (правый сосед)`, 'system');
    G.rightNeighborThrowing = false;
    if (G.defenderTaking) {
      G.phase = 'nakidyvanie';
      setupNakidyvanie(G.defenderIdx);
      return;
    }
    G.transferThrowQueue = [];
    G.transferThrowPhase = false;
    resolveAfterThrowing();
  }

  function resolveAfterThrowing() {
    if (G.defenderTaking) {
      G.phase = 'nakidyvanie';
      setupNakidyvanie(G.defenderIdx);
      return;
    }
    if (hasUnbeaten()) {
      G.phase = 'defense';
      notify();
      scheduleBot();
    } else {
      doDiscard();
    }
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
    const defenseCardsPlayed = G.tablePairs.filter(p => p.defense && p.defender === defenderIdx).length;
    const handOnlyCount = G.players[defenderIdx].hand.length + defenseCardsPlayed;
    const attackCardsOnTable = G.tablePairs.filter(p => !p.isNaki).length;
    G.nakiGiveToHandLimit = Math.max(0, handOnlyCount - attackCardsOnTable);
    G.nakiGiveToHandPending = (G.nakiJokerMode || G.nakiGiveToHandLimit === 0) ? [] : buildGiveToHandOrder(defenderIdx);
    if (G.nakiGiveToHandPending.length > 0) {
      notify();
      scheduleBot();
    } else {
      startNakidyvaniePhase();
    }
  }

  function buildNakiOrder(defenderIdx, scoreNom) {
    const hasCard = idx => !G.players[idx].exited && idx !== defenderIdx && G.players[idx].hand.some(c => cardNominal(c) === scoreNom);
    const order = [];
    const decisive = G.nakiDecisiveIdx;
    if (decisive !== null && decisive !== defenderIdx && hasCard(decisive)) order.push(decisive);
    for (let i = G.transferChain.length - 1; i >= 0; i--) {
      const idx = G.transferChain[i];
      if (!order.includes(idx) && idx !== defenderIdx && hasCard(idx)) order.push(idx);
    }
    if (!order.includes(G.attackerIdx) && G.attackerIdx !== defenderIdx && hasCard(G.attackerIdx)) order.push(G.attackerIdx);
    let cur = nextActiveIdx(G.attackerIdx);
    let count = 0;
    while (count < G.players.length) {
      if (!order.includes(cur) && cur !== defenderIdx && hasCard(cur)) order.push(cur);
      cur = nextActiveIdx(cur);
      count++;
      if (cur === G.attackerIdx) break;
    }
    return order;
  }

  function buildGiveToHandOrder(defenderIdx) {
    const tableNominals = getTableNominals();
    if (tableNominals.size === 0) return [];
    const hasCard = idx => !G.players[idx].exited && idx !== defenderIdx && G.players[idx].hand.some(c => tableNominals.has(cardNominal(c)));
    const leftNeighbor = prevActiveIdx(defenderIdx);
    const rightNeighbor = nextActiveIdx(defenderIdx);
    const order = [];
    if (leftNeighbor !== defenderIdx && hasCard(leftNeighbor)) order.push(leftNeighbor);
    if (rightNeighbor !== defenderIdx && rightNeighbor !== leftNeighbor && hasCard(rightNeighbor)) order.push(rightNeighbor);
    return order;
  }

  function startNakidyvaniePhase() {
    const defenderIdx = G.defenderIdx;
    const defScoreNom = SCORE_LADDER[G.players[defenderIdx].score];
    if (G.nakiJokerMode) {
      G.nakiPending = G.players.filter(p => !p.exited && p.id !== defenderIdx && p.hand.some(c => isJoker(c))).map(p => p.id);
    } else {
      G.nakiPending = buildNakiOrder(defenderIdx, defScoreNom);
    }
    if (G.nakiPending.length === 0) {
      finishNakidyvanie(defenderIdx);
    } else {
      notify();
      scheduleBot();
    }
  }

  function afterNakiPending() { finishNakidyvanie(G.defenderIdx); }

  function doNakiThrow(throwerIdx, card) {
    const defenderIdx = G.defenderIdx;
    addLog(`${G.players[throwerIdx].name} накидывает ${cardStr(card)} → ${G.players[defenderIdx].name}`, 'take');
    if (isJoker(card)) {
      G.jokerThrows.push({ fromIdx: throwerIdx, toIdx: defenderIdx });
      G.nakiJokerThrowers.push(throwerIdx);
      G.players[defenderIdx].score = Math.min(G.players[defenderIdx].score + 1, SCORE_LADDER.length - 1);
      removeFromHand(throwerIdx, card);
      G.players[defenderIdx].nakiCards.push(card);
      G.nakiPending = G.nakiPending.filter(i => i !== throwerIdx);
    } else {
      G.players[defenderIdx].score = Math.min(G.players[defenderIdx].score + 1, SCORE_LADDER.length - 1);
      removeFromHand(throwerIdx, card);
      G.players[defenderIdx].nakiCards.push(card);
      G.nakiPending = [];
    }
    G.tablePairs.push({ attack: card, defense: null, attacker: throwerIdx, isNaki: true });
    checkGameEnd(defenderIdx);
    if (!G.gameOver) {
      notify(); // show thrown card before finishing
      if (G.nakiPending.length === 0) setTimeout(afterNakiPending, 900);
      else scheduleBot();
    }
  }

  function doNakiThrowMultiple(throwerIdx, cards) {
    if (!cards || cards.length === 0) return;
    const defenderIdx = G.defenderIdx;
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
    notify(); // show all thrown cards before finishing
    setTimeout(afterNakiPending, 900);
  }

  function doNakiPass(playerIdx) {
    G.nakiPending = G.nakiPending.filter(i => i !== playerIdx);
    if (G.nakiPending.length === 0) afterNakiPending();
    else { notify(); scheduleBot(); }
  }

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
      notify();
      scheduleBot();
    }
  }

  function doNakiGiveToHandPass(throwerIdx) {
    G.nakiGiveToHandPending = G.nakiGiveToHandPending.filter(i => i !== throwerIdx);
    if (G.nakiGiveToHandPending.length === 0) startNakidyvaniePhase();
    else { notify(); scheduleBot(); }
  }

  function finishNakidyvanie(defenderIdx) {
    const nakiCards = G.tablePairs.filter(pair => pair.isNaki).map(pair => pair.attack).filter(Boolean);
    const regularCards = G.tablePairs.filter(pair => !pair.isNaki).flatMap(pair => [pair.attack, pair.defense].filter(Boolean));
    G.discardPile.push(...nakiCards);
    G.players[defenderIdx].hand.push(...regularCards);
    sortHand(defenderIdx);
    G.tablePairs = [];
    G.players.forEach(p => { p.nakiCards = []; });
    const savedAttackerIdx = G.attackerIdx;
    G.transferChain = [];
    G.attackDone = false;
    G.rightNeighborThrowing = false;
    G.transferThrowQueue = [];
    G.transferThrowPhase = false;
    G.humanTransferThrowPassed = false;
    G.defenderTaking = false;
    G.throwers = [];
    const drawOrder = [];
    const addUniq = idx => { if (!drawOrder.includes(idx)) drawOrder.push(idx); };
    addUniq(savedAttackerIdx);
    G.players.forEach((p, i) => { if (!p.exited && i !== defenderIdx) addUniq(i); });
    for (const idx of drawOrder) drawUpTo6(idx);
    if (G.pendingNewTrump) {
      G.trumpSuit = G.pendingNewTrump.suit;
      G.pendingNewTrump = null;
      sortAllHands();
    }
    G.attackerIdx = nextActiveIdx(defenderIdx);
    G.defenderIdx = nextActiveIdx(G.attackerIdx);
    G.phase = 'attack';
    checkExits();
    revalidateAttackerDefender();
    notify();
    if (!G.gameOver) scheduleBot();
  }

  // ─── UNDO ─────────────────────────────────────────────────────
  function saveUndoState() {
    undoState = {
      deck: [...G.deck],
      discardPile: [...G.discardPile],
      trumpSuit: G.trumpSuit,
      trumpCard: G.trumpCard ? { ...G.trumpCard } : null,
      secretTrumpCard: G.secretTrumpCard ? { ...G.secretTrumpCard } : null,
      pendingNewTrump: G.pendingNewTrump ? { ...G.pendingNewTrump } : null,
      phase: G.phase,
      attackerIdx: G.attackerIdx,
      defenderIdx: G.defenderIdx,
      tablePairs: G.tablePairs.map(p => ({ ...p })),
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
      jokerThrows: G.jokerThrows.map(j => ({ ...j })),
      roundLoserIdx: G.roundLoserIdx,
      players: G.players.map(p => ({ ...p, hand: [...p.hand], nakiCards: [...p.nakiCards] })),
    };
  }

  function applyUndo() {
    if (!undoState) return;
    const s = undoState;
    undoState = null;
    clearTimeout(G.botTimer);
    Object.assign(G, s);
    UI.selectedCards = [];
    UI.selectedAttackPairIdx = null;
    addLog('Ход отменён', 'system');
    notify();
    scheduleBot();
  }

  // ─── BOT AI ──────────────────────────────────────────────────
  function doBotAction() {
    if (!G || G.gameOver) return;
    if (G.phase === 'deal' || G.phase === 'draw' || G.phase === 'roundover') return;
    if (isHumanTurn()) return;
    undoState = null;
    const phase = G.phase;
    if (phase === 'attack') {
      if (G.attackDone && G.rightNeighborThrowing) {
        const rn = rightNeighborOfDefender();
        if (G.players[rn] && G.players[rn].isBot) botDoRightNeighborThrow(rn);
      } else if (!G.attackDone) {
        const lt = leftThrowerIdx();
        const attacker = G.players[lt];
        if (attacker && attacker.isBot) botDoAttack(lt);
      }
    } else if (phase === 'defense') {
      const defender = G.players[G.defenderIdx];
      if (defender && defender.isBot && !G.defenderTaking) botDoDefense(G.defenderIdx);
    } else if (phase === 'nakidyvanie') {
      if (G.nakiGiveToHandPending.length > 0) {
        const nextIdx = G.nakiGiveToHandPending[0];
        if (G.players[nextIdx] && G.players[nextIdx].isBot) botDoGiveToHand(nextIdx);
      } else if (G.nakiPending.length > 0) {
        const nextIdx = G.nakiPending[0];
        if (G.players[nextIdx] && G.players[nextIdx].isBot) botDoNaki(nextIdx);
      }
    }
  }

  function botDoAttack(botIdx) {
    if (G.tablePairs.length === 0) {
      const card = botChooseAttackCard(botIdx);
      if (card) doAttack(botIdx, [card]);
      else declareAttackDone(botIdx);
    } else if (allBeaten() || G.defenderTaking) {
      const throwable = G.players[botIdx].hand.filter(c => nominalOnTable(cardNominal(c)));
      const toThrow = botChooseThrow(throwable);
      if (toThrow && G.tablePairs.length < getAttackLimit()) doThrow(botIdx, toThrow);
      else declareAttackDone(botIdx);
    } else {
      declareAttackDone(botIdx);
    }
  }

  function botDoRightNeighborThrow(botIdx) {
    const throwable = G.players[botIdx].hand.filter(c => nominalOnTable(cardNominal(c)));
    const toThrow = botChooseThrow(throwable);
    if (toThrow && G.tablePairs.length < getAttackLimit()) doThrow(botIdx, toThrow);
    else doRightNeighborPass(botIdx);
  }

  function botDoDefense(botIdx) {
    const unbeaten = G.tablePairs.filter(p => !p.defense);
    if (unbeaten.length === 0) return;
    const transferCandidates = G.players[botIdx].hand.filter(c => canTransfer(c, G.tablePairs));
    if (transferCandidates.length > 0) { doTransfer(botIdx, transferCandidates[0]); return; }
    for (const pair of unbeaten) {
      const beatCard = botFindBeatCard(botIdx, pair.attack);
      if (beatCard) { doDefend(botIdx, G.tablePairs.indexOf(pair), beatCard); return; }
    }
    doTake(botIdx);
  }

  function botFindBeatCard(botIdx, attackCard) {
    const candidates = G.players[botIdx].hand
      .filter(c => canBeat(attackCard, c, G.trumpSuit))
      .sort((a, b) => {
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
    const nonTrump = hand.filter(c => !isJoker(c) && c.suit !== G.trumpSuit).sort((a, b) => RANK_VAL[a.rank] - RANK_VAL[b.rank]);
    if (nonTrump.length > 0) return nonTrump[0];
    const trumpCards = hand.filter(c => !isJoker(c)).sort((a, b) => RANK_VAL[a.rank] - RANK_VAL[b.rank]);
    if (trumpCards.length > 0) return trumpCards[0];
    return hand[0] || null;
  }

  function botChooseThrow(candidates) {
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      if (isJoker(a) && !isJoker(b)) return 1;
      if (!isJoker(a) && isJoker(b)) return -1;
      const va = isJoker(a) ? 99 : (a.suit === G.trumpSuit ? 50 : 0) + (RANK_VAL[a.rank] || 0);
      const vb = isJoker(b) ? 99 : (b.suit === G.trumpSuit ? 50 : 0) + (RANK_VAL[b.rank] || 0);
      return va - vb;
    })[0];
  }

  function botDoGiveToHand(botIdx) {
    const tableNominals = getTableNominals();
    const scoreNom = SCORE_LADDER[G.players[G.defenderIdx].score];
    const nakiCandidates = G.players[botIdx].hand.filter(c => tableNominals.has(cardNominal(c)) && cardNominal(c) === scoreNom);
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
        if (giveCards.length > 0) doNakiGiveToHand(botIdx, giveCards);
        else doNakiGiveToHandPass(botIdx);
      }
    }, BOT_DELAY);
  }

  function botDoNaki(botIdx) {
    const defIdx = G.defenderIdx;
    const scoreNom = SCORE_LADDER[G.players[defIdx].score];
    if (G.nakiJokerMode) {
      const joker = G.players[botIdx].hand.find(c => isDeuceJoker(c)) || G.players[botIdx].hand.find(c => isJoker(c));
      if (joker) doNakiThrow(botIdx, joker);
      else doNakiPass(botIdx);
    } else {
      const card = G.players[botIdx].hand.find(c => cardNominal(c) === scoreNom);
      if (card) doNakiThrow(botIdx, card);
      else doNakiPass(botIdx);
    }
  }

  // ─── HUMAN INTERACTION HELPERS ───────────────────────────────
  function humanCardClick(card) {
    const hi = humanPlayerIdx();
    if (!isHumanTurn()) return;
    const p = G.players[hi];

    if (G.phase === 'attack' && !G.attackDone && leftThrowerIdx() === hi) {
      const idx = UI.selectedCards.indexOf(card.id);
      if (idx === -1) {
        if (UI.selectedCards.length > 0) {
          const firstCard = p.hand.find(c => c.id === UI.selectedCards[0]);
          if (firstCard && cardNominal(firstCard) !== cardNominal(card)) {
            UI.selectedCards = [card.id];
            notify(); return;
          }
        }
        const availableSlots = getAttackLimit() - G.tablePairs.length;
        if (UI.selectedCards.length >= availableSlots) { notify(); return; }
        UI.selectedCards.push(card.id);
      } else {
        UI.selectedCards.splice(idx, 1);
      }
      notify();
    } else if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length > 0 && G.nakiGiveToHandPending[0] === hi) {
      const tableNoms = getTableNominals();
      const limit = G.nakiGiveToHandLimit || 0;
      if (tableNoms.has(cardNominal(card))) {
        const idx = UI.selectedCards.indexOf(card.id);
        if (idx === -1) { if (UI.selectedCards.length < limit) UI.selectedCards.push(card.id); }
        else UI.selectedCards.splice(idx, 1);
        notify();
      }
    } else if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length === 0 && G.nakiPending.length > 0 && G.nakiPending[0] === hi && !G.nakiJokerMode) {
      const scoreNom = SCORE_LADDER[G.players[G.defenderIdx].score];
      if (cardNominal(card) === scoreNom) {
        const idx = UI.selectedCards.indexOf(card.id);
        if (idx === -1) UI.selectedCards.push(card.id);
        else UI.selectedCards.splice(idx, 1);
        notify();
      }
    } else if (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing) {
      if (nominalOnTable(cardNominal(card)) && G.tablePairs.length < getAttackLimit()) {
        UI.selectedCards = [];
        saveUndoState();
        doThrow(hi, card);
      }
    } else if (G.phase === 'defense') {
      if (UI.selectedAttackPairIdx !== null) {
        const pair = G.tablePairs[UI.selectedAttackPairIdx];
        if (pair && !pair.defense && canBeat(pair.attack, card, G.trumpSuit)) {
          const atkPairIdx = UI.selectedAttackPairIdx;
          UI.selectedAttackPairIdx = null;
          UI.selectedCards = [];
          saveUndoState();
          doDefend(hi, atkPairIdx, card);
          return;
        }
      }
      UI.selectedCards = [card.id];
      for (let i = 0; i < G.tablePairs.length; i++) {
        const pair = G.tablePairs[i];
        if (!pair.defense && canBeat(pair.attack, card, G.trumpSuit)) {
          UI.selectedAttackPairIdx = i;
          break;
        }
      }
      notify();
    }
  }

  function selectAttackPair(pairIdx) {
    UI.selectedAttackPairIdx = pairIdx;
    const hi = humanPlayerIdx();
    if (UI.selectedCards.length > 0) {
      const card = G.players[hi].hand.find(c => c.id === UI.selectedCards[0]);
      if (card) {
        const pair = G.tablePairs[pairIdx];
        if (pair && !pair.defense && canBeat(pair.attack, card, G.trumpSuit)) {
          UI.selectedAttackPairIdx = null;
          UI.selectedCards = [];
          saveUndoState();
          doDefend(hi, pairIdx, card);
          return;
        }
      }
    }
    notify();
  }

  function isValidAttackCard(card) {
    if (G.tablePairs.length === 0) return true;
    if ((allBeaten() || G.defenderTaking) && nominalOnTable(cardNominal(card)) && G.tablePairs.length < getAttackLimit()) return true;
    return false;
  }

  function getDebugMode() { return debugMode; }
  function setDebugMode(val) {
    debugMode = val;
    if (!debugMode && pendingBotAction) {
      const action = pendingBotAction;
      pendingBotAction = null;
      G.botTimer = setTimeout(action, BOT_DELAY);
    }
    notify();
  }

  function getPendingBotAction() { return pendingBotAction; }
  function runPendingBotAction() {
    const action = pendingBotAction;
    pendingBotAction = null;
    if (action) action();
  }

  function getNextBotActionDescription() {
    if (!G) return 'бот';
    const phase = G.phase;
    if (phase === 'attack') {
      if (G.attackDone && G.rightNeighborThrowing) return `${G.players[rightNeighborOfDefender()]?.name} — правый сосед`;
      if (!G.attackDone) return `${G.players[leftThrowerIdx()]?.name} — атака`;
    }
    if (phase === 'defense') return `${G.players[G.defenderIdx]?.name} — защита`;
    if (phase === 'nakidyvanie') {
      if (G.nakiGiveToHandPending.length > 0) return `${G.players[G.nakiGiveToHandPending[0]]?.name} — дать в руку`;
      if (G.nakiPending.length > 0) return `${G.players[G.nakiPending[0]]?.name} — накидывание`;
    }
    return 'бот';
  }

  function hasUndoState() { return undoState !== null; }

  // ─── PUBLIC API ──────────────────────────────────────────────
  return {
    startGame(playerDefs) {
      G = newGameState(playerDefs);
      UI = { selectedCards: [], selectedAttackPairIdx: null };
      undoState = null;
      pendingBotAction = null;
      addLog('=== Новая игра ===', 'round');
      dealRound();
    },
    getState() { return G ? { ...G } : null; },
    getUI() { return { ...UI }; },
    humanPlayerIdx,
    isHumanTurn,
    canBeat,
    canTransfer,
    canAttackWith: (cards) => canAttackWith(cards),
    nominalOnTable,
    allBeaten: () => allBeaten(),
    hasUnbeaten: () => hasUnbeaten(),
    getAttackLimit: () => getAttackLimit(),
    leftThrowerIdx: () => leftThrowerIdx(),
    rightNeighborOfDefender: () => rightNeighborOfDefender(),
    isValidAttackCard,
    isUniqueLowestRankPlayer: (idx) => isUniqueLowestRankPlayer(idx),
    getTableNominals: () => getTableNominals(),
    cardStr,
    SCORE_LADDER,
    SUIT_SYM,
    isJoker,
    isPictureJoker,
    isDeuceJoker,
    cardNominal,
    cardLabel,
    // Actions
    doAttack: (playerIdx, cards) => { saveUndoState(); doAttack(playerIdx, cards); },
    doDefend: (defenderIdx, attackPairIdx, defenseCard) => { saveUndoState(); doDefend(defenderIdx, attackPairIdx, defenseCard); },
    doTransfer: (defenderIdx, card) => { saveUndoState(); doTransfer(defenderIdx, card); },
    doTake: (defenderIdx) => { saveUndoState(); doTake(defenderIdx); },
    doThrow: (throwerIdx, card) => { saveUndoState(); doThrow(throwerIdx, card); },
    declareAttackDone: (playerIdx) => { declareAttackDone(playerIdx); },
    doRightNeighborPass: (playerIdx) => { doRightNeighborPass(playerIdx); },
    doNakiThrow: (throwerIdx, card) => { saveUndoState(); doNakiThrow(throwerIdx, card); },
    doNakiThrowMultiple: (throwerIdx, cards) => { saveUndoState(); doNakiThrowMultiple(throwerIdx, cards); },
    doNakiPass: (playerIdx) => { doNakiPass(playerIdx); },
    doNakiGiveToHand: (throwerIdx, cards) => { saveUndoState(); doNakiGiveToHand(throwerIdx, cards); },
    doNakiGiveToHandPass: (throwerIdx) => { doNakiGiveToHandPass(throwerIdx); },
    humanCardClick,
    selectAttackPair,
    hasUndoState,
    applyUndo,
    showUndoApproval: () => {}, // handled by React component
    getDebugMode,
    setDebugMode,
    getPendingBotAction,
    runPendingBotAction,
    getNextBotActionDescription,
    // mpAction wrapper — for multiplayer; in solo mode just runs the action directly
    mpAction(actionType, params, localAction) {
      if (localAction) localAction();
    },
  };
}
