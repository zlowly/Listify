(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;

  const BLOCK_PADDING = 16;
  const TITLE_GAP = 10;
  const CELL_PAD_X = 8;
  const CELL_PAD_Y = 4;
  const MIN_COL_WIDTH = 24;
  const MIN_TABLE_WIDTH = 40;
  const SAFETY = 2;

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');

  let frameToken = 0;
  let inputEpoch = 0;
  const stats = { layoutRecomputes: 0, layoutHits: 0, measureCalls: 0 };

  function beginFrame() {
    frameToken += 1;
  }

  function invalidate() {
    inputEpoch += 1;
  }

  function getStats() {
    return {
      layoutRecomputes: stats.layoutRecomputes,
      layoutHits: stats.layoutHits,
      measureCalls: stats.measureCalls
    };
  }

  function resetStats() {
    stats.layoutRecomputes = 0;
    stats.layoutHits = 0;
    stats.measureCalls = 0;
  }

  function measureText(text, style) {
    stats.measureCalls += 1;
    measureCtx.font = model.fontString(style);
    return measureCtx.measureText(String(text == null ? '' : text)).width;
  }

  function fontSignature(style) {
    const source = style || {};
    const families = Array.isArray(source.fontFamilies)
      ? source.fontFamilies.join('\u0001')
      : (source.fontFamily || '');
    return [families, source.fontSize, source.fontWeight, source.fontStyle].join('\u0002');
  }

  function tablesSignature(element) {
    return (element.tables || []).map(function (table) {
      const margins = model.normalizeMargins(table.margins);
      return [
        table.columns,
        table.rows,
        table.fill,
        table.align,
        table.widthMode,
        (table.widths || []).join(','),
        margins.top,
        margins.right,
        margins.bottom,
        margins.left
      ].join('\u0003');
    }).join('\u0004');
  }

  function cachedSignature(element, mode, build) {
    const memo = element._layoutSignature;
    if (memo && memo.token === frameToken && memo.epoch === inputEpoch && memo.mode === mode) {
      return memo.value;
    }
    const value = build();
    element._layoutSignature = { token: frameToken, epoch: inputEpoch, mode: mode, value: value };
    return value;
  }

  function wrapText(text, maxWidth, style) {
    const source = String(text == null ? '' : text);
    if (!source) return [''];
    const paragraphs = source.split(/\r?\n/);
    const lines = [];
    const limit = Math.max(1, maxWidth);
    paragraphs.forEach(function (paragraph) {
      if (!paragraph) {
        lines.push('');
        return;
      }
      let line = '';
      for (const char of paragraph) {
        if (!line && char === ' ') continue;
        const candidate = line + char;
        if (line && measureText(candidate, style) > limit) {
          lines.push(line.replace(/\s+$/, ''));
          line = char === ' ' ? '' : char;
        } else {
          line = candidate;
        }
      }
      lines.push(line.replace(/\s+$/, ''));
    });
    return lines.length ? lines : [''];
  }

  function virtualWidth(text) {
    return model.virtualWidth(text);
  }

  function sortSongs(songs) {
    return (songs || []).map(function (text, index) {
      return { text: text, index: index, width: virtualWidth(text) };
    }).sort(function (a, b) {
      return a.width - b.width || a.index - b.index;
    }).map(function (item) {
      return item.text;
    });
  }

  function normalizeTables(element, songCount) {
    if (!Array.isArray(element.tables) || !element.tables.length) {
      element.tables = [model.createTable()];
    }
    const tables = element.tables;
    tables.forEach(function (table, index) {
      table.columns = Math.max(1, Math.min(50, Math.round(Number(table.columns) || 1)));
      table.rows = Math.max(0, Math.round(Number(table.rows) || 0));
      if (index < tables.length - 1 && table.rows === 0) table.rows = 1;
      if (!Array.isArray(table.widths)) table.widths = [];
      if (table.widthMode !== 'manual') table.widthMode = 'auto';
      if (table.fill !== 'row') table.fill = 'column';
      if (['left', 'center', 'right', 'justify'].indexOf(table.align) < 0) table.align = 'left';
      table.margins = model.normalizeMargins(table.margins);
    });

    const last = tables[tables.length - 1];
    if (last.rows > 0) {
      let capacity = 0;
      tables.forEach(function (table) { capacity += table.columns * table.rows; });
      if (songCount > capacity) {
        tables.push({
          columns: last.columns,
          rows: 0,
          fill: last.fill,
          align: last.align,
          widthMode: last.widthMode,
          widths: last.widths.slice(),
          margins: model.normalizeMargins(last.margins)
        });
      }
    }
  }

  function fitWidths(rawWidths, totalWidth) {
    const count = rawWidths.length;
    if (!count) return [];
    const total = Math.max(1, totalWidth);
    const min = Math.min(MIN_COL_WIDTH, total / count);
    const minimums = rawWidths.map(function () { return min; });
    const minSum = min * count;
    if (minSum >= total) {
      return rawWidths.map(function () { return total / count; });
    }
    const weights = rawWidths.map(function (value) {
      return Math.max(0, value - min);
    });
    let weightSum = weights.reduce(function (a, b) { return a + b; }, 0);
    if (weightSum <= 0) {
      return rawWidths.map(function () { return total / count; });
    }
    const widths = weights.map(function (weight) {
      return min + (total - minSum) * weight / weightSum;
    });
    let sum = widths.reduce(function (a, b) { return a + b; }, 0);
    const last = widths.length - 1;
    widths[last] += total - sum;
    return widths;
  }

  function autoGapWidths(rawWidths, totalWidth) {
    const count = rawWidths.length;
    const total = Math.max(1, totalWidth);
    if (!count) return { widths: [], contentWidths: [], gap: 0, fallback: false };
    if (count === 1) {
      return { widths: [total], contentWidths: [total], gap: 0, fallback: false };
    }

    const sum = rawWidths.reduce(function (a, b) { return a + b; }, 0);
    const gap = (total - sum) / (count - 1);

    if (gap < 0) {
      const compressed = fitWidths(rawWidths, total);
      return { widths: compressed, contentWidths: compressed.slice(), gap: 0, fallback: true };
    }

    const widths = [];
    let used = 0;
    for (let col = 0; col < count - 1; col += 1) {
      widths.push(rawWidths[col] + gap);
      used += widths[col];
    }
    widths.push(total - used);
    return {
      widths: widths,
      contentWidths: rawWidths.slice(),
      gap: gap,
      fallback: false
    };
  }

  function assignTableSongs(sorted, table, cursor, tableWidth, songStyle, placeholderEligible) {
    const columns = table.columns;
    const isDynamic = table.rows === 0;
    const remaining = Math.max(0, sorted.length - cursor);
    const take = isDynamic ? remaining : Math.min(remaining, columns * table.rows);
    const placeholder = !!(isDynamic && take === 0 && placeholderEligible);
    const rowCount = isDynamic
      ? (take === 0 ? (placeholder ? 1 : 0) : Math.ceil(take / columns))
      : table.rows;
    const songs = sorted.slice(cursor, cursor + take);
    const cells = new Array(rowCount * columns).fill(null);

    songs.forEach(function (text, index) {
      let row;
      let col;
      if (table.fill === 'row') {
        row = Math.floor(index / columns);
        col = index % columns;
      } else {
        row = index % Math.max(1, rowCount);
        col = Math.floor(index / Math.max(1, rowCount));
      }
      if (row < rowCount && col < columns) {
        cells[row * columns + col] = {
          text: text,
          index: index,
          row: row,
          col: col
        };
      }
    });

    const rawWidths = [];
    for (let col = 0; col < columns; col += 1) {
      let maxWidth = MIN_COL_WIDTH;
      for (let row = 0; row < rowCount; row += 1) {
        const cell = cells[row * columns + col];
        if (cell) {
          maxWidth = Math.max(
            maxWidth,
            measureText(cell.text, songStyle) + CELL_PAD_X * 2 + SAFETY
          );
        }
      }
      rawWidths.push(maxWidth);
    }

    const useManual =
      table.widthMode === 'manual' &&
      Array.isArray(table.widths) &&
      table.widths.length === columns &&
      table.widths.every(function (w) { return Number(w) > 0; });

    const auto = useManual
      ? null
      : (take === 0
        ? { widths: fitWidths(rawWidths, tableWidth), contentWidths: null, gap: 0, fallback: false }
        : autoGapWidths(rawWidths, tableWidth));

    const colWidths = useManual
      ? fitWidths(table.widths.map(Number), tableWidth)
      : auto.widths;
    const contentWidths = useManual
      ? colWidths
      : (auto.contentWidths || auto.widths);
    const gap = useManual ? 0 : auto.gap;
    const fallback = useManual ? false : !!auto.fallback;
    const rowHeight = songStyle.fontSize * songStyle.lineHeight + CELL_PAD_Y * 2;

    cells.forEach(function (cell) {
      if (!cell) return;
      cell.width = colWidths[cell.col];
      cell.x = colWidths.slice(0, cell.col).reduce(function (a, b) { return a + b; }, 0);
      cell.height = rowHeight;
      cell.y = cell.row * rowHeight;
      cell.contentWidth = contentWidths[cell.col];
      cell.innerWidth = Math.max(0, cell.contentWidth - CELL_PAD_X * 2);
      cell.textWidth = measureText(cell.text, songStyle);
      cell.overflow = cell.textWidth + SAFETY > cell.innerWidth;
      const charCount = Array.from(cell.text).length;
      cell.justifySpacing =
        table.align === 'justify' && charCount > 1
          ? Math.max(0, (cell.innerWidth - cell.textWidth) / (charCount - 1))
          : 0;
    });

    return {
      columns: columns,
      rows: rowCount,
      placeholder: placeholder,
      fill: table.fill,
      align: table.align,
      widthMode: useManual ? 'manual' : 'auto',
      widths: colWidths,
      contentWidths: contentWidths,
      rawWidths: rawWidths,
      gap: gap,
      fallback: fallback,
      cells: cells,
      height: rowCount * rowHeight,
      rowHeight: rowHeight,
      take: take,
      startIndex: cursor
    };
  }

  function layoutCategory(category, element, options) {
    const editMode = !!(options && options.editMode);
    const songs = category ? category.songs : [];
    normalizeTables(element, songs.length);
    const mode = editMode ? 'edit' : 'export';
    const signature = cachedSignature(element, mode, function () {
      return [
        editMode ? '1' : '0',
        element.width,
        element.showTitle !== false ? '1' : '0',
        category ? category.name : '',
        (songs || []).join('\u0001'),
        fontSignature(element.titleStyle),
        fontSignature(element.songStyle),
        Number(element.titleStyle.lineHeight),
        Number(element.songStyle.lineHeight),
        tablesSignature(element)
      ].join('\u0005');
    });
    if (!element._layoutCache) element._layoutCache = {};
    const cached = element._layoutCache[mode];
    if (cached && cached.signature === signature) {
      stats.layoutHits += 1;
      return cached.layout;
    }
    stats.layoutRecomputes += 1;
    const sorted = sortSongs(songs);
    const showTitle = element.showTitle !== false;
    const titleWidth = Math.max(1, element.width - BLOCK_PADDING * 2);
    const titleLines = showTitle
      ? wrapText(category ? category.name : '', titleWidth, element.titleStyle)
      : [];
    const titleLineHeight = element.titleStyle.fontSize * element.titleStyle.lineHeight;
    const titleHeight = showTitle ? Math.max(1, titleLines.length) * titleLineHeight : 0;

    let cursor = 0;
    let tableY = BLOCK_PADDING + titleHeight + (showTitle ? TITLE_GAP : 0);
    const tables = element.tables.map(function (table, index) {
      const margins = model.normalizeMargins(table.margins);
      const left = model.clamp(margins.left, 0, element.width);
      const right = model.clamp(margins.right, 0, element.width);
      const tableWidth = Math.max(MIN_TABLE_WIDTH, element.width - left - right);
      const tableX = Math.min(left, Math.max(0, element.width - tableWidth));
      tableY += margins.top;
      const assigned = assignTableSongs(
        sorted,
        table,
        cursor,
        tableWidth,
        element.songStyle,
        editMode && index === element.tables.length - 1
      );
      cursor += assigned.take;
      assigned.y = tableY;
      assigned.x = tableX;
      assigned.tableWidth = tableWidth;
      assigned.margins = margins;
      tableY += assigned.height;
      tableY += margins.bottom;
      return assigned;
    });

    const hasTableRows = tables.some(function (table) { return table.height > 0; });
    const layout = {
      showTitle: showTitle,
      titleLines: titleLines,
      titleLineHeight: titleLineHeight,
      titleHeight: titleHeight,
      titleY: BLOCK_PADDING,
      titleWidth: titleWidth,
      tables: tables,
      blockHeight: tableY + (hasTableRows ? 0 : BLOCK_PADDING),
      padding: BLOCK_PADDING,
      titleGap: showTitle ? TITLE_GAP : 0,
      cellPadX: CELL_PAD_X,
      cellPadY: CELL_PAD_Y,
      rowHeight: element.songStyle.fontSize * element.songStyle.lineHeight + CELL_PAD_Y * 2,
      sorted: sorted
    };
    if (!element._layoutByMode) element._layoutByMode = {};
    element._layoutByMode[mode] = layout;
    element._layoutCache[mode] = { signature: signature, layout: layout };
    return layout;
  }

  function layoutText(element) {
    const signature = cachedSignature(element, 'text', function () {
      return [
        element.text,
        element.width,
        fontSignature(element.style),
        Number(element.style.lineHeight)
      ].join('\u0005');
    });
    const cached = element._textLayoutCache;
    if (cached && cached.signature === signature) {
      stats.layoutHits += 1;
      return cached.layout;
    }
    stats.layoutRecomputes += 1;
    const lines = wrapText(element.text, element.width, element.style);
    const lineHeight = element.style.fontSize * element.style.lineHeight;
    const layout = {
      lines: lines,
      lineHeight: lineHeight,
      height: Math.max(lineHeight, lines.length * lineHeight)
    };
    element._textLayoutCache = { signature: signature, layout: layout };
    return layout;
  }

  function elementHeight(element, category, options) {
    if (element.type === 'category') {
      return layoutCategory(category, element, options).blockHeight;
    }
    if (element.type === 'text') {
      return layoutText(element).height;
    }
    return element.height || 0;
  }

  function setColumns(element, tableIndex, columns) {
    const table = element.tables[tableIndex];
    if (!table) return;
    table.columns = Math.max(1, Math.min(50, Math.round(Number(columns) || 1)));
    table.widthMode = 'auto';
    table.widths = [];
    if (table.rows === 0 && tableIndex < element.tables.length - 1) table.rows = 1;
  }

  function setRows(element, tableIndex, rows) {
    const table = element.tables[tableIndex];
    if (!table) return;
    const value = Math.max(0, Math.round(Number(rows) || 0));
    table.rows = tableIndex === element.tables.length - 1 ? value : Math.max(1, value);
  }

  function addTable(element, category) {
    // 冻结旧动态表行数必须用数据视角（不含占位行）
    const layout = layoutCategory(category, element, { editMode: false });
    const lastIndex = element.tables.length - 1;
    const last = element.tables[lastIndex];
    if (last && last.rows === 0) {
      const computed = layout.tables[lastIndex] ? layout.tables[lastIndex].rows : 0;
      last.rows = Math.max(1, computed);
    }
    const previous = element.tables[element.tables.length - 1];
    element.tables.push({
      columns: previous.columns,
      rows: 0,
      fill: previous.fill,
      align: previous.align,
      widthMode: previous.widthMode,
      widths: previous.widths.slice(),
      margins: model.normalizeMargins(previous.margins)
    });
    return element.tables.length - 1;
  }

  function removeTable(element, tableIndex) {
    if (element.tables.length <= 1) return false;
    element.tables.splice(tableIndex, 1);
    if (element.tables.length && element.tables[element.tables.length - 1].rows === 0) {
      const previous = element.tables[element.tables.length - 2];
      if (previous && previous.rows === 0) previous.rows = 1;
    }
    return true;
  }

  function resetAuto(element, tableIndex) {
    const table = element.tables[tableIndex];
    if (!table) return;
    table.widthMode = 'auto';
    table.widths = [];
  }

  function scaleManualWidths(element, factor) {
    if (!factor || factor === 1) return;
    element.tables.forEach(function (table) {
      if (table.widthMode === 'manual' && Array.isArray(table.widths) && table.widths.length) {
        table.widths = table.widths.map(function (width) {
          return Math.max(MIN_COL_WIDTH, width * factor);
        });
      }
    });
  }

  function setManualWidths(element, tableIndex, widths) {
    const table = element.tables[tableIndex];
    if (!table) return;
    table.widthMode = 'manual';
    table.widths = widths.map(function (width) {
      return Math.max(MIN_COL_WIDTH, Number(width) || MIN_COL_WIDTH);
    });
  }

  L.layout = {
    BLOCK_PADDING: BLOCK_PADDING,
    TITLE_GAP: TITLE_GAP,
    CELL_PAD_X: CELL_PAD_X,
    CELL_PAD_Y: CELL_PAD_Y,
    MIN_COL_WIDTH: MIN_COL_WIDTH,
    measureText: measureText,
    wrapText: wrapText,
    virtualWidth: virtualWidth,
    sortSongs: sortSongs,
    autoGapWidths: autoGapWidths,
    fitWidths: fitWidths,
    normalizeTables: normalizeTables,
    layoutCategory: layoutCategory,
    layoutText: layoutText,
    elementHeight: elementHeight,
    setColumns: setColumns,
    setRows: setRows,
    addTable: addTable,
    removeTable: removeTable,
    resetAuto: resetAuto,
    scaleManualWidths: scaleManualWidths,
    setManualWidths: setManualWidths,
    beginFrame: beginFrame,
    invalidate: invalidate,
    getStats: getStats,
    resetStats: resetStats
  };
})();
