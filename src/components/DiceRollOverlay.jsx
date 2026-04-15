import React, { useState, useEffect } from 'react';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function DicePlayer({ name, dice, rolling, isWinner, isTied }) {
  const [display, setDisplay] = useState([dice[0], dice[1]]);

  useEffect(() => {
    if (!rolling) {
      setDisplay([dice[0], dice[1]]);
      return;
    }
    const iv = setInterval(() => {
      setDisplay([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ]);
    }, 80);
    return () => clearInterval(iv);
  }, [rolling, dice[0], dice[1]]);

  return (
    <div className={`dice-player${isWinner ? ' dice-winner' : ''}${isTied ? ' dice-tied' : ''}`}>
      <div className="dice-player-name">{name}</div>
      <div className="dice-pair">
        <span className="die">{DICE_FACES[display[0] - 1]}</span>
        <span className="die">{DICE_FACES[display[1] - 1]}</span>
      </div>
      {!rolling && (
        <div className="dice-sum">{dice[0] + dice[1]}</div>
      )}
    </div>
  );
}

export default function DiceRollOverlay({ G, engine }) {
  const [rolling, setRolling] = useState(true);

  // Restart animation whenever a new roll is generated (diceRollKey increments)
  useEffect(() => {
    if (!G.dicePhase) return;
    setRolling(true);
    const t = setTimeout(() => setRolling(false), 2000);
    return () => clearTimeout(t);
  }, [G.diceRollKey]);

  // Auto-resolve 1.5s after revealing results
  useEffect(() => {
    if (!G.dicePhase || rolling) return;
    const t = setTimeout(() => engine.resolveDiceRoll(), 1500);
    return () => clearTimeout(t);
  }, [G.dicePhase, rolling]);

  if (!G.dicePhase) return null;

  const sums = {};
  for (const idx of G.diceParticipants) {
    const r = G.diceResults[idx];
    sums[idx] = r ? r[0] + r[1] : 0;
  }
  const maxSum = G.diceParticipants.length > 0
    ? Math.max(...Object.values(sums))
    : 0;
  const winners = !rolling
    ? G.diceParticipants.filter(idx => sums[idx] === maxSum)
    : [];

  return (
    <div className="dice-overlay">
      <div className="dice-box">
        <div className="dice-title">🎲 Бросок костей</div>
        <div className="dice-subtitle">Победитель выбирает козырь</div>
        <div className="dice-players-row">
          {G.diceParticipants.map(idx => {
            const r = G.diceResults[idx] || [1, 1];
            return (
              <DicePlayer
                key={idx}
                name={G.players[idx].name}
                dice={r}
                rolling={rolling}
                isWinner={winners.length === 1 && winners[0] === idx}
                isTied={winners.length > 1 && winners.includes(idx)}
              />
            );
          })}
        </div>
        {!rolling && (
          <div className="dice-result-text">
            {winners.length > 1
              ? `Ничья! Перебрасывают: ${winners.map(i => G.players[i].name).join(', ')}...`
              : `${G.players[winners[0]]?.name} выбирает козырь!`
            }
          </div>
        )}
      </div>
    </div>
  );
}
