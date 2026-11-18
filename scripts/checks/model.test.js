'use strict';

/*
 * js/model.js 的纯逻辑回归。
 * 运行：node --test scripts/checks/model.test.js
 *
 * 这里不覆盖画布绘制、资产下载与 IndexedDB；只保证文本宽度、排序、
 * 字体栈规整、边距归一化、旋转角度归一与深拷贝的现有语义不被后续拆分改掉。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const loader = require('./loader.js');

const L = loader.load();
const model = L.model;
const plain = loader.toPlain;

test('装载器：按 index.html 顺序加载运行时可测脚本', function () {
  assert.equal(typeof L.model, 'object');
  assert.equal(typeof L.layout, 'object');
  assert.equal(typeof L.io, 'object');
  assert.equal(typeof L.zip, 'object');
  assert.equal(typeof L.assets, 'object');
  // 明确跳过的 UI 脚本没有被误加载。
  assert.equal(L.ui, undefined);
  assert.equal(L.app, undefined);

  // 必需脚本（至少这些）都在装载清单里，且保持 index.html 的先后关系。
  ['js/model.js', 'js/layout.js', 'js/import.js', 'js/playlist-export.js',
    'js/render.js', 'js/io.js', 'js/zip.js'].forEach(function (file) {
    assert.ok(loader.RUNTIME_SCRIPTS.indexOf(file) !== -1, file + ' 应被加载');
  });
  assert.ok(loader.RUNTIME_SCRIPTS.indexOf('js/model.js') <
    loader.RUNTIME_SCRIPTS.indexOf('js/layout.js'));
  assert.ok(loader.RUNTIME_SCRIPTS.indexOf('js/layout.js') <
    loader.RUNTIME_SCRIPTS.indexOf('js/render.js'));
  assert.ok(loader.RUNTIME_SCRIPTS.indexOf('js/io.js') <
    loader.RUNTIME_SCRIPTS.indexOf('js/zip.js'));

  loader.SKIPPED_SCRIPTS.forEach(function (entry) {
    assert.ok(loader.RUNTIME_SCRIPTS.indexOf(entry.file) === -1, entry.file + ' 不应被加载');
    assert.ok(fs.existsSync(path.resolve(loader.ROOT, entry.file)), entry.file + ' 应存在');
    assert.ok(entry.reason.length > 0);
  });
});

test('装载器：document 桩提供确定性 measureText', function () {
  assert.equal(L.layout.measureText('AB', { fontSize: 10, fontWeight: 400, fontFamily: 'sans-serif' }), 12);
  assert.equal(L.layout.measureText('真的', { fontSize: 10, fontWeight: 400, fontFamily: 'sans-serif' }), 24);
});

test('装载器：document:false 时只加载 model.js', function () {
  const runtime = loader.createRuntime({ document: false });
  assert.deepEqual(runtime.scripts, ['js/model.js']);
  assert.equal(runtime.Listify.layout, undefined);
  assert.equal(runtime.Listify.model.virtualWidth('好'), 2);

  // 4.3：无 document 时数据模型工厂与几何计算必须可用。
  const project = runtime.Listify.model.createDefaultProject();
  assert.equal(project.pages.length, 1);
  assert.equal(project.pageSize.width, 1080);
  const resize = runtime.Listify.model.computeImageResize(
    { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
    'se', { x: 20, y: 10 }, false);
  assert.deepEqual(loader.toPlain(resize), { x: 0, y: 0, width: 220, height: 110 });
});

test('装载器：显式脚本子集仍按 index.html 顺序执行', function () {
  // io.js 现在只是兼容壳，校验/序列化实现在它依赖的三个模块中；
  // 显式子集必须一并列出这些依赖，才能复现完整的 L.io 表面。
  const runtime = loader.createRuntime({
    scripts: ['io', 'draft-store', 'project-io', 'project-schema', 'model']
  });
  assert.deepEqual(runtime.scripts, [
    'js/model.js',
    'js/project-schema.js',
    'js/project-io.js',
    'js/draft-store.js',
    'js/io.js'
  ]);
  assert.equal(typeof runtime.Listify.io.validateProject, 'function');
});

test('装载器：需要 document 的脚本在没有桩时拒绝加载', function () {
  assert.throws(function () {
    loader.load({ document: false, scripts: ['layout'] });
  }, /document is not defined/);
});

/* ---------- virtualWidth ---------- */

test('virtualWidth：ASCII 每个字符记 1', function () {
  assert.equal(model.virtualWidth(''), 0);
  assert.equal(model.virtualWidth('Hi'), 2);
  assert.equal(model.virtualWidth('Hello'), 5);
  assert.equal(model.virtualWidth('abc 123'), 7);
});

test('virtualWidth：CJK 字符记 2', function () {
  assert.equal(model.virtualWidth('好'), 2);
  assert.equal(model.virtualWidth('真的爱你'), 8);
  assert.equal(model.virtualWidth('Hi真的'), 6);
});

