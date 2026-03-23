'use strict';
// ═══════════════════════════════════════════════════════════════
//  БАРДАК — multiplayer.js  (Firebase Firestore host-based)
// ═══════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyDFxACacUJwkwwzQYbgcp3pJmWu4itHimI",
  authDomain: "bardak-913b6.firebaseapp.com",
  projectId: "bardak-913b6",
  storageBucket: "bardak-913b6.firebasestorage.app",
  messagingSenderId: "1085944011493",
  appId: "1:1085944011493:web:54d75962e1bd935d13cb80"
};

// Initialize Firebase (compat SDK)
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();

// ─── MULTIPLAYER STATE ────────────────────────────────────────
var mp = {
  enabled: false,
  uid: null,
  roomCode: null,
  seatIndex: null,
  isHost: false,
  roomRef: null,
  unsubscribe: null,
  processingAction: false,
};

// ─── UID MANAGEMENT ──────────────────────────────────────────
function mpGetUid() {
  var uid = localStorage.getItem('bardak_uid');
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('bardak_uid', uid);
  }
  return uid;
}

// ─── ROOM CODE GENERATION ────────────────────────────────────
function mpGenCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── CREATE ROOM ─────────────────────────────────────────────
async function mpCreateRoom(hostName, maxPlayers) {
  try {
    mp.uid = mpGetUid();
    var code = mpGenCode();

    // Ensure unique code
    var attempts = 0;
    while (attempts < 10) {
      var existing = await db.collection('rooms').doc(code).get();
      if (!existing.exists) break;
      code = mpGenCode();
      attempts++;
    }

    mp.roomCode = code;
    mp.isHost = true;
    mp.seatIndex = 0;
    mp.roomRef = db.collection('rooms').doc(code);

    await mp.roomRef.set({
      hostUid: mp.uid,
      status: 'lobby',
      maxPlayers: maxPlayers || 4,
      players: [{ uid: mp.uid, name: escHtml(hostName || 'Хост'), seatIndex: 0 }],
      gameState: null,
      pendingAction: null,
      createdAt: Date.now(),
    });

    document.getElementById('room-size-btns').parentElement.style.display = 'block';
    document.getElementById('start-game-btn').style.display = 'block';
    document.getElementById('waiting-msg').textContent = 'Ожидание других игроков...';

    showScreen('waiting-screen');
    document.getElementById('waiting-code').textContent = code;

    mpListenRoom();
  } catch (e) {
    alert('Ошибка создания комнаты: ' + e.message);
  }
}

// ─── JOIN ROOM ───────────────────────────────────────────────
async function mpJoinRoom(code, playerName) {
  try {
    mp.uid = mpGetUid();
    var roomRef = db.collection('rooms').doc(code.toUpperCase());
    var doc = await roomRef.get();

    if (!doc.exists) {
      alert('Комната не найдена: ' + code);
      return;
    }

    var data = doc.data();
    if (data.status !== 'lobby') {
      alert('Игра уже началась или завершена.');
      return;
    }

    var players = data.players || [];
    if (players.length >= data.maxPlayers) {
      alert('Комната заполнена.');
      return;
    }

    // Check if already joined (reconnect)
    var existingIdx = players.findIndex(function(p) { return p.uid === mp.uid; });
    var seatIndex;
    if (existingIdx !== -1) {
      seatIndex = players[existingIdx].seatIndex;
    } else {
      // Find next available seat
      var takenSeats = players.map(function(p) { return p.seatIndex; });
      seatIndex = 0;
      while (takenSeats.includes(seatIndex)) seatIndex++;

      players.push({ uid: mp.uid, name: escHtml(playerName || 'Игрок'), seatIndex: seatIndex });
      await roomRef.update({ players: players });
    }

    mp.roomCode = code.toUpperCase();
    mp.isHost = false;
    mp.seatIndex = seatIndex;
    mp.roomRef = roomRef;

    // Hide host-only controls
    document.getElementById('room-size-btns').parentElement.style.display = 'none';
    document.getElementById('start-game-btn').style.display = 'none';
    document.getElementById('waiting-msg').textContent = 'Ожидание начала игры...';

    showScreen('waiting-screen');
    document.getElementById('waiting-code').textContent = code.toUpperCase();

    mpListenRoom();
  } catch (e) {
    alert('Ошибка подключения к комнате: ' + e.message);
  }
}

