import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDB} from './model.js';
import {open, save, saveBackup, loadBackup} from './storage.js';

const JOURNAL = 'ejuice-lab-v3-journal';
const originalGlobals = new Map(['indexedDB', 'localStorage'].map(name =>
  [name, Object.getOwnPropertyDescriptor(globalThis, name)]));

afterEach(() => {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function fakeIndexedDB(initial) {
  const records = new Map(initial ? [['current', initial]] : []);
  const idb = {records, failWrites: false};
  const database = {
    createObjectStore() {},
    transaction() {
      const tx = {error: null};
      tx.objectStore = () => ({
        get(key) {
          const request = {};
          queueMicrotask(() => {
            request.result = records.get(key);
            request.onsuccess?.();
            queueMicrotask(() => tx.oncomplete?.());
          });
          return request;
        },
        put(value, key) {
          queueMicrotask(() => {
            if (idb.failWrites) {
              tx.error = new Error('IndexedDB write failed');
              tx.onerror?.();
            } else {
              records.set(key, value);
              tx.oncomplete?.();
            }
          });
        }
      });
      return tx;
    }
  };
  idb.open = () => {
    const request = {result: database};
    queueMicrotask(() => {
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  };
  Object.defineProperty(globalThis, 'indexedDB', {configurable: true, value: idb});
  return idb;
}

function fakeLocalStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[JOURNAL, initial]]);
  const storage = {
    values,
    failSet: false,
    failRemove: false,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (this.failSet) throw new Error('QuotaExceededError');
      values.set(key, value);
    },
    removeItem(key) {
      if (this.failRemove) throw new Error('SecurityError');
      values.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: storage});
  return storage;
}

test('valid journal recovers the newest edits before IndexedDB commits', async () => {
  const stored = emptyDB();
  const pending = {...emptyDB(), sortBy: 'name'};
  fakeIndexedDB(stored);
  fakeLocalStorage(JSON.stringify(pending));
  assert.deepEqual(await open(), pending);
});

test('malformed journal falls back to IndexedDB and is discarded', async () => {
  for (const malformed of [
    '{broken',
    JSON.stringify({format: 'ejuice-lab', version: 3}),
    JSON.stringify({...emptyDB(), recipes: [null]}),
    JSON.stringify({...emptyDB(), recipes: [{id: 'x'}]}),
  ]) {
    const stored = emptyDB();
    fakeIndexedDB(stored);
    const local = fakeLocalStorage(malformed);
    assert.deepEqual(await open(), stored);
    assert.equal(local.getItem(JOURNAL), null);
  }
});

test('disabled localStorage does not blank the app or stop IndexedDB autosave', async () => {
  const stored = emptyDB();
  const idb = fakeIndexedDB(stored);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('SecurityError'); },
  });
  assert.deepEqual(await open(), stored);
  const updated = {...stored, sortBy: 'name'};
  await save(updated);
  assert.deepEqual(idb.records.get('current'), updated);
});

test('quota failure does not prevent saving and an old journal cannot shadow it', async () => {
  const stored = emptyDB();
  const stale = {...stored, sortBy: 'rating'};
  const updated = {...stored, sortBy: 'name'};
  const idb = fakeIndexedDB(stored);
  const local = fakeLocalStorage(JSON.stringify(stale));
  await open();
  local.failSet = true;
  await save(updated);
  assert.deepEqual(idb.records.get('current'), updated);
  assert.equal(local.getItem(JOURNAL), null);
  assert.deepEqual(await open(), updated);
});

test('journal cleanup errors do not turn a committed save into a failure', async () => {
  const idb = fakeIndexedDB();
  const local = fakeLocalStorage();
  await open();
  local.failRemove = true;
  const value = emptyDB();
  await save(value);
  assert.deepEqual(idb.records.get('current'), value);
  assert.equal(local.getItem(JOURNAL), JSON.stringify(value));
});

test('IndexedDB failure still rejects and leaves a recovery journal', async () => {
  const idb = fakeIndexedDB();
  const local = fakeLocalStorage();
  await open();
  idb.failWrites = true;
  const value = emptyDB();
  await assert.rejects(save(value), /IndexedDB write failed/);
  assert.equal(local.getItem(JOURNAL), JSON.stringify(value));
});

test('pre-import backup is separate from autosave and survives later changes', async () => {
  const idb = fakeIndexedDB();
  fakeLocalStorage();
  await open();
  assert.equal(await loadBackup(), null);
  const before = emptyDB();
  const after = {...before, sortBy: 'rating'};
  await saveBackup(before);
  await save(after);
  before.sortBy = 'name';
  assert.equal((await loadBackup()).sortBy, 'date');
  assert.deepEqual(idb.records.get('current'), after);
});
