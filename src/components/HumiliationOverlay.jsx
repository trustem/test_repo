import React, { useState, useEffect } from 'react';

// ─── Rank config ──────────────────────────────────────────────
const RANK_CONFIG = {
  'Проебал': {
    color: '#e67e22',
    glow: 'rgba(230,126,34,0.4)',
    bg: 'radial-gradient(ellipse at center, #2a1200 0%, #0d0800 100%)',
    crowd: '🤣🤣🤣',
    title: 'ПРОЕБАЛ',
    art: ProebalArt,
  },
  'Суперпроебал': {
    color: '#e74c3c',
    glow: 'rgba(231,76,60,0.5)',
    bg: 'radial-gradient(ellipse at center, #2a0a08 0%, #0d0404 100%)',
    crowd: '🤣😂🤣😂🤣',
    title: 'СУПЕРПРОЕБАЛ',
    art: SuperProebalArt,
  },
  'Супермегапроебал': {
    color: '#c0392b',
    glow: 'rgba(192,57,43,0.6)',
    bg: 'radial-gradient(ellipse at center, #1a0000 0%, #0a0000 100%)',
    crowd: '🤣😂💀😂🤣',
    title: 'СУПЕРМЕГАПРОЕБАЛ',
    art: SupermegaProebalArt,
  },
  'Суперотсосал': {
    color: '#8e44ad',
    glow: 'rgba(142,68,173,0.5)',
    bg: 'radial-gradient(ellipse at center, #1a0025 0%, #080010 100%)',
    crowd: '🤣😂🤣😂🤣😂',
    title: 'СУПЕРОТСОСАЛ',
    art: SuperOtsosal,
  },
  'Супермегаотсосал': {
    color: '#6c1fa8',
    glow: 'rgba(108,31,168,0.6)',
    bg: 'radial-gradient(ellipse at center, #100020 0%, #050010 100%)',
    crowd: '💀🤣😂🤣💀',
    title: 'СУПЕРМЕГАОТСОСАЛ',
    art: SupermegaOtsosal,
  },
  'Королевский отсос': {
    color: '#ff0040',
    glow: 'rgba(255,0,64,0.7)',
    bg: 'radial-gradient(ellipse at center, #1a0010 0%, #050008 100%)',
    crowd: '👑💀🤣💀👑',
    title: '👑 КОРОЛЕВСКИЙ ОТСОС 👑',
    art: KorolevskiyOtsos,
  },
};

// ─── Art components ───────────────────────────────────────────
function ProebalArt({ name }) {
  return (
    <div className="humil-art">
      <div className="humil-joker-fly">🃏</div>
      <div className="humil-scene">
        <div className="humil-laugh left">🤣</div>
        <div className="humil-loser-face">😭</div>
        <div className="humil-laugh right">🤣</div>
      </div>
      <div className="humil-name">{name}</div>
      <div className="humil-impact">💥</div>
    </div>
  );
}

function SuperProebalArt({ name }) {
  return (
    <div className="humil-art">
      <div className="humil-skull-drop">💀</div>
      <div className="humil-joker-fly" style={{ animationDelay: '0.15s' }}>🃏</div>
      <div className="humil-scene">
        <div className="humil-laugh left">😂</div>
        <div className="humil-loser-face">😱</div>
        <div className="humil-laugh right">😂</div>
      </div>
      <div className="humil-name">{name}</div>
      <div className="humil-crowd-row">🤣&nbsp;🤣&nbsp;🤣&nbsp;🤣</div>
    </div>
  );
}

function SupermegaProebalArt({ name }) {
  return (
    <div className="humil-art">
      <div className="humil-fire-row">🔥&nbsp;💀&nbsp;🔥</div>
      <div className="humil-scene">
        <div className="humil-laugh left">🤣</div>
        <div className="humil-loser-face">😵</div>
        <div className="humil-laugh right">🤣</div>
      </div>
      <div className="humil-name">{name}</div>
      <div className="humil-crowd-row">🤣&nbsp;😂&nbsp;🤣&nbsp;😂&nbsp;🤣</div>
      <div className="humil-joker-fly" style={{ fontSize: 28, animationDelay: '0.2s' }}>🃏</div>
    </div>
  );
}

