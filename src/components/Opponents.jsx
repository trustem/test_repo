import React from 'react';
import { cardLabel, isJoker, SCORE_LADDER, SUIT_SYM } from '../engine/index.js';

// ── Position map (desktop / non-mobile) ──────────────────────────────────────
const PLAYER_POS_MAP = {
  1: ['top'],
  2: ['top-left', 'top-right'],
  3: ['left', 'top', 'right'],
  4: ['left', 'top-left', 'top-right', 'right'],
  5: ['left-top', 'left-bot', 'top', 'right-top', 'right-bot'],
};

// ── Score dots ────────────────────────────────────────────────────────────────
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

// ── Naki panel ────────────────────────────────────────────────────────────────
const NAKI_OFFSET_BOT = 14;
function NakiPanel({ nakiCards, targetNominal }) {
  const cards = nakiCards ?? [];
  const n = cards.length;
  const containerW = n === 0 ? 34 : 34 + (n - 1) * NAKI_OFFSET_BOT;
  return (
    <div className="naki-panel">
      <div className="naki-cards-row" style={{ position: 'relative', width: containerW, height: 48 }}>
        {n === 0 && (
          <div className="naki-ghost-card naki-ghost-bot" style={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
            {targetNominal}
          </div>
        )}
        {cards.map((card, i) => {
          if (isJoker(card)) return (
            <div key={i} className="naki-card-mini joker" style={{ position: 'absolute', top: 0, left: i * NAKI_OFFSET_BOT, zIndex: i + 1 }}>🃏</div>
          );
          const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
          return (
            <div key={i} className={`naki-card-mini${isRed ? ' red' : ' black'}`} style={{ position: 'absolute', top: 0, left: i * NAKI_OFFSET_BOT, zIndex: i + 1 }}>
              <span className="naki-card-rank">{card.rank}</span>
              <span className="naki-card-suit">{SUIT_SYM[card.suit]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Side bot fan: compact horizontal fan, overlap scales with card count ──────
// Cards flow right-to-left (card 0 is leftmost visually, placed at right edge).
// This matches the right-column layout where the fan opens towards the table.
function SideBotFan({ count }) {
  const n = Math.min(count, 12);
  if (n === 0) return null;

  const CW = 16; // card width px (reduced for more table space)
  const CH = 24; // card height px
  // Maximum fan width — must fit inside the side column (~92px) minus secret card (~16px) and gap (4px)
  const MAX_FAN_W = 50;
  const OL = n > 1 ? Math.min(7, Math.floor(MAX_FAN_W / (n - 1))) : 0;
  const fanW = OL * (n - 1) + CW;
  const MAXROT = 18;

  return (
    <div
      className="side-bot-fan"
      style={{ width: fanW, height: CH + 8, position: 'relative', flexShrink: 0 }}
    >
      {Array.from({ length: n }, (_, i) => {
        const t   = n > 1 ? i / (n - 1) : 0.5;
        // Flip: i=0 → rightmost card, i=n-1 → leftmost card
        const xOff = fanW - CW - i * OL;
        const yOff = Math.pow(t - 0.5, 2) * 7;
        const rot  = (t - 0.5) * MAXROT * 2;
        return (
          <div
            key={i}
            className="side-fan-card"
            style={{
              width:           CW,
              height:          CH,
              top:             yOff,
              left:            xOff,
              zIndex:          i,
              transformOrigin: 'bottom center',
              transform:       `rotate(${rot}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Opponents({ G, hi: hiProp, debugMode }) {
  const hi         = hiProp ?? G.players.findIndex(p => !p.isBot);
  const nonHuman   = G.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== hi);
  const currentAttackerIdx = G.attackerIdx;

  const isMobile = window.innerWidth <= 600;

  // ── Mobile layout: max 2 top bots, remaining on right side ────────────────
  const topBots  = isMobile ? nonHuman.slice(0, 2) : [];
  const sideBots = isMobile ? nonHuman.slice(2)    : [];

  // Top bot cx values (percentage of screen width)
  // 1 bot → left-center; 2 bots → left quarter and center
  const topCX = topBots.length === 1 ? ['35%'] : ['20%', '45%'];

  // Side bot vertical positions (percentage of viewport height)
  // Zone: 10% → 62% (below top bots, above action buttons)
  const SIDE_TOP_PCT    = 10;
  const SIDE_BOTTOM_PCT = 62;
  const sideSlotPct     = sideBots.length
    ? (SIDE_BOTTOM_PCT - SIDE_TOP_PCT) / sideBots.length
    : 0;

  // ── Render helper: shared bot content ─────────────────────────────────────
  function renderBotContent(p, actualPi, isSide) {
    const fanCount = p.hand.length;

    // ── Hand element ──────────────────────────────────────────────────────
    let handEl;
    if (debugMode) {
      const debugCards = p.hand.map((card, i) => {
        const lbl   = cardLabel(card);
        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        return (
          <div key={i} className={`card-mini-debug${isJoker(card) ? ' joker' : (isRed ? ' red' : ' black')}`}>
            {lbl.top}{lbl.suit}
          </div>
        );
      });
      handEl = (
        <div className={`bot-cards-wrap${isSide ? ' vertical' : ''}`}>
          <div className="bot-cards">{debugCards}</div>
        </div>
      );
    } else if (isMobile) {
      // Compact horizontal fan for ALL mobile bots (top and side)
      handEl = <SideBotFan count={fanCount} />;
    } else {
      // Desktop: standard rotated fan
      const maxSpread = Math.min(70, fanCount * 14);
      const angleStep = fanCount > 1 ? maxSpread / (fanCount - 1) : 0;
      handEl = (
        <div className="bot-fan-wrap">
          <div className="bot-fan">
            {p.hand.map((_, i) => {
              const angle = (i - (fanCount - 1) / 2) * angleStep;
              return <div key={i} className="fan-card" style={{ transform: `rotate(${angle}deg)`, zIndex: i }} />;
            })}
          </div>
        </div>
      );
    }

    // ── Secret card element ───────────────────────────────────────────────
    let secretEl = null;
    if (!p.secretTaken && p.secretCard) {
      if (isMobile) {
        // Compact inline secret card for ALL mobile bots
        const lbl   = p.secretRevealed || debugMode ? cardLabel(p.secretCard) : null;
        const isRed = p.secretCard.suit === 'hearts' || p.secretCard.suit === 'diamonds';
        secretEl = (
          <div
            className={`side-secret-mini${p.secretRevealed ? ' secret-revealed' : ''}${debugMode && lbl ? (isJoker(p.secretCard) ? ' joker' : (isRed ? ' red' : ' black')) : ''}`}
            style={debugMode ? { border: '2px dashed #9333ea' } : undefined}
          >
            {lbl && lbl.top}
          </div>
        );
      } else {
        // Desktop: larger secret card with label
        if (p.secretRevealed || debugMode) {
          const lbl   = cardLabel(p.secretCard);
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
    }

    // ── Naki drop zone ────────────────────────────────────────────────────
    const isNakiTarget =
      G.phase === 'nakidyvanie' &&
      G.nakiGiveToHandPending.length === 0 &&
      G.nakiPending.length > 0 &&
      G.nakiPending[0] === hi &&
      actualPi === G.defenderIdx;

    // Mobile: all bots use compact layout (name → [fan + secret] → naki)
    if (isMobile) {
      return (
        <>
          {isNakiTarget && (
            <div className="naki-drop-zone">
              <span className="naki-drop-label">Накинуть</span>
            </div>
          )}
          <div className="player-nameplate">
            <span className="player-nameplate-name">{p.name}</span>
          </div>
          {p.exited && <span className="player-role-badge badge-out">Вышел</span>}
          <div className="side-bot-hand-row">
            {handEl}
            {secretEl}
          </div>
          <NakiPanel
            nakiCards={p.nakiDisplayCards?.length > 0 ? p.nakiDisplayCards : p.nakiCards}
            targetNominal={SCORE_LADDER[p.score]}
          />
        </>
      );
    }

    // Desktop (top bots): fan → secret → nameplate → score dots → naki
    return (
      <>
        {isNakiTarget && (
          <div className="naki-drop-zone">
            <span className="naki-drop-label">Накинуть</span>
          </div>
        )}
        {handEl}
        {secretEl}
        <div className="player-nameplate">
          <span className="player-nameplate-name">{p.name}</span>
        </div>
        <ScoreDots score={p.score} />
        {p.exited && <span className="player-role-badge badge-out">Вышел</span>}
        <NakiPanel
          nakiCards={p.nakiDisplayCards?.length > 0 ? p.nakiDisplayCards : p.nakiCards}
          targetNominal={SCORE_LADDER[p.score]}
        />
      </>
    );
  }

  return (
    <div className="players-area">

      {/* ── MOBILE: top bots ───────────────────────────────────────────── */}
      {isMobile && topBots.map(({ p, i: actualPi }, posIdx) => {
        const isAtk = actualPi === currentAttackerIdx;
        const isDef = actualPi === G.defenderIdx;
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
              'player-pos-top-mobile',
              isAtk ? 'attacker' : '',
              isDef ? 'defender' : '',
              p.exited ? 'exited' : '',
              isNakiTarget ? 'naki-drop-target' : '',
            ].filter(Boolean).join(' ')}
            style={{ left: topCX[posIdx], transform: 'translateX(-50%)' }}
            data-drop-zone={isNakiTarget ? 'naki' : undefined}
          >
            {renderBotContent(p, actualPi, false)}
          </div>
        );
      })}

      {/* ── MOBILE: side bots (right column) ───────────────────────────── */}
      {isMobile && sideBots.map(({ p, i: actualPi }, posIdx) => {
        const isAtk = actualPi === currentAttackerIdx;
        const isDef = actualPi === G.defenderIdx;
        const isNakiTarget =
          G.phase === 'nakidyvanie' &&
          G.nakiGiveToHandPending.length === 0 &&
          G.nakiPending.length > 0 &&
          G.nakiPending[0] === hi &&
          actualPi === G.defenderIdx;

        const midTopPct = SIDE_TOP_PCT + (posIdx + 0.5) * sideSlotPct;

        return (
          <div
            key={actualPi}
            className={[
              'player-info-box',
              'side-bot-box',
              isAtk ? 'attacker' : '',
              isDef ? 'defender' : '',
              p.exited ? 'exited' : '',
              isNakiTarget ? 'naki-drop-target' : '',
            ].filter(Boolean).join(' ')}
            style={{ top: `${midTopPct}%`, transform: 'translateY(-50%)' }}
            data-drop-zone={isNakiTarget ? 'naki' : undefined}
          >
            {renderBotContent(p, actualPi, true)}
          </div>
        );
      })}

      {/* ── DESKTOP: all bots with old PLAYER_POS_MAP ──────────────────── */}
      {!isMobile && nonHuman.map(({ p, i: actualPi }, posIdx) => {
        const pos    = (PLAYER_POS_MAP[nonHuman.length] || ['top'])[posIdx] || 'top';
        const isAtk  = actualPi === currentAttackerIdx;
        const isDef  = actualPi === G.defenderIdx;
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
            {renderBotContent(p, actualPi, false)}
          </div>
        );
      })}

      {/* Human badge removed — role shown via hand-zone border outline */}
    </div>
  );
}
