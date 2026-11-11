// Хранение: localStorage всегда + Firebase (Firestore) после настройки firebase-config.js.

import { firebaseConfig } from './firebase-config.js';
import { normalizeSettings, normalizeDraft } from './defaults.js';

const LS_SETTINGS = 'rc.settings.v1';
const LS_DRAFT = 'rc.draft.v1';
const LS_THEME = 'rc.theme';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим и т.п. */ }
}

export const loadSettings = () => normalizeSettings(read(LS_SETTINGS));
export const saveSettings = (s) => write(LS_SETTINGS, s);
export const loadDraft = (settings) => normalizeDraft(read(LS_DRAFT), settings);
export const saveDraft = (d) => write(LS_DRAFT, d);

export function loadTheme() {
  try { return localStorage.getItem(LS_THEME) || 'auto'; } catch { return 'auto'; }
}
export function saveTheme(t) {
  try { localStorage.setItem(LS_THEME, t); } catch { /* noop */ }
}

// ── Облако ──────────────────────────────────────────────────────

export const cloudConfigured = Boolean(firebaseConfig && firebaseConfig.apiKey);

const FB = 'https://www.gstatic.com/firebasejs/10.14.1';
let fb = null;

/**
 * Подключение к Firebase. handlers:
 *   onStatus({ status: 'signedOut' | 'syncing' | 'synced' | 'error', user, error })
 *   onRemote(settings | null) — пришли настройки из облака (null — в облаке пусто)
 */
export async function initCloud(handlers) {
  if (!cloudConfigured) return;
  try {
    const [appM, authM, fsM] = await Promise.all([
      import(`${FB}/firebase-app.js`),
      import(`${FB}/firebase-auth.js`),
      import(`${FB}/firebase-firestore.js`),
    ]);
    const app = appM.initializeApp(firebaseConfig);
    fb = { authM, fsM, auth: authM.getAuth(app), db: fsM.getFirestore(app), user: null, unsub: null };

    authM.onAuthStateChanged(fb.auth, (user) => {
      fb.unsub?.();
      fb.unsub = null;
      fb.user = user;
      if (!user) { handlers.onStatus({ status: 'signedOut', user: null }); return; }
      const info = { name: user.displayName, email: user.email };
      handlers.onStatus({ status: 'syncing', user: info });
      fb.unsub = fsM.onSnapshot(
        fsM.doc(fb.db, 'users', user.uid),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          handlers.onRemote(snap.exists() ? snap.data().settings : null);
          handlers.onStatus({ status: 'synced', user: info });
        },
        (err) => handlers.onStatus({ status: 'error', user: info, error: err.message }),
      );
    });
  } catch (err) {
    handlers.onStatus({ status: 'error', user: null, error: String(err?.message || err) });
  }
}

export async function pushSettings(settings) {
  if (!fb?.user) return;
  const clean = JSON.parse(JSON.stringify(settings));
  await fb.fsM.setDoc(fb.fsM.doc(fb.db, 'users', fb.user.uid), { settings: clean, updatedAt: clean.updatedAt || 0 });
}

export async function signIn() {
  if (!fb) return;
  await fb.authM.signInWithPopup(fb.auth, new fb.authM.GoogleAuthProvider());
}

export async function signOutCloud() {
  if (!fb) return;
  await fb.authM.signOut(fb.auth);
}
