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

  function measureText(text, style) {
    measureCtx.font = model.fontString(style);
    return measureCtx.measureText(String(text == null ? '' : text)).width;
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

  function assignTableSongs(sorted, table, cursor, tableWidth, songStyle) {
    const columns = table.columns;
    const isDynamic = table.rows === 0;
    const remaining = Math.max(0, sorted.length - cursor);
    const take = isDynamic ? remaining : Math.min(remaining, columns * table.rows);
    const rowCount = isDynamic ? (take === 0 ? 0 : Math.ceil(take / columns)) : table.rows;
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

  function layoutCategory(category, element) {
    const songs = category ? category.songs : [];
    normalizeTables(element, songs.length);
    const sorted = sortSongs(songs);
    const titleWidth = Math.max(1, element.width - BLOCK_PADDING * 2);
    const titleLines = wrapText(
      category ? category.name : '',
      titleWidth,
      element.titleStyle
    );
    const titleLineHeight = element.titleStyle.fontSize * element.titleStyle.lineHeight;
    const titleHeight = Math.max(1, titleLines.length) * titleLineHeight;

    let cursor = 0;
    let tableY = BLOCK_PADDING + titleHeight + TITLE_GAP;
    const tables = element.tables.map(function (table) {
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
        element.songStyle
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
      titleLines: titleLines,
      titleLineHeight: titleLineHeight,
      titleHeight: titleHeight,
      titleY: BLOCK_PADDING,
      titleWidth: titleWidth,
      tables: tables,
      blockHeight: tableY + (hasTableRows ? 0 : BLOCK_PADDING),
      padding: BLOCK_PADDING,
      titleGap: TITLE_GAP,
      cellPadX: CELL_PAD_X,
      cellPadY: CELL_PAD_Y,
      rowHeight: element.songStyle.fontSize * element.songStyle.lineHeight + CELL_PAD_Y * 2,
      sorted: sorted
    };
    element._layout = layout;
    return layout;
  }

  function layoutText(element) {
    const lines = wrapText(element.text, element.width, element.style);
    const lineHeight = element.style.fontSize * element.style.lineHeight;
    return {
      lines: lines,
      lineHeight: lineHeight,
      height: Math.max(lineHeight, lines.length * lineHeight)
    };
  }

  function elementHeight(element, category) {
    if (element.type === 'category') {
      return layoutCategory(category, element).blockHeight;
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
    const layout = layoutCategory(category, element);
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

  function devChecks() {
    const checks = [];
    function check(name, actual, expected) {
      const pass = typeof expected === 'function' ? expected(actual) : actual === expected;
      checks.push({ name: name, pass: !!pass, actual: actual, expected: expected });
    }

    check('virtualWidth Hi = 2', virtualWidth('Hi'), 2);
    check('virtualWidth Hello = 5', virtualWidth('Hello'), 5);
    check('virtualWidth 真的爱你 = 8', virtualWidth('真的爱你'), 8);
    check(
      'stable ascending sort',
      JSON.stringify(sortSongs(['Hello', '真的爱你', 'Hi'])),
      JSON.stringify(['Hi', 'Hello', '真的爱你'])
    );

    const defaultTable = model.createTable();
    check(
      'default table margins are zero',
      JSON.stringify(defaultTable.margins),
      JSON.stringify({ top: 0, right: 0, bottom: 0, left: 0 })
    );
    check(
      'default table margins are fresh objects',
      defaultTable.margins !== model.createTable().margins,
      true
    );
    check(
      'normalizeMargins(undefined) is zero',
      JSON.stringify(model.normalizeMargins(undefined)),
      JSON.stringify({ top: 0, right: 0, bottom: 0, left: 0 })
    );
    check(
      'normalizeMargins clamps invalid values',
      JSON.stringify(model.normalizeMargins({ top: -5, right: NaN, bottom: '8', left: Infinity })),
      JSON.stringify({ top: 0, right: 0, bottom: 8, left: 0 })
    );
    const normalizedMargins = model.normalizeMargins();
    normalizedMargins.top = 12;
    check('normalizeMargins returns fresh objects', model.normalizeMargins().top, 0);

    const pure = autoGapWidths([100, 150, 200], 600);
    check('autoGapWidths gap = 75', pure.gap, 75);
    check(
      'autoGapWidths widths [175, 225, 200]',
      JSON.stringify(pure.widths),
      JSON.stringify([175, 225, 200])
    );
    check(
      'autoGapWidths contentWidths = raw',
      JSON.stringify(pure.contentWidths),
      JSON.stringify([100, 150, 200])
    );
    check('autoGapWidths last column absorbs float', Math.abs(pure.widths[2] - 200) < 0.01, true);
    check('autoGapWidths not fallback', pure.fallback, false);

    const fallbackPure = autoGapWidths([100, 150, 200], 300);
    check('autoGapWidths fallback flag', fallbackPure.fallback, true);
    check('autoGapWidths fallback gap = 0', fallbackPure.gap, 0);
    check(
      'autoGapWidths fallback matches fitWidths',
      JSON.stringify(fallbackPure.widths),
      JSON.stringify(fitWidths([100, 150, 200], 300))
    );
    check(
      'autoGapWidths fallback contentWidths = widths',
      JSON.stringify(fallbackPure.contentWidths),
      JSON.stringify(fallbackPure.widths)
    );

    const singlePure = autoGapWidths([100], 600);
    check('autoGapWidths single width = total', Math.abs(singlePure.widths[0] - 600) < 0.01, true);
    check(
      'autoGapWidths single contentWidth = total',
      Math.abs(singlePure.contentWidths[0] - 600) < 0.01,
      true
    );
    check('autoGapWidths single gap = 0', singlePure.gap, 0);

    const exactPure = autoGapWidths([100, 200], 300);
    check('autoGapWidths exact gap = 0', exactPure.gap, 0);
    check(
      'autoGapWidths exact widths',
      JSON.stringify(exactPure.widths),
      JSON.stringify([100, 200])
    );

    function pageProject() {
      return {
        pageSize: { width: 800, height: 1200 },
        margins: { top: 0, right: 0, bottom: 0, left: 0 }
      };
    }

    function contentDelta(table, col) {
      const cell = table.cells.find(function (item) { return item && item.col === col; });
      return cell ? cell.width - cell.contentWidth : 0;
    }

    const category = { name: '测试', songs: [] };
    for (let i = 1; i <= 21; i += 1) category.songs.push('歌曲' + i);
    const element = model.createCategoryElement('测试', 0, 0, {
      pageSize: { width: 800, height: 1200 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 }
    }, 600);
    element.tables = [model.createTable({ columns: 5, rows: 0 })];
    const layout = layoutCategory(category, element);
    check('21 songs / 5 columns / dynamic rows = 5', layout.tables[0].rows, 5);
    check('21 songs / 5 columns / 25 cells', layout.tables[0].cells.length, 25);
    check(
      '4 empty cells',
      layout.tables[0].cells.filter(function (cell) { return !cell; }).length,
      4
    );

    const fixed = model.createCategoryElement('固定', 0, 0, {
      pageSize: { width: 800, height: 1200 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 }
    }, 600);
    fixed.tables = [model.createTable({ columns: 2, rows: 2 })];
    fixed.category = '固定';
    const shortCategory = { name: '固定', songs: ['a', 'b', 'c', 'd', 'e', 'f'] };
    const fixedLayout = layoutCategory(shortCategory, fixed);
    check('fixed full appends dynamic table', fixedLayout.tables.length, 2);
    check('appended dynamic table rows = 1', fixedLayout.tables[1].rows, 1);
    check('appended table persisted', fixed.tables.length, 2);

    const widthsSum = layout.tables[0].widths.reduce(function (a, b) { return a + b; }, 0);
    check('auto column widths sum to table width', Math.abs(widthsSum - layout.tables[0].tableWidth) < 0.01, true);

    const gapTable = layout.tables[0];
    if (!gapTable.fallback) {
      const firstGaps = [];
      for (let col = 0; col < gapTable.columns - 1; col += 1) {
        firstGaps.push(contentDelta(gapTable, col));
      }
      check('auto gap is positive', gapTable.gap > 0, true);
      check(
        'first n-1 content gaps are equal',
        firstGaps.every(function (delta) { return Math.abs(delta - gapTable.gap) < 0.01; }),
        true
      );
      check(
        'last column has no extra width',
        Math.abs(contentDelta(gapTable, gapTable.columns - 1)) < 0.01,
        true
      );
    }
    const gapCell = gapTable.cells.find(function (cell) { return cell; });
    check(
      'cell innerWidth uses contentWidth',
      gapCell
        ? Math.abs(gapCell.innerWidth - Math.max(0, gapCell.contentWidth - CELL_PAD_X * 2)) < 0.01
        : false,
      true
    );

    check('table width fills block width', layout.tables[0].tableWidth, element.width);
    check('zero-margin table starts at block left', layout.tables[0].x, 0);
    check(
      'zero-margin first table y unchanged',
      Math.abs(layout.tables[0].y - (BLOCK_PADDING + layout.titleHeight + TITLE_GAP)) < 0.01,
      true
    );
    const lastTable = layout.tables[layout.tables.length - 1];
    check(
      'block bottom meets last table bottom',
      Math.abs(layout.blockHeight - (lastTable.y + lastTable.height)) < 0.01,
      true
    );

    const marginElement = model.createCategoryElement('边距', 0, 0, pageProject(), 600);
    marginElement.tables = [
      model.createTable({ columns: 2, rows: 1, margins: { top: 10, right: 60, bottom: 20, left: 40 } }),
      model.createTable({ columns: 2, rows: 1, margins: { top: 30, right: 0, bottom: 32, left: 0 } })
    ];
    const marginLayout = layoutCategory({ name: '边距', songs: ['a', 'b', 'c', 'd'] }, marginElement);
    const firstMarginTable = marginLayout.tables[0];
    const secondMarginTable = marginLayout.tables[1];
    check('left margin sets table x', firstMarginTable.x, 40);
    check('right/left margins shrink table width', firstMarginTable.tableWidth, 500);
    const marginTableRight = firstMarginTable.x + firstMarginTable.widths.reduce(function (a, b) {
      return a + b;
    }, 0);
    check('last column ends at right inset', Math.abs(marginTableRight - 540) < 0.01, true);
    check(
      'first table top adds top margin',
      Math.abs(firstMarginTable.y - (BLOCK_PADDING + marginLayout.titleHeight + TITLE_GAP + 10)) < 0.01,
      true
    );
    check(
      'adjacent table margins add up',
      Math.abs(secondMarginTable.y - (firstMarginTable.y + firstMarginTable.height) - 50) < 0.01,
      true
    );
    check(
      'last bottom margin extends block height',
      Math.abs(marginLayout.blockHeight - (secondMarginTable.y + secondMarginTable.height) - 32) < 0.01,
      true
    );

    const oversizedElement = model.createCategoryElement('超宽边距', 0, 0, pageProject(), 600);
    oversizedElement.tables = [
      model.createTable({ columns: 2, rows: 1, margins: { left: 1000, right: 1000 } })
    ];
    const oversizedLayout = layoutCategory({ name: '超宽边距', songs: ['a'] }, oversizedElement);
    const oversizedTable = oversizedLayout.tables[0];
    check('oversized margins keep 40px minimum width', oversizedTable.tableWidth, 40);
    check(
      'oversized margins keep table inside block',
      oversizedTable.x >= 0 && oversizedTable.x + oversizedTable.tableWidth <= oversizedElement.width,
      true
    );

    const copyElement = model.createCategoryElement('复制边距', 0, 0, pageProject(), 600);
    copyElement.tables = [
      model.createTable({ columns: 2, rows: 1, margins: { top: 5, right: 6, bottom: 7, left: 8 } })
    ];
    const addedIndex = addTable(copyElement, { name: '复制边距', songs: ['a', 'b'] });
    const copiedTable = copyElement.tables[addedIndex];
    check(
      'addTable copies margins',
      JSON.stringify(copiedTable.margins),
      JSON.stringify({ top: 5, right: 6, bottom: 7, left: 8 })
    );
    check('addTable margins are not shared', copiedTable.margins !== copyElement.tables[0].margins, true);
    copiedTable.margins.top = 99;
    check('changing copied margins leaves source intact', copyElement.tables[0].margins.top, 5);

    const autoCopyElement = model.createCategoryElement('自动复制', 0, 0, pageProject(), 600);
    autoCopyElement.tables = [
      model.createTable({ columns: 2, rows: 1, margins: { top: 3, right: 4, bottom: 5, left: 6 } })
    ];
    layoutCategory({ name: '自动复制', songs: ['a', 'b', 'c'] }, autoCopyElement);
    check('auto-continued table copies margins', autoCopyElement.tables.length, 2);
    check(
      'auto-continued margins are not shared',
      autoCopyElement.tables[1].margins !== autoCopyElement.tables[0].margins,
      true
    );
    autoCopyElement.tables[1].margins.left = 77;
    check('changing auto-continued margins leaves source intact', autoCopyElement.tables[0].margins.left, 6);

    const manual = model.createCategoryElement('手动', 0, 0, {
      pageSize: { width: 800, height: 1200 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 }
    }, 600);
    manual.tables = [model.createTable({ columns: 2, rows: 0, widthMode: 'manual', widths: [100, 200] })];
    const manualLayout = layoutCategory({ name: '手动', songs: ['短', '很长很长的歌名'] }, manual);
    const manualSum = manualLayout.tables[0].widths.reduce(function (a, b) { return a + b; }, 0);
    check('manual widths fill table width', Math.abs(manualSum - manualLayout.tables[0].tableWidth) < 0.01, true);
    check('manual gap = 0', manualLayout.tables[0].gap, 0);
    check(
      'manual contentWidths = widths',
      JSON.stringify(manualLayout.tables[0].contentWidths),
      JSON.stringify(manualLayout.tables[0].widths)
    );
    scaleManualWidths(manual, 1.5);
    check('manual widths scale', manual.tables[0].widths[0] > 100, true);

    const singleElement = model.createCategoryElement('单列', 0, 0, pageProject(), 600);
    singleElement.tables = [model.createTable({ columns: 1, rows: 0 })];
    const singleLayout = layoutCategory({ name: '单列', songs: ['短', '很长很长的歌名'] }, singleElement);
    check(
      'single column fills table width',
      Math.abs(singleLayout.tables[0].widths[0] - singleLayout.tables[0].tableWidth) < 0.01,
      true
    );
    check('single column gap = 0', singleLayout.tables[0].gap, 0);
    check(
      'single column contentWidth = table width',
      Math.abs(singleLayout.tables[0].cells[0].contentWidth - singleLayout.tables[0].tableWidth) < 0.01,
      true
    );

    const emptyElement = model.createCategoryElement('空表', 0, 0, pageProject(), 600);
    emptyElement.tables = [model.createTable({ columns: 3, rows: 2 })];
    const emptyLayout = layoutCategory({ name: '空表', songs: [] }, emptyElement);
    const emptySum = emptyLayout.tables[0].widths.reduce(function (a, b) { return a + b; }, 0);
    check('empty table gap = 0', emptyLayout.tables[0].gap, 0);
    check('empty table widths sum to table width', Math.abs(emptySum - emptyLayout.tables[0].tableWidth) < 0.01, true);
    check('empty table has no cells', emptyLayout.tables[0].cells.every(function (cell) { return !cell; }), true);


    const justifyElement = model.createCategoryElement('对齐', 0, 0, {
      pageSize: { width: 800, height: 1200 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 }
    }, 600);
    justifyElement.tables = [model.createTable({ columns: 3, rows: 0, align: 'justify' })];
    const justifyLayout = layoutCategory({ name: '对齐', songs: ['A', '长歌名'] }, justifyElement);
    const oneChar = justifyLayout.tables[0].cells.find(function (cell) {
      return cell && Array.from(cell.text).length === 1;
    });
    check('single char justify spacing = 0', oneChar ? oneChar.justifySpacing : -1, 0);

    const alignSongs = ['1', '22', '333', '4444', '55555', '666666'];
    function alignFixture(align) {
      const element = model.createCategoryElement('对齐', 0, 0, pageProject(), 600);
      element.tables = [model.createTable({ columns: 3, rows: 0, align: align })];
      return layoutCategory({ name: '对齐', songs: alignSongs }, element).tables[0];
    }
    const leftAligned = alignFixture('left');
    const centerAligned = alignFixture('center');
    const rightAligned = alignFixture('right');
    check(
      'center alignment keeps rendered widths',
      JSON.stringify(centerAligned.widths),
      JSON.stringify(leftAligned.widths)
    );
    check(
      'right alignment keeps content widths',
      JSON.stringify(rightAligned.contentWidths),
      JSON.stringify(leftAligned.contentWidths)
    );
    const alignGaps = [0, 1].map(function (col) { return contentDelta(centerAligned, col); });
    check(
      'center alignment keeps equal gaps',
      alignGaps.every(function (delta) { return Math.abs(delta - centerAligned.gap) < 0.01; }) &&
        Math.abs(contentDelta(centerAligned, 2)) < 0.01,
      true
    );

    const pass = checks.every(function (item) { return item.pass; });
    if (console && console.table) console.table(checks);
    return { pass: pass, checks: checks };
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
    devChecks: devChecks
  };
})();
