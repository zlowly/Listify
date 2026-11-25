'use strict';

/*
 * js/layout.js 的布局回归。
 * 运行：node --test scripts/checks/layout.test.js
 *
 * 基线来自 scripts/checks/loader.js 的确定性 measureText：
 *   measureText(text) = virtualWidth(text) * fontSize * 0.6
 * 不要覆盖 L.layout.measureText —— layout.js 内部按闭包调用它，覆盖导出无效。
 *
 * 期望值均按当前实现记录（拆分前基线）。以后改动 layout 若与这些值不符，
 * 应先确认是有意改行为，再同步更新这里的基线。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('./loader.js');

const L = load();
const model = L.model;
const layout = L.layout;
const plain = require('./loader.js').toPlain;

const PADDING = 16; // BLOCK_PADDING
const TITLE_GAP = 10;
const CELL_PAD_X = 8;
const CELL_PAD_Y = 4;
const SAFETY = 2;

function near(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    (message || '数值不接近') + '：实际 ' + actual + '，期望 ' + expected
  );
}

function project() {
  return {
    pageSize: { width: 800, height: 1200 },
    margins: { top: 0, right: 0, bottom: 0, left: 0 }
  };
}

function categoryElement(name, width, tables) {
  const element = model.createCategoryElement(name, 0, 0, project(), width);
  // 布局基线固定用 44/28 号字；默认初始值由 model.test.js 单独覆盖。
  element.titleStyle.fontSize = 44;
  element.songStyle.fontSize = 28;
  element.tables = tables;
  return element;
}

function songs(prefix, count) {
  const list = [];
  for (let i = 1; i <= count; i += 1) list.push(prefix + i);
  return list;
}

const SONG_STYLE = { fontSize: 28, fontWeight: 400, fontFamily: 'sans-serif', lineHeight: 1.35 };

/* ---------- 基线：确定性文本度量 ---------- */

test('measureText 基线：宽度只由虚拟宽度与字号决定', function () {
  near(layout.measureText('歌曲1', SONG_STYLE), 5 * 28 * 0.6); // 2 + 2 + 1 = 5
  near(layout.measureText('A', SONG_STYLE), 1 * 28 * 0.6);
  near(layout.measureText('好', SONG_STYLE), 2 * 28 * 0.6);
  near(layout.measureText('', SONG_STYLE), 0);
});

test('wrapText：按测量宽度折行，空串保留一行', function () {
  const style = { fontSize: 16, fontWeight: 400, fontFamily: 'sans-serif', lineHeight: 1.2 };
  // 每字符 16 * 0.6 = 9.6px，48px 恰好容纳 5 个 ASCII 或 2 个 CJK。
  assert.deepEqual(plain(layout.wrapText('abcdefghij', 48, style)), ['abcde', 'fghij']);
  assert.deepEqual(plain(layout.wrapText('一二三四五', 48, style)), ['一二', '三四', '五']);
  assert.deepEqual(plain(layout.wrapText('', 100, style)), ['']);
});

/* ---------- 列宽 ---------- */

test('列宽：动态行 + 自动列宽按内容宽度分配空隙', function () {
  const element = categoryElement('测试', 600, [model.createTable({ columns: 5, rows: 0 })]);
  const result = layout.layoutCategory({ name: '测试', songs: songs('歌曲', 21) }, element);
  const table = result.tables[0];

  // 21 首歌按宽度稳定排序后列优先填充，5 列 → 5 行。
  assert.equal(table.rows, 5);
  assert.equal(table.columns, 5);
  assert.equal(table.cells.length, 25);
  assert.equal(table.cells.filter(function (cell) { return !cell; }).length, 4);
  assert.equal(table.take, 21);
  assert.equal(table.startIndex, 0);

  // 原始列宽 = 该列最宽文本 + 左右单元格内边距 + 2px 安全量。
  assert.deepEqual(plain(table.rawWidths), [102, 118.8, 118.8, 118.8, 118.8]);
  assert.equal(table.fallback, false);
  near(table.gap, 5.7);
  near(table.widths[0], 107.7);
  near(table.widths[1], 124.5);
  near(table.widths[2], 124.5);
  near(table.widths[3], 124.5);
  near(table.widths[4], 118.8);
  assert.deepEqual(plain(table.contentWidths), [102, 118.8, 118.8, 118.8, 118.8]);
  near(table.widths.reduce(function (a, b) { return a + b; }, 0), 600);

  // 单元格几何：x/y/宽/高与内宽。
  const first = table.cells[0];
  assert.deepEqual(
    { text: first.text, row: first.row, col: first.col, x: first.x, y: first.y },
    { text: '歌曲1', row: 0, col: 0, x: 0, y: 0 }
  );
  near(first.width, 107.7);
  near(first.height, 28 * 1.35 + CELL_PAD_Y * 2); // 45.8
  near(first.innerWidth, 102 - CELL_PAD_X * 2); // 86
  near(first.textWidth, 84);
  assert.equal(first.overflow, false);
});

