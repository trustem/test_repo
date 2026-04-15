import React, { useState, useEffect } from 'react';

export default function LobbyScreen({ rooms, onSolo, onCreateRoom, onJoinRoom }) {
  const [name, setName] = useState(() => localStorage.getItem('bardak_player_name') || '');

  useEffect(() => {
    if (name) localStorage.setItem('bardak_player_name', name);
  }, [name]);

  const handleCreate = async () => {
    const n = name.trim() || 'Хост';
    if (n !== 'Хост') localStorage.setItem('bardak_player_name', n);
    await onCreateRoom(n, 4);
  };

  const handleJoin = (code) => {
    const n = name.trim() || 'Игрок';
    onJoinRoom(code, n);
  };

  return (
    <div className="screen active lobby-screen">
      <div className="setup-container lobby-container">
        <h1 className="game-title">Бардак</h1>
        <h2 className="game-subtitle">Переводной Дурак</h2>

        <div className="setup-section" style={{ marginBottom: 14 }}>
          <label className="setup-label">Ваше имя:</label>
          <input
            type="text"
            maxLength={12}
            placeholder="Игрок"
            className="lobby-text-input"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div className="lobby-rooms-section">
          <div className="lobby-rooms-header">
            <span className="lobby-rooms-title">Открытые игры</span>
          </div>
          <div className="rooms-list">
            {rooms.length === 0
              ? <div className="rooms-empty">Нет открытых игр — создайте первую!</div>
              : rooms.map(room => {
                  const players = room.players || [];
                  const maxPlayers = room.maxPlayers || 4;
                  const isFull = players.length >= maxPlayers;
                  const hostName = players[0]?.name || '?';
                  return (
                    <div key={room.code} className="room-item">
                      <div className="room-item-info">
                        <div className="room-item-header">
                          <span className={`room-item-count${isFull ? ' full' : ''}`}>
                            {players.length}/{maxPlayers}
                          </span>
                          <span className="room-item-host">{hostName}</span>
                        </div>
                        <div className="room-item-players">
                          {players.map(p => p.name).join(', ')}
                        </div>
                      </div>
                      <button
                        className="room-join-btn"
                        disabled={isFull}
                        onClick={() => handleJoin(room.code)}
                      >
                        {isFull ? 'Заполнено' : 'Войти'}
                      </button>
                    </div>
                  );
                })
            }
          </div>
        </div>

        <button className="start-button lobby-create-btn" onClick={handleCreate}>
          + Создать игру
        </button>
        <button className="start-button lobby-solo-btn" onClick={onSolo}>
          Играть с ботами
        </button>
      </div>
    </div>
  );
}
