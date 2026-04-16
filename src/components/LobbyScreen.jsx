import React, { useState, useEffect } from 'react';
import { linkGoogleAccount, isLinkedToGoogle, getGoogleEmail } from '../auth/index.js';

export default function LobbyScreen({ rooms, userProfile = {}, error, onErrorDismiss, onSolo, onCreateRoom, onJoinRoom, onRules, onProfile, onLeaderboard }) {
  const [name, setName] = useState(() => userProfile.name || localStorage.getItem('bardak_player_name') || '');

  // Sync name when profile changes externally (e.g. after profile save)
  useEffect(() => {
    if (userProfile.name) setName(userProfile.name);
  }, [userProfile.name]);

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

  const photo = userProfile.photoURL;
  const googleLinked = isLinkedToGoogle();
  const googleEmail = googleLinked ? getGoogleEmail() : null;

  const [googleError, setGoogleError] = useState(null);

  const handleGoogleLink = async () => {
    setGoogleError(null);
    try {
      await linkGoogleAccount();
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        setGoogleError(e.message);
      }
    }
  };

  return (
    <div className="screen active lobby-screen">
      <div className="setup-container lobby-container">
        <h1 className="game-title">Бардак</h1>
        <h2 className="game-subtitle">Переводной Дурак</h2>

        {/* Profile row */}
        <div className="lobby-profile-row">
          <div className="lobby-avatar-col">
            <button className="lobby-avatar-btn" onClick={onProfile} title="Открыть профиль">
              {photo
                ? <img src={photo} alt="avatar" className="lobby-avatar-img" />
                : <span className="lobby-avatar-placeholder">👤</span>
              }
              <span className="lobby-avatar-edit">✏️</span>
            </button>
            <button
              className={`lobby-google-btn${googleLinked ? ' linked' : ''}`}
              onClick={googleLinked ? undefined : handleGoogleLink}
              title={googleLinked ? googleEmail || 'Google подключён' : 'Войти через Google'}
            >
              <svg viewBox="0 0 18 18" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              {googleLinked ? '✓' : ''}
            </button>
          </div>
          <div className="lobby-name-wrap">
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

        {(error || googleError) && (
          <div className="lobby-error-banner" onClick={onErrorDismiss}>
            {error || googleError}
          </div>
        )}

        <button className="start-button lobby-create-btn" onClick={handleCreate}>
          + Создать игру
        </button>
        <button className="start-button lobby-solo-btn" onClick={onSolo}>
          Играть с ботами
        </button>
        <button className="start-button lobby-rules-btn" onClick={onRules}>
          📖 Правила игры
        </button>
        <button className="start-button lobby-lb-btn" onClick={onLeaderboard}>
          🏆 Лидерборд
        </button>
      </div>
    </div>
  );
}
