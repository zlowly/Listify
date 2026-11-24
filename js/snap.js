'use strict';

/*
 * 内容层吸附的纯几何计算。
 *
 * 这里只做数值比较与宽度换算，不引用 DOM、canvas、layout 或 render；
 * 因而可以直接被 scripts/checks/loader.js 装进 Node 做回归。
 * 候选线的收集、参考线绘制和模型写入都由 app-interactions.js 负责。
 */
(function () {
  var L = window.Listify = window.Listify || {};

  var SCREEN_THRESHOLD = 6;
  var RELEASE_SCREEN = 2;
  var MIN_COLUMN_WIDTH = 24;

  // 数值越小优先级越高：页面内容区 > 分类块外框 > 表格内边 > 列分隔线。
  var PRIORITY = {
    page: 0,
    block: 1,
    table: 2,
    divider: 3
  };

  function finite(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function targetPriority(target) {
    var value = target && Number(target.priority);
    return isFinite(value) ? value : PRIORITY.divider;
  }

  function sameValue(a, b) {
    return Math.abs(a - b) <= 1e-6;
  }

  // 同一坐标只保留优先级最高的一条；优先级相同时保留先出现的目标。
  function dedupeTargets(targets) {
    var list = [];
    if (!Array.isArray(targets)) return list;
    targets.forEach(function (target) {
      if (!target || !finite(Number(target.value))) return;
      var value = Number(target.value);
      var found = null;
      for (var i = 0; i < list.length; i += 1) {
        if (sameValue(list[i].value, value)) {
          found = list[i];
          break;
        }
      }
      if (!found) {
        list.push(Object.assign({}, target, { value: value }));
      } else if (targetPriority(target) < targetPriority(found)) {
        list[list.indexOf(found)] = Object.assign({}, target, { value: value });
      }
    });
    return list;
  }

  function pageThreshold(scale) {
    var value = Number(scale);
    if (!isFinite(value) || value <= 0) return SCREEN_THRESHOLD;
    return SCREEN_THRESHOLD / value;
  }

  /*
   * 从一条可动的原始线（anchor.value）选择一个吸附目标。
   *
   * hold 是上一次 choose 的返回值；只要目标仍通过 isValid、原始线仍在
   * threshold + release 内，就保持原目标，避免阈值边界抖动。
   * 返回 { anchor, target, delta } 或 null，delta 由调用方加到原始坐标上。
   */
  function choose(options) {
    var opts = options || {};
    var anchor = opts.anchor || {};
    var raw = Number(anchor.value);
    if (!isFinite(raw)) return null;

    var targets = dedupeTargets(opts.targets);
    var threshold = Math.max(0, Number(opts.threshold) || 0);
    var release = Math.max(0, Number(opts.release) || 0);
    var isValid = typeof opts.isValid === 'function' ? opts.isValid : null;
    var hold = opts.hold;

    if (hold && hold.target && finite(Number(hold.target.value))) {
      var heldValue = Number(hold.target.value);
      var held = null;
      for (var i = 0; i < targets.length; i += 1) {
        if (sameValue(targets[i].value, heldValue)) {
          held = targets[i];
          break;
        }
      }
      if (!held) held = hold.target;
      if (
        held &&
        Math.abs(held.value - raw) <= threshold + release &&
        (!isValid || isValid(anchor, held))
      ) {
        return { anchor: anchor, target: held, delta: held.value - raw };
      }
    }

    var best = null;
    var bestDistance = Infinity;
    var bestPriority = Infinity;
    targets.forEach(function (target) {
      var distance = Math.abs(target.value - raw);
      if (distance > threshold) return;
      if (isValid && !isValid(anchor, target)) return;
      var priority = targetPriority(target);
      if (
        distance < bestDistance - 1e-9 ||
        (Math.abs(distance - bestDistance) <= 1e-9 && priority < bestPriority)
      ) {
        best = target;
        bestDistance = distance;
        bestPriority = priority;
      }
    });

    if (!best) return null;
    return { anchor: anchor, target: best, delta: best.value - raw };
  }

  /*
   * 把吸附目标换算成分类块宽度。
   *
   * side:
   *   'e' 右手柄，target 是块右边或表格右边；
   *   'w' 左手柄，target 是块左边或表格左边，elementRight 固定。
   * kind:
   *   'block' 直接用块边；
   *   'table' 加上被拖一侧的表格边距，抵消表格内缩。
   * 返回未取整、未 clamp 的宽度；调用方继续沿用 80..pageWidth*3 的范围。
   */
  function widthFromEdge(options) {
    var opts = options || {};
    var target = Number(opts.target);
    var elementX = Number(opts.elementX);
    var elementRight = Number(opts.elementRight);
    var margin = Number(opts.margin);
    if (!isFinite(target) || !isFinite(elementX)) return null;
    if (!isFinite(margin)) margin = 0;

    if (opts.side === 'e') {
      if (opts.kind === 'block') return target - elementX;
      if (opts.kind === 'table') return target - elementX + margin;
      return null;
    }
    if (opts.side === 'w') {
      if (!isFinite(elementRight)) return null;
      if (opts.kind === 'block') return elementRight - target;
      if (opts.kind === 'table') return elementRight - target + margin;
      return null;
    }
    return null;
  }

  /*
   * 把分隔线位移只写进相邻两列，并保护最小列宽。
   * 返回新的列宽数组；目标不可达时返回 null，调用方回退到自由拖动。
   */
  function applyDividerDelta(options) {
    var opts = options || {};
    if (!Array.isArray(opts.widths)) return null;
    var index = Number(opts.dividerIndex);
    var delta = Number(opts.delta);
    var minWidth = Number(opts.minWidth);
    if (!isFinite(minWidth)) minWidth = MIN_COLUMN_WIDTH;
    if (!isFinite(index) || index < 0 || index >= opts.widths.length - 1) return null;
    if (!isFinite(delta)) return null;

    var widths = opts.widths.slice();
    var left = Number(widths[index]) + delta;
    var right = Number(widths[index + 1]) - delta;
    if (!isFinite(left) || !isFinite(right)) return null;
    if (left < minWidth || right < minWidth) return null;
    widths[index] = left;
    widths[index + 1] = right;
    return widths;
  }

  L.snap = {
    SCREEN_THRESHOLD: SCREEN_THRESHOLD,
    RELEASE_SCREEN: RELEASE_SCREEN,
    MIN_COLUMN_WIDTH: MIN_COLUMN_WIDTH,
    PRIORITY: PRIORITY,
    pageThreshold: pageThreshold,
    choose: choose,
    widthFromEdge: widthFromEdge,
    applyDividerDelta: applyDividerDelta
  };
})();
