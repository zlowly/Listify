(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;

  const state = {
    project: model.createDefaultProject(),
    currentPageId: null,
    selection: { type: 'page' }
  };
  state.currentPageId = state.project.pages[0].id;

  let pane = null;
  let viewEl = null;
  let overlay = null;
  let overlayCtx = null;
  let leafer = null;
  let surface = null;
  let surfaceIsLeafer = false;
  let drag = null;
  let inlineEditor = null;
  let pendingImageElementId = null;
  let uiRenderDepth = 0;

  const viewport = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    dpr: 1
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function currentPage() {
    return model.getPage(state.project, state.currentPageId);
  }

  function pageIndex(page) {
    return state.project.pages.indexOf(page);
  }

  function selectedElement() {
    if (state.selection.type !== 'element' || !state.selection.id) return null;
    const page = currentPage();
    if (!page) return null;
    return page.elements.find(function (element) {
      return element.id === state.selection.id;
    }) || null;
  }

  function findElementAnywhere(id) {
    return model.findElement(state.project, id);
  }

  function syncSurface() {
    const width = Math.max(1, Math.round(state.project.pageSize.width));
    const height = Math.max(1, Math.round(state.project.pageSize.height));
    if (!surface) return;
    if (surfaceIsLeafer) {
      if (surface.width !== width || surface.height !== height) {
        surface.width = width;
        surface.height = height;
        if (typeof surface.__updateSize === 'function') surface.__updateSize();
      }
    } else {
      if (surface.width !== width || surface.height !== height) {
        surface.width = width;
        surface.height = height;
        surface.style.width = width + 'px';
        surface.style.height = height + 'px';
      }
    }
  }

  function surfaceContext() {
    if (!surface) return null;
    if (surfaceIsLeafer) return surface.context;
    return surface.getContext('2d');
  }

  function setupSurface() {
    pane = document.getElementById('canvas-pane');
    viewEl = document.getElementById('leafer-view');
    overlay = document.getElementById('overlay');
    overlayCtx = overlay.getContext('2d');

    try {
      if (window.LeaferUI && window.LeaferUI.Leafer && window.LeaferUI.Canvas) {
        leafer = new window.LeaferUI.Leafer({ view: viewEl, type: 'design' });
        surface = new window.LeaferUI.Canvas({
          width: state.project.pageSize.width,
          height: state.project.pageSize.height,
          pixelRatio: Math.min(2, window.devicePixelRatio || 1),
          fill: '#ffffff'
        });
        leafer.add(surface);
        surfaceIsLeafer = true;
        return;
      }
    } catch (err) {
      console.warn('LeaferJS 初始化失败，改用普通 canvas。', err);
      viewEl.innerHTML = '';
    }

    const canvas = document.createElement('canvas');
    canvas.width = state.project.pageSize.width;
    canvas.height = state.project.pageSize.height;
    canvas.style.width = state.project.pageSize.width + 'px';
    canvas.style.height = state.project.pageSize.height + 'px';
    viewEl.appendChild(canvas);
    surface = canvas;
    surfaceIsLeafer = false;
  }

  function computeViewport() {
    if (!pane) return;
    const rect = pane.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const toolbar = document.getElementById('canvas-toolbar');
    const chromeTop = toolbar ? Math.round(toolbar.getBoundingClientRect().height) + 24 : 0;
    const availableHeight = Math.max(1, height - chromeTop);
    const pageW = Math.max(1, state.project.pageSize.width);
    const pageH = Math.max(1, state.project.pageSize.height);
    const padding = Math.min(72, Math.max(24, Math.min(width, availableHeight) * 0.08));
    const scale = Math.max(0.05, Math.min(1.6, Math.min(
      (width - padding * 2) / pageW,
      (availableHeight - padding * 2) / pageH
    )));
    viewport.scale = scale;
    viewport.width = width;
    viewport.height = height;
    viewport.dpr = window.devicePixelRatio || 1;
    viewport.offsetX = Math.round((width - pageW * scale) / 2);
    viewport.offsetY = Math.round(chromeTop + (availableHeight - pageH * scale) / 2);
  }

  function applyViewTransform() {
    if (!viewEl) return;
    const pageW = state.project.pageSize.width;
    const pageH = state.project.pageSize.height;
    viewEl.style.width = pageW + 'px';
    viewEl.style.height = pageH + 'px';
    viewEl.style.transformOrigin = '0 0';
    viewEl.style.transform = 'translate(' + viewport.offsetX + 'px,' + viewport.offsetY + 'px) scale(' + viewport.scale + ')';

    if (overlay) {
      const pixelWidth = Math.max(1, Math.round(viewport.width * viewport.dpr));
      const pixelHeight = Math.max(1, Math.round(viewport.height * viewport.dpr));
      if (overlay.width !== pixelWidth || overlay.height !== pixelHeight) {
        overlay.width = pixelWidth;
        overlay.height = pixelHeight;
      }
      overlay.style.width = viewport.width + 'px';
      overlay.style.height = viewport.height + 'px';
    }
  }

  function pageScreenRect() {
    return {
      x: viewport.offsetX,
      y: viewport.offsetY,
      width: state.project.pageSize.width * viewport.scale,
      height: state.project.pageSize.height * viewport.scale
    };
  }

  function toScreen(x, y) {
    return {
      x: viewport.offsetX + x * viewport.scale,
      y: viewport.offsetY + y * viewport.scale
    };
  }

  function toPage(screenX, screenY) {
    return {
      x: (screenX - viewport.offsetX) / viewport.scale,
      y: (screenY - viewport.offsetY) / viewport.scale
    };
  }

  function redraw() {
    if (!surface) return;
    computeViewport();
    applyViewTransform();
    syncSurface();
    const page = currentPage();
    if (!page) return;
    const ctx = surfaceContext();
    if (!ctx) return;
    const pageW = state.project.pageSize.width;
    const pageH = state.project.pageSize.height;
    // Leafer backs the logical page with a pixel-ratio-scaled bitmap; draw in
    // page coordinates so content fills that bitmap instead of its top-left 1/dpr.
    ctx.setTransform(ctx.canvas.width / pageW, 0, 0, ctx.canvas.height / pageH, 0, 0);
    ctx.clearRect(0, 0, pageW, pageH);
    renderer.drawPage(ctx, state.project, page, {
      editMode: true,
      selectedId: state.selection.type === 'element' ? state.selection.id : null
    });
    if (surfaceIsLeafer && typeof surface.paint === 'function') surface.paint();
    drawOverlay();
  }

  function fit() {
    computeViewport();
    applyViewTransform();
    drawOverlay();
  }

  function drawOverlay() {
    if (!overlayCtx) return;
    const ctx = overlayCtx;
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    const page = currentPage();
    if (!page) return;
    const rect = pageScreenRect();

    // Page shadow and border live outside the page container and never export.
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

    drawMarginGuides(ctx, rect);
    drawOverflow(ctx, page, rect);
    drawSelection(ctx, page);
    drawPageSizeHandle(ctx, rect);
  }

  function drawMarginGuides(ctx, rect) {
    const margins = state.project.margins;
    const s = viewport.scale;
    const left = rect.x + margins.left * s;
    const right = rect.x + (state.project.pageSize.width - margins.right) * s;
    const top = rect.y + margins.top * s;
    const bottom = rect.y + (state.project.pageSize.height - margins.bottom) * s;

    ctx.save();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.48)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(left, rect.y);
    ctx.lineTo(left, rect.y + rect.height);
    ctx.moveTo(right, rect.y);
    ctx.lineTo(right, rect.y + rect.height);
    ctx.moveTo(rect.x, top);
    ctx.lineTo(rect.x + rect.width, top);
    ctx.moveTo(rect.x, bottom);
    ctx.lineTo(rect.x + rect.width, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    marginHandlePoints(rect).forEach(function (handle) {
      drawRoundHandle(ctx, handle.x, handle.y, 4, '#2563eb', '#ffffff');
    });
  }

  function marginHandlePoints(rect) {
    const margins = state.project.margins;
    const s = viewport.scale;
    return [
      { side: 'left', x: rect.x + margins.left * s, y: rect.y + rect.height / 2 },
      { side: 'right', x: rect.x + (state.project.pageSize.width - margins.right) * s, y: rect.y + rect.height / 2 },
      { side: 'top', x: rect.x + rect.width / 2, y: rect.y + margins.top * s },
      { side: 'bottom', x: rect.x + rect.width / 2, y: rect.y + (state.project.pageSize.height - margins.bottom) * s }
    ];
  }

  function drawOverflow(ctx, page, rect) {
    const overflow = renderer.pageOverflow(state.project, page);
    if (!overflow.length) return;
    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(rect.x - 3, rect.y - 3, rect.width + 6, rect.height + 6);
    ctx.setLineDash([]);
    const text = '⚠ ' + overflow.length + ' 个元素超出页面';
    ctx.font = '600 12px "Microsoft YaHei", "PingFang SC", sans-serif';
    const textWidth = ctx.measureText(text).width;
    const badgeWidth = textWidth + 18;
    const badgeHeight = 24;
    const bx = rect.x + rect.width - badgeWidth - 8;
    const by = rect.y + 8;
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, badgeWidth, badgeHeight, 12);
    else ctx.rect(bx, by, badgeWidth, badgeHeight);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + badgeWidth / 2, by + badgeHeight / 2 + 0.5);
    ctx.restore();
  }

  function drawRoundHandle(ctx, x, y, radius, stroke, fill) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawSquareHandle(ctx, x, y, size, stroke, fill) {
    ctx.beginPath();
    ctx.rect(x - size / 2, y - size / 2, size, size);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function handlePoints(bounds, element) {
    const x = viewport.offsetX + bounds.x * viewport.scale;
    const y = viewport.offsetY + bounds.y * viewport.scale;
    const w = bounds.width * viewport.scale;
    const h = bounds.height * viewport.scale;
    const midX = x + w / 2;
    const midY = y + h / 2;
    if (element.type === 'image') {
      return [
        { name: 'nw', x: x, y: y, cursor: 'nwse-resize' },
        { name: 'n', x: midX, y: y, cursor: 'ns-resize' },
        { name: 'ne', x: x + w, y: y, cursor: 'nesw-resize' },
        { name: 'e', x: x + w, y: midY, cursor: 'ew-resize' },
        { name: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
        { name: 's', x: midX, y: y + h, cursor: 'ns-resize' },
        { name: 'sw', x: x, y: y + h, cursor: 'nesw-resize' },
        { name: 'w', x: x, y: midY, cursor: 'ew-resize' }
      ];
    }
    return [
      { name: 'w', x: x, y: midY, cursor: 'ew-resize' },
      { name: 'e', x: x + w, y: midY, cursor: 'ew-resize' }
    ];
  }

  function drawSelection(ctx, page) {
    const element = selectedElement();
    if (!element) return;
    const bounds = renderer.elementBounds(state.project, page, element);
    const x = viewport.offsetX + bounds.x * viewport.scale;
    const y = viewport.offsetY + bounds.y * viewport.scale;
    const w = bounds.width * viewport.scale;
    const h = bounds.height * viewport.scale;

    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);
    handlePoints(bounds, element).forEach(function (handle) {
      drawSquareHandle(ctx, handle.x, handle.y, 8, '#2563eb', '#ffffff');
    });
    ctx.restore();

    if (element.type === 'category') drawTableDividers(ctx, page, element);
  }

  function drawTableDividers(ctx, page, element) {
    const dividers = renderer.tableDividers(state.project, page, element);
    ctx.save();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.65)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    dividers.forEach(function (divider) {
      const x = viewport.offsetX + divider.x * viewport.scale;
      const y = viewport.offsetY + divider.y * viewport.scale;
      const h = divider.height * viewport.scale;
      const active = drag && drag.type === 'divider' &&
        drag.tableIndex === divider.tableIndex &&
        drag.dividerIndex === divider.dividerIndex;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
      ctx.stroke();
      drawRoundHandle(ctx, x, y + h / 2, active ? 5 : 3.5, active ? '#1d4ed8' : '#60a5fa', '#ffffff');
    });
    ctx.restore();
  }

  function drawPageSizeHandle(ctx, rect) {
    const x = rect.x + rect.width + 10;
    const y = rect.y + rect.height + 10;
    drawSquareHandle(ctx, x, y, 12, '#2563eb', '#ffffff');
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 3);
    ctx.lineTo(x + 3, y - 3);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- hit testing ---------- */

  function handleAt(screenX, screenY) {
    const page = currentPage();
    const element = selectedElement();
    if (!page || !element) return null;
    const bounds = renderer.elementBounds(state.project, page, element);
    const points = handlePoints(bounds, element);
    for (const point of points) {
      if (Math.abs(screenX - point.x) <= 8 && Math.abs(screenY - point.y) <= 8) {
        return { type: 'resize', element: element, handle: point.name, cursor: point.cursor, bounds: bounds };
      }
    }
    return null;
  }

  function dividerAt(screenX, screenY) {
    const page = currentPage();
    const element = selectedElement();
    if (!page || !element || element.type !== 'category') return null;
    const dividers = renderer.tableDividers(state.project, page, element);
    for (const divider of dividers) {
      const x = viewport.offsetX + divider.x * viewport.scale;
      const y = viewport.offsetY + divider.y * viewport.scale;
      const h = divider.height * viewport.scale;
      if (Math.abs(screenX - x) <= 7 && screenY >= y - 4 && screenY <= y + h + 4) {
        return { type: 'divider', element: element, divider: divider };
      }
    }
    return null;
  }

  function pageSizeHandleAt(screenX, screenY) {
    const rect = pageScreenRect();
    const x = rect.x + rect.width + 10;
    const y = rect.y + rect.height + 10;
    if (Math.abs(screenX - x) <= 10 && Math.abs(screenY - y) <= 10) {
      return { type: 'page-size' };
    }
    return null;
  }

  function marginAt(screenX, screenY) {
    const rect = pageScreenRect();
    const points = marginHandlePoints(rect);
    for (const point of points) {
      if (Math.abs(screenX - point.x) <= 9 && Math.abs(screenY - point.y) <= 9) {
        return { type: 'margin', side: point.side };
      }
    }
    return null;
  }

  function updateCursor(screenX, screenY) {
    let cursor = 'default';
    const pageHandle = pageSizeHandleAt(screenX, screenY);
    if (pageHandle) cursor = 'nwse-resize';
    if (cursor === 'default') {
      const handle = handleAt(screenX, screenY);
      if (handle) cursor = handle.cursor;
    }
    if (cursor === 'default') {
      const divider = dividerAt(screenX, screenY);
      if (divider) cursor = 'col-resize';
    }
    if (cursor === 'default') {
      const page = currentPage();
      if (page) {
        const pt = toPage(screenX, screenY);
        if (renderer.hitTest(state.project, page, pt.x, pt.y)) cursor = 'move';
      }
    }
    if (cursor === 'default') {
      const margin = marginAt(screenX, screenY);
      if (margin) cursor = margin.side === 'left' || margin.side === 'right' ? 'ew-resize' : 'ns-resize';
    }
    overlay.style.cursor = cursor;
  }

  function overlayPoint(event) {
    const rect = overlay.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /* ---------- pointer interactions ---------- */

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const point = overlayPoint(event);
    const page = currentPage();
    if (!page) return;

    const pageHandle = pageSizeHandleAt(point.x, point.y);
    if (pageHandle) {
      drag = {
        type: 'page-size',
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWidth: state.project.pageSize.width,
        startHeight: state.project.pageSize.height
      };
      beginPointer(event);
      return;
    }

    const handle = handleAt(point.x, point.y);
    if (handle) {
      drag = {
        type: 'resize',
        element: handle.element,
        handle: handle.handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBounds: handle.bounds
      };
      beginPointer(event);
      return;
    }

    const divider = dividerAt(point.x, point.y);
    if (divider) {
      drag = {
        type: 'divider',
        element: divider.element,
        tableIndex: divider.divider.tableIndex,
        dividerIndex: divider.divider.dividerIndex,
        startWidths: divider.divider.widths.slice(),
        startClientX: event.clientX,
        startClientY: event.clientY
      };
      beginPointer(event);
      return;
    }

    const pt = toPage(point.x, point.y);
    const hit = renderer.hitTest(state.project, page, pt.x, pt.y);
    if (hit) {
      if (state.selection.type !== 'element' || state.selection.id !== hit.element.id) {
        state.selection = { type: 'element', id: hit.element.id };
        ui.renderAll();
      }
      drag = {
        type: 'move',
        element: hit.element,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: hit.element.x,
        startY: hit.element.y
      };
      beginPointer(event);
      return;
    }

    const margin = marginAt(point.x, point.y);
    if (margin) {
      drag = {
        type: 'margin',
        side: margin.side,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startValue: state.project.margins[margin.side]
      };
      beginPointer(event);
      return;
    }

    state.selection = { type: 'page' };
    ui.renderAll();
  }

  function beginPointer(event) {
    if (overlay.setPointerCapture) overlay.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!drag) {
      const point = overlayPoint(event);
      updateCursor(point.x, point.y);
      return;
    }
    event.preventDefault();
    const dx = (event.clientX - drag.startClientX) / viewport.scale;
    const dy = (event.clientY - drag.startClientY) / viewport.scale;

    if (drag.type === 'move') {
      drag.element.x = Math.round(drag.startX + dx);
      drag.element.y = Math.round(drag.startY + dy);
      redraw();
      return;
    }

    if (drag.type === 'resize') {
      resizeDrag(dx, dy);
      redraw();
      return;
    }

    if (drag.type === 'divider') {
      dividerDrag(dx);
      redraw();
      return;
    }

    if (drag.type === 'page-size') {
      const width = clamp(drag.startWidth + dx, 320, 5000);
      const height = clamp(drag.startHeight + dy, 320, 5000);
      state.project.pageSize.width = Math.round(width);
      state.project.pageSize.height = Math.round(height);
      redraw();
      return;
    }

    if (drag.type === 'margin') {
      const max = Math.min(state.project.pageSize.width, state.project.pageSize.height) / 2;
      const horizontal = drag.side === 'left' || drag.side === 'right';
      let delta = horizontal ? dx : dy;
      if (drag.side === 'right' || drag.side === 'bottom') delta = -delta;
      state.project.margins[drag.side] = Math.round(clamp(drag.startValue + delta, 0, max));
      redraw();
    }
  }

  function resizeDrag(dx, dy) {
    const element = drag.element;
    const start = drag.startBounds;
    const minWidth = element.type === 'text' ? 80 : 80;
    if (element.type === 'image') {
      let x = start.x;
      let y = start.y;
      let width = start.width;
      let height = start.height;
      if (drag.handle.indexOf('e') >= 0) width += dx;
      if (drag.handle.indexOf('w') >= 0) {
        width -= dx;
        x += dx;
      }
      if (drag.handle.indexOf('s') >= 0) height += dy;
      if (drag.handle.indexOf('n') >= 0) {
        height -= dy;
        y += dy;
      }
      if (width < 40) {
        if (drag.handle.indexOf('w') >= 0) x -= 40 - width;
        width = 40;
      }
      if (height < 40) {
        if (drag.handle.indexOf('n') >= 0) y -= 40 - height;
        height = 40;
      }
      element.x = Math.round(x);
      element.y = Math.round(y);
      element.width = Math.round(width);
      element.height = Math.round(height);
      return;
    }

    const oldWidth = element.width;
    let width;
    let x = element.x;
    if (drag.handle === 'e') {
      width = clamp(start.width + dx, minWidth, state.project.pageSize.width * 3);
      x = start.x;
    } else {
      const right = start.x + start.width;
      width = clamp(start.width - dx, minWidth, state.project.pageSize.width * 3);
      x = right - width;
    }
    element.x = Math.round(x);
    element.width = Math.round(width);
    if (element.type === 'category' && oldWidth > 0) {
      layout.scaleManualWidths(element, element.width / oldWidth);
    }
  }

  function dividerDrag(dx) {
    const element = drag.element;
    const widths = drag.startWidths.slice();
    const index = drag.dividerIndex;
    if (index < 0 || index + 1 >= widths.length) return;
    const left = widths[index] + dx;
    const right = widths[index + 1] - dx;
    if (left < layout.MIN_COL_WIDTH || right < layout.MIN_COL_WIDTH) return;
    widths[index] = left;
    widths[index + 1] = right;
    layout.setManualWidths(element, drag.tableIndex, widths);
  }

  function onPointerUp(event) {
    if (!drag) return;
    const finished = drag;
    drag = null;

    if (finished.type === 'page-size') {
      state.project.pageSize.width = Math.round(clamp(state.project.pageSize.width, 320, 5000));
      state.project.pageSize.height = Math.round(clamp(state.project.pageSize.height, 320, 5000));
    }
    if (finished.type === 'margin') {
      state.project.margins[finished.side] = Math.round(state.project.margins[finished.side]);
    }
    if (finished.type === 'move' && finished.element) {
      finished.element.x = Math.round(finished.element.x);
      finished.element.y = Math.round(finished.element.y);
    }
    if (finished.type === 'resize' && finished.element) {
      finished.element.x = Math.round(finished.element.x);
      finished.element.y = Math.round(finished.element.y);
      finished.element.width = Math.round(finished.element.width);
      if (finished.element.type === 'image') {
        finished.element.height = Math.round(finished.element.height);
      }
    }

    if (overlay.releasePointerCapture && event && event.pointerId != null) {
      try { overlay.releasePointerCapture(event.pointerId); } catch (err) { /* ignore */ }
    }
    ui.renderAll();
  }

  function onDoubleClick(event) {
    const point = overlayPoint(event);
    const page = currentPage();
    if (!page) return;
    const pt = toPage(point.x, point.y);
    const hit = renderer.hitTest(state.project, page, pt.x, pt.y);
    if (!hit || hit.element.type !== 'text') return;
    event.preventDefault();
    state.selection = { type: 'element', id: hit.element.id };
    ui.renderAll();
    startInlineEditor(hit.element);
  }

  function startInlineEditor(element) {
    closeInlineEditor(false);
    const page = currentPage();
    if (!page) return;
    const bounds = renderer.elementBounds(state.project, page, element);
    const textarea = document.createElement('textarea');
    textarea.id = 'inline-text-editor';
    textarea.value = element.text || '';
    const left = viewport.offsetX + element.x * viewport.scale;
    const top = viewport.offsetY + element.y * viewport.scale;
    const style = element.style;
    textarea.style.left = left + 'px';
    textarea.style.top = top + 'px';
    textarea.style.width = Math.max(40, element.width) + 'px';
    textarea.style.height = Math.max(20, bounds.height) + 'px';
    textarea.style.transformOrigin = '0 0';
    textarea.style.transform = 'scale(' + viewport.scale + ')';
    textarea.style.font = model.fontString(style);
    textarea.style.lineHeight = String(style.lineHeight || 1.3);
    textarea.style.textAlign = style.align || 'left';
    textarea.style.color = style.color || '#111827';
    textarea.style.boxSizing = 'border-box';

    let closed = false;
    function finish(save) {
      if (closed) return;
      closed = true;
      if (save) element.text = textarea.value;
      if (textarea.parentNode) textarea.remove();
      inlineEditor = null;
      ui.renderAll();
    }

    textarea.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      } else if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        finish(true);
      }
    });
    textarea.addEventListener('blur', function () { finish(true); });

    pane.appendChild(textarea);
    inlineEditor = textarea;
    textarea.focus();
    textarea.select();
  }

  function closeInlineEditor(save) {
    if (!inlineEditor) return;
    if (save) {
      const element = selectedElement();
      if (element) element.text = inlineEditor.value;
    }
    inlineEditor.remove();
    inlineEditor = null;
  }

  /* ---------- drag and drop ---------- */

  function onDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function onDrop(event) {
    event.preventDefault();
    const page = currentPage();
    if (!page) return;

    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
      handleImportFile(event.dataTransfer.files[0]);
      return;
    }

    const name = (event.dataTransfer && (
      event.dataTransfer.getData('application/x-listify-category') ||
      event.dataTransfer.getData('text/plain')
    )) || '';
    if (!name) return;
    const category = model.getCategory(state.project, name);
    if (!category) return;

    const placed = model.getPlacedBlock(state.project, name);
    if (placed) {
      if (placed.page.id !== state.currentPageId) switchPage(placed.page.id);
      state.selection = { type: 'element', id: placed.element.id };
      ui.renderAll();
      ui.toast('“' + name + '”已经放置，已为你选中。');
      return;
    }

    const point = overlayPoint(event);
    const pt = toPage(point.x, point.y);
    const width = Math.max(
      120,
      state.project.pageSize.width - state.project.margins.left - state.project.margins.right
    );
    const x = clamp(pt.x - width / 2, 0, Math.max(0, state.project.pageSize.width - width));
    const y = Math.max(0, pt.y);
    const element = model.createCategoryElement(name, x, y, state.project, width);
    page.elements.push(element);
    state.selection = { type: 'element', id: element.id };
    ui.renderAll();
  }

  /* ---------- page and selection actions ---------- */

  function selectPage() {
    state.selection = { type: 'page' };
    if (uiRenderDepth > 0) redraw();
    else ui.renderAll();
  }

  function selectBackground() {
    state.selection = { type: 'background' };
    ui.renderAll();
  }

  function selectElement(id) {
    const page = currentPage();
    if (!page) return;
    const element = page.elements.find(function (item) { return item.id === id; });
    if (!element) return;
    state.selection = { type: 'element', id: id };
    ui.renderAll();
  }

  function switchPage(pageId) {
    const page = model.getPage(state.project, pageId);
    if (!page) return;
    state.currentPageId = pageId;
    state.selection = { type: 'page' };
    ui.renderAll();
  }

  function addPageDialog() {
    const current = currentPage();
    const canInherit = !!current;
    const body =
      '<div class="prop-group">' +
        '<div class="prop-group-title">新页面背景</div>' +
        '<label class="field" style="display:block;margin-bottom:10px;cursor:pointer;">' +
          '<span class="control" style="display:flex;gap:8px;align-items:center;">' +
            '<input type="radio" name="new-page-bg" value="blank" checked> 空白背景（白色）' +
          '</span>' +
        '</label>' +
        '<label class="field" style="display:block;cursor:pointer;opacity:' + (canInherit ? '1' : '0.45') + ';">' +
          '<span class="control" style="display:flex;gap:8px;align-items:center;">' +
            '<input type="radio" name="new-page-bg" value="inherit"' + (canInherit ? '' : ' disabled') + '> 沿用上页背景' +
          '</span>' +
        '</label>' +
        '<p class="hint">沿用会共享同一张图片资产；之后两页的尺寸模式、透明度、模糊和填充色相互独立。</p>' +
      '</div>';

    const modal = ui.modal.open({
      title: '新增页面',
      body: body,
      width: '420px',
      actions: [
        { label: '取消', onClick: function (close) { close(); } },
        {
          label: '创建页面',
          className: 'btn-primary',
          onClick: function (close) {
            const checked = modal.body.querySelector('input[name="new-page-bg"]:checked');
            const mode = checked ? checked.value : 'blank';
            let background = null;
            if (mode === 'inherit' && current) background = model.createBackground(current.background);
            const page = model.createPage(background);
            state.project.pages.push(page);
            state.currentPageId = page.id;
            state.selection = { type: 'page' };
            close();
            ui.renderAll();
          }
        }
      ]
    });
  }

  function deleteCurrentPage() {
    const page = currentPage();
    if (!page) return;
    if (state.project.pages.length <= 1) {
      ui.modal.alert('无法删除', '项目至少需要保留一页。');
      return;
    }
    const index = pageIndex(page);
    ui.modal.confirm(
      '删除页面',
      '确定删除第 ' + (index + 1) + ' 页及其所有内容吗？',
      { confirmLabel: '删除', danger: true }
    ).then(function (ok) {
      if (!ok) return;
      state.project.pages.splice(index, 1);
      const next = state.project.pages[Math.min(index, state.project.pages.length - 1)];
      state.currentPageId = next.id;
      state.selection = { type: 'page' };
      ui.renderAll();
      ui.toast('已删除页面。');
    });
  }

  function deleteSelection() {
    const page = currentPage();
    const element = selectedElement();
    if (!page || !element) return;
    const isCategory = element.type === 'category';
    const message = isCategory
      ? '删除分类块“' + element.category + '”？该分类会回到左侧未放置状态。'
      : '确定删除当前' + (element.type === 'text' ? '文字' : '图片') + '元素吗？';
    ui.modal.confirm('删除元素', message, { confirmLabel: '删除', danger: true }).then(function (ok) {
      if (!ok) return;
      const index = page.elements.indexOf(element);
      if (index < 0) return;
      page.elements.splice(index, 1);
      state.selection = { type: 'page' };
      ui.renderAll();
      ui.toast('已删除元素。');
    });
  }

  function moveLayer(index, delta) {
    const page = currentPage();
    if (!page) return;
    const target = index + delta;
    if (index < 0 || index >= page.elements.length || target < 0 || target >= page.elements.length) return;
    const element = page.elements[index];
    page.elements.splice(index, 1);
    page.elements.splice(target, 0, element);
    ui.renderAll();
  }

  function jumpToCategory(name) {
    const placed = model.getPlacedBlock(state.project, name);
    if (!placed) {
      ui.toast('“' + name + '”还没有放置到画布。');
      return;
    }
    if (placed.page.id !== state.currentPageId) {
      switchPage(placed.page.id);
    }
    state.selection = { type: 'element', id: placed.element.id };
    ui.renderAll();
  }

  /* ---------- page settings ---------- */

  function setPageSize(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    state.project.pageSize.width = Math.round(clamp(w, 320, 5000));
    state.project.pageSize.height = Math.round(clamp(h, 320, 5000));
    ui.renderAll();
  }

  function setMargins(margins) {
    if (!margins) return;
    const max = Math.min(state.project.pageSize.width, state.project.pageSize.height) / 2;
    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
      const value = Number(margins[side]);
      if (Number.isFinite(value)) {
        state.project.margins[side] = Math.round(clamp(value, 0, max));
      }
    });
    ui.renderAll();
  }

  function resizeElementWidth(element, nextWidth) {
    if (!element) return;
    const width = Number(nextWidth);
    if (!Number.isFinite(width)) return;
    const oldWidth = element.width;
    element.width = Math.round(clamp(width, 80, state.project.pageSize.width * 3));
    if (element.type === 'category' && oldWidth > 0) {
      layout.scaleManualWidths(element, element.width / oldWidth);
    }
    changed({ property: false });
  }

  function changed(options) {
    const opts = options || {};
    if (opts.property === false) {
      redraw();
      return;
    }
    ui.renderAll();
  }

  /* ---------- content creation ---------- */

  function addText() {
    const page = currentPage();
    if (!page) return;
    const element = model.createTextElement(state.project, '双击编辑文字');
    page.elements.push(element);
    state.selection = { type: 'element', id: element.id };
    ui.renderAll();
    ui.toast('已添加文字，双击可编辑。');
  }

  function pickFreeImage(elementId) {
    pendingImageElementId = elementId || null;
    const input = document.getElementById('free-image-file');
    input.value = '';
    input.click();
  }

  async function handleFreeImageFile(file) {
    if (!file) return;
    const targetId = pendingImageElementId;
    pendingImageElementId = null;
    let assetId;
    try {
      assetId = await L.assets.addFile(file);
      const image = await L.assets.loadImage(assetId);
      const meta = L.assets.getMeta(assetId);
      model.ensureAssetMeta(state.project, assetId, file.name, meta ? meta.mime : file.type);

      if (targetId) {
        const found = findElementAnywhere(targetId);
        if (found && found.element.type === 'image') {
          found.element.assetId = assetId;
          state.selection = { type: 'element', id: found.element.id };
          if (found.page.id !== state.currentPageId) state.currentPageId = found.page.id;
          ui.renderAll();
          ui.toast('图片已替换。');
          return;
        }
      }

      const naturalWidth = image.naturalWidth || image.width || 400;
      const naturalHeight = image.naturalHeight || image.height || 300;
      const maxSize = 480;
      const ratio = Math.min(1, maxSize / Math.max(naturalWidth, naturalHeight));
      const width = Math.max(40, Math.round(naturalWidth * ratio));
      const height = Math.max(40, Math.round(naturalHeight * ratio));
      const page = currentPage();
      if (!page) return;
      const element = model.createImageElement(state.project, assetId, width, height);
      page.elements.push(element);
      state.selection = { type: 'element', id: element.id };
      ui.renderAll();
      ui.toast('已添加图片。');
    } catch (err) {
      if (assetId) L.assets.remove(assetId);
      ui.toast('图片读取失败：' + err.message, 'error');
    }
  }

  function pickBackgroundImage() {
    const input = document.getElementById('bg-file');
    input.value = '';
    input.click();
  }

  async function handleBackgroundFile(file) {
    if (!file) return;
    const page = currentPage();
    if (!page) return;
    let assetId;
    try {
      assetId = await L.assets.addFile(file);
      await L.assets.loadImage(assetId);
      const meta = L.assets.getMeta(assetId);
      model.ensureAssetMeta(state.project, assetId, file.name, meta ? meta.mime : file.type);
      page.background.assetId = assetId;
      ui.renderAll();
      ui.toast('背景图片已更新。');
    } catch (err) {
      if (assetId) L.assets.remove(assetId);
      ui.toast('背景图片读取失败：' + err.message, 'error');
    }
  }

  function clearBackgroundImage() {
    const page = currentPage();
    if (!page || !page.background.assetId) return;
    page.background.assetId = null;
    ui.renderAll();
    ui.toast('已清除背景图片。');
  }

  /* ---------- import ---------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function showImportErrors(result) {
    const items = (result.errors || ['导入失败。']).map(function (message) {
      return '<li>' + escapeHtml(message) + '</li>';
    }).join('');
    ui.modal.open({
      title: '导入失败',
      body: '<div class="prop-group"><p class="hint">本次导入未修改现有歌单。请修正文件后重试。</p>' +
        '<ul class="import-error-list">' + items + '</ul></div>',
      actions: [{ label: '知道了', className: 'btn-primary', onClick: function (close) { close(); } }]
    });
  }

  function openEncodingDialog(file, message) {
    const body =
      '<div class="prop-group">' +
        '<p class="hint">' + escapeHtml(message) + '</p>' +
        '<div class="field"><label>尝试编码</label><div class="control">' +
          '<select id="encoding-select" class="select">' +
            '<option value="utf-8">UTF-8</option>' +
            '<option value="gb18030">GB18030</option>' +
            '<option value="utf-16le">UTF-16LE</option>' +
            '<option value="utf-16be">UTF-16BE</option>' +
          '</select>' +
        '</div></div>' +
      '</div>';
    const modal = ui.modal.open({
      title: '选择文件编码',
      body: body,
      width: '420px',
      actions: [
        { label: '取消', onClick: function (close) { close(); } },
        {
          label: '重试导入',
          className: 'btn-primary',
          onClick: function (close) {
            const select = modal.body.querySelector('#encoding-select');
            const encoding = select ? select.value : 'utf-8';
            close();
            handleImportFile(file, encoding);
          }
        }
      ]
    });
  }

  function confirmReimport(result) {
    const rec = L.importer.reconcile(state.project, result.categories);
    if (!state.project.playlist.categories.length) return Promise.resolve(true);
    if (!rec.added.length && !rec.removed.length) return Promise.resolve(true);

    return new Promise(function (resolve) {
      let settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      const lines = [];
      if (rec.added.length) {
        lines.push('<p><strong>新增分类（未放置）：</strong>' + escapeHtml(rec.added.join('、')) + '</p>');
      }
      if (rec.removed.length) {
        lines.push('<p><strong>将删除分类块：</strong>' + escapeHtml(rec.removed.join('、')) + '</p>');
      }
      lines.push('<p class="hint">同名分类会保留位置、尺寸、样式、表格结构和手动列宽，只更新歌名并重新排序。</p>');
      const modal = ui.modal.open({
        title: '重新导入确认',
        body: '<div class="prop-group">' + lines.join('') + '</div>',
        width: '460px',
        actions: [
          { label: '取消', onClick: function (close) { finish(false); close(); } },
          {
            label: '继续导入',
            className: 'btn-primary',
            onClick: function (close) {
              finish(true);
              close();
            }
          }
        ],
        onClose: function () { finish(false); }
      });
    });
  }

  async function handleImportFile(file, overrideEncoding) {
    if (!file) return;
    const result = await L.importer.importFile(file, overrideEncoding);
    if (!result.ok) {
      const encodingIssue = (result.errors || []).some(function (message) {
        return /编码|解码/.test(message);
      });
      if (encodingIssue) openEncodingDialog(file, (result.errors || ['无法识别文件编码。'])[0]);
      else showImportErrors(result);
      return;
    }

    const ok = await confirmReimport(result);
    if (!ok) return;

    L.importer.applyImport(state.project, result.categories);
    if (state.selection.type === 'element') {
      const found = findElementAnywhere(state.selection.id);
      if (!found) state.selection = { type: 'page' };
    }
    ui.renderAll();
    ui.toast('已导入 ' + result.stats.categories + ' 个分类、' + result.stats.songs + ' 首歌名（' + result.encoding + '）。', 'success');
  }

  function openImport() {
    const input = document.getElementById('import-file');
    input.value = '';
    input.click();
  }

  /* ---------- persistence ---------- */

  async function saveProject() {
    try {
      await L.io.downloadProject(state.project);
      ui.toast('项目已保存为 JSON。', 'success');
    } catch (err) {
      ui.modal.alert('保存失败', err.message);
    }
  }

  function openLoadProject() {
    const input = document.getElementById('load-file');
    input.value = '';
    input.click();
  }

  async function handleLoadFile(file) {
    if (!file) return;
    const result = await L.io.loadProjectFile(file);
    if (!result.ok) {
      ui.modal.alert('加载失败', result.error || '项目文件无法加载。');
      return;
    }
    L.io.installAssets(result.assets);
    state.project = result.project;
    state.currentPageId = state.project.pages[0].id;
    state.selection = { type: 'page' };
    ui.renderAll();
    ui.toast('项目已加载。', 'success');
  }

  /* ---------- bootstrap ---------- */

  function init() {
    setupSurface();
    ui.init();
    const originalRenderAll = ui.renderAll;
    ui.renderAll = function () {
      uiRenderDepth += 1;
      try {
        return originalRenderAll.apply(ui, arguments);
      } finally {
        uiRenderDepth -= 1;
      }
    };

    overlay.addEventListener('pointerdown', onPointerDown);
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerup', onPointerUp);
    overlay.addEventListener('pointercancel', onPointerUp);
    overlay.addEventListener('dblclick', onDoubleClick);
    overlay.addEventListener('dragover', onDragOver);
    overlay.addEventListener('drop', onDrop);

    fit();
    ui.renderAll();
  }

  L.app = {
    state: state,
    init: init,
    currentPage: currentPage,
    selectedElement: selectedElement,
    selectPage: selectPage,
    selectBackground: selectBackground,
    selectElement: selectElement,
    switchPage: switchPage,
    addPageDialog: addPageDialog,
    deleteCurrentPage: deleteCurrentPage,
    jumpToCategory: jumpToCategory,
    changed: changed,
    fit: fit,
    redraw: redraw,
    setPageSize: setPageSize,
    setMargins: setMargins,
    resizeElementWidth: resizeElementWidth,
    addText: addText,
    pickFreeImage: pickFreeImage,
    handleFreeImageFile: handleFreeImageFile,
    pickBackgroundImage: pickBackgroundImage,
    handleBackgroundFile: handleBackgroundFile,
    clearBackgroundImage: clearBackgroundImage,
    openImport: openImport,
    handleImportFile: handleImportFile,
    saveProject: saveProject,
    openLoadProject: openLoadProject,
    handleLoadFile: handleLoadFile,
    moveLayer: moveLayer,
    deleteSelection: deleteSelection
  };

  L.devChecks = function () {
    return layout.devChecks();
  };

  init();
})();
