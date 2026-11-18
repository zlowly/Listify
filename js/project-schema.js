(function () {
  'use strict';

  /*
   * 项目结构校验与旧版背景迁移（从 io.js 拆出）。
   * 依赖方向：只读 L.model（调用时读取），不触碰 DOM、IndexedDB、localStorage，
   * 因此可在 Node 中直接装载与测试。
   */

  const L = window.Listify = window.Listify || {};

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  // 调色与渐隐字段是可选增量：缺失合法，存在则必须落在范围内。
  // 不在这里收敛数值，越界必须让用户看到项目无效，避免“静默改数”。
  function validateImageEffects(item, label, fail) {
    if (item.brightness !== undefined &&
        (!isFiniteNumber(item.brightness) ||
          item.brightness < L.model.BRIGHTNESS_MIN || item.brightness > L.model.BRIGHTNESS_MAX)) {
      fail(label + '的亮度无效。');
    }
    if (item.hue !== undefined &&
        (!isFiniteNumber(item.hue) ||
          item.hue < L.model.HUE_MIN || item.hue > L.model.HUE_MAX)) {
      fail(label + '的色相无效。');
    }
    if (item.fadeMode !== undefined && L.model.FADE_MODES.indexOf(item.fadeMode) < 0) {
      fail(label + '的渐隐模式无效。');
    }
    if (item.fadeAngle !== undefined &&
        (!isFiniteNumber(item.fadeAngle) ||
          item.fadeAngle < L.model.FADE_ANGLE_MIN || item.fadeAngle > L.model.FADE_ANGLE_MAX)) {
      fail(label + '的渐隐角度无效。');
    }
    const ranges = [
      ['fadePosition', L.model.FADE_POSITION_MIN, L.model.FADE_POSITION_MAX, '渐隐位置'],
      ['fadeWidth', L.model.FADE_WIDTH_MIN, L.model.FADE_WIDTH_MAX, '转场宽度'],
      ['fadeTop', L.model.FADE_TRANSPARENCY_MIN, L.model.FADE_TRANSPARENCY_MAX, '顶部透明度'],
      ['fadeBottom', L.model.FADE_TRANSPARENCY_MIN, L.model.FADE_TRANSPARENCY_MAX, '底部透明度']
    ];
    ranges.forEach(function (range) {
      const value = item[range[0]];
      if (value !== undefined &&
          (!isFiniteNumber(value) || value < range[1] || value > range[2])) {
        fail(label + '的' + range[3] + '无效。');
      }
    });
  }

  // 页面背景是 v4 的唯一背景形态；校验字段与旧背景集图片保持一致。
  function validatePageBackground(background, label, assetIds, fail) {
    if (!background || typeof background !== 'object' || Array.isArray(background)) {
      fail(label + '的背景缺失或无效。');
      return;
    }
    if (typeof background.color !== 'string') {
      fail(label + '的背景颜色无效。');
    }
    if (!Array.isArray(background.images)) {
      fail(label + '的背景图片列表无效。');
      return;
    }
    const imageIds = new Set();
    background.images.forEach(function (image, imageIndex) {
      const imageLabel = label + '第 ' + (imageIndex + 1) + ' 张背景图';
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
      if (L.model.BACKGROUND_FITS.indexOf(image.fit) < 0) fail(imageLabel + '定位模式无效。');
      if (image.fit === 'none') {
        if (!isFiniteNumber(image.x) || !isFiniteNumber(image.y) ||
            !isFiniteNumber(image.width) || image.width <= L.model.IMAGE_MIN_SIZE ||
            !isFiniteNumber(image.height) || image.height <= L.model.IMAGE_MIN_SIZE) {
          fail(imageLabel + '的自定义位置或尺寸无效。');
        }
      }
      if (!isFiniteNumber(image.opacity) ||
          image.opacity < L.model.OPACITY_MIN || image.opacity > L.model.OPACITY_MAX) {
        fail(imageLabel + '透明度无效。');
      }
      if (!isFiniteNumber(image.blur) || image.blur < L.model.BLUR_MIN) {
        fail(imageLabel + '模糊值无效。');
      }
      if (image.rotation !== undefined && !isFiniteNumber(image.rotation)) {
        fail(imageLabel + '旋转角度无效。');
      }
      if (image.keepRatio !== undefined && typeof image.keepRatio !== 'boolean') {
        fail(imageLabel + '等比设置无效。');
      }
      validateImageEffects(image, imageLabel, fail);
    });
  }

  function validateProject(raw) {
    const errors = [];
    function fail(message) {
      errors.push(message);
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, errors: ['项目文件不是有效的 JSON 对象。'] };
    }
    if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3 && raw.version !== 4) {
      if (typeof raw.version === 'number' && raw.version > 4) {
        fail('项目版本 ' + raw.version + ' 高于当前支持的版本 4，无法加载。');
      } else {
        fail('项目版本无效或缺失，无法加载。');
      }
      return { ok: false, errors: errors };
    }
    const isV1 = raw.version === 1;
    const isV3 = raw.version === 3;
    const isV4 = raw.version === 4;
    if (!raw.pageSize || !isFiniteNumber(raw.pageSize.width) || !isFiniteNumber(raw.pageSize.height) ||
        raw.pageSize.width <= L.model.IMAGE_MIN_SIZE || raw.pageSize.height <= L.model.IMAGE_MIN_SIZE) {
      fail('页面尺寸无效。');
    }
    if (!raw.margins || !['top', 'right', 'bottom', 'left'].every(function (key) {
      return isFiniteNumber(raw.margins[key]) && raw.margins[key] >= L.model.MARGIN_MIN;
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
          validatePageBackground(background, label, assetIds, fail);
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
        if (isV4) {
          validatePageBackground(page.background, '第 ' + (pageIndex + 1) + ' 页', assetIds, fail);
        } else if (isV3) {
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
            if (!isFiniteNumber(bg.opacity) ||
                bg.opacity < L.model.OPACITY_MIN || bg.opacity > L.model.OPACITY_MAX) {
              fail('第 ' + (pageIndex + 1) + ' 页背景透明度无效。');
            }
            if (!isFiniteNumber(bg.blur) || bg.blur < L.model.BLUR_MIN) {
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
              !isFiniteNumber(element.width) || element.width <= L.model.IMAGE_MIN_SIZE) {
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
                      !table.widths.every(function (width) {
                        return isFiniteNumber(width) && width > L.model.IMAGE_MIN_SIZE;
                      })) {
                    fail(label + '第 ' + (tableIndex + 1) + ' 个表格手动列宽无效。');
                  }
                }
                if (table.margins !== undefined) {
                  if (!table.margins || typeof table.margins !== 'object' || Array.isArray(table.margins)) {
                    fail(label + '第 ' + (tableIndex + 1) + ' 个表格边距无效。');
                  } else {
                    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
                      if (table.margins[side] !== undefined &&
                          (!isFiniteNumber(table.margins[side]) ||
                            table.margins[side] < L.model.MARGIN_MIN)) {
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
            if (!isFiniteNumber(element.height) || element.height <= L.model.IMAGE_MIN_SIZE) {
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
              if (element.blur !== undefined &&
                  (!isFiniteNumber(element.blur) || element.blur < L.model.BLUR_MIN)) {
                fail(label + '的模糊值无效。');
              }
              validateImageEffects(element, label, fail);
            }
            if (!isFiniteNumber(element.opacity) ||
                element.opacity < L.model.OPACITY_MIN || element.opacity > L.model.OPACITY_MAX) {
              fail(label + '的图片透明度无效。');
            }
          } else {
            fail(label + '的类型未知。');
          }
        });
      });

      if (isV4) {
        if (raw.globalBackgroundPageId != null &&
            (typeof raw.globalBackgroundPageId !== 'string' || !pageIds.has(raw.globalBackgroundPageId))) {
          fail('全局背景来源页无效。');
        }
      }

      const pageById = new Map();
      raw.pages.forEach(function (page) {
        if (page && typeof page.id === 'string' && page.id) pageById.set(page.id, page);
      });
      if (!isV3 && !isV4) raw.pages.forEach(function (page, pageIndex) {
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

  function buildBackgroundImage(rawImage) {
    const image = L.model.createBackgroundImage(rawImage.assetId, rawImage.fit);
    if (rawImage.id) image.id = rawImage.id;
    image.x = Number(rawImage.x) || 0;
    image.y = Number(rawImage.y) || 0;
    image.width = Number(rawImage.width) || 0;
    image.height = Number(rawImage.height) || 0;
    image.rotation = Number(rawImage.rotation) || 0;
    image.keepRatio = rawImage.keepRatio !== false;
    image.opacity = rawImage.opacity == null ? 1 : rawImage.opacity;
    image.blur = Number(rawImage.blur) || 0;
    image.brightness = rawImage.brightness == null ? 1 : rawImage.brightness;
    image.hue = rawImage.hue == null ? 0 : rawImage.hue;
    image.fadeMode = rawImage.fadeMode == null ? 'off' : rawImage.fadeMode;
    image.fadeAngle = rawImage.fadeAngle == null ? 0 : rawImage.fadeAngle;
    const fadeDefaults = L.model.fadeDefaults(image.fadeMode);
    image.fadePosition = rawImage.fadePosition == null ? fadeDefaults.fadePosition : rawImage.fadePosition;
    image.fadeWidth = rawImage.fadeWidth == null ? fadeDefaults.fadeWidth : rawImage.fadeWidth;
    image.fadeTop = rawImage.fadeTop == null ? fadeDefaults.fadeTop : rawImage.fadeTop;
    image.fadeBottom = rawImage.fadeBottom == null ? fadeDefaults.fadeBottom : rawImage.fadeBottom;
    return image;
  }

  function buildPageBackground(raw) {
    const source = raw || {};
    return {
      color: source.color || L.model.DEFAULT_BACKGROUND_COLOR,
      images: (Array.isArray(source.images) ? source.images : []).map(buildBackgroundImage)
    };
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

  function legacyPageBackground(source) {
    const background = L.model.createPageBackground(source && source.color);
    if (source && source.assetId) {
      const image = L.model.createBackgroundImage(source.assetId, source.fit || 'cover');
      image.opacity = source.opacity == null ? 1 : source.opacity;
      image.blur = source.blur == null ? 0 : source.blur;
      background.images.push(image);
    }
    return background;
  }

  // 所有版本都归一到“每页一份背景 + 可空全局来源页”。
  // 返回与 raw.pages 同序的背景数组，图片条目 ID 已按页独立。
  function resolvePageBackgrounds(raw) {
    if (raw.version === 4) {
      return {
        globalBackgroundPageId: raw.globalBackgroundPageId || null,
        backgrounds: raw.pages.map(function (page) {
          return buildPageBackground(page.background);
        })
      };
    }
    if (raw.version === 3) {
      const sets = new Map();
      (raw.backgrounds || []).forEach(function (set) {
        sets.set(set.id, buildPageBackground(set));
      });
      const backgrounds = raw.pages.map(function (page) {
        return L.model.clonePageBackground(sets.get(page.backgroundId));
      });
      let globalBackgroundPageId = null;
      if (raw.unifiedBackground && raw.unifiedBackgroundId && sets.has(raw.unifiedBackgroundId)) {
        const index = raw.pages.findIndex(function (page) {
          return page.backgroundId === raw.unifiedBackgroundId;
        });
        if (index >= 0) {
          globalBackgroundPageId = raw.pages[index].id;
        } else if (raw.pages.length) {
          // 全局集没有被任何页引用：把它物化到第一页，保持导入后的画面不变。
          backgrounds[0] = L.model.clonePageBackground(sets.get(raw.unifiedBackgroundId));
          globalBackgroundPageId = raw.pages[0].id;
        }
      }
      return { globalBackgroundPageId: globalBackgroundPageId, backgrounds: backgrounds };
    }

    const rawById = new Map();
    raw.pages.forEach(function (page) { rawById.set(page.id, page); });
    const isV1 = raw.version === 1;
    const owners = raw.pages.map(function (page) {
      return isV1 ? page : ownerPage(page, rawById);
    });
    const backgrounds = owners.map(function (owner) {
      return legacyPageBackground(owner.background);
    });
    let globalBackgroundPageId = null;
    if (!isV1 && owners.length > 0) {
      const unique = new Set(owners.map(function (owner) { return owner.id; }));
      if (unique.size === 1) globalBackgroundPageId = owners[0].id;
    }
    return { globalBackgroundPageId: globalBackgroundPageId, backgrounds: backgrounds };
  }

  L.projectSchema = {
    isFiniteNumber: isFiniteNumber,
    validateProject: validateProject,
    buildBackgroundImage: buildBackgroundImage,
    buildPageBackground: buildPageBackground,
    ownerPage: ownerPage,
    resolvePageBackgrounds: resolvePageBackgrounds
  };
})();