test('列宽：单列占满表格宽度', function () {
  const element = categoryElement('单列', 600, [model.createTable({ columns: 1, rows: 0 })]);
  const result = layout.layoutCategory({ name: '单列', songs: ['短', '很长很长的歌名'] }, element);
  const table = result.tables[0];
  assert.deepEqual(plain(table.widths), [600]);
  assert.deepEqual(plain(table.contentWidths), [600]);
  assert.equal(table.gap, 0);
  near(table.cells[0].contentWidth, 600);
});

test('列宽：手动列宽按总宽等比适配且 gap 为 0', function () {
  const element = categoryElement('手动', 600, [
    model.createTable({ columns: 2, rows: 0, widthMode: 'manual', widths: [100, 200] })
  ]);
  const result = layout.layoutCategory({ name: '手动', songs: ['短', '很长很长的歌名'] }, element);
  const table = result.tables[0];

  assert.equal(table.widthMode, 'manual');
  assert.equal(table.gap, 0);
  near(table.widths[0], 190.47619047619048);
  near(table.widths[1], 409.5238095238095);
  assert.deepEqual(plain(table.contentWidths), plain(table.widths));
  near(table.widths[0] + table.widths[1], 600);
  // 手动模式下 rawWidths 仍是内容测量值，供属性面板参考。
  near(table.rawWidths[0], 2 * 28 * 0.6 + CELL_PAD_X * 2 + SAFETY); // 短（CJK 记 2）
  near(table.rawWidths[1], 14 * 28 * 0.6 + CELL_PAD_X * 2 + SAFETY); // 7 个 CJK 字，各记 2
});

test('列宽：内容放不下时回退为等宽并标记 fallback', function () {
  const element = categoryElement('窄', 100, [model.createTable({ columns: 5, rows: 0 })]);
  const result = layout.layoutCategory({ name: '窄', songs: songs('歌曲', 5) }, element);
  const table = result.tables[0];

  assert.equal(table.tableWidth, 100);
  assert.equal(table.fallback, true);
  assert.equal(table.gap, 0);
  assert.deepEqual(plain(table.widths), [20, 20, 20, 20, 20]);
  assert.deepEqual(plain(table.contentWidths), plain(table.widths));
});

/* ---------- assignTableSongs：填充顺序 ---------- */

test('填充顺序：列优先（column）先填满一列再换列', function () {
  // 排序后：a(1), cc(2), bbbb(4), dddddd(6)，2 列 → 2 行。
  const element = categoryElement('列优先', 600, [
    model.createTable({ columns: 2, rows: 0, fill: 'column' })
  ]);
  const result = layout.layoutCategory({ name: '列优先', songs: ['a', 'bbbb', 'cc', 'dddddd'] }, element);
  const table = result.tables[0];

  assert.equal(table.rows, 2);
  assert.deepEqual(
    plain(table.cells.map(function (cell) { return cell ? cell.text + ':' + cell.row + ',' + cell.col : null; })),
    ['a:0,0', 'bbbb:0,1', 'cc:1,0', 'dddddd:1,1']
  );
  near(table.widths[0], 481.20000000000005);
  near(table.widths[1], 118.79999999999995);
});

