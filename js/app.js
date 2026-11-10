(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;

  const BUILD = '20261110b';
  L.BUILD = BUILD;
  console.info('[Listify] build ' + BUILD);

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
  let pendingBackgroundSetId = null;
  let pendingBackgroundImageId = null;
  let uiRenderDepth = 0;

  const draft = {
    enabled: false,
    restoring: true,
    timer: 0,
    lastKey: '',
    lastSavedAt: 0,
    status: 'unsaved',
    lastError: '',
    saving: false,
    queued: false,
    memoryOnly: false
  };
  let lastExternalDraftNotice = 0;

  const viewport = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    dpr: 1,
    mode: 'fit',
    zoom: 1,
    fitScale: 1,
    padding: 48,
    originX: 0,
    originY: 0,
    stageWidth: 0,
    stageHeight: 0,
    scrollX: 0,
    scrollY: 0
  };
  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 10;

  let scrollEl = null;
  let stageEl = null;
  let zoomInput = null;
  let zoomOutBtn = null;
  let zoomInBtn = null;
  let scrollRaf = 0;

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

  function editingBackground() {
    return state.selection.type === 'backgroundSet' || state.selection.type === 'backgroundImage';
  }

  function selectedBackgroundSet() {
    if (!editingBackground()) return null;
    return model.findBackground(state.project, state.selection.setId);
  }

  function selectedBackgroundImage() {
    if (state.selection.type !== 'backgroundImage') return null;
    const set = model.findBackground(state.project, state.selection.setId);
    if (!set) return null;
    return (set.images || []).find(function (image) {
      return image.id === state.selection.imageId;
    }) || null;
  }

  function backgroundImageBounds(image) {
    const loaded = image.assetId ? L.assets.getCachedImage(image.assetId) : null;
    return renderer.backgroundImageRect(state.project.pageSize, image, loaded);
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
    scrollEl = document.getElementById('canvas-scroll');
    stageEl = document.getElementById('canvas-stage');
    zoomInput = document.getElementById('zoom-input');
    zoomOutBtn = document.getElementById('btn-zoom-out');
    zoomInBtn = document.getElementById('btn-zoom-in');

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

  function toolbarChromeLeft() {
    const toolbar = document.getElementById('canvas-toolbar');
    return toolbar ? Math.round(toolbar.getBoundingClientRect().width) + 24 : 0;
  }

  function measureCanvas() {
    if (!scrollEl) return false;
    viewport.width = Math.max(1, scrollEl.clientWidth || 1);
    viewport.height = Math.max(1, scrollEl.clientHeight || 1);
    viewport.dpr = window.devicePixelRatio || 1;
    viewport.padding = Math.min(72, Math.max(24, Math.min(viewport.width, viewport.height) * 0.08));
    const chromeLeft = toolbarChromeLeft();
    const availableWidth = Math.max(1, viewport.width - chromeLeft);
    const pageW = Math.max(1, state.project.pageSize.width);
    const pageH = Math.max(1, state.project.pageSize.height);
    viewport.fitScale = Math.max(0.05, Math.min(1.6, Math.min(
      (availableWidth - viewport.padding * 2 - 1) / pageW,
      (viewport.height - viewport.padding * 2 - 1) / pageH
    )));
    return true;
  }

  function effectiveScale() {
    return viewport.mode === 'fit' ? viewport.fitScale : viewport.zoom;
  }

  function syncGeometry() {
    if (!scrollEl || !stageEl) return;
    const pageW = Math.max(1, state.project.pageSize.width);
    const pageH = Math.max(1, state.project.pageSize.height);
    let previousSize = '';
    for (let pass = 0; pass < 2; pass++) {
      measureCanvas();
      const chromeLeft = toolbarChromeLeft();
      const scale = effectiveScale();
      const contentW = pageW * scale + chromeLeft + viewport.padding * 2;
      const contentH = pageH * scale + viewport.padding * 2;
      const stageW = contentW <= viewport.width + 0.01 ? viewport.width : Math.ceil(contentW);
      const stageH = contentH <= viewport.height + 0.01 ? viewport.height : Math.ceil(contentH);
      stageEl.style.width = stageW + 'px';
      stageEl.style.height = stageH + 'px';
      viewport.scale = scale;
      viewport.stageWidth = stageW;
      viewport.stageHeight = stageH;
      viewport.originX = stageW > viewport.width + 0.5
        ? chromeLeft + viewport.padding
        : chromeLeft + (viewport.width - chromeLeft - pageW * scale) / 2;
      viewport.originY = stageH > viewport.height + 0.5
        ? viewport.padding
        : (viewport.height - pageH * scale) / 2;
      // Scrollbars may appear or disappear after the stage resize; measure once
      // more so the origin and offsets use the real visible area.
      const size = scrollEl.clientWidth + 'x' + scrollEl.clientHeight;
      if (size === previousSize) break;
      previousSize = size;
    }
    viewport.scrollX = clamp(scrollEl.scrollLeft, 0, Math.max(0, viewport.stageWidth - viewport.width));
    viewport.scrollY = clamp(scrollEl.scrollTop, 0, Math.max(0, viewport.stageHeight - viewport.height));
    if (scrollEl.scrollLeft !== viewport.scrollX) scrollEl.scrollLeft = viewport.scrollX;
    if (scrollEl.scrollTop !== viewport.scrollY) scrollEl.scrollTop = viewport.scrollY;
    viewport.offsetX = viewport.originX - viewport.scrollX;
    viewport.offsetY = viewport.originY - viewport.scrollY;
    updateZoomUI();
  }

  let reflowPending = false;
  function scheduleGeometryReflow() {
    if (reflowPending) return;
    reflowPending = true;
    requestAnimationFrame(function () {
      reflowPending = false;
      const before = viewport.width + 'x' + viewport.height + ':' + viewport.scale + ':' +
        viewport.stageWidth + 'x' + viewport.stageHeight;
      syncGeometry();
      const after = viewport.width + 'x' + viewport.height + ':' + viewport.scale + ':' +
        viewport.stageWidth + 'x' + viewport.stageHeight;
      if (before !== after) {
        applyViewTransform();
        drawOverlay();
      }
    });
  }

  function applyViewTransform() {
    if (!viewEl) return;
    const pageW = Math.max(1, state.project.pageSize.width);
    const pageH = Math.max(1, state.project.pageSize.height);
    viewEl.style.width = pageW + 'px';
    viewEl.style.height = pageH + 'px';
    viewEl.style.transformOrigin = '0 0';
    viewEl.style.transform = 'translate(' + viewport.originX + 'px,' + viewport.originY + 'px) scale(' + viewport.scale + ')';

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
    syncGeometry();
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
    scheduleGeometryReflow();
    scheduleDraftSave();
  }

  function fit() {
    viewport.mode = 'fit';
    if (scrollEl) {
      scrollEl.scrollLeft = 0;
      scrollEl.scrollTop = 0;
    }
    syncGeometry();
    applyViewTransform();
    drawOverlay();
    scheduleGeometryReflow();
  }

  function updateZoomUI() {
    if (!zoomInput) return;
    const percent = Math.round(viewport.scale * 100);
    if (document.activeElement !== zoomInput) {
      zoomInput.value = percent + '%';
    }
    if (zoomOutBtn) {
      const disabled = percent <= Math.round(ZOOM_MIN * 100);
      zoomOutBtn.disabled = disabled;
      zoomOutBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
    if (zoomInBtn) {
      const disabled = percent >= Math.round(ZOOM_MAX * 100);
      zoomInBtn.disabled = disabled;
      zoomInBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
  }

  function centerAnchor() {
    return { x: viewport.width / 2, y: viewport.height / 2 };
  }

  function zoomAround(nextScale, anchor) {
    if (!scrollEl || !stageEl) return;
    const previousScale = viewport.scale;
    const target = clamp(nextScale, ZOOM_MIN, ZOOM_MAX);
    const point = anchor || centerAnchor();
    const pageX = (point.x - viewport.offsetX) / previousScale;
    const pageY = (point.y - viewport.offsetY) / previousScale;
    viewport.mode = 'manual';
    viewport.zoom = target;
    syncGeometry();
    const maxX = Math.max(0, viewport.stageWidth - viewport.width);
    const maxY = Math.max(0, viewport.stageHeight - viewport.height);
    scrollEl.scrollLeft = clamp(viewport.originX + pageX * viewport.scale - point.x, 0, maxX);
    scrollEl.scrollTop = clamp(viewport.originY + pageY * viewport.scale - point.y, 0, maxY);
    syncGeometry();
    applyViewTransform();
    drawOverlay();
    scheduleGeometryReflow();
  }

  function setZoomPercent(percent) {
    const value = Number(percent);
    if (!Number.isFinite(value)) return;
    zoomAround(clamp(value, ZOOM_MIN * 100, ZOOM_MAX * 100) / 100, centerAnchor());
  }

  function stepZoom(delta) {
    const current = Math.round(viewport.scale * 100);
    const base = viewport.mode === 'fit' ? current : Math.round(viewport.zoom * 100);
    let next = base + delta;
    if (base < ZOOM_MIN * 100 && delta > 0) next = ZOOM_MIN * 100;
    setZoomPercent(clamp(next, ZOOM_MIN * 100, ZOOM_MAX * 100));
  }

  function zoomIn() {
    stepZoom(ZOOM_STEP);
  }

  function zoomOut() {
    stepZoom(-ZOOM_STEP);
  }

  function syncScrollOffsets() {
    if (!scrollEl) return;
    viewport.scrollX = scrollEl.scrollLeft;
    viewport.scrollY = scrollEl.scrollTop;
    viewport.offsetX = viewport.originX - viewport.scrollX;
    viewport.offsetY = viewport.originY - viewport.scrollY;
  }

  function onCanvasScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(function () {
      scrollRaf = 0;
      syncScrollOffsets();
      drawOverlay();
    });
  }

  function onCanvasWheel(event) {
    if (!scrollEl) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const rect = overlay.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      zoomAround(viewport.scale * factor, anchor);
      return;
    }
    let dx = event.deltaX;
    let dy = event.deltaY;
    if (event.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    } else if (event.deltaMode === 2) {
      dx *= viewport.width;
      dy *= viewport.height;
    }
    if (event.shiftKey && !dx) {
      dx = dy;
      dy = 0;
    }
    if (!dx && !dy) return;
    if (viewport.stageWidth <= viewport.width && viewport.stageHeight <= viewport.height) return;
    event.preventDefault();
    scrollEl.scrollLeft += dx;
    scrollEl.scrollTop += dy;
  }

  function handleResize() {
    if (viewport.mode === 'fit') {
      fit();
      return;
    }
    syncGeometry();
    applyViewTransform();
    drawOverlay();
    scheduleGeometryReflow();
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
    if (!editingBackground()) drawPageSizeHandle(ctx, rect);
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

  function screenFromPage(x, y) {
    return {
      x: viewport.offsetX + x * viewport.scale,
      y: viewport.offsetY + y * viewport.scale
    };
  }

  function imageHandlePoints(element) {
    const width = element.width;
    const height = element.height;
    const centerX = element.x + width / 2;
    const centerY = element.y + height / 2;
    const radians = model.rotationRadians(element);
    const defs = [
      { name: 'nw', sx: -1, sy: -1, cursor: 'nwse-resize' },
      { name: 'n', sx: 0, sy: -1, cursor: 'ns-resize' },
      { name: 'ne', sx: 1, sy: -1, cursor: 'nesw-resize' },
      { name: 'e', sx: 1, sy: 0, cursor: 'ew-resize' },
      { name: 'se', sx: 1, sy: 1, cursor: 'nwse-resize' },
      { name: 's', sx: 0, sy: 1, cursor: 'ns-resize' },
      { name: 'sw', sx: -1, sy: 1, cursor: 'nesw-resize' },
      { name: 'w', sx: -1, sy: 0, cursor: 'ew-resize' }
    ];
    return defs.map(function (def) {
      const offset = model.rotateVector(def.sx * width / 2, def.sy * height / 2, radians);
      const screen = screenFromPage(centerX + offset.x, centerY + offset.y);
      return { name: def.name, x: screen.x, y: screen.y, cursor: def.cursor };
    });
  }

  function handlePoints(bounds, element) {
    if (element.type === 'image') return imageHandlePoints(element);
    const x = viewport.offsetX + bounds.x * viewport.scale;
    const y = viewport.offsetY + bounds.y * viewport.scale;
    const w = bounds.width * viewport.scale;
    const h = bounds.height * viewport.scale;
    const midY = y + h / 2;
    return [
      { name: 'w', x: x, y: midY, cursor: 'ew-resize' },
      { name: 'e', x: x + w, y: midY, cursor: 'ew-resize' }
    ];
  }

  function drawSelection(ctx, page) {
    const backgroundImage = selectedBackgroundImage();
    if (backgroundImage) {
      drawBackgroundSelection(ctx, backgroundImage);
      return;
    }
    const element = selectedElement();
    if (!element) return;
    const bounds = renderer.elementBounds(state.project, page, element);

    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    if (element.type === 'image') {
      const corners = renderer.elementCorners(element);
      ctx.beginPath();
      corners.forEach(function (corner, index) {
        const point = screenFromPage(corner.x, corner.y);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.stroke();
    } else {
      const x = viewport.offsetX + bounds.x * viewport.scale;
      const y = viewport.offsetY + bounds.y * viewport.scale;
      ctx.strokeRect(x, y, bounds.width * viewport.scale, bounds.height * viewport.scale);
    }
    handlePoints(bounds, element).forEach(function (handle) {
      drawSquareHandle(ctx, handle.x, handle.y, 8, '#2563eb', '#ffffff');
    });
    ctx.restore();

    if (element.type === 'category') drawTableDividers(ctx, page, element);
  }

  function drawBackgroundSelection(ctx, image) {
    const bounds = backgroundImageBounds(image);
    if (!(bounds.width > 0) || !(bounds.height > 0)) return;
    const shape = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      rotation: image.rotation
    };
    const corners = renderer.elementCorners(shape);
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    corners.forEach(function (corner, index) {
      const point = screenFromPage(corner.x, corner.y);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
    imageHandlePoints(shape).forEach(function (handle) {
      drawSquareHandle(ctx, handle.x, handle.y, 8, '#2563eb', '#ffffff');
    });
    ctx.restore();
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
    const backgroundImage = selectedBackgroundImage();
    if (backgroundImage) {
      const bounds = backgroundImageBounds(backgroundImage);
      const shape = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: backgroundImage.rotation
      };
      for (const point of imageHandlePoints(shape)) {
        if (Math.abs(screenX - point.x) <= 8 && Math.abs(screenY - point.y) <= 8) {
          return {
            type: 'resize-background',
            image: backgroundImage,
            handle: point.name,
            cursor: point.cursor,
            bounds: bounds
          };
        }
      }
      return null;
    }
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
        else if (editingBackground() && renderer.hitTestBackground(state.project, page, pt.x, pt.y)) {
          cursor = 'move';
        }
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

    const pageHandle = editingBackground() ? null : pageSizeHandleAt(point.x, point.y);
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
      if (handle.type === 'resize-background') {
        ensureCustomBackgroundImage(handle.image);
        const bounds = backgroundImageBounds(handle.image);
        drag = {
          type: 'resize',
          background: true,
          image: handle.image,
          handle: handle.handle,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startBounds: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
          }
        };
      } else {
        drag = {
          type: 'resize',
          element: handle.element,
          handle: handle.handle,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startBounds: handle.bounds
        };
      }
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

    if (editingBackground()) {
      const backgroundHit = renderer.hitTestBackground(state.project, page, pt.x, pt.y);
      if (backgroundHit) {
        ensureCustomBackgroundImage(backgroundHit.image);
        state.selection = {
          type: 'backgroundImage',
          setId: backgroundHit.background.id,
          imageId: backgroundHit.image.id
        };
        ui.renderAll();
        drag = {
          type: 'move-background',
          image: backgroundHit.image,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: backgroundHit.image.x,
          startY: backgroundHit.image.y
        };
        beginPointer(event);
        return;
      }
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

    if (drag.type === 'move-background') {
      drag.image.x = Math.round(drag.startX + dx);
      drag.image.y = Math.round(drag.startY + dy);
      redraw();
      return;
    }

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
    if (drag.background) {
      const image = drag.image;
      const start = drag.startBounds;
      const next = model.computeImageResize(
        { x: start.x, y: start.y, width: start.width, height: start.height, rotation: image.rotation },
        drag.handle,
        { x: dx, y: dy },
        image.keepRatio !== false
      );
      image.x = Math.round(next.x);
      image.y = Math.round(next.y);
      image.width = Math.round(next.width);
      image.height = Math.round(next.height);
      return;
    }
    const element = drag.element;
    const start = drag.startBounds;
    const minWidth = element.type === 'text' ? 80 : 80;
    if (element.type === 'image') {
      const next = model.computeImageResize(
        { x: start.x, y: start.y, width: start.width, height: start.height, rotation: element.rotation },
        drag.handle,
        { x: dx, y: dy },
        element.keepRatio !== false
      );
      element.x = Math.round(next.x);
      element.y = Math.round(next.y);
      element.width = Math.round(next.width);
      element.height = Math.round(next.height);
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
    if (finished.type === 'move-background' && finished.image) {
      finished.image.x = Math.round(finished.image.x);
      finished.image.y = Math.round(finished.image.y);
    }
    if (finished.type === 'resize' && finished.background && finished.image) {
      finished.image.x = Math.round(finished.image.x);
      finished.image.y = Math.round(finished.image.y);
      finished.image.width = Math.round(finished.image.width);
      finished.image.height = Math.round(finished.image.height);
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

  function categoryDropPosition(page, project, cursorY) {
    const margins = project.margins;
    let lowestBottom = null;

    page.elements.forEach(function (element) {
      if (!(element.y <= cursorY)) return;
      const category = element.type === 'category'
        ? model.getCategory(project, element.category)
        : null;
      const bottom = element.y + layout.elementHeight(element, category);
      if (lowestBottom === null || bottom > lowestBottom) lowestBottom = bottom;
    });

    return {
      x: margins.left,
      y: Math.max(0, Math.round(lowestBottom === null ? margins.top : lowestBottom))
    };
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
    const position = categoryDropPosition(page, state.project, pt.y);
    const element = model.createCategoryElement(name, position.x, position.y, state.project, width);
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

  function selectBackgroundSet(setId) {
    const set = model.findBackground(state.project, setId);
    if (!set) return;
    state.selection = { type: 'backgroundSet', setId: setId };
    ui.renderAll();
  }

  function selectBackgroundImage(setId, imageId) {
    const set = model.findBackground(state.project, setId);
    if (!set) return;
    const image = (set.images || []).find(function (item) { return item.id === imageId; });
    if (!image) return;
    state.selection = { type: 'backgroundImage', setId: setId, imageId: imageId };
    ui.renderAll();
  }

  function selectBackground() {
    const set = model.effectiveBackground(state.project, currentPage());
    if (set) selectBackgroundSet(set.id);
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
    const backgroundId = state.project.unifiedBackground && state.project.unifiedBackgroundId
      ? state.project.unifiedBackgroundId
      : (current && current.backgroundId) || (state.project.backgrounds[0] || {}).id || null;
    const page = model.createPage(backgroundId);
    state.project.pages.push(page);
    state.currentPageId = page.id;
    state.selection = { type: 'page' };
    ui.renderAll();
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

  /* ---------- playlist editing ---------- */

  function countSongChanges(original, next) {
    const length = Math.max(original.length, next.length);
    let count = 0;
    for (let i = 0; i < length; i += 1) {
      const before = original[i] == null ? null : String(original[i]).trim();
      const after = next[i] == null ? null : String(next[i]).trim();
      if (before !== after) count += 1;
    }
    return count;
  }

  function applyPlaylistEdits(categories) {
    const renameMap = {};
    const summary = { renamed: 0, songChanges: 0 };
    categories.forEach(function (category) {
      if (category.originalName !== category.name) {
        renameMap[category.originalName] = category.name;
        summary.renamed += 1;
      }
      summary.songChanges += countSongChanges(category.originalSongs || [], category.songs);
    });

    state.project.pages.forEach(function (page) {
      page.elements.forEach(function (element) {
        if (element.type === 'category' && Object.prototype.hasOwnProperty.call(renameMap, element.category)) {
          element.category = renameMap[element.category];
        }
      });
    });

    state.project.playlist.categories = categories.map(function (category) {
      return { name: category.name, songs: category.songs.slice() };
    });

    ui.renderAll();

    const parts = [];
    if (summary.songChanges) parts.push(summary.songChanges + ' 处歌名');
    if (summary.renamed) parts.push(summary.renamed + ' 个分类改名');
    ui.toast(parts.length ? '已更新：' + parts.join('，') + '。' : '歌单已更新。', 'success');
  }

  function openPlaylistEditor() {
    if (!state.project.playlist.categories.length) {
      ui.modal.alert('还没有歌单', '请先导入歌单，再编辑分类和歌名。');
      return;
    }
    let defaultCategoryName = null;
    const selected = selectedElement();
    if (selected && selected.type === 'category') defaultCategoryName = selected.category;
    ui.playlistEditor.open({
      categories: state.project.playlist.categories,
      defaultCategoryName: defaultCategoryName,
      onApply: applyPlaylistEdits
    });
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

  function assetIsReferenced(assetId) {
    if (!assetId) return false;
    return (state.project.backgrounds || []).some(function (background) {
      return (background.images || []).some(function (image) {
        return image.assetId === assetId;
      });
    }) || state.project.pages.some(function (page) {
      return page.elements.some(function (element) {
        return element.type === 'image' && element.assetId === assetId;
      });
    });
  }

  function releaseUnusedAsset(assetId) {
    if (assetId && !assetIsReferenced(assetId)) L.assets.remove(assetId);
  }

  async function loadFreeImageAsset(file, name) {
    const mime = file.type || 'image/png';
    const source = file.name
      ? file
      : new File([file], name || '剪贴板图片.png', { type: mime });
    let assetId;
    try {
      assetId = await L.assets.addFile(source);
      const image = await L.assets.loadImage(assetId);
      const meta = L.assets.getMeta(assetId);
      model.ensureAssetMeta(state.project, assetId, source.name, meta ? meta.mime : source.type);
      await persistDraftAssetQuietly(assetId);
      return { assetId: assetId, image: image };
    } catch (err) {
      releaseUnusedAsset(assetId);
      throw err;
    }
  }

  function buildFreeImageElement(assetId, image, offset) {
    const naturalWidth = image.naturalWidth || image.width || 400;
    const naturalHeight = image.naturalHeight || image.height || 300;
    const maxSize = 480;
    const ratio = Math.min(1, maxSize / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(40, Math.round(naturalWidth * ratio));
    const height = Math.max(40, Math.round(naturalHeight * ratio));
    const element = model.createImageElement(state.project, assetId, width, height);
    const shift = Number(offset) || 0;
    if (shift) {
      element.x += shift;
      element.y += shift;
    }
    return element;
  }

  async function handleFreeImageFile(file) {
    if (!file) return;
    const targetId = pendingImageElementId;
    pendingImageElementId = null;
    let assetId;
    try {
      const loaded = await loadFreeImageAsset(file);
      assetId = loaded.assetId;
      const image = loaded.image;

      if (targetId) {
        const found = findElementAnywhere(targetId);
        if (found && found.element.type === 'image') {
          found.element.assetId = assetId;
          if (found.element.keepRatio !== false) normalizeImageRatio(found.element, image);
          state.selection = { type: 'element', id: found.element.id };
          if (found.page.id !== state.currentPageId) state.currentPageId = found.page.id;
          ui.renderAll();
          ui.toast('图片已替换。');
          return;
        }
      }

      const page = currentPage();
      if (!page) throw new Error('当前页面不存在。');
      const element = buildFreeImageElement(assetId, image);
      page.elements.push(element);
      state.selection = { type: 'element', id: element.id };
      ui.renderAll();
      ui.toast('已添加图片。');
    } catch (err) {
      releaseUnusedAsset(assetId);
      ui.toast('图片读取失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    }
  }

  const CLIPBOARD_EXTENSIONS = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/avif': 'avif',
    'image/x-icon': 'ico'
  };

  function clipboardFile(image, index, stamp) {
    const blob = image && image.blob;
    if (!blob) throw new Error('剪贴板图片为空。');
    const mime = image.mime || blob.type || 'image/png';
    const provided = String(image.name || blob.name || '').trim();
    const extension = CLIPBOARD_EXTENSIONS[String(mime).toLowerCase()] || 'png';
    const name = provided || ('剪贴板图片-' + stamp + '-' + (index + 1) + '.' + extension);
    return new File([blob], name, { type: mime });
  }

  async function handlePastedImages(images) {
    if (!images || !images.length) return;
    const targetPageId = state.currentPageId;
    if (!model.getPage(state.project, targetPageId)) {
      ui.toast('粘贴图片失败：当前页面不存在。', 'error');
      return;
    }

    const stamp = Date.now();
    let successCount = 0;
    let failedCount = 0;
    let firstError = '';
    let lastElementId = null;

    for (let index = 0; index < images.length; index += 1) {
      let loaded;
      try {
        const file = clipboardFile(images[index], index, stamp);
        loaded = await loadFreeImageAsset(file, file.name);
      } catch (err) {
        failedCount += 1;
        if (!firstError) firstError = err && err.message ? err.message : '图片无法解码。';
        continue;
      }

      const page = model.getPage(state.project, targetPageId);
      if (!page) {
        releaseUnusedAsset(loaded.assetId);
        ui.toast('粘贴图片失败：目标页面已不存在。', 'error');
        return;
      }

      const element = buildFreeImageElement(loaded.assetId, loaded.image, successCount * 24);
      page.elements.push(element);
      successCount += 1;
      lastElementId = element.id;
    }

    if (!successCount) {
      ui.toast('粘贴图片失败：' + (firstError || '图片无法解码。'), 'error');
      return;
    }
    if (!model.getPage(state.project, targetPageId)) {
      ui.toast('粘贴图片失败：目标页面已不存在。', 'error');
      return;
    }

    state.currentPageId = targetPageId;
    state.selection = { type: 'element', id: lastElementId };
    ui.renderAll();
    if (failedCount) {
      ui.toast('已粘贴 ' + successCount + ' 张图片，' + failedCount + ' 张失败。', 'error');
    } else if (successCount === 1) {
      ui.toast('已粘贴图片。');
    } else {
      ui.toast('已粘贴 ' + successCount + ' 张图片。');
    }
  }

  function isTextEditingNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = node.tagName ? node.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (node.isContentEditable) return true;
    if (typeof node.closest === 'function') {
      const editable = node.closest('[contenteditable]');
      if (editable && editable.getAttribute('contenteditable') !== 'false') return true;
    }
    return false;
  }

  function shouldHandleClipboardPaste(event) {
    if (isTextEditingNode((event && event.target) || document.activeElement)) return false;
    if (isTextEditingNode(document.activeElement)) return false;
    const modal = document.getElementById('modal-root');
    if (modal && !modal.hidden) return false;
    return !!currentPage();
  }

  function normalizeImageRatio(element, image) {
    const cached = image || (element.assetId ? L.assets.getCachedImage(element.assetId) : null);
    if (!cached) {
      if (element.assetId) {
        L.assets.loadImage(element.assetId).then(function (loaded) {
          normalizeImageRatio(element, loaded);
          ui.renderAll();
        }).catch(function () { /* 图片无法解码时保持当前矩形 */ });
      }
      return;
    }
    const naturalWidth = cached.naturalWidth || cached.width;
    const naturalHeight = cached.naturalHeight || cached.height;
    if (!naturalWidth || !naturalHeight) return;
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const width = Math.max(40, element.width);
    const height = Math.max(40, width * naturalHeight / naturalWidth);
    element.width = Math.round(width);
    element.height = Math.round(height);
    element.x = Math.round(centerX - element.width / 2);
    element.y = Math.round(centerY - element.height / 2);
  }

  function setImageKeepRatio(element, value) {
    if (!element || element.type !== 'image') return;
    element.keepRatio = !!value;
    if (element.keepRatio) normalizeImageRatio(element);
    ui.renderAll();
  }

  function ensureCustomBackgroundImage(image) {
    if (!image || image.fit === 'none') return;
    const bounds = backgroundImageBounds(image);
    const pageSize = state.project.pageSize;
    image.fit = 'none';
    image.x = Math.round(bounds.width > 0 ? bounds.x : 0);
    image.y = Math.round(bounds.height > 0 ? bounds.y : 0);
    image.width = Math.round(bounds.width > 0 ? bounds.width : pageSize.width);
    image.height = Math.round(bounds.height > 0 ? bounds.height : pageSize.height);
  }

  function addBackgroundSet() {
    const set = model.createBackgroundSet('背景 ' + (state.project.backgrounds.length + 1));
    state.project.backgrounds.push(set);
    state.selection = { type: 'backgroundSet', setId: set.id };
    ui.renderAll();
    return set;
  }

  function duplicateBackgroundSet(setId) {
    const source = model.findBackground(state.project, setId);
    if (!source) return null;
    const copy = model.cloneBackgroundSet(source);
    copy.name = source.name + ' 副本';
    state.project.backgrounds.push(copy);
    state.selection = { type: 'backgroundSet', setId: copy.id };
    ui.renderAll();
    return copy;
  }

  function renameBackgroundSet(setId, name) {
    const set = model.findBackground(state.project, setId);
    if (!set) return;
    const trimmed = String(name == null ? '' : name).trim();
    if (!trimmed) return;
    set.name = trimmed;
    ui.renderAll();
  }

  function deleteBackgroundSet(setId) {
    const set = model.findBackground(state.project, setId);
    if (!set) return;
    const check = model.canDeleteBackground(state.project, setId);
    if (!check.ok) {
      ui.modal.alert('无法删除背景', check.reason);
      return;
    }
    const index = state.project.backgrounds.indexOf(set);
    state.project.backgrounds.splice(index, 1);
    (set.images || []).forEach(function (image) { releaseUnusedAsset(image.assetId); });
    state.selection = { type: 'page' };
    ui.renderAll();
    ui.toast('已删除背景“' + set.name + '”。');
  }

  function setPageBackground(setId) {
    const page = currentPage();
    if (!page) return;
    if (!model.findBackground(state.project, setId)) return;
    page.backgroundId = setId;
    state.selection = { type: 'page' };
    ui.renderAll();
  }

  function pickBackgroundImage(setId, imageId) {
    const set = model.findBackground(state.project, setId);
    if (!set) return;
    pendingBackgroundSetId = setId;
    pendingBackgroundImageId = imageId || null;
    const input = document.getElementById('bg-file');
    input.value = '';
    input.click();
  }

  async function handleBackgroundFile(file) {
    if (!file) return;
    const setId = pendingBackgroundSetId;
    const imageId = pendingBackgroundImageId;
    pendingBackgroundSetId = null;
    pendingBackgroundImageId = null;
    const set = model.findBackground(state.project, setId) ||
      model.effectiveBackground(state.project, currentPage());
    if (!set) return;
    let assetId;
    try {
      assetId = await L.assets.addFile(file);
      const loaded = await L.assets.loadImage(assetId);
      const meta = L.assets.getMeta(assetId);
      model.ensureAssetMeta(state.project, assetId, file.name, meta ? meta.mime : file.type);
      await persistDraftAssetQuietly(assetId);
      const target = imageId
        ? (set.images || []).find(function (image) { return image.id === imageId; })
        : null;
      if (target) {
        const oldAssetId = target.assetId;
        target.assetId = assetId;
        if (target.fit === 'none') {
          const rect = renderer.backgroundImageRect(state.project.pageSize, target, loaded);
          target.width = target.width > 0 ? target.width : rect.width;
          target.height = target.height > 0 ? target.height : rect.height;
        }
        releaseUnusedAsset(oldAssetId);
        state.selection = { type: 'backgroundImage', setId: set.id, imageId: target.id };
      } else {
        const image = model.createBackgroundImage(assetId, set.images.length ? 'original' : 'cover');
        set.images.push(image);
        state.selection = { type: 'backgroundImage', setId: set.id, imageId: image.id };
      }
      ui.renderAll();
      ui.toast('背景图片已更新。');
    } catch (err) {
      if (assetId) L.assets.remove(assetId);
      ui.toast('背景图片读取失败：' + err.message, 'error');
    }
  }

  function deleteBackgroundImage(setId, imageId) {
    const set = model.findBackground(state.project, setId);
    if (!set) return;
    const index = (set.images || []).findIndex(function (image) { return image.id === imageId; });
    if (index < 0) return;
    const image = set.images[index];
    set.images.splice(index, 1);
    releaseUnusedAsset(image.assetId);
    state.selection = { type: 'backgroundSet', setId: setId };
    ui.renderAll();
  }

  function moveBackgroundImage(setId, imageId, delta) {
    const set = model.findBackground(state.project, setId);
    if (!set) return;
    const index = set.images.findIndex(function (image) { return image.id === imageId; });
    const target = index + delta;
    if (index < 0 || target < 0 || target >= set.images.length) return;
    const image = set.images[index];
    set.images.splice(index, 1);
    set.images.splice(target, 0, image);
    ui.renderAll();
  }

  function setBackgroundImageFit(setId, imageId, fit) {
    const set = model.findBackground(state.project, setId);
    if (!set) return;
    const image = (set.images || []).find(function (item) { return item.id === imageId; });
    if (!image) return;
    if (fit === 'none') {
      ensureCustomBackgroundImage(image);
    } else {
      image.fit = fit;
      image.rotation = 0;
    }
    ui.renderAll();
  }

  function restoreBackgroundImageFit(setId, imageId) {
    setBackgroundImageFit(setId, imageId, 'cover');
  }

  function setBackgroundImageValue(setId, imageId, key, value) {
    const set = model.findBackground(state.project, setId);
    if (!set) return;
    const image = (set.images || []).find(function (item) { return item.id === imageId; });
    if (!image) return;
    image[key] = value;
    ui.renderAll();
  }

  function toggleUnifiedBackground(value) {
    const next = !!value;
    if (next) {
      let id = state.project.unifiedBackgroundId;
      if (!model.findBackground(state.project, id)) {
        const effective = model.effectiveBackground(state.project, currentPage());
        id = effective ? effective.id : (state.project.backgrounds[0] || {}).id || null;
      }
      state.project.unifiedBackgroundId = id;
    }
    state.project.unifiedBackground = next;
    state.selection = { type: 'page' };
    ui.renderAll();
  }

  function setUnifiedBackground(setId) {
    if (!model.findBackground(state.project, setId)) return;
    state.project.unifiedBackgroundId = setId;
    state.project.unifiedBackground = true;
    ui.renderAll();
  }

  function bakeUnifiedBackground() {
    const id = state.project.unifiedBackgroundId;
    if (!id) return;
    state.project.pages.forEach(function (page) { page.backgroundId = id; });
    state.project.unifiedBackground = false;
    state.selection = { type: 'page' };
    ui.renderAll();
    ui.toast('已将全局背景固化到所有页。');
  }

  function copyUnifiedBackgroundToPage() {
    const id = state.project.unifiedBackgroundId;
    const globalSet = model.findBackground(state.project, id);
    const page = currentPage();
    if (!globalSet || !page) return;
    const copy = model.cloneBackgroundSet(globalSet);
    copy.name = globalSet.name + ' 副本';
    state.project.backgrounds.push(copy);
    state.project.pages.forEach(function (item) {
      item.backgroundId = item.id === page.id ? copy.id : id;
    });
    state.project.unifiedBackground = false;
    state.selection = { type: 'backgroundSet', setId: copy.id };
    ui.renderAll();
    ui.toast('已为当前页创建独立背景副本。');
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

  /* ---------- draft persistence ---------- */

  function formatDraftTime(timestamp) {
    const date = new Date(timestamp || Date.now());
    return String(date.getHours()).padStart(2, '0') + ':' +
      String(date.getMinutes()).padStart(2, '0');
  }

  function draftSnapshotKey(envelope) {
    return JSON.stringify({ ui: envelope.ui, project: envelope.project });
  }

  function setDraftStatus(status, error, title) {
    draft.status = status;
    draft.lastError = error || '';
    const el = document.getElementById('draft-status');
    if (!el) return;
    let text = '草稿未保存';
    if (status === 'saved') {
      text = '草稿已自动保存 ' + formatDraftTime(draft.lastSavedAt);
    } else if (status === 'unavailable') {
      text = '草稿不可用';
    }
    el.textContent = text;
    el.setAttribute('data-state', status);
    let tip = title || '';
    if (!tip) {
      if (status === 'saved') {
        tip = '草稿保存在本机浏览器中；导出项目可长期备份。';
      } else if (error) {
        tip = '原因：' + error;
      } else {
        tip = '尚未自动保存。';
      }
    }
    el.title = tip;
  }

  function reportDraftError(err) {
    const message = err && err.message ? err.message : '本地存储写入失败';
    const previous = draft.lastError;
    const fatal = err && (err.name === 'SecurityError' || err.name === 'NotSupportedError');
    if (fatal) {
      draft.enabled = false;
      draft.memoryOnly = true;
      setDraftStatus('unavailable', message);
    } else {
      setDraftStatus('unsaved', message);
    }
    if (previous !== message) {
      ui.toast('草稿自动保存失败：' + message, 'error');
    }
  }

  function scheduleDraftSave() {
    if (!draft.enabled || draft.restoring) return;
    if (draft.timer) clearTimeout(draft.timer);
    draft.timer = setTimeout(function () {
      draft.timer = 0;
      saveDraftNow();
    }, 300);
  }

  async function saveDraftNow(options) {
    if (!draft.enabled || draft.restoring) return;
    const force = !!(options && options.force);
    const initialEnvelope = L.io.createDraftEnvelope(state.project, state.currentPageId);
    if (!force && draftSnapshotKey(initialEnvelope) === draft.lastKey) return;
    if (draft.saving) {
      draft.queued = true;
      return;
    }
    draft.saving = true;
    try {
      try {
        await L.io.ensureDraftAssets(state.project);
      } catch (err) {
        // 图片资产没落盘时不要写结构，避免恢复时把图片当作缺失资产删掉。
        reportDraftError(err);
        return;
      }
      if (!draft.enabled || draft.restoring) return;
      // 等待资产写入期间可能又有编辑；总是落盘当前状态，避免旧结构覆盖新编辑。
      const envelope = L.io.createDraftEnvelope(state.project, state.currentPageId);
      const key = draftSnapshotKey(envelope);
      if (!force && key === draft.lastKey) return;
      const savedAt = L.io.writeDraftEnvelope(envelope);
      draft.lastKey = key;
      draft.lastSavedAt = savedAt;
      setDraftStatus('saved');
      try {
        await L.io.pruneDraftAssets(state.project);
      } catch (err) {
        /* 未引用资产残留不影响草稿；下次保存会再清理。 */
      }
    } catch (err) {
      reportDraftError(err);
    } finally {
      draft.saving = false;
      if (draft.queued) {
        draft.queued = false;
        scheduleDraftSave();
      }
    }
  }

  function flushDraftSync() {
    if (!draft.enabled || draft.restoring) return;
    const envelope = L.io.createDraftEnvelope(state.project, state.currentPageId);
    const key = draftSnapshotKey(envelope);
    if (key === draft.lastKey) return;
    try {
      const savedAt = L.io.writeDraftEnvelope(envelope);
      draft.lastKey = key;
      draft.lastSavedAt = savedAt;
      setDraftStatus('saved');
    } catch (err) {
      reportDraftError(err);
    }
  }

  async function persistDraftAssetQuietly(assetId) {
    if (!draft.enabled || !assetId) return;
    try {
      await L.io.persistDraftAsset(assetId, state.project);
    } catch (err) {
      reportDraftError(err);
    }
  }

  async function restoreDraftOnStartup() {
    draft.restoring = true;
    draft.enabled = false;
    let result;
    try {
      result = await L.io.restoreDraft();
    } catch (err) {
      draft.memoryOnly = true;
      return { ok: false, reason: 'unavailable', error: err.message };
    }
    if (result && result.ok && result.project) {
      L.io.installAssets(result.assets);
      state.project = result.project;
      const savedPageId = result.ui && result.ui.currentPageId;
      state.currentPageId = model.getPage(state.project, savedPageId)
        ? savedPageId
        : state.project.pages[0].id;
      state.selection = { type: 'page' };
      draft.lastKey = draftSnapshotKey(
        L.io.createDraftEnvelope(state.project, state.currentPageId)
      );
      draft.lastSavedAt = result.savedAt || Date.now();
      draft.status = 'saved';
      return { ok: true, restored: true, missingCount: result.missingCount || 0 };
    }
    if (result && result.ok && result.empty) {
      draft.lastKey = '';
      draft.lastSavedAt = 0;
      return { ok: true, restored: false };
    }
    if (result && result.reason === 'unavailable') draft.memoryOnly = true;
    return {
      ok: false,
      reason: (result && result.reason) || 'corrupt',
      error: result && result.error,
      errors: result && result.errors
    };
  }

  function notifyDraftRecovery(startup) {
    if (!startup || startup.ok) {
      if (startup && startup.missingCount) {
        ui.toast('草稿已恢复，但 ' + startup.missingCount +
          ' 张图片缺失，相关图片已移除。', 'error');
      }
      return;
    }
    if (startup.reason === 'unavailable') {
      setDraftStatus('unavailable', startup.error || '浏览器本地存储不可用');
      ui.modal.alert('草稿不可用',
        '浏览器本地存储不可用，草稿不会自动保存；仍可编辑并导出项目。');
      return;
    }
    const message = startup.reason === 'version'
      ? '草稿版本高于当前支持的版本，已打开空白项目。原始草稿已保留在 listify.draft.corrupt。'
      : '草稿无法恢复，已打开空白项目。原始草稿已保留在 listify.draft.corrupt。';
    ui.modal.alert('草稿无法恢复', message);
  }

  /* ---------- import / export ---------- */

  async function exportProject() {
    try {
      await L.io.downloadProject(state.project);
      ui.toast('项目已导出。', 'success');
    } catch (err) {
      ui.modal.alert('导出失败', err.message);
    }
  }

  function openImportProject() {
    const input = document.getElementById('load-file');
    input.value = '';
    input.click();
  }

  function discardBuiltAssets(store) {
    if (!store || !store.urls) return;
    store.urls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
  }

  async function handleImportProject(file) {
    if (!file) return;
    const result = await L.io.loadProjectFile(file);
    if (!result.ok) {
      ui.modal.alert('导入失败', result.error || '项目文件无法加载。');
      return;
    }
    const ok = await ui.modal.confirm(
      '导入项目',
      '导入会替换当前草稿，且不可撤销。确定继续吗？',
      { confirmLabel: '替换草稿' }
    );
    if (!ok) {
      discardBuiltAssets(result.assets);
      return;
    }

    draft.restoring = true;
    try {
      try {
        await L.io.persistAssetStore(result.assets);
      } catch (err) {
        reportDraftError(err);
      }
      L.io.installAssets(result.assets);
      state.project = result.project;
      state.currentPageId = state.project.pages[0].id;
      state.selection = { type: 'page' };
      draft.lastKey = '';
      ui.renderAll();
    } finally {
      draft.restoring = false;
    }
    await saveDraftNow({ force: true });
    ui.toast('项目已导入。', 'success');
  }

  async function newProject() {
    const ok = await ui.modal.confirm(
      '新建项目',
      '新建会清空当前草稿和所有图片，且不可撤销。确定新建吗？',
      { confirmLabel: '新建项目', danger: true }
    );
    if (!ok) return;

    draft.restoring = true;
    try {
      try {
        await L.io.clearDraft();
      } catch (err) {
        reportDraftError(err);
      }
      L.assets.clear();
      state.project = model.createDefaultProject();
      state.currentPageId = state.project.pages[0].id;
      state.selection = { type: 'page' };
      draft.lastKey = '';
      ui.renderAll();
    } finally {
      draft.restoring = false;
    }
    await saveDraftNow({ force: true });
    ui.toast('已新建空白项目。', 'success');
  }

  /* ---------- bootstrap ---------- */

  async function init() {
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
    pane.addEventListener('wheel', onCanvasWheel, { passive: false });
    if (scrollEl) scrollEl.addEventListener('scroll', onCanvasScroll);

    window.addEventListener('pagehide', flushDraftSync);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushDraftSync();
    });
    window.addEventListener('storage', function (event) {
      if (!event || event.key !== L.io.DRAFT_KEY) return;
      if (draft.restoring) return;
      const now = Date.now();
      if (now - lastExternalDraftNotice < 8000) return;
      lastExternalDraftNotice = now;
      ui.toast('另一标签页更新了草稿，刷新可载入最新版本。', '');
    });

    if (L.clipboardImage) {
      L.clipboardImage.install({
        shouldHandle: shouldHandleClipboardPaste,
        onImages: function (images) {
          handlePastedImages(images).catch(function (err) {
            ui.toast('粘贴图片失败：' + (err && err.message ? err.message : '未知错误'), 'error');
          });
        }
      });
    }

    const startup = await restoreDraftOnStartup();
    fit();
    ui.renderAll();
    draft.restoring = false;

    if (startup.reason === 'unavailable') {
      draft.enabled = false;
      setDraftStatus('unavailable', startup.error || '浏览器本地存储不可用');
    } else {
      draft.enabled = true;
      setDraftStatus(startup.restored ? 'saved' : 'unsaved');
      scheduleDraftSave();
      if (startup.restored && startup.missingCount) {
        saveDraftNow({ force: true });
      }
    }

    notifyDraftRecovery(startup);
  }

  L.app = {
    state: state,
    init: init,
    currentPage: currentPage,
    selectedElement: selectedElement,
    selectPage: selectPage,
    selectBackground: selectBackground,
    selectBackgroundSet: selectBackgroundSet,
    selectBackgroundImage: selectBackgroundImage,
    selectElement: selectElement,
    switchPage: switchPage,
    addPageDialog: addPageDialog,
    addPage: addPageDialog,
    deleteCurrentPage: deleteCurrentPage,
    jumpToCategory: jumpToCategory,
    openPlaylistEditor: openPlaylistEditor,
    changed: changed,
    fit: fit,
    redraw: redraw,
    handleResize: handleResize,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    zoomFit: fit,
    setZoomPercent: setZoomPercent,
    getZoomPercent: function () {
      return Math.round(viewport.scale * 100);
    },
    isFitMode: function () {
      return viewport.mode === 'fit';
    },
    setPageSize: setPageSize,
    setMargins: setMargins,
    resizeElementWidth: resizeElementWidth,
    addText: addText,
    pickFreeImage: pickFreeImage,
    handleFreeImageFile: handleFreeImageFile,
    handlePastedImages: handlePastedImages,
    setImageKeepRatio: setImageKeepRatio,
    addBackgroundSet: addBackgroundSet,
    duplicateBackgroundSet: duplicateBackgroundSet,
    renameBackgroundSet: renameBackgroundSet,
    deleteBackgroundSet: deleteBackgroundSet,
    setPageBackground: setPageBackground,
    pickBackgroundImage: pickBackgroundImage,
    handleBackgroundFile: handleBackgroundFile,
    deleteBackgroundImage: deleteBackgroundImage,
    moveBackgroundImage: moveBackgroundImage,
    setBackgroundImageFit: setBackgroundImageFit,
    restoreBackgroundImageFit: restoreBackgroundImageFit,
    setBackgroundImageValue: setBackgroundImageValue,
    toggleUnifiedBackground: toggleUnifiedBackground,
    setUnifiedBackground: setUnifiedBackground,
    bakeUnifiedBackground: bakeUnifiedBackground,
    copyUnifiedBackgroundToPage: copyUnifiedBackgroundToPage,
    openImport: openImport,
    handleImportFile: handleImportFile,
    newProject: newProject,
    exportProject: exportProject,
    openImportProject: openImportProject,
    handleImportProject: handleImportProject,
    saveProject: exportProject,
    openLoadProject: openImportProject,
    handleLoadFile: handleImportProject,
    moveLayer: moveLayer,
    deleteSelection: deleteSelection
  };

  L.devChecks = function () {
    return layout.devChecks();
  };

  init().catch(function (err) {
    console.error('[Listify] 初始化失败', err);
    try {
      ui.toast('初始化失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    } catch (ignored) { /* empty */ }
  });
})();
