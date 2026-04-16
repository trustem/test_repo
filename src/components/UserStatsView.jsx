import React, { useState, useEffect, useMemo } from 'react';
import { loadGameHistory, SHAME_RANK_POINTS, SHAME_BADGE_RANKS } from '../auth/index.js';

// ─── Rating chart (SVG) ───────────────────────────────────────
function RatingChart({ data }) {
  const W = 280, H = 96, PAD = 12;

  const cumulative = useMemo(() => {
    let sum = 0;
    return data.map(g => { sum += g.points; return { ...g, cum: sum }; });
  }, [data]);

  const vals  = cumulative.map(d => d.cum);
  const minV  = Math.min(...vals);
  const maxV  = Math.max(...vals);
  const range = Math.max(maxV - minV, 1);

  const cx = i => PAD + (i / Math.max(cumulative.length - 1, 1)) * (W - 2 * PAD);
  const cy = v => (H - PAD) - ((v - minV) / range) * (H - 2 * PAD);

  const pts = cumulative.map((d, i) => `${cx(i)},${cy(d.cum)}`).join(' ');

  const dotFill = d => {
    if (d.isWin) return '#2ecc71';
    if (SHAME_RANK_POINTS[d.rank] !== undefined) return '#e74c3c';
    return '#f0c040';
  };

  return (
    <div className="stats-chart-wrap">
      <div className="stats-chart-ylabels">
        <span>{maxV}</span>
        <span>{minV}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="stats-chart-svg">
        {/* Zero line */}
        {minV < 0 && (
          <line x1={PAD} x2={W - PAD} y1={cy(0)} y2={cy(0)}
            stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="4,3" />
        )}
        {/* Trend line */}
        <polyline points={pts} fill="none" stroke="rgba(240,192,64,.7)" strokeWidth="2" strokeLinejoin="round" />
        {/* Fill area */}
        <polygon
          points={`${cx(0)},${cy(minV)} ${pts} ${cx(cumulative.length - 1)},${cy(minV)}`}
          fill="url(#chartGrad)" opacity="0.18"
        />
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0c040" />
            <stop offset="100%" stopColor="#f0c040" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Dots */}
        {cumulative.map((d, i) => (
          <circle key={i} cx={cx(i)} cy={cy(d.cum)} r="3.5"
            fill={dotFill(d)} stroke="rgba(0,0,0,.5)" strokeWidth="1" />
        ))}
      </svg>
      <div className="stats-chart-games">{data.length} игр</div>
    </div>
  );
}

// ─── Stats by player count ────────────────────────────────────
function StatsByCount({ statsByCount }) {
  const rows = [2, 3, 4, 5, 6].map(n => {
    const s = statsByCount?.[String(n)];
    if (!s?.games) return null;
    return {
      n,
      games: s.games,
      wins:  s.wins  || 0,
      avg:   s.games > 0 ? (s.totalPoints / s.games).toFixed(1) : '—',
      winPct: s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0,
    };
  }).filter(Boolean);

  if (!rows.length) return null;

  return (
    <div className="stats-by-count">
      <div className="stats-section-title">По количеству игроков</div>
      <div className="stats-count-table">
        <div className="stats-count-head">
          <span>Состав</span><span>Игр</span><span>Побед</span><span>Средний</span>
        </div>
        {rows.map(r => (
          <div key={r.n} className="stats-count-row">
            <span className="stats-count-n">{r.n}v{r.n}</span>
            <span>{r.games}</span>
            <span>{r.wins} <span className="stats-count-pct">({r.winPct}%)</span></span>
            <span className="stats-count-avg">{r.avg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────
// profile: { name, photoURL, totalRating, gamesPlayed, wins, shameStatus, statsByCount }
export default function UserStatsView({ uid, profile }) {
  const [history, setHistory] = useState(null); // null = loading

  useEffect(() => {
    setHistory(null);
    loadGameHistory(uid, 30).then(setHistory);
  }, [uid]);

  const gamesPlayed  = profile?.gamesPlayed  || 0;
  const totalRating  = profile?.totalRating  || 0;
  const wins         = profile?.wins         || 0;
  const avgRating    = gamesPlayed > 0 ? (totalRating / gamesPlayed).toFixed(1) : '—';
  const winPct       = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

  const shameActive  = profile?.shameStatus?.expiresAt > Date.now();
  const shameExpiry  = shameActive
    ? new Date(profile.shameStatus.expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    : null;

  return (
    <div className="stats-view">
      {/* Hero numbers */}
      <div className="stats-hero">
        <div className="stats-hero-item">
          <div className="stats-hero-val">{totalRating}</div>
          <div className="stats-hero-label">Рейтинг</div>
        </div>
        <div className="stats-hero-item">
          <div className="stats-hero-val">{avgRating}</div>
          <div className="stats-hero-label">Среднее</div>
        </div>
        <div className="stats-hero-item">
          <div className="stats-hero-val">{gamesPlayed}</div>
          <div className="stats-hero-label">Игр</div>
        </div>
        <div className="stats-hero-item">
          <div className="stats-hero-val">{winPct}%</div>
          <div className="stats-hero-label">Побед</div>
        </div>
      </div>

      {/* Shame badge */}
      {shameActive && (
        <div className="stats-shame-badge">
          💀 <strong>{profile.shameStatus.rank}</strong> — позор до {shameExpiry}
        </div>
      )}

      {/* Rating dynamics chart */}
      <div className="stats-section-title" style={{ marginTop: 16 }}>Динамика рейтинга</div>
      {history === null ? (
        <div className="stats-chart-placeholder">Загрузка...</div>
      ) : history.length < 2 ? (
        <div className="stats-chart-placeholder">Нужно сыграть хотя бы 2 игры</div>
      ) : (
        <RatingChart data={history} />
      )}

      {/* By player count */}
      <StatsByCount statsByCount={profile?.statsByCount} />
    </div>
  );
}