test('填充顺序：行优先（row）先填满一行再换行', function () {
  const element = categoryElement('行优先', 600, [
    model.createTable({ columns: 2, rows: 0, fill: 'row' })
  ]);
  const result = layout.layoutCategory({ name: '行优先', songs: ['a', 'bbbb', 'cc', 'dddddd'] }, element);
  const table = result.tables[0];

  assert.equal(table.rows, 2);
  assert.deepEqual(
    plain(table.cells.map(function (cell) { return cell ? cell.text + ':' + cell.row + ',' + cell.col : null; })),
    ['a:0,0', 'cc:0,1', 'bbbb:1,0', 'dddddd:1,1']
  );
  assert.deepEqual(plain(table.contentWidths), [85.2, 118.8]);
  near(table.widths[0], 481.2);
  near(table.widths[1], 118.8);
});

test('填充顺序：多列列优先时单元格按列存储', function () {
  // 5 列、21 首歌：歌曲1..5 落在第 0 列，索引 0/5/10/15/20。
  const element = categoryElement('测试', 600, [model.createTable({ columns: 5, rows: 0 })]);
  const result = layout.layoutCategory({ name: '测试', songs: songs('歌曲', 21) }, element);
  const cells = result.tables[0].cells;

  // cells 下标 = row * columns + col；列优先意味着第 0 行横跨 5 列。
  assert.deepEqual(
    plain([cells[0], cells[1], cells[2], cells[3], cells[4]].map(function (cell) {
      return cell.text;
    })),
    ['歌曲1', '歌曲6', '歌曲11', '歌曲16', '歌曲21']
  );
  assert.equal(cells[5].text, '歌曲2'); // row 1, col 0
  assert.equal(cells[20].text, '歌曲5'); // row 4, col 0
});

/* ---------- 动态行数 ---------- */

test('动态行：rows = 0 时行数由 ceil(歌数 / 列数) 决定', function () {
  const element = categoryElement('测试', 600, [model.createTable({ columns: 5, rows: 0 })]);
  const result = layout.layoutCategory({ name: '测试', songs: songs('歌曲', 21) }, element);

  assert.equal(result.tables[0].rows, Math.ceil(21 / 5));
  assert.equal(result.tables[0].height, Math.ceil(21 / 5) * (28 * 1.35 + CELL_PAD_Y * 2));
});

test('动态行：空分类在导出视图不占行', function () {
  const element = categoryElement('空表', 600, [model.createTable({ columns: 3, rows: 0 })]);
  const result = layout.layoutCategory({ name: '空表', songs: [] }, element);
  const table = result.tables[0];

  assert.equal(table.placeholder, false);
  assert.equal(table.rows, 0);
  assert.equal(table.cells.length, 0);
  assert.equal(table.height, 0);
  // 标题仍在：16 + 52.8（44 * 1.2）+ 10 = 78.8；无表格行时再加 16 的底部内边距。
  near(table.y, 78.8);
  near(result.blockHeight, 94.8);
});

test('动态行：编辑视图为空动态表补一个占位行', function () {
  const element = categoryElement('空表', 600, [model.createTable({ columns: 3, rows: 0 })]);
  const result = layout.layoutCategory({ name: '空表', songs: [] }, element, { editMode: true });
  const table = result.tables[0];

  assert.equal(table.placeholder, true);
  assert.equal(table.rows, 1);
  assert.equal(table.cells.length, 3);
  assert.equal(table.cells.every(function (cell) { return cell === null; }), true);
  near(table.height, 28 * 1.35 + CELL_PAD_Y * 2);
  near(result.blockHeight, 124.6);
});

/* ---------- 满页续表 ---------- */

test('满页续表：固定行表格装不下时追加动态表并持久化', function () {
  const element = categoryElement('固定', 600, [model.createTable({ columns: 2, rows: 2 })]);
  const result = layout.layoutCategory(
    { name: '固定', songs: ['a', 'b', 'c', 'd', 'e', 'f'] },
    element
  );

  // 容量 2 * 2 = 4，剩余 2 首进入追加的动态表。
  assert.equal(result.tables.length, 2);
  assert.equal(element.tables.length, 2);
  assert.deepEqual(plain(result.tables.map(function (table) { return table.rows; })), [2, 1]);
  assert.deepEqual(plain(result.tables.map(function (table) { return table.take; })), [4, 2]);
  assert.deepEqual(plain(result.tables.map(function (table) { return table.startIndex; })), [0, 4]);
  near(result.tables[0].y, 78.8);
  near(result.tables[1].y, 170.4);
  near(result.tables[1].height, 45.8);
  near(result.blockHeight, 216.2);

  // 追加的表继承列设置，持久化后的 rows 仍为 0（保持动态）。
  assert.equal(element.tables[1].rows, 0);
  assert.equal(element.tables[1].columns, 2);
  assert.equal(element.tables[1].fill, 'column');
  assert.deepEqual(
    plain(result.tables[1].cells
      .filter(function (cell) { return cell; })
      .map(function (cell) { return cell.text; })),
    ['e', 'f']
  );
});

