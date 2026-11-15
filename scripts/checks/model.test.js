'use strict';

/*
 * js/model.js 的纯逻辑回归。
 * 运行：node --test scripts/checks/model.test.js
 *
 * 这里不覆盖画布绘制、资产下载与 IndexedDB；只保证文本宽度、排序、
 * 字体栈规整、边距归一化与深拷贝的现有语义不被后续拆分改掉。
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
