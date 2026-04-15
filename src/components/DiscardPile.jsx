import React from 'react';

const ROTS = [-8, 3, -4, 7, -2, 5, -6];

// Growing discard pile — shows stacked card-back layers that increase with pile size
export default function DiscardPile({ count, mobile = false }) {
  if (mobile) {
    // Mobile: 5 randomly rotated mini card backs
    const mobileRots = [-12, -3, 9, -5, 14];
    return (
      <div className="discard-stack-mobile">
        {count > 0 && mobileRots.map((rot, i) => (
          <div
            key={i}
            className="discard-card-mini"
            style={{ transform: `rotate(${rot}deg)`, top: i, left: i, zIndex: i }}
          />
        ))}
      </div>
    );
  }

  // Desktop: growing stack of card-back layers (up to 7)
  const visibleCount = Math.min(count, 7);
  return (
    <div className={`discard-visual${count > 0 ? ' has-cards' : ''}`} style={{ opacity: count > 0 ? 1 : 0.35 }}>
      {count > 0 && Array.from({ length: visibleCount }, (_, i) => (
        <div
          key={i}
          className="discard-stack-layer"
          style={{
            transform: `rotate(${ROTS[i]}deg) translate(${i * 1.5}px, ${i * -1.5}px)`,
            zIndex: i,
          }}
        />
      ))}
    </div>
  );
}
