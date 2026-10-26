/**
 * Servicio de persistencia local (IndexedDB + File System Access API).
 * Incluye respaldo en memoria si el navegador restringe IndexedDB.
 */
(function (global) {
    'use strict';

    const StudioAI = (global.StudioAI = global.StudioAI || {});

    const DB_NAME = 'AIStudioVaultDB';
    const DB_VERSION = 2;
    const STORE_CREATIONS = 'creations';
    const STORE_SETTINGS = 'settings';

    let dbInstance = null;
    let directoryHandle = null;

    // Respaldo en memoria en caso de modo incógnito estricto o iframe restringido
    const memoryCreations = new Map();
    const memorySettings = new Map();

    function init() {
        return new Promise((resolve) => {
            if (!('indexedDB' in global)) {
                resolve(false);
                return;
            }

            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = function (event) {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_CREATIONS)) {
                        db.createObjectStore(STORE_CREATIONS, { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
                    }
                };

                request.onsuccess = function (event) {
                    dbInstance = event.target.result;
                    resolve(true);
                };

                request.onerror = function () {
                    console.warn('IndexedDB no disponible, usando almacenamiento en sesión.');
                    resolve(false);
                };
            } catch (err) {
                console.warn('Error al inicializar IndexedDB:', err);
                resolve(false);
            }
        });
    }

    function saveSetting(key, value) {
        memorySettings.set(key, value);
        return new Promise((resolve) => {
            if (!dbInstance || !dbInstance.objectStoreNames.contains(STORE_SETTINGS)) {
                resolve(false);
                return;
            }
            try {
                const tx = dbInstance.transaction(STORE_SETTINGS, 'readwrite');
                tx.objectStore(STORE_SETTINGS).put({ key, value });
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (err) {
                resolve(false);
            }
        });
    }

    function getSetting(key) {
        return new Promise((resolve) => {
            if (!dbInstance || !dbInstance.objectStoreNames.contains(STORE_SETTINGS)) {
                resolve(memorySettings.get(key) || null);
                return;
            }
            try {
                const tx = dbInstance.transaction(STORE_SETTINGS, 'readonly');
                const req = tx.objectStore(STORE_SETTINGS).get(key);
                req.onsuccess = () => {
                    resolve(req.result ? req.result.value : memorySettings.get(key) || null);
                };
                req.onerror = () => resolve(memorySettings.get(key) || null);
            } catch (err) {
                resolve(memorySettings.get(key) || null);
            }
        });
    }

    function getFileExtensionFromDataUrl(dataUrl, fallbackType) {
        if (typeof dataUrl === 'string') {
            if (dataUrl.startsWith('data:video/webm')) return 'webm';
            if (dataUrl.startsWith('data:video/mp4')) return 'mp4';
            if (dataUrl.startsWith('data:image/jpeg')) return 'jpg';
            if (dataUrl.startsWith('data:image/webp')) return 'webp';
            if (dataUrl.startsWith('data:image/png')) return 'png';
        }
        return fallbackType === 'video' ? 'webm' : 'png';
    }

    function sanitizeFileName(text) {
        return String(text || 'Resultado')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '');
    }

    async function writeToLocalDirectory(item) {
        if (!directoryHandle) return false;
        try {
            const ext = getFileExtensionFromDataUrl(item.dataUrl, item.type);
            const cleanPreset = sanitizeFileName(item.presetName);
            const fileName = `IA_${cleanPreset}_${item.id}.${ext}`;
            const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            const response = await fetch(item.dataUrl);
            const blob = await response.blob();
            await writable.write(blob);
            await writable.close();
            return true;
        } catch (err) {
            console.warn('No se pudo escribir directamente en la carpeta local:', err);
            return false;
        }
    }

    async function saveCreation(item) {
        memoryCreations.set(item.id, item);

        const dbSaved = await new Promise((resolve) => {
            if (!dbInstance || !dbInstance.objectStoreNames.contains(STORE_CREATIONS)) {
                resolve(false);
                return;
            }
            try {
                const tx = dbInstance.transaction(STORE_CREATIONS, 'readwrite');
                tx.objectStore(STORE_CREATIONS).put(item);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (err) {
                resolve(false);
            }
        });

        const folderSaved = await writeToLocalDirectory(item);
        return { dbSaved, folderSaved };
    }

    function getAllCreations() {
        return new Promise((resolve) => {
            if (!dbInstance || !dbInstance.objectStoreNames.contains(STORE_CREATIONS)) {
                const list = Array.from(memoryCreations.values()).sort(
                    (a, b) => b.timestamp - a.timestamp
                );
                resolve(list);
                return;
            }
            try {
                const tx = dbInstance.transaction(STORE_CREATIONS, 'readonly');
                const req = tx.objectStore(STORE_CREATIONS).getAll();
                req.onsuccess = () => {
                    const items = (req.result || []).sort((a, b) => b.timestamp - a.timestamp);
                    resolve(items);
                };
                req.onerror = () => {
                    const list = Array.from(memoryCreations.values()).sort(
                        (a, b) => b.timestamp - a.timestamp
                    );
                    resolve(list);
                };
            } catch (err) {
                resolve([]);
            }
        });
    }

    function getCreationById(id) {
        return new Promise((resolve) => {
            if (!dbInstance || !dbInstance.objectStoreNames.contains(STORE_CREATIONS)) {
                resolve(memoryCreations.get(id) || null);
                return;
            }
            try {
                const tx = dbInstance.transaction(STORE_CREATIONS, 'readonly');
                const req = tx.objectStore(STORE_CREATIONS).get(id);
                req.onsuccess = () => resolve(req.result || memoryCreations.get(id) || null);
                req.onerror = () => resolve(memoryCreations.get(id) || null);
            } catch (err) {
                resolve(memoryCreations.get(id) || null);
            }
        });
    }

    function deleteCreation(id) {
        memoryCreations.delete(id);
        return new Promise((resolve) => {
            if (!dbInstance || !dbInstance.objectStoreNames.contains(STORE_CREATIONS)) {
                resolve(true);
                return;
            }
            try {
                const tx = dbInstance.transaction(STORE_CREATIONS, 'readwrite');
                tx.objectStore(STORE_CREATIONS).delete(id);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (err) {
                resolve(false);
            }
        });
    }

    function clearAllCreations() {
        memoryCreations.clear();
        return new Promise((resolve) => {
            if (!dbInstance || !dbInstance.objectStoreNames.contains(STORE_CREATIONS)) {
                resolve(true);
                return;
            }
            try {
                const tx = dbInstance.transaction(STORE_CREATIONS, 'readwrite');
                tx.objectStore(STORE_CREATIONS).clear();
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (err) {
                resolve(false);
            }
        });
    }

    async function connectLocalFolder() {
        if (typeof global.showDirectoryPicker !== 'function') {
            return {
                supported: false,
                connected: false,
                folderName: null
            };
        }
        try {
            directoryHandle = await global.showDirectoryPicker({ mode: 'readwrite' });
            return {
                supported: true,
                connected: true,
                folderName: directoryHandle.name
            };
        } catch (err) {
            return {
                supported: true,
                connected: false,
                cancelled: true,
                folderName: null
            };
        }
    }

    StudioAI.Storage = {
        init,
        saveSetting,
        getSetting,
        saveCreation,
        getAllCreations,
        getCreationById,
        deleteCreation,
        clearAllCreations,
        connectLocalFolder,
        getFileExtensionFromDataUrl,
        sanitizeFileName
    };
})(window);
