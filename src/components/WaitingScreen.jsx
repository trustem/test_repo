import React, { useState, useRef } from 'react';

export default function WaitingScreen({ data, mpState, onStartGame, onReorderPlayers, onChangeMaxPlayers, onBack }) {
  const sortedPlayers = (data?.players || []).slice().sort((a, b) => a.seatIndex - b.seatIndex);
  const maxPlayers = data?.maxPlayers || 4;
  const isHost = mpState?.isHost;
  const canStart = isHost && sortedPlayers.length >= 2;

  // ─── Optimistic maxPlayers (immediate visual feedback) ────────
  const [localMax, setLocalMax] = useState(null);
  // Sync localMax when Firestore confirms the update
  const effectiveMax = localMax ?? maxPlayers;
  React.useEffect(() => { setLocalMax(null); }, [maxPlayers]);

  const handleMaxChange = async (n) => {
    setLocalMax(n);
    try {
      await onChangeMaxPlayers?.(n);
    } catch (e) {
      setLocalMax(null);
      alert('Ошибка: ' + e.message);
    }
  };

  // ─── Drag state ───────────────────────────────────────────────
  const [dragSrcIdx, setDragSrcIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const listRef = useRef(null);

  // ── HTML5 drag (desktop) ──────────────────────────────────────
  const onDragStart = (e, idx) => {
    setDragSrcIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // ghost image: slight transparency applied via CSS
  };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (idx !== dragSrcIdx) setDragOverIdx(idx);
  };
  const onDrop = (e, idx) => {
    e.preventDefault();
    commitReorder(idx);
  };
  const onDragEnd = () => {
    setDragSrcIdx(null);
    setDragOverIdx(null);
  };

  // ── Touch drag (mobile) ───────────────────────────────────────
  const onTouchStart = (e, idx) => {
    setDragSrcIdx(idx);
  };
  const onTouchMove = (e) => {
    if (dragSrcIdx === null || !listRef.current) return;
    e.preventDefault(); // block scroll while dragging
    const touchY = e.touches[0].clientY;
    const rows = listRef.current.querySelectorAll('[data-player-idx]');
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (touchY >= rect.top && touchY <= rect.bottom) {
        const idx = Number(row.dataset.playerIdx);
        if (idx !== dragSrcIdx) setDragOverIdx(idx);
        break;
      }
    }
  };
  const onTouchEnd = () => {
    commitReorder(dragOverIdx);
  };

  // ── Shared commit ─────────────────────────────────────────────
  function commitReorder(targetIdx) {
    if (dragSrcIdx !== null && targetIdx !== null && dragSrcIdx !== targetIdx) {
      const newOrder = [...sortedPlayers];
      const [moved] = newOrder.splice(dragSrcIdx, 1);
      newOrder.splice(targetIdx, 0, moved);
      onReorderPlayers(newOrder);
    }
    setDragSrcIdx(null);
    setDragOverIdx(null);
  }

  return (
    <div className="screen active setup-screen">
      <div className="setup-container" style={{ textAlign: 'center' }}>
        <h1 className="game-title">Бардак</h1>

        <div className="setup-label" style={{ textAlign: 'center', marginBottom: 14, marginTop: 16 }}>
          {sortedPlayers.length}/{effectiveMax} игроков
        </div>

        {/* Player list */}
        <div
          ref={listRef}
          style={{ marginBottom: 20 }}
          onTouchMove={isHost ? onTouchMove : undefined}
          onTouchEnd={isHost ? onTouchEnd : undefined}
        >
          {sortedPlayers.map((p, i) => {
            const isDragging = dragSrcIdx === i;
            const isOver    = dragOverIdx === i && dragSrcIdx !== i;
            return (
              <div
                key={p.uid}
                data-player-idx={i}
                className={[
                  'waiting-player',
                  isDragging ? 'waiting-dragging' : '',
                  isOver     ? 'waiting-drag-over' : '',
                ].filter(Boolean).join(' ')}
                draggable={isHost}
                onDragStart={isHost ? (e) => onDragStart(e, i) : undefined}
                onDragOver={isHost  ? (e) => onDragOver(e, i)  : undefined}
                onDrop={isHost      ? (e) => onDrop(e, i)      : undefined}
                onDragEnd={isHost   ? onDragEnd                 : undefined}
                onTouchStart={isHost ? (e) => onTouchStart(e, i) : undefined}
              >
                {isHost && (
                  <span className="waiting-drag-handle" title="Перетащи для смены порядка">⠿</span>
                )}
                <span className="waiting-seat-num">{i + 1}</span>
                <span className="waiting-player-name">
                  {p.name}
                  {p.uid === data?.hostUid ? ' 👑' : ''}
                </span>
              </div>
            );
          })}

          {/* Empty bot slots */}
          {Array.from({ length: Math.max(0, effectiveMax - sortedPlayers.length) }, (_, i) => (
            <div key={`bot-${i}`} className="waiting-player waiting-player-bot">
              <span className="waiting-seat-num">{sortedPlayers.length + i + 1}</span>
              <span className="waiting-player-name" style={{ color: 'var(--text-muted)' }}>
                Бот
              </span>
            </div>
          ))}
        </div>

        {isHost && (
          <p className="waiting-hint">
            Перетащи игроков чтобы изменить порядок ходов
          </p>
        )}

        {/* Max players selector */}
        {isHost && (
          <div style={{ marginBottom: 16 }}>
            <div className="setup-label" style={{ textAlign: 'center', marginBottom: 8 }}>
              Мест в комнате:
            </div>
            <div className="player-count-buttons" style={{ justifyContent: 'center' }}>
              {[2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  className={`count-btn${effectiveMax === n ? ' active' : ''}`}
                  onClick={() => handleMaxChange(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {isHost && (
          <button
            className="start-button"
            disabled={!canStart}
            onClick={onStartGame}
            style={!canStart ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
          >
            Начать игру!
          </button>
        )}

        <div className="setup-label" style={{ textAlign: 'center', marginTop: 10 }}>
          {isHost ? 'Ожидание других игроков...' : 'Ожидание начала игры...'}
        </div>

        <button
          className="start-button"
          style={{ background: '#555', marginTop: 14 }}
          onClick={onBack}
        >
          ← Назад
        </button>
      </div>
    </div>
  );
}