test('virtualWidth：全角字符记 2', function () {
  assert.equal(model.virtualWidth('ＡＢ'), 4);
  assert.equal(model.virtualWidth('！？'), 4);
  assert.equal(model.virtualWidth('Ａ1'), 3);
});

test('virtualWidth：emoji（代理对）记 2', function () {
  assert.equal(model.virtualWidth('🎵'), 2);
  assert.equal(model.virtualWidth('a🎵b'), 4);
  assert.equal(model.virtualWidth('🎵🎵'), 4);
});

test('virtualWidth：null/undefined 视为空串', function () {
  assert.equal(model.virtualWidth(null), 0);
  assert.equal(model.virtualWidth(undefined), 0);
});

/* ---------- sortSongs ---------- */

test('sortSongs：按虚拟宽度升序，等宽时保持原顺序', function () {
  const input = ['Hello', '真的爱你', 'Hi', '好', 'abc'];
  const sorted = L.layout.sortSongs(input);
  // Hi(2) 与 好(2) 等宽，保持原下标顺序；abc(3) 在 Hello(5) 之前。
  assert.deepEqual(plain(sorted), ['Hi', '好', 'abc', 'Hello', '真的爱你']);
  // 不修改调用方数组。
  assert.deepEqual(input, ['Hello', '真的爱你', 'Hi', '好', 'abc']);
});

test('sortSongs：等宽稳定排序', function () {
  assert.deepEqual(plain(L.layout.sortSongs(['b', 'a', 'c'])), ['b', 'a', 'c']);
  assert.deepEqual(plain(L.layout.sortSongs(['二', '一', '三'])), ['二', '一', '三']);
});

test('sortSongs：空输入返回空数组', function () {
  assert.deepEqual(plain(L.layout.sortSongs([])), []);
  assert.deepEqual(plain(L.layout.sortSongs(null)), []);
});

/* ---------- quoteFamily / normalizeFontStack ---------- */

test('quoteFamily：加双引号并转义反斜杠与引号', function () {
  assert.equal(model.quoteFamily('Foo'), '"Foo"');
  assert.equal(model.quoteFamily('Alibaba PuHuiTi 3.0'), '"Alibaba PuHuiTi 3.0"');
  assert.equal(model.quoteFamily('A"B'), '"A\\"B"');
  assert.equal(model.quoteFamily('A\\B'), '"A\\\\B"');
  assert.equal(model.quoteFamily('A\nB'), '"A B"');
  assert.equal(model.quoteFamily(null), '""');
});

test('normalizeFontStack：空值回落到 sans-serif', function () {
  assert.equal(model.normalizeFontStack(null), 'sans-serif');
  assert.equal(model.normalizeFontStack(''), 'sans-serif');
  assert.equal(model.normalizeFontStack('   '), 'sans-serif');
});

test('normalizeFontStack：合法字体栈原样返回', function () {
  const stack = '"Alibaba PuHuiTi 3.0", sans-serif';
  assert.equal(model.normalizeFontStack(stack), stack);
  assert.equal(model.normalizeFontStack('serif'), 'serif');
  assert.equal(model.normalizeFontStack('"A B"'), '"A B"');
});

test('normalizeFontStack：未加引号的含空格族名会被重新引用', function () {
  assert.equal(model.normalizeFontStack('Foo Bar'), '"Foo Bar"');
  assert.equal(model.normalizeFontStack('Foo Bar, SERIF'), '"Foo Bar", serif');
});

/* ---------- normalizeMargins ---------- */

