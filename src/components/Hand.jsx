import React, { useRef, useEffect, useCallback } from 'react';
import Card from './Card';
import {
  isJoker, isPictureJoker, isDeuceJoker, cardNominal,
  SUIT_SYM, cardLabel, SCORE_LADDER,
} from '../engine/index.js';

// ─── Touch drag: execute the drop action ──────────────────────
function executeTouchDrop(zone, el, card, G, engine, hi) {
  if (zone === 'table') {
    if (G.phase === 'attack' && !G.attackDone && engine.leftThrowerIdx() === hi) {
      if (G.tablePairs.length === 0) {
        engine.doAttack(hi, [card]);
      } else if ((engine.allBeaten() || G.defenderTaking) &&
                 engine.nominalOnTable(cardNominal(card)) &&
                 G.tablePairs.length < engine.getAttackLimit()) {
        engine.doThrow(hi, card);
      }
    } else if (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing &&
               engine.rightNeighborOfDefender() === hi &&
               engine.nominalOnTable(cardNominal(card)) &&
               G.tablePairs.length < engine.getAttackLimit()) {
      engine.doThrow(hi, card);
    }
  } else if (zone === 'pair') {
    const pairIdx = parseInt(el.dataset.pairIdx, 10);
    if (isNaN(pairIdx)) return;
    const pair = G.tablePairs[pairIdx];
    if (!pair || pair.defense) return;
    if (G.phase === 'defense' && G.defenderIdx === hi &&
        engine.canBeat(pair.attack, card, G.trumpSuit)) {
      engine.doDefend(hi, pairIdx, card);
    }
  } else if (zone === 'transfer') {
    if (G.phase === 'defense' && G.defenderIdx === hi &&
        engine.canTransfer(card, G.tablePairs)) {
      engine.doTransfer(hi, card);
    }
  } else if (zone === 'naki') {
    if (G.phase === 'nakidyvanie' &&
        G.nakiGiveToHandPending.length === 0 &&
        G.nakiPending.length > 0 &&
        G.nakiPending[0] === hi) {
      if (G.nakiJokerMode) {
        if (isJoker(card)) engine.doNakiThrow(hi, card);
      } else {
        const scoreNom = G.nakiNominal || SCORE_LADDER[G.players[G.defenderIdx].score];
        if (cardNominal(card) === scoreNom) engine.doNakiThrow(hi, card);
      }
    }
  }
}

// ─── Touch drag: check if a drop would be valid ───────────────
function isTouchDropValid(zone, el, card, G, engine, hi) {
  if (zone === 'table') {
    if (G.phase === 'attack' && !G.attackDone && engine.leftThrowerIdx() === hi) {
      if (G.tablePairs.length === 0) return true;
      return (engine.allBeaten() || G.defenderTaking) &&
             engine.nominalOnTable(cardNominal(card)) &&
             G.tablePairs.length < engine.getAttackLimit();
    }
    if (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing &&
        engine.rightNeighborOfDefender() === hi) {
      return engine.nominalOnTable(cardNominal(card)) &&
             G.tablePairs.length < engine.getAttackLimit();
    }
    return false;
  }
  if (zone === 'pair') {
    const pairIdx = parseInt(el.dataset.pairIdx, 10);
    if (isNaN(pairIdx)) return false;
    const pair = G.tablePairs[pairIdx];
    return !!(pair && !pair.defense &&
              G.phase === 'defense' && G.defenderIdx === hi &&
              engine.canBeat(pair.attack, card, G.trumpSuit));
  }
  if (zone === 'transfer') {
    return G.phase === 'defense' && G.defenderIdx === hi &&
           engine.canTransfer(card, G.tablePairs);
  }
  if (zone === 'naki') {
    if (!(G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length === 0 &&
          G.nakiPending.length > 0 && G.nakiPending[0] === hi)) return false;
    if (G.nakiJokerMode) return isJoker(card);
    const scoreNom = G.nakiNominal || SCORE_LADDER[G.players[G.defenderIdx].score];
    return cardNominal(card) === scoreNom;
  }
  return false;
}

