// ═══════════════════════════════════════════════════════════════
//  БАРДАК — Multiplayer module (Firebase Firestore, React-adapted)
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseApp;
let db;

function getDb() {
  if (!db) {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
  }
  return db;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mpGetUid() {
  // Fallback: если Firebase Auth не отработал, генерируем локальный UID
  let uid = localStorage.getItem('bardak_uid_fallback');
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('bardak_uid_fallback', uid);
  }
  return uid;
}

function mpGenCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── Factory ──────────────────────────────────────────────────
// Creates a multiplayer manager.
// callbacks: { onRoomUpdate, onGameStateUpdate, onLobbyRooms, onReset, onLog }
export function createMultiplayer(callbacks = {}) {
  const { onRoomUpdate, onGameStateUpdate, onLobbyRooms, onReset, onLog } = callbacks;

  const mp = {
    enabled: false,
    uid: null,
    roomCode: null,
    seatIndex: null,
    isHost: false,
    roomRef: null,
    unsubscribe: null,
    processingAction: false,
    logRenderedCount: 0,
  };

  let heartbeatInterval = null;
  let roomsUnsubscribe = null;
  let engineRef = null; // set via setEngine()

  function setEngine(engine) {
    engineRef = engine;
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      if (mp.isHost && mp.roomRef) {
        updateDoc(mp.roomRef, { hostLastSeen: Date.now() }).catch(() => {});
      }
    }, 20000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  async function createRoom(hostName, maxPlayers = 4) {
    try {
      const database = getDb();
      mp.uid = mpGetUid();
      let code = mpGenCode();
      let attempts = 0;
      while (attempts < 10) {
        const existing = await getDoc(doc(database, 'rooms', code));
        if (!existing.exists()) break;
        code = mpGenCode();
        attempts++;
      }
      mp.roomCode = code;
      mp.isHost = true;
      mp.seatIndex = 0;
      mp.roomRef = doc(database, 'rooms', code);
      await setDoc(mp.roomRef, {
        hostUid: mp.uid,
        status: 'lobby',
        maxPlayers,
        players: [{ uid: mp.uid, name: escHtml(hostName || 'Хост'), seatIndex: 0 }],
        gameState: null,
        pendingAction: null,
        createdAt: Date.now(),
        hostLastSeen: Date.now(),
      });
      startHeartbeat();
      listenRoom();
      return { code, isHost: true, seatIndex: 0 };
    } catch (e) {
      throw new Error('Ошибка создания комнаты: ' + e.message);
    }
  }

  async function joinRoom(code, playerName) {
    try {
      const database = getDb();
      mp.uid = mpGetUid();
      const roomRef = doc(database, 'rooms', code.toUpperCase());
      const roomDoc = await getDoc(roomRef);
      if (!roomDoc.exists()) throw new Error('Комната не найдена: ' + code);
      const data = roomDoc.data();
      if (data.status !== 'lobby') throw new Error('Игра уже началась или завершена.');
      const players = data.players || [];
      if (players.length >= data.maxPlayers) throw new Error('Комната заполнена.');
      let existingIdx = players.findIndex(p => p.uid === mp.uid);
      let seatIndex;
      if (existingIdx !== -1) {
        seatIndex = players[existingIdx].seatIndex;
      } else {
        const takenSeats = players.map(p => p.seatIndex);
        seatIndex = 0;
        while (takenSeats.includes(seatIndex)) seatIndex++;
        players.push({ uid: mp.uid, name: escHtml(playerName || 'Игрок'), seatIndex });
        await updateDoc(roomRef, { players });
      }
      mp.roomCode = code.toUpperCase();
      mp.isHost = false;
      mp.seatIndex = seatIndex;
      mp.roomRef = roomRef;
      listenRoom();
      return { code: mp.roomCode, isHost: false, seatIndex };
    } catch (e) {
      throw new Error(e.message);
    }
  }

  function listenRoom() {
    if (mp.unsubscribe) mp.unsubscribe();
    mp.unsubscribe = onSnapshot(mp.roomRef, (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      if (data.status === 'lobby') {
        if (onRoomUpdate) onRoomUpdate(data);
      } else if (data.status === 'playing') {
        if (mp.isHost) {
          if (data.pendingAction && !mp.processingAction) {
            mp.processingAction = true;
            handlePendingAction(data.pendingAction);
          }
        } else {
          if (data.gameState && onGameStateUpdate) {
            syncLog(data.gameState.logEntries);
            onGameStateUpdate(data.gameState);
          }
        }
      } else if (data.status === 'finished') {
        // Non-host: game ended — show gameover with last known state
        if (!mp.isHost && data.gameState && data.gameState.gameOver && onGameStateUpdate) {
          syncLog(data.gameState.logEntries);
          onGameStateUpdate(data.gameState);
        }
      }
    }, (error) => {
      console.error('Firestore onSnapshot error:', error);
    });
  }

  function syncLog(logEntries) {
    if (!logEntries || !logEntries.length) return;
    const newEntries = logEntries.slice(mp.logRenderedCount);
    for (const entry of newEntries) {
      if (onLog) onLog(entry.msg, entry.type);
    }
    mp.logRenderedCount = logEntries.length;
  }

  function syncState(G) {
    if (!mp.enabled || !mp.isHost || !mp.roomRef) return;
    if (!G) return;
    try {
      const state = JSON.parse(JSON.stringify(G, (key, value) => {
        if (key === 'botTimer') return undefined;
        return value;
      }));
      updateDoc(mp.roomRef, { gameState: state }).catch(e => {
        console.error('mpSyncState error:', e);
      });
    } catch (e) {
      console.error('mpSyncState serialize error:', e);
    }
  }

  function markGameOver() {
    if (mp.roomRef) updateDoc(mp.roomRef, { status: 'finished' }).catch(() => {});
  }

  async function hostStartGame(roomData, startGameCallback) {
    try {
      const players = (roomData.players || []).sort((a, b) => a.seatIndex - b.seatIndex);
      const maxPlayers = roomData.maxPlayers || 4;
      const playerDefs = [];
      for (let seat = 0; seat < maxPlayers; seat++) {
        const real = players.find(p => p.seatIndex === seat);
        if (real) playerDefs.push({ name: real.name, isBot: false });
        else playerDefs.push({ name: 'Бот ' + (seat + 1), isBot: true });
      }
      mp.enabled = true;
      startGameCallback(playerDefs);
      // Write status and initial gameState atomically so non-host always
      // receives both in one snapshot (prevents blank screen race condition)
      const initialG = engineRef?.getState?.();
      const update = { status: 'playing' };
      if (initialG) {
        update.gameState = JSON.parse(JSON.stringify(initialG, (k, v) =>
          k === 'botTimer' ? undefined : v
        ));
      }
      await updateDoc(mp.roomRef, update);
    } catch (e) {
      throw new Error('Ошибка запуска игры: ' + e.message);
    }
  }

  function findCardById(cardId, G) {
    if (!G) return null;
    for (const p of G.players) {
      const card = p.hand && p.hand.find(c => c.id === cardId);
      if (card) return card;
      if (p.secretCard && p.secretCard.id === cardId) return p.secretCard;
    }
    for (const pair of G.tablePairs) {
      if (pair.attack && pair.attack.id === cardId) return pair.attack;
      if (pair.defense && pair.defense.id === cardId) return pair.defense;
    }
    if (G.deck) {
      const dc = G.deck.find(c => c.id === cardId);
      if (dc) return dc;
    }
    return null;
  }

  function handlePendingAction(action) {
    updateDoc(mp.roomRef, { pendingAction: null }).then(() => {
      if (!engineRef) { mp.processingAction = false; return; }
      try {
        const { type, payload = {} } = action;
        const G = engineRef.getState();
        const find = (id) => findCardById(id, G);

        if (type === 'attack') {
          const cards = payload.cardIds.map(find).filter(Boolean);
          engineRef.doAttack(payload.playerIdx, cards);
        } else if (type === 'throw') {
          const card = find(payload.cardId);
          if (card) engineRef.doThrow(payload.playerIdx, card);
        } else if (type === 'transfer') {
          const card = find(payload.cardId);
          if (card) engineRef.doTransfer(payload.playerIdx, card);
        } else if (type === 'defense') {
          const defCard = find(payload.defenseCardId);
          if (defCard) engineRef.doDefend(payload.playerIdx, payload.attackPairIdx, defCard);
        } else if (type === 'take') {
          const defIdx = payload.playerIdx ?? action.seatIndex;
          engineRef.doTake(defIdx);
        } else if (type === 'attackDone') {
          engineRef.declareAttackDone(payload.playerIdx);
        } else if (type === 'rightNeighborPass') {
          engineRef.doRightNeighborPass(payload.playerIdx);
        } else if (type === 'nakiThrow') {
          const card = find(payload.cardId);
          if (card) engineRef.doNakiThrow(payload.playerIdx, card);
        } else if (type === 'nakiMultiple') {
          const cards = payload.cardIds.map(find).filter(Boolean);
          if (cards.length > 0) engineRef.doNakiThrowMultiple(payload.playerIdx, cards);
        } else if (type === 'nakiGiveToHand') {
          const cards = payload.cardIds.map(find).filter(Boolean);
          if (cards.length > 0) engineRef.doNakiGiveToHand(payload.playerIdx, cards);
        } else if (type === 'nakiGiveToHandPass') {
          engineRef.doNakiGiveToHandPass(payload.playerIdx);
        } else if (type === 'nakiPass') {
          engineRef.doNakiPass(payload.playerIdx);
        } else if (type === 'transferThrow') {
          const card = find(payload.cardId);
          if (card) engineRef.doTransferThrow(payload.throwerIdx, card);
        } else if (type === 'transferThrowPass') {
          engineRef.doTransferThrowPass(payload.throwerIdx);
        } else if (type === 'chooseTrump') {
          engineRef.doChooseTrump(payload.playerIdx, payload.suit);
        }
      } catch (e) {
        console.error('handlePendingAction error:', e);
      }
      mp.processingAction = false;
    }).catch(e => {
      console.error('handlePendingAction clear error:', e);
      mp.processingAction = false;
    });
  }

  async function changeMaxPlayers(n) {
    console.log('[changeMaxPlayers] called with', n, 'isHost:', mp.isHost, 'roomRef:', !!mp.roomRef);
    if (!mp.roomRef || !mp.isHost) {
      console.warn('[changeMaxPlayers] blocked — isHost:', mp.isHost, 'roomRef:', !!mp.roomRef);
      return;
    }
    await updateDoc(mp.roomRef, { maxPlayers: n }).catch(e =>
      console.error('[changeMaxPlayers] Firestore error:', e)
    );
    console.log('[changeMaxPlayers] Firestore updated to', n);
  }

  async function reorderPlayers(newOrderedPlayers) {
    if (!mp.roomRef || !mp.isHost) return;
    // Assign seatIndex 0..n-1 based on new array position
    const updated = newOrderedPlayers.map((p, i) => ({ ...p, seatIndex: i }));
    // Update host's own local seatIndex
    const me = updated.find(p => p.uid === mp.uid);
    if (me) mp.seatIndex = me.seatIndex;
    await updateDoc(mp.roomRef, { players: updated }).catch(e =>
      console.error('reorderPlayers error:', e)
    );
  }

  function sendAction(type, payload) {
    if (!mp.roomRef) return;
    updateDoc(mp.roomRef, {
      pendingAction: { uid: mp.uid, seatIndex: mp.seatIndex, type, payload: payload || {}, ts: Date.now() },
    }).catch(e => console.error('sendAction error:', e));
  }

  function mpAction(type, payload, localFn) {
    if (mp.enabled && !mp.isHost) {
      sendAction(type, payload);
    } else {
      if (localFn) localFn();
    }
  }

  // ─── Lobby browsing ─────────────────────────────────────────
  function startBrowsing() {
    if (roomsUnsubscribe) return;
    const database = getDb();
    const q = query(collection(database, 'rooms'), where('status', '==', 'lobby'));
    roomsUnsubscribe = onSnapshot(q, (snapshot) => {
      const rooms = [];
      const now = Date.now();
      const ageCutoff = now - 3 * 60 * 60 * 1000;
      const staleCutoff = now - 40 * 1000;
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.createdAt <= ageCutoff) return;
        if (data.hostLastSeen && data.hostLastSeen < staleCutoff) return;
        rooms.push({ code: docSnap.id, ...data });
      });
      rooms.sort((a, b) => b.createdAt - a.createdAt);
      if (onLobbyRooms) onLobbyRooms(rooms);
    }, (err) => {
      console.error('startBrowsing error:', err);
      // Clear so startBrowsing() can be retried once auth is ready
      roomsUnsubscribe = null;
    });
  }

  function stopBrowsing() {
    if (roomsUnsubscribe) { roomsUnsubscribe(); roomsUnsubscribe = null; }
  }

  function reset() {
    stopHeartbeat();
    if (mp.unsubscribe) { mp.unsubscribe(); mp.unsubscribe = null; }
    if (mp.roomRef) {
      if (mp.isHost) {
        updateDoc(mp.roomRef, { status: 'finished', gameState: null }).catch(() => {});
      } else {
        const ref = mp.roomRef;
        const uid = mp.uid;
        getDoc(ref).then(docSnap => {
          if (docSnap.exists() && docSnap.data().status === 'lobby') {
            const players = (docSnap.data().players || []).filter(p => p.uid !== uid);
            updateDoc(ref, { players }).catch(() => {});
          }
        }).catch(() => {});
      }
    }
    mp.enabled = false;
    mp.roomCode = null;
    mp.seatIndex = null;
    mp.isHost = false;
    mp.roomRef = null;
    mp.processingAction = false;
    mp.logRenderedCount = 0;
    if (onReset) onReset();
    startBrowsing();
  }

  // Cleanup on tab close
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (mp.roomRef && mp.isHost) {
        updateDoc(mp.roomRef, { status: 'finished', gameState: null }).catch(() => {});
      }
    });
  }

  return {
    getState: () => ({ ...mp }),
    getSeatIndex: () => mp.seatIndex,
    isEnabled: () => mp.enabled,
    isHost: () => mp.isHost,
    setEnabled: (val) => { mp.enabled = val; },
    // Устанавливает Firebase UID как основной идентификатор игрока
    setUid: (uid) => { if (uid) mp.uid = uid; },
    setEngine,
    createRoom,
    joinRoom,
    hostStartGame,
    changeMaxPlayers,
    reorderPlayers,
    mpAction,
    syncState,
    markGameOver,
    startBrowsing,
    stopBrowsing,
    reset,
  };
}