test('normalizeMargins：缺失或非法值归一为 0', function () {
  assert.deepEqual(plain(model.normalizeMargins(undefined)), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual(plain(model.normalizeMargins(null)), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual(
    plain(model.normalizeMargins({ top: -5, right: NaN, bottom: '8', left: Infinity })),
    { top: 0, right: 0, bottom: 8, left: 0 }
  );
});

test('normalizeMargins：每次返回新对象', function () {
  const first = model.normalizeMargins({ top: 12 });
  first.top = 99;
  assert.equal(model.normalizeMargins().top, 0);
  assert.notEqual(first, model.normalizeMargins(first));
});

/* ---------- clone ---------- */

test('clone：深拷贝嵌套对象与数组', function () {
  const source = { a: { b: [1, 2, { c: 3 }] }, d: 'x' };
  const copy = model.clone(source);
  assert.deepEqual(plain(copy), source);
  assert.notEqual(copy, source);
  assert.notEqual(copy.a, source.a);
  assert.notEqual(copy.a.b, source.a.b);
  assert.notEqual(copy.a.b[2], source.a.b[2]);

  copy.a.b.push(4);
  copy.a.b[2].c = 99;
  copy.d = 'y';
  assert.equal(source.a.b.length, 3);
  assert.equal(source.a.b[2].c, 3);
  assert.equal(source.d, 'x');
});

test('clone：保留 JSON 可序列化类型', function () {
  const source = { s: '文', n: 1.5, b: true, z: null, list: [0, 1] };
  assert.deepEqual(plain(model.clone(source)), source);
});

/* ---------- findSongMatches：跨分类歌名部分匹配（定位歌曲） ---------- */

test('findSongMatches：空查询、空白查询或非法输入返回空数组', function () {
  const categories = [{ name: 'A', songs: ['晴天'] }];
  assert.deepEqual(plain(model.findSongMatches(categories, '')), []);
  assert.deepEqual(plain(model.findSongMatches(categories, '   ')), []);
  assert.deepEqual(plain(model.findSongMatches(null, '晴')), []);
  assert.deepEqual(plain(model.findSongMatches('不是数组', '晴')), []);
});

test('findSongMatches：部分匹配且大小写不敏感，区间为原歌名坐标', function () {
  const categories = [
    { name: '摇滚', songs: ['Hotel California', '加州旅馆'] },
    { name: '民谣', songs: ['送别', 'Goodbye Yesterday'] }
  ];
  const m1 = plain(model.findSongMatches(categories, 'Hotel'));
  assert.equal(m1.length, 1);
  assert.deepEqual(m1[0], { categoryIndex: 0, songIndex: 0, start: 0, end: 5 });
  // 仅大小写不同仍命中，且坐标与大小写敏感搜索一致
  assert.deepEqual(plain(model.findSongMatches(categories, 'hOTEL')), m1);
  const m3 = plain(model.findSongMatches(categories, '旅馆'));
  assert.deepEqual(m3, [{ categoryIndex: 0, songIndex: 1, start: 2, end: 4 }]);
});

test('findSongMatches：跨多分类多条命中，重名歌各出一条', function () {
  const categories = [
    { name: 'A', songs: ['夜曲', '晴天'] },
    { name: 'B', songs: ['夜曲', '星晴'] },
    { name: 'C', songs: ['夜的钢琴曲'] }
  ];
  const matches = plain(model.findSongMatches(categories, '夜'));
  assert.equal(matches.length, 3);
  assert.deepEqual(
    matches.map(function (m) { return [m.categoryIndex, m.songIndex]; }),
    [[0, 0], [1, 0], [2, 0]]
  );
});

test('findSongMatches：无匹配返回空数组', function () {
  const categories = [{ name: 'A', songs: ['晴天'] }];
  assert.deepEqual(plain(model.findSongMatches(categories, '不存在的歌')), []);
});

test('findSongMatches：空歌名不参与匹配，查询被 trim', function () {
  const categories = [{ name: 'A', songs: ['', '   ', ' 夜曲 '] }];
  assert.deepEqual(plain(model.findSongMatches(categories, ' 夜 ')), [
    { categoryIndex: 0, songIndex: 2, start: 1, end: 2 }
  ]);
});

test('findSongMatches：小写化变长字符（İ）命中坐标仍在原歌名上', function () {
  // 'İ'(U+0130) 小写化为 'i̇'（i + 组合点，2 个码元），原串仅 1 个码元。
  const categories = [{ name: 'A', songs: ['\u0130stanbul Blues', 'Blue \u0130stanbul'] }];
  const matches = plain(model.findSongMatches(categories, 'i\u0307stanbul'));
  assert.equal(matches.length, 2);
  // 首字符变长：原串 'İstanbul' 占 0..8
  assert.deepEqual(matches[0], { categoryIndex: 0, songIndex: 0, start: 0, end: 8 });
  // 中间变长：'Blue İstanbul' 中命中占 5..13
  assert.deepEqual(matches[1], { categoryIndex: 0, songIndex: 1, start: 5, end: 13 });
});

test('页面尺寸预设：四个预设精确匹配', function () {
  assert.equal(model.PAGE_SIZE_PRESETS.length, 4);
  model.PAGE_SIZE_PRESETS.forEach(function (preset) {
    assert.equal(model.matchPageSizePreset(preset.width, preset.height), preset);
    assert.equal(model.matchPageSizePreset(String(preset.width), String(preset.height)), preset);
  });
  assert.equal(model.matchPageSizePreset(1080, 1920).id, '1080p-portrait');
  assert.equal(model.matchPageSizePreset(1920, 1080).id, '1080p-landscape');
  assert.equal(model.matchPageSizePreset(1440, 2560).id, '2k-portrait');
  assert.equal(model.matchPageSizePreset(2560, 1440).id, '2k-landscape');
});

test('页面尺寸预设：非匹配返回 null，交换宽高匹配另一方向', function () {
  assert.equal(model.matchPageSizePreset(1200, 1800), null);
  assert.equal(model.matchPageSizePreset(1080, 1080), null);
  assert.equal(model.matchPageSizePreset(NaN, 1920), null);
  assert.equal(model.matchPageSizePreset(1920, 1080).id, '1080p-landscape');
  assert.equal(model.matchPageSizePreset(1080, 1920).id, '1080p-portrait');
  assert.equal(model.matchPageSizePreset(2560, 1440).id, '2k-landscape');
  assert.equal(model.matchPageSizePreset(1440, 2560).id, '2k-portrait');
  // 匹配前按整数宽高比较，避免浮点输入绕过预设。
  assert.equal(model.matchPageSizePreset(1080.4, 1920.4).id, '1080p-portrait');
});

test('页面尺寸预设：范围常量与默认项目尺寸', function () {
  assert.equal(model.PAGE_SIZE_MIN, 320);
  assert.equal(model.PAGE_SIZE_MAX, 5000);
  const project = model.createDefaultProject();
  assert.deepEqual(plain(project.pageSize), { width: 1080, height: 1920 });
  assert.equal(model.matchPageSizePreset(project.pageSize.width, project.pageSize.height).id, '1080p-portrait');
});

test('旋转角度：wrapAngle 归一到 [-halfRange, halfRange]', function () {
  assert.equal(model.wrapAngle(0, 180), 0);
  assert.equal(model.wrapAngle(90, 180), 90);
  assert.equal(model.wrapAngle(180, 180), 180);
  assert.equal(model.wrapAngle(200, 180), -160);  // 内容图：200° → -160°
  assert.equal(model.wrapAngle(400, 180), 40);    // 400 mod 360 = 40，在 [-180,180] 内
  assert.equal(model.wrapAngle(-200, 180), 160);
  assert.equal(model.wrapAngle(359.99, 360), 360); // 0.1 精度向上
  assert.equal(model.wrapAngle(-179.96, 180), -180);
  // 背景图（halfRange=360，输入范围 -360..360）：结果仍在范围内且与等价角度视觉一致
  assert.equal(model.wrapAngle(400, 360), -320);
  assert.equal(model.wrapAngle(-400, 360), 320);
  assert.equal(model.wrapAngle(359, 360), 359);
  // 非有限输入回落到 0
  assert.equal(model.wrapAngle(NaN, 180), 0);
  assert.equal(model.wrapAngle(undefined, 360), 0);
});

test('旋转角度：angleDeltaDeg 绕中心的角度增量（含 ±180° 接缝）', function () {
  const rad = function (deg) { return deg * Math.PI / 180; };
  // 基本象限
  assert.equal(model.angleDeltaDeg(0, 0, 1, 0, 0, 1), 90);     // 0° → 90°
  assert.equal(model.angleDeltaDeg(0, 0, 0, 1, 1, 0), -90);    // 90° → 0°
  assert.equal(model.angleDeltaDeg(0, 0, 1, 0, -1, 0), 180);   // 半圈
  assert.equal(model.angleDeltaDeg(0, 0, 1, 0, 1, 0), 0);      // 未移动
  // 跨越 ±180° 接缝：170° → 190° 应为 +20° 而非 -340°
  assert.equal(
    model.angleDeltaDeg(0, 0, Math.cos(rad(170)), Math.sin(rad(170)), Math.cos(rad(190)), Math.sin(rad(190))),
    20
  );
  assert.equal(
    model.angleDeltaDeg(0, 0, Math.cos(rad(190)), Math.sin(rad(190)), Math.cos(rad(170)), Math.sin(rad(170))),
    -20
  );
  // 非零中心
  assert.equal(model.angleDeltaDeg(100, 100, 200, 100, 100, 200), 90);
});

test('旋转角度：snapAngle 吸附到 step 整数倍', function () {
  assert.equal(model.snapAngle(7, 15), 0);
  assert.equal(model.snapAngle(8, 15), 15);
  assert.equal(model.snapAngle(14.5, 15), 15);  // 吸附边界
  assert.equal(model.snapAngle(22, 15), 15);
  assert.equal(model.snapAngle(23, 15), 30);
  assert.equal(model.snapAngle(-8, 15), -15);
  assert.equal(model.snapAngle(0, 15), 0);
  assert.equal(model.snapAngle(7), 7);          // 默认 step=1
  assert.equal(model.snapAngle(NaN, 15), 0);
});

/* ---------- 图层顺序：显示序与模型序相反 ---------- */

function ids(list) {
  return list.map(function (item) { return item.id; });
}

function moveByName(list, plan) {
  assert.ok(plan, '计划不应为 null');
  assert.equal(model.moveItem(list, plan.from, plan.to), true);
  return ids(list);
}

test('图层顺序：displayOrder 返回显示序（最顶层在前）的新数组', function () {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(ids(model.displayOrder(list)), ['c', 'b', 'a']);
  // 不改动入参，且返回的是新数组
  assert.deepEqual(ids(list), ['a', 'b', 'c']);
  assert.notEqual(model.displayOrder(list), list);
  assert.deepEqual(ids(model.displayOrder([])), []);
});

test('图层顺序：拖到最顶（显示序第 0 行）', function () {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const plan = model.planDisplayMove(list, 'a', 'c', 'before');
  assert.deepEqual(plain(plan), { from: 0, to: 2 });
  assert.deepEqual(moveByName(list, plan), ['b', 'c', 'a']);
});

test('图层顺序：拖到最底（显示序最后一行）', function () {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const plan = model.planDisplayMove(list, 'c', 'a', 'after');
  assert.deepEqual(plain(plan), { from: 2, to: 0 });
  assert.deepEqual(moveByName(list, plan), ['c', 'a', 'b']);
});

test('图层顺序：相邻互换', function () {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const plan = model.planDisplayMove(list, 'b', 'c', 'before');
  assert.deepEqual(plain(plan), { from: 1, to: 2 });
  assert.deepEqual(moveByName(list, plan), ['a', 'c', 'b']);
});

test('图层顺序：落回原位返回 null 且不压栈（计划为 null）', function () {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(model.planDisplayMove(list, 'c', 'b', 'before'), null);
  assert.equal(model.planDisplayMove(list, 'b', 'b', 'before'), null);
  // 非法 placement 与不存在的 id
  assert.equal(model.planDisplayMove(list, 'a', 'c', 'above'), null);
  assert.equal(model.planDisplayMove(list, 'a', 'zzz', 'before'), null);
  assert.equal(model.planDisplayMove(list, 'zzz', 'c', 'before'), null);
  assert.deepEqual(ids(list), ['a', 'b', 'c']);
});

test('图层顺序：单元素与空列表一律返回 null', function () {
  const single = [{ id: 'only' }];
  assert.equal(model.planDisplayMove(single, 'only', 'only', 'before'), null);
  assert.equal(model.planStepMove(single, 'only', 1), null);
  assert.equal(model.planStepMove(single, 'only', -1), null);
  assert.equal(model.planDisplayMove([], 'a', 'b', 'before'), null);
  assert.equal(model.planStepMove([], 'a', 1), null);
  assert.equal(model.moveItem([], 0, 0), false);
});

test('图层顺序：显示下标映射回模型下标', function () {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  // 显示序是 [c,b,a]：拖到最顶 = 模型下标 2，必须由计划换算得到
  assert.equal(model.planDisplayMove(list, 'a', 'c', 'before').to, 2);
  // 拖到最底 = 模型下标 0
  assert.equal(model.planDisplayMove(list, 'c', 'a', 'after').to, 0);
  // 计划里的 from 是模型下标，与显示序无关
  assert.equal(model.planDisplayMove(list, 'a', 'c', 'before').from, 0);
});

test('图层顺序：planDisplayMove 不修改入参（计划阶段无副作用）', function () {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const snapshot = JSON.parse(JSON.stringify(list));
  model.planDisplayMove(list, 'a', 'c', 'before');
  model.planDisplayMove(list, 'c', 'a', 'after');
  assert.deepEqual(plain(list), snapshot);
});

test('图层顺序：planStepMove 步进与越界', function () {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  // +1 更靠顶层
  assert.deepEqual(plain(model.planStepMove(list, 'a', 1)), { from: 0, to: 1 });
  assert.deepEqual(plain(model.planStepMove(list, 'b', 1)), { from: 1, to: 2 });
  assert.deepEqual(plain(model.planStepMove(list, 'c', -1)), { from: 2, to: 1 });
  // 越界
  assert.equal(model.planStepMove(list, 'a', -1), null);
  assert.equal(model.planStepMove(list, 'c', 1), null);
  // 非法步长与不存在的 id
  assert.equal(model.planStepMove(list, 'a', 0), null);
  assert.equal(model.planStepMove(list, 'a', 1.5), null);
  assert.equal(model.planStepMove(list, 'a', NaN), null);
  assert.equal(model.planStepMove(list, 'zzz', 1), null);
  assert.deepEqual(ids(list), ['a', 'b', 'c']);
});

test('图层顺序：moveItem 越界/相同下标返回 false，成功移动后顺序正确', function () {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(model.moveItem(list, 0, 0), false);
  assert.equal(model.moveItem(list, -1, 1), false);
  assert.equal(model.moveItem(list, 0, 3), false);
  assert.equal(model.moveItem(list, 3, 0), false);
  assert.equal(model.moveItem(list, 0.5, 1), false);
  assert.deepEqual(ids(list), ['a', 'b', 'c']);
  assert.equal(model.moveItem(list, 2, 0), true);
  assert.deepEqual(ids(list), ['c', 'a', 'b']);
  assert.equal(model.moveItem(list, 0, 2), true);
  assert.deepEqual(ids(list), ['a', 'b', 'c']);
});


/* ---------- 图片调色与渐隐 ---------- */

function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, message + '：期望 ' + expected + '，实际 ' + actual);
}

