(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  // 资产缓存与二进制工具：只依赖浏览器全局（crypto / URL / Image / FileReader / Blob），
  // 不引用 L.model 或其他模块，可在 model 之前加载。

  // SVG 内容边界一旦需要裁剪，就先把可见内容烘焙成位图：
  // Chromium 对无 width/height 的 SVG 使用 9 参数 drawImage 取样时结果不可靠，
  // 而位图源的 drawImage 行为稳定。最多放大 4 倍，避免小图标导出时糊掉。
  const SVG_RASTER_MAX_SCALE = 4;
  const SVG_RASTER_MAX_DIM = 4096;
  const SVG_RASTER_MAX_PIXELS = 8 * 1024 * 1024;

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
      const blob = this.blobs.get(id);
      const meta = this.meta.get(id);
      const promise = new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () {
          svgBlobSize(blob, meta && meta.name).then(function (info) {
            const raster = info ? rasterizeSvg(img, info) : null;
            if (raster) {
              setImageSize(raster.canvas, raster.natural, raster.source);
              self.images.set(id, raster.canvas);
              resolve(raster.canvas);
              return;
            }
            if (info) {
              const metrics = svgImageMetrics(info, img);
              if (metrics) setImageSize(img, metrics.natural, metrics.source);
            }
            self.images.set(id, img);
            resolve(img);
          });
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

  /* ---------- svg intrinsic size ---------- */
  // 无 width/height 的 SVG 在浏览器里会得到 300×150 的默认替换元素框，
  // naturalWidth/naturalHeight 因而不是真实设计尺寸。这里只解析根 <svg>
  // 的 width/height/viewBox，失败时回退浏览器解码尺寸。
  const SVG_UNITS = {
    '': 1,
    px: 1,
    pt: 96 / 72,
    pc: 16,
    mm: 96 / 25.4,
    cm: 96 / 2.54,
    in: 96,
    q: 96 / 101.6
  };

  function svgLengthPx(value) {
    if (typeof value !== 'string') return null;
    const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([a-zA-Z%]*)\s*$/.exec(value);
    if (!match) return null;
    const unit = match[2].toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SVG_UNITS, unit)) return null;
    const px = Number(match[1]) * SVG_UNITS[unit];
    return Number.isFinite(px) && px > 0 ? px : null;
  }

  function svgRootTag(text) {
    if (typeof text !== 'string') return null;
    const cleaned = text.replace(/<!--[\s\S]*?-->/g, '');
    const match = /<svg\b/i.exec(cleaned);
    if (!match) return null;
    let quote = null;
    for (let i = match.index + match[0].length; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        return cleaned.slice(match.index, i + 1);
      }
    }
    return null;
  }

  function svgAttributes(tag) {
    const attrs = {};
    if (!tag) return attrs;
    const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match;
    while ((match = pattern.exec(tag))) {
      const name = match[1];
      const value = match[2] !== undefined ? match[2] : match[3];
      attrs[name] = value;
      const lower = name.toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(attrs, lower)) attrs[lower] = value;
    }
    return attrs;
  }

  function svgAttr(attrs, name) {
    if (Object.prototype.hasOwnProperty.call(attrs, name)) return attrs[name];
    return Object.prototype.hasOwnProperty.call(attrs, name.toLowerCase())
      ? attrs[name.toLowerCase()]
      : null;
  }

  function svgViewBox(value) {
    if (typeof value !== 'string') return null;
    const parts = value.trim().split(/[\s,]+/);
    if (parts.length !== 4) return null;
    const numbers = parts.map(Number);
    for (let i = 0; i < numbers.length; i += 1) {
      if (!Number.isFinite(numbers[i])) return null;
    }
    if (!(numbers[2] > 0) || !(numbers[3] > 0)) return null;
    return { x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] };
  }

  function svgIntrinsicSize(text) {
    const tag = svgRootTag(text);
    if (!tag) return null;
    const attrs = svgAttributes(tag);
    const width = svgLengthPx(svgAttr(attrs, 'width'));
    const height = svgLengthPx(svgAttr(attrs, 'height'));
    if (width && height) return { width: width, height: height };
    const box = svgViewBox(svgAttr(attrs, 'viewBox'));
    if (!box) return null;
    if (width) return { width: width, height: width * box.height / box.width };
    if (height) return { width: height * box.width / box.height, height: height };
    return { width: box.width, height: box.height };
  }

  // 浏览器解码 SVG 时会按 viewBox 建立视口；如果图形只占视口一角，直接使用
  // viewBox 尺寸会把大量空白也当成图片内容。这里借助 SVG DOM 的 getBBox()
  // 取实际绘制范围；getBBox() 不包含描边宽度，因此按最大 stroke-width 外扩。
  async function svgContentBox(text) {
    if (typeof DOMParser === 'undefined' || typeof document === 'undefined' || !document.body) {
      return null;
    }
    let host = null;
    try {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const root = doc && doc.documentElement;
      if (!root || String(root.nodeName).toLowerCase() !== 'svg') return null;
      if (doc.getElementsByTagName('parsererror').length) return null;

      host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText =
        'position:absolute;left:-99999px;top:0;width:1px;height:1px;' +
        'overflow:hidden;visibility:hidden;pointer-events:none;';
      const svg = document.importNode(root, true);
      host.appendChild(svg);
      document.body.appendChild(host);

      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (err) { /* 字体失败时仍用回退度量 */ }
      }

      const box = svg.getBBox();
      if (!box || !(box.width > 0) || !(box.height > 0)) return null;
      let x = box.x;
      let y = box.y;
      let width = box.width;
      let height = box.height;

      let pad = 0;
      const nodes = svg.querySelectorAll('*');
      for (let i = 0; i < nodes.length; i += 1) {
        const style = window.getComputedStyle ? window.getComputedStyle(nodes[i]) : null;
        if (!style || !style.stroke || style.stroke === 'none') continue;
        const strokeWidth = parseFloat(style.strokeWidth);
        if (Number.isFinite(strokeWidth) && strokeWidth > 0) {
          pad = Math.max(pad, strokeWidth / 2);
        }
      }
      if (pad > 0) {
        x -= pad;
        y -= pad;
        width += pad * 2;
        height += pad * 2;
      }

      // SVG 视口会裁掉 viewBox 之外的内容；裁剪后的内容边界也不应越出 viewBox。
      const attrs = svgAttributes(svgRootTag(text));
      const viewBox = svgViewBox(svgAttr(attrs, 'viewBox'));
      if (viewBox) {
        const right = Math.min(x + width, viewBox.x + viewBox.width);
        const bottom = Math.min(y + height, viewBox.y + viewBox.height);
        x = Math.max(x, viewBox.x);
        y = Math.max(y, viewBox.y);
        width = Math.max(0, right - x);
        height = Math.max(0, bottom - y);
      }
      if (!(width > 0) || !(height > 0)) return null;

      // 内容几乎铺满 viewBox 时不裁剪，避免浮点误差改变原本正确的尺寸。
      if (viewBox &&
          width >= viewBox.width * 0.99 &&
          height >= viewBox.height * 0.99) {
        return null;
      }
      return { x: x, y: y, width: width, height: height };
    } catch (err) {
      return null;
    } finally {
      if (host && host.parentNode) host.parentNode.removeChild(host);
    }
  }

  // 把 viewBox 用户坐标映射到 <img> 的实际像素坐标，遵循 preserveAspectRatio。
  function svgViewportMap(viewBox, width, height, preserveAspectRatio) {
    const vb = viewBox && viewBox.width > 0 && viewBox.height > 0
      ? viewBox
      : { x: 0, y: 0, width: width, height: height };
    const text = String(preserveAspectRatio || 'xMidYMid meet').trim();
    const parts = text.split(/\s+/);
    const align = parts[0] || 'xMidYMid';
    const mode = parts[1] || 'meet';
    if (align === 'none') {
      return {
        scaleX: width / vb.width,
        scaleY: height / vb.height,
        offsetX: 0,
        offsetY: 0
      };
    }
    const scaleX = width / vb.width;
    const scaleY = height / vb.height;
    const scale = mode === 'slice' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    const offsetX = align.indexOf('xMid') === 0
      ? (width - vb.width * scale) / 2
      : (align.indexOf('xMax') === 0 ? width - vb.width * scale : 0);
    const offsetY = align.indexOf('YMid') >= 0
      ? (height - vb.height * scale) / 2
      : (align.indexOf('YMax') >= 0 ? height - vb.height * scale : 0);
    return { scaleX: scale, scaleY: scale, offsetX: offsetX, offsetY: offsetY };
  }

  // 根据 SVG 元数据和 <img> 解码尺寸，算出逻辑原图尺寸与真实像素取样框。
  // 逻辑尺寸用于布局/裁剪；取样框把逻辑坐标换算到 <img> 的实际像素坐标。
  function svgImageMetrics(info, img) {
    if (!info || !img) return null;
    const width = Number(info.width);
    const height = Number(info.height);
    if (!(width > 0) || !(height > 0)) return null;
    const pixelWidth = img.naturalWidth || img.width || 0;
    const pixelHeight = img.naturalHeight || img.height || 0;
    const intrinsic = { width: width, height: height };
    const fullSource = { x: 0, y: 0, width: pixelWidth, height: pixelHeight };
    const content = info.content;
    if (!content || !(content.width > 0) || !(content.height > 0) ||
        !(pixelWidth > 0) || !(pixelHeight > 0)) {
      return { natural: intrinsic, source: fullSource };
    }
    const viewBox = info.viewBox || { x: 0, y: 0, width: width, height: height };
    const map = svgViewportMap(viewBox, pixelWidth, pixelHeight, info.preserveAspectRatio);
    const source = {
      x: map.offsetX + (content.x - viewBox.x) * map.scaleX,
      y: map.offsetY + (content.y - viewBox.y) * map.scaleY,
      width: content.width * map.scaleX,
      height: content.height * map.scaleY
    };
    if (!(source.width > 0) || !(source.height > 0)) {
      return { natural: intrinsic, source: fullSource };
    }
    return { natural: { width: content.width, height: content.height }, source: source };
  }

  // 把 SVG 的实际绘制范围烘焙成位图，返回可直接用于 drawImage 的画布。
  // 逻辑尺寸仍是内容边界（viewBox 用户单位），画布只是取样源。
  function rasterizeSvg(img, info) {
    if (!img || !info) return null;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const viewBox = info.viewBox ||
      (info.width > 0 && info.height > 0
        ? { x: 0, y: 0, width: info.width, height: info.height }
        : null);
    // 内容几乎铺满 viewBox 时没有 content，但仍必须走栅格化：
    // Chromium 对 SVG <img> 的 9 参数 drawImage 会按目标尺寸解释源矩形，
    // 直接绘制会被放大并只显示左上角一块。
    const content = info.content || viewBox;
    if (!content || !viewBox ||
        !(content.width > 0) || !(content.height > 0) ||
        !(viewBox.width > 0) || !(viewBox.height > 0)) {
      return null;
    }
    const pixelWidth = img.naturalWidth || img.width || 0;
    const pixelHeight = img.naturalHeight || img.height || 0;
    if (!(pixelWidth > 0) || !(pixelHeight > 0)) return null;
    const map = svgViewportMap(viewBox, pixelWidth, pixelHeight, info.preserveAspectRatio);
    if (!(map.scaleX > 0) || !(map.scaleY > 0)) return null;

    const maxSide = Math.max(content.width, content.height);
    const scale = Math.min(
      SVG_RASTER_MAX_SCALE,
      SVG_RASTER_MAX_DIM / maxSide,
      Math.sqrt(SVG_RASTER_MAX_PIXELS / (content.width * content.height))
    );
    if (!(scale > 0) || !Number.isFinite(scale)) return null;
    const width = Math.max(1, Math.round(content.width * scale));
    const height = Math.max(1, Math.round(content.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // 把 viewBox 用户坐标映射到画布：先还原 <img> 的 letterbox/slice 区域，
    // 再用统一缩放把内容边界对齐到画布原点。
    const imageRect = {
      x: viewBox.x - map.offsetX / map.scaleX,
      y: viewBox.y - map.offsetY / map.scaleY,
      width: pixelWidth / map.scaleX,
      height: pixelHeight / map.scaleY
    };
    ctx.setTransform(scale, 0, 0, scale, -content.x * scale, -content.y * scale);
    ctx.drawImage(img, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    return {
      canvas: canvas,
      natural: { width: content.width, height: content.height },
      source: { x: 0, y: 0, width: width, height: height }
    };
  }

  function looksLikeSvg(blob, name) {
    const type = blob && blob.type ? String(blob.type) : '';
    if (/svg/i.test(type)) return true;
    return /\.svg$/i.test(String(name || ''));
  }

  async function svgBlobSize(blob, name) {
    try {
      if (!blob || !looksLikeSvg(blob, name) || typeof blob.text !== 'function') return null;
      const text = await blob.text();
      const intrinsic = svgIntrinsicSize(text);
      if (!intrinsic) return null;
      const attrs = svgAttributes(svgRootTag(text));
      return {
        width: intrinsic.width,
        height: intrinsic.height,
        viewBox: svgViewBox(svgAttr(attrs, 'viewBox')),
        content: await svgContentBox(text),
        preserveAspectRatio: svgAttr(attrs, 'preserveAspectRatio')
      };
    } catch (err) {
      return null;
    }
  }

  function setImageSize(img, size, source) {
    if (!img || !size) return;
    const width = Number(size.width);
    const height = Number(size.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || !(width > 0) || !(height > 0)) return;
    img.__listifyNatural = { width: width, height: height };
    if (source) {
      const x = Number(source.x);
      const y = Number(source.y);
      const sourceWidth = Number(source.width);
      const sourceHeight = Number(source.height);
      if (Number.isFinite(x) && Number.isFinite(y) &&
          Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight) &&
          sourceWidth > 0 && sourceHeight > 0) {
        img.__listifySource = {
          x: x, y: y, width: sourceWidth, height: sourceHeight
        };
      }
    }
  }

  // 逻辑原图坐标（布局/裁剪使用）到 <img> 真实像素取样框的映射。
  // SVG 的逻辑尺寸可能来自 viewBox 或内容边界，与浏览器解码出的像素尺寸不同。
  function imageSource(img) {
    if (!img) return { x: 0, y: 0, width: 0, height: 0 };
    const source = img.__listifySource;
    if (source) {
      const x = Number(source.x);
      const y = Number(source.y);
      const width = Number(source.width);
      const height = Number(source.height);
      if (Number.isFinite(x) && Number.isFinite(y) &&
          Number.isFinite(width) && Number.isFinite(height) &&
          width > 0 && height > 0) {
        return { x: x, y: y, width: width, height: height };
      }
    }
    return {
      x: 0,
      y: 0,
      width: img.naturalWidth || img.width || 0,
      height: img.naturalHeight || img.height || 0
    };
  }

  function imageSourceRect(img, crop) {
    const natural = imageSize(img);
    const source = imageSource(img);
    if (!(natural.width > 0) || !(natural.height > 0) ||
        !(source.width > 0) || !(source.height > 0)) {
      return source;
    }
    const values = crop || {};
    const left = Math.max(0, Number(values.left) || 0);
    const top = Math.max(0, Number(values.top) || 0);
    const right = Math.max(0, Number(values.right) || 0);
    const bottom = Math.max(0, Number(values.bottom) || 0);
    const scaleX = source.width / natural.width;
    const scaleY = source.height / natural.height;
    return {
      x: source.x + left * scaleX,
      y: source.y + top * scaleY,
      width: Math.max(0, (natural.width - left - right) * scaleX),
      height: Math.max(0, (natural.height - top - bottom) * scaleY)
    };
  }

  function imageSize(img) {
    if (!img) return { width: 0, height: 0 };
    const override = img.__listifyNatural;
    if (override) {
      const width = Number(override.width);
      const height = Number(override.height);
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return { width: width, height: height };
      }
    }
    return {
      width: img.naturalWidth || img.width || 0,
      height: img.naturalHeight || img.height || 0
    };
  }

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

  // 二进制辅助函数挂在缓存对象上，调用方统一走 L.assets.*
  assets.hashBytes = hashBytes;
  assets.blobToBase64 = blobToBase64;
  assets.base64ToBlob = base64ToBlob;
  assets.downloadBlob = downloadBlob;
  assets.svgIntrinsicSize = svgIntrinsicSize;
  assets.svgContentBox = svgContentBox;
  assets.svgBlobSize = svgBlobSize;
  assets.svgViewportMap = svgViewportMap;
  assets.svgImageMetrics = svgImageMetrics;
  assets.rasterizeSvg = rasterizeSvg;
  assets.setImageSize = setImageSize;
  assets.imageSize = imageSize;
  assets.imageSource = imageSource;
  assets.imageSourceRect = imageSourceRect;

  L.assets = assets;
})();
