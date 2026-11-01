(function (root) {
  'use strict';
  let connection;
  function open() {
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('xre-updater', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return connection;
  }
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', mode), request = operation(tx.objectStore('state'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error('업데이트 정보를 저장하지 못했습니다.'));
    });
  }
  root.XREUpdateStore = {
    get: key => transaction('readonly', s => s.get(key)),
    set: (key, value) => transaction('readwrite', s => s.put(value, key)),
    delete: key => transaction('readwrite', s => s.delete(key))
  };
  root.XREUpdateCache = {
    get: async key => (await chrome.storage.local.get(key))[key],
    set: (key, value) => chrome.storage.local.set({[key]: value})
  };
})(globalThis);
