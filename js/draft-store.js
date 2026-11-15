(function () {
  'use strict';

  /*
   * 草稿持久化：IndexedDB 资产存储 + localStorage 信封 + 损坏备份与恢复。
   *
   * 与 design.md D4 的依赖表有意不同：D4 只写了 `draft-store ── project-schema`，
   * 但草稿信封复用结构序列化（`serializeProjectStructure`）、资产引用收集
   * （`collectReferencedAssetIds`）与恢复时的 `buildProject`，这些实现属于
   * `L.projectIo`。为此本模块在调用时读取 `L.projectIo.*`，不再复制一份实现；
   * 依赖方向仍是单向的（`projectIo` 不引用 `draftStore`），index.html 中
   * `project-io.js` 先于本文件加载。
   */

  const L = window.Listify = window.Listify || {};

  const DRAFT_KEY = 'listify.draft.v1';
  const DRAFT_CORRUPT_KEY = 'listify.draft.corrupt';
  const DRAFT_SCHEMA = 1;
  const DRAFT_DB_NAME = 'listify-draft';
  const DRAFT_DB_STORE = 'assets';
  const DRAFT_DB_VERSION = 1;

  let draftDbPromise = null;
  let knownDraftAssetIds = null;

  function openDraftDb() {
    if (draftDbPromise) return draftDbPromise;
    draftDbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB 不可用'));
        return;
      }
      let request;
      try {
        request = window.indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(DRAFT_DB_STORE)) {
          db.createObjectStore(DRAFT_DB_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = function () {
        const db = request.result;
        db.onversionchange = function () {
          db.close();
          draftDbPromise = null;
          knownDraftAssetIds = null;
        };
        resolve(db);
      };
      request.onerror = function () {
        reject(request.error || new Error('IndexedDB 打开失败'));
      };
      request.onblocked = function () {
        reject(new Error('IndexedDB 被其它标签页占用'));
      };
    });
    draftDbPromise.catch(function () {
      draftDbPromise = null;
    });
    return draftDbPromise;
  }

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        reject(request.error || new Error('IndexedDB 请求失败'));
      };
    });
  }

  function draftWriteTransaction(run) {
    return openDraftDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        let tx;
        try {
          tx = db.transaction(DRAFT_DB_STORE, 'readwrite');
        } catch (err) {
          reject(err);
          return;
        }
        try {
          run(tx.objectStore(DRAFT_DB_STORE));
        } catch (err) {
          try { tx.abort(); } catch (ignored) { /* empty */ }
          reject(err);
          return;
        }
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () {
          reject(tx.error || new Error('IndexedDB 写入失败'));
        };
        tx.onabort = function () {
          reject(tx.error || new Error('IndexedDB 写入中止'));
        };
      });
    });
  }

  async function draftAssetGet(id) {
    const db = await openDraftDb();
    const tx = db.transaction(DRAFT_DB_STORE, 'readonly');
    return requestResult(tx.objectStore(DRAFT_DB_STORE).get(id));
  }

  async function draftAssetGetAll() {
    const db = await openDraftDb();
    const tx = db.transaction(DRAFT_DB_STORE, 'readonly');
    const records = await requestResult(tx.objectStore(DRAFT_DB_STORE).getAll());
    return Array.isArray(records) ? records : [];
  }

  async function draftAssetKeys() {
    const db = await openDraftDb();
    const tx = db.transaction(DRAFT_DB_STORE, 'readonly');
    const keys = await requestResult(tx.objectStore(DRAFT_DB_STORE).getAllKeys());
    knownDraftAssetIds = new Set(keys || []);
    return Array.from(knownDraftAssetIds);
  }

  function draftAssetPut(record) {
    return draftWriteTransaction(function (store) {
      store.put(record);
    });
  }

  function draftAssetDelete(id) {
    return draftWriteTransaction(function (store) {
      store.delete(id);
    });
  }

  function draftAssetsClear() {
    return draftWriteTransaction(function (store) {
      store.clear();
    });
  }

  function draftAssetMeta(id, project) {
    const blob = L.assets.getBlob(id);
    const meta = L.assets.getMeta(id) ||
      ((project && project.assets) || []).find(function (asset) {
        return asset.id === id;
      }) ||
      {};
    return {
      id: id,
      name: meta.name || 'image',
      mime: meta.mime || (blob && blob.type) || 'image/png'
    };
  }

  async function draftAssetRecord(id, blob, meta) {
    return {
      id: id,
      name: meta.name || 'image',
      mime: meta.mime || blob.type || 'image/png',
      data: await L.assets.blobToBase64(blob)
    };
  }

  async function persistDraftAsset(id, project) {
    const blob = L.assets.getBlob(id);
    if (!blob) return false;
    const record = await draftAssetRecord(id, blob, draftAssetMeta(id, project));
    await draftAssetPut(record);
    if (knownDraftAssetIds) knownDraftAssetIds.add(id);
    return true;
  }

  async function persistAssetStore(store) {
    if (!store || !store.blobs) return;
    for (const entry of store.blobs) {
      const id = entry[0];
      const blob = entry[1];
      const meta = (store.meta && store.meta.get(id)) || {};
      await draftAssetPut(await draftAssetRecord(id, blob, meta));
      if (knownDraftAssetIds) knownDraftAssetIds.add(id);
    }
  }

  async function ensureDraftAssets(project) {
    const referenced = L.projectIo.collectReferencedAssetIds(project);
    if (!referenced.length) return;
    if (knownDraftAssetIds === null) await draftAssetKeys();
    for (const id of referenced) {
      if (knownDraftAssetIds.has(id)) continue;
      await persistDraftAsset(id, project);
    }
  }

  async function pruneDraftAssets(project) {
    const referenced = new Set(L.projectIo.collectReferencedAssetIds(project));
    const keys = await draftAssetKeys();
    for (const id of keys) {
      if (referenced.has(id)) continue;
      await draftAssetDelete(id);
      if (knownDraftAssetIds) knownDraftAssetIds.delete(id);
    }
  }

  function createDraftEnvelope(project, currentPageId) {
    return {
      schema: DRAFT_SCHEMA,
      savedAt: 0,
      ui: { currentPageId: currentPageId || null },
      project: L.projectIo.serializeProjectStructure(project)
    };
  }

  function writeDraftEnvelope(envelope) {
    envelope.savedAt = Date.now();
    let text;
    try {
      text = JSON.stringify(envelope);
    } catch (err) {
      throw new Error('草稿序列化失败：' + err.message);
    }
    try {
      window.localStorage.setItem(DRAFT_KEY, text);
    } catch (err) {
      const error = new Error('本地存储写入失败：' +
        (err && err.message ? err.message : '未知错误'));
      if (err && err.name) error.name = err.name;
      throw error;
    }
    return envelope.savedAt;
  }

  function backupCorruptDraft(text) {
    if (typeof text !== 'string') return;
    try {
      window.localStorage.setItem(DRAFT_CORRUPT_KEY, text);
    } catch (err) {
      /* best effort: the original draft key is left untouched */
    }
  }

  async function clearDraft() {
    let storageFailure = null;
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch (err) {
      storageFailure = err;
    }
    await draftAssetsClear();
    knownDraftAssetIds = new Set();
    if (storageFailure) {
      const error = new Error('本地存储不可用：' +
        (storageFailure.message || '未知错误'));
      if (storageFailure.name) error.name = storageFailure.name;
      throw error;
    }
  }

  function pruneMissingAssets(raw, missing) {
    (raw.backgrounds || []).forEach(function (background) {
      if (!background || !Array.isArray(background.images)) return;
      background.images = background.images.filter(function (image) {
        return !image || !image.assetId || !missing.has(image.assetId);
      });
    });
    (raw.pages || []).forEach(function (page) {
      if (!page || !Array.isArray(page.elements)) return;
      page.elements = page.elements.filter(function (element) {
        return !(element && element.type === 'image' &&
          element.assetId && missing.has(element.assetId));
      });
    });
  }

  async function restoreDraft() {
    let text;
    try {
      text = window.localStorage.getItem(DRAFT_KEY);
    } catch (err) {
      return {
        ok: false,
        reason: 'unavailable',
        error: '本地存储不可用：' + (err.message || '未知错误')
      };
    }
    if (!text) return { ok: true, empty: true };

    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch (err) {
      backupCorruptDraft(text);
      return { ok: false, reason: 'corrupt', error: '草稿不是合法 JSON。' };
    }

    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
        !envelope.project || typeof envelope.project !== 'object') {
      backupCorruptDraft(text);
      return { ok: false, reason: 'corrupt', error: '草稿结构无效。' };
    }
    if (envelope.schema !== DRAFT_SCHEMA) {
      backupCorruptDraft(text);
      return {
        ok: false,
        reason: Number(envelope.schema) > DRAFT_SCHEMA ? 'version' : 'corrupt',
        error: '草稿版本不受支持。'
      };
    }
    if (typeof envelope.project.version === 'number' && envelope.project.version > 3) {
      backupCorruptDraft(text);
      return { ok: false, reason: 'version', error: '草稿项目版本高于当前支持版本。' };
    }

    let raw;
    try {
      raw = L.model.clone(envelope.project);
    } catch (err) {
      backupCorruptDraft(text);
      return { ok: false, reason: 'corrupt', error: '草稿结构无效。' };
    }

    if (!Array.isArray(raw.assets)) {
      backupCorruptDraft(text);
      return { ok: false, reason: 'corrupt', error: '草稿缺少图片资产列表。' };
    }

    const byId = new Map();
    if (raw.assets.length) {
      let records;
      try {
        records = await draftAssetGetAll();
      } catch (err) {
        return {
          ok: false,
          reason: 'unavailable',
          error: '图片资产存储不可用：' + (err.message || '未知错误')
        };
      }
      records.forEach(function (record) {
        if (record && record.id) byId.set(record.id, record);
      });
    }
    knownDraftAssetIds = new Set(byId.keys());

    const missing = new Set();
    raw.assets = raw.assets.filter(function (asset) {
      if (!asset || typeof asset.id !== 'string' || !asset.id) return true;
      const record = byId.get(asset.id);
      if (!record || typeof record.data !== 'string' || !record.data) {
        missing.add(asset.id);
        return false;
      }
      asset.data = record.data;
      if (!asset.mime && record.mime) asset.mime = record.mime;
      if (!asset.name && record.name) asset.name = record.name;
      return true;
    });
    if (missing.size) {
      backupCorruptDraft(text);
      pruneMissingAssets(raw, missing);
    }

    const validation = L.projectSchema.validateProject(raw);
    if (!validation.ok) {
      backupCorruptDraft(text);
      return {
        ok: false,
        reason: 'corrupt',
        error: validation.errors.join('；'),
        errors: validation.errors
      };
    }

    try {
      const built = await L.projectIo.buildProject(raw);
      return {
        ok: true,
        project: built.project,
        assets: built.assets,
        ui: envelope.ui || {},
        savedAt: Number(envelope.savedAt) || 0,
        missingCount: missing.size
      };
    } catch (err) {
      backupCorruptDraft(text);
      return { ok: false, reason: 'corrupt', error: '草稿恢复失败：' + err.message };
    }
  }

  L.draftStore = {
    DRAFT_KEY: DRAFT_KEY,
    DRAFT_CORRUPT_KEY: DRAFT_CORRUPT_KEY,
    DRAFT_SCHEMA: DRAFT_SCHEMA,
    openDraftDb: openDraftDb,
    requestResult: requestResult,
    draftWriteTransaction: draftWriteTransaction,
    draftAssetGet: draftAssetGet,
    draftAssetGetAll: draftAssetGetAll,
    draftAssetKeys: draftAssetKeys,
    draftAssetPut: draftAssetPut,
    draftAssetDelete: draftAssetDelete,
    draftAssetsClear: draftAssetsClear,
    draftAssetMeta: draftAssetMeta,
    draftAssetRecord: draftAssetRecord,
    persistDraftAsset: persistDraftAsset,
    persistAssetStore: persistAssetStore,
    ensureDraftAssets: ensureDraftAssets,
    pruneDraftAssets: pruneDraftAssets,
    createDraftEnvelope: createDraftEnvelope,
    writeDraftEnvelope: writeDraftEnvelope,
    backupCorruptDraft: backupCorruptDraft,
    clearDraft: clearDraft,
    pruneMissingAssets: pruneMissingAssets,
    restoreDraft: restoreDraft
  };
})();