// ─── LISTEN ROOM ─────────────────────────────────────────────
function mpListenRoom() {
  if (mp.unsubscribe) mp.unsubscribe();

  mp.unsubscribe = mp.roomRef.onSnapshot(function(doc) {
    if (!doc.exists) return;
    var data = doc.data();

    if (data.status === 'lobby') {
      mpUpdateWaitingScreen(data);
    } else if (data.status === 'playing') {
      if (mp.isHost) {
        // Host watches for pending actions from clients
        if (data.pendingAction && !mp.processingAction) {
          mp.processingAction = true;
          mpHandlePendingAction(data.pendingAction);
        }
      } else {
        // Client: load game state from Firestore
        if (data.gameState) {
          mpLoadGameState(data.gameState);
        }
      }
    } else if (data.status === 'finished') {
      // Game over — nothing special needed, game.js handles this
    }
  }, function(error) {
    console.error('Firestore onSnapshot error:', error);
  });
}

// ─── UPDATE WAITING SCREEN ───────────────────────────────────
function mpUpdateWaitingScreen(data) {
  var players = data.players || [];
  var maxPlayers = data.maxPlayers || 4;

  var countEl = document.getElementById('waiting-count');
  if (countEl) countEl.textContent = players.length + '/' + maxPlayers + ' игроков';

  var playersEl = document.getElementById('waiting-players');
  if (playersEl) {
    playersEl.innerHTML = players.map(function(p) {
      var isHost = p.uid === data.hostUid;
      return '<div class="waiting-player">' + p.name + (isHost ? ' 👑' : '') + '</div>';
    }).join('');
  }

  // Update host's maxPlayers if they changed the count button
  if (mp.isHost) {
    var activeBtn = document.querySelector('#room-size-btns .count-btn.active');
    var selectedMax = activeBtn ? +activeBtn.dataset.count : maxPlayers;
    if (selectedMax !== maxPlayers) {
      mp.roomRef.update({ maxPlayers: selectedMax });
    }

    // Update start button — host can start with 2+ players
    var startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
      startBtn.disabled = players.length < 2;
    }
  }
}

// ─── HOST: START GAME ────────────────────────────────────────
async function mpHostStartGame(roomData) {
  try {
    var players = roomData.players || [];
    var maxPlayers = roomData.maxPlayers || 4;

    // Build playerDefs: real players fill seats in seatIndex order, bots fill remaining
    players.sort(function(a, b) { return a.seatIndex - b.seatIndex; });

    var playerDefs = [];
    for (var seat = 0; seat < maxPlayers; seat++) {
      var realPlayer = players.find(function(p) { return p.seatIndex === seat; });
      if (realPlayer) {
        playerDefs.push({ name: realPlayer.name, isBot: false });
      } else {
        playerDefs.push({ name: 'Бот ' + (seat + 1), isBot: true });
      }
    }

    // Update status in Firestore before starting
    await mp.roomRef.update({ status: 'playing' });

    // Enable multiplayer mode
    mp.enabled = true;

    // Start the game
    startGame(playerDefs);
  } catch (e) {
    alert('Ошибка запуска игры: ' + e.message);
  }
}

// ─── HOST: SYNC STATE TO FIRESTORE ───────────────────────────
function mpSyncState() {
  if (!mp.enabled || !mp.isHost || !mp.roomRef) return;
  if (!G) return;

  try {
    // Serialize G without botTimer (can't serialize timers)
    var state = JSON.parse(JSON.stringify(G, function(key, value) {
      if (key === 'botTimer') return undefined;
      return value;
    }));

    mp.roomRef.update({ gameState: state }).catch(function(e) {
      console.error('mpSyncState error:', e);
    });
  } catch (e) {
    console.error('mpSyncState serialize error:', e);
  }
}

// ─── CLIENT: LOAD GAME STATE ─────────────────────────────────
var mpGameScreenInitialized = false;

