// Хранилище стенда. В прототипе «сервер» живёт в браузере: данные — в IndexedDB В ЗАШИФРОВАННОМ виде (vault.ts),
// изменения мгновенно расходятся по всем вкладкам (пациент в одной, врач в другой) через BroadcastChannel —
// в памяти, без расшифровки с диска. Слой api.ts — единственная точка записи, его можно заменить HTTP-клиентом сервера.
import { useSyncExternalStore } from 'react';
import type { DB } from '../core/types';
import { SCHEMA } from './seed';
import { hasIndexedDB, initVault, isSealed, readData, seal, setVaultNote, unseal, vaultState, writeData } from './vault';

const KEY = 'kompas.db.v1';
const TAB = Math.random().toString(36).slice(2);
const listeners = new Set<() => void>();
let cache: DB | null = null;
let memoryFallback: string | null = null;
let channel: BroadcastChannel | null = null;

export interface StorageInfo {
  storedChars: number;
  plainChars: number;
  sealed: boolean;
  sample: string;
  savedAt: number | null;
  where: 'IndexedDB' | 'localStorage' | 'память';
  error: string | null;
}
let info: StorageInfo = { storedChars: 0, plainChars: 0, sealed: false, sample: '', savedAt: null, where: 'память', error: null };
export const storageInfo = () => info;

/** Сообщение интерфейсу: данные не удалось сохранить (переполнено хранилище, запрет браузера) */
export const PERSIST_ERROR_EVENT = 'kompas:persist-error';

// Где лежат зашифрованные данные: IndexedDB (сотни МБ — фото и голосовые помещаются), запасной путь — localStorage
// (около 5 МБ), в крайнем случае — только память вкладки.
async function readRaw(): Promise<string | null> {
  if (hasIndexedDB()) {
    try {
      const v = await readData(KEY);
      if (v) return v;
    } catch {
      /* IndexedDB недоступна — пробуем localStorage */
    }
  }
  try {
    return localStorage.getItem(KEY) ?? memoryFallback;
  } catch {
    return memoryFallback;
  }
}

async function writeRaw(s: string): Promise<StorageInfo['where']> {
  memoryFallback = s;
  if (hasIndexedDB()) {
    try {
      await writeData(KEY, s);
      try {
        localStorage.removeItem(KEY); // старая копия из прежних версий стенда больше не нужна
      } catch {
        /* нет доступа к localStorage — не страшно */
      }
      return 'IndexedDB';
    } catch {
      /* переполнение или запрет — пробуем localStorage */
    }
  }
  try {
    localStorage.setItem(KEY, s);
    return 'localStorage';
  } catch {
    return 'память';
  }
}

// Запись на диск: шифрование асинхронное, поэтому записи выстраиваются в очередь и пишется самая свежая версия
let pending: DB | null = null;
let writing: Promise<void> | null = null;

function persist(db: DB) {
  pending = db;
  if (!writing) writing = flush();
}

async function flush() {
  try {
    while (pending) {
      const snap = pending;
      pending = null;
      const plain = JSON.stringify(snap);
      const stored = await seal(plain);
      const where = await writeRaw(stored);
      const error = where === 'память' ? 'Браузер не дал сохранить данные (нет места или запрет хранилища): изменения пропадут после закрытия вкладки.' : null;
      if (error && !info.error) window.dispatchEvent(new CustomEvent(PERSIST_ERROR_EVENT, { detail: error }));
      info = { storedChars: stored.length, plainChars: plain.length, sealed: isSealed(stored), sample: stored.slice(0, 160), savedAt: Date.now(), where, error };
      emit();
    }
  } catch (e) {
    console.error('Не удалось сохранить стенд', e);
  } finally {
    writing = null;
  }
}

/** Дождаться, пока последние изменения записаны на диск (нужно перед ротацией ключа и в проверках) */
export async function flushed() {
  while (writing) await writing;
}

function emit() {
  for (const l of listeners) l();
}

export function setDB(db: DB, broadcast = true) {
  cache = db;
  if (typeof window !== 'undefined') persist(db);
  else memoryFallback = JSON.stringify(db);
  emit();
  if (broadcast) channel?.postMessage({ type: 'db', from: TAB, db });
}

export function getDB(): DB {
  if (!cache) throw new Error('Стенд не инициализирован');
  return cache;
}

/** Транзакция: применить изменение к актуальной версии (другие вкладки присылают свои изменения сразу), сохранить. */
export function mutate<T>(fn: (db: DB) => T): T {
  const draft = structuredClone(getDB());
  const res = fn(draft);
  draft.rev = (draft.rev ?? 0) + 1;
  trimLogs(draft);
  setDB(draft);
  return res;
}

function trimLogs(db: DB) {
  if (db.metrics.length > 600) db.metrics = db.metrics.slice(-600);
  if (db.audit.length > 1500) db.audit = db.audit.slice(-1500);
  if (db.notifications.length > 400) db.notifications = db.notifications.slice(-400);
}

/** Принять версию из другой вкладки: более новая ревизия; при равной — детерминированно, чтобы вкладки сошлись */
function accept(next: DB, from: string) {
  if (next.schema !== SCHEMA) return;
  const cur = cache?.rev ?? 0;
  const rev = next.rev ?? 0;
  if (rev > cur || (rev === cur && from > TAB)) {
    cache = next;
    emit();
  }
}

async function readStored(): Promise<DB | null | 'locked'> {
  const raw = await readRaw();
  if (!raw) return null;
  const plain = await unseal(raw);
  if (plain === null) return 'locked';
  try {
    const db = JSON.parse(plain) as DB;
    return db.schema === SCHEMA ? db : null;
  } catch {
    return null;
  }
}

export async function initDB(seed: () => DB) {
  await initVault();
  const raw = await readRaw();
  const stored = await readStored();
  if (stored === 'locked') setVaultNote('Ключ шифрования не найден (данные браузера очищены) — стенд создан заново.');
  cache = stored && stored !== 'locked' ? stored : seed();
  // Новый стенд, старая незашифрованная запись, запись из localStorage прежних версий или новый ключ — переписать
  let legacy = false;
  try {
    legacy = Boolean(localStorage.getItem(KEY)) && hasIndexedDB();
  } catch {
    legacy = false;
  }
  if (!raw || stored !== cache || legacy || (vaultState().mode === 'encrypted' && !isSealed(raw))) persist(cache);
  else info = { storedChars: raw.length, plainChars: JSON.stringify(cache).length, sealed: isSealed(raw), sample: raw.slice(0, 160), savedAt: null, where: 'IndexedDB', error: null };
  try {
    channel = new BroadcastChannel('kompas');
    channel.onmessage = (e) => {
      if (e.data?.type === 'db' && e.data.db) accept(e.data.db as DB, String(e.data.from));
    };
  } catch {
    channel = null;
  }
  // Запасной путь синхронизации (браузер без BroadcastChannel): перечитать и расшифровать запись с диска
  window.addEventListener('storage', async (e) => {
    if (e.key !== KEY || channel) return;
    const next = await readStored();
    if (next && next !== 'locked' && (next.rev ?? 0) > (cache?.rev ?? 0)) {
      cache = next;
      emit();
    }
  });
}

/** Перешифровать текущие данные (после смены ключа) */
export async function resealNow() {
  if (cache) persist(cache);
  await flushed();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, getDB);
}

/** Текущее время стенда (с учётом перемотки симулятора) */
export function standNow(db: DB = getDB()): Date {
  return new Date(Date.now() + (db.settings.timeOffsetMs || 0));
}