test('图片效果：默认字段与范围常量', function () {
  assert.equal(model.BRIGHTNESS_MIN, 0.5);
  assert.equal(model.BRIGHTNESS_MAX, 1.5);
  assert.equal(model.HUE_MIN, -180);
  assert.equal(model.HUE_MAX, 180);
  assert.deepEqual(plain(model.FADE_MODES), ['off', 'single', 'double']);
  assert.equal(model.FADE_ANGLE_MIN, 0);
  assert.equal(model.FADE_ANGLE_MAX, 360);
  assert.equal(model.FADE_POSITION_MIN, 0);
  assert.equal(model.FADE_POSITION_MAX, 1);
  assert.equal(model.FADE_WIDTH_MIN, 0);
  assert.equal(model.FADE_WIDTH_MAX, 1);
  assert.equal(model.FADE_TRANSPARENCY_MIN, 0);
  assert.equal(model.FADE_TRANSPARENCY_MAX, 1);

  const project = model.createDefaultProject();
  const free = plain(model.createImageElement(project, 'asset-1', 400, 300));
  assert.equal(free.brightness, 1);
  assert.equal(free.hue, 0);
  assert.equal(free.fadeMode, 'off');
  assert.equal(free.fadeAngle, 0);
  assert.equal(free.fadePosition, 0);
  assert.equal(free.fadeWidth, 1);
  assert.equal(free.fadeTop, 0);
  assert.equal(free.fadeBottom, 1);

  const background = plain(model.createBackgroundImage('asset-1', 'cover'));
  assert.equal(background.brightness, 1);
  assert.equal(background.hue, 0);
  assert.equal(background.fadeMode, 'off');
  assert.equal(background.fadeAngle, 0);
  assert.equal(background.fadePosition, 0);
  assert.equal(background.fadeWidth, 1);
  assert.equal(background.fadeTop, 0);
  assert.equal(background.fadeBottom, 1);

  // 默认值不改变像素，因此不算“已调整”。
  assert.equal(model.hasImageEffects(background), false);
  assert.equal(model.hasImageEffects({}), false);
  assert.equal(model.hasImageEffects(null), false);
});

