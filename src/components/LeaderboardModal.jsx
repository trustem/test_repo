import React, { useState, useEffect } from 'react';
import { loadLeaderboard, loadGameHistory } from '../auth/index.js';
import UserStatsView from './UserStatsView.jsx';

function Avatar({ photoURL, name, size = 36 }) {
  return (
    <div className="lb-avatar" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {photoURL
        ? <img src={photoURL} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : <span>{(name || '?')[0].toUpperCase()}</span>
      }
    </div>
  );
}

export default function LeaderboardModal({ currentUid, onClose }) {
  const [players, setPlayers]     = useState(null); // null = loading
  const [selected, setSelected]   = useState(null); // { uid, profile }
  const [error, setError]         = useState('');

  useEffect(() => {
    loadLeaderboard(50)
      .then(list => setPlayers(list))
      .catch(() => setError('Не удалось загрузить таблицу'));
  }, []);

  const handleSelect = (player) => {
    setSelected({ uid: player.uid, profile: player });
  };

  return (
    <div className="lb-overlay" onClick={onClose}>
      <div className="lb-modal" onClick={e => e.stopPropagation()}>
        <button className="profile-close-btn" onClick={onClose}>✕</button>

        {selected ? (
          <>
            <div className="lb-detail-header">
              <button className="lb-back-btn" onClick={() => setSelected(null)}>← Назад</button>
              <div className="lb-detail-name">
                <Avatar photoURL={selected.profile.photoURL} name={selected.profile.name} size={32} />
                <span>{selected.profile.name || 'Игрок'}</span>
                {selected.uid === currentUid && <span className="lb-you-badge">Вы</span>}
              </div>
            </div>
            <div className="lb-detail-scroll">
              <UserStatsView uid={selected.uid} profile={selected.profile} />
            </div>
          </>
        ) : (
          <>
            <h2 className="profile-title">🏆 Лидерборд</h2>

            {error && <div className="profile-error">{error}</div>}

            {players === null ? (
              <div className="lb-loading">Загрузка...</div>
            ) : players.length === 0 ? (
              <div className="lb-empty">Никто ещё не сыграл ни одной игры</div>
            ) : (
              <div className="lb-list">
                {/* Header */}
                <div className="lb-row lb-row-head">
                  <span className="lb-col-rank">#</span>
                  <span className="lb-col-player">Игрок</span>
                  <span className="lb-col-rating">Рейтинг</span>
                  <span className="lb-col-avg">Среднее</span>
                  <span className="lb-col-games">Игр</span>
                  <span className="lb-col-win">Побед</span>
                </div>

                {players.map((p, i) => {
                  const isMe = p.uid === currentUid;
                  const games = p.gamesPlayed || 0;
                  const avg   = games > 0 ? (p.totalRating / games).toFixed(1) : '—';
                  const winPct = games > 0 ? Math.round((p.wins / games) * 100) : 0;
                  const shameActive = p.shameStatus?.expiresAt > Date.now();

                  return (
                    <div
                      key={p.uid}
                      className={`lb-row lb-row-player${isMe ? ' lb-row-me' : ''}`}
                      onClick={() => handleSelect(p)}
                    >
                      <span className="lb-col-rank lb-pos">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </span>
                      <span className="lb-col-player lb-player-cell">
                        <Avatar photoURL={p.photoURL} name={p.name} size={28} />
                        <span className="lb-player-name">
                          {p.name || 'Игрок'}
                          {isMe && <span className="lb-you-badge">Вы</span>}
                          {shameActive && <span className="lb-shame-dot" title={p.shameStatus.rank}>💀</span>}
                        </span>
                      </span>
                      <span className="lb-col-rating lb-rating-val">{p.totalRating ?? 0}</span>
                      <span className="lb-col-avg">{avg}</span>
                      <span className="lb-col-games">{games}</span>
                      <span className="lb-col-win">{winPct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
