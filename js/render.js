(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;

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

  function drawBackground(ctx, project, page) {
    const background = model.effectiveBackground(project, page);
    const pageSize = project.pageSize;
    const pw = pageSize.width;
    const ph = pageSize.height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    ctx.fillStyle = (background && background.color) || model.DEFAULT_BACKGROUND_COLOR;
    ctx.fillRect(0, 0, pw, ph);
    if (background && Array.isArray(background.images)) {
      background.images.forEach(function (image) {
        if (!image || !image.assetId) return;
        const img = L.assets.getCachedImage(image.assetId);
        if (!img) return;
        const rect = backgroundImageRect(pageSize, image, img);
        if (!(rect.width > 0) || !(rect.height > 0)) return;
        ctx.save();
        ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
        ctx.rotate(model.rotationRadians(image));
        ctx.globalAlpha = model.clamp(Number(image.opacity), 0, 1);
        const blur = Number(image.blur);
        if (blur > 0) ctx.filter = 'blur(' + blur + 'px)';
        ctx.drawImage(img, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
        ctx.restore();
      });
    }
    ctx.restore();
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

  function drawFreeImage(ctx, element) {
    if (!element.assetId) return;
    const img = L.assets.getCachedImage(element.assetId);
    if (!img) return;
    const width = element.width;
    const height = element.height;
    ctx.save();
    ctx.translate(element.x + width / 2, element.y + height / 2);
    ctx.rotate(model.rotationRadians(element));
    ctx.beginPath();
    ctx.rect(-width / 2, -height / 2, width, height);
    ctx.clip();
    ctx.globalAlpha = model.clamp(Number(element.opacity), 0, 1);
    const blur = Number(element.blur);
    if (blur > 0) ctx.filter = 'blur(' + blur + 'px)';
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
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
    const computed = layout.layoutCategory(category, element);
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
    if (includeBackground) drawBackground(ctx, project, page, editMode);
    page.elements.forEach(function (element) {
      if (includeElementTypes && includeElementTypes.indexOf(element.type) === -1) return;
      if (element.type === 'category') {
        drawCategory(ctx, project, page, element, editMode, element.id === selectedId);
      } else if (element.type === 'text') {
        drawFreeText(ctx, element, editMode);
      } else if (element.type === 'image') {
        drawFreeImage(ctx, element);
      }
    });
    ctx.restore();
  }

  function elementBounds(project, page, element) {
    let height = 0;
    if (element.type === 'category') {
      const category = model.getCategory(project, element.category);
      height = layout.layoutCategory(category, element).blockHeight;
    } else if (element.type === 'text') {
      height = layout.layoutText(element).height;
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
        if (Math.abs(local.x) <= bounds.width / 2 && Math.abs(local.y) <= bounds.height / 2) {
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
    const computed = layout.layoutCategory(model.getCategory(project, element.category), element);
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
      if (element.type === 'image') {
        return elementCorners(element).some(function (corner) {
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
    const background = model.effectiveBackground(project, page);
    if (!background || !Array.isArray(background.images)) return null;
    const pageSize = project.pageSize;
    for (let i = background.images.length - 1; i >= 0; i -= 1) {
      const image = background.images[i];
      if (!image || !image.assetId) continue;
      const img = L.assets.getCachedImage(image.assetId);
      if (!img) continue;
      const rect = backgroundImageRect(pageSize, image, img);
      if (!(rect.width > 0) || !(rect.height > 0)) continue;
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const local = model.rotateVector(x - centerX, y - centerY, -model.rotationRadians(image));
      if (Math.abs(local.x) <= rect.width / 2 && Math.abs(local.y) <= rect.height / 2) {
        return { background: background, image: image, index: i, rect: rect };
      }
    }
    return null;
  }

  function pageAssets(project, page) {
    const ids = new Set();
    const background = model.effectiveBackground(project, page);
    if (background && Array.isArray(background.images)) {
      background.images.forEach(function (image) {
        if (image && image.assetId) ids.add(image.assetId);
      });
    }
    page.elements.forEach(function (element) {
      if (element.type === 'image' && element.assetId) ids.add(element.assetId);
    });
    return Array.from(ids);
  }

  function allBackgroundAssets(project) {
    const ids = new Set();
    (project.backgrounds || []).forEach(function (background) {
      (background.images || []).forEach(function (image) {
        if (image && image.assetId) ids.add(image.assetId);
      });
    });
    return Array.from(ids);
  }

  L.render = {
    roundRect: roundRect,
    backgroundGeometry: backgroundGeometry,
    backgroundImageRect: backgroundImageRect,
    drawBackground: drawBackground,
    drawFreeText: drawFreeText,
    drawFreeImage: drawFreeImage,
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
    allBackgroundAssets: allBackgroundAssets
  };
})();
