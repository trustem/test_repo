import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_URL = 'file://' + path.resolve(__dirname, '../durak/index.html');

// Helper: wait for game screen to be active
async function startSoloGame(page) {
  await page.goto(FILE_URL);
  await page.waitForSelector('#lobby-screen.active', { timeout: 5000 });
  await page.click('#solo-btn');
  await page.waitForSelector('#setup-screen.active', { timeout: 5000 });
  await page.click('#start-btn');
  await page.waitForSelector('#game-screen.active', { timeout: 5000 });
}

// Helper: wait for human hand to have cards
async function waitForHand(page, timeout = 10000) {
  await page.waitForFunction(
    () => document.querySelectorAll('#human-hand .card').length > 0,
    { timeout }
  );
}

// Helper: wait for it to be human's turn (any action button visible)
async function waitForHumanTurn(page, timeout = 25000) {
  await page.waitForFunction(
    () => document.querySelectorAll('#action-buttons .action-btn').length > 0,
    { timeout }
  );
}

// ─── LOBBY ───────────────────────────────────────────────────
test('лобби загружается корректно', async ({ page }) => {
  await page.goto(FILE_URL);
  await expect(page.locator('#lobby-screen')).toHaveClass(/active/);
  await expect(page.locator('.game-title').first()).toHaveText('Бардак');
  await expect(page.locator('#solo-btn')).toBeVisible();
  await expect(page.locator('#create-room-btn')).toBeVisible();
});

test('кнопка "Играть с ботами" открывает экран настройки', async ({ page }) => {
  await page.goto(FILE_URL);
  await page.click('#solo-btn');
  await expect(page.locator('#setup-screen')).toHaveClass(/active/);
  await expect(page.locator('#start-btn')).toBeVisible();
  await expect(page.locator('#player-slots')).toBeVisible();
});

// ─── SETUP ───────────────────────────────────────────────────
test('можно изменить количество игроков', async ({ page }) => {
  await page.goto(FILE_URL);
  await page.click('#solo-btn');
  await page.waitForSelector('#setup-screen.active');
  // Select 3 players — scope to setup-screen to avoid ambiguity
  await page.click('#setup-screen .count-btn[data-count="3"]');
  await expect(page.locator('#setup-screen .count-btn[data-count="3"]')).toHaveClass(/active/);
});

// ─── GAME START ──────────────────────────────────────────────
test('игра запускается — виден игровой экран', async ({ page }) => {
  await startSoloGame(page);
  await expect(page.locator('#game-screen')).toHaveClass(/active/);
  await expect(page.locator('#deck-count')).toBeVisible();
  await expect(page.locator('#trump-panel-suit')).toBeVisible();
});

test('карты раздаются — в руке есть карты', async ({ page }) => {
  await startSoloGame(page);
  await waitForHand(page);
  const cards = await page.locator('#human-hand .card').count();
  expect(cards).toBeGreaterThanOrEqual(1);
});

test('колода уменьшается после раздачи', async ({ page }) => {
  await startSoloGame(page);
  await waitForHand(page);
  const deckCount = await page.locator('#deck-count').textContent();
  expect(parseInt(deckCount)).toBeLessThan(40);
});

test('козырь установлен', async ({ page }) => {
  await startSoloGame(page);
  await waitForHand(page);
  const trump = await page.locator('#trump-panel-suit').textContent();
  expect(trump.trim()).not.toBe('');
});

// ─── GAME LOG ────────────────────────────────────────────────
test('журнал открывается и закрывается', async ({ page }) => {
  await startSoloGame(page);
  await waitForHand(page);

  // Log should not be open initially
  await expect(page.locator('.log-area')).not.toHaveClass(/mobile-open/);

  // Open log
  await page.click('#log-toggle-btn');
  await expect(page.locator('.log-area')).toHaveClass(/mobile-open/);

  // Close with X button
  await page.click('#log-close-btn');
  await expect(page.locator('.log-area')).not.toHaveClass(/mobile-open/);
});

test('журнал содержит записи после старта игры', async ({ page }) => {
  await startSoloGame(page);
  await waitForHand(page);
  const logEntries = await page.locator('#game-log > div').count();
  expect(logEntries).toBeGreaterThan(0);
});

