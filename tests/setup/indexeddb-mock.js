// In-Memory IndexedDB Mock for Storage & Database Tests

export function createMockIndexedDB() {
    const databases = new Map();

    const mockIDBFactory = {
        open(dbName, version = 1) {
            const req = {
                result: null,
                error: null,
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null
            };

            setTimeout(() => {
                if (!databases.has(dbName)) {
                    const stores = new Map();
                    const dbInstance = {
                        name: dbName,
                        version,
                        objectStoreNames: {
                            contains: (s) => stores.has(s)
                        },
                        createObjectStore(storeName, opts) {
                            const storeData = new Map();
                            stores.set(storeName, storeData);
                            return {
                                name: storeName,
                                createIndex: () => {}
                            };
                        },
                        transaction(storeNames, mode) {
                            const tx = {
                                oncomplete: null,
                                onerror: null,
                                objectStore(sName) {
                                    const actualStoreName = Array.isArray(sName) ? sName[0] : sName;
                                    if (!stores.has(actualStoreName)) {
                                        stores.set(actualStoreName, new Map());
                                    }
                                    const store = stores.get(actualStoreName);
                                    return {
                                        get(key) {
                                            const getReq = { result: undefined, onsuccess: null, onerror: null };
                                            setTimeout(() => {
                                                getReq.result = store.get(key);
                                                if (getReq.onsuccess) getReq.onsuccess({ target: getReq });
                                            }, 0);
                                            return getReq;
                                        },
                                        put(val, key) {
                                            const putReq = { result: key, onsuccess: null, onerror: null };
                                            const actualKey = key !== undefined ? key : (val?.id || val?.name || val?.family || Date.now());
                                            store.set(actualKey, val);
                                            setTimeout(() => {
                                                if (putReq.onsuccess) putReq.onsuccess({ target: putReq });
                                                if (tx.oncomplete) tx.oncomplete();
                                            }, 0);
                                            return putReq;
                                        },
                                        delete(key) {
                                            const delReq = { onsuccess: null, onerror: null };
                                            store.delete(key);
                                            setTimeout(() => {
                                                if (delReq.onsuccess) delReq.onsuccess({ target: delReq });
                                            }, 0);
                                            return delReq;
                                        },
                                        clear() {
                                            const clrReq = { onsuccess: null, onerror: null };
                                            store.clear();
                                            setTimeout(() => {
                                                if (clrReq.onsuccess) clrReq.onsuccess({ target: clrReq });
                                            }, 0);
                                            return clrReq;
                                        },
                                        getAll() {
                                            const allReq = { result: [], onsuccess: null, onerror: null };
                                            setTimeout(() => {
                                                allReq.result = Array.from(store.values());
                                                if (allReq.onsuccess) allReq.onsuccess({ target: allReq });
                                            }, 0);
                                            return allReq;
                                        }
                                    };
                                }
                            };
                            return tx;
                        },
                        close() {}
                    };
                    databases.set(dbName, dbInstance);

                    req.result = dbInstance;
                    if (req.onupgradeneeded) {
                        req.onupgradeneeded({ target: req, oldVersion: 0, newVersion: version });
                    }
                } else {
                    req.result = databases.get(dbName);
                }

                if (req.onsuccess) {
                    req.onsuccess({ target: req });
                }
            }, 0);

            return req;
        },

        deleteDatabase(dbName) {
            databases.delete(dbName);
            const req = { onsuccess: null, onerror: null };
            setTimeout(() => { if (req.onsuccess) req.onsuccess({}); }, 0);
            return req;
        }
    };

    if (typeof globalThis.indexedDB === 'undefined') {
        globalThis.indexedDB = mockIDBFactory;
    }

    return { databases, mockIDBFactory };
}

createMockIndexedDB();
