import React from 'react';
import { cardLabel, isJoker, SCORE_LADDER, SUIT_SYM } from '../engine/index.js';

const PLAYER_POS_MAP = {
  1: ['top'],
  2: ['top-left', 'top-right'],
  3: ['left', 'top', 'right'],
  4: ['left', 'top-left', 'top-right', 'right'],
  5: ['left', 'top-left', 'top', 'top-right', 'right'],
};

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ScoreDots({ score }) {
  return (
    <div className="player-score-mini">
      {SCORE_LADDER.map((nom, i) => (
        <span
          key={i}
          className={[
            'score-pip',
            i < score ? 'filled' : '',
            i === score ? 'current' : '',
            nom === 'joker' ? 'joker-pip' : '',
          ].filter(Boolean).join(' ')}
          title={nom}
        />
      ))}
    </div>
  );
}

function NakiPanel({ nakiCards }) {
  if (!nakiCards || nakiCards.length === 0) return null;
  return (
    <div className="naki-panel">
      <div className="naki-panel-label">Накидка</div>
      <div className="naki-cards-row">
        {nakiCards.map((card, i) => {
          if (isJoker(card)) return <div key={i} className="naki-card-mini joker">🃏</div>;
          const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
          return (
            <div key={i} className={`naki-card-mini${isRed ? ' red' : ' black'}`}>
              {card.rank}<br />{SUIT_SYM[card.suit]}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Opponents({ G, debugMode }) {
  const hi = G.players.findIndex(p => !p.isBot);
  const nonHuman = G.players
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i !== hi);

  const currentAttackerIdx = G.attackerIdx;
  const positions = PLAYER_POS_MAP[nonHuman.length] || ['top'];

  return (
    <div className="players-area">
      {nonHuman.map(({ p, i: actualPi }, posIdx) => {
        const pos = positions[posIdx] || 'top';
        const isAtk = actualPi === currentAttackerIdx;
        const isDef = actualPi === G.defenderIdx;
        const isVertical = pos === 'left' || pos === 'right';
        const countStr = p.hand.length + (p.secretCard && !p.secretTaken ? '+1' : '');

        // ── Fan layout (normal mode) ────────────────────────────────────
        const fanCount = p.hand.length;
        const maxSpread = Math.min(70, fanCount * 14);
        const angleStep = fanCount > 1 ? maxSpread / (fanCount - 1) : 0;

        let handEl;
        if (debugMode) {
          const debugCards = p.hand.map((card, i) => {
            const lbl = cardLabel(card);
            const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
            return (
              <div key={i} className={`card-mini-debug${isJoker(card) ? ' joker' : (isRed ? ' red' : ' black')}`}>
                {lbl.top}{lbl.suit}
              </div>
            );
          });
          handEl = (
            <div className={isVertical ? 'bot-cards-wrap vertical' : 'bot-cards-wrap'}>
              <div className="bot-cards">{debugCards}</div>
            </div>
          );
        } else {
          const fanCards = p.hand.map((_, i) => {
            const angle = (i - (fanCount - 1) / 2) * angleStep;
            return (
              <div
                key={i}
                className="fan-card"
                style={{ transform: `rotate(${angle}deg)`, zIndex: i }}
              />
            );
          });
          handEl = (
            <div className="bot-fan-wrap">
              <div className="bot-fan">{fanCards}</div>
            </div>
          );
        }

        let secretEl = null;
        if (!p.secretTaken && p.secretCard) {
          if (p.secretRevealed || debugMode) {
            const lbl = cardLabel(p.secretCard);
            const isRed = p.secretCard.suit === 'hearts' || p.secretCard.suit === 'diamonds';
            secretEl = (
              <div className="secret-card-wrap">
                <div
                  className={`card-back-mini secret-card${p.secretRevealed ? ' secret-revealed' : ''}${debugMode ? (isJoker(p.secretCard) ? ' joker' : (isRed ? ' red' : ' black')) : ''}`}
                  style={debugMode ? { border: '2px dashed #9333ea' } : undefined}
                >
                  {(p.secretRevealed || debugMode) && lbl.top}
                </div>
                <span className="secret-label">⚠ Потайная</span>
              </div>
            );
          } else {
            secretEl = (
              <div className="secret-card-wrap">
                <div className="card-back-mini secret-card" />
                <span className="secret-label">⚠ Потайная</span>
              </div>
            );
          }
        }

        // Show naki drop zone on defender box when it's the human's turn to throw
        const isNakiTarget =
          G.phase === 'nakidyvanie' &&
          G.nakiGiveToHandPending.length === 0 &&
          G.nakiPending.length > 0 &&
          G.nakiPending[0] === hi &&
          actualPi === G.defenderIdx;

        return (
          <div
            key={actualPi}
            className={[
              'player-info-box',
              `player-pos-${pos}`,
              isAtk ? 'attacker' : '',
              isDef ? 'defender' : '',
              p.exited ? 'exited' : '',
              isNakiTarget ? 'naki-drop-target' : '',
            ].filter(Boolean).join(' ')}
            data-drop-zone={isNakiTarget ? 'naki' : undefined}
          >
            {isNakiTarget && (
              <div className="naki-drop-zone">
                <span className="naki-drop-label">Накинуть</span>
              </div>
            )}
            {handEl}
            {secretEl}
            <div className="player-nameplate">
              <span className="player-nameplate-name">{p.name}</span>
              <span className="player-nameplate-count">Карт: {countStr}</span>
            </div>
            <ScoreDots score={p.score} />
            {isDef && <span className="player-role-badge badge-defender">Защита</span>}
            {isAtk && <span className="player-role-badge badge-attacker">Атака</span>}
            {p.exited && <span className="player-role-badge badge-out">Вышел</span>}
            <NakiPanel nakiCards={p.nakiDisplayCards?.length > 0 ? p.nakiDisplayCards : p.nakiCards} />
          </div>
        );
      })}

      {/* Human player badge */}
      {hi !== -1 && (() => {
        const hp = G.players[hi];
        const isHAtk = hi === currentAttackerIdx;
        const isHDef = hi === G.defenderIdx;
        const hCountStr = hp.hand.length + (hp.secretCard && !hp.secretTaken ? '+1' : '');
        return (
          <div className={`player-info-box player-pos-bottom${isHAtk ? ' attacker' : ''}${isHDef ? ' defender' : ''}`}>
            <div className="player-nameplate human">
              <span className="player-nameplate-name">Вы</span>
              <span className="player-nameplate-count">Карт: {hCountStr}</span>
            </div>
            {isHDef && <span className="player-role-badge badge-defender">Защита</span>}
            {isHAtk && <span className="player-role-badge badge-attacker">Атака</span>}
          </div>
        );
      })()}
    </div>
  );
}
