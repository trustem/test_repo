import React from 'react';
import { cardNominal, cardStr, SCORE_LADDER, isJoker } from '../engine/index.js';

export default function ActionButtons({ G, UI, engine, humanPlayerIdx, undoState, onUndo, debugMode, onDebugStep }) {
  if (!G || G.gameOver) return null;

  const hi = humanPlayerIdx;
  const p = hi !== -1 ? G.players[hi] : null;
  const isHuman = engine.isHumanTurn();

  const buttons = [];

  // Undo button
  if (undoState) {
    buttons.push(
      <button key="undo" className="action-btn btn-pass btn-undo" onClick={onUndo}>
        Отменить
      </button>
    );
  }

  // Debug: allow bot step
  if (debugMode && engine.getPendingBotAction() && !isHuman) {
    buttons.push(
      <button key="debug" className="action-btn btn-debug" onClick={onDebugStep}>
        ▶ Разрешить: {engine.getNextBotActionDescription()}
      </button>
    );
    return <div className="action-buttons">{buttons}</div>;
  }

  if (hi === -1 || !isHuman || !p) return <div className="action-buttons">{buttons}</div>;

  if (G.phase === 'attack' && !G.attackDone && engine.leftThrowerIdx() === hi) {
    const selectedCards = UI.selectedCards.map(id => p.hand.find(c => c.id === id)).filter(Boolean);
    const canAtk = selectedCards.length > 0 && engine.canAttackWith(selectedCards);

    if (G.tablePairs.length === 0) {
      buttons.push(
        <button
          key="attack"
          className="action-btn btn-attack"
          disabled={!canAtk}
          onClick={() => {
            if (canAtk) engine.doAttack(hi, selectedCards);
          }}
        >
          Атаковать
        </button>
      );
    } else if (engine.allBeaten() || G.defenderTaking) {
      const canThrow = canAtk && selectedCards.length > 0;
      buttons.push(
        <button
          key="throw"
          className="action-btn btn-attack"
          disabled={!canThrow}
          onClick={() => {
            if (canThrow) engine.doThrow(hi, selectedCards[0]);
          }}
        >
          Подкинуть
        </button>
      );
      buttons.push(
        <button
          key="done"
          className="action-btn btn-done"
          onClick={() => engine.declareAttackDone(hi)}
        >
          Готово
        </button>
      );
    }
  }

  if (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing && engine.rightNeighborOfDefender() === hi) {
    const selectedCards = UI.selectedCards.map(id => p.hand.find(c => c.id === id)).filter(Boolean);
    const canThrow = selectedCards.length === 1 &&
      engine.nominalOnTable(cardNominal(selectedCards[0])) &&
      G.tablePairs.length < engine.getAttackLimit();

    buttons.push(
      <button
        key="rn-throw"
        className="action-btn btn-attack"
        disabled={!canThrow}
        onClick={() => { if (canThrow) engine.doThrow(hi, selectedCards[0]); }}
      >
        Подкинуть
      </button>
    );
    buttons.push(
      <button key="rn-pass" className="action-btn btn-pass" onClick={() => engine.doRightNeighborPass(hi)}>
        Пас
      </button>
    );
  }

  // Transfer-throw phase: transferrer can throw same-nominal cards before new defender acts
  if (G.transferThrowPhase && G.transferThrowQueue.length > 0 && G.transferThrowQueue[0] === hi) {
    const nom = G.transferThrowNominal;
    const throwable = nom ? p.hand.filter(c => cardNominal(c) === nom) : [];
    throwable.forEach((tc, i) => {
      buttons.push(
        <button
          key={`ttrow-${i}`}
          className="action-btn btn-attack"
          onClick={() => engine.doTransferThrow(hi, tc)}
        >
          Подкинуть {cardStr(tc)}
        </button>
      );
    });
    buttons.push(
      <button key="ttpass" className="action-btn btn-pass" onClick={() => engine.doTransferThrowPass(hi)}>
        Пас
      </button>
    );
    return <div className="action-buttons">{buttons}</div>;
  }

  if (G.phase === 'defense' && hi === G.defenderIdx) {
    const transferCandidates = p.hand.filter(c => engine.canTransfer(c, G.tablePairs));
    transferCandidates.forEach((tc, i) => {
      buttons.push(
        <button
          key={`transfer-${i}`}
          className="action-btn btn-transfer"
          onClick={() => engine.doTransfer(hi, tc)}
        >
          Перевод {cardStr(tc)}
        </button>
      );
    });
    buttons.push(
      <button
        key="take"
        className="action-btn btn-take"
        onClick={() => engine.doTake(hi)}
      >
        Взять
      </button>
    );
  }

  // Nakidyvanie phase 1: give to hand
  if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length > 0 && G.nakiGiveToHandPending[0] === hi) {
    const tableNoms = engine.getTableNominals();
    const giveMatches = p.hand.filter(c => tableNoms.has(cardNominal(c)));
    const limit = G.nakiGiveToHandLimit || 0;
    if (limit > 0 && giveMatches.length > 0) {
      const selected = giveMatches.filter(c => UI.selectedCards.includes(c.id));
      const toGive = selected.length > 0 ? selected : giveMatches.slice(0, limit);
      const label = selected.length > 0 ? `Дать в руку (${selected.length})` : `Дать все в руку (${Math.min(giveMatches.length, limit)})`;
      buttons.push(
        <button key="give" className="action-btn btn-transfer" onClick={() => engine.doNakiGiveToHand(hi, toGive)}>
          {label}
        </button>
      );
    }
    buttons.push(
      <button key="give-pass" className="action-btn btn-pass" onClick={() => engine.doNakiGiveToHandPass(hi)}>
        Пас
      </button>
    );
  }

  // Nakidyvanie phase 2: throw score nominal
  if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length === 0 && G.nakiPending.length > 0 && G.nakiPending[0] === hi) {
    const defIdx = G.defenderIdx;
    const scoreNom = SCORE_LADDER[G.players[defIdx].score];

    if (G.nakiJokerMode) {
      const jokers = p.hand.filter(c => isJoker(c));
      jokers.forEach((joker, i) => {
        buttons.push(
          <button key={`naki-joker-${i}`} className="action-btn btn-throw" onClick={() => engine.doNakiThrow(hi, joker)}>
            Накинуть {cardStr(joker)}
          </button>
        );
      });
    } else {
      const matches = p.hand.filter(c => cardNominal(c) === scoreNom);
      const canThrowMultiple = engine.isUniqueLowestRankPlayer(defIdx);
      if (matches.length > 0) {
        if (canThrowMultiple) {
          const selected = matches.filter(c => UI.selectedCards.includes(c.id));
          buttons.push(
            <button
              key="naki-multi"
              className="action-btn btn-throw"
              onClick={() => engine.doNakiThrowMultiple(hi, selected.length > 0 ? selected : matches)}
            >
              {selected.length > 0 ? `Накинуть (${selected.length})` : `Накинуть все (${matches.length})`}
            </button>
          );
        } else {
          matches.forEach((mc, i) => {
            buttons.push(
              <button key={`naki-${i}`} className="action-btn btn-throw" onClick={() => engine.doNakiThrow(hi, mc)}>
                Накинуть {cardStr(mc)}
              </button>
            );
          });
        }
      }
    }
    buttons.push(
      <button key="naki-pass" className="action-btn btn-pass" onClick={() => engine.doNakiPass(hi)}>
        Передать
      </button>
    );
  }

  return <div className="action-buttons">{buttons}</div>;
}
