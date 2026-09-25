const KEY = 'ejuice-lab-v3-journal';
const STORE = 'library';
let database;

function readRecord(key) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE);
    const request = tx.objectStore(STORE).get(key);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || new Error('Kunne ikke læse lokale data.'));
    tx.onabort = () => reject(tx.error || new Error('Læsning af lokale data blev afbrudt.'));
  });
}

function writeRecord(key, value) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Kunne ikke gemme lokale data.'));
    tx.onabort = () => reject(tx.error || new Error('Gemning af lokale data blev afbrudt.'));
  });
}

function getJournal() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function removeJournal(expected) {
  if (expected === null) return;
  try {
    // A newer save may have replaced the journal while IndexedDB was writing.
    if (localStorage.getItem(KEY) === expected) localStorage.removeItem(KEY);
  } catch {
    // IndexedDB has already committed; journal cleanup is only best effort.
  }
}

function readJournal() {
  const json = getJournal();
  if (json === null) return null;
  try {
    const value = JSON.parse(json);
    if (value?.format !== 'ejuice-lab' || value.version !== 3 ||
        !Array.isArray(value.ingredients) || !Array.isArray(value.recipes) ||
        !value.ingredients.every(item => item && typeof item.id === 'string' && typeof item.name === 'string') ||
        !value.recipes.every(item => item && typeof item.id === 'string' &&
          item.draft && Array.isArray(item.draft.rows)) ||
        (value.developmentSessions !== undefined &&
          (!Array.isArray(value.developmentSessions) ||
            !value.developmentSessions.every(item => item && Array.isArray(item.events) &&
              Array.isArray(item.ingredientSnapshots) && Array.isArray(item.initial))))) {
      throw new Error('Ugyldig lokal journal.');
    }
    return value;
  } catch {
    removeJournal(json);
    return null;
  }
}

export async function open() {
  database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('ejuice-lab-v3', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const stored = await readRecord('current');
  return readJournal() ?? stored;
}

export async function save(value) {
  const json = JSON.stringify(value);
  const snapshot = JSON.parse(json);
  let journalToRemove;
  try {
    localStorage.setItem(KEY, json);
    journalToRemove = json;
  } catch {
    // A quota or disabled localStorage must not prevent the IndexedDB save.
    // Remember any older journal so it cannot shadow this committed version.
    journalToRemove = getJournal();
  }
  await writeRecord('current', snapshot);
  removeJournal(journalToRemove);
}

export async function saveBackup(value) {
  await writeRecord('pre-import', JSON.parse(JSON.stringify(value)));
}

export async function loadBackup() {
  return (await readRecord('pre-import')) ?? null;
}