test('满页续表：固定表格未装满时不追加新表', function () {
  const element = categoryElement('固定', 600, [model.createTable({ columns: 2, rows: 2 })]);
  const result = layout.layoutCategory({ name: '固定', songs: ['a', 'b', 'c', 'd'] }, element);

  assert.equal(result.tables.length, 1);
  assert.equal(element.tables.length, 1);
  assert.equal(result.tables[0].rows, 2);
  assert.equal(result.tables[0].take, 4);
  assert.equal(result.tables[0].cells.filter(function (cell) { return !cell; }).length, 0);
});

test('满页续表：只有最后一个表格允许动态行', function () {
  // normalizeTables 会把非末尾的动态表强制成 1 行，避免续接语义歧义。
  const element = categoryElement('双表', 600, [
    model.createTable({ columns: 2, rows: 0 }),
    model.createTable({ columns: 2, rows: 0 })
  ]);
  layout.layoutCategory({ name: '双表', songs: ['a', 'b', 'c'] }, element);
  assert.equal(element.tables[0].rows, 1);
  assert.equal(element.tables[1].rows, 0);
});

/* ---------- 块几何 ---------- */

test('块几何：表格边距影响 x、宽度与纵向堆叠', function () {
  const element = categoryElement('边距', 600, [
    model.createTable({ columns: 2, rows: 1, margins: { top: 10, right: 60, bottom: 20, left: 40 } }),
    model.createTable({ columns: 2, rows: 1, margins: { top: 30, right: 0, bottom: 32, left: 0 } })
  ]);
  const result = layout.layoutCategory({ name: '边距', songs: ['a', 'b', 'c', 'd'] }, element);
  const first = result.tables[0];
  const second = result.tables[1];

  assert.equal(first.x, 40);
  assert.equal(first.tableWidth, 500);
  near(first.x + first.widths[0] + first.widths[1], 540);
  near(first.y, 78.8 + 10); // 标题底 + 上边距
  near(second.y, first.y + first.height + 20 + 30); // 前表底 + 下边距 + 本表上边距
  near(result.blockHeight, second.y + second.height + 32);
});

test('块几何：超大边距把表格压到最小宽度并留在块内', function () {
  const element = categoryElement('超宽边距', 600, [
    model.createTable({ columns: 2, rows: 1, margins: { left: 1000, right: 1000 } })
  ]);
  const result = layout.layoutCategory({ name: '超宽边距', songs: ['a'] }, element);
  const table = result.tables[0];

  assert.equal(table.tableWidth, 40);
  assert.ok(table.x >= 0);
  assert.ok(table.x + table.tableWidth <= element.width);
});

test('块几何：隐藏标题时表格从顶部内边距开始', function () {
  const element = categoryElement('无标题', 600, [model.createTable({ columns: 2, rows: 1 })]);
  element.showTitle = false;
  const result = layout.layoutCategory({ name: '无标题', songs: ['a', 'b'] }, element);

  assert.equal(result.showTitle, false);
  assert.equal(result.titleHeight, 0);
  near(result.tables[0].y, PADDING);
  near(result.tables[0].y, 16);
});

/* ---------- 结构归一化（syncTableStructure） ---------- */

test('setRows：末表 0 行改固定且溢出立即追加续表', function () {
  const element = categoryElement('续表', 600, [model.createTable({ columns: 5, rows: 0 })]);
  const category = { name: '续表', songs: songs('歌曲', 21) };
  layout.setRows(element, 0, 4, category.songs.length);
  assert.equal(element.tables.length, 2);
  assert.equal(element.tables[0].rows, 4);
  assert.equal(element.tables[1].rows, 0);
  assert.equal(element.tables[1].columns, 5);
  const result = layout.layoutCategory(category, element);
  assert.equal(result.tables.length, 2);
  assert.equal(result.tables[0].take, 20);
  assert.equal(result.tables[1].take, 1);
});