function SuperOtsosal({ name }) {
  return (
    <div className="humil-art">
      <div className="humil-suck-scene">
        <span className="humil-lips">👅</span>
        <span className="humil-wind">💨💨</span>
      </div>
      <div className="humil-scene">
        <div className="humil-laugh left">😂</div>
        <div className="humil-loser-face">😭</div>
        <div className="humil-laugh right">😂</div>
      </div>
      <div className="humil-name">{name}</div>
      <div className="humil-crowd-row">🤣&nbsp;😂&nbsp;🤣&nbsp;😂&nbsp;🤣&nbsp;😂</div>
    </div>
  );
}

function SupermegaOtsosal({ name }) {
  return (
    <div className="humil-art">
      <div className="humil-fire-row">💀&nbsp;👅&nbsp;💨&nbsp;🌪️</div>
      <div className="humil-scene">
        <div className="humil-laugh left">💀</div>
        <div className="humil-loser-face">😵</div>
        <div className="humil-laugh right">💀</div>
      </div>
      <div className="humil-name">{name}</div>
      <div className="humil-crowd-row">🤣&nbsp;😂&nbsp;💀&nbsp;😂&nbsp;🤣&nbsp;💀</div>
      <div className="humil-fire-row" style={{ fontSize: 24 }}>🔥&nbsp;🔥&nbsp;🔥&nbsp;🔥&nbsp;🔥</div>
    </div>
  );
}

function KorolevskiyOtsos({ name }) {
  return (
    <div className="humil-art">
      <div className="humil-crown-drop">👑</div>
      <div className="humil-fire-row">💀&nbsp;👅&nbsp;💨&nbsp;👅&nbsp;💀</div>
      <div className="humil-scene">
        <div className="humil-laugh left">🔥</div>
        <div className="humil-loser-face" style={{ fontSize: 54 }}>💀</div>
        <div className="humil-laugh right">🔥</div>
      </div>
      <div className="humil-name royal">{name}</div>
      <div className="humil-crowd-row">🤣&nbsp;💀&nbsp;🤣&nbsp;💀&nbsp;🤣&nbsp;💀&nbsp;🤣</div>
      <div className="humil-fire-row">🔥&nbsp;🔥&nbsp;🔥&nbsp;🔥&nbsp;🔥&nbsp;🔥</div>
    </div>
  );
}

// ─── Secondary loser pill ─────────────────────────────────────
function SecondaryLoser({ name, fromName }) {
  return (
    <div className="humil-secondary">
      <span>🃏 {name} получил джокер от {fromName}</span>
    </div>
  );
}

// ─── Main overlay ─────────────────────────────────────────────
export default function HumiliationOverlay({ G, onContinue }) {
  const rank = G.gameOverRank;
  const cfg = RANK_CONFIG[rank] || RANK_CONFIG['Проебал'];
  const ArtComponent = cfg.art;
  const loser = G.players[G.gameOverPlayer];
  const [shake, setShake] = useState(false);

  // Shake effect every 2s
  useEffect(() => {
    const iv = setInterval(() => {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }, 2500);
    return () => clearInterval(iv);
  }, []);

  // Find other joker victims (not the main loser)
  const otherVictims = (G.jokerThrows || []).filter(j => j.toIdx !== G.gameOverPlayer);

  return (
    <div
      className={`humil-overlay${shake ? ' shake' : ''}`}
      style={{ background: cfg.bg }}
      onClick={onContinue}
    >
      {/* Rank title */}
      <div className="humil-rank-title" style={{ color: cfg.color, textShadow: `0 0 30px ${cfg.glow}` }}>
        {cfg.title}
      </div>

      {/* Crowd */}
      <div className="humil-crowd-top">{cfg.crowd}</div>

      {/* Main art */}
      <ArtComponent name={loser?.name || '???'} />

      {/* Other victims */}
      {otherVictims.length > 0 && (
        <div className="humil-others">
          {otherVictims.map((j, i) => (
            <SecondaryLoser
              key={i}
              name={G.players[j.toIdx]?.name || '?'}
              fromName={G.players[j.fromIdx]?.name || '?'}
            />
          ))}
        </div>
      )}

      {/* Continue hint */}
      <div className="humil-continue-hint">Нажми чтобы продолжить →</div>
    </div>
  );
}
