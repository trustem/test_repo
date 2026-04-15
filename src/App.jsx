import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createEngine } from './engine/index.js';
import { createMultiplayer } from './multiplayer/index.js';
import LobbyScreen from './components/LobbyScreen';
import SetupScreen from './components/SetupScreen';
import WaitingScreen from './components/WaitingScreen';
import GameScreen from './components/GameScreen';
import GameOverScreen from './components/GameOverScreen';

export default function App() {
  const [screen, setScreen] = useState('lobby'); // lobby | setup | waiting | game | gameover
  const [gameState, setGameState] = useState(null);
  const [uiState, setUiState] = useState({ selectedCards: [], selectedAttackPairIdx: null });
  const [logEntries, setLogEntries] = useState([]);
  const [mpState, setMpState] = useState({ enabled: false, isHost: false, seatIndex: null, roomCode: null });
  const [lobbyRooms, setLobbyRooms] = useState([]);
  const [waitingData, setWaitingData] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);

  const engineRef = useRef(null);
  const mpRef = useRef(null);

  // ─── Log handler ─────────────────────────────────────────────
  const handleLog = useCallback((msg, type) => {
    setLogEntries(prev => {
      const next = [...prev, { msg, type, id: Date.now() + Math.random() }];
      return next.length > 120 ? next.slice(next.length - 120) : next;
    });
  }, []);

  // ─── Create engine once ──────────────────────────────────────
  if (!engineRef.current) {
    engineRef.current = createEngine({
      onUpdate: (G, UI) => {
        setGameState({ ...G });
        setUiState({ ...UI });
        // After-render: sync multiplayer
        if (mpRef.current && mpRef.current.isHost()) {
          mpRef.current.syncState(G);
          if (G.gameOver) mpRef.current.markGameOver();
        }
      },
      onGameOver: (G) => {
        setGameOverData({ ...G });
        setTimeout(() => setScreen('gameover'), 1200);
      },
      onLog: handleLog,
      getMpSeatIndex: () => mpRef.current ? mpRef.current.getSeatIndex() : null,
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
        if (!engineRef.current) return;
        setScreen('game');
      },
      onLobbyRooms: (rooms) => setLobbyRooms(rooms),
      onReset: () => {
        setScreen('lobby');
        setMpState({ enabled: false, isHost: false, seatIndex: null, roomCode: null });
      },
      onLog: handleLog,
    });
  }

  // Wire engine to multiplayer
  useEffect(() => {
    if (mpRef.current && engineRef.current) {
      mpRef.current.setEngine(engineRef.current);
    }
  }, []);

  // ─── Lobby browsing on mount ──────────────────────────────────
  useEffect(() => {
    mpRef.current?.startBrowsing();
    return () => mpRef.current?.stopBrowsing();
  }, []);

  // ─── Screen navigation handlers ──────────────────────────────
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
      const result = await mpRef.current.createRoom(hostName, maxPlayers);
      setMpState(mpRef.current.getState());
      setScreen('waiting');
    } catch (e) {
      alert(e.message);
    }
  }, []);

  const handleJoinRoom = useCallback(async (code, playerName) => {
    try {
      mpRef.current?.stopBrowsing();
      await mpRef.current.joinRoom(code, playerName);
      setMpState(mpRef.current.getState());
      setScreen('waiting');
    } catch (e) {
      alert(e.message);
    }
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
    } catch (e) {
      alert(e.message);
    }
  }, [waitingData]);

  const handlePlayAgain = useCallback(() => {
    if (mpState.enabled) {
      mpRef.current?.reset();
    } else {
      setScreen('setup');
    }
    setGameOverData(null);
  }, [mpState.enabled]);

  // ─── Engine helpers exposed to GameScreen ────────────────────
  const engine = engineRef.current;

  return (
    <div className="app-root">
      {screen === 'lobby' && (
        <LobbyScreen
          rooms={lobbyRooms}
          onSolo={goSetup}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
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
        <GameOverScreen
          G={gameOverData}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}
