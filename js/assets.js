(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  // 资产缓存与二进制工具：只依赖浏览器全局（crypto / URL / Image / FileReader / Blob），
  // 不引用 L.model 或其他模块，可在 model 之前加载。

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

  L.assets = assets;
})();
