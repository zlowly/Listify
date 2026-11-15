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