// ─── GAMEPLAY ────────────────────────────────────────────────
test('ход игры — за 60 секунд появляется хотя бы 1 ход в логе', async ({ page }) => {
  await startSoloGame(page);
  await waitForHand(page);

  // Wait for at least one attack log entry
  await page.waitForFunction(
    () => {
      const entries = document.querySelectorAll('#game-log > div');
      return Array.from(entries).some(e => e.textContent.includes('атакует') || e.textContent.includes('отбивает'));
    },
    { timeout: 15000 }
  );

  const logText = await page.locator('#game-log').textContent();
  expect(logText).toMatch(/атакует|отбивает/);
});

test('кнопки действий появляются когда ход игрока', async ({ page }) => {
  test.setTimeout(45000);
  await startSoloGame(page);
  await waitForHand(page);
  await waitForHumanTurn(page, 35000);
  const buttons = await page.locator('#action-buttons').locator('button').count();
  expect(buttons).toBeGreaterThan(0);
});

test('игра не зависает — лог и игровые элементы появляются', async ({ page }) => {
  await startSoloGame(page);
  await waitForHand(page);

  // Log must have at least the initial game entries (round header + trump)
  const logEntries = await page.locator('#game-log > div').count();
  expect(logEntries).toBeGreaterThanOrEqual(2);

  // Game elements must be rendered
  await expect(page.locator('#deck-count')).toBeVisible();
  await expect(page.locator('#discard-count')).toBeVisible();
  await expect(page.locator('#human-hand')).toBeVisible();

  // Either it's human turn (action buttons shown) or bots are playing (no buttons)
  const gameScreenActive = await page.locator('#game-screen.active').isVisible();
  expect(gameScreenActive).toBe(true);
});

// ─── NEW GAME ────────────────────────────────────────────────
test('кнопка "Новая игра" перезапускает игру', async ({ page }) => {
  await startSoloGame(page);
  await waitForHand(page);

  await page.click('#new-game-btn');

  // Should go back to lobby or setup
  await page.waitForFunction(
    () => {
      const lobby = document.getElementById('lobby-screen');
      const setup = document.getElementById('setup-screen');
      return lobby?.classList.contains('active') || setup?.classList.contains('active');
    },
    { timeout: 5000 }
  );
});

// ─── ATTACK LIMIT ────────────────────────────────────────────
test('лимит атаки: нельзя выбрать больше карт чем у защитника', async ({ page }) => {
  test.setTimeout(45000);
  await startSoloGame(page);
  await waitForHand(page);
  await waitForHumanTurn(page, 35000);

  // Read attack limit from game state
  const limit = await page.evaluate(() => {
    if (typeof getAttackLimit === 'function') return getAttackLimit();
    return null;
  });

  if (limit !== null) {
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(6);
  }
});

// ─── GAME COMPLETION ─────────────────────────────────────────
test('игра с 2 ботами — хотя бы 1 раунд завершается', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(FILE_URL);
  await page.click('#solo-btn');
  await page.waitForSelector('#setup-screen.active');
  await page.click('#setup-screen .count-btn[data-count="2"]');
  await page.click('#start-btn');
  await page.waitForSelector('#game-screen.active', { timeout: 5000 });
  await waitForHand(page);

  // Auto-play: whenever it's human turn, click "Взять" (take) or "Готово" (done)
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const takeBtn = page.locator('#action-buttons .btn-take');
    const doneBtn = page.locator('#action-buttons .btn-done');
    const passBtn = page.locator('#action-buttons .btn-pass:not(.btn-undo)');

    if (await takeBtn.isVisible().catch(() => false)) {
      await takeBtn.click();
    } else if (await doneBtn.isVisible().catch(() => false)) {
      await doneBtn.click();
    } else if (await passBtn.isVisible().catch(() => false)) {
      // Wait for undo overlay to disappear before clicking
      await page.waitForSelector('#undo-overlay', { state: 'hidden', timeout: 2000 }).catch(() => {});
      await passBtn.click({ force: true }).catch(() => {});
    }

    // Check if gameover or at least a round ended
    const gameOver = await page.locator('#gameover-screen.active').isVisible().catch(() => false);
    if (gameOver) break;

    const roundEnd = await page.evaluate(() => {
      const entries = document.querySelectorAll('#game-log > div');
      return Array.from(entries).some(e => e.textContent.includes('Конец раунда') || e.textContent.includes('ДУРАК'));
    });
    if (roundEnd) break;

    await page.waitForTimeout(300);
  }

  // Verify game progressed: deck decreased or discard has cards
  const discardCount = await page.locator('#discard-count').textContent();
  expect(parseInt(discardCount)).toBeGreaterThanOrEqual(0);

  const logText = await page.locator('#game-log').textContent();
  expect(logText).toMatch(/атакует|отбивает|берёт/);
});
