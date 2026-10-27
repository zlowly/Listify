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

  function drawBackground(ctx, project, page, editMode) {
    const background = page.background || model.DEFAULT_BACKGROUND;
    const pw = project.pageSize.width;
    const ph = project.pageSize.height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    ctx.fillStyle = background.color || '#ffffff';
    ctx.fillRect(0, 0, pw, ph);
    if (background.assetId) {
      const img = L.assets.getCachedImage(background.assetId);
      if (img) {
        const geometry = backgroundGeometry(project.pageSize, img, background.fit || 'cover');
        ctx.globalAlpha = model.clamp(Number(background.opacity), 0, 1);
        if (Number(background.blur) > 0) {
          ctx.filter = 'blur(' + Number(background.blur) + 'px)';
        }
        ctx.drawImage(img, geometry.x, geometry.y, geometry.width, geometry.height);
      }
    }
    ctx.restore();
  }

  function drawImageFit(ctx, img, element) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const w = element.width;
    const h = element.height;
    if (element.fit === 'stretch') {
      ctx.drawImage(img, element.x, element.y, w, h);
      return;
    }
    if (element.fit === 'contain') {
      const scale = Math.min(w / iw, h / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, element.x + (w - dw) / 2, element.y + (h - dh) / 2, dw, dh);
      return;
    }
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, element.x + (w - dw) / 2, element.y + (h - dh) / 2, dw, dh);
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
    textLayout.lines.forEach(function (line, index) {
      const lineWidth = layout.measureText(line, style);
      let x = element.x;
      if (style.align === 'center') x += (element.width - lineWidth) / 2;
      if (style.align === 'right') x += element.width - lineWidth;
      ctx.fillText(line, x, element.y + textLayout.lineHeight * (index + 0.5));
    });
    ctx.restore();
  }

  function drawFreeImage(ctx, element) {
    if (!element.assetId) return;
    const img = L.assets.getCachedImage(element.assetId);
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(element.x, element.y, element.width, element.height);
    ctx.clip();
    ctx.globalAlpha = model.clamp(Number(element.opacity), 0, 1);
    drawImageFit(ctx, img, element);
    ctx.restore();
  }

  function drawJustifiedText(ctx, text, x, baseline, innerWidth) {
    const chars = Array.from(text);
    if (chars.length <= 1) {
      const width = ctx.measureText(text).width;
      ctx.fillText(text, x + (innerWidth - width) / 2, baseline);
      return;
    }
    const textWidth = ctx.measureText(text).width;
    const spacing = Math.max(0, (innerWidth - textWidth) / (chars.length - 1));
    let cursor = x;
    chars.forEach(function (char) {
      ctx.fillText(char, cursor, baseline);
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

    ctx.font = model.fontString(titleStyle);
    ctx.fillStyle = titleStyle.color || '#1f2937';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    computed.titleLines.forEach(function (line, index) {
      ctx.fillText(
        line,
        element.x + computed.padding,
        element.y + computed.titleY + computed.titleLineHeight * (index + 0.5)
      );
    });

    computed.tables.forEach(function (table) {
      const tableTop = element.y + table.y;
      if (editMode) {
        table.cells.forEach(function (cell) {
          if (cell && cell.overflow) {
            ctx.fillStyle = '#fee2e2';
            ctx.fillRect(
              element.x + computed.tableX + cell.x,
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
        const cellX = element.x + computed.tableX + cell.x;
        const cellY = tableTop + cell.y;
        const innerX = cellX + computed.cellPadX;
        const innerWidth = Math.max(0, cell.contentWidth - computed.cellPadX * 2);
        const baseline = cellY + cell.height / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(cellX, cellY, cell.contentWidth, cell.height);
        ctx.clip();
        if (table.align === 'justify') {
          drawJustifiedText(ctx, cell.text, innerX, baseline, innerWidth);
        } else {
          let textX = innerX;
          if (table.align === 'center') textX += (innerWidth - cell.textWidth) / 2;
          if (table.align === 'right') textX += innerWidth - cell.textWidth;
          ctx.fillText(cell.text, textX, baseline);
        }
        ctx.restore();
      });

      if (editMode) {
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(
          element.x + computed.tableX,
          tableTop,
          computed.tableWidth,
          table.height
        );
        for (let row = 1; row < table.rows; row += 1) {
          const y = tableTop + row * table.rowHeight;
          ctx.beginPath();
          ctx.moveTo(element.x + computed.tableX, y);
          ctx.lineTo(element.x + computed.tableX + computed.tableWidth, y);
          ctx.stroke();
        }
        let dividerX = element.x + computed.tableX;
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
      let dividerX = element.x + computed.tableX;
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
      const bounds = elementBounds(project, page, element);
      return (
        bounds.x < 0 ||
        bounds.y < 0 ||
        bounds.x + bounds.width > pageW + 0.5 ||
        bounds.y + bounds.height > pageH + 0.5
      );
    });
  }

  function pageAssets(page) {
    const ids = new Set();
    if (page.background && page.background.assetId) ids.add(page.background.assetId);
    page.elements.forEach(function (element) {
      if (element.type === 'image' && element.assetId) ids.add(element.assetId);
    });
    return Array.from(ids);
  }

  L.render = {
    roundRect: roundRect,
    backgroundGeometry: backgroundGeometry,
    drawBackground: drawBackground,
    drawFreeText: drawFreeText,
    drawFreeImage: drawFreeImage,
    drawCategory: drawCategory,
    drawPage: drawPage,
    elementBounds: elementBounds,
    hitTest: hitTest,
    tableDividers: tableDividers,
    pageOverflow: pageOverflow,
    pageAssets: pageAssets
  };
})();
