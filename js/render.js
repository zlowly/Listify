(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const shape = L.shape;

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function imageSize(img) {
    return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  }

  function imageNatural(img) {
    return img ? imageSize(img) : { width: 0, height: 0 };
  }

  function cropOf(item) {
    return model.cropValues(item);
  }

  // 完整框在局部坐标中以中心为原点；可见矩形按裁剪内缩。
  function visibleBoxForFrame(frame, natural, crop, rotation) {
    const visible = model.visibleRect(frame, natural, crop);
    const frameCenterX = frame.x + frame.width / 2;
    const frameCenterY = frame.y + frame.height / 2;
    const radians = model.rotationRadians({ rotation: rotation || 0 });
    const offset = model.rotateVector(
      visible.x + visible.width / 2 - frameCenterX,
      visible.y + visible.height / 2 - frameCenterY,
      radians
    );
    const centerX = frameCenterX + offset.x;
    const centerY = frameCenterY + offset.y;
    return {
      x: centerX - visible.width / 2,
      y: centerY - visible.height / 2,
      width: visible.width,
      height: visible.height,
      rotation: rotation || 0
    };
  }

  function elementVisibleRect(element) {
    if (!element || element.type !== 'image') {
      return element ? { x: element.x, y: element.y, width: element.width, height: element.height } : null;
    }
    const img = element.assetId ? L.assets.getCachedImage(element.assetId) : null;
    const natural = imageNatural(img);
    return model.visibleRect(
      { x: element.x, y: element.y, width: element.width, height: element.height },
      natural,
      cropOf(element)
    );
  }

  function elementVisibleBox(element) {
    if (!element || element.type !== 'image') return element;
    const img = element.assetId ? L.assets.getCachedImage(element.assetId) : null;
    const natural = imageNatural(img);
    return visibleBoxForFrame(
      { x: element.x, y: element.y, width: element.width, height: element.height },
      natural,
      cropOf(element),
      element.rotation
    );
  }

  function elementVisibleLocalRect(element) {
    const rect = elementVisibleRect(element);
    if (!rect) return { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: rect.x - element.x - element.width / 2 + rect.width / 2,
      y: rect.y - element.y - element.height / 2 + rect.height / 2,
      width: rect.width,
      height: rect.height
    };
  }

  function backgroundVisibleRect(pageSize, image, img) {
    const frame = backgroundImageRect(pageSize, image, img);
    return model.visibleRect(frame, imageNatural(img), cropOf(image));
  }

  function backgroundVisibleBox(pageSize, image, img) {
    const frame = backgroundImageRect(pageSize, image, img);
    return visibleBoxForFrame(frame, imageNatural(img), cropOf(image), image.rotation);
  }

  // 图片处理缓存：模糊、调色与渐隐一次烘焙，缓存命中后每帧只是一次 drawImage。
  // 拖拽图片只改变位置时缓存可命中；尺寸按 64px 分桶，缩放时仅跨桶才重建。
  const PROCESSED_CACHE_BUCKET = 64;
  const PROCESSED_CACHE_MAX_PIXELS = 12 * 1024 * 1024;
  const PROCESSED_CACHE_MAX_ENTRY_PIXELS = 8 * 1024 * 1024;
  const processedImages = new Map();
  let processedImagePixels = 0;
  let processedCacheFrozen = false;

  // 兼容既有调用点（app-interactions 在拖拽开始/结束时切换冻结）。
  function setBlurCacheFrozen(frozen) {
    processedCacheFrozen = !!frozen;
  }

  function contextRatio(ctx) {
    const matrix = ctx.getTransform();
    return Math.max(0.1, Math.hypot(matrix.a, matrix.b));
  }

  function finiteOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function imageEffects(item) {
    const source = item || {};
    const fade = model.fadeValues(source);
    return {
      blur: Math.max(0, finiteOr(source.blur, 0)),
      brightness: finiteOr(source.brightness, 1),
      hue: finiteOr(source.hue, 0),
      fadeMode: fade.mode,
      fadeAngle: fade.angle,
      fadePosition: fade.position,
      fadeWidth: fade.width,
      fadeTop: fade.top,
      fadeBottom: fade.bottom
    };
  }

  function effectSignature(effects) {
    return effects.blur + '|' + effects.brightness + '|' + effects.hue + '|' +
      effects.fadeMode + '|' + effects.fadeAngle + '|' +
      effects.fadePosition + '|' + effects.fadeWidth + '|' +
      effects.fadeTop + '|' + effects.fadeBottom;
  }

  // 滤镜串只在非默认时列出对应项；模糊半径由调用方按位图比例换算。
  function filterString(effects, blurScale) {
    const parts = [];
    if (effects.blur > 0) parts.push('blur(' + Math.max(0.5, effects.blur * blurScale) + 'px)');
    if (effects.brightness !== 1) parts.push('brightness(' + effects.brightness + ')');
    if (effects.hue !== 0) parts.push('hue-rotate(' + effects.hue + 'deg)');
    return parts.length ? parts.join(' ') : 'none';
  }

  // 图层缩略图只反映色相：归一化与滤镜串格式和画布共用，避免两处换算漂移。
  // 返回空串表示“不做任何着色”，由调用方保持原图外观。
  function hueFilter(item) {
    const hue = finiteOr((item || {}).hue, 0);
    return hue !== 0 ? 'hue-rotate(' + hue + 'deg)' : '';
  }

  // 用 destination-in 把渐变乘进位图 alpha：只改透明度，不改颜色。
  // originX/originY 是位图左上角对应的局部坐标（局部坐标以图片中心为原点），
  // 因此缓存位图与导出掩膜可以共用同一套渐变几何。
  function fillFadeMask(ctx, effects, width, height, scaleX, scaleY, originX, originY, centerX, centerY) {
    if (effects.fadeMode === 'off') return;
    const points = model.fadeGradientPoints(effects.fadeAngle, width, height);
    const profile = model.fadeProfile(effects);
    const span = profile.to - profile.from;
    const offsetX = Number(centerX) || 0;
    const offsetY = Number(centerY) || 0;
    // 轴向坐标 t 沿 fadeGradientPoints 给出的整条投影轴线性映射；
    // 单向的坡可以伸出图片，画布会把图片外的那段裁掉。
    function axisPoint(t) {
      return {
        x: points.x1 + (points.x2 - points.x1) * t + offsetX,
        y: points.y1 + (points.y2 - points.y1) * t + offsetY
      };
    }
    const start = axisPoint(profile.from);
    const end = axisPoint(profile.to);
    const gradient = ctx.createLinearGradient(
      (start.x - originX) * scaleX,
      (start.y - originY) * scaleY,
      (end.x - originX) * scaleX,
      (end.y - originY) * scaleY
    );
    profile.stops.forEach(function (stop) {
      const offset = span > 0 ? (stop.t - profile.from) / span : 0;
      gradient.addColorStop(model.clamp(offset, 0, 1), 'rgba(0,0,0,' + stop.alpha + ')');
    });
    const previous = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalCompositeOperation = previous;
  }

  function processedImage(assetId, effects, width, height, crop, ratio) {
    const img = L.assets.getCachedImage(assetId);
    if (!img || !(width > 0) || !(height > 0)) return null;
    const natural = imageNatural(img);
    const deviceWidth = width * ratio;
    const deviceHeight = height * ratio;
    // 超大图片按像素预算降采样缓存；绘制时放大，模糊半径按同比例缩放，
    // 使最终显示半径仍等于 blur。
    const budgetScale = Math.min(1, Math.sqrt(PROCESSED_CACHE_MAX_ENTRY_PIXELS / (deviceWidth * deviceHeight)));
    const bucketWidth = Math.max(1, Math.ceil(deviceWidth * budgetScale / PROCESSED_CACHE_BUCKET) * PROCESSED_CACHE_BUCKET);
    const bucketHeight = Math.max(1, Math.ceil(deviceHeight * budgetScale / PROCESSED_CACHE_BUCKET) * PROCESSED_CACHE_BUCKET);
    const signature = effectSignature(effects) + '|' + model.cropSignature({ crop: crop });
    const key = assetId + '|' + signature + '|' + bucketWidth + 'x' + bucketHeight;
    const cached = processedImages.get(key);
    if (cached) {
      processedImages.delete(key);
      processedImages.set(key, cached);
      return cached;
    }
    // 交互（拖拽缩放）期间复用已有位图，避免每次跨尺寸桶都重新烘焙；
    // 前缀必须覆盖全部效果与裁剪参数，否则会复用另一套结果的位图。
    if (processedCacheFrozen) {
      const prefix = assetId + '|' + signature + '|';
      for (const [cachedKey, canvas] of processedImages) {
        if (cachedKey.indexOf(prefix) === 0) return canvas;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = bucketWidth;
    canvas.height = bucketHeight;
    const cacheContext = canvas.getContext('2d');
    if (!cacheContext) return null;
    const blurScale = Math.min(1, bucketWidth / deviceWidth);
    cacheContext.filter = filterString(effects, blurScale);
    cacheContext.drawImage(img, 0, 0, bucketWidth, bucketHeight);
    cacheContext.filter = 'none';
    const frame = { x: -width / 2, y: -height / 2, width: width, height: height };
    const visible = model.visibleRect(frame, natural, crop);
    fillFadeMask(
      cacheContext, effects, visible.width, visible.height,
      bucketWidth / width, bucketHeight / height,
      -width / 2, -height / 2,
      visible.x + visible.width / 2,
      visible.y + visible.height / 2
    );
    const pixels = bucketWidth * bucketHeight;
    processedImages.set(key, canvas);
    processedImagePixels += pixels;
    while (processedImagePixels > PROCESSED_CACHE_MAX_PIXELS && processedImages.size > 1) {
      const oldestKey = processedImages.keys().next().value;
      const oldest = processedImages.get(oldestKey);
      processedImagePixels -= oldest.width * oldest.height;
      processedImages.delete(oldestKey);
    }
    return canvas;
  }

  // 在已旋转/平移的上下文里绘制一张图片：frame 为局部完整框（中心为原点），
  // 无效果时直接按源裁剪取样；有效果时取完整框烘焙位图的可见子矩形。
  function drawProcessedImage(ctx, assetId, img, item, frame, crop) {
    if (!img) return;
    const natural = imageNatural(img);
    const values = model.clampCrop(crop, natural);
    const visible = model.visibleRect(frame, natural, values);
    if (!(visible.width > 0) || !(visible.height > 0)) return;
    const effects = imageEffects(item);
    const sourceWidth = Math.max(0, natural.width - values.left - values.right);
    const sourceHeight = Math.max(0, natural.height - values.top - values.bottom);
    // 无效果快速路径：完全不分配离屏画布，保持现有绘制成本。
    if (effects.blur === 0 && !model.hasImageEffects(item)) {
      if (sourceWidth > 0 && sourceHeight > 0) {
        ctx.drawImage(
          img, values.left, values.top, sourceWidth, sourceHeight,
          visible.x, visible.y, visible.width, visible.height
        );
      }
      return;
    }
    const cached = processedImage(assetId, effects, frame.width, frame.height, values, contextRatio(ctx));
    if (cached) {
      const scaleX = cached.width / frame.width;
      const scaleY = cached.height / frame.height;
      ctx.drawImage(
        cached,
        (visible.x - frame.x) * scaleX,
        (visible.y - frame.y) * scaleY,
        visible.width * scaleX,
        visible.height * scaleY,
        visible.x, visible.y, visible.width, visible.height
      );
      return;
    }
    ctx.filter = filterString(effects, 1);
    if (sourceWidth > 0 && sourceHeight > 0) {
      ctx.drawImage(
        img, values.left, values.top, sourceWidth, sourceHeight,
        visible.x, visible.y, visible.width, visible.height
      );
    }
    ctx.filter = 'none';
  }

  // 导出保真分支：无模糊时按全分辨率一次性出图（不进缓存），
  // 掩膜只覆盖传入的局部矩形，4K 导出不会分配整张超大位图。
  function drawOneShotImage(ctx, img, effects, width, height, crop, originX, originY, maskWidth, maskHeight) {
    if (!img || !(maskWidth > 0) || !(maskHeight > 0)) return;
    const natural = imageNatural(img);
    const values = model.clampCrop(crop, natural);
    const frame = { x: -width / 2, y: -height / 2, width: width, height: height };
    const visible = model.visibleRect(frame, natural, values);
    if (!(visible.width > 0) || !(visible.height > 0)) return;
    const ratio = contextRatio(ctx);
    const pixelWidth = Math.max(1, Math.ceil(maskWidth * ratio));
    const pixelHeight = Math.max(1, Math.ceil(maskHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const offscreen = canvas.getContext('2d');
    if (!offscreen) return;
    const scaleX = pixelWidth / maskWidth;
    const scaleY = pixelHeight / maskHeight;
    offscreen.filter = filterString(effects, 1);
    offscreen.drawImage(
      img,
      (-width / 2 - originX) * scaleX,
      (-height / 2 - originY) * scaleY,
      width * scaleX,
      height * scaleY
    );
    offscreen.filter = 'none';
    fillFadeMask(
      offscreen, effects, visible.width, visible.height, scaleX, scaleY,
      originX, originY,
      visible.x + visible.width / 2,
      visible.y + visible.height / 2
    );
    ctx.drawImage(canvas, originX, originY, maskWidth, maskHeight);
  }

  function backgroundGeometry(pageSize, img, fit) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const pw = pageSize.width;
    const ph = pageSize.height;
    if (!iw || !ih) return { x: 0, y: 0, width: pw, height: ph };
    if (fit === 'original') {
      return { x: (pw - iw) / 2, y: (ph - ih) / 2, width: iw, height: ih };
    }
    if (fit === 'fill-width') {
      const width = pw;
      const height = ih * (pw / iw);
      return { x: 0, y: (ph - height) / 2, width: width, height: height };
    }
    if (fit === 'fill-height') {
      const height = ph;
      const width = iw * (ph / ih);
      return { x: (pw - width) / 2, y: 0, width: width, height: height };
    }
    const scale = Math.max(pw / iw, ph / ih);
    const width = iw * scale;
    const height = ih * scale;
    return { x: (pw - width) / 2, y: (ph - height) / 2, width: width, height: height };
  }

  function backgroundImageRect(pageSize, image, img) {
    if (image.fit === 'none') {
      return { x: image.x || 0, y: image.y || 0, width: image.width || 0, height: image.height || 0 };
    }
    if (!img) return { x: 0, y: 0, width: pageSize.width, height: pageSize.height };
    return backgroundGeometry(pageSize, img, image.fit || 'cover');
  }

  // 背景绘制体：显式传入背景值，画布/导出取有效背景，缩略图取本页背景。
  function paintBackground(ctx, pageSize, background, options) {
    const opts = options || {};
    const pw = pageSize.width;
    const ph = pageSize.height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    ctx.fillStyle = (background && background.color) || model.DEFAULT_BACKGROUND_COLOR;
    ctx.fillRect(0, 0, pw, ph);
    if (background && Array.isArray(background.items || background.images)) {
      const items = background.items || background.images;
      items.forEach(function (item) {
        if (item && item.kind === 'shape') {
          drawShape(ctx, item, opts);
          return;
        }
        const image = item;
        if (!image || !image.assetId) return;
        const img = L.assets.getCachedImage(image.assetId);
        if (!img) return;
        const rect = backgroundImageRect(pageSize, image, img);
        if (!(rect.width > 0) || !(rect.height > 0)) return;
        const natural = imageNatural(img);
        const crop = model.clampCrop(cropOf(image), natural);
        const visible = model.visibleRect(rect, natural, crop);
        if (!(visible.width > 0) || !(visible.height > 0)) return;
        const effects = imageEffects(image);
        const needsHighRes = opts.exportMode && effects.blur === 0 && model.hasImageEffects(image);
        // 掩膜只需覆盖“可见矩形 ∩ 页面”，避免超大 cover 图在 4K 导出时分配整张位图。
        const mask = needsHighRes ? model.fadeMaskRect(visible, pageSize, image.rotation) : null;
        if (needsHighRes && !mask) return;
        ctx.save();
        ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
        ctx.rotate(model.rotationRadians(image));
        ctx.globalAlpha = model.clamp(Number(image.opacity), 0, 1);
        if (needsHighRes) {
          // mask 相对可见中心；转回完整框中心作为一次性绘制的局部原点。
          const offsetX = visible.x + visible.width / 2 - (rect.x + rect.width / 2);
          const offsetY = visible.y + visible.height / 2 - (rect.y + rect.height / 2);
          drawOneShotImage(
            ctx, img, effects, rect.width, rect.height, crop,
            mask.x + offsetX, mask.y + offsetY, mask.width, mask.height
          );
        } else {
          drawProcessedImage(ctx, image.assetId, img, image,
            { x: -rect.width / 2, y: -rect.height / 2, width: rect.width, height: rect.height },
            crop);
        }
        ctx.restore();
      });
    }
    ctx.restore();
  }

  function drawBackground(ctx, project, page, options) {
    paintBackground(ctx, project.pageSize, model.effectiveBackground(project, page), options);
  }

  /* 背景缩略图：把整页背景等比缩放到 canvas 内，居中留边。
     canvas 由面板/弹窗的 HTML 片段提供，DOM 插入后统一走这里绘制。 */
  function paintBackgroundPreviews(root) {
    const host = root || document;
    if (!host || !host.querySelectorAll) return 0;
    const state = L.app && L.app.state;
    const project = state && state.project;
    if (!project || !project.pageSize) return 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Number(project.pageSize.width) || 0;
    const ph = Number(project.pageSize.height) || 0;
    if (!(pw > 0) || !(ph > 0)) return 0;
    let painted = 0;
    host.querySelectorAll('canvas[data-preview-page]').forEach(function (canvas) {
      const page = (project.pages || []).find(function (item) {
        return item.id === canvas.getAttribute('data-preview-page');
      });
      if (!page) return;
      // 面板重建后 canvas 尚未布局时 clientWidth 为 0，按 CSS 逻辑尺寸兜底。
      const fallback = canvas.classList.contains('bg-preview-sm')
        ? { width: 40, height: 52 }
        : { width: 72, height: 96 };
      const width = Math.max(1, Math.round((canvas.clientWidth || fallback.width) * dpr));
      const height = Math.max(1, Math.round((canvas.clientHeight || fallback.height) * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min(width / pw, height / ph);
      ctx.save();
      ctx.translate((width - pw * scale) / 2, (height - ph * scale) / 2);
      ctx.scale(scale, scale);
      paintBackground(ctx, project.pageSize, page.background);
      ctx.restore();
      painted += 1;
    });
    return painted;
  }

  function elementCorners(element) {
    const width = element.width;
    const height = element.height;
    const centerX = element.x + width / 2;
    const centerY = element.y + height / 2;
    const radians = model.rotationRadians(element);
    return [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [width / 2, height / 2],
      [-width / 2, height / 2]
    ].map(function (point) {
      const rotated = model.rotateVector(point[0], point[1], radians);
      return { x: centerX + rotated.x, y: centerY + rotated.y };
    });
  }

  function elementAabb(element) {
    const corners = elementCorners(element);
    const xs = corners.map(function (point) { return point.x; });
    const ys = corners.map(function (point) { return point.y; });
    const minX = Math.min.apply(null, xs);
    const maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys);
    const maxY = Math.max.apply(null, ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function imageLocalPoint(element, x, y) {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    return model.rotateVector(x - centerX, y - centerY, -model.rotationRadians(element));
  }

  function strokeAndFillText(ctx, style, text, x, y) {
    const outline = style.outline;
    if (outline && outline.enabled) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = outline.color || '#000000';
      ctx.lineWidth = Math.max(0, outline.width || 0);
      ctx.strokeText(text, x, y);
    }
    ctx.fillText(text, x, y);
  }

  // Two-pass "drop shadow": the first pass draws the whole region with the
  // canvas shadow enabled, the second pass redraws it without shadow, so the
  // text always covers its own shadow in any offset direction.
  function drawTextWithStyle(ctx, style, drawTextFn) {
    const shadow = style.shadow;
    if (!shadow || !shadow.enabled) {
      drawTextFn();
      return;
    }
    ctx.save();
    ctx.shadowColor = shadow.color || '#000000';
    ctx.shadowOffsetX = shadow.offsetX || 0;
    ctx.shadowOffsetY = shadow.offsetY || 0;
    ctx.shadowBlur = Math.max(0, shadow.blur || 0);
    drawTextFn();
    ctx.restore();
    drawTextFn();
  }

  function drawFreeText(ctx, element, editMode) {
    const textLayout = layout.layoutText(element);
    const style = element.style;
    if (!element.text) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(element.x, element.y, element.width, textLayout.height);
    ctx.clip();
    ctx.font = model.fontString(style);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = style.color || '#111827';
    drawTextWithStyle(ctx, style, function () {
      textLayout.lines.forEach(function (line, index) {
        const lineWidth = layout.measureText(line, style);
        let x = element.x;
        if (style.align === 'center') x += (element.width - lineWidth) / 2;
        if (style.align === 'right') x += element.width - lineWidth;
        strokeAndFillText(ctx, style, line, x, element.y + textLayout.lineHeight * (index + 0.5));
      });
    });
    ctx.restore();
  }

  function drawFreeImage(ctx, element, options) {
    if (!element.assetId) return;
    const img = L.assets.getCachedImage(element.assetId);
    if (!img) return;
    const opts = options || {};
    const width = element.width;
    const height = element.height;
    const natural = imageNatural(img);
    const crop = model.clampCrop(cropOf(element), natural);
    const frame = { x: -width / 2, y: -height / 2, width: width, height: height };
    const visible = model.visibleRect(frame, natural, crop);
    if (!(visible.width > 0) || !(visible.height > 0)) return;
    const effects = imageEffects(element);
    ctx.save();
    ctx.translate(element.x + width / 2, element.y + height / 2);
    ctx.rotate(model.rotationRadians(element));
    ctx.beginPath();
    ctx.rect(visible.x, visible.y, visible.width, visible.height);
    ctx.clip();
    ctx.globalAlpha = model.clamp(Number(element.opacity), 0, 1);
    if (opts.exportMode && effects.blur === 0 && model.hasImageEffects(element)) {
      // 自由图片只需可见矩形作为掩膜；一次性全分辨率出图避免缓存降采样。
      drawOneShotImage(ctx, img, effects, width, height, crop,
        visible.x, visible.y, visible.width, visible.height);
    } else {
      drawProcessedImage(ctx, element.assetId, img, element, frame, crop);
    }
    ctx.restore();
  }

  function traceShape(ctx, item) {
    const outline = shape.shapeOutline(item);
    ctx.beginPath();
    ctx.moveTo(outline.start.x, outline.start.y);
    outline.commands.forEach(function (command) {
      if (command.type === 'line') {
        ctx.lineTo(command.to.x, command.to.y);
      } else {
        ctx.arc(
          command.cx, command.cy, command.radius,
          command.startAngle, command.endAngle, command.anticlockwise
        );
      }
    });
    if (outline.closed) ctx.closePath();
  }

  function paintShape(ctx, item) {
    const strokeWidth = Math.max(0, Number(item.strokeWidth) || 0);
    if (item.mode === 'stroke') {
      if (strokeWidth <= 0) return;
      // 先裁剪到实际路径，再用双倍线宽描边；只有内侧一半可见，
      // 因此可见厚度等于 strokeWidth，且永远不会超出外接框。
      traceShape(ctx, item);
      ctx.clip();
      traceShape(ctx, item);
      ctx.strokeStyle = item.color || shape.DEFAULT_SHAPE.color;
      ctx.lineWidth = strokeWidth * 2;
      ctx.stroke();
      return;
    }
    traceShape(ctx, item);
    ctx.fillStyle = item.color || shape.DEFAULT_SHAPE.color;
    ctx.fill();
  }

  function drawShapeWithEffects(ctx, item, width, height, effects) {
    const ratio = contextRatio(ctx);
    const pixelWidth = Math.max(1, Math.ceil(width * ratio));
    const pixelHeight = Math.max(1, Math.ceil(height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const offscreen = canvas.getContext('2d');
    if (!offscreen) return;
    offscreen.scale(pixelWidth / width, pixelHeight / height);
    offscreen.translate(width / 2, height / 2);
    offscreen.filter = filterString(effects, pixelWidth / width);
    paintShape(offscreen, item);
    offscreen.filter = 'none';
    offscreen.setTransform(1, 0, 0, 1, 0, 0);
    fillFadeMask(
      offscreen, effects, width, height,
      pixelWidth / width, pixelHeight / height,
      -width / 2, -height / 2
    );
    ctx.drawImage(canvas, -width / 2, -height / 2, width, height);
  }

  function drawShape(ctx, item, options) {
    const width = Number(item.width) || 0;
    const height = Number(item.height) || 0;
    if (!(width > 0) || !(height > 0)) return;
    const effects = imageEffects(item);
    ctx.save();
    ctx.translate(item.x + width / 2, item.y + height / 2);
    ctx.rotate(model.rotationRadians(item));
    ctx.globalAlpha = model.clamp(finiteOr(item.opacity, 1), 0, 1);
    if (effects.blur === 0 && !model.hasImageEffects(item)) {
      paintShape(ctx, item);
    } else {
      drawShapeWithEffects(ctx, item, width, height, effects);
    }
    ctx.restore();
  }

  function drawJustifiedText(ctx, style, text, x, baseline, innerWidth) {
    const chars = Array.from(text);
    if (chars.length <= 1) {
      const width = ctx.measureText(text).width;
      strokeAndFillText(ctx, style, text, x + (innerWidth - width) / 2, baseline);
      return;
    }
    const textWidth = ctx.measureText(text).width;
    const spacing = Math.max(0, (innerWidth - textWidth) / (chars.length - 1));
    let cursor = x;
    chars.forEach(function (char) {
      strokeAndFillText(ctx, style, char, cursor, baseline);
      cursor += ctx.measureText(char).width + spacing;
    });
  }

  function drawCategory(ctx, project, page, element, editMode, selected) {
    const category = model.getCategory(project, element.category);
    const computed = layout.layoutCategory(category, element, { editMode: editMode });
    const color = element.songStyle.color || '#374151';
    const titleStyle = element.titleStyle;
    const songStyle = element.songStyle;

    ctx.save();
    ctx.beginPath();
    ctx.rect(element.x, element.y, element.width, Math.max(1, computed.blockHeight));
    ctx.clip();

    if (element.showTitle !== false) {
      ctx.font = model.fontString(titleStyle);
      ctx.fillStyle = titleStyle.color || '#1f2937';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      drawTextWithStyle(ctx, titleStyle, function () {
        computed.titleLines.forEach(function (line, index) {
          strokeAndFillText(
            ctx,
            titleStyle,
            line,
            element.x + computed.padding,
            element.y + computed.titleY + computed.titleLineHeight * (index + 0.5)
          );
        });
      });
    }

    computed.tables.forEach(function (table) {
      const tableTop = element.y + table.y;
      if (editMode) {
        table.cells.forEach(function (cell) {
          if (cell && cell.overflow) {
            ctx.fillStyle = '#fee2e2';
            ctx.fillRect(
              element.x + table.x + cell.x,
              tableTop + cell.y,
              cell.contentWidth,
              cell.height
            );
          }
        });
        if (table.placeholder) {
          ctx.fillStyle = '#fee2e2';
          ctx.fillRect(element.x + table.x, tableTop, table.tableWidth, table.rowHeight);
          const labelSize = Math.max(10, songStyle.fontSize * 0.7);
          ctx.font = model.fontString(Object.assign({}, songStyle, { fontSize: labelSize }));
          ctx.fillStyle = '#9ca3af';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            '空',
            element.x + table.x + table.tableWidth / 2,
            tableTop + table.rowHeight / 2
          );
        }
      }

      ctx.font = model.fontString(songStyle);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      table.cells.forEach(function (cell) {
        if (!cell) return;
        const cellX = element.x + table.x + cell.x;
        const cellY = tableTop + cell.y;
        const innerX = cellX + computed.cellPadX;
        const innerWidth = Math.max(0, cell.contentWidth - computed.cellPadX * 2);
        const baseline = cellY + cell.height / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(cellX, cellY, cell.contentWidth, cell.height);
        ctx.clip();
        drawTextWithStyle(ctx, songStyle, function () {
          if (table.align === 'justify') {
            drawJustifiedText(ctx, songStyle, cell.text, innerX, baseline, innerWidth);
          } else {
            let textX = innerX;
            if (table.align === 'center') textX += (innerWidth - cell.textWidth) / 2;
            if (table.align === 'right') textX += innerWidth - cell.textWidth;
            strokeAndFillText(ctx, songStyle, cell.text, textX, baseline);
          }
        });
        ctx.restore();
      });

      if (editMode) {
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(
          element.x + table.x,
          tableTop,
          table.tableWidth,
          table.height
        );
        for (let row = 1; row < table.rows; row += 1) {
          const y = tableTop + row * table.rowHeight;
          ctx.beginPath();
          ctx.moveTo(element.x + table.x, y);
          ctx.lineTo(element.x + table.x + table.tableWidth, y);
          ctx.stroke();
        }
        let dividerX = element.x + table.x;
        for (let col = 0; col < table.widths.length - 1; col += 1) {
          dividerX += table.widths[col];
          ctx.beginPath();
          ctx.moveTo(dividerX, tableTop);
          ctx.lineTo(dividerX, tableTop + table.height);
          ctx.stroke();
        }
      }
    });

    if (editMode) {
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeStyle = selected ? '#2563eb' : '#94a3b8';
      ctx.setLineDash(selected ? [] : [4, 4]);
      ctx.strokeRect(element.x, element.y, element.width, Math.max(1, computed.blockHeight));
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  function drawPage(ctx, project, page, options) {
    const opts = options || {};
    const editMode = opts.editMode !== false;
    const selectedId = opts.selectedId || null;
    const includeBackground = opts.includeBackground !== false;
    const includeElementTypes = Array.isArray(opts.includeElementTypes)
      ? opts.includeElementTypes
      : null;
    const pageW = project.pageSize.width;
    const pageH = project.pageSize.height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pageW, pageH);
    ctx.clip();
    if (includeBackground) drawBackground(ctx, project, page, opts);
    page.elements.forEach(function (element) {
      if (includeElementTypes && includeElementTypes.indexOf(element.type) === -1) return;
      if (element.type === 'category') {
        drawCategory(ctx, project, page, element, editMode, element.id === selectedId);
      } else if (element.type === 'text') {
        drawFreeText(ctx, element, editMode);
      } else if (element.type === 'image') {
        drawFreeImage(ctx, element, opts);
      } else if (element.type === 'shape') {
        drawShape(ctx, element, opts);
      }
    });
    ctx.restore();
  }

  function elementBounds(project, page, element) {
    let height = 0;
    if (element.type === 'category') {
      const category = model.getCategory(project, element.category);
      height = layout.layoutCategory(category, element, { editMode: true }).blockHeight;
    } else if (element.type === 'text') {
      height = layout.layoutText(element).height;
    } else if (element.type === 'image') {
      return elementVisibleRect(element);
    } else {
      height = element.height || 0;
    }
    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: height
    };
  }

  function hitTest(project, page, x, y) {
    for (let i = page.elements.length - 1; i >= 0; i -= 1) {
      const element = page.elements[i];
      const bounds = elementBounds(project, page, element);
      if (element.type === 'image') {
        const local = imageLocalPoint(element, x, y);
        const visible = elementVisibleLocalRect(element);
        if (Math.abs(local.x - visible.x) <= visible.width / 2 &&
            Math.abs(local.y - visible.y) <= visible.height / 2) {
          return { element: element, index: i, bounds: bounds };
        }
        continue;
      }
      if (element.type === 'shape') {
        const local = imageLocalPoint(element, x, y);
        if (shape.shapeContains(element, local.x, local.y)) {
          return { element: element, index: i, bounds: bounds };
        }
        continue;
      }
      if (
        x >= bounds.x &&
        y >= bounds.y &&
        x <= bounds.x + bounds.width &&
        y <= bounds.y + bounds.height
      ) {
        return { element: element, index: i, bounds: bounds };
      }
    }
    return null;
  }

  function tableDividers(project, page, element) {
    if (!element || element.type !== 'category') return [];
    const computed = layout.layoutCategory(model.getCategory(project, element.category), element, { editMode: true });
    const result = [];
    computed.tables.forEach(function (table, tableIndex) {
      if (table.height <= 0) return;
      let dividerX = element.x + table.x;
      for (let col = 0; col < table.widths.length - 1; col += 1) {
        dividerX += table.widths[col];
        result.push({
          tableIndex: tableIndex,
          dividerIndex: col,
          x: dividerX,
          y: element.y + table.y,
          height: table.height,
          widths: table.widths.slice()
        });
      }
    });
    return result;
  }

  function pageOverflow(project, page) {
    const pageW = project.pageSize.width;
    const pageH = project.pageSize.height;
    return page.elements.filter(function (element) {
      if (element.type === 'image' || element.type === 'shape') {
        const corners = element.type === 'image'
          ? elementCorners(elementVisibleBox(element))
          : elementCorners(element);
        return corners.some(function (corner) {
          return (
            corner.x < -0.5 ||
            corner.y < -0.5 ||
            corner.x > pageW + 0.5 ||
            corner.y > pageH + 0.5
          );
        });
      }
      const bounds = elementBounds(project, page, element);
      return (
        bounds.x < 0 ||
        bounds.y < 0 ||
        bounds.x + bounds.width > pageW + 0.5 ||
        bounds.y + bounds.height > pageH + 0.5
      );
    });
  }

  function hitTestBackground(project, page, x, y) {
    if (!model.canEditPageBackground(project, page)) return null;
    const background = model.effectiveBackground(project, page);
    const items = background && (background.items || background.images);
    if (!Array.isArray(items)) return null;
    const pageSize = project.pageSize;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (!item) continue;
      let rect;
      let visible = null;
      if (item.kind === 'shape') {
        rect = { x: item.x, y: item.y, width: item.width, height: item.height };
      } else {
        if (!item.assetId) continue;
        const img = L.assets.getCachedImage(item.assetId);
        if (!img) continue;
        rect = backgroundImageRect(pageSize, item, img);
        visible = model.visibleRect(rect, imageNatural(img), cropOf(item));
      }
      if (!(rect.width > 0) || !(rect.height > 0)) continue;
      if (visible && (!(visible.width > 0) || !(visible.height > 0))) continue;
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const local = model.rotateVector(x - centerX, y - centerY, -model.rotationRadians(item));
      let hit;
      if (item.kind === 'shape') {
        hit = shape.shapeContains(item, local.x, local.y);
      } else {
        const visibleX = visible.x + visible.width / 2 - centerX;
        const visibleY = visible.y + visible.height / 2 - centerY;
        hit = Math.abs(local.x - visibleX) <= visible.width / 2 &&
          Math.abs(local.y - visibleY) <= visible.height / 2;
      }
      if (hit) {
        return {
          background: background,
          item: item,
          image: item.kind === 'shape' ? null : item,
          index: i,
          rect: visible || rect
        };
      }
    }
    return null;
  }

  function pageAssets(project, page) {
    const ids = new Set();
    const background = model.effectiveBackground(project, page);
    const items = background && (background.items || background.images);
    if (Array.isArray(items)) {
      items.forEach(function (item) {
        if (item && item.kind !== 'shape' && item.assetId) ids.add(item.assetId);
      });
    }
    page.elements.forEach(function (element) {
      if (element.type === 'image' && element.assetId) ids.add(element.assetId);
    });
    return Array.from(ids);
  }

  function allBackgroundAssets(project) {
    const ids = new Set();
    (project.pages || []).forEach(function (page) {
      const background = page && page.background;
      const items = background && (background.items || background.images);
      (items || []).forEach(function (item) {
        if (item && item.kind !== 'shape' && item.assetId) ids.add(item.assetId);
      });
    });
    return Array.from(ids);
  }

  L.render = {
    roundRect: roundRect,
    backgroundGeometry: backgroundGeometry,
    backgroundImageRect: backgroundImageRect,
    backgroundVisibleRect: backgroundVisibleRect,
    backgroundVisibleBox: backgroundVisibleBox,
    elementVisibleRect: elementVisibleRect,
    elementVisibleBox: elementVisibleBox,
    elementVisibleLocalRect: elementVisibleLocalRect,
    paintBackground: paintBackground,
    paintBackgroundPreviews: paintBackgroundPreviews,
    drawBackground: drawBackground,
    drawFreeText: drawFreeText,
    drawFreeImage: drawFreeImage,
    drawShape: drawShape,
    drawCategory: drawCategory,
    drawPage: drawPage,
    elementBounds: elementBounds,
    elementCorners: elementCorners,
    elementAabb: elementAabb,
    imageLocalPoint: imageLocalPoint,
    hitTest: hitTest,
    hitTestBackground: hitTestBackground,
    tableDividers: tableDividers,
    pageOverflow: pageOverflow,
    pageAssets: pageAssets,
    allBackgroundAssets: allBackgroundAssets,
    hueFilter: hueFilter,
    setBlurCacheFrozen: setBlurCacheFrozen,
    cacheStats: function () {
      return { entries: processedImages.size, pixels: processedImagePixels, frozen: processedCacheFrozen };
    }
  };
})();
