(function () {
  'use strict';

  /*
   * 图形几何（方形 / 菱形）的纯逻辑实现。
   *
   * 这一层不接触 DOM、canvas、存储与 L.app：渲染、校验、项目读写与 Node
   * 回归测试都复用同一份默认值、角度换算、圆角/边框上限和命中判断。
   * 坐标使用“图形局部坐标”，原点在图形外接框中心，y 轴向下。
   */

  const L = window.Listify = window.Listify || {};
  const EPSILON = 1e-9;

  const SHAPE_KINDS = ['rect', 'diamond'];
  const SHAPE_MODES = ['fill', 'stroke'];
  const DEFAULT_SHAPE = {
    shape: 'rect',
    mode: 'fill',
    color: '#333333',
    radius: 0,
    strokeWidth: 8,
    opacity: 1,
    blur: 0,
    brightness: 1,
    hue: 0,
    fadeMode: 'off',
    fadeAngle: 0,
    fadePosition: 0,
    fadeWidth: 1,
    fadeTop: 0,
    fadeBottom: 1
  };

  function finite(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function localSize(width, height) {
    return {
      width: Math.max(1, finite(width, 240)),
      height: Math.max(1, finite(height, 240))
    };
  }

  function normalizeShape(shape) {
    const source = shape && typeof shape === 'object' ? shape : {};
    const size = localSize(source.width, source.height);
    return {
      shape: SHAPE_KINDS.indexOf(source.shape) >= 0 ? source.shape : 'rect',
      mode: SHAPE_MODES.indexOf(source.mode) >= 0 ? source.mode : 'fill',
      color: typeof source.color === 'string' && source.color ? source.color : DEFAULT_SHAPE.color,
      width: size.width,
      height: size.height,
      radius: finite(source.radius, 0),
      strokeWidth: finite(source.strokeWidth, DEFAULT_SHAPE.strokeWidth)
    };
  }

  function shapeBase() {
    return Object.assign({}, DEFAULT_SHAPE);
  }

  function createShapeElement(x, y, width, height) {
    const size = localSize(width == null ? 240 : width, height == null ? 240 : height);
    return Object.assign(shapeBase(), {
      id: L.model.uid('shape'),
      type: 'shape',
      x: finite(x, 0),
      y: finite(y, 0),
      width: size.width,
      height: size.height,
      rotation: 0
    });
  }

  function createBackgroundShape(x, y, width, height) {
    const size = localSize(width == null ? 240 : width, height == null ? 240 : height);
    return Object.assign(shapeBase(), {
      id: L.model.uid('bgshape'),
      kind: 'shape',
      x: finite(x, 0),
      y: finite(y, 0),
      width: size.width,
      height: size.height,
      rotation: 0
    });
  }

  /* ---------- 菱形角度 ---------- */

  // 菱形外接框两条对角线就是 width/height；两个锐角中的一个是内夹角。
  function diamondAngle(width, height) {
    const w = Math.max(1, finite(width, 1));
    const h = Math.max(1, finite(height, 1));
    return 2 * Math.atan(Math.min(w, h) / Math.max(w, h)) * 180 / Math.PI;
  }

  // 保留长边、按角度反推短边。0° 使用 1px 的最小几何，避免退化成零面积。
  function diamondSizeFromAngle(width, height, angle) {
    const w = Math.max(1, finite(width, 240));
    const h = Math.max(1, finite(height, 240));
    const degrees = L.model.clamp(finite(angle, 90), 0, 90);
    const long = Math.max(w, h);
    const short = Math.max(1, long * Math.tan(degrees * Math.PI / 360));
    if (w >= h) return { width: long, height: short };
    return { width: short, height: long };
  }

  /* ---------- 圆角与边框上限 ---------- */

  // 正圆角 / 边框厚度上限：内切圆半径。
  function shapeInradius(shape) {
    const value = normalizeShape(shape);
    if (value.shape === 'diamond') {
      const halfDiagonal = Math.hypot(value.width / 2, value.height / 2);
      return value.width * value.height / (4 * halfDiagonal);
    }
    return Math.min(value.width, value.height) / 2;
  }

  // 负圆角上限：每个角最多切到相邻边的中点。
  function shapeConcaveLimit(shape) {
    const value = normalizeShape(shape);
    if (value.shape === 'diamond') {
      return Math.hypot(value.width / 2, value.height / 2) / 2;
    }
    return Math.min(value.width, value.height) / 2;
  }

  function clampShape(shape) {
    if (!shape || typeof shape !== 'object') return shape;
    shape.shape = SHAPE_KINDS.indexOf(shape.shape) >= 0 ? shape.shape : 'rect';
    shape.mode = SHAPE_MODES.indexOf(shape.mode) >= 0 ? shape.mode : 'fill';
    shape.width = Math.max(1, finite(shape.width, 240));
    shape.height = Math.max(1, finite(shape.height, 240));
    if (typeof shape.color !== 'string' || !shape.color) shape.color = DEFAULT_SHAPE.color;
    const inradius = shapeInradius(shape);
    const concave = shapeConcaveLimit(shape);
    shape.radius = L.model.clamp(finite(shape.radius, 0), -concave, inradius);
    shape.strokeWidth = L.model.clamp(finite(shape.strokeWidth, DEFAULT_SHAPE.strokeWidth), 0, inradius);
    shape.opacity = L.model.clamp(finite(shape.opacity, 1), 0, 1);
    shape.blur = Math.max(0, finite(shape.blur, 0));
    shape.brightness = finite(shape.brightness, 1);
    shape.hue = finite(shape.hue, 0);
    shape.rotation = finite(shape.rotation, 0);
    return shape;
  }

  /* ---------- 基础多边形与偏移 ---------- */

  function basePolygon(shape) {
    const w = shape.width;
    const h = shape.height;
    if (shape.shape === 'diamond') {
      return [
        { x: 0, y: -h / 2 },
        { x: w / 2, y: 0 },
        { x: 0, y: h / 2 },
        { x: -w / 2, y: 0 }
      ];
    }
    return [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 }
    ];
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function scale(point, factor) {
    return { x: point.x * factor, y: point.y * factor };
  }

  function length(vector) {
    return Math.hypot(vector.x, vector.y);
  }

  function unit(vector) {
    const size = length(vector);
    return size > EPSILON ? { x: vector.x / size, y: vector.y / size } : { x: 0, y: 0 };
  }

  function cross(a, b) {
    return a.x * b.y - a.y * b.x;
  }

  // 顺时针多边形的内法线是边方向左转 90°。
  function inwardNormal(a, b) {
    const direction = unit(sub(b, a));
    return { x: -direction.y, y: direction.x };
  }

  function lineIntersection(a1, a2, b1, b2) {
    const r = sub(a2, a1);
    const s = sub(b2, b1);
    const denominator = cross(r, s);
    if (Math.abs(denominator) < EPSILON) return add(a1, scale(r, 0.5));
    const t = cross(sub(b1, a1), s) / denominator;
    return add(a1, scale(r, t));
  }

  function offsetLine(a, b, distance) {
    const normal = inwardNormal(a, b);
    return { a: add(a, scale(normal, distance)), b: add(b, scale(normal, distance)) };
  }

  function offsetPolygon(polygon, distance) {
    const result = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const previous = polygon[(i + polygon.length - 1) % polygon.length];
      const current = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      const prevLine = offsetLine(previous, current, distance);
      const nextLine = offsetLine(current, next, distance);
      result.push(lineIntersection(prevLine.a, prevLine.b, nextLine.a, nextLine.b));
    }
    return result;
  }

  function projectPointToLine(point, a, b) {
    const direction = sub(b, a);
    const denominator = direction.x * direction.x + direction.y * direction.y;
    if (denominator < EPSILON) return a;
    const t = ((point.x - a.x) * direction.x + (point.y - a.y) * direction.y) / denominator;
    return add(a, scale(direction, L.model.clamp(t, 0, 1)));
  }

  function pointInConvexPolygon(polygon, point) {
    let sign = 0;
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const value = cross(sub(b, a), sub(point, a));
      if (Math.abs(value) < EPSILON) continue;
      if (sign === 0) sign = value > 0 ? 1 : -1;
      else if ((value > 0 ? 1 : -1) !== sign) return false;
    }
    return true;
  }

  function distanceToSegment(point, a, b) {
    return length(sub(point, projectPointToLine(point, a, b)));
  }

  /* ---------- 轮廓 ---------- */

  function normalizeAngleDelta(from, to) {
    let delta = to - from;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    return delta;
  }

  function roundedOutline(shape) {
    const polygon = basePolygon(shape);
    const radius = shape.radius;
    if (radius <= EPSILON) return polygonOutline(polygon);
    const innerPolygon = offsetPolygon(polygon, radius);
    const start = projectPointToLine(
      innerPolygon[0],
      polygon[polygon.length - 1],
      polygon[0]
    );
    const commands = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const current = polygon[i];
      const previous = polygon[(i + polygon.length - 1) % polygon.length];
      const next = polygon[(i + 1) % polygon.length];
      const center = innerPolygon[i];
      const tangentPrev = projectPointToLine(center, previous, current);
      const tangentNext = projectPointToLine(center, current, next);
      let startAngle = Math.atan2(tangentPrev.y - center.y, tangentPrev.x - center.x);
      let endAngle = Math.atan2(tangentNext.y - center.y, tangentNext.x - center.x);
      while (endAngle <= startAngle) endAngle += Math.PI * 2;
      commands.push({
        type: 'arc',
        cx: center.x,
        cy: center.y,
        radius: radius,
        startAngle: startAngle,
        endAngle: endAngle,
        anticlockwise: false
      });
      const nextTangent = i + 1 < polygon.length
        ? projectPointToLine(innerPolygon[i + 1], current, next)
        : start;
      commands.push({ type: 'line', to: { x: nextTangent.x, y: nextTangent.y } });
    }
    return { start: { x: start.x, y: start.y }, commands: commands, closed: true };
  }

  function concaveOutline(shape) {
    const polygon = basePolygon(shape);
    const amount = -shape.radius;
    if (amount <= EPSILON) return polygonOutline(polygon);
    const starts = [];
    const ends = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const current = polygon[i];
      const previous = polygon[(i + polygon.length - 1) % polygon.length];
      const next = polygon[(i + 1) % polygon.length];
      starts.push(add(current, scale(unit(sub(previous, current)), amount)));
      ends.push(add(current, scale(unit(sub(next, current)), amount)));
    }
    const commands = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const current = polygon[i];
      const startAngle = Math.atan2(starts[i].y - current.y, starts[i].x - current.x);
      const endAngle = Math.atan2(ends[i].y - current.y, ends[i].x - current.x);
      const delta = normalizeAngleDelta(startAngle, endAngle);
      commands.push({
        type: 'arc',
        cx: current.x,
        cy: current.y,
        radius: amount,
        startAngle: startAngle,
        endAngle: endAngle,
        anticlockwise: delta < 0
      });
      const nextStart = i + 1 < polygon.length ? starts[i + 1] : starts[0];
      commands.push({ type: 'line', to: { x: nextStart.x, y: nextStart.y } });
    }
    return { start: { x: starts[0].x, y: starts[0].y }, commands: commands, closed: true };
  }

  function polygonOutline(polygon) {
    const commands = [];
    for (let i = 1; i <= polygon.length; i += 1) {
      const point = polygon[i % polygon.length];
      commands.push({ type: 'line', to: { x: point.x, y: point.y } });
    }
    return { start: { x: polygon[0].x, y: polygon[0].y }, commands: commands, closed: true };
  }

  function shapeOutline(shape) {
    const value = normalizeShape(shape);
    const inradius = shapeInradius(value);
    const concave = shapeConcaveLimit(value);
    value.radius = L.model.clamp(value.radius, -concave, inradius);
    if (value.radius > EPSILON) return roundedOutline(value);
    if (value.radius < -EPSILON) return concaveOutline(value);
    return polygonOutline(basePolygon(value));
  }

  function outlinePoints(outline) {
    const points = [{ x: outline.start.x, y: outline.start.y }];
    function push(point) {
      const last = points[points.length - 1];
      if (!last || Math.abs(last.x - point.x) > 1e-7 || Math.abs(last.y - point.y) > 1e-7) {
        points.push({ x: point.x, y: point.y });
      }
    }
    outline.commands.forEach(function (command) {
      if (command.type === 'line') {
        push(command.to);
        return;
      }
      let span = command.endAngle - command.startAngle;
      if (command.anticlockwise && span > 0) span -= Math.PI * 2;
      if (!command.anticlockwise && span < 0) span += Math.PI * 2;
      const steps = Math.max(4, Math.ceil(Math.abs(span) / (Math.PI / 24)));
      for (let step = 1; step <= steps; step += 1) {
        const angle = command.startAngle + span * step / steps;
        push({
          x: command.cx + Math.cos(angle) * command.radius,
          y: command.cy + Math.sin(angle) * command.radius
        });
      }
    });
    if (points.length > 1) {
      const first = points[0];
      const last = points[points.length - 1];
      if (Math.abs(first.x - last.x) < 1e-7 && Math.abs(first.y - last.y) < 1e-7) points.pop();
    }
    return points;
  }

  function pointInPolygon(polygon, point) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[i];
      const b = polygon[j];
      const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
        (point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function shapeContains(shape, localX, localY) {
    const value = normalizeShape(shape);
    const x = finite(localX, 0);
    const y = finite(localY, 0);
    if (Math.abs(x) > value.width / 2 + EPSILON || Math.abs(y) > value.height / 2 + EPSILON) {
      return false;
    }
    const inradius = shapeInradius(value);
    const concave = shapeConcaveLimit(value);
    value.radius = L.model.clamp(value.radius, -concave, inradius);
    if (value.radius < -EPSILON) {
      return pointInPolygon(outlinePoints(concaveOutline(value)), { x: x, y: y });
    }
    const polygon = basePolygon(value);
    if (value.radius <= EPSILON || !(value.radius > 0)) {
      return pointInConvexPolygon(polygon, { x: x, y: y });
    }
    const inner = offsetPolygon(polygon, value.radius);
    if (pointInConvexPolygon(inner, { x: x, y: y })) return true;
    for (let i = 0; i < inner.length; i += 1) {
      if (distanceToSegment({ x: x, y: y }, inner[i], inner[(i + 1) % inner.length]) <= value.radius + EPSILON) {
        return true;
      }
    }
    return false;
  }

  L.shape = {
    SHAPE_KINDS: SHAPE_KINDS,
    SHAPE_MODES: SHAPE_MODES,
    DEFAULT_SHAPE: DEFAULT_SHAPE,
    createShapeElement: createShapeElement,
    createBackgroundShape: createBackgroundShape,
    diamondAngle: diamondAngle,
    diamondSizeFromAngle: diamondSizeFromAngle,
    shapeInradius: shapeInradius,
    shapeConcaveLimit: shapeConcaveLimit,
    clampShape: clampShape,
    shapeOutline: shapeOutline,
    shapeContains: shapeContains,
    outlinePoints: outlinePoints
  };
})();
