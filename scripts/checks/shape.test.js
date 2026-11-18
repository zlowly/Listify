'use strict';

/*
 * js/shape.js 纯几何回归：角度、尺寸、圆角/边框上限、轮廓与命中。
 * 运行：node --test scripts/checks/shape.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const loader = require('./loader.js');
const L = loader.load();
const shape = L.shape;

function near(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= (tolerance == null ? 1e-6 : tolerance),
    (message || '') + ' 期望 ' + expected + '，实际 ' + actual);
}

test('图形默认值：方形、实心、240×240、不引用资产', function () {
  const element = shape.createShapeElement(10, 20);
  assert.equal(element.type, 'shape');
  assert.equal(element.kind, undefined);
  assert.equal(element.assetId, undefined);
  assert.equal(element.shape, 'rect');
  assert.equal(element.mode, 'fill');
  assert.equal(element.color, '#333333');
  assert.equal(element.radius, 0);
  assert.equal(element.strokeWidth, 8);
  assert.equal(element.opacity, 1);
  assert.equal(element.width, 240);
  assert.equal(element.height, 240);
  assert.match(element.id, /^shape/);

  const background = shape.createBackgroundShape(0, 0, 100, 80);
  assert.equal(background.kind, 'shape');
  assert.equal(background.type, undefined);
  assert.equal(background.id.indexOf('bgshape'), 0);
});

test('菱形角度：宽高推导与角度反推', function () {
  near(shape.diamondAngle(240, 240), 90);
  near(shape.diamondAngle(240, 120), 53.13010235415598);
  near(shape.diamondAngle(120, 240), 53.13010235415598);

  const square = shape.diamondSizeFromAngle(240, 240, 45);
  near(square.width, 240);
  near(square.height, 240 * Math.tan(Math.PI / 8));
  const ninety = shape.diamondSizeFromAngle(240, 240, 90);
  near(ninety.width, 240);
  near(ninety.height, 240);
  const zero = shape.diamondSizeFromAngle(240, 240, 0);
  near(zero.height, 1);

  const wide = shape.diamondSizeFromAngle(240, 120, 45);
  near(wide.width, 240);
  near(wide.height, 240 * Math.tan(Math.PI / 8));
  const tall = shape.diamondSizeFromAngle(120, 240, 45);
  near(tall.height, 240);
  near(tall.width, 240 * Math.tan(Math.PI / 8));
});

test('圆角上限：矩形与菱形的正/负范围', function () {
  const rect = { shape: 'rect', width: 240, height: 160, radius: 0 };
  assert.equal(shape.shapeInradius(rect), 80);
  assert.equal(shape.shapeConcaveLimit(rect), 80);

  const diamond = { shape: 'diamond', width: 240, height: 240, radius: 0 };
  const halfDiagonal = Math.hypot(120, 120);
  near(shape.shapeInradius(diamond), 240 * 240 / (4 * halfDiagonal));
  near(shape.shapeConcaveLimit(diamond), halfDiagonal / 2);
});

test('clampShape：宽高、枚举、带符号圆角与边框厚度', function () {
  const item = shape.clampShape({
    shape: 'unknown',
    mode: 'unknown',
    width: 0,
    height: -10,
    color: '',
    radius: 999,
    strokeWidth: 999,
    opacity: 3,
    blur: -2
  });
  assert.equal(item.shape, 'rect');
  assert.equal(item.mode, 'fill');
  assert.equal(item.width, 1);
  assert.equal(item.height, 1);
  assert.equal(item.color, '#333333');
  assert.equal(item.radius, 0.5);
  assert.equal(item.strokeWidth, 0.5);
  assert.equal(item.opacity, 1);
  assert.equal(item.blur, 0);

  const negative = shape.clampShape({ shape: 'rect', width: 200, height: 100, radius: -999 });
  assert.equal(negative.radius, -50);
  const positive = shape.clampShape({ shape: 'diamond', width: 200, height: 200, radius: 999 });
  near(positive.radius, shape.shapeInradius({ shape: 'diamond', width: 200, height: 200 }));
});

test('轮廓：直角、外凸圆角与内凹圆角都闭合且不超出外接框', function () {
  const plain = shape.shapeOutline({ shape: 'rect', width: 200, height: 100, radius: 0 });
  assert.equal(plain.commands.length, 4);
  assert.ok(plain.commands.every(function (command) { return command.type === 'line'; }));

  const rounded = shape.shapeOutline({ shape: 'rect', width: 200, height: 100, radius: 20 });
  assert.equal(rounded.commands.filter(function (command) { return command.type === 'arc'; }).length, 4);
  assert.equal(rounded.commands.filter(function (command) { return command.type === 'line'; }).length, 4);

  const concave = shape.shapeOutline({ shape: 'diamond', width: 200, height: 200, radius: -30 });
  assert.equal(concave.commands.filter(function (command) { return command.type === 'arc'; }).length, 4);
  assert.equal(concave.commands.filter(function (command) { return command.type === 'line'; }).length, 4);

  shape.outlinePoints(concave).forEach(function (point) {
    assert.ok(Math.abs(point.x) <= 100 + 1e-6);
    assert.ok(Math.abs(point.y) <= 100 + 1e-6);
  });
});

test('命中：菱形空白角、正圆角外侧与负圆角缺口都不命中', function () {
  const diamond = { shape: 'diamond', width: 200, height: 200, radius: 0 };
  assert.equal(shape.shapeContains(diamond, 0, 0), true);
  assert.equal(shape.shapeContains(diamond, 95, 95), false);

  const rounded = { shape: 'rect', width: 200, height: 200, radius: 30 };
  assert.equal(shape.shapeContains(rounded, 0, 0), true);
  assert.equal(shape.shapeContains(rounded, 70, 70), true);
  assert.equal(shape.shapeContains(rounded, 98, 98), false);

  const concave = { shape: 'rect', width: 200, height: 200, radius: -30 };
  assert.equal(shape.shapeContains(concave, 0, 0), true);
  assert.equal(shape.shapeContains(concave, 95, 95), false);
  assert.equal(shape.shapeContains(concave, 60, 60), true);
});
