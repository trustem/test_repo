import { useEffect, useRef, useState, useCallback } from 'react';
import { SUIT_SYM, cardNominal, isJoker } from '../engine/index.js';

const STORAGE_KEY = 'bardak_tooltips_enabled';
const TOOLTIP_DURATION = 3800;

export function useGameTooltips(G, engine, hi) {
  const [enabled, setEnabled] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [tooltip, setTooltip] = useState(null);
  const timerRef = useRef(null);

  // ── Keys shown this game session (reset on new round) ─────────
  const shownKeysRef = useRef(new Set());
  const prevRoundNumRef = useRef(null);

  // ── Previous state for transition detection ───────────────────
  const prevPhaseRef = useRef(null);
  const prevAttackerRef = useRef(null);
  const prevDefenderRef = useRef(null);
  const prevDefenderTakingRef = useRef(false);
  const prevTrumpKeyRef = useRef(null);
  const prevDeckLenRef = useRef(null);
  const prevHandLenRef = useRef(null);
  const prevNakiPhaseRef = useRef(false);
  const prevTransferPhaseRef = useRef(false);

  const show = useCallback((key, text) => {
    // If key provided, never repeat within same game session
    if (key && shownKeysRef.current.has(key)) return;
    if (key) shownKeysRef.current.add(key);
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltip(text);
    timerRef.current = setTimeout(() => setTooltip(null), TOOLTIP_DURATION);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltip(null);
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      if (!next) { if (timerRef.current) clearTimeout(timerRef.current); setTooltip(null); }
      return next;
    });
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (!G || hi === -1 || !enabled) return;
    const p = G.players[hi];
    if (!p) return;

    // ── Reset shown keys on new round ─────────────────────────────
    if (G.roundNum !== prevRoundNumRef.current) {
      prevRoundNumRef.current = G.roundNum;
      shownKeysRef.current = new Set();
    }

    const phase = G.phase;
    const prevPhase = prevPhaseRef.current;
    const phaseChanged = phase !== prevPhase;

    // ── Trump revealed / chosen ────────────────────────────────────
    if (G.trumpAnnouncement && G.trumpAnnouncement.key !== prevTrumpKeyRef.current) {
      prevTrumpKeyRef.current = G.trumpAnnouncement.key;
      if (G.trumpAnnouncement.suit) {
        show(null, `Козырь — ${SUIT_SYM[G.trumpAnnouncement.suit]}. Козыри бьют любую карту!`);
        return;
      }
    }

    // ── Nakidyvanie phase starts ───────────────────────────────────
    const isNaki = phase === 'nakidyvanie';
    if (isNaki && !prevNakiPhaseRef.current) {
      prevNakiPhaseRef.current = true;
      show('naki-start', 'Накидывание: все могут добавить карты того же номинала');
      prevPhaseRef.current = phase;
      return;
    }
    if (!isNaki) prevNakiPhaseRef.current = false;

    // ── Transfer-throw phase starts ────────────────────────────────
    const isTransfer = !!G.transferThrowPhase;
    if (isTransfer && !prevTransferPhaseRef.current) {
      prevTransferPhaseRef.current = true;
      if (G.transferThrowQueue?.[0] === hi) {
        show('transfer-throw', 'Перевод! Можешь добавить карту того же номинала');
      }
      prevPhaseRef.current = phase;
      return;
    }
    if (!isTransfer) prevTransferPhaseRef.current = false;

    // ── Defender starts taking ─────────────────────────────────────
    if (G.defenderTaking && !prevDefenderTakingRef.current) {
      prevDefenderTakingRef.current = true;
      if (hi !== G.defenderIdx) {
        show('defender-taking', 'Противник берёт карты — добавляй что можно!');
      }
    } else if (!G.defenderTaking) {
      prevDefenderTakingRef.current = false;
    }

    // ── Phase or role transitions ──────────────────────────────────
    if (phaseChanged) {
      prevPhaseRef.current = phase;

      if (phase === 'attack') {
        if (engine.leftThrowerIdx() === hi && !G.attackDone) {
          if (G.tablePairs.filter(p => !p.isNaki).length === 0) {
            show('attack-first', 'Твой ход — брось карту на стол для атаки');
          } else {
            show('attack-add', 'Можешь добавить карты того же номинала или нажми Готово');
          }
        }
        return;
      }

      if (phase === 'defense' && G.defenderIdx === hi) {
        const canTransfer = p.hand.some(c => engine.canTransfer(c, G.tablePairs));
        if (canTransfer) {
          show('defense-transfer', 'Можешь отбиться или перевести атаку картой того же номинала');
        } else {
          // Check for untouchable suit
          const untouchable = G.trumpSuit === 'spades' ? 'clubs' : 'spades';
          const hasUntouchableAttack = G.tablePairs.some(
            pair => !pair.defense && !isJoker(pair.attack) && pair.attack.suit === untouchable
          );
          if (hasUntouchableAttack) {
            const suitSym = SUIT_SYM[untouchable];
            show('untouchable-suit', `${suitSym} бьётся только ${suitSym}! Козырь не поможет`);
          } else {
            show('defense-basic', 'Отбивайся! Перекрой каждую карту старшей или козырем');
          }
        }
        return;
      }
    }

    // ── Attacker changes to human (same phase) ─────────────────────
    if (phase === 'attack' && G.attackerIdx !== prevAttackerRef.current) {
      prevAttackerRef.current = G.attackerIdx;
      if (G.attackerIdx === hi && !G.attackDone) {
        show('attack-first', 'Твой ход — брось карту на стол для атаки');
      }
    }

    // ── Defender changes to human (same phase) ─────────────────────
    if (phase === 'defense' && G.defenderIdx !== prevDefenderRef.current) {
      prevDefenderRef.current = G.defenderIdx;
      if (G.defenderIdx === hi) {
        const untouchable = G.trumpSuit === 'spades' ? 'clubs' : 'spades';
        const hasUntouchableAttack = G.tablePairs.some(
          pair => !pair.defense && !isJoker(pair.attack) && pair.attack.suit === untouchable
        );
        if (hasUntouchableAttack) {
          const suitSym = SUIT_SYM[untouchable];
          show('untouchable-suit', `${suitSym} бьётся только ${suitSym}! Козырь не поможет`);
        } else {
          const canTransfer = p.hand.some(c => engine.canTransfer(c, G.tablePairs));
          if (canTransfer) {
            show('defense-transfer', 'Можешь отбиться или перевести атаку картой того же номинала');
          } else {
            show('defense-basic', 'Отбивайся! Перекрой каждую карту старшей или козырем');
          }
        }
      }
    }

    // ── Untouchable suit appears mid-defense ───────────────────────
    // (new attack card added while already defending)
    if (phase === 'defense' && G.defenderIdx === hi && !shownKeysRef.current.has('untouchable-suit')) {
      const untouchable = G.trumpSuit === 'spades' ? 'clubs' : 'spades';
      const hasUntouchableAttack = G.tablePairs.some(
        pair => !pair.defense && !isJoker(pair.attack) && pair.attack.suit === untouchable
      );
      if (hasUntouchableAttack) {
        const suitSym = SUIT_SYM[untouchable];
        show('untouchable-suit', `${suitSym} бьётся только ${suitSym}! Козырь не поможет`);
      }
    }

    // ── Deck almost empty ─────────────────────────────────────────
    const deckLen = G.deck.length;
    if (prevDeckLenRef.current !== null && prevDeckLenRef.current > 5 && deckLen <= 5 && deckLen > 0) {
      show('deck-low', `В колоде осталось ${deckLen} карт — играем осторожнее!`);
    }
    prevDeckLenRef.current = deckLen;

    // ── Hand down to 1 card ────────────────────────────────────────
    const handLen = p.hand.length;
    if (prevHandLenRef.current !== null && prevHandLenRef.current > 1 && handLen === 1) {
      show('hand-one', 'Осталась одна карта!');
    }
    prevHandLenRef.current = handLen;

  }, [
    G, hi, enabled, show,
    G?.phase, G?.attackerIdx, G?.defenderIdx, G?.defenderTaking,
    G?.trumpAnnouncement?.key, G?.deck?.length, G?.transferThrowPhase,
    G?.phase === 'nakidyvanie' ? G?.nakiPending?.length : null,
    G?.tablePairs?.length,
  ]);

  return { tooltip, enabled, toggleEnabled, dismiss };
}
