(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;

  const DRAFT_KEY = 'listify.draft.v1';
  const DRAFT_CORRUPT_KEY = 'listify.draft.corrupt';
  const DRAFT_SCHEMA = 1;
  const DRAFT_DB_NAME = 'listify-draft';
  const DRAFT_DB_STORE = 'assets';
  const DRAFT_DB_VERSION = 1;

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function collectReferencedAssetIds(project) {
    const ids = new Set();
    (project.backgrounds || []).forEach(function (background) {
      (background.images || []).forEach(function (image) {
        if (image && image.assetId) ids.add(image.assetId);
      });
    });
    project.pages.forEach(function (page) {
      page.elements.forEach(function (element) {
        if (element.type === 'image' && element.assetId) ids.add(element.assetId);
      });
    });
    return Array.from(ids);
  }

  function serializeStyle(style) {
    const pair = model.normalizeFontPair(style.fontPair);
    const result = {
      fontFamily: pair ? model.composeFontFamily(pair) : style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      lineHeight: style.lineHeight,
      align: style.align
    };
    if (pair) {
      const savedPair = {};
      if (pair.latin) savedPair.latin = pair.latin;
      if (pair.cjk) savedPair.cjk = pair.cjk;
      result.fontPair = savedPair;
    }
    return result;
  }

  function loadStyle(style) {
    return model.normalizeStyle(model.copyStyle(style));
  }

  function serializeTable(table) {
    return {
      columns: table.columns,
      rows: table.rows,
      fill: table.fill,
      align: table.align,
      widthMode: table.widthMode,
      widths: Array.isArray(table.widths) ? table.widths.slice() : [],
      margins: model.normalizeMargins(table.margins)
    };
  }

  function serializeElement(element) {
    if (element.type === 'category') {
      return {
        id: element.id,
        type: 'category',
        category: element.category,
        showTitle: element.showTitle !== false,
        x: element.x,
        y: element.y,
        width: element.width,
        titleStyle: serializeStyle(element.titleStyle),
        songStyle: serializeStyle(element.songStyle),
        tables: element.tables.map(serializeTable)
      };
    }
    if (element.type === 'text') {
      return {
        id: element.id,
        type: 'text',
        x: element.x,
        y: element.y,
        width: element.width,
        text: element.text,
        style: serializeStyle(element.style)
      };
    }
    return {
      id: element.id,
      type: 'image',
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      assetId: element.assetId,
      keepRatio: element.keepRatio !== false,
      rotation: Number(element.rotation) || 0,
      opacity: element.opacity,
      blur: Number(element.blur) || 0
    };
  }

  function serializeBackgroundImage(image) {
    return {
      id: image.id,
      assetId: image.assetId || null,
      fit: image.fit || 'cover',
      x: Number(image.x) || 0,
      y: Number(image.y) || 0,
      width: Number(image.width) || 0,
      height: Number(image.height) || 0,
      rotation: Number(image.rotation) || 0,
      keepRatio: image.keepRatio !== false,
      opacity: image.opacity == null ? 1 : image.opacity,
      blur: image.blur == null ? 0 : image.blur
    };
  }

  function serializeBackgroundSet(background) {
    return {
      id: background.id,
      name: background.name || '背景',
      color: background.color || model.DEFAULT_BACKGROUND_COLOR,
      images: (background.images || []).map(serializeBackgroundImage)
    };
  }

  function serializeProjectStructure(project) {
    const referencedIds = collectReferencedAssetIds(project);
    const assets = referencedIds.map(function (id) {
      const blob = L.assets.getBlob(id);
      const meta = L.assets.getMeta(id) ||
        (project.assets || []).find(function (asset) { return asset.id === id; }) ||
        { name: 'image', mime: blob ? blob.type : 'image/png' };
      return {
        id: id,
        name: meta.name || 'image',
        mime: meta.mime || (blob && blob.type) || 'image/png'
      };
    });

    return {
      version: 3,
      pageSize: {
        width: project.pageSize.width,
        height: project.pageSize.height
      },
      margins: {
        top: project.margins.top,
        right: project.margins.right,
        bottom: project.margins.bottom,
        left: project.margins.left
      },
      playlist: {
        categories: project.playlist.categories.map(function (category) {
          return { name: category.name, songs: category.songs.slice() };
        })
      },
      assets: assets,
      backgrounds: (project.backgrounds || []).map(serializeBackgroundSet),
      unifiedBackground: !!project.unifiedBackground,
      unifiedBackgroundId: project.unifiedBackgroundId || null,
      pages: project.pages.map(function (page) {
        return {
          id: page.id,
          backgroundId: page.backgroundId || null,
          elements: page.elements.map(serializeElement)
        };
      })
    };
  }

  async function serializeProject(project) {
    const structure = serializeProjectStructure(project);
    for (const asset of structure.assets) {
      const blob = L.assets.getBlob(asset.id);
      if (!blob) throw new Error('图片资产缺失：' + asset.id);
      asset.data = await model.blobToBase64(blob);
    }
    return structure;
  }

  async function downloadProject(project) {
    const data = await serializeProject(project);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    model.downloadBlob(blob, '歌单项目.json');
  }

  /* ---------- local draft storage ---------- */

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
      data: await model.blobToBase64(blob)
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
    const referenced = collectReferencedAssetIds(project);
    if (!referenced.length) return;
    if (knownDraftAssetIds === null) await draftAssetKeys();
    for (const id of referenced) {
      if (knownDraftAssetIds.has(id)) continue;
      await persistDraftAsset(id, project);
    }
  }

  async function pruneDraftAssets(project) {
    const referenced = new Set(collectReferencedAssetIds(project));
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
      project: serializeProjectStructure(project)
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
      raw = JSON.parse(JSON.stringify(envelope.project));
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

    const validation = validateProject(raw);
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
      const built = await buildProject(raw);
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

  function validateProject(raw) {
    const errors = [];
    function fail(message) {
      errors.push(message);
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, errors: ['项目文件不是有效的 JSON 对象。'] };
    }
    if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3) {
      if (typeof raw.version === 'number' && raw.version > 3) {
        fail('项目版本 ' + raw.version + ' 高于当前支持的版本 3，无法加载。');
      } else {
        fail('项目版本无效或缺失，无法加载。');
      }
      return { ok: false, errors: errors };
    }
    const isV1 = raw.version === 1;
    const isV3 = raw.version === 3;
    if (!raw.pageSize || !isFiniteNumber(raw.pageSize.width) || !isFiniteNumber(raw.pageSize.height) ||
        raw.pageSize.width <= 0 || raw.pageSize.height <= 0) {
      fail('页面尺寸无效。');
    }
    if (!raw.margins || !['top', 'right', 'bottom', 'left'].every(function (key) {
      return isFiniteNumber(raw.margins[key]) && raw.margins[key] >= 0;
    })) {
      fail('页面边距无效。');
    }
    if (!raw.playlist || !Array.isArray(raw.playlist.categories)) {
      fail('歌单数据缺失。');
    } else {
      const categoryNames = new Set();
      const songNames = new Set();
      raw.playlist.categories.forEach(function (category, index) {
        if (!category || typeof category.name !== 'string' || !category.name) {
          fail('第 ' + (index + 1) + ' 个分类名称无效。');
          return;
        }
        if (categoryNames.has(category.name)) fail('分类名称重复：' + category.name);
        categoryNames.add(category.name);
        if (!Array.isArray(category.songs)) {
          fail('分类“' + category.name + '”的歌名列表无效。');
          return;
        }
        category.songs.forEach(function (song) {
          if (typeof song !== 'string') fail('分类“' + category.name + '”中存在无效歌名。');
          if (songNames.has(song)) fail('歌名重复：' + song);
          songNames.add(song);
        });
      });
    }

    if (!Array.isArray(raw.pages) || raw.pages.length === 0) {
      fail('项目至少需要一页。');
    }
    if (!Array.isArray(raw.assets)) {
      fail('图片资产列表缺失。');
    }

    const assetIds = new Set();
    if (Array.isArray(raw.assets)) {
      raw.assets.forEach(function (asset, index) {
        if (!asset || typeof asset.id !== 'string' || !asset.id) {
          fail('第 ' + (index + 1) + ' 个图片资产 ID 无效。');
          return;
        }
        if (assetIds.has(asset.id)) fail('图片资产 ID 重复：' + asset.id);
        assetIds.add(asset.id);
        if (typeof asset.data !== 'string' || !asset.data) {
          fail('图片资产“' + asset.id + '”缺少 base64 数据。');
        }
        if (typeof asset.mime !== 'string' || !asset.mime) {
          fail('图片资产“' + asset.id + '”缺少 MIME 类型。');
        }
      });
    }

    const backgroundIds = new Set();
    if (isV3) {
      if (!Array.isArray(raw.backgrounds) || raw.backgrounds.length === 0) {
        fail('背景库缺失或为空。');
      } else {
        raw.backgrounds.forEach(function (background, index) {
          const label = '第 ' + (index + 1) + ' 个背景';
          if (!background || typeof background.id !== 'string' || !background.id) {
            fail(label + '缺少 ID。');
            return;
          }
          if (backgroundIds.has(background.id)) fail('背景 ID 重复：' + background.id);
          backgroundIds.add(background.id);
          if (typeof background.name !== 'string') fail(label + '名称无效。');
          if (typeof background.color !== 'string') fail(label + '颜色无效。');
          if (!Array.isArray(background.images)) {
            fail(label + '图片列表无效。');
            return;
          }
          const imageIds = new Set();
          background.images.forEach(function (image, imageIndex) {
            const imageLabel = label + '第 ' + (imageIndex + 1) + ' 张图片';
            if (!image || typeof image.id !== 'string' || !image.id) {
              fail(imageLabel + '缺少 ID。');
              return;
            }
            if (imageIds.has(image.id)) fail(imageLabel + ' ID 重复。');
            imageIds.add(image.id);
            if (image.assetId != null) {
              if (typeof image.assetId !== 'string' || !assetIds.has(image.assetId)) {
                fail(imageLabel + '引用了不存在的图片资产。');
              }
            }
            if (model.BACKGROUND_FITS.indexOf(image.fit) < 0) fail(imageLabel + '定位模式无效。');
            if (image.fit === 'none') {
              if (!isFiniteNumber(image.x) || !isFiniteNumber(image.y) ||
                  !isFiniteNumber(image.width) || image.width <= 0 ||
                  !isFiniteNumber(image.height) || image.height <= 0) {
                fail(imageLabel + '的自定义位置或尺寸无效。');
              }
            }
            if (!isFiniteNumber(image.opacity) || image.opacity < 0 || image.opacity > 1) {
              fail(imageLabel + '透明度无效。');
            }
            if (!isFiniteNumber(image.blur) || image.blur < 0) fail(imageLabel + '模糊值无效。');
            if (image.rotation !== undefined && !isFiniteNumber(image.rotation)) {
              fail(imageLabel + '旋转角度无效。');
            }
            if (image.keepRatio !== undefined && typeof image.keepRatio !== 'boolean') {
              fail(imageLabel + '等比设置无效。');
            }
          });
        });
      }
      if (typeof raw.unifiedBackground !== 'boolean') fail('全局背景开关无效。');
      if (raw.unifiedBackground) {
        if (typeof raw.unifiedBackgroundId !== 'string' || !backgroundIds.has(raw.unifiedBackgroundId)) {
          fail('全局背景引用了不存在的背景。');
        }
      } else if (raw.unifiedBackgroundId != null &&
          (typeof raw.unifiedBackgroundId !== 'string' || !backgroundIds.has(raw.unifiedBackgroundId))) {
        fail('全局背景 ID 无效。');
      }
    }

    const categoryNames = new Set(
      raw.playlist && Array.isArray(raw.playlist.categories)
        ? raw.playlist.categories.map(function (category) { return category.name; })
        : []
    );
    const elementIds = new Set();
    const pageIds = new Set();

    if (Array.isArray(raw.pages)) {
      raw.pages.forEach(function (page, pageIndex) {
        if (!page || typeof page.id !== 'string' || !page.id) {
          fail('第 ' + (pageIndex + 1) + ' 页缺少页面 ID。');
          return;
        }
        if (pageIds.has(page.id)) fail('页面 ID 重复：' + page.id);
        pageIds.add(page.id);
      });

      raw.pages.forEach(function (page, pageIndex) {
        if (!page || typeof page.id !== 'string' || !page.id) return;
        if (isV3) {
          if (typeof page.backgroundId !== 'string' || !page.backgroundId) {
            fail('第 ' + (pageIndex + 1) + ' 页缺少背景 ID。');
          } else if (!backgroundIds.has(page.backgroundId)) {
            fail('第 ' + (pageIndex + 1) + ' 页引用了不存在的背景。');
          }
        } else {
          const backgroundRef = page.backgroundRef == null ? null : page.backgroundRef;
          if (backgroundRef != null) {
            if (typeof backgroundRef !== 'string' || !backgroundRef) {
              fail('第 ' + (pageIndex + 1) + ' 页背景引用无效。');
            }
            if (!isV1 && page.background != null) {
              fail('第 ' + (pageIndex + 1) + ' 页引用背景时不应同时保存背景属性。');
            }
          } else if (!page.background || typeof page.background !== 'object') {
            fail('第 ' + (pageIndex + 1) + ' 页缺少背景属性。');
          }
          if (page.background && typeof page.background === 'object') {
            const bg = page.background;
            if (bg.assetId && !assetIds.has(bg.assetId)) {
              fail('第 ' + (pageIndex + 1) + ' 页背景引用了不存在的图片资产。');
            }
            if (['original', 'fill-width', 'fill-height', 'cover'].indexOf(bg.fit) < 0) {
              fail('第 ' + (pageIndex + 1) + ' 页背景尺寸模式无效。');
            }
            if (!isFiniteNumber(bg.opacity) || bg.opacity < 0 || bg.opacity > 1) {
              fail('第 ' + (pageIndex + 1) + ' 页背景透明度无效。');
            }
            if (!isFiniteNumber(bg.blur) || bg.blur < 0) {
              fail('第 ' + (pageIndex + 1) + ' 页背景模糊值无效。');
            }
            if (typeof bg.color !== 'string') {
              fail('第 ' + (pageIndex + 1) + ' 页背景颜色无效。');
            }
          }
        }
        if (!Array.isArray(page.elements)) {
          fail('第 ' + (pageIndex + 1) + ' 页的内容列表无效。');
          return;
        }
        page.elements.forEach(function (element, elementIndex) {
          const label = '第 ' + (pageIndex + 1) + ' 页第 ' + (elementIndex + 1) + ' 个元素';
          if (!element || typeof element.id !== 'string' || !element.id) {
            fail(label + '缺少 ID。');
            return;
          }
          if (elementIds.has(element.id)) fail('元素 ID 重复：' + element.id);
          elementIds.add(element.id);
          if (!isFiniteNumber(element.x) || !isFiniteNumber(element.y) ||
              !isFiniteNumber(element.width) || element.width <= 0) {
            fail(label + '的位置或宽度无效。');
          }
          if (element.type === 'category') {
            if (typeof element.category !== 'string' || !categoryNames.has(element.category)) {
              fail(label + '引用了不存在的分类。');
            }
            if (!element.titleStyle || !element.songStyle) {
              fail(label + '缺少子分区样式。');
            }
            if (!Array.isArray(element.tables) || !element.tables.length) {
              fail(label + '至少需要一个表格。');
            } else {
              element.tables.forEach(function (table, tableIndex) {
                if (!table || !Number.isInteger(table.columns) || table.columns <= 0) {
                  fail(label + '第 ' + (tableIndex + 1) + ' 个表格列数无效。');
                }
                if (!Number.isInteger(table.rows) || table.rows < 0) {
                  fail(label + '第 ' + (tableIndex + 1) + ' 个表格行数无效。');
                }
                if (table.rows === 0 && tableIndex !== element.tables.length - 1) {
                  fail(label + '只有最后一个表格可以使用动态行。');
                }
                if (['column', 'row'].indexOf(table.fill) < 0) {
                  fail(label + '第 ' + (tableIndex + 1) + ' 个表格填充顺序无效。');
                }
                if (['left', 'center', 'right', 'justify'].indexOf(table.align) < 0) {
                  fail(label + '第 ' + (tableIndex + 1) + ' 个表格对齐方式无效。');
                }
                if (table.widthMode === 'manual') {
                  if (!Array.isArray(table.widths) || table.widths.length !== table.columns ||
                      !table.widths.every(function (width) { return isFiniteNumber(width) && width > 0; })) {
                    fail(label + '第 ' + (tableIndex + 1) + ' 个表格手动列宽无效。');
                  }
                }
                if (table.margins !== undefined) {
                  if (!table.margins || typeof table.margins !== 'object' || Array.isArray(table.margins)) {
                    fail(label + '第 ' + (tableIndex + 1) + ' 个表格边距无效。');
                  } else {
                    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
                      if (table.margins[side] !== undefined &&
                          (!isFiniteNumber(table.margins[side]) || table.margins[side] < 0)) {
                        fail(label + '第 ' + (tableIndex + 1) + ' 个表格' + side + '边距无效。');
                      }
                    });
                  }
                }
              });
            }
          } else if (element.type === 'text') {
            if (typeof element.text !== 'string' || !element.style) {
              fail(label + '的文字内容或样式无效。');
            }
          } else if (element.type === 'image') {
            if (!isFiniteNumber(element.height) || element.height <= 0) {
              fail(label + '的图片高度无效。');
            }
            if (typeof element.assetId !== 'string' || !assetIds.has(element.assetId)) {
              fail(label + '引用了不存在的图片资产。');
            }
            if (isV1) {
              if (['cover', 'contain', 'stretch'].indexOf(element.fit) < 0) {
                fail(label + '的图片填充模式无效。');
              }
            } else {
              if (element.keepRatio !== undefined && typeof element.keepRatio !== 'boolean') {
                fail(label + '的等比缩放设置无效。');
              }
              if (element.rotation !== undefined && !isFiniteNumber(element.rotation)) {
                fail(label + '的旋转角度无效。');
              }
              if (element.blur !== undefined && (!isFiniteNumber(element.blur) || element.blur < 0)) {
                fail(label + '的模糊值无效。');
              }
            }
            if (!isFiniteNumber(element.opacity) || element.opacity < 0 || element.opacity > 1) {
              fail(label + '的图片透明度无效。');
            }
          } else {
            fail(label + '的类型未知。');
          }
        });
      });

      const pageById = new Map();
      raw.pages.forEach(function (page) {
        if (page && typeof page.id === 'string' && page.id) pageById.set(page.id, page);
      });
      if (!isV3) raw.pages.forEach(function (page, pageIndex) {
        if (!page || page.backgroundRef == null) return;
        if (typeof page.backgroundRef !== 'string' || !page.backgroundRef) return;
        const label = '第 ' + (pageIndex + 1) + ' 页';
        if (!pageById.has(page.backgroundRef)) {
          fail(label + '的背景引用指向不存在的页面。');
          return;
        }
        const seen = new Set([page.id]);
        let cursor = page;
        while (cursor && cursor.backgroundRef != null) {
          if (seen.has(cursor.backgroundRef)) {
            fail(label + '的背景引用形成循环。');
            return;
          }
          seen.add(cursor.backgroundRef);
          cursor = pageById.get(cursor.backgroundRef);
        }
        if (!cursor || !cursor.background || typeof cursor.background !== 'object') {
          fail(label + '的背景引用链没有有效的背景所有者。');
        }
      });
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function buildBackgroundSet(raw) {
    const set = model.createBackgroundSet(raw.name, raw.color);
    set.id = raw.id;
    set.images = (raw.images || []).map(function (rawImage) {
      const image = model.createBackgroundImage(rawImage.assetId, rawImage.fit);
      image.id = rawImage.id;
      image.x = Number(rawImage.x) || 0;
      image.y = Number(rawImage.y) || 0;
      image.width = Number(rawImage.width) || 0;
      image.height = Number(rawImage.height) || 0;
      image.rotation = Number(rawImage.rotation) || 0;
      image.keepRatio = rawImage.keepRatio !== false;
      image.opacity = rawImage.opacity == null ? 1 : rawImage.opacity;
      image.blur = Number(rawImage.blur) || 0;
      return image;
    });
    return set;
  }

  function ownerPage(rawPage, rawById) {
    const seen = new Set([rawPage.id]);
    let cursor = rawPage;
    while (cursor && cursor.backgroundRef) {
      if (seen.has(cursor.backgroundRef)) throw new Error('背景引用形成循环');
      seen.add(cursor.backgroundRef);
      cursor = rawById.get(cursor.backgroundRef);
    }
    if (!cursor || !cursor.background) throw new Error('背景引用缺少有效的所有者');
    return cursor;
  }

  function migrateLegacyBackgrounds(project, raw, isV1) {
    const rawById = new Map();
    raw.pages.forEach(function (page) { rawById.set(page.id, page); });
    const groups = new Map();
    project.pages.forEach(function (page, index) {
      const rawPage = raw.pages[index];
      const owner = isV1 ? rawPage : ownerPage(rawPage, rawById);
      let set = groups.get(owner.id);
      if (!set) {
        set = model.createBackgroundSet('背景 ' + (groups.size + 1));
        const source = owner.background || {};
        set.color = source.color || model.DEFAULT_BACKGROUND_COLOR;
        if (source.assetId) {
          const image = model.createBackgroundImage(source.assetId, source.fit || 'cover');
          image.opacity = source.opacity == null ? 1 : source.opacity;
          image.blur = source.blur == null ? 0 : source.blur;
          set.images.push(image);
        }
        groups.set(owner.id, set);
        project.backgrounds.push(set);
      }
      page.backgroundId = set.id;
    });
    if (project.backgrounds.length === 0) {
      project.backgrounds.push(model.createBackgroundSet('背景 1'));
    }
    if (!isV1 && groups.size === 1) {
      project.unifiedBackground = true;
      project.unifiedBackgroundId = project.backgrounds[0].id;
    }
    if (!project.pages.some(function (page) { return page.backgroundId; })) {
      project.pages.forEach(function (page) { page.backgroundId = project.backgrounds[0].id; });
    }
  }

  function loadImageFromBlob(blob) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = function () {
        resolve({ img: img, url: url });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片无法解码'));
      };
      img.src = url;
    });
  }

  async function buildProject(raw) {
    const tempBlobs = new Map();
    const tempMeta = new Map();
    const tempUrls = new Map();
    const tempImages = new Map();
    const tempPending = new Map();
    const tempUrlsToRevoke = [];

    try {
      for (const asset of raw.assets) {
        let blob;
        try {
          blob = model.base64ToBlob(asset.data, asset.mime);
        } catch (err) {
          throw new Error('图片资产“' + asset.id + '”损坏：' + err.message);
        }
        const decoded = await loadImageFromBlob(blob);
        tempBlobs.set(asset.id, blob);
        tempMeta.set(asset.id, {
          id: asset.id,
          name: asset.name || 'image',
          mime: asset.mime || blob.type || 'image/png'
        });
        tempUrls.set(asset.id, decoded.url);
        tempImages.set(asset.id, decoded.img);
        tempUrlsToRevoke.push(decoded.url);
      }
    } catch (err) {
      tempUrlsToRevoke.forEach(function (url) { URL.revokeObjectURL(url); });
      throw err;
    }

    const isV1 = raw.version === 1;
    const isV3 = raw.version === 3;
    const project = {
      version: 3,
      pageSize: { width: raw.pageSize.width, height: raw.pageSize.height },
      margins: {
        top: raw.margins.top,
        right: raw.margins.right,
        bottom: raw.margins.bottom,
        left: raw.margins.left
      },
      playlist: {
        categories: raw.playlist.categories.map(function (category) {
          return { name: category.name, songs: category.songs.slice() };
        })
      },
      assets: raw.assets.map(function (asset) {
        return { id: asset.id, name: asset.name || 'image', mime: asset.mime || 'image/png' };
      }),
      backgrounds: [],
      unifiedBackground: false,
      unifiedBackgroundId: null,
      pages: raw.pages.map(function (page) {
        return {
          id: page.id,
          backgroundId: null,
          elements: page.elements.map(function (element) {
            if (element.type === 'category') {
              return {
                id: element.id,
                type: 'category',
                category: element.category,
                showTitle: element.showTitle !== false,
                x: element.x,
                y: element.y,
                width: element.width,
                titleStyle: loadStyle(element.titleStyle),
                songStyle: loadStyle(element.songStyle),
                tables: element.tables.map(function (table) {
                  return {
                    columns: table.columns,
                    rows: table.rows,
                    fill: table.fill,
                    align: table.align,
                    widthMode: table.widthMode,
                    widths: Array.isArray(table.widths) ? table.widths.slice() : [],
                    margins: model.normalizeMargins(table.margins)
                  };
                })
              };
            }
            if (element.type === 'text') {
              return {
                id: element.id,
                type: 'text',
                x: element.x,
                y: element.y,
                width: element.width,
                text: element.text,
                style: loadStyle(element.style)
              };
            }
            if (!isV1) {
              return {
                id: element.id,
                type: 'image',
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
                assetId: element.assetId,
                keepRatio: element.keepRatio !== false,
                rotation: isFiniteNumber(element.rotation) ? element.rotation : 0,
                opacity: element.opacity,
                blur: isFiniteNumber(element.blur) ? element.blur : 0
              };
            }
            const decoded = tempImages.get(element.assetId);
            const natural = decoded
              ? { width: decoded.naturalWidth || decoded.width, height: decoded.naturalHeight || decoded.height }
              : null;
            const rect = model.migrateImageRect(element.fit, {
              x: element.x,
              y: element.y,
              width: element.width,
              height: element.height
            }, natural);
            return {
              id: element.id,
              type: 'image',
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              assetId: element.assetId,
              keepRatio: rect.keepRatio,
              rotation: 0,
              opacity: element.opacity,
              blur: 0
            };
          })
        };
      })
    };

    if (isV3) {
      project.backgrounds = raw.backgrounds.map(buildBackgroundSet);
      project.unifiedBackground = !!raw.unifiedBackground;
      project.unifiedBackgroundId = raw.unifiedBackgroundId || null;
      project.pages.forEach(function (page, index) {
        page.backgroundId = raw.pages[index].backgroundId;
      });
    } else {
      migrateLegacyBackgrounds(project, raw, isV1);
    }

    return {
      project: project,
      assets: {
        blobs: tempBlobs,
        meta: tempMeta,
        urls: tempUrls,
        images: tempImages,
        pending: tempPending
      }
    };
  }

  async function loadProjectFile(file) {
    let raw;
    try {
      const text = await file.text();
      raw = JSON.parse(text);
    } catch (err) {
      return { ok: false, error: '项目文件不是合法 JSON：' + err.message };
    }
    const validation = validateProject(raw);
    if (!validation.ok) {
      return { ok: false, error: validation.errors.join('\n'), errors: validation.errors };
    }
    try {
      const built = await buildProject(raw);
      return { ok: true, project: built.project, assets: built.assets };
    } catch (err) {
      return { ok: false, error: '项目加载失败：' + err.message };
    }
  }

  function installAssets(store) {
    L.assets.clear();
    L.assets.blobs = store.blobs;
    L.assets.meta = store.meta;
    L.assets.urls = store.urls;
    L.assets.images = store.images;
    L.assets.pending = store.pending;
  }

  L.io = {
    DRAFT_KEY: DRAFT_KEY,
    DRAFT_CORRUPT_KEY: DRAFT_CORRUPT_KEY,
    DRAFT_SCHEMA: DRAFT_SCHEMA,
    collectReferencedAssetIds: collectReferencedAssetIds,
    serializeProjectStructure: serializeProjectStructure,
    serializeProject: serializeProject,
    downloadProject: downloadProject,
    validateProject: validateProject,
    loadProjectFile: loadProjectFile,
    installAssets: installAssets,
    openDraftDb: openDraftDb,
    draftAssetGet: draftAssetGet,
    draftAssetGetAll: draftAssetGetAll,
    draftAssetKeys: draftAssetKeys,
    persistDraftAsset: persistDraftAsset,
    persistAssetStore: persistAssetStore,
    ensureDraftAssets: ensureDraftAssets,
    pruneDraftAssets: pruneDraftAssets,
    createDraftEnvelope: createDraftEnvelope,
    writeDraftEnvelope: writeDraftEnvelope,
    restoreDraft: restoreDraft,
    clearDraft: clearDraft
  };
})();
