import React, { useRef, useCallback } from 'react';
import Card from './Card';
import { cardNominal } from '../engine/index.js';

// Table area: attack/defense pairs + transfer slot (dashed card)
export default function Table({ G, UI, engine, humanPlayerIdx }) {
  const tableRef = useRef(null);
  const isMobile = window.innerWidth <= 600;
  const hi = humanPlayerIdx;
  const isDefending = hi !== -1 && G.defenderIdx === hi && G.phase === 'defense';
  const isHumanAttacking = hi !== -1 && engine.isHumanTurn() && (
    (G.phase === 'attack' && !G.attackDone && engine.leftThrowerIdx() === hi) ||
    (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing && engine.rightNeighborOfDefender() === hi)
  );

  // ─── Table-level drag handlers (attack drop zone) ────────────
  const handleTableDragOver = useCallback((e) => {
    if (!window.__dragState || window.__dragState.type !== 'hand') return;
    const card = G.players[hi]?.hand.find(c => c.id === window.__dragState.cardId);
    if (!card) return;
    const isValidThrow = (G.tablePairs.length === 0 && !G.attackDone) ||
      (engine.allBeaten() && engine.nominalOnTable(cardNominal(card)) && G.tablePairs.length < engine.getAttackLimit());
    if (isValidThrow) {
      e.preventDefault();
      tableRef.current?.classList.add('drag-valid-zone');
    }
  }, [G, hi, engine]);

  const handleTableDragLeave = useCallback((e) => {
    if (!tableRef.current?.contains(e.relatedTarget)) {
      tableRef.current?.classList.remove('drag-valid-zone');
    }
  }, []);

  const handleTableDrop = useCallback((e) => {
    e.preventDefault();
    tableRef.current?.classList.remove('drag-valid-zone');
    if (!window.__dragState || window.__dragState.type !== 'hand') return;
    const card = G.players[hi]?.hand.find(c => c.id === window.__dragState.cardId);
    if (!card) return;
    window.__dragState = null;
    if (G.tablePairs.length === 0 && G.phase === 'attack' && !G.attackDone && engine.leftThrowerIdx() === hi) {
      engine.doAttack(hi, [card]);
    } else if (engine.allBeaten() && engine.nominalOnTable(cardNominal(card)) && G.tablePairs.length < engine.getAttackLimit()) {
      engine.doThrow(hi, card);
    }
  }, [G, hi, engine]);

  // ─── Transfer slot ────────────────────────────────────────────
  const showTransferSlot = isDefending && G.tablePairs.length > 0 && G.players[hi]?.hand.some(c => engine.canTransfer(c, G.tablePairs));

  const handleTransferDragOver = useCallback((e) => {
    e.stopPropagation();
    if (!window.__dragState || window.__dragState.type !== 'hand') return;
    const card = G.players[hi]?.hand.find(c => c.id === window.__dragState.cardId);
    if (card && engine.canTransfer(card, G.tablePairs)) {
      e.preventDefault();
    }
  }, [G, hi, engine]);

  const handleTransferDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.__dragState || window.__dragState.type !== 'hand') return;
    const card = G.players[hi]?.hand.find(c => c.id === window.__dragState.cardId);
    if (!card || !engine.canTransfer(card, G.tablePairs)) return;
    window.__dragState = null;
    engine.doTransfer(hi, card);
  }, [G, hi, engine]);

  return (
    <div className="table-area">
      <div id="action-hint" className="action-hint" />
      <div
        id="table-cards"
        className="table-cards"
        data-drop-zone="table"
        ref={tableRef}
        onDragOver={isHumanAttacking && !isMobile ? handleTableDragOver : undefined}
        onDragLeave={isHumanAttacking && !isMobile ? handleTableDragLeave : undefined}
        onDrop={isHumanAttacking && !isMobile ? handleTableDrop : undefined}
      >
        {G.tablePairs.filter(p => !p.isNaki).map((pair, pairIdx) => (
          <TablePair
            key={pairIdx}
            pair={pair}
            pairIdx={pairIdx}
            G={G}
            UI={UI}
            engine={engine}
            hi={hi}
            isDefending={isDefending}
            isMobile={isMobile}
          />
        ))}

        {/* Transfer slot — dashed outline card */}
        {showTransferSlot && (
          <div className="table-pair">
            <div
              className="transfer-slot"
              data-drop-zone="transfer"
              title="Перевод"
              onDragOver={!isMobile ? handleTransferDragOver : undefined}
              onDragLeave={!isMobile ? (e) => e.currentTarget.classList.remove('drag-valid-target') : undefined}
              onDrop={!isMobile ? handleTransferDrop : undefined}
              onClick={isMobile ? () => {
                // Mobile: tap to transfer with first transferable card
                const tc = G.players[hi]?.hand.find(c => engine.canTransfer(c, G.tablePairs));
                if (tc) engine.doTransfer(hi, tc);
              } : undefined}
            >
              ↻
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TablePair({ pair, pairIdx, G, UI, engine, hi, isDefending, isMobile }) {
  const isSelected = UI.selectedAttackPairIdx === pairIdx;

  // ─── Defense drop handlers ─────────────────────────────────
  const handleAtkDragOver = useCallback((e) => {
    if (!window.__dragState) return;
    let card = null;
    if (window.__dragState.type === 'hand') {
      card = G.players[hi]?.hand.find(c => c.id === window.__dragState.cardId);
    } else if (window.__dragState.type === 'defcard') {
      const srcPair = G.tablePairs[window.__dragState.fromPairIdx];
      card = srcPair?.defense;
    }
    if (card && engine.canBeat(pair.attack, card, G.trumpSuit)) {
      e.preventDefault();
    }
  }, [pair, G, hi, engine]);

  const handleAtkDrop = useCallback((e) => {
    e.preventDefault();
    if (!window.__dragState) return;
    if (window.__dragState.type === 'hand') {
      const card = G.players[hi]?.hand.find(c => c.id === window.__dragState.cardId);
      if (!card || !engine.canBeat(pair.attack, card, G.trumpSuit)) return;
      window.__dragState = null;
      engine.doDefend(hi, pairIdx, card);
    } else if (window.__dragState.type === 'defcard') {
      const fromIdx = window.__dragState.fromPairIdx;
      if (fromIdx === pairIdx) { window.__dragState = null; return; }
      const srcPair = G.tablePairs[fromIdx];
      if (!srcPair?.defense) { window.__dragState = null; return; }
      const defCard = srcPair.defense;
      if (!engine.canBeat(pair.attack, defCard, G.trumpSuit)) { window.__dragState = null; return; }
      window.__dragState = null;
      // Direct reassign for solo/host
      srcPair.defense = null;
      srcPair.defender = undefined;
      pair.defense = defCard;
      pair.defender = hi;
    }
  }, [pair, pairIdx, G, hi, engine]);

  const handleDefDragStart = useCallback((e) => {
    window.__dragState = { type: 'defcard', cardId: pair.defense.id, fromPairIdx: pairIdx };
    e.dataTransfer.effectAllowed = 'move';
  }, [pair, pairIdx]);

  const handlePairClick = useCallback(() => {
    if (isDefending && !pair.defense && UI.selectedAttackPairIdx === null) {
      engine.selectAttackPair(pairIdx);
    }
  }, [isDefending, pair, pairIdx, UI, engine]);

  return (
    <div
      className={`table-pair${isSelected ? ' selected-pair' : ''}`}
      style={isSelected ? { background: 'rgba(46,204,113,0.15)', borderRadius: 6 } : undefined}
      onClick={handlePairClick}
      title={isDefending && !pair.defense ? 'Нажмите чтобы выбрать для отбоя' : undefined}
    >
      <div
        className={`attack-card-wrap${isDefending && !pair.defense ? ' awaiting-defense' : ''}`}
        data-drop-zone="pair"
        data-pair-idx={pairIdx}
        onDragOver={isDefending && !pair.defense && !isMobile ? handleAtkDragOver : undefined}
        onDragLeave={!isMobile ? (e) => e.currentTarget.classList.remove('drag-valid-target') : undefined}
        onDrop={isDefending && !pair.defense && !isMobile ? handleAtkDrop : undefined}
      >
        <Card card={pair.attack} faceUp small className="attack-card" />
      </div>
      {pair.defense && (
        <Card
          card={pair.defense}
          faceUp
          small
          className="defense-card"
          draggable={isDefending && pair.defender === hi && !isMobile}
          onDragStart={isDefending && pair.defender === hi && !isMobile ? handleDefDragStart : undefined}
          onDragEnd={() => { window.__dragState = null; }}
        />
      )}
    </div>
  );
}
