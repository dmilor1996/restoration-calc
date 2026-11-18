// Хранение: localStorage всегда + Firebase (Firestore) после настройки firebase-config.js.

import { firebaseConfig } from './firebase-config.js';
import { normalizeSettings, normalizeDraft } from './defaults.js';

const LS_SETTINGS = 'rc.settings.v1';
const LS_DRAFT = 'rc.draft.v1';
const LS_ORDERS = 'rc.orders.v1';
const LS_RECENT = 'rc.recent.v1';
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
export const loadOrders = () => { const list = read(LS_ORDERS); return Array.isArray(list) ? list : []; };
export const saveOrders = (list) => write(LS_ORDERS, list);
// Последние расчёты хранятся только в этом браузере и в облако не уходят.
export const loadRecent = () => { const list = read(LS_RECENT); return Array.isArray(list) ? list : []; };
export const saveRecent = (list) => write(LS_RECENT, list);

export function loadTheme() {
  try { return localStorage.getItem(LS_THEME) || 'auto'; } catch { return 'auto'; }
}
export function saveTheme(t) {
  try { localStorage.setItem(LS_THEME, t); } catch { /* noop */ }
}

// ── Облако ──────────────────────────────────────────────────────

export const cloudConfigured = Boolean(firebaseConfig && firebaseConfig.apiKey);

let fb = null;

/**
 * Подключение к Firebase. handlers:
 *   onStatus({ status: 'signedOut' | 'syncing' | 'synced' | 'error', user, error })
 *   onRemote(settings | null) — пришли настройки из облака (null — в облаке пусто)
 *   onRemoteOrders(list) — пришли сохранённые расчёты из облака
 */
export async function initCloud(handlers) {
  if (!cloudConfigured) return;
  try {
    // Локальная копия Firebase SDK (js/vendor/firebase.js): работает без CDN и без интернета.
    const m = await import('./vendor/firebase.js');
    const app = m.initializeApp(firebaseConfig);
    // Офлайн-кэш Firestore: правки, сделанные без сети, уйдут в облако при появлении связи.
    let db;
    try {
      db = m.initializeFirestore(app, { localCache: m.persistentLocalCache({ tabManager: m.persistentMultipleTabManager() }) });
    } catch {
      db = m.initializeFirestore(app, {});
    }
    const authM = m, fsM = m;
    fb = { authM, fsM, auth: m.getAuth(app), db, user: null, unsub: null, unsubOrders: null };

    authM.onAuthStateChanged(fb.auth, (user) => {
      fb.unsub?.();
      fb.unsubOrders?.();
      fb.unsub = fb.unsubOrders = null;
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
      fb.unsubOrders = fsM.onSnapshot(
        fsM.collection(fb.db, 'users', user.uid, 'orders'),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          handlers.onRemoteOrders?.(snap.docs.map((d) => d.data()));
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

/** Сохранённый расчёт: отдельный документ users/{uid}/orders/{id}. Удаление — пометкой deleted. */
export async function pushOrder(order) {
  if (!fb?.user) return;
  const clean = JSON.parse(JSON.stringify(order));
  await fb.fsM.setDoc(fb.fsM.doc(fb.db, 'users', fb.user.uid, 'orders', clean.id), clean);
}

// В Android-приложении (Capacitor) Google не пускает во встроенное окно браузера,
// поэтому вход идёт через системный диалог Google (плагин FirebaseAuthentication),
// а полученный токен передаётся в Firebase JS SDK.
const nativePlugin = () => {
  const cap = globalThis.Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins?.FirebaseAuthentication : null;
};

export async function signIn() {
  if (!fb) return;
  const native = nativePlugin();
  if (native) {
    const res = await native.signInWithGoogle({ skipNativeAuth: true });
    const cred = fb.authM.GoogleAuthProvider.credential(res.credential?.idToken, res.credential?.accessToken);
    await fb.authM.signInWithCredential(fb.auth, cred);
    return;
  }
  await fb.authM.signInWithPopup(fb.auth, new fb.authM.GoogleAuthProvider());
}

export async function signOutCloud() {
  if (!fb) return;
  await fb.authM.signOut(fb.auth);
  try { await nativePlugin()?.signOut(); } catch { /* noop */ }
}