test('图片效果：hasImageEffects 任一字段非默认即 true', function () {
  assert.equal(model.hasImageEffects({ brightness: 1.2 }), true);
  assert.equal(model.hasImageEffects({ hue: -30 }), true);
  assert.equal(model.hasImageEffects({ fadeMode: 'single' }), true);
  assert.equal(model.hasImageEffects({ fadeMode: 'double' }), true);
  assert.equal(model.hasImageEffects({ fadeAngle: 30 }), true);
  assert.equal(model.hasImageEffects({ fadePosition: 0.4 }), true);
  assert.equal(model.hasImageEffects({ fadeWidth: 0.4 }), true);
  assert.equal(model.hasImageEffects({ fadeTop: 0.4 }), true);
  assert.equal(model.hasImageEffects({ fadeBottom: 0.4 }), true);
  // 未知渐隐模式按默认“关闭”处理，不制造假提示。
  assert.equal(model.hasImageEffects({ fadeMode: 'x' }), false);
});

test('图片效果：fadeValues 按模式补齐预设并夹取范围', function () {
  assert.deepEqual(plain(model.fadeValues({})), {
    mode: 'off', angle: 0, position: 0, width: 1, top: 0, bottom: 1
  });
  assert.deepEqual(plain(model.fadeValues({ fadeMode: 'single' })), {
    mode: 'single', angle: 0, position: 0, width: 1, top: 0, bottom: 1
  });
  assert.deepEqual(plain(model.fadeValues({ fadeMode: 'double' })), {
    mode: 'double', angle: 0, position: 0.5, width: 0, top: 1, bottom: 1
  });
  assert.deepEqual(plain(model.fadeValues({
    fadeMode: 'single',
    fadeAngle: 500,
    fadePosition: 2,
    fadeWidth: -1,
    fadeTop: 1.4,
    fadeBottom: -0.2
  })), {
    mode: 'single', angle: 360, position: 1, width: 0, top: 1, bottom: 0
  });
  assert.deepEqual(plain(model.fadeDefaults('double')), {
    fadePosition: 0.5, fadeWidth: 0, fadeTop: 1, fadeBottom: 1
  });
  assert.deepEqual(plain(model.fadeDefaults('unknown')), {
    fadePosition: 0, fadeWidth: 1, fadeTop: 0, fadeBottom: 1
  });
});

