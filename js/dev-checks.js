(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  // 开发期自检：仅依赖 L.model / L.layout 的公开接口；该文件不进入发布产物。
  function devChecks() {
    const model = L.model;
    const {
      virtualWidth, sortSongs, autoGapWidths, fitWidths, layoutCategory, layoutText,
      beginFrame, addTable, scaleManualWidths,
      BLOCK_PADDING, TITLE_GAP, CELL_PAD_X
    } = L.layout;

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

    beginFrame();
    const cacheCategory = { name: '缓存', songs: ['a', 'b', 'c'] };
    const cacheElement = model.createCategoryElement('缓存', 0, 0, pageProject(), 600);
    const cacheFirst = layoutCategory(cacheCategory, cacheElement);
    cacheElement.songStyle.color = '#ff0000';
    beginFrame();
    const cacheAfterColor = layoutCategory(cacheCategory, cacheElement);
    check('布局缓存忽略纯颜色变化', cacheAfterColor === cacheFirst, true);
    cacheElement.width = 500;
    beginFrame();
    const cacheAfterWidth = layoutCategory(cacheCategory, cacheElement);
    check('布局缓存随宽度失效', cacheAfterWidth !== cacheAfterColor, true);

    const cacheText = model.createTextElement(
      { pageSize: { width: 800, height: 1200 }, margins: { top: 0, right: 0, bottom: 0, left: 0 } },
      '缓存文字',
      { elements: [] }
    );
    const textFirst = layoutText(cacheText);
    cacheText.style.color = '#00ff00';
    beginFrame();
    const textAfterColor = layoutText(cacheText);
    check('文字布局缓存忽略纯颜色变化', textAfterColor === textFirst, true);
    cacheText.text = '缓存文字已修改';
    beginFrame();
    const textAfterChange = layoutText(cacheText);
    check('文字布局缓存随内容失效', textAfterChange !== textAfterColor, true);

    const pass = checks.every(function (item) { return item.pass; });
    if (console && console.table) console.table(checks);
    return { pass: pass, checks: checks };
  }

  L.devChecks = devChecks;
})();
