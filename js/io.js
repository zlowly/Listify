(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function collectReferencedAssetIds(project) {
    const ids = new Set();
    project.pages.forEach(function (page) {
      if (page.background && page.background.assetId) ids.add(page.background.assetId);
      page.elements.forEach(function (element) {
        if (element.type === 'image' && element.assetId) ids.add(element.assetId);
      });
    });
    return Array.from(ids);
  }

  function serializeStyle(style) {
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      lineHeight: style.lineHeight,
      align: style.align
    };
  }

  function serializeTable(table) {
    return {
      columns: table.columns,
      rows: table.rows,
      fill: table.fill,
      align: table.align,
      widthMode: table.widthMode,
      widths: Array.isArray(table.widths) ? table.widths.slice() : []
    };
  }

  function serializeElement(element) {
    if (element.type === 'category') {
      return {
        id: element.id,
        type: 'category',
        category: element.category,
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
      fit: element.fit,
      opacity: element.opacity
    };
  }

  function serializeBackground(background) {
    return {
      assetId: background.assetId || null,
      fit: background.fit || 'cover',
      opacity: background.opacity == null ? 1 : background.opacity,
      blur: background.blur == null ? 0 : background.blur,
      color: background.color || '#ffffff'
    };
  }

  async function serializeProject(project) {
    const referencedIds = collectReferencedAssetIds(project);
    const assets = [];
    for (const id of referencedIds) {
      const blob = L.assets.getBlob(id);
      if (!blob) throw new Error('图片资产缺失：' + id);
      const meta = L.assets.getMeta(id) ||
        project.assets.find(function (asset) { return asset.id === id; }) ||
        { name: 'image', mime: blob.type };
      const data = await model.blobToBase64(blob);
      assets.push({
        id: id,
        name: meta.name || 'image',
        mime: meta.mime || blob.type || 'image/png',
        data: data
      });
    }

    return {
      version: 1,
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
      pages: project.pages.map(function (page) {
        return {
          id: page.id,
          background: serializeBackground(page.background),
          elements: page.elements.map(serializeElement)
        };
      })
    };
  }

  async function downloadProject(project) {
    const data = await serializeProject(project);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    model.downloadBlob(blob, '歌单项目.json');
  }

  function validateProject(raw) {
    const errors = [];
    function fail(message) {
      errors.push(message);
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, errors: ['项目文件不是有效的 JSON 对象。'] };
    }
    if (raw.version !== 1) {
      if (typeof raw.version === 'number' && raw.version > 1) {
        fail('项目版本 ' + raw.version + ' 高于当前支持的版本 1，无法加载。');
      } else {
        fail('项目版本无效或缺失，无法加载。');
      }
      return { ok: false, errors: errors };
    }
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
        if (!page.background || typeof page.background !== 'object') {
          fail('第 ' + (pageIndex + 1) + ' 页缺少背景属性。');
        } else {
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
            if (['cover', 'contain', 'stretch'].indexOf(element.fit) < 0) {
              fail(label + '的图片填充模式无效。');
            }
            if (!isFiniteNumber(element.opacity) || element.opacity < 0 || element.opacity > 1) {
              fail(label + '的图片透明度无效。');
            }
          } else {
            fail(label + '的类型未知。');
          }
        });
      });
    }

    return { ok: errors.length === 0, errors: errors };
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

    const project = {
      version: 1,
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
      pages: raw.pages.map(function (page) {
        return {
          id: page.id,
          background: model.createBackground(page.background),
          elements: page.elements.map(function (element) {
            if (element.type === 'category') {
              return {
                id: element.id,
                type: 'category',
                category: element.category,
                x: element.x,
                y: element.y,
                width: element.width,
                titleStyle: model.copyStyle(element.titleStyle),
                songStyle: model.copyStyle(element.songStyle),
                tables: element.tables.map(function (table) {
                  return {
                    columns: table.columns,
                    rows: table.rows,
                    fill: table.fill,
                    align: table.align,
                    widthMode: table.widthMode,
                    widths: Array.isArray(table.widths) ? table.widths.slice() : []
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
                style: model.copyStyle(element.style)
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
              fit: element.fit,
              opacity: element.opacity
            };
          })
        };
      })
    };

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
    collectReferencedAssetIds: collectReferencedAssetIds,
    serializeProject: serializeProject,
    downloadProject: downloadProject,
    validateProject: validateProject,
    loadProjectFile: loadProjectFile,
    installAssets: installAssets
  };
})();
