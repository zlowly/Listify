'use strict';

/*
 * js/snap.js 的纯几何回归。
 * 运行：node --test scripts/checks/snap.test.js
 *
 * 这里只验证吸附阈值、目标选择、宽度换算和列宽保护；
 * 候选线收集与参考线绘制属于画布交互，由浏览器手测覆盖。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('./loader.js');

const L = load();
const snap = L.snap;

function target(value, priority, extra) {
  return Object.assign({ value: value, priority: priority }, extra || {});
}

test('pageThreshold：屏幕像素按缩放换算为页面坐标', function () {
  assert.equal(snap.SCREEN_THRESHOLD, 6);
  assert.equal(snap.RELEASE_SCREEN, 2);
  assert.equal(snap.pageThreshold(1), 6);
  assert.equal(snap.pageThreshold(2), 3);
  assert.equal(snap.pageThreshold(0.5), 12);
  assert.equal(snap.pageThreshold(0), 6);
});

test('choose：阈值内吸附，阈值外不吸附', function () {
  const anchor = { value: 100, kind: 'block' };
  assert.equal(
    snap.choose({ anchor: anchor, targets: [target(106.1, 0)], threshold: 6, release: 0 }),
    null
  );
  const inside = snap.choose({
    anchor: anchor,
    targets: [target(105.9, 0)],
    threshold: 6,
    release: 0
  });
  assert.ok(inside);
  assert.equal(inside.target.value, 105.9);
  assert.ok(Math.abs(inside.delta - 5.9) < 1e-9);
});

test('choose：选择最近目标', function () {
  const result = snap.choose({
    anchor: { value: 100 },
    targets: [target(104, snap.PRIORITY.page), target(97, snap.PRIORITY.divider)],
    threshold: 6,
    release: 0
  });
  assert.equal(result.target.value, 97);
});

test('choose：距离相同时按页面 > 块 > 表格 > 分隔线选优先级', function () {
  const result = snap.choose({
    anchor: { value: 100 },
    targets: [target(96, snap.PRIORITY.block), target(104, snap.PRIORITY.page)],
    threshold: 6,
    release: 0
  });
  assert.equal(result.target.value, 104);

  const tableWins = snap.choose({
    anchor: { value: 100 },
    targets: [target(96, snap.PRIORITY.divider), target(104, snap.PRIORITY.table)],
    threshold: 6,
    release: 0
  });
  assert.equal(tableWins.target.value, 104);
});

test('choose：同一坐标去重并保留更高优先级', function () {
  const lowFirst = snap.choose({
    anchor: { value: 100 },
    targets: [
      target(103, snap.PRIORITY.divider, { id: 'divider' }),
      target(103, snap.PRIORITY.page, { id: 'page' })
    ],
    threshold: 6,
    release: 0
  });
  assert.equal(lowFirst.target.id, 'page');

  const highFirst = snap.choose({
    anchor: { value: 100 },
    targets: [
      target(103, snap.PRIORITY.page, { id: 'page' }),
      target(103, snap.PRIORITY.divider, { id: 'divider' })
    ],
    threshold: 6,
    release: 0
  });
  assert.equal(highFirst.target.id, 'page');
});

test('choose：hold 在 threshold + release 内保持，超出后释放', function () {
  const targets = [target(100, snap.PRIORITY.page)];
  const first = snap.choose({
    anchor: { value: 101 },
    targets: targets,
    threshold: 6,
    release: 0
  });
  assert.ok(first);
  assert.equal(first.target.value, 100);

  const held = snap.choose({
    anchor: { value: 107.5 },
    targets: targets,
    threshold: 6,
    release: 2,
    hold: first
  });
  assert.ok(held);
  assert.equal(held.target.value, 100);

  const released = snap.choose({
    anchor: { value: 108.5 },
    targets: targets,
    threshold: 6,
    release: 2,
    hold: first
  });
  assert.equal(released, null);
});

test('choose：hold 不阻塞最近的新目标，但保持期间优先旧目标', function () {
  const targets = [target(100, snap.PRIORITY.page)];
  const first = snap.choose({
    anchor: { value: 100 },
    targets: targets,
    threshold: 6,
    release: 0
  });
  const held = snap.choose({
    anchor: { value: 104 },
    targets: [target(100, snap.PRIORITY.page), target(104, snap.PRIORITY.block)],
    threshold: 6,
    release: 2,
    hold: first
  });
  assert.equal(held.target.value, 100);

  const afterRelease = snap.choose({
    anchor: { value: 104 },
    targets: [target(100, snap.PRIORITY.page), target(104, snap.PRIORITY.block)],
    threshold: 6,
    release: 2,
    hold: null
  });
  assert.equal(afterRelease.target.value, 104);
});

test('choose：isValid 过滤不可达目标，hold 失效时重新选择', function () {
  const anchor = { value: 100 };
  const blocked = snap.choose({
    anchor: anchor,
    targets: [target(100, snap.PRIORITY.page)],
    threshold: 6,
    release: 0,
    isValid: function () { return false; }
  });
  assert.equal(blocked, null);

  const fallback = snap.choose({
    anchor: anchor,
    targets: [target(100, snap.PRIORITY.page), target(102, snap.PRIORITY.block)],
    threshold: 6,
    release: 0,
    isValid: function (a, t) { return t.value !== 100; }
  });
  assert.equal(fallback.target.value, 102);

  const hold = snap.choose({
    anchor: anchor,
    targets: [target(100, snap.PRIORITY.page)],
    threshold: 6,
    release: 0
  });
  const invalidHold = snap.choose({
    anchor: { value: 101 },
    targets: [target(100, snap.PRIORITY.page)],
    threshold: 6,
    release: 2,
    hold: hold,
    isValid: function () { return false; }
  });
  assert.equal(invalidHold, null);
});

test('widthFromEdge：块边与表格边、左右手柄四个分支', function () {
  assert.equal(
    snap.widthFromEdge({ side: 'e', kind: 'block', target: 300, elementX: 100 }),
    200
  );
  assert.equal(
    snap.widthFromEdge({
      side: 'e',
      kind: 'table',
      target: 300,
      elementX: 100,
      margin: 40
    }),
    240
  );
  assert.equal(
    snap.widthFromEdge({
      side: 'w',
      kind: 'block',
      target: 100,
      elementX: 100,
      elementRight: 300
    }),
    200
  );
  assert.equal(
    snap.widthFromEdge({
      side: 'w',
      kind: 'table',
      target: 140,
      elementX: 100,
      elementRight: 300,
      margin: 40
    }),
    200
  );
});

test('applyDividerDelta：只改相邻两列并保持总宽', function () {
  const widths = [100, 80, 120];
  const result = snap.applyDividerDelta({
    widths: widths,
    dividerIndex: 0,
    delta: 10,
    minWidth: 24
  });
  assert.deepEqual(result, [110, 70, 120]);
  assert.deepEqual(widths, [100, 80, 120], '不得原地修改输入');
  assert.equal(result[0] + result[1] + result[2], 300);
});

test('applyDividerDelta：任一侧低于最小列宽时返回 null 且总宽不变', function () {
  const widths = [100, 80, 120];
  assert.equal(
    snap.applyDividerDelta({ widths: widths, dividerIndex: 0, delta: 80, minWidth: 24 }),
    null
  );
  assert.equal(
    snap.applyDividerDelta({ widths: widths, dividerIndex: 0, delta: -90, minWidth: 24 }),
    null
  );
  assert.equal(
    snap.applyDividerDelta({ widths: widths, dividerIndex: 1, delta: 100, minWidth: 24 }),
    null
  );
  assert.deepEqual(widths, [100, 80, 120]);
});