test('setRows：容量充足时不追加续表', function () {
  const element = categoryElement('不溢', 600, [model.createTable({ columns: 5, rows: 0 })]);
  layout.setRows(element, 0, 10, 10);
  assert.equal(element.tables.length, 1);
  assert.equal(element.tables[0].rows, 10);
});

test('setColumns：减少末表列数致溢出立即追加续表', function () {
  const element = categoryElement('减列', 600, [model.createTable({ columns: 5, rows: 4 })]);
  layout.setColumns(element, 0, 4, 21);
  assert.equal(element.tables.length, 2);
  assert.equal(element.tables[0].columns, 4);
  assert.equal(element.tables[1].rows, 0);
  assert.equal(element.tables[1].columns, 4);
});

test('removeTable：删除承载歌名的末表自动把新末表转为动态行', function () {
  const element = categoryElement('删末', 600, [
    model.createTable({ columns: 5, rows: 4 }),
    model.createTable({ columns: 5, rows: 0 })
  ]);
  // 21 首：首表容量 20，末表承载 1
  const ok = layout.removeTable(element, 1, 21);
  assert.ok(ok);
  assert.equal(element.tables.length, 1);
  assert.equal(element.tables[0].rows, 0);
  const result = layout.layoutCategory({ name: '删末', songs: songs('歌曲', 21) }, element);
  assert.equal(result.tables.length, 1);
  assert.equal(result.tables[0].rows, 5);
  assert.equal(result.tables[0].cells.filter(function (cell) { return cell; }).length, 21);
});

test('removeTable：删除空末表时新末表保持原固定行数', function () {
  const element = categoryElement('删空', 600, [
    model.createTable({ columns: 5, rows: 4 }),
    model.createTable({ columns: 5, rows: 0 })
  ]);
  // 20 首：首表恰好装满，末表为空
  layout.removeTable(element, 1, 20);
  assert.equal(element.tables.length, 1);
  assert.equal(element.tables[0].rows, 4);
});

test('removeTable：删除中间表末表保持动态且歌名回流', function () {
  const element = categoryElement('删中', 600, [
    model.createTable({ columns: 5, rows: 2 }),
    model.createTable({ columns: 5, rows: 2 }),
    model.createTable({ columns: 5, rows: 0 })
  ]);
  layout.removeTable(element, 0, 21);
  assert.equal(element.tables.length, 2);
  assert.equal(element.tables[1].rows, 0);
  const result = layout.layoutCategory({ name: '删中', songs: songs('歌曲', 21) }, element);
  assert.equal(result.tables[0].take, 10);
  assert.equal(result.tables[1].take, 11);
});

test('syncTableStructure：连续调用不重复追加', function () {
  const dynamic = categoryElement('幂等', 600, [model.createTable({ columns: 5, rows: 0 })]);
  layout.syncTableStructure(dynamic, 21);
  layout.syncTableStructure(dynamic, 21);
  assert.equal(dynamic.tables.length, 1);
  const fixed = categoryElement('固定幂等', 600, [model.createTable({ columns: 5, rows: 1 })]);
  layout.syncTableStructure(fixed, 21);
  layout.syncTableStructure(fixed, 21);
  assert.equal(fixed.tables.length, 2);
  assert.equal(fixed.tables[1].rows, 0);
});

/* ---------- 分类块落点：只参照分类块 ---------- */

function dropProject() {
  return {
    pageSize: { width: 800, height: 1200 },
    margins: { top: 40, right: 0, bottom: 0, left: 30 },
    playlist: {
      categories: [
        { name: '流行', songs: songs('流行歌', 4) },
        { name: '摇滚', songs: songs('摇滚歌', 3) }
      ]
    }
  };
}

function dropCategory(projectRef, name, y) {
  return model.createCategoryElement(name, projectRef.margins.left, y, projectRef, 600);
}

test('落点：只有自由图片时不参照图片，落到上边距', function () {
  const projectRef = dropProject();
  const page = {
    elements: [
      { type: 'image', x: 0, y: 120, width: 400, height: 300, assetId: 'a' },
      { type: 'image', x: 0, y: 700, width: 400, height: 400, assetId: 'b' }
    ]
  };

  const position = layout.categoryDropPosition(page, projectRef, Infinity);
  assert.deepEqual(plain(position), { x: 30, y: 40 });
});