// ─── Deal animation ────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function flyCardFromDeck(handEl, faceUp, cardData) {
  const isMobile = window.innerWidth <= 600;
  const deckId = isMobile ? 'deck-stack-mobile' : 'deck-visual';
  const deckEl = document.getElementById(deckId);
  if (!deckEl || !handEl) return;

  const deckRect = deckEl.getBoundingClientRect();
  const destRect = handEl.getBoundingClientRect();
  if (!deckRect.width || !destRect.width) return;

  const cardW = isMobile ? 68 : 96;
  const cardH = isMobile ? 96 : 134;

  const fly = document.createElement('div');
  const isRed = cardData && (cardData.suit === 'hearts' || cardData.suit === 'diamonds');
  fly.className = faceUp && cardData
    ? `card flying ${isJoker(cardData) ? 'joker-card' : (isRed ? 'red' : 'black')}`
    : 'card flying face-down';

  if (faceUp && cardData && !isJoker(cardData)) {
    const sym = SUIT_SYM[cardData.suit] || '';
    fly.innerHTML = `<div class="card-rank-suit-top">${cardData.rank}<br>${sym}</div><div class="card-center">${sym}</div>`;
  }

  Object.assign(fly.style, {
    left: deckRect.left + 'px',
    top: deckRect.top + 'px',
    width: cardW + 'px',
    height: cardH + 'px',
    position: 'fixed',
    zIndex: '1000',
    pointerEvents: 'none',
    transition: 'left .28s cubic-bezier(.25,.46,.45,.94), top .28s cubic-bezier(.25,.46,.45,.94), transform .28s ease, opacity .12s ease .2s',
  });
  document.body.appendChild(fly);
  fly.getBoundingClientRect(); // force reflow

  fly.style.left = (destRect.left + destRect.width / 2 - cardW / 2) + 'px';
  fly.style.top = (destRect.top + destRect.height / 2 - cardH / 2) + 'px';
  fly.style.transform = 'rotate(-6deg) scale(0.85)';
  fly.style.opacity = '0';

  await sleep(320);
  fly.remove();
}

