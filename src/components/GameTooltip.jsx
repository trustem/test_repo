import React from 'react';

export default function GameTooltip({ text, onDismiss }) {
  if (!text) return null;
  return (
    <div className="game-tooltip" onClick={onDismiss} title="Нажми чтобы скрыть">
      {text}
    </div>
  );
}
