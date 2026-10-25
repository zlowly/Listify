(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const DEFAULT_FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Segoe UI", sans-serif';
  const DEFAULT_TITLE_STYLE = {
    fontFamily: DEFAULT_FONT,
    fontSize: 44,
    fontWeight: 700,
    color: '#1f2937',
    lineHeight: 1.2
  };
  const DEFAULT_SONG_STYLE = {
    fontFamily: DEFAULT_FONT,
    fontSize: 28,
    fontWeight: 400,
    color: '#374151',
    lineHeight: 1.35
  };
  const DEFAULT_TEXT_STYLE = {
    fontFamily: DEFAULT_FONT,
    fontSize: 48,
    fontWeight: 700,
    color: '#111827',
    lineHeight: 1.3,
    align: 'left'
  };
  const DEFAULT_BACKGROUND = {
    assetId: null,
    fit: 'cover',
    opacity: 1,
    blur: 0,
    color: '#ffffff'
  };

  let seq = 0;
  function uid(prefix) {
    seq += 1;
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + seq;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function copyStyle(style, overrides) {
    return Object.assign({}, style, overrides || {});
  }

  function createBackground(overrides) {
    return Object.assign({}, DEFAULT_BACKGROUND, overrides || {});
  }

  function createPage(background) {
    return {
      id: uid('page'),
      background: createBackground(background),
      elements: []
    };
  }

  function createDefaultProject() {
    const project = {
      version: 1,
      pageSize: { width: 1080, height: 1920 },
      margins: { top: 60, right: 60, bottom: 60, left: 60 },
      playlist: { categories: [] },
      assets: [],
      pages: []
    };
    project.pages.push(createPage());
    return project;
  }

  function createTable(overrides) {
    return Object.assign({
      columns: 3,
      rows: 0,
      fill: 'column',
      align: 'left',
      widthMode: 'auto',
      widths: []
    }, overrides || {});
  }

  function createCategoryElement(categoryName, x, y, project, width) {
    const fallbackWidth = project.pageSize.width - project.margins.left - project.margins.right;
    return {
      id: uid('el'),
      type: 'category',
      category: categoryName,
      x: typeof x === 'number' ? x : project.margins.left,
      y: typeof y === 'number' ? y : project.margins.top,
      width: typeof width === 'number' ? width : fallbackWidth,
      titleStyle: copyStyle(DEFAULT_TITLE_STYLE),
      songStyle: copyStyle(DEFAULT_SONG_STYLE),
      tables: [createTable()]
    };
  }

  function createTextElement(project, text) {
    return {
      id: uid('el'),
      type: 'text',
      x: Math.round(project.pageSize.width / 2 - 240),
      y: Math.round(project.pageSize.height / 2 - 60),
      width: 480,
      text: typeof text === 'string' ? text : '双击编辑文字',
      style: copyStyle(DEFAULT_TEXT_STYLE)
    };
  }

  function createImageElement(project, assetId, width, height) {
    const w = typeof width === 'number' ? width : 400;
    const h = typeof height === 'number' ? height : 300;
    return {
      id: uid('el'),
      type: 'image',
      x: Math.round(project.pageSize.width / 2 - w / 2),
      y: Math.round(project.pageSize.height / 2 - h / 2),
      width: w,
      height: h,
      assetId: assetId || null,
      fit: 'cover',
      opacity: 1
    };
  }

  function getPage(project, pageId) {
    return project.pages.find(function (page) { return page.id === pageId; }) || null;
  }

  function getCategory(project, name) {
    return project.playlist.categories.find(function (category) { return category.name === name; }) || null;
  }

  function getPlacedBlock(project, categoryName) {
    for (let pageIndex = 0; pageIndex < project.pages.length; pageIndex += 1) {
      const page = project.pages[pageIndex];
      for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex += 1) {
        const element = page.elements[elementIndex];
        if (element.type === 'category' && element.category === categoryName) {
          return { page: page, pageIndex: pageIndex, element: element, elementIndex: elementIndex };
        }
      }
    }
    return null;
  }

  function allCategoryBlocks(project) {
    const result = [];
    project.pages.forEach(function (page, pageIndex) {
      page.elements.forEach(function (element, elementIndex) {
        if (element.type === 'category') {
          result.push({ page: page, pageIndex: pageIndex, element: element, elementIndex: elementIndex });
        }
      });
    });
    return result;
  }

  function unplacedCategories(project) {
    return project.playlist.categories.filter(function (category) {
      return !getPlacedBlock(project, category.name);
    });
  }

  function findElement(project, elementId) {
    for (let i = 0; i < project.pages.length; i += 1) {
      const page = project.pages[i];
      const element = page.elements.find(function (item) { return item.id === elementId; });
      if (element) return { page: page, pageIndex: i, element: element };
    }
    return null;
  }

  function ensureAssetMeta(project, id, name, mime) {
    if (!id) return;
    const existing = project.assets.find(function (asset) { return asset.id === id; });
    if (existing) {
      if (!existing.name && name) existing.name = name;
      if (!existing.mime && mime) existing.mime = mime;
      return;
    }
    project.assets.push({ id: id, name: name || 'image', mime: mime || 'image/png' });
  }

  function pageIndexOf(project, pageId) {
    return project.pages.findIndex(function (page) { return page.id === pageId; });
  }

  function isCjkCodePoint(cp) {
    return (
      (cp >= 0x1100 && cp <= 0x11ff) ||
      (cp >= 0x2e80 && cp <= 0x303f) ||
      (cp >= 0x3040 && cp <= 0x30ff) ||
      (cp >= 0x3100 && cp <= 0x312f) ||
      (cp >= 0x3130 && cp <= 0x318f) ||
      (cp >= 0x3190 && cp <= 0x31ff) ||
      (cp >= 0x3200 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xa000 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7af) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd)
    );
  }

  function virtualWidth(text) {
    let width = 0;
    const source = String(text == null ? '' : text);
    for (const char of source) {
      const cp = char.codePointAt(0);
      width += isCjkCodePoint(cp) ? 2 : 1;
    }
    return width;
  }

  /* ---------- image assets ---------- */
  const assets = {
    blobs: new Map(),
    meta: new Map(),
    urls: new Map(),
    images: new Map(),
    pending: new Map(),

    has: function (id) {
      return this.blobs.has(id);
    },

    getMeta: function (id) {
      return this.meta.get(id) || null;
    },

    getBlob: function (id) {
      return this.blobs.get(id) || null;
    },

    getUrl: function (id) {
      return this.urls.get(id) || null;
    },

    getCachedImage: function (id) {
      return this.images.get(id) || null;
    },

    addBlob: function (id, blob, name, mime) {
      if (!id) throw new Error('资产 ID 不能为空');
      if (!this.blobs.has(id)) {
        this.blobs.set(id, blob);
        this.meta.set(id, {
          id: id,
          name: name || 'image',
          mime: mime || blob.type || 'image/png'
        });
        this.urls.set(id, URL.createObjectURL(blob));
      }
      return id;
    },

    addFile: async function (file) {
      const buffer = await file.arrayBuffer();
      const id = await hashBytes(buffer);
      if (!this.blobs.has(id)) {
        const type = file.type || 'application/octet-stream';
        this.addBlob(id, new Blob([buffer], { type: type }), file.name || 'image', type);
      }
      return id;
    },

    addFromBase64: function (id, name, mime, base64) {
      const blob = base64ToBlob(base64, mime || 'image/png');
      this.addBlob(id, blob, name, mime);
      return id;
    },

    loadImage: function (id) {
      const self = this;
      if (this.images.has(id)) return Promise.resolve(this.images.get(id));
      if (this.pending.has(id)) return this.pending.get(id);
      const url = this.urls.get(id);
      if (!url) return Promise.reject(new Error('资产不存在：' + id));
      const promise = new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () {
          self.images.set(id, img);
          resolve(img);
        };
        img.onerror = function () {
          reject(new Error('图片无法解码：' + id));
        };
        img.src = url;
      });
      this.pending.set(id, promise);
      return promise.finally(function () {
        self.pending.delete(id);
      });
    },

    remove: function (id) {
      const url = this.urls.get(id);
      if (url) URL.revokeObjectURL(url);
      this.urls.delete(id);
      this.images.delete(id);
      this.pending.delete(id);
      this.meta.delete(id);
      this.blobs.delete(id);
    },

    clear: function () {
      const self = this;
      this.urls.forEach(function (url) { URL.revokeObjectURL(url); });
      this.blobs.clear();
      this.meta.clear();
      this.urls.clear();
      this.images.clear();
      this.pending.clear();
      return self;
    },

    list: function () {
      const self = this;
      return Array.from(this.blobs.keys()).map(function (id) {
        return Object.assign({ id: id }, self.meta.get(id) || {});
      });
    }
  };

  /* ---------- hashing / base64 ---------- */
  async function hashBytes(buffer) {
    const subtle = window.crypto && window.crypto.subtle;
    if (subtle) {
      try {
        const digest = await subtle.digest('SHA-256', buffer);
        const bytes = new Uint8Array(digest);
        let out = '';
        for (let i = 0; i < bytes.length; i += 1) {
          out += bytes[i].toString(16).padStart(2, '0');
        }
        return 'sha-' + out;
      } catch (err) {
        /* file:// can expose crypto but reject digest; fall through */
      }
    }
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = 0xffffffffffffffffn;
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) {
      hash ^= BigInt(bytes[i]);
      hash = (hash * prime) & mask;
    }
    return 'fnv-' + hash.toString(16).padStart(16, '0') + '-' + bytes.length;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () {
        reject(new Error('图片读取失败'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64, mime) {
    const clean = String(base64 || '').replace(/\s+/g, '');
    if (!clean) throw new Error('图片数据为空');
    let binary;
    try {
      binary = atob(clean);
    } catch (err) {
      throw new Error('图片数据不是合法 base64');
    }
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'image/png' });
  }

  function fontString(style) {
    const weight = style && style.fontWeight ? style.fontWeight : 400;
    const size = style && style.fontSize ? style.fontSize : 16;
    const family = style && style.fontFamily ? style.fontFamily : DEFAULT_FONT;
    const italic = style && style.italic ? 'italic ' : '';
    return italic + weight + ' ' + size + 'px ' + family;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  L.model = {
    DEFAULT_FONT: DEFAULT_FONT,
    DEFAULT_TITLE_STYLE: DEFAULT_TITLE_STYLE,
    DEFAULT_SONG_STYLE: DEFAULT_SONG_STYLE,
    DEFAULT_TEXT_STYLE: DEFAULT_TEXT_STYLE,
    DEFAULT_BACKGROUND: DEFAULT_BACKGROUND,
    uid: uid,
    clamp: clamp,
    clone: clone,
    copyStyle: copyStyle,
    createBackground: createBackground,
    createPage: createPage,
    createDefaultProject: createDefaultProject,
    createTable: createTable,
    createCategoryElement: createCategoryElement,
    createTextElement: createTextElement,
    createImageElement: createImageElement,
    getPage: getPage,
    getCategory: getCategory,
    getPlacedBlock: getPlacedBlock,
    allCategoryBlocks: allCategoryBlocks,
    unplacedCategories: unplacedCategories,
    findElement: findElement,
    ensureAssetMeta: ensureAssetMeta,
    pageIndexOf: pageIndexOf,
    virtualWidth: virtualWidth,
    isCjkCodePoint: isCjkCodePoint,
    hashBytes: hashBytes,
    blobToBase64: blobToBase64,
    base64ToBlob: base64ToBlob,
    fontString: fontString,
    downloadBlob: downloadBlob
  };

  L.assets = assets;
})();
