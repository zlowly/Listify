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
  // v1 的 base64 记录保留为只读兼容层；新写入统一进二进制 store。
  const DRAFT_DB_STORE = 'assets';
  const DRAFT_DB_BLOB_STORE = 'assetBlobs';
  // 草稿信封存 IndexedDB：写入是异步事务，不必在交互路径里同步序列化整包；
  // localStorage 仅保留 pagehide 一次同步兜底与旧版本兼容。
  const DRAFT_META_STORE = 'draftMeta';
  const DRAFT_META_ID = 'current';
  const DRAFT_DB_VERSION = 3;

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
        if (!db.objectStoreNames.contains(DRAFT_DB_BLOB_STORE)) {
          db.createObjectStore(DRAFT_DB_BLOB_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(DRAFT_META_STORE)) {
          db.createObjectStore(DRAFT_META_STORE, { keyPath: 'id' });
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
          tx = db.transaction([DRAFT_DB_STORE, DRAFT_DB_BLOB_STORE], 'readwrite');
        } catch (err) {
          reject(err);
          return;
        }
        try {
          run(tx.objectStore(DRAFT_DB_STORE), tx.objectStore(DRAFT_DB_BLOB_STORE));
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

  function blobToDataUrl(blob) {
    return new Promise(function (resolve) {
      if (!blob) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { resolve(''); };
      reader.readAsDataURL(blob);
    });
  }

  // 草稿恢复只接受纯 base64（buildProject 会直接 atob）。
  // 二进制分支与历史记录都可能带 data URL 前缀，这里统一剥除。
  function stripDataUrlPrefix(value) {
    if (typeof value !== 'string') return '';
    const comma = value.indexOf(',');
    if (value.slice(0, 5) !== 'data:' || comma < 0) return value;
    return value.slice(comma + 1);
  }

  async function blobToDraftBase64(blob) {
    return stripDataUrlPrefix(await blobToDataUrl(blob));
  }

  async function draftAssetGet(id) {
    const db = await openDraftDb();
    const tx = db.transaction([DRAFT_DB_STORE, DRAFT_DB_BLOB_STORE], 'readonly');
    const binary = await requestResult(tx.objectStore(DRAFT_DB_BLOB_STORE).get(id));
    if (binary) {
      return {
        id: binary.id,
        name: binary.name,
        mime: binary.mime,
        data: await blobToDraftBase64(binary.blob)
      };
    }
    return requestResult(tx.objectStore(DRAFT_DB_STORE).get(id));
  }

  async function draftAssetGetAll() {
    const db = await openDraftDb();
    const tx = db.transaction([DRAFT_DB_STORE, DRAFT_DB_BLOB_STORE], 'readonly');
    const legacy = await requestResult(tx.objectStore(DRAFT_DB_STORE).getAll());
    const binary = await requestResult(tx.objectStore(DRAFT_DB_BLOB_STORE).getAll());
    const byId = new Map();
    (Array.isArray(legacy) ? legacy : []).forEach(function (record) {
      if (record && record.id) byId.set(record.id, record);
    });
    for (const record of (Array.isArray(binary) ? binary : [])) {
      if (!record || !record.id) continue;
      byId.set(record.id, {
        id: record.id,
        name: record.name,
        mime: record.mime,
        data: await blobToDraftBase64(record.blob)
      });
    }
    return Array.from(byId.values());
  }

  async function draftAssetKeys() {
    const db = await openDraftDb();
    const tx = db.transaction([DRAFT_DB_STORE, DRAFT_DB_BLOB_STORE], 'readonly');
    const legacyKeys = await requestResult(tx.objectStore(DRAFT_DB_STORE).getAllKeys());
    const binaryKeys = await requestResult(tx.objectStore(DRAFT_DB_BLOB_STORE).getAllKeys());
    knownDraftAssetIds = new Set(
      (legacyKeys || []).concat(binaryKeys || [])
    );
    return Array.from(knownDraftAssetIds);
  }

  // 旧格式（base64 记录）的 id 集合：恢复成功后要把它们改写成二进制。
  async function draftLegacyAssetKeys() {
    const db = await openDraftDb();
    const tx = db.transaction([DRAFT_DB_STORE], 'readonly');
    const keys = await requestResult(tx.objectStore(DRAFT_DB_STORE).getAllKeys());
    return new Set(Array.isArray(keys) ? keys : []);
  }

  // 把仍以 base64 保存的资产改写成二进制记录；失败不影响恢复结果。
  async function migrateLegacyAssets(legacyIds, byId) {
    if (!legacyIds || !legacyIds.size) return 0;
    let migrated = 0;
    for (const id of legacyIds) {
      const record = byId.get(id);
      if (!record || typeof record.data !== 'string' || !record.data) continue;
      try {
        const blob = L.assets.base64ToBlob(stripDataUrlPrefix(record.data), record.mime);
        await draftAssetPut(draftAssetRecord(id, blob, { name: record.name, mime: record.mime }));
        migrated += 1;
      } catch (err) {
        /* 单条失败保持旧记录，下次恢复再试 */
      }
    }
    return migrated;
  }

  function draftAssetPut(record) {
    return draftWriteTransaction(function (legacy, binary) {
      binary.put(record);
      legacy.delete(record.id);
    });
  }

  function draftAssetDelete(id) {
    return draftWriteTransaction(function (legacy, binary) {
      legacy.delete(id);
      binary.delete(id);
    });
  }

  function draftAssetsClear() {
    return draftWriteTransaction(function (legacy, binary) {
      legacy.clear();
      binary.clear();
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

  function draftAssetRecord(id, blob, meta) {
    return {
      id: id,
      name: meta.name || 'image',
      mime: meta.mime || blob.type || 'image/png',
      blob: blob
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

  // 交互路径使用的异步写入：结构化克隆直接进 IndexedDB，不做 JSON.stringify。
  async function writeDraftEnvelopeAsync(envelope) {
    envelope.savedAt = Date.now();
    const db = await openDraftDb();
    await new Promise(function (resolve, reject) {
      let tx;
      try {
        tx = db.transaction(DRAFT_META_STORE, 'readwrite');
      } catch (err) {
        reject(err);
        return;
      }
      tx.objectStore(DRAFT_META_STORE).put({ id: DRAFT_META_ID, envelope: envelope });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error('草稿写入失败')); };
      tx.onabort = function () { reject(tx.error || new Error('草稿写入被中止')); };
    });
    return envelope.savedAt;
  }

  async function readDraftEnvelopeAsync() {
    try {
      const db = await openDraftDb();
      const record = await requestResult(
        db.transaction(DRAFT_META_STORE, 'readonly').objectStore(DRAFT_META_STORE).get(DRAFT_META_ID)
      );
      const envelope = record && record.envelope;
      if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) return envelope;
      return null;
    } catch (err) {
      return null;
    }
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
    try {
      const db = await openDraftDb();
      await new Promise(function (resolve) {
        const tx = db.transaction(DRAFT_META_STORE, 'readwrite');
        tx.objectStore(DRAFT_META_STORE).delete(DRAFT_META_ID);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
        tx.onabort = function () { resolve(); };
      });
    } catch (err) {
      /* 元数据存储不可用时由 localStorage 与资产清理兜底。 */
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
    let text = null;
    let envelope = await readDraftEnvelopeAsync();
    if (!envelope) {
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
      try {
        envelope = JSON.parse(text);
      } catch (err) {
        backupCorruptDraft(text);
        return { ok: false, reason: 'corrupt', error: '草稿不是合法 JSON。' };
      }
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
    let legacyAssetIds = new Set();
    if (raw.assets.length) {
      let records;
      try {
        legacyAssetIds = await draftLegacyAssetKeys();
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
      asset.data = stripDataUrlPrefix(record.data);
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
      await migrateLegacyAssets(legacyAssetIds, byId);
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
    draftLegacyAssetKeys: draftLegacyAssetKeys,
    stripDataUrlPrefix: stripDataUrlPrefix,
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
    writeDraftEnvelopeAsync: writeDraftEnvelopeAsync,
    readDraftEnvelopeAsync: readDraftEnvelopeAsync,
    backupCorruptDraft: backupCorruptDraft,
    clearDraft: clearDraft,
    pruneMissingAssets: pruneMissingAssets,
    restoreDraft: restoreDraft
  };
})();
