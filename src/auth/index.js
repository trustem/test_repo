// ═══════════════════════════════════════════════════════════════
//  БАРДАК — Auth module (Firebase Anonymous Auth + Firestore backup)
// ═══════════════════════════════════════════════════════════════

import { getApps, initializeApp, getApp } from 'firebase/app';
import {
  getAuth, initializeAuth, browserLocalPersistence, signInAnonymously,
  GoogleAuthProvider, linkWithPopup, signInWithPopup,
  linkWithRedirect, signInWithRedirect, getRedirectResult,
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  collection, addDoc, getDocs, query, orderBy, limit, increment,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const LOCAL_UID_KEY    = 'bardak_local_uid';
const FIREBASE_UID_KEY = 'bardak_firebase_uid';
const NAME_KEY         = 'bardak_player_name';
const PHOTO_KEY        = 'bardak_photo_url';

// ─── Points system ────────────────────────────────────────────
// Non-losers: points = 14 − score_index (score 0=6card → 14pts, score 8=Ace → 6pts)
// Losers: shame rank → fixed points below non-loser range
export const SCORE_POINTS = [14, 13, 12, 11, 10, 9, 8, 7, 6]; // index = score value (0..8)
export const SHAME_RANK_POINTS = {
  'Проебал':           5,
  'Суперпроебал':      4,
  'Супермегапроебал':  3,
  'Суперотсосал':      2,
  'Супермегаотсосал':  1,
  'Королевский отсос': 0,
};
// All known ranks that get shame badge lasting 30 days
export const SHAME_BADGE_RANKS = new Set(['Королевский отсос']);

// ─── Helpers ──────────────────────────────────────────────────
function getOrCreateLocalUid() {
  let uid = localStorage.getItem(LOCAL_UID_KEY);
  if (!uid) {
    uid = 'lu_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(LOCAL_UID_KEY, uid);
  }
  return uid;
}

function ensureApp() {
  if (!getApps().length) return initializeApp(firebaseConfig);
  return getApp();
}

// Returns Auth instance, using localStorage persistence (reliable in WKWebView/Capacitor).
// IndexedDB (Firebase's default) can hang indefinitely in iOS WKWebView.
function ensureAuth(app) {
  try {
    return initializeAuth(app, { persistence: browserLocalPersistence });
  } catch {
    return getAuth(app);
  }
}

// ─── Main: init auth ──────────────────────────────────────────
export async function initAuth() {
  const localUid = getOrCreateLocalUid();
  try {
    const app = ensureApp();
    const auth = ensureAuth(app);

    // Handle redirect result after mobile Google sign-in.
    // On Capacitor native, getRedirectResult can hang indefinitely — skip it.
    const redirectResult = isCapacitorNative()
      ? null
      : await Promise.race([
          getRedirectResult(auth).catch(() => null),
          new Promise(resolve => setTimeout(() => resolve(null), 5000)),
        ]);
    if (redirectResult?.user) {
      const user = redirectResult.user;
      const firebaseUid = user.uid;
      localStorage.setItem(FIREBASE_UID_KEY, firebaseUid);

      const db      = getFirestore(app);
      const userRef = doc(db, 'users', firebaseUid);
      const snap    = await getDoc(userRef);

      let name     = localStorage.getItem(NAME_KEY)  || '';
      let photoURL = localStorage.getItem(PHOTO_KEY) || null;

      if (snap.exists()) {
        const data = snap.data();
        name     = data.name     || name;
        photoURL = data.photoURL || photoURL;
        await updateDoc(userRef, { lastSeen: Date.now() });
      } else {
        name     = name     || user.displayName || '';
        photoURL = photoURL || user.photoURL    || null;
        await setDoc(userRef, {
          localUid, name, photoURL: photoURL || null,
          totalRating: 0, gamesPlayed: 0, wins: 0,
          lastSeen: Date.now(), createdAt: Date.now(),
        });
      }

      if (name)     localStorage.setItem(NAME_KEY,  name);
      if (photoURL) localStorage.setItem(PHOTO_KEY, photoURL);
      return { firebaseUid, name, photoURL };
    }

    // Reuse existing session (e.g. Google sign-in persisted across page loads)
    // Only create new anonymous user if no session exists
    let user = auth.currentUser;
    if (!user) {
      const result = await signInAnonymously(auth);
      user = result.user;
    }

    const firebaseUid = user.uid;
    localStorage.setItem(FIREBASE_UID_KEY, firebaseUid);

    const db = getFirestore(app);
    const userRef  = doc(db, 'users', firebaseUid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      const name     = data.name     || localStorage.getItem(NAME_KEY)  || '';
      const photoURL = data.photoURL || localStorage.getItem(PHOTO_KEY) || null;
      localStorage.setItem(NAME_KEY, name);
      if (photoURL) localStorage.setItem(PHOTO_KEY, photoURL);
      updateDoc(userRef, { lastSeen: Date.now() }).catch(() => {});
      return { firebaseUid, name, photoURL };
    }

    let name     = localStorage.getItem(NAME_KEY)  || '';
    let photoURL = localStorage.getItem(PHOTO_KEY) || null;
    const localRef  = doc(db, 'usersByLocalUid', localUid);
    const localSnap = await getDoc(localRef);
    if (localSnap.exists()) {
      const old = localSnap.data();
      name     = old.name     || name;
      photoURL = old.photoURL || photoURL;
    }

    await setDoc(userRef, {
      localUid, name, photoURL: photoURL || null,
      totalRating: 0, gamesPlayed: 0, wins: 0,
      lastSeen: Date.now(), createdAt: Date.now(),
    });
    await setDoc(localRef, { firebaseUid, name, photoURL: photoURL || null, updatedAt: Date.now() });

    localStorage.setItem(NAME_KEY, name);
    if (photoURL) localStorage.setItem(PHOTO_KEY, photoURL);
    return { firebaseUid, name, photoURL };
  } catch (e) {
    console.warn('[auth] Firebase unavailable:', e.message);
    return {
      firebaseUid: localStorage.getItem(FIREBASE_UID_KEY) || null,
      name:        localStorage.getItem(NAME_KEY)         || '',
      photoURL:    localStorage.getItem(PHOTO_KEY)        || null,
    };
  }
}

// ─── Save name / photoURL ─────────────────────────────────────
export async function saveUserName(firebaseUid, name, photoURL) {
  localStorage.setItem(NAME_KEY, name);
  if (photoURL !== undefined) {
    if (photoURL) localStorage.setItem(PHOTO_KEY, photoURL);
    else localStorage.removeItem(PHOTO_KEY);
  }
  if (!firebaseUid) return;

  const localUid = getOrCreateLocalUid();
  const update = { name, lastSeen: Date.now() };
  if (photoURL !== undefined) update.photoURL = photoURL || null;

  try {
    const db = getFirestore(ensureApp());
    await updateDoc(doc(db, 'users', firebaseUid), update);
    await updateDoc(doc(db, 'usersByLocalUid', localUid), {
      name,
      ...(photoURL !== undefined ? { photoURL: photoURL || null } : {}),
      updatedAt: Date.now(),
    }).catch(() => {});
  } catch (e) {
    console.warn('[auth] saveUserName error:', e.message);
  }
}

// ─── Save game result to stats ────────────────────────────────
// rank:        card label ('6'..'A') for non-losers, or shame rank string for loser
// points:      computed by caller using SCORE_POINTS / SHAME_RANK_POINTS
// isWin:       true only for first-place finish
// playerCount: total players in the game
export async function saveGameStats(firebaseUid, { playerCount, rank, points, isWin }) {
  if (!firebaseUid) return;
  try {
    const db = getFirestore(ensureApp());

    // Write individual game record (for chart)
    await addDoc(collection(db, 'users', firebaseUid, 'games'), {
      playedAt: Date.now(),
      playerCount,
      rank,
      points,
      isWin,
    });

    // Update aggregated totals
    const upd = {
      totalRating: increment(points),
      gamesPlayed: increment(1),
      wins:        increment(isWin ? 1 : 0),
      lastGameAt:  Date.now(),
      [`statsByCount.${playerCount}.games`]:       increment(1),
      [`statsByCount.${playerCount}.wins`]:        increment(isWin ? 1 : 0),
      [`statsByCount.${playerCount}.totalPoints`]: increment(points),
    };

    if (SHAME_BADGE_RANKS.has(rank)) {
      upd.shameStatus = { rank, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    }

    await updateDoc(doc(db, 'users', firebaseUid), upd);
  } catch (e) {
    console.warn('[auth] saveGameStats error:', e.message);
  }
}

// ─── Load game history (for chart, most recent N games) ───────
export async function loadGameHistory(firebaseUid, limitCount = 30) {
  if (!firebaseUid) return [];
  try {
    const db = getFirestore(ensureApp());
    const snap = await getDocs(query(
      collection(db, 'users', firebaseUid, 'games'),
      orderBy('playedAt', 'desc'),
      limit(limitCount),
    ));
    // Return in chronological order for the chart
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
  } catch (e) {
    console.warn('[auth] loadGameHistory error:', e.message);
    return [];
  }
}

// ─── Load leaderboard (top N by totalRating) ──────────────────
export async function loadLeaderboard(limitCount = 50) {
  try {
    const db = getFirestore(ensureApp());
    const snap = await getDocs(query(
      collection(db, 'users'),
      orderBy('totalRating', 'desc'),
      limit(limitCount),
    ));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[auth] loadLeaderboard error:', e.message);
    return [];
  }
}

// ─── Load single user profile ─────────────────────────────────
export async function loadUserProfile(firebaseUid) {
  if (!firebaseUid) return null;
  try {
    const db = getFirestore(ensureApp());
    const snap = await getDoc(doc(db, 'users', firebaseUid));
    return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.warn('[auth] loadUserProfile error:', e.message);
    return null;
  }
}

// ─── Upload avatar ────────────────────────────────────────────
export async function uploadAvatar(firebaseUid, file) {
  if (!firebaseUid) throw new Error('Нет UID пользователя');
  const storage = getStorage(ensureApp());
  const compressed = await compressImage(file, 256, 0.85);
  const storageRef = ref(storage, `avatars/${firebaseUid}`);
  await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(storageRef);
  await saveUserName(firebaseUid, localStorage.getItem(NAME_KEY) || '', url);
  return url;
}

// ─── Delete avatar ────────────────────────────────────────────
export async function deleteAvatar(firebaseUid) {
  if (!firebaseUid) return;
  try {
    await deleteObject(ref(getStorage(ensureApp()), `avatars/${firebaseUid}`));
  } catch { /* file may not exist */ }
  await saveUserName(firebaseUid, localStorage.getItem(NAME_KEY) || '', null);
}

// ─── Image compression ────────────────────────────────────────
function compressImage(file, size = 256, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const scale = Math.min(size / img.width, size / img.height, 1);
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ─── Google Auth ───────────────────────────────────────────────

// Capacitor native platform (iOS/Android app, not mobile browser)
function isCapacitorNative() {
  return !!(window.Capacitor?.isNativePlatform?.());
}

// Mobile browsers block popups — use redirect instead (but NOT Capacitor, which needs popup)
function isMobileBrowser() {
  return !isCapacitorNative() && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// Returns true if current user is linked to Google
export function isLinkedToGoogle() {
  try {
    const auth = ensureAuth(ensureApp());
    return auth.currentUser?.providerData?.some(p => p.providerId === 'google.com') ?? false;
  } catch { return false; }
}

// Returns Google email if linked, null otherwise
export function getGoogleEmail() {
  try {
    const auth = ensureAuth(ensureApp());
    return auth.currentUser?.providerData?.find(p => p.providerId === 'google.com')?.email ?? null;
  } catch { return null; }
}

// Link current anonymous account to Google (or sign in with Google if no session)
// Returns { firebaseUid, name, photoURL }
export async function linkGoogleAccount() {
  const app      = ensureApp();
  const auth     = ensureAuth(app);
  const provider = new GoogleAuthProvider();

  // Mobile browser (not Capacitor): popups are blocked — use redirect flow instead
  // Capacitor native falls through to popup code below (WKWebView supports popups)
  if (isMobileBrowser()) {
    if (auth.currentUser) {
      await linkWithRedirect(auth.currentUser, provider);
    } else {
      await signInWithRedirect(auth, provider);
    }
    // Page will reload — result handled in initAuth via getRedirectResult
    return null;
  }

  try {
    let user;

    if (auth.currentUser) {
      // Link existing anonymous session to Google — preserves UID and all stats
      const result = await linkWithPopup(auth.currentUser, provider);
      user = result.user;
    } else {
      // No session: sign in with Google directly
      const result = await signInWithPopup(auth, provider);
      user = result.user;
    }

    const firebaseUid = user.uid;
    localStorage.setItem(FIREBASE_UID_KEY, firebaseUid);

    // Use Google name/photo only as fallback if user hasn't set their own
    const existingName  = localStorage.getItem(NAME_KEY)  || '';
    const existingPhoto = localStorage.getItem(PHOTO_KEY) || null;
    const name     = existingName  || user.displayName || '';
    const photoURL = existingPhoto || user.photoURL    || null;

    // Ensure Firestore profile exists and is up to date
    const db      = getFirestore(app);
    const userRef = doc(db, 'users', firebaseUid);
    const snap    = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        localUid: getOrCreateLocalUid(),
        name, photoURL: photoURL || null,
        totalRating: 0, gamesPlayed: 0, wins: 0,
        lastSeen: Date.now(), createdAt: Date.now(),
      });
    } else {
      // Update lastSeen, sync name/photo if profile was empty
      const data = snap.data();
      await updateDoc(userRef, {
        lastSeen: Date.now(),
        ...(data.name     ? {} : { name }),
        ...(data.photoURL ? {} : { photoURL: photoURL || null }),
      });
    }

    if (name)     localStorage.setItem(NAME_KEY,  name);
    if (photoURL) localStorage.setItem(PHOTO_KEY, photoURL);

    return { firebaseUid, name, photoURL };

  } catch (e) {
    // User cancelled popup
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      return null;
    }
    // Google account already linked to another Firebase account (e.g. signed in from another device)
    // → sign in with Google directly to restore that existing account
    if (e.code === 'auth/credential-already-in-use') {
      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const firebaseUid = user.uid;
        localStorage.setItem(FIREBASE_UID_KEY, firebaseUid);

        const db      = getFirestore(app);
        const userRef = doc(db, 'users', firebaseUid);
        const snap    = await getDoc(userRef);

        let name     = localStorage.getItem(NAME_KEY)  || '';
        let photoURL = localStorage.getItem(PHOTO_KEY) || null;

        if (snap.exists()) {
          const data = snap.data();
          name     = data.name     || name;
          photoURL = data.photoURL || photoURL;
          await updateDoc(userRef, { lastSeen: Date.now() });
        } else {
          name     = name     || user.displayName || '';
          photoURL = photoURL || user.photoURL    || null;
          await setDoc(userRef, {
            localUid: getOrCreateLocalUid(),
            name, photoURL: photoURL || null,
            totalRating: 0, gamesPlayed: 0, wins: 0,
            lastSeen: Date.now(), createdAt: Date.now(),
          });
        }

        if (name)     localStorage.setItem(NAME_KEY,  name);
        if (photoURL) localStorage.setItem(PHOTO_KEY, photoURL);

        return { firebaseUid, name, photoURL };
      } catch (e2) {
        if (e2.code === 'auth/popup-closed-by-user' || e2.code === 'auth/cancelled-popup-request') {
          return null;
        }
        throw new Error('Ошибка входа через Google: ' + e2.message);
      }
    }
    // Browser blocked the popup — fall back to redirect
    if (e.code === 'auth/popup-blocked') {
      if (auth.currentUser) {
        await linkWithRedirect(auth.currentUser, provider);
      } else {
        await signInWithRedirect(auth, provider);
      }
      return null;
    }
    throw new Error('Ошибка входа через Google: ' + e.message);
  }
}
