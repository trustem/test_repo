import React from 'react';
import { SCORE_LADDER } from '../engine/index.js';

const TITLES = {
  'Проебал': 'ПРОЕБАЛ',
  'Суперпроебал': 'СУПЕРПРОЕБАЛ',
  'Супермегапроебал': 'СУПЕРМЕГАПРОЕБАЛ',
  'Суперотсосал': 'СУПЕРОТСОСАЛ',
  'Супермегаотсосал': 'СУПЕРМЕГАОТСОСАЛ',
  'Королевский отсос': '👑 КОРОЛЕВСКИЙ ОТСОС 👑',
};

export default function GameOverScreen({ G, onPlayAgain }) {
  const loser = G.players[G.gameOverPlayer];
  const rank = G.gameOverRank;
  const title = TITLES[rank] || rank;

  return (
    <div className="screen active gameover-screen">
      <div className="gameover-container">
        <h1 className="gameover-title">{title}</h1>
        <div className="gameover-details">
          <strong>{loser?.name}</strong> — {rank}<br />
          Счёт: {SCORE_LADDER[loser?.score]}
        </div>
        <div className="scores-display">
          <h3>Итоговые счета:</h3>
          {G.players.map(p => (
            <div key={p.id} className="score-row">
              <span className="score-row-name">{p.name}</span>
              <span className="score-row-val">{SCORE_LADDER[p.score]}</span>
            </div>
          ))}
        </div>
        <button className="start-button" onClick={onPlayAgain}>
          Играть снова
        </button>
      </div>
    </div>
  );
}
