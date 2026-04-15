import React from 'react';
import { isJoker, isPictureJoker, isDeuceJoker, SUIT_SYM } from '../engine/index.js';

// Renders a single card element
export default function Card({
  card,
  faceUp = true,
  small = false,
  selected = false,
  validAttack = false,
  validTarget = false,
  validTransfer = false,
  draggable = false,
  dragging = false,
  dealt = false,
  className = '',
  style = {},
  onClick,
  onDragStart,
  onDragEnd,
  onTouchStart,
}) {
  if (!faceUp) {
    return (
      <div
        className={`card face-down${small ? ' small' : ''}${className ? ' ' + className : ''}`}
        style={style}
        onClick={onClick}
      />
    );
  }

  let colorClass = '';
  let inner = null;

  if (isJoker(card)) {
    colorClass = 'joker-card';
    if (isPictureJoker(card)) {
      colorClass += ' picture-joker';
      inner = (
        <>
          <div className="card-rank-suit-top">★</div>
          <div className="card-center">🃏</div>
          <div className="card-rank-suit-bottom">★</div>
        </>
      );
    } else {
      const sym = card.jokerType === 'deuce_spades' ? '♠' : '♣';
      inner = (
        <>
          <div className="card-rank-suit-top">2{sym}*</div>
          <div className="card-center">★</div>
          <div className="card-rank-suit-bottom">2{sym}*</div>
        </>
      );
    }
  } else {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    colorClass = isRed ? 'red' : 'black';
    const sym = SUIT_SYM[card.suit];
    inner = (
      <>
        <div className="card-rank-suit-top">{card.rank}<br />{sym}</div>
        <div className="card-center">{sym}</div>
        <div className="card-rank-suit-bottom">{card.rank}<br />{sym}</div>
      </>
    );
  }

  const classes = [
    'card',
    colorClass,
    small ? 'small' : '',
    selected ? 'selected' : '',
    validAttack ? 'valid-attack' : '',
    validTarget ? 'valid-target' : '',
    validTransfer ? 'valid-transfer' : '',
    dragging ? 'dragging' : '',
    dealt ? 'dealt' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={style}
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
    >
      {inner}
    </div>
  );
}
