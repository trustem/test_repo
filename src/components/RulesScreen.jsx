import React, { useState, useEffect } from 'react';

// ─── Mini card helper ─────────────────────────────────────────
function MiniCard({ rank = 'A', suit = '♠', red = false, style = {}, className = '', faceDown = false }) {
  return (
    <div
      className={`rules-mini-card${red ? ' red' : ''}${faceDown ? ' face-down' : ''}${className ? ' ' + className : ''}`}
      style={style}
    >
      {faceDown ? null : (
        <>
          <span className="rules-mini-rank">{rank}</span>
          <span className="rules-mini-suit">{suit}</span>
        </>
      )}
    </div>
  );
}

// ─── Illustrations ────────────────────────────────────────────

function GoalIllustration({ active }) {
  return (
    <div className="rules-illus">
      <div className={`rules-trophy${active ? ' animate' : ''}`}>🏆</div>
      <div className="rules-goal-ranks">
        {['😎 Победил', '👍 Норм', '😬 Проебал', '💀 Суперпроебал'].map((label, i) => (
          <div
            key={i}
            className={`rules-goal-rank-row${active ? ' animate' : ''}`}
            style={{ animationDelay: `${0.2 + i * 0.12}s` }}
          >
            <span className="rules-goal-rank-num">{i + 1}</span>
            <span className={`rules-goal-rank-label${i >= 2 ? ' bad' : ''}`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrumpIllustration({ active }) {
  return (
    <div className="rules-illus">
      {/* Deck + bottom trump card */}
      <div className="rules-trump-row">
        <div className="rules-deck-stack">
          <div className="rules-deck-back" style={{ top: 4, left: 4 }} />
          <div className="rules-deck-back" style={{ top: 2, left: 2 }} />
          <div className="rules-deck-back" style={{ top: 0, left: 0 }} />
        </div>
        <div className="rules-trump-arrow">→</div>
        <MiniCard rank="K" suit="♥" red className={active ? 'rules-trump-card-anim' : ''} />
      </div>
      <div className="rules-trump-label-sm">Нижняя карта = козырь</div>

      {/* Divider */}
      <div className="rules-divider" />

      {/* Secret card + deck empty */}
      <div className="rules-secret-row">
        <div className={`rules-deck-empty${active ? ' animate' : ''}`}>
          <span>0</span>
          <div className="rules-deck-empty-label">колода</div>
        </div>
        <div className="rules-trump-arrow">→</div>
        <div className={`rules-secret-flip${active ? ' animate' : ''}`}>
          <MiniCard rank="A" suit="♦" red className="rules-secret-inner" />
        </div>
      </div>
      <div className="rules-trump-label-sm">Колода кончилась → потайной козырь</div>
    </div>
  );
}

function SecretCardIllustration({ active }) {
  return (
    <div className="rules-illus">
      {/* Player with hand + secret card */}
      <div className="rules-secret-player">
        <div className="rules-player-icon">👤</div>
        <div className="rules-secret-hand">
          {[0,1,2].map(i => (
            <MiniCard key={i} rank="?" suit=""
              className={active ? `rules-hand-fade-${i+1}` : ''}
              style={{ marginLeft: i > 0 ? -10 : 0, zIndex: i }} />
          ))}
          <MiniCard faceDown
            className={`rules-secret-badge-card${active ? ' rules-secret-glow' : ''}`}
            style={{ marginLeft: 10 }} />
        </div>
        <div className="rules-secret-badge-label">потайная</div>
      </div>

      <div className="rules-divider" />

      {/* Condition: hand = 0, deck = 0 → flip */}
      <div className="rules-secret-condition">
        <div className="rules-secret-cond-item">
          <span className="rules-secret-cond-icon">🤚</span>
          <span className={`rules-secret-cond-val${active ? ' animate' : ''}`} style={{ animationDelay: '0.3s' }}>0</span>
        </div>
        <span style={{ color: '#5577aa', fontSize: 18 }}>+</span>
        <div className="rules-secret-cond-item">
          <span className="rules-secret-cond-icon">🃏</span>
          <span className={`rules-secret-cond-val${active ? ' animate' : ''}`} style={{ animationDelay: '0.5s' }}>0</span>
        </div>
        <span style={{ color: '#f0c040', fontSize: 20 }}>→</span>
        <div className={`rules-secret-flip${active ? ' animate' : ''}`} style={{ animationDelay: '0.7s' }}>
          <MiniCard rank="K" suit="♠" className="rules-secret-inner" />
        </div>
      </div>
      <div className="rules-trump-label-sm">Рука пуста + колода пуста = потайная открывается</div>
    </div>
  );
}

function AttackIllustration({ active }) {
  return (
    <div className="rules-illus">
      {/* Valid: 2 cards → defender with 2 cards ✓ */}
      <div className="rules-attack-example">
        <div className="rules-attack-cards">
          <MiniCard rank="7" suit="♠" className={active ? 'rules-slide-in-1' : ''} />
          <MiniCard rank="7" suit="♣" className={active ? 'rules-slide-in-2' : ''} />
        </div>
        <div className="rules-attack-arrow">→</div>
        <div className="rules-defender-hand">
          <MiniCard rank="?" suit="" style={{ opacity: 0.7 }} />
          <MiniCard rank="?" suit="" style={{ opacity: 0.7, marginLeft: -8 }} />
        </div>
        <div className="rules-ok-badge">✓</div>
      </div>

      {/* Invalid: 3 cards → defender with 2 cards ✗ */}
      <div className={`rules-attack-example invalid${active ? ' show-invalid' : ''}`}>
        <div className="rules-attack-cards">
          <MiniCard rank="9" suit="♦" red />
          <MiniCard rank="9" suit="♥" red style={{ marginLeft: -6 }} />
          <MiniCard rank="9" suit="♠" style={{ marginLeft: -6 }} />
        </div>
        <div className="rules-attack-arrow">→</div>
        <div className="rules-defender-hand">
          <MiniCard rank="?" suit="" style={{ opacity: 0.7 }} />
          <MiniCard rank="?" suit="" style={{ opacity: 0.7, marginLeft: -8 }} />
        </div>
        <div className={`rules-cross-badge${active ? ' animate' : ''}`}>✕</div>
      </div>
      <div className="rules-attack-note">Нельзя — даже если есть потайная карта!</div>
    </div>
  );
}

function DefenseIllustration({ active }) {
  return (
    <div className="rules-illus rules-illus-defense">
      <div className="rules-pair-wrap">
        <MiniCard rank="9" suit="♦" red />
        <MiniCard rank="K" suit="♦" red className={active ? 'rules-drop-in' : ''} style={{ marginTop: -24, marginLeft: 10 }} />
      </div>
      <div className="rules-pair-wrap">
        <MiniCard rank="10" suit="♠" />
        <MiniCard rank="A" suit="♠" className={active ? 'rules-drop-in-late' : ''} style={{ marginTop: -24, marginLeft: 10 }} />
      </div>
    </div>
  );
}

function UntouchableIllustration({ active }) {
  return (
    <div className="rules-illus">
      <div className="rules-untouch-row">
        {/* Attack: spade */}
        <MiniCard rank="9" suit="♠" className={active ? 'rules-slide-in-1' : ''} />
        <div className="rules-attack-arrow" style={{ fontSize: 16 }}>vs</div>

        {/* Valid: spade beats spade ✓ */}
        <div className="rules-untouch-result">
          <MiniCard rank="J" suit="♠" className={active ? 'rules-slide-in-2' : ''} />
          <div className="rules-ok-badge" style={{ fontSize: 13 }}>✓</div>
        </div>

        {/* Invalid: heart (trump) can't beat spade ✗ */}
        <div className="rules-untouch-result">
          <MiniCard rank="K" suit="♥" red style={{ opacity: 0.7 }} />
          <div className={`rules-cross-badge${active ? ' animate' : ''}`} style={{ fontSize: 16 }}>✕</div>
        </div>
      </div>
      <div className="rules-untouch-note">♠ 9 атака — бьётся только пикой старше</div>
      <div className="rules-divider" style={{ margin: '4px 0' }} />
      <div className="rules-untouch-swap">
        <span className="rules-untouch-case">Козырь = ♠</span>
        <span className="rules-untouch-arrow">→</span>
        <span className="rules-untouch-case red">♣ бьётся только ♣</span>
      </div>
    </div>
  );
}

function TransferIllustration({ active }) {
  return (
    <div className="rules-illus">
      <div className="rules-transfer-row">
        <div className="rules-player-icon">👤</div>
        <div className={`rules-transfer-arrow${active ? ' animate' : ''}`}>→</div>
        <div className="rules-player-icon">👤</div>
      </div>
      <MiniCard rank="8" suit="♣" className={active ? 'rules-transfer-card' : ''} />
      <div className="rules-transfer-note">та же карта</div>
    </div>
  );
}

function NakiBasicIllustration({ active }) {
  return (
    <div className="rules-illus">
      <div className="rules-naki-table">
        <MiniCard rank="6" suit="♠" />
        <MiniCard rank="8" suit="♣" />
      </div>
      <div className="rules-naki-who">Все кроме защищающегося</div>
      <div className="rules-naki-falling">
        {[0, 1, 2].map(i => (
          <MiniCard key={i} rank={['8', '8', '6'][i]} suit={['♦', '♥', '♣'][i]} red={i < 2}
            className={active ? `rules-fall-${i + 1}` : ''}
            style={{ margin: '0 3px' }} />
        ))}
      </div>
      <div className="rules-naki-note">Бросай карты тех же номиналов что на столе</div>
    </div>
  );
}

function NakiOrderIllustration({ active }) {
  return (
    <div className="rules-illus">
      <div className="rules-naki-order">
        {[
          { icon: '👤', label: 'Атакующий', nom: '9', first: true },
          { icon: '👤', label: 'Следующий', nom: 'J', first: false },
          { icon: '👤', label: 'Ещё один', nom: 'Q', first: false },
        ].map((p, i) => (
          <div
            key={i}
            className={`rules-order-player${active ? ' animate' : ''}`}
            style={{ animationDelay: `${i * 0.18}s` }}
          >
            <span className="rules-order-icon">{p.icon}</span>
            <span className="rules-order-nom">{p.nom}</span>
            <span className="rules-order-label">{p.label}</span>
            {i < 2 && <div className="rules-order-arrow">↓</div>}
          </div>
        ))}
      </div>
      <div className="rules-naki-note" style={{ marginTop: 8 }}>
        Каждый бросает 1 карту по очереди, если у других такой же или меньший номинал
      </div>
    </div>
  );
}

function NakiMultiIllustration({ active }) {
  return (
    <div className="rules-illus">
      <div className="rules-naki-multi-row">
        {/* Player with lowest nominal — throws multiple */}
        <div className="rules-naki-player-block">
          <span className="rules-order-icon">👤</span>
          <div className={`rules-order-nom gold${active ? ' pulse' : ''}`}>6</div>
          <div className="rules-naki-multi-cards">
            {[0, 1, 2].map(i => (
              <MiniCard key={i} rank="6" suit={['♠','♣','♦'][i]} red={i===2}
                className={active ? `rules-fall-${i + 1}` : ''}
                style={{ margin: '0 2px' }} />
            ))}
          </div>
          <span className="rules-multi-badge">×3 ✓</span>
        </div>
        {/* Other player — throws 1 */}
        <div className="rules-naki-player-block" style={{ opacity: 0.55 }}>
          <span className="rules-order-icon">👤</span>
          <div className="rules-order-nom">9</div>
          <MiniCard rank="9" suit="♣" />
          <span className="rules-multi-badge">×1</span>
        </div>
      </div>
      <div className="rules-naki-note" style={{ marginTop: 8 }}>
        У кого минимальный номинал — может бросить сразу все такие карты!
      </div>
    </div>
  );
}

function DrawIllustration({ active }) {
  return (
    <div className="rules-illus">
      <div className="rules-draw-row">
        <div className="rules-deck-stack-v">
          <div className="rules-deck-back" style={{ bottom: 4 }} />
          <div className="rules-deck-back" style={{ bottom: 2 }} />
          <div className="rules-deck-back" />
        </div>
        <div className={`rules-draw-arrow${active ? ' animate' : ''}`}>→</div>
        <div className="rules-hand-fan">
          {[0, 1, 2].map(i => (
            <MiniCard key={i} rank={['6', '7', '8'][i]} suit="♠"
              className={active ? `rules-draw-card-${i + 1}` : ''}
              style={{ transform: `rotate(${(i - 1) * 12}deg)`, marginLeft: i > 0 ? -12 : 0 }} />
          ))}
        </div>
      </div>
      <div className="rules-draw-label">До 6 карт на руку (5 в игре на 6 человек)</div>
      <div className="rules-draw-label" style={{ opacity: 0.7 }}>Атакующий берёт первым</div>
    </div>
  );
}

function LadderIllustration({ active }) {
  const items = [
    { label: '1', text: 'Победил', color: '#f0c040' },
    { label: '2', text: 'Красавчик', color: 'rgba(80,140,220,0.8)' },
    { label: '3', text: 'Норм', color: 'rgba(80,140,220,0.6)' },
    { label: 'П', text: 'Проебал', color: '#e67e22' },
    { label: 'СП', text: 'Суперпроебал', color: '#c0392b' },
    { label: 'СМП', text: 'Супермегапроебал', color: '#7b0000' },
  ];
  const heights = [90, 70, 55, 42, 30, 20];
  return (
    <div className="rules-illus">
      <div className="rules-ladder">
        {items.map((item, i) => (
          <div key={i} className="rules-ladder-col">
            <div className="rules-ladder-label" style={{ color: item.color }}>{item.label}</div>
            <div
              className={`rules-ladder-bar${active ? ' animate' : ''}`}
              style={{ height: heights[i], background: item.color, animationDelay: `${i * 0.1}s` }}
            />
          </div>
        ))}
      </div>
      <div className="rules-ladder-legend">
        {items.slice(3).map((item, i) => (
          <div key={i} className="rules-ladder-legend-row" style={{ color: item.color }}>
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pages ────────────────────────────────────────────────────
const PAGES = [
  {
    title: 'Цель игры',
    text: 'Первым избавься от всех карт! Последний с картами — дурак. Есть и хуже: если тебе бросили Джокер — «Проебал», «Суперпроебал» или даже «Супермегапроебал». Место в таблице очков сохраняется между раундами.',
    Illustration: GoalIllustration,
  },
  {
    title: 'Козырь',
    text: 'В начале игры нижняя карта колоды становится козырем. Козырь бьёт любую карту другой масти. Когда колода заканчивается — открывается потайная карта, и её масть становится новым козырем!',
    Illustration: TrumpIllustration,
  },
  {
    title: 'Потайная карта',
    text: 'У каждого игрока есть одна потайная карта — она лежит рубашкой вверх и её масть неизвестна даже самому игроку. Карта открывается только когда рука полностью пуста И колода закончилась. До этого момента — тайна!',
    Illustration: SecretCardIllustration,
  },
  {
    title: 'Пики и крести — особые масти',
    text: 'Пики (♠) бьются ТОЛЬКО пиками — козырь не поможет! Если козырь сам пики, то то же самое правило действует для крестей (♣): они бьются только крестями. Запомни — это ключевое правило Бардака!',
    Illustration: UntouchableIllustration,
  },
  {
    title: 'Накидывание',
    text: 'Когда защищающийся решает взять карты — все остальные могут накидывать карты тех же номиналов, что лежат на столе. Чем больше карт накидают — тем тяжелее защищающемуся.',
    Illustration: NakiBasicIllustration,
  },
  {
    title: 'Накидывание — порядок',
    text: 'Каждый бросает по одной карте в порядке очереди. Нельзя бросить несколько карт, если другие игроки ещё не бросали свой номинал или их номинал меньше твоего.',
    Illustration: NakiOrderIllustration,
  },
  {
    title: 'Накидывание — несколько карт',
    text: 'Если твой целевой номинал меньше, чем у всех остальных — можешь бросить сразу все карты этого номинала! Минимальный номинал = право бросить больше.',
    Illustration: NakiMultiIllustration,
  },
  {
    title: 'Атака',
    text: 'Атакующий бросает карту на стол. Можно добавлять карты того же номинала. Но нельзя выложить больше карт, чем у защищающегося на руке — даже если у него есть потайная карта!',
    Illustration: AttackIllustration,
  },
  {
    title: 'Перевод',
    text: 'Если у защищающегося есть карта того же номинала — можно перевести атаку следующему игроку. Перевод невозможен, если стол полон или следующий игрок уже вышел.',
    Illustration: TransferIllustration,
  },
  {
    title: 'Защита',
    text: 'Защищающийся должен перекрыть каждую карту: старшей картой той же масти или любым козырем. Не можешь отбиться — берёшь все карты со стола.',
    Illustration: DefenseIllustration,
  },
  {
    title: 'Добор карт',
    text: 'После каждого раунда игроки добирают карты из колоды до 6 штук (5 в игре на 6 человек). Сначала берёт атакующий, потом по кругу. Когда колода закончится — играем тем что есть.',
    Illustration: DrawIllustration,
  },
  {
    title: 'Таблица очков',
    text: 'Первый кто выложил все карты — 1-е место. Места занимаются по очереди. Последний с картами — дурак. Попасть под Джокер = специальное проигрышное место. Очки влияют на порядок ходов в следующей игре.',
    Illustration: LadderIllustration,
  },
];

// ─── Main component ───────────────────────────────────────────
export default function RulesScreen({ onClose }) {
  const [page, setPage] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  const goTo = (idx) => {
    setPage(idx);
    setAnimKey(k => k + 1);
  };
  const prev = () => { if (page > 0) goTo(page - 1); };
  const next = () => { if (page < PAGES.length - 1) goTo(page + 1); };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [page]);

  const { title, text, Illustration } = PAGES[page];

  return (
    <div className="rules-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rules-modal">
        <button className="rules-close-btn" onClick={onClose} title="Закрыть">✕</button>

        <div className="rules-header">
          <span className="rules-page-num">{page + 1} / {PAGES.length}</span>
          <h2 className="rules-title">{title}</h2>
        </div>

        <div className="rules-illus-wrap" key={animKey}>
          <Illustration active />
        </div>

        <p className="rules-text">{text}</p>

        <div className="rules-dots">
          {PAGES.map((_, i) => (
            <button key={i} className={`rules-dot${i === page ? ' active' : ''}`} onClick={() => goTo(i)} />
          ))}
        </div>

        <div className="rules-nav">
          <button className="rules-nav-btn" onClick={prev} disabled={page === 0}>←</button>
          {page === PAGES.length - 1
            ? <button className="rules-nav-btn rules-nav-finish" onClick={onClose}>Играть!</button>
            : <button className="rules-nav-btn rules-nav-next" onClick={next}>Далее →</button>
          }
        </div>
      </div>
    </div>
  );
}
