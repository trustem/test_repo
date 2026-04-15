import React, { useState } from 'react';

export default function SetupScreen({ onStart, onBack }) {
  const [playerCount, setPlayerCount] = useState(2);
  const [playerDefs, setPlayerDefs] = useState(() => {
    const humanName = localStorage.getItem('bardak_player_name') || 'Игрок';
    return [
      { name: humanName, isBot: false },
      { name: 'Бот 1', isBot: true },
    ];
  });

  const updateCount = (n) => {
    setPlayerCount(n);
    setPlayerDefs(prev => {
      const humanName = localStorage.getItem('bardak_player_name') || 'Игрок';
      const next = [];
      for (let i = 0; i < n; i++) {
        if (i < prev.length) {
          next.push(prev[i]);
        } else {
          next.push({ name: `Бот ${i}`, isBot: true });
        }
      }
      if (next.length > 0 && next[0].name !== humanName) {
        next[0] = { ...next[0], name: humanName };
      }
      return next;
    });
  };

  const updatePlayer = (idx, field, value) => {
    setPlayerDefs(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleStart = () => {
    if (!playerDefs.some(p => !p.isBot)) {
      alert('Нужен хотя бы один живой игрок!');
      return;
    }
    const human = playerDefs.find(p => !p.isBot);
    if (human) localStorage.setItem('bardak_player_name', human.name);
    onStart(playerDefs.map(p => ({ name: p.name.trim() || 'Игрок', isBot: p.isBot })));
  };

  return (
    <div className="screen active setup-screen">
      <div className="setup-container">
        <h1 className="game-title">Бардак</h1>
        <h2 className="game-subtitle">Переводной Дурак</h2>

        <div className="setup-section">
          <label className="setup-label">Количество игроков:</label>
          <div className="player-count-buttons">
            {[2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                className={`count-btn${playerCount === n ? ' active' : ''}`}
                onClick={() => updateCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <div id="player-slots">
            {playerDefs.map((p, i) => (
              <div key={i} className="player-slot">
                <span className="player-slot-num">{i + 1}</span>
                <input
                  type="text"
                  maxLength={12}
                  value={p.name}
                  onChange={e => updatePlayer(i, 'name', e.target.value)}
                />
                <div className="type-toggle">
                  <button
                    className={!p.isBot ? 'active' : ''}
                    onClick={() => updatePlayer(i, 'isBot', false)}
                  >
                    Человек
                  </button>
                  <button
                    className={p.isBot ? 'active' : ''}
                    onClick={() => updatePlayer(i, 'isBot', true)}
                  >
                    Бот
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button className="start-button" onClick={handleStart}>Начать игру!</button>
        <button className="start-button" style={{ background: '#555', marginTop: 8 }} onClick={onBack}>
          ← Назад
        </button>
      </div>
    </div>
  );
}
