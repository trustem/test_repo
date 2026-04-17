import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createEngine } from './engine/index.js';
import { createMultiplayer } from './multiplayer/index.js';
import { initAuth, saveUserName, saveGameStats, SCORE_POINTS, SHAME_RANK_POINTS } from './auth/index.js';
import LobbyScreen from './components/LobbyScreen';
import SetupScreen from './components/SetupScreen';
import WaitingScreen from './components/WaitingScreen';
import GameScreen from './components/GameScreen';
import GameOverScreen from './components/GameOverScreen';
import RulesScreen from './components/RulesScreen';
import ProfileModal from './components/ProfileModal';
import LeaderboardModal from './components/LeaderboardModal';
import JoinRequestNotification from './components/JoinRequestNotification';

// ─── Compute a player's game result from G ───────────────────
// Returns { playerCount, rank, points, isWin } or null if bot/invalid
function getPlayerResult(G, seatIndex) {
  const player = G?.players?.[seatIndex];
  if (!player || player.isBot || !G.gameOver) return null;

  const playerCount = G.players.length;
  const isLoser = G.gameOverPlayer === seatIndex;

  if (isLoser) {
    const rank   = G.gameOverRank || 'Проебал';
    const points = SHAME_RANK_POINTS[rank] ?? 0;
    return { playerCount, rank, points, isWin: false };
  }

  // Non-loser: points = 14 − score (score 0→14pts, score 8→6pts)
  const score  = player.score ?? 0;
  const points = SCORE_POINTS[score] ?? Math.max(0, 14 - score);

  // Winner = highest exitOrder among all players
  const exits   = G.players.filter(p => p.exitOrder != null);
  const maxExit = exits.length > 0 ? Math.max(...exits.map(p => p.exitOrder)) : -1;
  const isWin   = player.exitOrder != null && player.exitOrder === maxExit;

  // Rank label: card name or generic middle-place label
  const CARD_LABELS = ['6', '7', '8', '9', '10', 'Валет', 'Дама', 'Король', 'Туз'];
  const rank = isWin ? 'Победа' : (CARD_LABELS[score] || String(score));

  return { playerCount, rank, points, isWin };
}