test('落点：自由文字同样不参与', function () {
  const projectRef = dropProject();
  const page = { elements: [{ type: 'text', x: 0, y: 500, width: 200, text: '自由文字', style: {} }] };

  assert.equal(layout.categoryDropPosition(page, projectRef, Infinity).y, 40);
});

test('落点：分类块下方有更低自由图片时只贴分类块底边', function () {
  const projectRef = dropProject();
  const category = model.getCategory(projectRef, '流行');
  const block = dropCategory(projectRef, '流行', 100);
  const bottom = 100 + layout.elementHeight(block, category, { editMode: true });
  const page = {
    elements: [
      block,
      { type: 'image', x: 0, y: 600, width: 400, height: 500, assetId: 'a' }
    ]
  };

  const position = layout.categoryDropPosition(page, projectRef, Infinity);
  assert.equal(position.y, Math.round(bottom));
  assert.ok(position.y < 600, '不得被更靠下的自由图片下推');
});

test('落点：鼠标在所有分类块上方时回到上边距', function () {
  const projectRef = dropProject();
  const page = {
    elements: [
      dropCategory(projectRef, '流行', 200),
      { type: 'image', x: 0, y: 100, width: 400, height: 200, assetId: 'a' }
    ]
  };

  assert.equal(layout.categoryDropPosition(page, projectRef, 150).y, 40);
});

test('落点：鼠标位于分类块内部时贴该块底边', function () {
  const projectRef = dropProject();
  const category = model.getCategory(projectRef, '摇滚');
  const block = dropCategory(projectRef, '摇滚', 300);
  const bottom = 300 + layout.elementHeight(block, category, { editMode: true });
  const page = { elements: [block] };

  assert.equal(layout.categoryDropPosition(page, projectRef, 320).y, Math.round(bottom));
});

test('落点：Infinity 取全部分类块的最低下边缘', function () {
  const projectRef = dropProject();
  const first = dropCategory(projectRef, '流行', 0);
  const secondCategory = model.getCategory(projectRef, '摇滚');
  const second = dropCategory(projectRef, '摇滚', 400);
  const expected = 400 + layout.elementHeight(second, secondCategory, { editMode: true });
  const page = {
    elements: [
      second,
      { type: 'image', x: 0, y: 200, width: 400, height: 900, assetId: 'a' },
      first
    ]
  };

  assert.equal(layout.categoryDropPosition(page, projectRef, Infinity).y, Math.round(expected));
});

test('落点：空页回退上边距，缺失参数不抛错', function () {
  const projectRef = dropProject();
  assert.deepEqual(plain(layout.categoryDropPosition({ elements: [] }, projectRef, Infinity)), { x: 30, y: 40 });
  assert.deepEqual(plain(layout.categoryDropPosition({ elements: [] }, null, Infinity)), { x: 0, y: 0 });
});

/* ---------- arrangeTables：单分类自动分割 ---------- */

test('默认表格数：按歌名长度跨度估算', function () {
  assert.equal(layout.estimateTableCount(['一'.repeat(2), '一'.repeat(3), '一'.repeat(4)]), 1);
  assert.equal(layout.estimateTableCount([
    '一'.repeat(2), '一'.repeat(3), '一'.repeat(4), '一'.repeat(5), '一'.repeat(6)
  ]), 2);
  assert.equal(layout.estimateTableCount([
    '一'.repeat(1), '一'.repeat(2), '一'.repeat(3), '一'.repeat(4), '一'.repeat(5),
    '一'.repeat(6), '一'.repeat(7), '一'.repeat(8), '一'.repeat(9), '一'.repeat(10)
  ]), 5);
});

test('默认表格数：排除极端长和极端短歌名', function () {
  const list = [];
  for (let i = 0; i < 10; i += 1) list.push('一'.repeat(3));
  list.push('短');
  list.push('一'.repeat(30));
  assert.equal(layout.estimateTableCount(list), 1);
});

test('默认表格数：空分类回退 1', function () {
  assert.equal(layout.estimateTableCount([]), 1);
  assert.equal(layout.estimateTableCount(null), 1);
});

function arrangeScene(name, width, list, options) {
  const element = categoryElement(name, width, [model.createTable()]);
  element.songStyle = SONG_STYLE;
  const result = layout.arrangeTables(element, { name: name, songs: list }, options);
  return { element: element, result: result };
}

