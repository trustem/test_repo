import React, { useState, useRef, useEffect, useCallback } from 'react';
import Opponents from './Opponents';
import Table from './Table';
import Hand from './Hand';
import DeckPile from './DeckPile';
import DiscardPile from './DiscardPile';
import ActionButtons from './ActionButtons';
import GameLog from './GameLog';
import DiceRollOverlay from './DiceRollOverlay';
import { SUIT_SYM, isJoker, SCORE_LADDER, SUITS, cardNominal } from '../engine/index.js';

// Horizontal fan: ghost shown only when no cards thrown yet; cards shift sideways
const NAKI_OFFSET = 14;
function NakiPile({ cards, ghostNominal }) {
  const n = cards.length;
  const containerW = n === 0 ? 30 : 30 + (n - 1) * NAKI_OFFSET;
  return (
    <div className="human-naki-strip">
      <div className="human-naki-cards-row" style={{ width: containerW }}>
        {n === 0 && (
          <div className="naki-ghost-card" style={{ left: 0, top: 0, zIndex: 0, width: 30, height: 42 }}>
            {ghostNominal}
          </div>
        )}
        {cards.map((card, i) => {
          if (isJoker(card)) return (
            <div key={card.id ?? i} className="naki-card-mini joker" style={{ left: i * NAKI_OFFSET, top: 0, zIndex: i + 1 }}>🃏</div>
          );
          const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
          return (
            <div key={card.id ?? i} className={`naki-card-mini${isRed ? ' red' : ' black'}`} style={{ left: i * NAKI_OFFSET, top: 0, zIndex: i + 1 }}>
              <span className="naki-card-rank">{card.rank}</span>
              <span className="naki-card-suit">{SUIT_SYM[card.suit]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrumpChoiceModal({ chooserName, isHuman, timeLeft, onChoose }) {
  return (
    <div className="trump-choice-overlay">
      <div className="trump-choice-box">
        <div className="trump-choice-title">
          {isHuman ? 'Выбери козырь' : `${chooserName} выбирает козырь...`}
        </div>
        {isHuman && (
          <>
            <div className="trump-choice-timer">{timeLeft}</div>
            <div className="trump-choice-suits">
              {['spades', 'hearts', 'diamonds', 'clubs'].map(suit => (
                <button key={suit} className={`trump-suit-btn ${suit}`} onClick={() => onChoose(suit)}>
                  {SUIT_SYM[suit]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const PHASES_RU = {
  attack: 'Атака',
  defense: 'Защита',
  nakidyvanie: 'Накидывание',
  draw: 'Добор карт',
  roundover: 'Конец раунда',
  gameover: 'Игра окончена',
};

export default function GameScreen({ G, UI, logEntries, engine, mpState, onNewGame }) {
  const [logVisible, setLogVisible] = useState(false);
  const [debugMode, setDebugModeState] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [undoCountdown, setUndoCountdown] = useState(10);
  const [justDealt, setJustDealt] = useState(false);
  const prevRoundRef = useRef(G?.roundNum ?? 0);
  const prevHandLengthRef = useRef(0);

  const isMobile = window.innerWidth <= 600;
  const hi = engine.humanPlayerIdx();

  const [trumpChoiceTimer, setTrumpChoiceTimer] = useState(10);

  // 10-second countdown when human must choose trump
  useEffect(() => {
    if (!G.trumpChoicePhase || G.trumpChooserIdx !== hi) return;
    setTrumpChoiceTimer(10);
    const iv = setInterval(() => {
      setTrumpChoiceTimer(t => {
        if (t <= 1) {
          clearInterval(iv);
          const p = G.players[hi];
          const sc = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
          for (const c of (p?.hand || [])) { if (!isJoker(c)) sc[c.suit] = (sc[c.suit] || 0) + 1; }
          const best = Object.entries(sc).sort((a, b) => b[1] - a[1])[0]?.[0] || 'spades';
          engine.doChooseTrump(hi, best);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [G.trumpChoicePhase, G.trumpChooserIdx, hi]);
  const humanPlayer = hi !== -1 ? G.players[hi] : null;

  // ─── Detect new round → trigger deal animation ────────────────
  useEffect(() => {
    if (G && G.roundNum !== prevRoundRef.current) {
      prevRoundRef.current = G.roundNum;
      setJustDealt(true);
      const t = setTimeout(() => setJustDealt(false), 2000);
      return () => clearTimeout(t);
    }
  }, [G?.roundNum]);

  // ─── Has undo state ───────────────────────────────────────────
  const hasUndo = engine.hasUndoState();

  // ─── Undo modal ───────────────────────────────────────────────
  const handleUndoClick = useCallback(() => {
    setShowUndo(true);
    setUndoCountdown(10);
  }, []);

  useEffect(() => {
    if (!showUndo) return;
    // Bots auto-approve after 1 second
    const autoTimer = setTimeout(() => {
      setShowUndo(false);
      engine.applyUndo();
    }, 1000);
    const tick = setInterval(() => {
      setUndoCountdown(c => {
        if (c <= 1) {
          clearInterval(tick);
          clearTimeout(autoTimer);
          setShowUndo(false);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { clearTimeout(autoTimer); clearInterval(tick); };
  }, [showUndo, engine]);

  const handleToggleDebug = useCallback(() => {
    const next = !debugMode;
    setDebugModeState(next);
    engine.setDebugMode(next);
  }, [debugMode, engine]);

  const hasBot = G.players.some(p => p.isBot);

  // ─── Trump announcement popup ─────────────────────────────────
  const [trumpPopup, setTrumpPopup] = useState(null);
  const lastAnnouncementKey = useRef(null);
  useEffect(() => {
    if (!G?.trumpAnnouncement) return;
    if (G.trumpAnnouncement.key === lastAnnouncementKey.current) return;
    lastAnnouncementKey.current = G.trumpAnnouncement.key;
    setTrumpPopup(G.trumpAnnouncement);
    const t = setTimeout(() => setTrumpPopup(null), 1400);
    return () => clearTimeout(t);
  }, [G?.trumpAnnouncement?.key]);
  // ─── Auto-pass / auto-done when human has no valid move ──────
  const humanHand = hi !== -1 ? G?.players?.[hi]?.hand : null;
  useEffect(() => {
    if (!G || G.gameOver || hi === -1) return;
    const p = G.players[hi];
    if (!p) return;

    // Auto-done: left thrower, cards on table, nothing throwable,
    // and either hand empty OR the Готово button would be visible (allBeaten/defenderTaking)
    if (G.phase === 'attack' && !G.attackDone && engine.leftThrowerIdx() === hi
        && G.tablePairs.length > 0) {
      const canThrowMore = p.hand.length > 0
        && p.hand.some(c => engine.nominalOnTable(cardNominal(c)))
        && G.tablePairs.length < engine.getAttackLimit();
      const readyForDone = p.hand.length === 0 || engine.allBeaten() || G.defenderTaking;
      if (!canThrowMore && readyForDone) {
        engine.declareAttackDone(hi);
        return;
      }
    }

    // Auto-pass: right-neighbor throw, no throwable cards
    if (G.phase === 'attack' && G.attackDone && G.rightNeighborThrowing
        && engine.rightNeighborOfDefender() === hi) {
      const canThrow = p.hand.some(c => engine.nominalOnTable(cardNominal(c)))
                       && G.tablePairs.length < engine.getAttackLimit();
      if (!canThrow) { engine.doRightNeighborPass(hi); return; }
    }

    // Auto-pass: transfer-throw phase, no matching nominal or limit reached
    if (G.transferThrowPhase && G.transferThrowQueue?.length > 0
        && G.transferThrowQueue[0] === hi) {
      const canThrow = p.hand.length > 0
        && p.hand.some(c => cardNominal(c) === G.transferThrowNominal)
        && G.tablePairs.length < engine.getAttackLimit();
      if (!canThrow) { engine.doTransferThrowPass(hi); return; }
    }

    // Auto-pass: nakidyvanie phase 2, no matching cards
    if (G.phase === 'nakidyvanie' && G.nakiGiveToHandPending.length === 0
        && G.nakiPending.length > 0 && G.nakiPending[0] === hi) {
      const noMatch = G.nakiJokerMode
        ? !p.hand.some(c => isJoker(c))
        : !p.hand.some(c => cardNominal(c) === SCORE_LADDER[G.players[G.defenderIdx].score]);
      if (noMatch) { engine.doNakiPass(hi); return; }
    }
  }, [
    G?.phase, G?.attackDone, G?.rightNeighborThrowing, G?.transferThrowPhase,
    G?.transferThrowQueue, G?.transferThrowNominal, G?.nakiPending, G?.nakiGiveToHandPending,
    G?.nakiJokerMode, G?.tablePairs?.length, G?.defenderTaking, humanHand?.length,
  ]);

  const isMobileView = window.innerWidth <= 600;

  return (
    <div className="screen active game-screen">
      {/* Top bar */}
      <div className="top-bar">
        <span className="top-bar-title">Бардак</span>
        <button className="new-game-btn" onClick={onNewGame}>☰ Меню</button>
        {hasBot && (
          <button
            className={`debug-btn${debugMode ? ' active' : ''}`}
            onClick={handleToggleDebug}
          >
            🔍 Отладка
          </button>
        )}
      </div>

      {/* Opponents */}
      <Opponents G={G} debugMode={debugMode} />

      {/* Center info: deck + discard */}
      {!isMobileView && (
        <div className="center-info" id="center-info">
          <div className="pile-zone">
            <DiscardPile count={G.discardPile.length} />
            <div className="pile-label">
              Бита: <span>{G.discardPile.length}</span>
            </div>
          </div>
          <div className="pile-zone deck-zone">
            <DeckPile
              deckCount={G.deck.length}
              trumpCard={G.trumpCard}
              trumpSuit={G.trumpSuit}
            />
            <div className="pile-label">
              Колода: <span>{G.deck.length}</span>
            </div>
            <div className="trump-info">
              Козырь:{' '}
              <span className={`trump-panel-suit ${G.trumpSuit}`}>
                {SUIT_SYM[G.trumpSuit]}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Mobile deck zone */}
      {isMobileView && (
        <>
          <div className="deck-zone-mobile" style={{ display: 'block' }}>
            {G.trumpSuit && (
              <div className={`trump-indicator-mobile ${G.trumpSuit}`}>
                {SUIT_SYM[G.trumpSuit]}
              </div>
            )}
            <div className="deck-count-mobile">{G.deck.length}</div>
            <DeckPile
              deckCount={G.deck.length}
              trumpCard={G.trumpCard}
              trumpSuit={G.trumpSuit}
              mobile
            />
          </div>
          <div className="discard-zone-mobile" style={{ display: 'block' }}>
            <DiscardPile count={G.discardPile.length} mobile />
            <div className="discard-label-mobile">Бита: <span>{G.discardPile.length}</span></div>
          </div>
        </>
      )}


      {/* Table */}
      <Table G={G} UI={UI} engine={engine} humanPlayerIdx={hi} />

      {/* Action buttons */}
      <ActionButtons
        G={G}
        UI={UI}
        engine={engine}
        humanPlayerIdx={hi}
        undoState={hasUndo}
        onUndo={handleUndoClick}
        debugMode={debugMode}
        onDebugStep={() => engine.runPendingBotAction()}
      />

      {/* Player secret card — floats between hand and Бита, mobile only */}
      {isMobileView && humanPlayer?.secretCard && !humanPlayer?.secretTaken && humanPlayer.hand.length > 0 && (
        <div className="my-secret-card-mobile card secret-back" />
      )}


      {/* Human hand */}
      {humanPlayer && (
        <div className={['human-area', hi === G.attackerIdx ? 'attacker' : '', hi === G.defenderIdx ? 'defender' : ''].filter(Boolean).join(' ')}>
          {/* Naki pile — ghost shows target nominal, thrown cards stack on top */}
          {G.phase !== 'deal' && G.phase !== 'roundover' && (
            <NakiPile
              cards={humanPlayer.nakiDisplayCards ?? []}
              ghostNominal={SCORE_LADDER[humanPlayer.score]}
            />
          )}
          <Hand
            player={humanPlayer}
            humanPlayerIdx={hi}
            isMyTurn={engine.isHumanTurn()}
            G={G}
            UI={UI}
            engine={engine}
            justDealt={justDealt}
            justTook={G.humanJustTook}
          />
        </div>
      )}

      {/* Game log */}
      <GameLog
        entries={logEntries}
        visible={logVisible}
        onClose={() => setLogVisible(false)}
      />
      <button
        className="log-toggle-btn"
        title="Журнал"
        onClick={() => setLogVisible(v => !v)}
      >
        ?
      </button>

      {/* Phase indicator */}
      <div id="phase-indicator" style={{ display: 'none' }}>
        {PHASES_RU[G.phase] || G.phase}
      </div>

      {/* Dice roll overlay */}
      {G.dicePhase && <DiceRollOverlay G={G} engine={engine} />}

      {/* Trump choice modal */}
      {G.trumpChoicePhase && (
        <TrumpChoiceModal
          chooserName={G.players[G.trumpChooserIdx]?.name}
          isHuman={G.trumpChooserIdx === hi}
          timeLeft={trumpChoiceTimer}
          onChoose={(suit) => engine.doChooseTrump(hi, suit)}
        />
      )}

      {/* Trump announcement popup */}
      {trumpPopup && (
        <div className="trump-announcement-overlay">
          <div className="trump-announcement-box">
            {trumpPopup.chosen ? (
              <div className="trump-announcement-text">
                {trumpPopup.playerName} выбрал {SUIT_SYM[trumpPopup.suit]}
              </div>
            ) : trumpPopup.secretOnly ? (
              <div className="trump-announcement-text">
                {trumpPopup.playerName} открыл потайную карту
              </div>
            ) : (
              <>
                <div className={`trump-announcement-suit ${trumpPopup.suit}`}>
                  {SUIT_SYM[trumpPopup.suit]}
                </div>
                <div className="trump-announcement-text">
                  Потайной козырь — {SUIT_SYM[trumpPopup.suit]}
                </div>
                {trumpPopup.playerName && (
                  <div className="trump-announcement-player">
                    {trumpPopup.playerName} открыл потайную карту
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Undo modal */}
      {showUndo && (
        <div id="undo-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <div className="undo-modal">
            <div className="undo-title">Отменить ход?</div>
            <div className="undo-subtitle">Боты всегда согласны — авто-подтверждение через 1 сек</div>
            <div className="undo-countdown">{undoCountdown}</div>
            <div className="undo-buttons">
              <button className="action-btn btn-undo" onClick={() => { setShowUndo(false); engine.applyUndo(); }}>
                Подтвердить отмену
              </button>
              <button className="action-btn btn-pass" onClick={() => setShowUndo(false)}>
                Не отменять
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
