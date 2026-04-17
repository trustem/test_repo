/**
 * Multiplayer regression tests for Бардак (Переводной Дурак)
 *
 * Flow per test (N players):
 *   1. Open N independent browser contexts, each navigates to localhost
 *   2. Firebase anonymous auth completes → lobby visible
 *   3. Host creates a room
 *   4. Host sets maxPlayers = N (so no bot slots)
 *   5. Players 2..N join via the rooms list in the lobby
 *   6. Host clicks "Начать игру!"
 *   7. Assert all N contexts reach .game-screen with .human-hand visible
 *
 * Run: npx playwright test --config=playwright.mp.config.js
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:4173';

// How long to wait for Firebase anon auth + initial Firestore snapshot
const LOBBY_TIMEOUT = 35_000;
// How long a joining player waits for the room to appear in the lobby list
const ROOM_APPEAR_TIMEOUT = 25_000;
// How long all players wait for the game screen after host presses start
const GAME_SCREEN_TIMEOUT = 70_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Open a fresh browser context, load the app, wait for the lobby, set player name.
 * Returns { ctx, page }.
 */
async function openPlayer(browser, name) {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  // Capture console errors for debugging
  page.on('console', msg => {
    if (msg.type() === 'error') console.error(`[${name}] console.error:`, msg.text());
  });

  await page.goto(BASE_URL);
  // Wait for lobby screen AND Firebase anonymous auth to complete.
  // data-auth-ready is set on .app-root only after initAuth() resolves,
  // ensuring the Firebase UID is set before we try to create/join rooms.
  await page.waitForSelector('.lobby-screen', { timeout: LOBBY_TIMEOUT });
  await page.waitForSelector('[data-auth-ready]', { timeout: LOBBY_TIMEOUT });
  await page.fill('.lobby-text-input', name);
  return { ctx, page, name };
}

/**
 * Core multiplayer flow for playerCount human players.
 */
async function runMultiplayerGame(browser, playerCount) {
  const players = [];

  // Open all contexts up-front so every player is subscribed to Firestore before
  // the room is created — this reduces timing sensitivity.
  for (let i = 0; i < playerCount; i++) {
    const label = i === 0 ? `Хост${playerCount}` : `П${i}из${playerCount}`;
    players.push(await openPlayer(browser, label));
  }

  const host = players[0];

  // ── 1. Host creates room (default 4 seats) ────────────────────
  await host.page.click('.lobby-create-btn');
  await host.page.waitForSelector('.setup-screen', { timeout: 15_000 });

  // ── 2. Set maxPlayers = playerCount ───────────────────────────
  //    Only change if it's not already correct (default is 4).
  if (playerCount !== 4) {
    const countBtn = host.page
      .locator('.player-count-buttons .count-btn')
      .filter({ hasText: new RegExp(`^${playerCount}$`) });
    await countBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await countBtn.click();

    // Wait for Firestore to confirm the write (optimistic state syncs back)
    await host.page.waitForFunction(
      (n) => {
        const active = document.querySelector('.player-count-buttons .count-btn.active');
        return active && Number(active.textContent.trim()) === n;
      },
      playerCount,
      { timeout: 10_000 }
    );
  }

  // ── 3. Other players join sequentially ────────────────────────
  for (let i = 1; i < playerCount; i++) {
    const joiner = players[i];

    // Wait for at least one enabled join button to appear
    await joiner.page.waitForSelector('.room-join-btn:not([disabled])', {
      timeout: ROOM_APPEAR_TIMEOUT,
    });

    // Click the first available join button (there should only be one room)
    await joiner.page.locator('.room-join-btn:not([disabled])').first().click();

    // Joiner transitions to waiting screen
    await joiner.page.waitForSelector('.setup-screen', { timeout: 15_000 });

    // Brief pause so Firestore can sync the new seat before the next player joins
    await host.page.waitForTimeout(700);
  }

  // ── 4. Wait until host sees all playerCount real player rows ──
  await host.page.waitForFunction(
    (n) => {
      const realRows = document.querySelectorAll(
        '.waiting-player:not(.waiting-player-bot)'
      );
      return realRows.length >= n;
    },
    playerCount,
    { timeout: 20_000 }
  );

  // ── 5. Host starts game ───────────────────────────────────────
  const startBtn = host.page.getByRole('button', { name: 'Начать игру!' });
  await startBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(startBtn).not.toBeDisabled();
  await startBtn.click();

  // ── 6. All players must reach the game screen ─────────────────
  await Promise.all(
    players.map(({ page, name: pname }) =>
      page
        .waitForSelector('.game-screen', { timeout: GAME_SCREEN_TIMEOUT })
        .catch((e) => {
          throw new Error(`[${pname}] game screen did not appear: ${e.message}`);
        })
    )
  );

  // ── 7. Verify game is functional for every player ─────────────
  for (const { page, name: pname } of players) {
    // Game screen must be visible (not hidden behind a loading state)
    await expect(
      page.locator('.game-screen'),
      `[${pname}] .game-screen visible`
    ).toBeVisible();

    // Human hand zone must be rendered (cards or empty hand zone)
    await expect(
      page.locator('.human-hand'),
      `[${pname}] .human-hand visible`
    ).toBeVisible({ timeout: 15_000 });

    // The temporary loading spinner must NOT be showing
    await expect(
      page.locator('.loading-screen'),
      `[${pname}] no loading-screen`
    ).not.toBeVisible();
  }

  // ── Cleanup ───────────────────────────────────────────────────
  for (const { ctx } of players) {
    await ctx.close().catch(() => {});
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('мультиплеер: 2 игрока', async ({ browser }) => {
  test.setTimeout(150_000);
  await runMultiplayerGame(browser, 2);
});

test('мультиплеер: 3 игрока', async ({ browser }) => {
  test.setTimeout(180_000);
  await runMultiplayerGame(browser, 3);
});

test('мультиплеер: 4 игрока', async ({ browser }) => {
  test.setTimeout(210_000);
  await runMultiplayerGame(browser, 4);
});

test('мультиплеер: 5 игроков', async ({ browser }) => {
  test.setTimeout(240_000);
  await runMultiplayerGame(browser, 5);
});

test('мультиплеер: 6 игроков', async ({ browser }) => {
  test.setTimeout(270_000);
  await runMultiplayerGame(browser, 6);
});