function renderedTables(element, name, list) {
  return layout.layoutCategory({ name: name, songs: list }, element).tables;
}

function collectTexts(tables) {
  const texts = [];
  tables.forEach(function (table) {
    table.cells.forEach(function (cell) {
      if (cell) texts.push(cell.text);
    });
  });
  return texts;
}

test('自动分割：等宽歌名按最大可行列数铺满且无空缺', function () {
  const list = [];
  for (let i = 0; i < 10; i += 1) list.push(String.fromCharCode(97 + i) + 'aa');
  const scene = arrangeScene('等宽', 600, list, { maxRows: 10, tableCount: 1 });
  const result = scene.result;

  assert.ok(result);
  assert.equal(result.rows, 2);
  assert.equal(result.minRows, 2);
  assert.equal(result.overBudget, false);
  assert.equal(result.tables.length, 1);
  assert.equal(result.tables[0].columns, 5);
  assert.equal(result.tables[0].rows, 2);
  assert.equal(result.tables[0].fill, 'row');

  scene.element.tables = result.tables;
  const tables = renderedTables(scene.element, '等宽', list);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].fallback, false);
  assert.equal(tables[0].cells.filter(function (cell) { return !!cell; }).length, 10);
  tables[0].cells.forEach(function (cell) {
    if (cell) assert.equal(cell.overflow, false);
  });
});

test('自动分割：全部歌名保留、行优先顺序、无重复、单元格不溢出', function () {
  const list = [];
  for (let i = 1; i <= 35; i += 1) list.push('a'.repeat(i));
  const scene = arrangeScene('递增', 2000, list, { maxRows: 60, tableCount: 3 });
  const result = scene.result;

  assert.ok(result);
  const capacity = result.tables.reduce(function (sum, table) {
    return sum + table.columns * table.rows;
  }, 0);
  assert.ok(capacity >= list.length);
  assert.ok(result.tables.every(function (table) {
    return table.rows > 0 && table.columns > 0 && table.fill === 'row';
  }));
  for (let i = 1; i < result.tables.length; i += 1) {
    assert.ok(result.tables[i - 1].columns > result.tables[i].columns, '列数应自上而下严格递减');
  }
  assert.equal(new Set(result.tables.map(function (table) { return table.columns; })).size, result.tables.length);

  scene.element.tables = result.tables;
  const tables = renderedTables(scene.element, '递增', list);
  assert.deepEqual(collectTexts(tables), layout.sortSongs(list));
  tables.forEach(function (table) {
    assert.equal(table.fallback, false);
    table.cells.forEach(function (cell) {
      if (cell) assert.equal(cell.overflow, false);
    });
  });
});

test('自动分割：表格数控制切分，短歌名表格列数更多', function () {
  const list = [];
  for (let i = 1; i <= 35; i += 1) list.push('a'.repeat(i));
  const single = arrangeScene('单表', 2000, list, { maxRows: 60, tableCount: 1 }).result;
  const split = arrangeScene('三表', 2000, list, { maxRows: 60, tableCount: 3 }).result;

  assert.ok(single);
  assert.ok(split);
  assert.equal(single.tables.length, 1);
  assert.equal(split.tables.length, 3);
  assert.ok(split.tables[0].columns > split.tables[split.tables.length - 1].columns);
  assert.ok(split.rows <= single.rows);
});

test('自动分割：分段容量与歌名数一致，不因补位造成列宽不足', function () {
  const list = [];
  for (let i = 1; i <= 18; i += 1) list.push('a'.repeat(i));
  const scene = arrangeScene('递增两表', 960, list, { maxRows: 100, tableCount: 2 });
  const result = scene.result;

  assert.ok(result);
  assert.equal(result.tables.length, 2);
  assert.ok(result.tables[0].columns > result.tables[1].columns);
  scene.element.tables = result.tables;
  const tables = renderedTables(scene.element, '递增两表', list);
  assert.deepEqual(collectTexts(tables), layout.sortSongs(list));
  tables.forEach(function (table) {
    table.cells.forEach(function (cell) {
      if (cell) assert.equal(cell.overflow, false);
    });
  });
});

