import React, { useState } from 'react';
import { SCORE_LADDER } from '../engine/index.js';
import HumiliationOverlay from './HumiliationOverlay';

const SPECIAL_RANKS = new Set([
  'Проебал', 'Суперпроебал', 'Супермегапроебал',
  'Суперотсосал', 'Супермегаотсосал', 'Королевский отсос',
]);

export default function GameOverScreen({ G, onPlayAgain }) {
  const hasHumiliation = G.gameOverRank && SPECIAL_RANKS.has(G.gameOverRank);
  const [showHumil, setShowHumil] = useState(hasHumiliation);

  const loser = G.players[G.gameOverPlayer];
  const rank = G.gameOverRank;

  if (showHumil) {
    return <HumiliationOverlay G={G} onContinue={() => setShowHumil(false)} />;
  }

  return (
    <div className="screen active gameover-screen">
      <div className="gameover-container">
        <h1 className="gameover-title">
          {rank ? `💀 ${rank.toUpperCase()} 💀` : 'Игра окончена'}
        </h1>

        {loser && rank && (
          <div className="gameover-details">
            <strong>{loser.name}</strong> — {rank}
          </div>
        )}

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