test('图片效果：fadeProfile 单向使用位置/宽度/两端透明度', function () {
  const profile = plain(model.fadeProfile({
    fadeMode: 'single',
    fadePosition: 0.25,
    fadeWidth: 0.5,
    fadeTop: 0.4,
    fadeBottom: 1
  }));
  closeTo(profile.from, 0.25, '单向渐变起点');
  closeTo(profile.to, 0.75, '单向渐变终点');
  assert.deepEqual(profile.stops, [
    { t: 0.25, alpha: 0.6 },
    { t: 0.75, alpha: 0 }
  ]);

  // 宽度为 0 时退化为极窄的坡，避免零长度渐变。
  const hard = plain(model.fadeProfile({
    fadeMode: 'single', fadePosition: 0.5, fadeWidth: 0, fadeTop: 0, fadeBottom: 1
  }));
  closeTo(hard.from, 0.5, '硬边起点');
  assert.ok(hard.to > hard.from);
  assert.ok(hard.to - hard.from < 0.001);
});

test('图片效果：fadeProfile 双向把不透明带夹在图片内', function () {
  const centered = plain(model.fadeProfile({
    fadeMode: 'double', fadePosition: 0.5, fadeWidth: 0.4, fadeTop: 1, fadeBottom: 1
  }));
  closeTo(centered.from, 0, '双向向量起点');
  closeTo(centered.to, 1, '双向向量终点');
  assert.deepEqual(centered.stops, [
    { t: 0, alpha: 0 },
    { t: 0.3, alpha: 1 },
    { t: 0.7, alpha: 1 },
    { t: 1, alpha: 0 }
  ]);

  // 不透明带超出起点时贴边，一端没有过渡坡，对应端透明度不再可见。
  const nearTop = plain(model.fadeProfile({
    fadeMode: 'double', fadePosition: 0.1, fadeWidth: 0.4, fadeTop: 1, fadeBottom: 0.2
  }));
  assert.deepEqual(nearTop.stops, [
    { t: 0, alpha: 1 },
    { t: 0.4, alpha: 1 },
    { t: 1, alpha: 0.8 }
  ]);

  // 默认双向与旧观感一致：两端全透明、中点不透明。
  const legacy = plain(model.fadeProfile({ fadeMode: 'double' }));
  assert.deepEqual(legacy.stops, [
    { t: 0, alpha: 0 },
    { t: 0.5, alpha: 1 },
    { t: 1, alpha: 0 }
  ]);
});