test('自动分割：历史重复列数场景保持列数唯一', function () {
  const cases = [
    { width: 960, count: 20, tableCount: 3 },
    { width: 960, count: 18, tableCount: 2 },
    { width: 960, count: 100, tableCount: 5 }
  ];
  cases.forEach(function (item) {
    const list = [];
    for (let i = 0; i < item.count; i += 1) list.push('a'.repeat((i % 20) + 1));
    const scene = arrangeScene('重复列数', item.width, list, {
      maxRows: 100,
      tableCount: item.tableCount
    });
    const result = scene.result;
    assert.ok(result, '应成功切分 ' + item.count + ' 首');
    const columns = result.tables.map(function (table) { return table.columns; });
    assert.equal(new Set(columns).size, columns.length, '列数应两两不同');
    for (let i = 1; i < columns.length; i += 1) {
      assert.ok(columns[i - 1] > columns[i], '列数应自上而下严格递减');
    }
    assert.equal(result.requestedTableCount, item.tableCount);
    assert.equal(result.tableCountReduced, false);

    scene.element.tables = result.tables;
    const tables = renderedTables(scene.element, '重复列数', list);
    assert.deepEqual(collectTexts(tables), layout.sortSongs(list));
    tables.forEach(function (table) {
      table.cells.forEach(function (cell) {
        if (cell) assert.equal(cell.overflow, false);
      });
    });
  });
});

test('自动分割：请求数量超过唯一列数时减少并标记', function () {
  const few = [];
  for (let i = 0; i < 5; i += 1) few.push('a'.repeat(i + 1));
  const reduced = arrangeScene('少歌多表', 960, few, { maxRows: 100, tableCount: 20 }).result;

  assert.ok(reduced);
  assert.equal(reduced.requestedTableCount, 20);
  assert.equal(reduced.tableCountReduced, true);
  assert.equal(reduced.tableCount, reduced.tables.length);
  assert.ok(reduced.tables.length < 20);
  const columns = reduced.tables.map(function (table) { return table.columns; });
  assert.equal(new Set(columns).size, columns.length);
  for (let i = 1; i < columns.length; i += 1) {
    assert.ok(columns[i - 1] > columns[i]);
  }

  const many = [];
  for (let i = 0; i < 40; i += 1) many.push('a'.repeat((i % 20) + 1));
  const capped = arrangeScene('多歌多表', 960, many, { maxRows: 100, tableCount: 9 }).result;

  assert.ok(capped);
  assert.equal(capped.requestedTableCount, 9);
  assert.equal(capped.tableCountReduced, true);
  assert.ok(capped.tables.length <= 8);
  assert.equal(new Set(capped.tables.map(function (table) { return table.columns; })).size, capped.tables.length);
});

test('默认表格数：不超过唯一列数上限与歌名数', function () {
  const wide = [];
  for (let i = 1; i <= 60; i += 1) wide.push('a'.repeat(i));
  assert.equal(layout.estimateTableCount(wide), 8);
  assert.equal(layout.estimateTableCount(['a', 'a'.repeat(20), 'a'.repeat(40)]), 3);
});

test('自动分割：超过 150 首仍按表格数切分', function () {
  const list = [];
  for (let i = 0; i < 151; i += 1) list.push('歌名' + String(i).padStart(3, '0'));
  const result = arrangeScene('大分类', 960, list, { maxRows: 40, tableCount: 3 }).result;

  assert.ok(result);
  assert.equal(result.tables.length, 3);
  assert.equal(result.tables.reduce(function (sum, table) {
    return sum + table.columns * table.rows;
  }, 0) >= list.length, true);
});

test('自动分割：高度上限低于实际行数时标记超预算但仍应用', function () {
  const list = [];
  for (let i = 0; i < 10; i += 1) list.push('abc');
  const result = arrangeScene('超预算', 600, list, { maxRows: 1, tableCount: 1 }).result;

  assert.ok(result);
  assert.equal(result.minRows, 2);
  assert.equal(result.rows, 2);
  assert.equal(result.overBudget, true);
});

test('自动分割：空歌单或放不下的超长歌名返回 null', function () {
  const empty = arrangeScene('空', 600, [], { maxRows: 10 });
  assert.equal(empty.result, null);

  const narrow = arrangeScene('超窄', 40, ['a'.repeat(40)], { maxRows: 10 });
  assert.equal(narrow.result, null);
});
