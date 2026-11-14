(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  // 预置数据版本参数：build.sh 构建时把 dev 改写为当前版本号；索引与分类块共用。
  const DATA_VER = '?v=dev';
  const INDEX_SRC = 'js/presets-data/index.js' + DATA_VER;
  const CHUNK_DIR = 'js/presets-data/';

  let indexPromise = null;
  const chunkPromises = Object.create(null);

  function report(message) {
    console.error('[Listify] ' + message);
    if (L.ui && typeof L.ui.toast === 'function') L.ui.toast(message, 'error');
  }

  // 经典 script 注入（file:// 下不能用 fetch/XHR 读本地文件，也不能用 ESM）。
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('script failed: ' + src)); };
      document.head.appendChild(script);
    });
  }

  // 首次调用注入索引脚本；成功 resolve L.PRESETS_INDEX，失败 toast 并允许重试。
  // 重复调用共享同一 in-flight Promise。
  function loadIndex() {
    if (L.PRESETS_INDEX) return Promise.resolve(L.PRESETS_INDEX);
    if (indexPromise) return indexPromise;
    indexPromise = loadScript(INDEX_SRC).then(function () {
      const index = L.PRESETS_INDEX;
      if (!index || !Array.isArray(index.categories) || !Array.isArray(index.items)) {
        throw new Error('preset index missing');
      }
      return index;
    }).catch(function (err) {
      indexPromise = null; // 失败后下次调用重新注入，可重试
      report('预置素材索引加载失败（js/presets-data/index.js），请重试；本地图片仍可使用。');
      throw err;
    });
    return indexPromise;
  }

  // 按分类注入数据块，resolve 该分类的 id -> data URL 映射。
  // 已加载直接返回；并发共享同一 Promise；失败后清空缓存，下次调用重新注入。
  // 注意：这里不 toast，由调用方决定是否提示（预取静默、点击/应用时提示）。
  function loadChunk(catId) {
    const id = String(catId || '');
    if (!id) return Promise.reject(new Error('缺少预置分类 id'));
    if (L.PRESETS_CHUNKS && L.PRESETS_CHUNKS[id]) return Promise.resolve(L.PRESETS_CHUNKS[id]);
    if (chunkPromises[id]) return chunkPromises[id];
    chunkPromises[id] = loadScript(CHUNK_DIR + id + '.js' + DATA_VER).then(function () {
      const chunk = L.PRESETS_CHUNKS && L.PRESETS_CHUNKS[id];
      if (!chunk) throw new Error('preset chunk missing: ' + id);
      delete chunkPromises[id];
      return chunk;
    }).catch(function (err) {
      delete chunkPromises[id]; // 失败后允许重试
      throw new Error('预置分类“' + id + '”数据加载失败');
    });
    return chunkPromises[id];
  }

  // 把索引项补全为可应用的数据：item.data = chunk[item.id]。
  // 已有 data 直接返回；块内缺该 id 视为失败，不返回空数据。
  async function hydrate(item) {
    if (!item) throw new Error('缺少预置素材');
    if (item.data) return item.data;
    let category = item.category;
    if (!category) {
      const index = await loadIndex();
      const found = (index.items || []).find(function (entry) { return entry.id === item.id; });
      category = found && found.category;
    }
    if (!category) throw new Error('预置素材缺少分类信息');
    const chunk = await loadChunk(category);
    const data = chunk[item.id];
    if (!data) throw new Error('预置素材数据缺失：' + (item.name || item.id));
    item.data = data;
    return data;
  }

  L.presets = {
    loadIndex: loadIndex,
    loadChunk: loadChunk,
    hydrate: hydrate
  };
})();
