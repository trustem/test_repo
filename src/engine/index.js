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
    nakiDisplayCards: [],  // persists until dealRound; accumulates all cards thrown this round
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
    nakiNominal: null,
    defenderTaking: false,
    nakiDisplayCards: [],   // cards thrown during nakidyvanie — persists until next naki cycle
    nakiDefenderIdx: null,
    transferThrowQueue: [],
    transferThrowPhase: false,
    transferThrowNominal: null,
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
    dicePhase: false,
    diceRollKey: 0,
    diceParticipants: [],
    diceResults: {},
    postDiceAction: null,
    trumpChoicePhase: false,
    trumpChooserIdx: -1,
    pendingDiceAfterDraw: false,
    pendingPlayers: [], // players waiting to join at next round boundary
  };
}

// ─── ENGINE FACTORY ──────────────────────────────────────────
// Creates a game engine instance.
// onUpdate(G, UI, logEntry?) is called after every state change.
// onGameOver(G) is called when game ends.
// onLog(msg, type) is called for each new log entry.
// onPlayersActivated(activatedPlayers) called when pending players enter the game.
export function createEngine({ onUpdate, onGameOver, onLog, getMpSeatIndex, mpActionHandler, onPlayersActivated }) {
  let G = null;
  let UI = { selectedCards: [], selectedAttackPairIdx: null };
  let undoState = null;
  let debugMode = false;
  let pendingBotAction = null;
  let _mpActionHandler = mpActionHandler || null;
  let discardPauseTimer = null;

  // Route action through multiplayer if handler is set (non-host), else run locally
  function execAction(type, payload, localFn) {
    if (_mpActionHandler) {
      _mpActionHandler(type, payload, localFn);
    } else {
      localFn();
    }
  }

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

  function medianScoreFloor(players) {
    const scores = players.map(p => p.score).sort((a, b) => a - b);
    if (!scores.length) return 0;
    const mid = Math.floor(scores.length / 2);
    if (scores.length % 2 === 1) return scores[mid];
    return Math.floor((scores[mid - 1] + scores[mid]) / 2);
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
    if (G.trumpChoicePhase && G.trumpChooserIdx === hi) return true;
    if (G.transferThrowPhase && G.transferThrowQueue.length > 0 && G.transferThrowQueue[0] === hi) return true;
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
    const sixPlayer = G.players.length >= 6;
    const max = G.firstBeaten ? (sixPlayer ? 5 : 6) : (sixPlayer ? 4 : 5);
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
    const maxHand = G.players.length >= 6 ? 5 : 6;
    while (p.hand.length < maxHand && G.deck.length > 0) {
      const card = G.deck.pop();
      if (!card) break;
      if (G.trumpCard && card.id === G.trumpCard.id) {
        p.hand.push(card);
        if (G.secretTrumpCard) {
          if (isJoker(G.secretTrumpCard)) {
            addLog(`Секретный козырь — джокер! ${p.name} получает джокер. Бросают кости...`, 'system');
            p.hand.push(G.secretTrumpCard);
            G.secretTrumpCard = null;
            G.pendingDiceAfterDraw = true;
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
      const sc = p.secretCard;
      p.hand.push(sc);
      p.secretTaken = true;
      p.secretRevealed = false;
      addLog(`${p.name} берёт секретную карту`, 'system');
      G.trumpAnnouncement = {
        suit: G.trumpSuit,
        key: Date.now(),
        playerName: p.name,
        secretOnly: true,
      };
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
    G.transferThrowNominal = null;
    G.humanTransferThrowPassed = false;
    G.nakiGiveToHandPending = [];
    G.nakiGiveToHandLimit = 0;
    G.nakiNominal = null;
    G.defenderTaking = false;
    G.nakiDisplayCards = [];
    G.nakiDefenderIdx = null;
    G.phase = 'deal';
    G.humanJustTook = false;
    G.dicePhase = false;
    G.diceParticipants = [];
    G.diceResults = {};
    G.postDiceAction = null;
    G.trumpChoicePhase = false;
    G.trumpChooserIdx = -1;
    G.pendingDiceAfterDraw = false;

    // ── Activate pending mid-game joiners ────────────────────────
    if (G.pendingPlayers && G.pendingPlayers.length > 0) {
      const entryScore = medianScoreFloor(G.players);
      const toActivate = G.pendingPlayers.slice();
      G.pendingPlayers = [];
      for (const pp of toActivate) {
        G.players.push({
          id: pp.seatIndex,
          name: pp.name,
          isBot: false,
          hand: [],
          secretCard: null,
          secretTaken: false,
          secretRevealed: false,
          score: entryScore,
          exited: false,
          exitOrder: null,
          nakiCards: [],
          nakiDisplayCards: [],
        });
        addLog(`${pp.name} входит в игру со счётом ${SCORE_LADDER[entryScore]}`, 'system');
      }
      if (onPlayersActivated) onPlayersActivated(toActivate);
    }

    G.players.forEach(p => {
      p.hand = [];
      p.secretCard = null;
      p.secretTaken = false;
      p.secretRevealed = false;
      p.exited = false;
      p.exitOrder = null;
      p.nakiCards = [];
      p.nakiDisplayCards = [];
    });

    const activePl = G.players;
    const handSize = activePl.length >= 6 ? 5 : 6;
    for (let i = 0; i < handSize; i++) {
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
      G.trumpSuit = null;
      addLog('Козырной джокер! Бросают кости для выбора козыря...', 'system');
      startDiceRoll('deal');
      G.phase = 'dice';
      notify();
      return;
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
  // Reveal secret card if hand is empty after playing (works for any role)
  function revealSecretIfNeeded(playerIdx) {
    const p = G.players[playerIdx];
    if (p.hand.length === 0 && p.secretCard && !p.secretTaken) {
      const sc = p.secretCard;
      p.hand.push(sc);
      p.secretCard = null;
      p.secretTaken = true;
      p.secretRevealed = false;
      sortHand(playerIdx);
      addLog(`${p.name} открывает потайную карту: ${cardStr(sc)}`, 'system');
      G.trumpAnnouncement = {
        suit: G.trumpSuit,
        key: Date.now(),
        playerName: p.name,
        secretOnly: true,
      };
    }
  }

  function doAttack(playerIdx, cards) {
    const allowed = getAttackLimit() - G.tablePairs.length;
    if (allowed <= 0) return false;
    cards = cards.slice(0, allowed);
    addLog(`${G.players[playerIdx].name} атакует: ${cards.map(cardStr).join(', ')}`, 'attack');
    for (const card of cards) {
      removeFromHand(playerIdx, card);
      G.tablePairs.push({ attack: card, defense: null, attacker: playerIdx });
    }
    revealSecretIfNeeded(playerIdx);
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
    revealSecretIfNeeded(defenderIdx);
    if (allBeaten()) {
      G.phase = 'attack';
      G.transferThrowPhase = false;
      G.transferThrowQueue = [];
      G.transferThrowNominal = null;
    }
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

    // Cancel any previous transfer throw phase (new transfer supersedes it)
    G.transferThrowPhase = false;
    G.transferThrowQueue = [];
    G.transferThrowNominal = null;

    // Check if transferrer has more cards of same nominal to throw immediately
    const transferredNominal = cardNominal(card);
    const canThrowMore = G.players[defenderIdx].hand.some(c => cardNominal(c) === transferredNominal)
      && G.tablePairs.length < getAttackLimit();
    if (canThrowMore) {
      G.transferThrowPhase = true;
      G.transferThrowQueue = [defenderIdx];
      G.transferThrowNominal = transferredNominal;
    }
    notify();
    scheduleBot();
  }

  function doTransferThrow(throwerIdx, card) {
    if (!G.transferThrowPhase || G.transferThrowQueue[0] !== throwerIdx) return;
    if (cardNominal(card) !== G.transferThrowNominal) return;
    if (G.tablePairs.length >= getAttackLimit()) return;
    addLog(`${G.players[throwerIdx].name} подкидывает: ${cardStr(card)}`, 'attack');
    removeFromHand(throwerIdx, card);
    G.tablePairs.push({ attack: card, defense: null, attacker: throwerIdx });
    revealSecretIfNeeded(throwerIdx);
    // Check if thrower can still throw more
    const stillHasMore = G.players[throwerIdx].hand.some(c => cardNominal(c) === G.transferThrowNominal)
      && G.tablePairs.length < getAttackLimit();
    if (!stillHasMore) {
      G.transferThrowPhase = false;
      G.transferThrowQueue = [];
      G.transferThrowNominal = null;
    }
    notify();
    scheduleBot();
  }

  function doTransferThrowPass(throwerIdx) {
    if (!G.transferThrowPhase) return;
    G.transferThrowPhase = false;
    G.transferThrowQueue = [];
    G.transferThrowNominal = null;
    notify();
    scheduleBot();
  }

  function doTake(defenderIdx) {
    addLog(`${G.players[defenderIdx].name} берёт карты`, 'take');
    // Cancel any pending transfer throw — defender chose to take
    G.transferThrowPhase = false;
    G.transferThrowQueue = [];
    G.transferThrowNominal = null;
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
    G.transferThrowNominal = null;
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
    if (G.pendingDiceAfterDraw) {
      G.pendingDiceAfterDraw = false;
      startDiceRoll('draw');
      G.phase = 'dice';
      notify();
      return;
    }
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
    revealSecretIfNeeded(throwerIdx);
    G.phase = G.defenderTaking ? 'attack' : 'defense';
    notify();
    scheduleBot();
  }

  function declareAttackDone(playerIdx) {
    if (playerIdx !== leftThrowerIdx()) return;
    // Guard against stale multiplayer actions arriving after the round ended
    if (G.tablePairs.length === 0 && !G.defenderTaking) return;
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
    G.transferThrowNominal = null;
    resolveAfterThrowing();
  }

  function doRightNeighborPass(playerIdx) {
    // Guard against stale multiplayer actions arriving after the round ended
    if (G.tablePairs.length === 0 && !G.defenderTaking) return;
    addLog(`${G.players[playerIdx].name} пас (правый сосед)`, 'system');
    G.rightNeighborThrowing = false;
    if (G.defenderTaking) {
      G.phase = 'nakidyvanie';
      setupNakidyvanie(G.defenderIdx);
      return;
    }
    G.transferThrowQueue = [];
    G.transferThrowPhase = false;
    G.transferThrowNominal = null;
    resolveAfterThrowing();
  }

  function resolveAfterThrowing() {
    if (G.defenderTaking) {
      G.phase = 'nakidyvanie';
      setupNakidyvanie(G.defenderIdx);
      return;
    }
    // Safety: if table is empty there's nothing to resolve (stale action guard)
    if (G.tablePairs.length === 0) return;
    if (hasUnbeaten()) {
      G.phase = 'defense';
      notify();
      scheduleBot();
    } else {
      // Pause 2.5 s so players can see the successful defense before cards clear
      if (discardPauseTimer) clearTimeout(discardPauseTimer);
      G.phase = 'discard_pause';
      notify();
      discardPauseTimer = setTimeout(() => {
        discardPauseTimer = null;
        if (G && G.phase === 'discard_pause') doDiscard();
      }, 1700);
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
    // Lock the nominal for the entire nakidyvanie phase so score increases
    // mid-phase don't change what nominal subsequent throwers must use
    G.nakiNominal = G.nakiJokerMode ? null : defScoreNom;
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
      // Keep all pending — every player in nakiPending can throw ALL their cards
      // of nakiNominal (the nominal locked at phase start), then pass.
      // Do NOT clear based on isUniqueLowestRankPlayer: that caused later
      // players to be skipped entirely.
    }
    G.tablePairs.push({ attack: card, defense: null, attacker: throwerIdx, isNaki: true });
    // Accumulate into per-player display array (persists until dealRound)
    G.players[defenderIdx].nakiDisplayCards.push(card);
    G.nakiDisplayCards = [...G.players[defenderIdx].nakiCards]; // keep global in sync for undo
    G.nakiDefenderIdx = defenderIdx;
    checkGameEnd(defenderIdx);
    if (!G.gameOver) {
      if (G.nakiPending.length === 0) afterNakiPending();
      else { notify(); scheduleBot(); }
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
    // Accumulate into per-player display array (persists until dealRound)
    for (const card of cards) G.players[defenderIdx].nakiDisplayCards.push(card);
    G.nakiDisplayCards = [...G.players[defenderIdx].nakiCards]; // keep global in sync for undo
    G.nakiDefenderIdx = defenderIdx;
    afterNakiPending();
  }

  function doNakiPass(playerIdx) {
    // Guard against stale multiplayer actions arriving after nakidyvanie ended
    if (G.phase !== 'nakidyvanie') return;
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
    G.transferThrowNominal = null;
    G.humanTransferThrowPassed = false;
    G.defenderTaking = false;
    G.nakiNominal = null;
    G.throwers = [];
    const drawOrder = [];
    const addUniq = idx => { if (!drawOrder.includes(idx)) drawOrder.push(idx); };
    addUniq(savedAttackerIdx);
    G.players.forEach((p, i) => { if (!p.exited && i !== defenderIdx) addUniq(i); });
    for (const idx of drawOrder) drawUpTo6(idx);
    if (G.pendingDiceAfterDraw) {
      G.pendingDiceAfterDraw = false;
      startDiceRoll('draw');
      G.phase = 'dice';
      notify();
      return;
    }
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

    // Trump choice — bot picks best suit
    if (G.trumpChoicePhase) {
      const chooser = G.trumpChooserIdx;
      if (chooser !== -1 && G.players[chooser] && G.players[chooser].isBot) {
        const bot = G.players[chooser];
        const sc = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
        for (const c of bot.hand) { if (!isJoker(c)) sc[c.suit] = (sc[c.suit] || 0) + 1; }
        const best = Object.entries(sc).sort((a, b) => b[1] - a[1])[0]?.[0] || SUITS[Math.floor(Math.random() * 4)];
        setTimeout(() => { if (G.trumpChoicePhase && G.trumpChooserIdx === chooser) doChooseTrump(chooser, best); }, BOT_DELAY);
      }
      return;
    }

    if (G.dicePhase) return; // UI animates dice, nothing for bots to do
    if (G.phase === 'deal' || G.phase === 'draw' || G.phase === 'roundover' || G.phase === 'dice') return;

    // Handle transfer-throw phase BEFORE isHumanTurn check so bot can throw
    // even when the new defender is human (both can act simultaneously)
    if (G.transferThrowPhase && G.transferThrowQueue.length > 0) {
      const throwerIdx = G.transferThrowQueue[0];
      if (G.players[throwerIdx] && G.players[throwerIdx].isBot) {
        const nom = G.transferThrowNominal;
        const throwable = nom ? G.players[throwerIdx].hand.filter(c => cardNominal(c) === nom) : [];
        if (throwable.length > 0 && G.tablePairs.length < getAttackLimit()) {
          setTimeout(() => { if (G.transferThrowPhase) doTransferThrow(throwerIdx, throwable[0]); }, BOT_DELAY / 2);
        } else {
          setTimeout(() => { if (G.transferThrowPhase) doTransferThrowPass(throwerIdx); }, BOT_DELAY / 2);
        }
        return;
      }
      // Human is the thrower — allow bot defender to proceed below
    }

    // When human is only the transfer thrower (not the defender), don't block bot defender
    const humanIsOnlyThrower = G.transferThrowPhase
      && G.transferThrowQueue.length > 0
      && G.transferThrowQueue[0] === humanPlayerIdx();
    if (!humanIsOnlyThrower && isHumanTurn()) return;
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
    // Use the locked nominal — never the current (post-throw-incremented) score
    const scoreNom = G.nakiNominal || SCORE_LADDER[G.players[defIdx].score];
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

  // ─── DICE & TRUMP CHOICE ─────────────────────────────────────
  function rollDie() { return Math.floor(Math.random() * 6) + 1; }

  function startDiceRoll(postAction) {
    const participants = G.players.map((p, i) => i).filter(i => !G.players[i].exited);
    const results = {};
    for (const idx of participants) results[idx] = [rollDie(), rollDie()];
    G.dicePhase = true;
    G.diceRollKey = (G.diceRollKey || 0) + 1;
    G.diceParticipants = participants;
    G.diceResults = results;
    G.postDiceAction = postAction;
    G.trumpChoicePhase = false;
    G.trumpChooserIdx = -1;
    addLog('Бросают кости для выбора козыря!', 'system');
  }

  function resolveDiceRoll() {
    if (!G.dicePhase) return;
    const sums = {};
    for (const idx of G.diceParticipants) {
      const r = G.diceResults[idx];
      sums[idx] = r ? r[0] + r[1] : 0;
    }
    const maxSum = Math.max(...Object.values(sums));
    const winners = G.diceParticipants.filter(idx => sums[idx] === maxSum);
    if (winners.length === 1) {
      G.dicePhase = false;
      G.trumpChoicePhase = true;
      G.trumpChooserIdx = winners[0];
      addLog(`${G.players[winners[0]].name} выиграл бросок — выбирает козырь`, 'system');
      notify();
      if (G.players[winners[0]].isBot) scheduleBot();
    } else {
      addLog(`Ничья у ${winners.map(i => G.players[i].name).join(', ')}! Переброска.`, 'system');
      const results = {};
      for (const idx of winners) results[idx] = [rollDie(), rollDie()];
      G.diceParticipants = winners;
      G.diceResults = results;
      G.diceRollKey = (G.diceRollKey || 0) + 1;
      notify();
    }
  }

  function doChooseTrump(playerIdx, suit) {
    if (!G.trumpChoicePhase || G.trumpChooserIdx !== playerIdx) return false;
    if (!SUITS.includes(suit)) return false;
    G.trumpSuit = suit;
    G.trumpChoicePhase = false;
    G.trumpChooserIdx = -1;
    addLog(`${G.players[playerIdx].name} выбирает козырь: ${SUIT_SYM[suit]}`, 'system');
    G.trumpAnnouncement = { suit, key: Date.now(), playerName: G.players[playerIdx].name, chosen: true };
    const postAction = G.postDiceAction;
    G.postDiceAction = null;
    if (postAction === 'deal') {
      G.attackerIdx = findFirstAttacker();
      G.defenderIdx = nextActiveIdx(G.attackerIdx);
      addLog(`Козырь: ${SUIT_SYM[suit]}. Первый атакует: ${G.players[G.attackerIdx].name}`, 'system');
      sortAllHands();
      G.phase = 'attack';
    } else {
      sortAllHands();
      G.phase = 'attack';
      checkExits();
      revalidateAttackerDefender();
    }
    notify();
    if (!G.gameOver) scheduleBot();
    return true;
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
        execAction('throw', { playerIdx: hi, cardId: card.id }, () => { saveUndoState(); doThrow(hi, card); });
      }
    } else if (G.phase === 'defense') {
      if (UI.selectedAttackPairIdx !== null) {
        const pair = G.tablePairs[UI.selectedAttackPairIdx];
        if (pair && !pair.defense && canBeat(pair.attack, card, G.trumpSuit)) {
          const atkPairIdx = UI.selectedAttackPairIdx;
          UI.selectedAttackPairIdx = null;
          UI.selectedCards = [];
          execAction('defense', { playerIdx: hi, attackPairIdx: atkPairIdx, defenseCardId: card.id }, () => { saveUndoState(); doDefend(hi, atkPairIdx, card); });
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
          execAction('defense', { playerIdx: hi, attackPairIdx: pairIdx, defenseCardId: card.id }, () => { saveUndoState(); doDefend(hi, pairIdx, card); });
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
      if (discardPauseTimer) { clearTimeout(discardPauseTimer); discardPauseTimer = null; }
      G = newGameState(playerDefs);
      UI = { selectedCards: [], selectedAttackPairIdx: null };
      undoState = null;
      pendingBotAction = null;
      addLog('=== Новая игра ===', 'round');
      dealRound();
    },
    getState() { return G ? { ...G } : null; },
    // For multiplayer non-host: sync engine's internal G with Firestore state
    // so engine helper methods (isHumanTurn, leftThrowerIdx, etc.) work correctly
    loadState(state) { G = state ? { ...state } : null; },
    // For host reconnect: resume game after loadState — re-renders UI and restarts bot timers
    resumeGame() {
      if (!G || G.gameOver) return;
      notify();
      scheduleBot();
    },
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
    // Actions — all route through execAction so non-host sends via Firestore
    doAttack: (playerIdx, cards) => execAction('attack', { playerIdx, cardIds: cards.map(c => c.id) }, () => { saveUndoState(); doAttack(playerIdx, cards); }),
    doDefend: (defenderIdx, attackPairIdx, defenseCard) => execAction('defense', { playerIdx: defenderIdx, attackPairIdx, defenseCardId: defenseCard.id }, () => { saveUndoState(); doDefend(defenderIdx, attackPairIdx, defenseCard); }),
    doTransfer: (defenderIdx, card) => execAction('transfer', { playerIdx: defenderIdx, cardId: card.id }, () => { saveUndoState(); doTransfer(defenderIdx, card); }),
    doTransferThrow: (throwerIdx, card) => execAction('transferThrow', { throwerIdx, cardId: card.id }, () => { saveUndoState(); doTransferThrow(throwerIdx, card); }),
    doTransferThrowPass: (throwerIdx) => execAction('transferThrowPass', { throwerIdx }, () => { doTransferThrowPass(throwerIdx); }),
    doTake: (defenderIdx) => execAction('take', { playerIdx: defenderIdx }, () => { saveUndoState(); doTake(defenderIdx); }),
    doThrow: (throwerIdx, card) => execAction('throw', { playerIdx: throwerIdx, cardId: card.id }, () => { saveUndoState(); doThrow(throwerIdx, card); }),
    declareAttackDone: (playerIdx) => execAction('attackDone', { playerIdx }, () => { declareAttackDone(playerIdx); }),
    doRightNeighborPass: (playerIdx) => execAction('rightNeighborPass', { playerIdx }, () => { doRightNeighborPass(playerIdx); }),
    doNakiThrow: (throwerIdx, card) => execAction('nakiThrow', { playerIdx: throwerIdx, cardId: card.id }, () => { saveUndoState(); doNakiThrow(throwerIdx, card); }),
    doNakiThrowMultiple: (throwerIdx, cards) => execAction('nakiMultiple', { playerIdx: throwerIdx, cardIds: cards.map(c => c.id) }, () => { saveUndoState(); doNakiThrowMultiple(throwerIdx, cards); }),
    doNakiPass: (playerIdx) => execAction('nakiPass', { playerIdx }, () => { doNakiPass(playerIdx); }),
    doNakiGiveToHand: (throwerIdx, cards) => execAction('nakiGiveToHand', { playerIdx: throwerIdx, cardIds: cards.map(c => c.id) }, () => { saveUndoState(); doNakiGiveToHand(throwerIdx, cards); }),
    doNakiGiveToHandPass: (throwerIdx) => execAction('nakiGiveToHandPass', { playerIdx: throwerIdx }, () => { doNakiGiveToHandPass(throwerIdx); }),
    addPendingPlayer: ({ name, seatIndex, uid }) => {
      if (!G) return;
      if (!G.pendingPlayers) G.pendingPlayers = [];
      if (!G.pendingPlayers.find(p => p.seatIndex === seatIndex)) {
        G.pendingPlayers.push({ name, seatIndex, uid: uid || null });
      }
    },
    humanCardClick,
    selectAttackPair,
    hasUndoState,
    applyUndo,
    resolveDiceRoll: () => execAction('resolveDice', {}, () => { resolveDiceRoll(); }),
    doChooseTrump: (playerIdx, suit) => execAction('chooseTrump', { playerIdx, suit }, () => { doChooseTrump(playerIdx, suit); }),
    showUndoApproval: () => {},
    getDebugMode,
    setDebugMode,
    getPendingBotAction,
    runPendingBotAction,
    getNextBotActionDescription,
    setMpActionHandler: (handler) => { _mpActionHandler = handler; },
    // Legacy no-op (kept for compatibility)
    mpAction(actionType, params, localAction) {
      if (localAction) localAction();
    },
  };
}