test('图片效果：fadeGradientPoints 0° 自上而下', function () {
  const points = plain(model.fadeGradientPoints(0, 200, 100));
  closeTo(points.x1, 0, '0° 起点 x');
  closeTo(points.x2, 0, '0° 终点 x');
  closeTo(points.y1, -50, '0° 起点 y');
  closeTo(points.y2, 50, '0° 终点 y');
});

test('图片效果：fadeGradientPoints 90° 自左向右', function () {
  const points = plain(model.fadeGradientPoints(90, 200, 100));
  closeTo(points.x1, -100, '90° 起点 x');
  closeTo(points.x2, 100, '90° 终点 x');
  closeTo(points.y1, 0, '90° 起点 y');
  closeTo(points.y2, 0, '90° 终点 y');
});

test('图片效果：fadeGradientPoints 45° 端点落在矩形半投影上', function () {
  const width = 200;
  const height = 100;
  const points = plain(model.fadeGradientPoints(45, width, height));
  const half = (width / 2) * Math.SQRT1_2 + (height / 2) * Math.SQRT1_2;
  closeTo(points.x1, -half * Math.SQRT1_2, '45° 起点 x');
  closeTo(points.y1, -half * Math.SQRT1_2, '45° 起点 y');
  closeTo(points.x2, half * Math.SQRT1_2, '45° 终点 x');
  closeTo(points.y2, half * Math.SQRT1_2, '45° 终点 y');
  // 宽高不等时两端点距离等于盒子在该方向上的投影长度。
  closeTo(Math.hypot(points.x2 - points.x1, points.y2 - points.y1), half * 2, '45° 端点距离');
});

test('图片效果：fadeMaskRect 完全在页面内时等于图片矩形', function () {
  const mask = plain(model.fadeMaskRect(
    { x: 100, y: 200, width: 400, height: 300 },
    { width: 1080, height: 1920 },
    0
  ));
  assert.deepEqual(mask, { x: -200, y: -150, width: 400, height: 300 });
});

test('图片效果：fadeMaskRect cover 矩形大于页面时裁到页面', function () {
  const mask = plain(model.fadeMaskRect(
    { x: -420, y: 0, width: 1920, height: 1920 },
    { width: 1080, height: 1920 },
    0
  ));
  assert.deepEqual(mask, { x: -540, y: -960, width: 1080, height: 1920 });
});

test('图片效果：fadeMaskRect 旋转 30° 后取交集在局部坐标的外接矩形', function () {
  const mask = plain(model.fadeMaskRect(
    { x: -100, y: 900, width: 200, height: 100 },
    { width: 1080, height: 1920 },
    30
  ));
  // 旋转后左侧两角越出页面，裁剪后的局部包围盒比整张图窄。
  closeTo(mask.x, -28.8675134595, '旋转 30° 掩膜左边界');
  closeTo(mask.y, -50, '旋转 30° 掩膜上边界');
  closeTo(mask.width, 128.8675134595, '旋转 30° 掩膜宽度');
  closeTo(mask.height, 100, '旋转 30° 掩膜高度');
  assert.equal(model.fadeMaskRect(
    { x: -500, y: 900, width: 100, height: 100 },
    { width: 1080, height: 1920 },
    0
  ), null);
});

test('图片效果：复制页面背景保留效果字段', function () {
  const background = model.createPageBackground('#ffffff');
  const image = model.createBackgroundImage('asset-1', 'cover');
  image.brightness = 1.2;
  image.hue = -30;
  image.fadeMode = 'double';
  image.fadeAngle = 120;
  image.fadePosition = 0.4;
  image.fadeWidth = 0.2;
  image.fadeTop = 0.75;
  image.fadeBottom = 0.5;
  background.items.push(image);

  const copy = model.clonePageBackground(background);
  assert.equal(copy.color, '#ffffff');
  assert.equal(copy.items.length, 1);
  assert.notEqual(copy.items[0].id, image.id);
  assert.equal(copy.items[0].brightness, 1.2);
  assert.equal(copy.items[0].hue, -30);
  assert.equal(copy.items[0].fadeMode, 'double');
  assert.equal(copy.items[0].fadeAngle, 120);
  assert.equal(copy.items[0].fadePosition, 0.4);
  assert.equal(copy.items[0].fadeWidth, 0.2);
  assert.equal(copy.items[0].fadeTop, 0.75);
  assert.equal(copy.items[0].fadeBottom, 0.5);

  // 副本与原图互不共享对象。
  copy.items[0].brightness = 0.8;
  assert.equal(image.brightness, 1.2);
});

