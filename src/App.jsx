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
  const [waitingData, setWaitingData]   = useState(null);
  const [gameOverData, setGameOverData] = useState(null);

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
    });
  }

  useEffect(() => {
    if (mpRef.current && engineRef.current) mpRef.current.setEngine(engineRef.current);
  }, []);

  // ─── Init Firebase Auth ───────────────────────────────────────
  useEffect(() => {
    initAuth().then(({ firebaseUid, name, photoURL }) => {
      firebaseUidRef.current = firebaseUid;
      if (mpRef.current && firebaseUid) {
        mpRef.current.setUid(firebaseUid);
        // Restart browsing now that Firebase Auth is ready — the earlier
        // startBrowsing() call may have failed with "permission denied" because
        // anonymous sign-in wasn't complete yet. Calling again is safe: it
        // no-ops if the subscription is already live, or re-subscribes if it
        // failed and cleared itself.
        mpRef.current.startBrowsing();
      }
      setUserProfile({ name: name || '', photoURL: photoURL || null });
      setAuthReady(true);
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

  const handleCreateRoom = useCallback(async (hostName, maxPlayers) => {
    try {
      mpRef.current?.stopBrowsing();
      saveUserName(firebaseUidRef.current, hostName);
      await mpRef.current.createRoom(hostName, maxPlayers);
      setMpState(mpRef.current.getState());
      setScreen('waiting');
    } catch (e) { alert(e.message); }
  }, []);

  const handleJoinRoom = useCallback(async (code, playerName) => {
    try {
      mpRef.current?.stopBrowsing();
      saveUserName(firebaseUidRef.current, playerName);
      await mpRef.current.joinRoom(code, playerName);
      setMpState(mpRef.current.getState());
      setScreen('waiting');
    } catch (e) { alert(e.message); }
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
          onSolo={goSetup}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onRules={() => setShowRules(true)}
          onProfile={() => setShowProfile(true)}
          onLeaderboard={() => setShowLeaderboard(true)}
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