function mpLoadGameState(state) {
  if (!state) return;

  // Set global G from remote state
  G = state;

  // Initialize UI state if needed
  if (!UI) {
    UI = {
      selectedCards: [],
      selectedAttackPairIdx: null,
    };
  } else {
    // Preserve UI selections across updates
  }

  if (!mpGameScreenInitialized) {
    mpGameScreenInitialized = true;
    showScreen('game-screen');
  }

  renderAll();
}

// ─── FIND CARD BY ID ─────────────────────────────────────────
function findCardById(cardId) {
  if (!G) return null;

  // Search in player hands
  for (var i = 0; i < G.players.length; i++) {
    var p = G.players[i];
    if (p.hand) {
      var card = p.hand.find(function(c) { return c.id === cardId; });
      if (card) return card;
    }
    if (p.secretCard && p.secretCard.id === cardId) return p.secretCard;
  }

  // Search in table pairs
  for (var j = 0; j < G.tablePairs.length; j++) {
    var pair = G.tablePairs[j];
    if (pair.attack && pair.attack.id === cardId) return pair.attack;
    if (pair.defense && pair.defense.id === cardId) return pair.defense;
  }

  // Search in deck
  if (G.deck) {
    var deckCard = G.deck.find(function(c) { return c.id === cardId; });
    if (deckCard) return deckCard;
  }

  return null;
}

// ─── HOST: HANDLE PENDING ACTION ─────────────────────────────
function mpHandlePendingAction(action) {
  // Clear the pending action in Firestore first
  mp.roomRef.update({ pendingAction: null }).then(function() {
    try {
      var type = action.type;
      var payload = action.payload || {};

      if (type === 'attack') {
        var cards = payload.cardIds.map(findCardById).filter(Boolean);
        saveUndoState();
        doAttack(payload.playerIdx, cards);
        UI.selectedCards = [];

      } else if (type === 'throw') {
        var card = findCardById(payload.cardId);
        if (card) {
          saveUndoState();
          doThrow(payload.playerIdx, card);
          UI.selectedCards = [];
        }

      } else if (type === 'transfer') {
        var tcard = findCardById(payload.cardId);
        if (tcard) {
          saveUndoState();
          doTransfer(payload.playerIdx, tcard);
          UI.selectedCards = [];
        }

      } else if (type === 'defense') {
        var defCard = findCardById(payload.defenseCardId);
        if (defCard) {
          var defPlayer = G.players[payload.playerIdx];
          var defIdx = defPlayer ? defPlayer.hand.findIndex(function(c) { return c.id === defCard.id; }) : -1;
          if (defIdx !== -1) {
            saveUndoState();
            doDefend(payload.playerIdx, payload.attackPairIdx, defCard);
            UI.selectedCards = [];
            UI.selectedAttackPairIdx = null;
          }
        }

      } else if (type === 'take') {
        var takerIdx = action.seatIndex;
        saveUndoState();
        UI.selectedCards = [];
        UI.selectedAttackPairIdx = null;
        doTake(takerIdx);

      } else if (type === 'discard') {
        doDiscard();

      } else if (type === 'attackDone') {
        declareAttackDone(payload.playerIdx);

      } else if (type === 'rightNeighborPass') {
        doRightNeighborPass(payload.playerIdx);

      } else if (type === 'nakiThrow') {
        var nkCard = findCardById(payload.cardId);
        if (nkCard) {
          saveUndoState();
          doNakiThrow(payload.throwerIdx, nkCard);
        }

      } else if (type === 'nakiThrowMultiple') {
        var nkCards = payload.cardIds.map(findCardById).filter(Boolean);
        if (nkCards.length > 0) {
          saveUndoState();
          doNakiThrowMultiple(payload.throwerIdx, nkCards);
          UI.selectedCards = [];
        }

      } else if (type === 'nakiGiveToHand') {
        var giveCards = payload.cardIds.map(findCardById).filter(Boolean);
        if (giveCards.length > 0) {
          saveUndoState();
          doNakiGiveToHand(payload.throwerIdx, giveCards);
          UI.selectedCards = [];
        }

      } else if (type === 'nakiGiveToHandPass') {
        doNakiGiveToHandPass(payload.throwerIdx);

      } else if (type === 'transferChainThrow') {
        var tcCard = findCardById(payload.cardId);
        if (tcCard && typeof doTransferChainThrow === 'function') {
          saveUndoState();
          doTransferChainThrow(payload.playerIdx, tcCard);
          UI.selectedCards = [];
        }

      } else if (type === 'transferChainPass') {
        if (typeof doTransferChainPass === 'function') {
          doTransferChainPass(payload.playerIdx);
        }
      }
    } catch (e) {
      console.error('mpHandlePendingAction error:', e);
    }

    mp.processingAction = false;
  }).catch(function(e) {
    console.error('mpHandlePendingAction clear error:', e);
    mp.processingAction = false;
  });
}

