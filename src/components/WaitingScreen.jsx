import React from 'react';

export default function WaitingScreen({ data, mpState, onStartGame, onBack }) {
  const players = data?.players || [];
  const maxPlayers = data?.maxPlayers || 4;
  const isHost = mpState?.isHost;
  const canStart = isHost && players.length >= 2;

  return (
    <div className="screen active setup-screen">
      <div className="setup-container" style={{ textAlign: 'center' }}>
        <h1 className="game-title">Бардак</h1>

        <div style={{ color: '#a0a090', marginBottom: 12, marginTop: 16 }}>
          {players.length}/{maxPlayers} игроков
        </div>

        <div style={{ marginBottom: 20 }}>
          {players.map((p, i) => (
            <div key={i} className="waiting-player">
              {p.name}{p.uid === data?.hostUid ? ' 👑' : ''}
            </div>
          ))}
        </div>

        {isHost && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: '#a0a090', fontSize: '0.85rem' }}>Мест в комнате:</label>
            <div className="player-count-buttons" style={{ justifyContent: 'center', marginTop: 8 }}>
              {[2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  className={`count-btn${maxPlayers === n ? ' active' : ''}`}
                  onClick={() => {/* host can update max players */}}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {isHost && (
          <button
            className="start-button"
            disabled={!canStart}
            onClick={onStartGame}
          >
            Начать игру!
          </button>
        )}

        <div style={{ color: '#a0a090', fontSize: '0.85rem', marginTop: 8 }}>
          {isHost ? 'Ожидание других игроков...' : 'Ожидание начала игры...'}
        </div>

        <button
          className="start-button"
          style={{ background: '#555', marginTop: 16 }}
          onClick={onBack}
        >
          ← Назад
        </button>
      </div>
    </div>
  );
}
