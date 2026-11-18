(function () {
  'use strict';

  /*
   * 项目 JSON 的序列化、下载与加载（从 io.js 拆出）。
   * 依赖方向：调用时读取 L.model / L.assets / L.projectSchema，不反向依赖上层。
   */

  const L = window.Listify = window.Listify || {};

  function collectReferencedAssetIds(project) {
    const ids = new Set();
    (project.pages || []).forEach(function (page) {
      const background = page && page.background;
      const items = background && (background.items || background.images) || [];
      items.forEach(function (item) {
        if (item && item.kind !== 'shape' && item.assetId) ids.add(item.assetId);
      });
      (page.elements || []).forEach(function (element) {
        if (element.type === 'image' && element.assetId) ids.add(element.assetId);
      });
    });
    return Array.from(ids);
  }

  function serializeStyle(style) {
    const families = Array.isArray(style.fontFamilies)
      ? L.model.normalizeFontFamilies(style.fontFamilies)
      : L.model.fontFamiliesFromFamily(style.fontFamily);
    return {
      fontFamilies: families,
      fontFamily: L.model.fontFamilyFromList(families),
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      lineHeight: style.lineHeight,
      align: style.align,
      shadow: L.model.normalizeShadow(style.shadow),
      outline: L.model.normalizeOutline(style.outline)
    };
  }

  function loadStyle(style) {
    return L.model.normalizeStyle(L.model.copyStyle(style));
  }

  function serializeTable(table) {
    return {
      columns: table.columns,
      rows: table.rows,
      fill: table.fill,
      align: table.align,
      widthMode: table.widthMode,
      widths: Array.isArray(table.widths) ? table.widths.slice() : [],
      margins: L.model.normalizeMargins(table.margins)
    };
  }

  function serializeShape(shape, identity) {
    const fade = L.model.fadeValues(shape);
    return Object.assign({
      id: shape.id,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      rotation: Number(shape.rotation) || 0,
      shape: shape.shape === 'diamond' ? 'diamond' : 'rect',
      mode: shape.mode === 'stroke' ? 'stroke' : 'fill',
      color: shape.color || L.shape.DEFAULT_SHAPE.color,
      radius: Number(shape.radius) || 0,
      strokeWidth: Number(shape.strokeWidth) || 0,
      opacity: shape.opacity == null ? 1 : shape.opacity,
      blur: shape.blur == null ? 0 : shape.blur,
      brightness: shape.brightness == null ? 1 : shape.brightness,
      hue: shape.hue == null ? 0 : shape.hue,
      fadeMode: fade.mode,
      fadeAngle: fade.angle,
      fadePosition: fade.position,
      fadeWidth: fade.width,
      fadeTop: fade.top,
      fadeBottom: fade.bottom
    }, identity);
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
    if (element.type === 'shape') {
      return serializeShape(element, { type: 'shape' });
    }
    const fade = L.model.fadeValues(element);
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
      blur: Number(element.blur) || 0,
      brightness: element.brightness == null ? 1 : element.brightness,
      hue: element.hue == null ? 0 : element.hue,
      fadeMode: fade.mode,
      fadeAngle: fade.angle,
      fadePosition: fade.position,
      fadeWidth: fade.width,
      fadeTop: fade.top,
      fadeBottom: fade.bottom
    };
  }

  function serializeBackgroundImage(image) {
    const fade = L.model.fadeValues(image);
    return {
      id: image.id,
      kind: 'image',
      assetId: image.assetId || null,
      fit: image.fit || 'cover',
      x: Number(image.x) || 0,
      y: Number(image.y) || 0,
      width: Number(image.width) || 0,
      height: Number(image.height) || 0,
      rotation: Number(image.rotation) || 0,
      keepRatio: image.keepRatio !== false,
      opacity: image.opacity == null ? 1 : image.opacity,
      blur: image.blur == null ? 0 : image.blur,
      brightness: image.brightness == null ? 1 : image.brightness,
      hue: image.hue == null ? 0 : image.hue,
      fadeMode: fade.mode,
      fadeAngle: fade.angle,
      fadePosition: fade.position,
      fadeWidth: fade.width,
      fadeTop: fade.top,
      fadeBottom: fade.bottom
    };
  }

  function serializeBackgroundItem(item) {
    if (item.kind === 'shape') return serializeShape(item, { kind: 'shape' });
    return serializeBackgroundImage(item);
  }

  function serializePageBackground(background) {
    const source = background || {};
    const items = source.items || source.images || [];
    return {
      color: source.color || L.model.DEFAULT_BACKGROUND_COLOR,
      items: items.map(serializeBackgroundItem)
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
      version: 5,
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
      globalBackgroundPageId: project.globalBackgroundPageId || null,
      pages: project.pages.map(function (page) {
        return {
          id: page.id,
          background: serializePageBackground(page.background),
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
      asset.data = await L.assets.blobToBase64(blob);
    }
    return structure;
  }

  async function downloadProject(project) {
    const data = await serializeProject(project);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    L.assets.downloadBlob(blob, '歌单项目.json');
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
          blob = L.assets.base64ToBlob(asset.data, asset.mime);
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
    const project = {
      version: 5,
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
      globalBackgroundPageId: null,
      pages: raw.pages.map(function (page) {
        return {
          id: page.id,
          background: null,
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
                    margins: L.model.normalizeMargins(table.margins)
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
            if (element.type === 'shape') {
              const fadeMode = L.model.FADE_MODES.indexOf(element.fadeMode) >= 0 ? element.fadeMode : 'off';
              const fadeDefaults = L.model.fadeDefaults(fadeMode);
              return L.shape.clampShape({
                id: element.id,
                type: 'shape',
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
                rotation: L.projectSchema.isFiniteNumber(element.rotation) ? element.rotation : 0,
                shape: element.shape === 'diamond' ? 'diamond' : 'rect',
                mode: element.mode === 'stroke' ? 'stroke' : 'fill',
                color: typeof element.color === 'string' ? element.color : L.shape.DEFAULT_SHAPE.color,
                radius: L.projectSchema.isFiniteNumber(element.radius) ? element.radius : 0,
                strokeWidth: L.projectSchema.isFiniteNumber(element.strokeWidth)
                  ? element.strokeWidth : L.shape.DEFAULT_SHAPE.strokeWidth,
                opacity: element.opacity == null ? 1 : element.opacity,
                blur: L.projectSchema.isFiniteNumber(element.blur) ? element.blur : 0,
                brightness: L.projectSchema.isFiniteNumber(element.brightness) ? element.brightness : 1,
                hue: L.projectSchema.isFiniteNumber(element.hue) ? element.hue : 0,
                fadeMode: fadeMode,
                fadeAngle: L.projectSchema.isFiniteNumber(element.fadeAngle) ? element.fadeAngle : 0,
                fadePosition: L.projectSchema.isFiniteNumber(element.fadePosition)
                  ? element.fadePosition : fadeDefaults.fadePosition,
                fadeWidth: L.projectSchema.isFiniteNumber(element.fadeWidth)
                  ? element.fadeWidth : fadeDefaults.fadeWidth,
                fadeTop: L.projectSchema.isFiniteNumber(element.fadeTop)
                  ? element.fadeTop : fadeDefaults.fadeTop,
                fadeBottom: L.projectSchema.isFiniteNumber(element.fadeBottom)
                  ? element.fadeBottom : fadeDefaults.fadeBottom
              });
            }
            if (!isV1) {
              const fadeMode = L.model.FADE_MODES.indexOf(element.fadeMode) >= 0 ? element.fadeMode : 'off';
              const fadeDefaults = L.model.fadeDefaults(fadeMode);
              return {
                id: element.id,
                type: 'image',
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
                assetId: element.assetId,
                keepRatio: element.keepRatio !== false,
                rotation: L.projectSchema.isFiniteNumber(element.rotation) ? element.rotation : 0,
                opacity: element.opacity,
                blur: L.projectSchema.isFiniteNumber(element.blur) ? element.blur : 0,
                brightness: L.projectSchema.isFiniteNumber(element.brightness) ? element.brightness : 1,
                hue: L.projectSchema.isFiniteNumber(element.hue) ? element.hue : 0,
                fadeMode: fadeMode,
                fadeAngle: L.projectSchema.isFiniteNumber(element.fadeAngle) ? element.fadeAngle : 0,
                fadePosition: L.projectSchema.isFiniteNumber(element.fadePosition)
                  ? element.fadePosition : fadeDefaults.fadePosition,
                fadeWidth: L.projectSchema.isFiniteNumber(element.fadeWidth)
                  ? element.fadeWidth : fadeDefaults.fadeWidth,
                fadeTop: L.projectSchema.isFiniteNumber(element.fadeTop)
                  ? element.fadeTop : fadeDefaults.fadeTop,
                fadeBottom: L.projectSchema.isFiniteNumber(element.fadeBottom)
                  ? element.fadeBottom : fadeDefaults.fadeBottom
              };
            }
            const decoded = tempImages.get(element.assetId);
            const natural = decoded
              ? { width: decoded.naturalWidth || decoded.width, height: decoded.naturalHeight || decoded.height }
              : null;
            const rect = L.model.migrateImageRect(element.fit, {
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
              blur: 0,
              brightness: 1,
              hue: 0,
              fadeMode: 'off',
              fadeAngle: 0,
              fadePosition: 0,
              fadeWidth: 1,
              fadeTop: 0,
              fadeBottom: 1
            };
          })
        };
      })
    };

    const resolved = L.projectSchema.resolvePageBackgrounds(raw);
    project.pages.forEach(function (page, index) {
      page.background = resolved.backgrounds[index];
    });
    project.globalBackgroundPageId = resolved.globalBackgroundPageId;

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
    const validation = L.projectSchema.validateProject(raw);
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

  L.projectIo = {
    collectReferencedAssetIds: collectReferencedAssetIds,
    serializeProjectStructure: serializeProjectStructure,
    serializeProject: serializeProject,
    downloadProject: downloadProject,
    loadImageFromBlob: loadImageFromBlob,
    buildProject: buildProject,
    loadProjectFile: loadProjectFile,
    installAssets: installAssets
  };
})();
