import React, { useState, useRef, useEffect, useCallback } from 'react';
import Opponents from './Opponents';
import Table from './Table';
import Hand from './Hand';
import DeckPile from './DeckPile';
import DiscardPile from './DiscardPile';
import ActionButtons from './ActionButtons';
import GameLog from './GameLog';
import { SUIT_SYM } from '../engine/index.js';
import Card from './Card';

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

      {/* Untouchable suit info */}
      {G.trumpSuit && (
        <div className="untouchable-panel">
          {(() => {
            const untouchable = G.trumpSuit === 'spades' ? 'clubs' : 'spades';
            const sym = SUIT_SYM[untouchable];
            const name = { spades: 'пики', clubs: 'крести' }[untouchable];
            return `${sym} ${name} неприкосновенны`;
          })()}
        </div>
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

      {/* Thrown cards (накинуто) — mini-fan above player hand */}
      {hi !== -1 && (() => {
        const nakedCards = humanPlayer?.nakiCards ?? [];
        if (nakedCards.length === 0) return null;
        return (
          <div className="thrown-to-me-zone">
            <div className="thrown-to-me-label">▼ накинуто вам</div>
            <div className="thrown-to-me-fan">
              {nakedCards.map((card, i) => (
                <div key={card.id ?? i} className="thrown-mini-card" style={{ left: i * 22 }}>
                  <Card card={card} faceUp small />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Human hand */}
      {humanPlayer && (
        <div className="human-area">
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

      {/* Trump announcement popup */}
      {trumpPopup && (
        <div className="trump-announcement-overlay">
          <div className="trump-announcement-box">
            <div className={`trump-announcement-suit ${trumpPopup.suit}`}>
              {SUIT_SYM[trumpPopup.suit]}
            </div>
            <div className="trump-announcement-text">
              Потайной козырь — {SUIT_SYM[trumpPopup.suit]}
            </div>
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
