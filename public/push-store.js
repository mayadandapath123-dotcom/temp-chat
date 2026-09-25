/* Local subscription permission records only; no chat bodies or tokens. */
self.TempChatPushStore = (() => {
  let opening;
  function db() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const r = indexedDB.open('tempchat-push-permissions', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('bindings', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    }).catch(e => { opening = null; throw e; });
    return opening;
  }
  async function operation(mode, work) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('bindings', mode); let value;
      const request = work(tx.objectStore('bindings'));
      if (request) request.onsuccess = () => value = request.result;
      tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  return { all: () => operation('readonly', s => s.getAll()), put: r => operation('readwrite', s => s.put(r)), remove: id => operation('readwrite', s => s.delete(id)), clear: () => operation('readwrite', s => s.clear()) };
})();
