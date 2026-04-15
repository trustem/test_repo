import React from 'react';
import { SUIT_SYM, isJoker } from '../engine/index.js';
import Card from './Card';

export default function DeckPile({ deckCount, trumpCard, trumpSuit, mobile = false }) {
  const sizeClass = deckCount >= 32 ? 'size-xl' :
    deckCount >= 22 ? 'size-lg' :
    deckCount >= 12 ? 'size-md' :
    deckCount >= 5  ? 'size-sm' :
    deckCount >= 1  ? 'size-xs' : 'size-empty';

  const isRed = trumpSuit === 'hearts' || trumpSuit === 'diamonds';

  if (mobile) {
    return (
      <div className="deck-stack-mobile" id="deck-stack-mobile">
        {deckCount > 0 ? (
          <>
            {[0, 1, 2].map(i => <div key={i} className="deck-back-stack" />)}
            <div className="secret-under-trump" />
            {trumpCard && (
              <div className="trump-peek-mini-wrap">
                <Card card={trumpCard} faceUp small />
              </div>
            )}
          </>
        ) : (
          <div className={`empty-deck-trump-badge${isRed ? ' red' : ''}`}>
            <span className="empty-deck-trump-sym">{SUIT_SYM[trumpSuit]}</span>
            <span className="empty-deck-trump-label">козырь</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="deck-stack">
      {deckCount > 0 ? (
        <>
          <div className={`deck-visual ${sizeClass}`} style={{ opacity: 1 }}>
            <div className="deck-back" />
          </div>
          {trumpCard && (
            <div className="trump-card-rotated">
              <Card card={trumpCard} faceUp small />
            </div>
          )}
        </>
      ) : (
        <div className={`empty-deck-trump-badge${isRed ? ' red' : ''}`}>
          <span className="empty-deck-trump-sym">{SUIT_SYM[trumpSuit]}</span>
          <span className="empty-deck-trump-label">козырь</span>
        </div>
      )}
    </div>
  );
}