export default function Hand({
  player,
  humanPlayerIdx,
  isMyTurn,
  G,
  UI,
  engine,
  justDealt = false,
  justTook = false,
}) {
  const handRef = useRef(null);
  const dragStateRef = useRef(null);
  const prevHandLength = useRef(0);
  const isMobile = window.innerWidth <= 600;

  const hi = humanPlayerIdx;
  const p = player;
  const hand = p.hand;

  // ─── Deal animation ─────────────────────────────────────────
  useEffect(() => {
    if (!justDealt || !handRef.current) return;
    const doAnimate = async () => {
      for (let i = 0; i < Math.min(hand.length, 6); i++) {
        await flyCardFromDeck(handRef.current, true, hand[i]);
        await sleep(80);
      }
    };
    doAnimate().catch(() => {});
  }, [justDealt]);

  // ─── Dense-hand compression (desktop) ───────────────────────
  useEffect(() => {
    if (isMobile || !handRef.current) return;
    const el = handRef.current;
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w')) || 96;
    const total = hand.length * (cardW + 4);
    const maxW = (el.parentElement?.clientWidth || window.innerWidth) * 0.9;
    if (total > maxW && hand.length > 1) {
      const overlap = -Math.ceil((total - maxW) / (hand.length - 1));
      el.classList.add('dense-hand');
      el.style.setProperty('--card-overlap', Math.max(overlap, -60) + 'px');
    } else {
      el.classList.remove('dense-hand');
      el.style.removeProperty('--card-overlap');
    }
  }, [hand.length, isMobile]);

  const handleCardClick = useCallback((card) => {
    engine.humanCardClick(card);
  }, [engine]);

  const handleDragStart = useCallback((e, card) => {
    dragStateRef.current = { type: 'hand', cardId: card.id };
    window.__dragState = dragStateRef.current;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnd = useCallback(() => {
    dragStateRef.current = null;
    window.__dragState = null;
  }, []);

  // ─── Touch drag: keep latest props fresh for closure-safe handlers ──
  const latestRef = useRef({ G, engine, hi, isMyTurn });
  useEffect(() => { latestRef.current = { G, engine, hi, isMyTurn }; });

  // ─── Mobile: arc-fan layout ──────────────────────────────────
  if (isMobile) {
    const count = hand.length;
    const containerW = window.innerWidth;
    const CW = 68;
    const maxXStep = Math.min(52, (containerW - CW - 20) / Math.max(count - 1, 1));
    const xStep = Math.max(18, maxXStep);
    const maxRot = Math.min(18, 90 / Math.max(count, 1));
    const totalFanW = xStep * (count - 1) + CW;
    const startX = (containerW - totalFanW) / 2;

    const canTransferAny = G.phase === 'defense' && G.defenderIdx === hi &&
      hand.some(c => engine.canTransfer(c, G.tablePairs));

    // ── Touch drag handler ─────────────────────────────────────
    const handleTouchStart = (e, card) => {
      const { isMyTurn: myTurn } = latestRef.current;
      if (!myTurn) return;
      e.preventDefault();

      const touch = e.touches[0];
      const cardEl = e.currentTarget;
      const rect = cardEl.getBoundingClientRect();
      const offsetX = touch.clientX - rect.left;
      const offsetY = touch.clientY - rect.top;

      // Ghost card
      const ghost = document.createElement('div');
      ghost.className = cardEl.className.replace(/\btouch-dragging\b/g, '') + ' drag-ghost';
      ghost.innerHTML = cardEl.innerHTML;
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.left = (touch.clientX - offsetX) + 'px';
      ghost.style.top  = (touch.clientY - offsetY) + 'px';
      document.body.appendChild(ghost);
      cardEl.classList.add('touch-dragging');

      let lastHighlighted = null;

      function findDropZone(x, y) {
        ghost.style.visibility = 'hidden';
        const els = document.elementsFromPoint(x, y);
        ghost.style.visibility = '';
        for (const el of els) {
          const zone = el.closest('[data-drop-zone]');
          if (zone) return zone;
        }
        return null;
      }

      function cleanup() {
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchcancel', onCancel);
        if (lastHighlighted) { lastHighlighted.classList.remove('touch-drop-hover'); lastHighlighted = null; }
        cardEl.classList.remove('touch-dragging');
        ghost.remove();
      }

      function onMove(ev) {
        ev.preventDefault();
        const t = ev.touches[0];
        ghost.style.left = (t.clientX - offsetX) + 'px';
        ghost.style.top  = (t.clientY - offsetY) + 'px';
        const zoneEl = findDropZone(t.clientX, t.clientY);
        const { G: mG, engine: mEng, hi: mHi } = latestRef.current;
        const isValid = zoneEl && isTouchDropValid(
          zoneEl.dataset.dropZone, zoneEl, card, mG, mEng, mHi
        );
        const target = isValid ? zoneEl : null;
        if (target !== lastHighlighted) {
          if (lastHighlighted) lastHighlighted.classList.remove('touch-drop-hover');
          if (target) target.classList.add('touch-drop-hover');
          lastHighlighted = target;
        }
      }

      function onEnd(ev) {
        cleanup();
        const t = ev.changedTouches[0];
        const zoneEl = findDropZone(t.clientX, t.clientY);
        if (!zoneEl) return;
        const { G: cG, engine: cEng, hi: cHi } = latestRef.current;
        if (!isTouchDropValid(zoneEl.dataset.dropZone, zoneEl, card, cG, cEng, cHi)) return;
        executeTouchDrop(zoneEl.dataset.dropZone, zoneEl, card, cG, cEng, cHi);
      }

      function onCancel() { cleanup(); }

      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd, { once: true });
      window.addEventListener('touchcancel', onCancel, { once: true });
    };

    return (
      <div className="human-hand" ref={handRef} style={{ position: 'relative', height: 180 }}>
        {hand.map((card, i) => {
          const t = count > 1 ? i / (count - 1) : 0.5;
          const rot = (t - 0.5) * maxRot * 2;
          const xOff = startX + i * xStep;
          const yLift = Math.pow(t - 0.5, 2) * 14;
          const isSelected = UI.selectedCards.includes(card.id);
          const isValidAtk = isMyTurn && G.phase === 'attack' && engine.isValidAttackCard(card);
          const canTransfer = isMyTurn && G.phase === 'defense' && engine.canTransfer(card, G.tablePairs);
          return (
            <Card
              key={card.id}
              card={card}
              faceUp
              selected={isSelected}
              validAttack={isValidAtk || canTransfer}
              dealt={justTook}
              style={{
                position: 'absolute',
                left: xOff,
                bottom: isSelected ? yLift + 28 : yLift,
                transform: `rotate(${rot}deg)`,
                transformOrigin: 'bottom center',
                zIndex: isSelected ? 60 : i + 1,
                transition: 'transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s, bottom .18s',
              }}
              onClick={isMyTurn ? () => handleCardClick(card) : undefined}
              onTouchStart={isMyTurn ? (e) => handleTouchStart(e, card) : undefined}
            />
          );
        })}
        {p.secretCard && !p.secretTaken && hand.length === 0 && (
          <div
            className="card own-secret"
            style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 0, width: 68, height: 96 }}
          >
            {(() => {
              const lbl = cardLabel(p.secretCard);
              return <><div className="card-rank-suit-top">{lbl.top}</div><div className="card-center">{lbl.center}</div></>;
            })()}
          </div>
        )}
      </div>
    );
  }

  // ─── Desktop: flex-row layout ─────────────────────────────────
  return (
    <div className="human-hand" ref={handRef}>
      {hand.map((card) => {
        const isSelected = UI.selectedCards.includes(card.id);
        const isValidAtk = isMyTurn && G.phase === 'attack' && !G.attackDone && engine.isValidAttackCard(card);
        const isRightNeighborThrow = isMyTurn && G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing &&
          engine.nominalOnTable(cardNominal(card));
        const canBeatSelected = isMyTurn && G.phase === 'defense' && UI.selectedAttackPairIdx !== null && (() => {
          const pair = G.tablePairs[UI.selectedAttackPairIdx];
          return pair && engine.canBeat(pair.attack, card, G.trumpSuit);
        })();
        const isTransferable = isMyTurn && G.phase === 'defense' && engine.canTransfer(card, G.tablePairs);
        const canDrag = isMyTurn && window.innerWidth > 600;

        return (
          <Card
            key={card.id}
            card={card}
            faceUp
            selected={isSelected}
            validAttack={isValidAtk || isRightNeighborThrow}
            validTarget={canBeatSelected}
            validTransfer={isTransferable}
            dealt={justTook}
            draggable={canDrag}
            onDragStart={canDrag ? (e) => handleDragStart(e, card) : undefined}
            onDragEnd={canDrag ? handleDragEnd : undefined}
            onClick={isMyTurn ? () => handleCardClick(card) : undefined}
          />
        );
      })}
      {p.secretCard && !p.secretTaken && (
        <div className={hand.length === 0 ? 'card small own-secret' : 'card small secret-back'}>
          {hand.length === 0 && (() => {
            const lbl = cardLabel(p.secretCard);
            const isRed = p.secretCard.suit === 'hearts' || p.secretCard.suit === 'diamonds';
            return <><div className="card-top">{lbl.top}</div><div className="card-center">{lbl.center}</div></>;
          })()}
        </div>
      )}
    </div>
  );
}
