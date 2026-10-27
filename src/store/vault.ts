// Шифрование хранилища стенда: AES-GCM 256 (Web Crypto), перед шифрованием — сжатие gzip.
// Ключ создаётся в браузере как НЕИЗВЛЕКАЕМЫЙ (его нельзя прочитать даже скриптом страницы) и хранится в IndexedDB.
// На диске (localStorage) лежит только шифротекст: медицинские данные, документы и голосовые не читаются как текст.
// Честная граница прототипа: ключ живёт в том же браузере — это защищает файл хранилища, но не браузер целиком.
// В пилоте данные хранятся на сервере в РФ с шифрованием, ключи — вне приложения.

export interface VaultState {
  mode: 'encrypted' | 'plain';
  reason?: string; // почему без шифрования (браузер без Web Crypto / IndexedDB)
  alg: string;
  compressed: boolean;
  keyCreatedAt: string | null;
  note?: string; // события: ключ не найден, данные пересозданы
}

const IDB_NAME = 'kompas-vault';
const IDB_STORE = 'keys';
const DATA_STORE = 'data'; // зашифрованные данные стенда (в IndexedDB помещаются сотни МБ, в localStorage — около 5 МБ)
const KEY_ID = 'db-key';
const ALG = 'AES-GCM 256';

let key: CryptoKey | null = null;
let state: VaultState = { mode: 'plain', reason: 'хранилище ещё не открыто', alg: ALG, compressed: false, keyCreatedAt: null };

export const vaultState = () => state;
export function setVaultNote(note: string) {
  state = { ...state, note };
}

const hasCompression = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE);
      if (!d.objectStoreNames.contains(DATA_STORE)) d.createObjectStore(DATA_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('хранилище занято другой вкладкой со старой версией — перезагрузите вкладки'));
  });
}

function idbReq<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest, store = IDB_STORE): Promise<T> {
  return idb().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const r = op(tx.objectStore(store));
        r.onsuccess = () => resolve(r.result as T);
        r.onerror = () => reject(r.error);
        tx.oncomplete = () => d.close();
        tx.onabort = () => {
          d.close();
          reject(tx.error ?? new Error('запись прервана'));
        };
      }),
  );
}

/** Есть ли IndexedDB в этом окне (в Node-тестах и некоторых встроенных окнах — нет) */
export const hasIndexedDB = () => typeof indexedDB !== 'undefined';

export function readData(id: string): Promise<string | undefined> {
  return idbReq<string | undefined>('readonly', (s) => s.get(id), DATA_STORE);
}

export async function writeData(id: string, value: string): Promise<void> {
  await idbReq('readwrite', (s) => s.put(value, id), DATA_STORE);
}

async function newKey(): Promise<{ key: CryptoKey; createdAt: string }> {
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const rec = { key: k, createdAt: new Date().toISOString() };
  await idbReq('readwrite', (s) => s.put(rec, KEY_ID));
  return rec;
}

/** Открыть хранилище ключей. Без Web Crypto или IndexedDB стенд работает без шифрования — и честно об этом говорит. */
export async function initVault(): Promise<VaultState> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    state = { ...state, mode: 'plain', reason: 'браузер не поддерживает Web Crypto (нужен https или localhost)' };
    return state;
  }
  if (typeof indexedDB === 'undefined') {
    state = { ...state, mode: 'plain', reason: 'в этом окне недоступно хранилище ключей (IndexedDB)' };
    return state;
  }
  try {
    let rec = await idbReq<{ key: CryptoKey; createdAt: string } | undefined>('readonly', (s) => s.get(KEY_ID));
    if (!rec?.key) rec = await newKey();
    key = rec.key;
    state = { mode: 'encrypted', alg: ALG, compressed: hasCompression(), keyCreatedAt: rec.createdAt };
  } catch (e) {
    key = null;
    state = { ...state, mode: 'plain', reason: `хранилище ключей недоступно: ${(e as Error).message}` };
  }
  return state;
}

/** Только для автотестов (в Node нет IndexedDB): подставить ключ напрямую */
export function setKeyForTests(k: CryptoKey | null) {
  key = k;
  state = k ? { mode: 'encrypted', alg: ALG, compressed: hasCompression(), keyCreatedAt: new Date().toISOString() } : { ...state, mode: 'plain' };
}

/** Новый ключ: старые шифротексты больше не расшифровать, поэтому текущие данные сразу перешифровываются */
export async function rotateKey(): Promise<VaultState> {
  if (state.mode !== 'encrypted') return state;
  const rec = await newKey();
  key = rec.key;
  state = { ...state, keyCreatedAt: rec.createdAt, note: undefined };
  return state;
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

interface Sealed {
  v: 1;
  alg: 'AES-GCM-256';
  z: 'gzip' | 'none';
  iv: string;
  ct: string;
}

export function isSealed(stored: string): boolean {
  return stored.startsWith('{"v":1,"alg":"AES-GCM-256"');
}

/** Зашифровать строку для записи на диск. Без ключа — как есть. */
export async function seal(plain: string): Promise<string> {
  if (!key) return plain;
  let bytes: Uint8Array = new TextEncoder().encode(plain);
  const z = hasCompression() ? 'gzip' : 'none';
  if (z === 'gzip') bytes = await pipe(bytes, new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const sealed: Sealed = { v: 1, alg: 'AES-GCM-256', z, iv: toB64(iv), ct: toB64(ct) };
  return JSON.stringify(sealed);
}

/** Расшифровать запись с диска. Незашифрованная (старая) запись возвращается как есть; чужой ключ — null. */
export async function unseal(stored: string): Promise<string | null> {
  if (!isSealed(stored)) return stored;
  if (!key) return null;
  try {
    const s = JSON.parse(stored) as Sealed;
    let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(s.iv) }, key, fromB64(s.ct)));
    if (s.z === 'gzip') bytes = await pipe(bytes, new DecompressionStream('gzip'));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
