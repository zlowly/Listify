'use strict';

/*
 * js/render.js 中缩略图色相助手的纯逻辑回归。
 * 运行：node --test scripts/checks/render.test.js
 *
 * 这里只覆盖 `L.render.hueFilter` 的归一化与滤镜串格式；画布绘制、
 * 图层 DOM 与真实 CSS 滤镜渲染不在 Node 边界内。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const loader = require('./loader.js');

const L = loader.load();

test('render.hueFilter：已导出', function () {
  assert.equal(typeof L.render.hueFilter, 'function');
});

test('render.hueFilter：非零有限值换算为 hue-rotate', function () {
  assert.equal(L.render.hueFilter({ hue: 90 }), 'hue-rotate(90deg)');
  assert.equal(L.render.hueFilter({ hue: -45 }), 'hue-rotate(-45deg)');
  // 字符串数字按既有 finiteOr 归一化规则接受。
  assert.equal(L.render.hueFilter({ hue: '180' }), 'hue-rotate(180deg)');
});

test('render.hueFilter：0、缺失与非法值返回空串（保持原图外观）', function () {
  assert.equal(L.render.hueFilter({}), '');
  assert.equal(L.render.hueFilter({ hue: 0 }), '');
  assert.equal(L.render.hueFilter({ hue: 'abc' }), '');
  assert.equal(L.render.hueFilter({ hue: null }), '');
  assert.equal(L.render.hueFilter(null), '');
});
