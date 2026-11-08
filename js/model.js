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
  const BACKGROUND_FITS = ['original', 'fill-width', 'fill-height', 'cover', 'none'];
  const DEFAULT_BACKGROUND_COLOR = '#ffffff';
  const DEFAULT_BACKGROUND_IMAGE = {
    assetId: null,
    fit: 'cover',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    keepRatio: true,
    opacity: 1,
    blur: 0
  };
  const DEFAULT_TABLE_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 };

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

  function createBackgroundImage(assetId, fit) {
    const mode = BACKGROUND_FITS.indexOf(fit) >= 0 ? fit : 'cover';
    return Object.assign({}, DEFAULT_BACKGROUND_IMAGE, {
      id: uid('bgimg'),
      assetId: assetId || null,
      fit: mode
    });
  }

  function createBackgroundSet(name, color) {
    return {
      id: uid('bg'),
      name: name || '背景',
      color: color || DEFAULT_BACKGROUND_COLOR,
      images: []
    };
  }

  function cloneBackgroundImage(image) {
    return Object.assign({}, DEFAULT_BACKGROUND_IMAGE, image, { id: uid('bgimg') });
  }

  function cloneBackgroundSet(set) {
    return {
      id: uid('bg'),
      name: set && set.name ? set.name : '背景',
      color: set && set.color ? set.color : DEFAULT_BACKGROUND_COLOR,
      images: (set && Array.isArray(set.images) ? set.images : []).map(cloneBackgroundImage)
    };
  }

  function createPage(backgroundId) {
    return {
      id: uid('page'),
      backgroundId: backgroundId || null,
      elements: []
    };
  }

  function findBackground(project, id) {
    if (!project || !id) return null;
    return project.backgrounds.find(function (item) { return item.id === id; }) || null;
  }

  function effectiveBackground(project, page) {
    if (!project) return null;
    if (project.unifiedBackground) {
      const unified = findBackground(project, project.unifiedBackgroundId);
      if (unified) return unified;
    }
    if (!page) return null;
    return findBackground(project, page.backgroundId);
  }

  function backgroundReferenceCount(project, setId) {
    if (!project) return 0;
    return project.pages.filter(function (page) { return page.backgroundId === setId; }).length;
  }

  function canDeleteBackground(project, setId) {
    if (!project) return { ok: false, reason: '项目不存在。' };
    if (project.backgrounds.length <= 1) {
      return { ok: false, reason: '项目至少需要保留一个背景。' };
    }
    const references = backgroundReferenceCount(project, setId);
    if (references > 0) {
      return { ok: false, reason: '有 ' + references + ' 个页面正在使用该背景，请先改派。' };
    }
    if (project.unifiedBackground && project.unifiedBackgroundId === setId) {
      return { ok: false, reason: '该背景正在作为全局背景使用，请先更换或关闭全局背景。' };
    }
    return { ok: true, reason: '' };
  }

  function resolveBackgroundOwner(project, page) {
    if (!project || !page) return null;
    let cursor = page;
    const seen = new Set();
    while (cursor) {
      if (!cursor.backgroundRef) return cursor;
      if (seen.has(cursor.id) || seen.has(cursor.backgroundRef)) return null;
      seen.add(cursor.id);
      cursor = project.pages.find(function (item) { return item.id === cursor.backgroundRef; }) || null;
    }
    return null;
  }

  function referencingPages(project, page) {
    if (!project || !page) return [];
    return project.pages.filter(function (item) { return item.backgroundRef === page.id; });
  }

  function createDefaultProject() {
    const background = createBackgroundSet('背景 1', DEFAULT_BACKGROUND_COLOR);
    const project = {
      version: 3,
      pageSize: { width: 1080, height: 1920 },
      margins: { top: 60, right: 60, bottom: 60, left: 60 },
      playlist: { categories: [] },
      assets: [],
      backgrounds: [background],
      unifiedBackground: false,
      unifiedBackgroundId: null,
      pages: []
    };
    project.pages.push(createPage(background.id));
    return project;
  }

  function createTable(overrides) {
    return Object.assign({
      columns: 3,
      rows: 0,
      fill: 'column',
      align: 'left',
      widthMode: 'auto',
      widths: [],
      margins: { top: 0, right: 0, bottom: 0, left: 0 }
    }, overrides || {});
  }

  function normalizeMargins(margins) {
    const source = margins && typeof margins === 'object' ? margins : {};
    function value(key) {
      const number = Number(source[key]);
      return Number.isFinite(number) ? Math.max(0, number) : 0;
    }
    return {
      top: value('top'),
      right: value('right'),
      bottom: value('bottom'),
      left: value('left')
    };
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
      keepRatio: true,
      rotation: 0,
      opacity: 1,
      blur: 0
    };
  }

  function rotationRadians(element) {
    const degrees = Number(element && element.rotation);
    return (Number.isFinite(degrees) ? degrees : 0) * Math.PI / 180;
  }

  function rotateVector(x, y, radians) {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }

  function computeImageResize(start, handle, delta, keepRatio) {
    const width0 = start.width;
    const height0 = start.height;
    const radians = (Number(start.rotation) || 0) * Math.PI / 180;
    const local = rotateVector(delta.x, delta.y, -radians);
    const directionX = handle.indexOf('e') >= 0 ? 1 : (handle.indexOf('w') >= 0 ? -1 : 0);
    const directionY = handle.indexOf('s') >= 0 ? 1 : (handle.indexOf('n') >= 0 ? -1 : 0);
    let width = width0;
    let height = height0;

    if (keepRatio) {
      if (directionX && directionY) {
        const diagonal = width0 * width0 + height0 * height0;
        const projected = (width0 * directionX + local.x) * width0 * directionX +
          (height0 * directionY + local.y) * height0 * directionY;
        let scale = diagonal > 0 ? projected / diagonal : 1;
        scale = Math.max(scale, 40 / width0, 40 / height0);
        width = width0 * scale;
        height = height0 * scale;
      } else if (directionX) {
        width = Math.max(40, width0 + directionX * local.x);
        height = width0 > 0 ? width * (height0 / width0) : height0;
        if (height < 40) {
          height = 40;
          width = height0 > 0 ? height * (width0 / height0) : width;
        }
      } else if (directionY) {
        height = Math.max(40, height0 + directionY * local.y);
        width = height0 > 0 ? height * (width0 / height0) : width0;
        if (width < 40) {
          width = 40;
          height = width0 > 0 ? width * (height0 / width0) : height;
        }
      }
    } else {
      if (directionX) width = Math.max(40, width0 + directionX * local.x);
      if (directionY) height = Math.max(40, height0 + directionY * local.y);
    }

    const anchorX = -directionX;
    const anchorY = -directionY;
    const centerX = start.x + width0 / 2;
    const centerY = start.y + height0 / 2;
    const anchorOffset = rotateVector(anchorX * width0 / 2, anchorY * height0 / 2, radians);
    const anchorPageX = centerX + anchorOffset.x;
    const anchorPageY = centerY + anchorOffset.y;
    const nextAnchorOffset = rotateVector(anchorX * width / 2, anchorY * height / 2, radians);

    return {
      x: anchorPageX - nextAnchorOffset.x - width / 2,
      y: anchorPageY - nextAnchorOffset.y - height / 2,
      width: width,
      height: height
    };
  }

  function migrateImageRect(fit, rect, natural) {
    if (fit === 'stretch' || !natural || !natural.width || !natural.height) {
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        keepRatio: fit !== 'stretch'
      };
    }
    const scale = fit === 'contain'
      ? Math.min(rect.width / natural.width, rect.height / natural.height)
      : Math.max(rect.width / natural.width, rect.height / natural.height);
    const width = Math.max(1, natural.width * scale);
    const height = Math.max(1, natural.height * scale);
    return {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y + (rect.height - height) / 2,
      width: width,
      height: height,
      keepRatio: true
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
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  L.model = {
    DEFAULT_FONT: DEFAULT_FONT,
    DEFAULT_TITLE_STYLE: DEFAULT_TITLE_STYLE,
    DEFAULT_SONG_STYLE: DEFAULT_SONG_STYLE,
    DEFAULT_TEXT_STYLE: DEFAULT_TEXT_STYLE,
    BACKGROUND_FITS: BACKGROUND_FITS,
    DEFAULT_BACKGROUND_COLOR: DEFAULT_BACKGROUND_COLOR,
    DEFAULT_BACKGROUND_IMAGE: DEFAULT_BACKGROUND_IMAGE,
    DEFAULT_TABLE_MARGINS: DEFAULT_TABLE_MARGINS,
    uid: uid,
    clamp: clamp,
    clone: clone,
    copyStyle: copyStyle,
    createBackgroundImage: createBackgroundImage,
    createBackgroundSet: createBackgroundSet,
    cloneBackgroundImage: cloneBackgroundImage,
    cloneBackgroundSet: cloneBackgroundSet,
    createPage: createPage,
    findBackground: findBackground,
    effectiveBackground: effectiveBackground,
    backgroundReferenceCount: backgroundReferenceCount,
    canDeleteBackground: canDeleteBackground,
    resolveBackgroundOwner: resolveBackgroundOwner,
    referencingPages: referencingPages,
    createDefaultProject: createDefaultProject,
    createTable: createTable,
    normalizeMargins: normalizeMargins,
    createCategoryElement: createCategoryElement,
    createTextElement: createTextElement,
    createImageElement: createImageElement,
    rotationRadians: rotationRadians,
    rotateVector: rotateVector,
    computeImageResize: computeImageResize,
    migrateImageRect: migrateImageRect,
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
