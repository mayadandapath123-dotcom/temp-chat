/* Migration only: remove the old durable closed-page notification permissions. */
self.TempChatLegacyPush = {
  clear: () => new Promise(resolve => {
    try {
      const request = indexedDB.deleteDatabase('tempchat-push-permissions');
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false); // older tabs must be closed; no new code reads this database
    } catch (_) { resolve(false); }
  }),
};