// ─── CLIENT: SEND ACTION ─────────────────────────────────────
function mpSendAction(type, payload) {
  if (!mp.roomRef) return;

  mp.roomRef.update({
    pendingAction: {
      uid: mp.uid,
      seatIndex: mp.seatIndex,
      type: type,
      payload: payload || {},
      ts: Date.now(),
    }
  }).catch(function(e) {
    console.error('mpSendAction error:', e);
  });
}

// ─── ACTION DISPATCHER ───────────────────────────────────────
function mpAction(type, payload, fn) {
  if (mp.enabled && !mp.isHost) {
    // Client: send action to host via Firestore
    mpSendAction(type, payload);
  } else {
    // Host or solo: execute locally
    fn();
  }
}

// ─── AFTER RENDER HOOK ───────────────────────────────────────
function mpAfterRender() {
  if (!mp.enabled || !mp.isHost) return;
  mpSyncState();
}

// ─── LOBBY SETUP ─────────────────────────────────────────────
function mpSetupLobby() {
  var soloBtn = document.getElementById('solo-btn');
  var createBtn = document.getElementById('create-room-btn');
  var joinBtn = document.getElementById('join-room-btn');
  var joinCodeInput = document.getElementById('join-code-input');

  if (soloBtn) {
    soloBtn.addEventListener('click', function() {
      mp.enabled = false;
      showScreen('setup-screen');
    });
  }

  if (createBtn) {
    createBtn.addEventListener('click', async function() {
      var name = (document.getElementById('lobby-name-input').value || '').trim() || 'Хост';
      var maxPlayersEl = document.querySelector('#room-size-btns .count-btn.active');
      var maxPlayers = maxPlayersEl ? +maxPlayersEl.dataset.count : 4;
      await mpCreateRoom(name, maxPlayers);
    });
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', async function() {
      var code = (joinCodeInput ? joinCodeInput.value : '').trim().toUpperCase();
      var name = (document.getElementById('lobby-name-input').value || '').trim() || 'Игрок';
      if (code.length !== 4) {
        alert('Введите 4-значный код комнаты');
        return;
      }
      await mpJoinRoom(code, name);
    });
  }

  // Auto-uppercase for join code input
  if (joinCodeInput) {
    joinCodeInput.addEventListener('input', function() {
      joinCodeInput.value = joinCodeInput.value.toUpperCase();
    });
  }

  // Room size buttons in waiting screen
  document.querySelectorAll('#room-size-btns .count-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#room-size-btns .count-btn').forEach(function(b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      // Update maxPlayers in Firestore if we're already in a room
      if (mp.isHost && mp.roomRef) {
        mp.roomRef.update({ maxPlayers: +btn.dataset.count });
      }
    });
  });

  var startGameBtn = document.getElementById('start-game-btn');
  if (startGameBtn) {
    startGameBtn.addEventListener('click', async function() {
      var doc = await mp.roomRef.get();
      await mpHostStartGame(doc.data());
    });
  }

}

// ─── RESET MULTIPLAYER STATE ─────────────────────────────────
function mpResetState() {
  if (mp.unsubscribe) {
    mp.unsubscribe();
    mp.unsubscribe = null;
  }
  mp.enabled = false;
  mp.roomCode = null;
  mp.seatIndex = null;
  mp.isHost = false;
  mp.roomRef = null;
  mp.processingAction = false;
  mpGameScreenInitialized = false;
  showScreen('lobby-screen');
}

// ─── INIT ON DOM READY ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  mpSetupLobby();
});
