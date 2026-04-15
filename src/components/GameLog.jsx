import React, { useEffect, useRef, useState } from 'react';

export default function GameLog({ entries, visible, onClose }) {
  const logRef = useRef(null);

  useEffect(() => {
    if (!logRef.current) return;
    const el = logRef.current;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (isNearBottom) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className={`log-area${visible ? ' mobile-open' : ''}`}>
      <div className="log-header">
        Журнал игры
        <button className="log-close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="log-body">
        <div className="game-log" ref={logRef}>
          {entries.map((entry) => (
            <div key={entry.id} className={`log-entry ${entry.type}`}>
              {entry.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