test('图片效果：替换图片只改 assetId，效果字段保持不变', function () {
  const image = model.createBackgroundImage('asset-old', 'cover');
  image.brightness = 1.3;
  image.hue = 45;
  image.fadeMode = 'single';
  image.fadeAngle = 30;
  image.fadePosition = 0.1;
  image.fadeWidth = 0.8;
  image.fadeTop = 0.3;
  image.fadeBottom = 0.9;

  const replaced = model.cloneBackgroundImage(image);
  replaced.assetId = 'asset-new';
  assert.equal(replaced.assetId, 'asset-new');
  assert.equal(replaced.brightness, 1.3);
  assert.equal(replaced.hue, 45);
  assert.equal(replaced.fadeMode, 'single');
  assert.equal(replaced.fadeAngle, 30);
  assert.equal(replaced.fadePosition, 0.1);
  assert.equal(replaced.fadeWidth, 0.8);
  assert.equal(replaced.fadeTop, 0.3);
  assert.equal(replaced.fadeBottom, 0.9);
  assert.equal(image.assetId, 'asset-old');
});

/* ---------- 页面背景模型 ---------- */

test('背景模型：默认项目为版本 5 且每页拥有背景', function () {
  const project = model.createDefaultProject();
  assert.equal(project.version, 5);
  assert.equal(project.globalBackgroundPageId, null);
  assert.equal(project.pages.length, 1);
  assert.equal(project.pages[0].background.color, model.DEFAULT_BACKGROUND_COLOR);
  assert.equal(model.PROJECT_VERSION, 5);
  assert.equal(project.pages[0].background.items.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(project.pages[0].background, 'images'), false);

  const image = model.createBackgroundImage('asset-1', 'cover');
  assert.equal(image.kind, 'image');
  assert.equal(model.DEFAULT_BACKGROUND_IMAGE.kind, 'image');
});

test('背景模型：新增页复制背景值，图片 ID 独立、资产共享', function () {
  const project = model.createDefaultProject();
  const source = project.pages[0];
  const image = model.createBackgroundImage('asset-1', 'cover');
  image.brightness = 1.2;
  source.background.color = '#123456';
  source.background.items.push(image);

  const page = model.createPage(model.effectiveBackground(project, source));
  assert.notEqual(page.id, source.id);
  assert.equal(page.background.color, '#123456');
  assert.equal(page.background.items.length, 1);
  assert.notEqual(page.background.items[0].id, image.id);
  assert.equal(page.background.items[0].assetId, 'asset-1');
  assert.equal(page.background.items[0].brightness, 1.2);

  page.background.items[0].brightness = 0.8;
  assert.equal(image.brightness, 1.2);
});

test('背景模型：复制背景保持图片与图形混排顺序，所有条目换新 ID', function () {
  const project = model.createDefaultProject();
  const source = project.pages[0];
  const image = model.createBackgroundImage('asset-1', 'cover');
  const shape = L.shape.createBackgroundShape(120, 160, 240, 160);
  shape.radius = -18;
  source.background.items.push(image, shape, model.createBackgroundImage('asset-2', 'original'));

  const page = model.createPage(model.effectiveBackground(project, source));
  const items = page.background.items;
  assert.equal(items.map(function (item) { return item.kind; }).join(','), 'image,shape,image');
  assert.notEqual(items[0].id, image.id);
  assert.notEqual(items[1].id, shape.id);
  assert.equal(items[1].radius, -18);
  items[1].radius = 12;
  assert.equal(shape.radius, -18);
});

test('背景模型：全局指针最后设置生效，取消后各页显示自己的背景', function () {
  const project = model.createDefaultProject();
  const first = project.pages[0];
  first.background.color = '#111111';
  const second = model.createPage(model.createPageBackground('#222222'));
  project.pages.push(second);

  assert.equal(model.canEditPageBackground(project, first), true);
  assert.equal(model.setGlobalBackgroundPage(project, first), true);
  assert.equal(model.findGlobalBackgroundPage(project).id, first.id);
  assert.equal(model.isBackgroundCovered(project, second), true);
  assert.equal(model.canEditPageBackground(project, second), false);
  assert.equal(model.effectiveBackground(project, second).color, '#111111');

  assert.equal(model.setGlobalBackgroundPage(project, second), true);
  assert.equal(model.findGlobalBackgroundPage(project).id, second.id);
  assert.equal(model.effectiveBackground(project, first).color, '#222222');

  model.clearGlobalBackground(project);
  assert.equal(project.globalBackgroundPageId, null);
  assert.equal(model.effectiveBackground(project, first).color, '#111111');
  assert.equal(model.effectiveBackground(project, second).color, '#222222');
});