export default function App() {
  const [screen, setScreen]             = useState('lobby');
  const [showRules, setShowRules]       = useState(false);
  const [showProfile, setShowProfile]   = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [authReady, setAuthReady]       = useState(false);
  const [userProfile, setUserProfile]   = useState({ name: '', photoURL: null });
  const firebaseUidRef = useRef(null);

  const [gameState, setGameState]   = useState(null);
  const [uiState, setUiState]       = useState({ selectedCards: [], selectedAttackPairIdx: null });
  const [logEntries, setLogEntries] = useState([]);
  const [mpState, setMpState]       = useState({ enabled: false, isHost: false, seatIndex: null, roomCode: null });
  const [lobbyRooms, setLobbyRooms] = useState([]);
  const [lobbyError, setLobbyError] = useState(null);
  const [waitingData, setWaitingData]   = useState(null);
  const [gameOverData, setGameOverData] = useState(null);
  const [pendingJoinRequest, setPendingJoinRequest] = useState(null); // host: request to approve/reject
  const [joinRequestStatus, setJoinRequestStatus]   = useState(null); // player: null|'pending'|'rejected'|'blocked'
  const [joinRejectedAttemptsLeft, setJoinRejectedAttemptsLeft] = useState(0);

  const engineRef = useRef(null);
  const mpRef     = useRef(null);

  // ─── Log handler ─────────────────────────────────────────────
  const handleLog = useCallback((msg, type) => {
    setLogEntries(prev => {
      const next = [...prev, { msg, type, id: Date.now() + Math.random() }];
      return next.length > 120 ? next.slice(-120) : next;
    });
  }, []);

  // ─── Create engine once ──────────────────────────────────────
  if (!engineRef.current) {
    engineRef.current = createEngine({
      mpActionHandler: (type, payload, localFn) => {
        if (mpRef.current) mpRef.current.mpAction(type, payload, localFn);
        else localFn();
      },
      onPlayersActivated: (activatedPlayers) => {
        mpRef.current?.syncActivatedPlayers(activatedPlayers);
      },
      onUpdate: (G, UI) => {
        setGameState({ ...G });
        setUiState({ ...UI });
        if (mpRef.current?.isHost()) {
          mpRef.current.syncState(G);
          if (G.gameOver) mpRef.current.markGameOver();
        }
      },
      onGameOver: (G) => {
        setGameOverData({ ...G });
        setTimeout(() => setScreen('gameover'), 1200);

        // Save stats for the human player (host or solo)
        const uid = firebaseUidRef.current;
        if (uid) {
          const seatIndex = mpRef.current?.getSeatIndex() ?? G.players.findIndex(p => !p.isBot);
          const result = getPlayerResult(G, seatIndex);
          if (result) saveGameStats(uid, result);
        }
      },
      onLog: handleLog,
      getMpSeatIndex: () => mpRef.current?.getSeatIndex() ?? null,
    });
  }

  // ─── Create multiplayer once ──────────────────────────────────
  if (!mpRef.current) {
    mpRef.current = createMultiplayer({
      onRoomUpdate: (data) => {
        setWaitingData(data);
        setMpState(prev => ({ ...prev, ...mpRef.current.getState() }));
      },
      onGameStateUpdate: (state) => {
        setGameState({ ...state });
        // Keep local engine in sync so engine helper methods work in GameScreen
        engineRef.current?.loadState(state);
        // Enable multiplayer actions for non-host
        if (!mpRef.current.isHost()) mpRef.current.setEnabled(true);
        if (state.gameOver) {
          setGameOverData({ ...state });
          setTimeout(() => setScreen('gameover'), 1200);

          // Non-host saves their own stats
          const uid       = firebaseUidRef.current;
          const seatIndex = mpRef.current?.getSeatIndex();
          if (uid && seatIndex != null) {
            const result = getPlayerResult(state, seatIndex);
            if (result) saveGameStats(uid, result);
          }
        } else if (mpRef.current?.isSpectating()) {
          // Spectator: check if we've been added to G.players (activated at round boundary)
          const seatIndex = mpRef.current?.getSeatIndex();
          if (seatIndex != null && state.players?.[seatIndex]) {
            mpRef.current.setSpectating(false);
            setScreen('game');
          }
          // else stay on spectating screen, just update the game state view
        } else {
          setScreen('game');
        }
      },
      onLobbyRooms: (rooms) => setLobbyRooms(rooms),
      onReset: () => {
        setScreen('lobby');
        setMpState({ enabled: false, isHost: false, seatIndex: null, roomCode: null });
      },
      onLog: handleLog,
      onJoinRequest: (request) => setPendingJoinRequest(request),
      onJoinApproved: (gameState) => {
        setJoinRequestStatus(null);
        if (gameState) {
          engineRef.current?.loadState(gameState);
          setGameState({ ...gameState });
        }
        setMpState(mpRef.current.getState());
        setScreen('spectating');
      },
      onJoinRejected: (attemptsLeft) => {
        setJoinRejectedAttemptsLeft(attemptsLeft);
        setJoinRequestStatus(attemptsLeft <= 0 ? 'blocked' : 'rejected');
        mpRef.current?.startBrowsing();
      },
    });
  }

  useEffect(() => {
    if (mpRef.current && engineRef.current) mpRef.current.setEngine(engineRef.current);
  }, []);

  // ─── Init Firebase Auth + session reconnect ──────────────────
  useEffect(() => {
    initAuth().then(async ({ firebaseUid, name, photoURL }) => {
      firebaseUidRef.current = firebaseUid;
      if (mpRef.current && firebaseUid) {
        mpRef.current.setUid(firebaseUid);
        mpRef.current.startBrowsing();
      }
      setUserProfile({ name: name || '', photoURL: photoURL || null });
      setAuthReady(true);

      // ── Session reconnect ──────────────────────────────────────
      // Try to restore the last multiplayer session after page refresh
      const raw = localStorage.getItem('bardak_session');
      if (raw && mpRef.current) {
        try {
          const { roomCode } = JSON.parse(raw);
          const result = await mpRef.current.reconnect(roomCode);
          if (result?.type === 'waiting') {
            setWaitingData(result.roomData);
            setMpState(mpRef.current.getState());
            setScreen('waiting');
          } else if (result?.type === 'game' && result.gameState) {
            engineRef.current?.loadState(result.gameState);
            setGameState({ ...result.gameState });
            setMpState(mpRef.current.getState());
            if (mpRef.current.isHost()) {
              mpRef.current.setEnabled(true);
              // Restart bot timers — they're not persisted in Firestore
              engineRef.current?.resumeGame();
            }
            setScreen('game');
          } else if (result?.type === 'spectating') {
            if (result.gameState) {
              engineRef.current?.loadState(result.gameState);
              setGameState({ ...result.gameState });
            }
            setMpState(mpRef.current.getState());
            setScreen('spectating');
          }
        } catch (e) {
          console.warn('[app] session reconnect error:', e.message);
        }
      }
    });
  }, []);

  useEffect(() => {
    mpRef.current?.startBrowsing();
    return () => mpRef.current?.stopBrowsing();
  }, []);

  // ─── Navigation ──────────────────────────────────────────────
  const goLobby = useCallback(() => {
    mpRef.current?.reset();
    setScreen('lobby');
    setLogEntries([]);
    setGameState(null);
    setGameOverData(null);
  }, []);

  const goSetup = useCallback(() => {
    mpRef.current?.stopBrowsing();
    setScreen('setup');
  }, []);

  const startSoloGame = useCallback((playerDefs) => {
    mpRef.current?.setEnabled(false);
    setLogEntries([]);
    setGameState(null);
    setScreen('game');
    engineRef.current.startGame(playerDefs);
  }, []);

  const withTimeout = (promise, ms = 10000) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Нет ответа от сервера (${ms / 1000}с). Проверь интернет-соединение.`)), ms)),
  ]);

  const handleCreateRoom = useCallback(async (hostName, maxPlayers) => {
    setLobbyError(null);
    try {
      mpRef.current?.stopBrowsing();
      saveUserName(firebaseUidRef.current, hostName);
      await withTimeout(mpRef.current.createRoom(hostName, maxPlayers));
      setMpState(mpRef.current.getState());
      setScreen('waiting');
    } catch (e) { setLobbyError(e.message); }
  }, []);

  const handleJoinRoom = useCallback(async (code, playerName) => {
    setLobbyError(null);
    try {
      mpRef.current?.stopBrowsing();
      saveUserName(firebaseUidRef.current, playerName);
      const result = await withTimeout(mpRef.current.joinRoom(code, playerName));
      setMpState(mpRef.current.getState());
      if (result?.type === 'spectating') {
        if (result.gameState) {
          engineRef.current?.loadState(result.gameState);
          setGameState({ ...result.gameState });
        }
        setScreen('spectating');
      } else {
        setScreen('waiting');
      }
    } catch (e) { setLobbyError(e.message); }
  }, []);

  const handleRequestJoin = useCallback(async (code, playerName) => {
    setLobbyError(null);
    try {
      mpRef.current?.stopBrowsing();
      saveUserName(firebaseUidRef.current, playerName);
      await withTimeout(mpRef.current.requestJoin(code, playerName));
      setMpState(mpRef.current.getState());
      setJoinRequestStatus('pending');
    } catch (e) {
      mpRef.current?.startBrowsing();
      if (e.message === 'BLOCKED') {
        setLobbyError('Хост уже отказал вам 2 раза — вы не можете войти в эту игру.');
      } else {
        setLobbyError(e.message);
      }
    }
  }, []);

  const handleApproveJoin = useCallback(async (request) => {
    setPendingJoinRequest(null);
    await mpRef.current?.approveJoinRequest(request);
  }, []);

  const handleRejectJoin = useCallback(async (request) => {
    setPendingJoinRequest(null);
    await mpRef.current?.rejectJoinRequest(request);
  }, []);

  const handleCancelJoinRequest = useCallback(async () => {
    setJoinRequestStatus(null);
    await mpRef.current?.cancelJoinRequest();
    mpRef.current?.startBrowsing();
  }, []);

  const handleReorderPlayers = useCallback(async (newOrder) => {
    try {
      await mpRef.current.reorderPlayers(newOrder);
      setMpState(mpRef.current.getState());
    } catch (e) { console.error('reorder error:', e); }
  }, []);

  const handleChangeMaxPlayers = useCallback(async (n) => {
    try {
      await mpRef.current.changeMaxPlayers(n);
    } catch (e) { console.error('changeMaxPlayers error:', e); }
  }, []);

  const handleHostStartGame = useCallback(async () => {
    if (!waitingData) return;
    try {
      await mpRef.current.hostStartGame(waitingData, (playerDefs) => {
        setLogEntries([]);
        setGameState(null);
        setScreen('game');
        engineRef.current.startGame(playerDefs);
        mpRef.current.setEnabled(true);
      });
    } catch (e) { alert(e.message); }
  }, [waitingData]);

  const handlePlayAgain = useCallback(() => {
    if (mpState.enabled) mpRef.current?.reset();
    else setScreen('setup');
    setGameOverData(null);
  }, [mpState.enabled]);

  const handleProfileSave = useCallback(({ name, photoURL }) => {
    setUserProfile({ name, photoURL });
    setShowProfile(false);
  }, []);

  const engine = engineRef.current;

  // Merge live userProfile into profile object for ProfileModal
  const fullProfile = {
    ...userProfile,
    // totalRating, gamesPlayed etc. come from Firestore via UserStatsView
  };

  return (
    <div className="app-root" data-auth-ready={authReady || undefined}>
      {screen === 'lobby' && (
        <LobbyScreen
          rooms={lobbyRooms}
          userProfile={userProfile}
          error={lobbyError}
          onErrorDismiss={() => setLobbyError(null)}
          joinRequestStatus={joinRequestStatus}
          joinRejectedAttemptsLeft={joinRejectedAttemptsLeft}
          onJoinRequestDismiss={() => setJoinRequestStatus(null)}
          onCancelJoinRequest={handleCancelJoinRequest}
          onSolo={goSetup}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onRequestJoin={handleRequestJoin}
          onRules={() => setShowRules(true)}
          onProfile={() => setShowProfile(true)}
          onLeaderboard={() => setShowLeaderboard(true)}
        />
      )}

      {/* Host: incoming join request notification */}
      {pendingJoinRequest && (
        <JoinRequestNotification
          request={pendingJoinRequest}
          onApprove={handleApproveJoin}
          onReject={handleRejectJoin}
        />
      )}

      {showRules && <RulesScreen onClose={() => setShowRules(false)} />}

      {showProfile && (
        <ProfileModal
          firebaseUid={firebaseUidRef.current}
          initialName={userProfile.name}
          initialPhoto={userProfile.photoURL}
          profile={fullProfile}
          onSave={handleProfileSave}
          onClose={() => setShowProfile(false)}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal
          currentUid={firebaseUidRef.current}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {screen === 'setup' && (
        <SetupScreen onStart={startSoloGame} onBack={goLobby} />
      )}
      {screen === 'waiting' && (
        <WaitingScreen
          data={waitingData}
          mpState={mpState}
          onStartGame={handleHostStartGame}
          onReorderPlayers={handleReorderPlayers}
          onChangeMaxPlayers={handleChangeMaxPlayers}
          onBack={goLobby}
        />
      )}
      {screen === 'spectating' && gameState && (
        <GameScreen
          G={gameState}
          UI={uiState}
          logEntries={logEntries}
          engine={engine}
          mpState={mpState}
          onNewGame={goLobby}
          spectatorMode={true}
        />
      )}
      {screen === 'spectating' && !gameState && (
        <div className="loading-screen">
          <div className="loading-title">Бардак</div>
          <div className="loading-spinner">⟳</div>
          <div style={{ color: '#aaa', marginTop: 12, fontSize: '0.9rem' }}>Ожидание следующего раунда...</div>
        </div>
      )}

      {screen === 'game' && gameState && (
        <GameScreen
          G={gameState}
          UI={uiState}
          logEntries={logEntries}
          engine={engine}
          mpState={mpState}
          onNewGame={goLobby}
        />
      )}
      {screen === 'game' && !gameState && (
        <div className="loading-screen">
          <div className="loading-title">Бардак</div>
          <div className="loading-spinner">⟳</div>
        </div>
      )}
      {screen === 'gameover' && gameOverData && (
        <GameOverScreen G={gameOverData} onPlayAgain={handlePlayAgain} />
      )}
    </div>
  );
}
