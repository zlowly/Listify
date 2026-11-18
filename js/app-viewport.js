(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;
  const clamp = model.clamp;
  const escapeHtml = ui.esc;

  L.appViewport = {
    create: function (appCtx) {
      const state = appCtx.state;
      const viewport = appCtx.viewport;
      const surface = appCtx.surface;
      const actions = appCtx.actions;

      const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;
      const dirty = { bg: false, content: false, chrome: false, overlay: false, draft: false };
      const drawStats = { redraws: 0, bg: 0, content: 0, chrome: 0, overlay: 0, geometry: 0 };
      let redrawRaf = 0;
      let geometryDirty = false;
      let syncedPageW = 0;
      let syncedPageH = 0;
      const ZOOM_MIN = 0.1;
      const ZOOM_MAX = 4;
      const ZOOM_STEP = 10;

      function surfaceRatio(pageW, pageH) {
        const requested = Math.min(2, window.devicePixelRatio || 1);
        const budget = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, pageW * pageH));
        return Math.max(0.1, Math.min(requested, budget));
      }
    
      function syncSurface() {
        const width = Math.max(1, Math.round(state.project.pageSize.width));
        const height = Math.max(1, Math.round(state.project.pageSize.height));
        if (!surface.bgCanvas || !surface.contentCanvas) return false;
        const ratio = surfaceRatio(width, height);
        const pixelWidth = Math.max(1, Math.round(width * ratio));
        const pixelHeight = Math.max(1, Math.round(height * ratio));
        let changed = false;
        [surface.bgCanvas, surface.contentCanvas].forEach(function (canvas) {
          if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
            changed = true;
          }
          if (canvas.style.width !== width + 'px' || canvas.style.height !== height + 'px') {
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
          }
        });
        return changed;
      }
    
      function setupSurface() {
        surface.pane = document.getElementById('canvas-pane');
        surface.viewEl = document.getElementById('leafer-view');
        surface.bgCanvas = document.getElementById('bg-canvas');
        surface.contentCanvas = document.getElementById('content-canvas');
        surface.bgCtx = surface.bgCanvas.getContext('2d');
        surface.contentCtx = surface.contentCanvas.getContext('2d');
        surface.overlayChrome = document.getElementById('overlay-chrome');
        surface.overlayChromeCtx = surface.overlayChrome.getContext('2d');
        surface.overlay = document.getElementById('overlay');
        surface.overlayCtx = surface.overlay.getContext('2d');
        surface.scrollEl = document.getElementById('canvas-scroll');
        surface.stageEl = document.getElementById('canvas-stage');
        surface.zoomInput = document.getElementById('zoom-input');
        surface.zoomOutBtn = document.getElementById('btn-zoom-out');
        surface.zoomInBtn = document.getElementById('btn-zoom-in');
    
        syncSurface();
        measureCanvas();
        positionCanvasStickers();
      }
    
      function toolbarChromeLeft() {
        const toolbar = document.getElementById('canvas-toolbar');
        return toolbar ? Math.round(toolbar.getBoundingClientRect().width) + 24 : 0;
      }
    
      function measureCanvas() {
        if (!surface.scrollEl) return false;
        viewport.width = Math.max(1, surface.scrollEl.clientWidth || 1);
        viewport.height = Math.max(1, surface.scrollEl.clientHeight || 1);
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
    
      function positionCanvasStickers() {
        if (!surface.pane) return;
        const chromeLeft = toolbarChromeLeft();
        const centerX = chromeLeft + Math.max(0, viewport.width - chromeLeft) / 2;
        surface.pane.style.setProperty('--canvas-sticker-x', Math.round(centerX) + 'px');
        surface.pane.style.setProperty('--canvas-sticker-y', Math.round(viewport.height / 2) + 'px');
      }

      function syncGeometry() {
        if (!surface.scrollEl || !surface.stageEl) return;
        drawStats.geometry += 1;
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
          surface.stageEl.style.width = stageW + 'px';
          surface.stageEl.style.height = stageH + 'px';
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
          const size = surface.scrollEl.clientWidth + 'x' + surface.scrollEl.clientHeight;
          if (size === previousSize) break;
          previousSize = size;
        }
        viewport.scrollX = clamp(surface.scrollEl.scrollLeft, 0, Math.max(0, viewport.stageWidth - viewport.width));
        viewport.scrollY = clamp(surface.scrollEl.scrollTop, 0, Math.max(0, viewport.stageHeight - viewport.height));
        if (surface.scrollEl.scrollLeft !== viewport.scrollX) surface.scrollEl.scrollLeft = viewport.scrollX;
        if (surface.scrollEl.scrollTop !== viewport.scrollY) surface.scrollEl.scrollTop = viewport.scrollY;
        viewport.offsetX = viewport.originX - viewport.scrollX;
        viewport.offsetY = viewport.originY - viewport.scrollY;
        syncedPageW = pageW;
        syncedPageH = pageH;
        updateZoomUI();
        positionCanvasStickers();
      }
    
      function scheduleRedraw(layers) {
        const list = layers && layers.length ? layers : ['content', 'overlay'];
        list.forEach(function (layer) {
          if (layer === 'bg') {
            dirty.bg = true;
          } else if (layer === 'content') {
            dirty.content = true;
            dirty.chrome = true;
            surface.overflowCache = null;
          } else if (layer === 'chrome') {
            dirty.chrome = true;
          } else if (layer === 'overlay') {
            dirty.overlay = true;
          } else if (layer === 'all') {
            dirty.bg = dirty.content = dirty.chrome = dirty.overlay = true;
            surface.overflowCache = null;
          }
        });
        if (dirty.bg || dirty.content) dirty.draft = true;
        requestRedrawFrame();
      }
    
      function requestGeometry() {
        geometryDirty = true;
        requestRedrawFrame();
      }
    
      function requestRedrawFrame() {
        if (!redrawRaf) redrawRaf = requestAnimationFrame(flushRedraw);
      }
    
      function flushRedraw() {
        redrawRaf = 0;
        const page = actions.currentPage();
        if (!page) return;
        const pageW = state.project.pageSize.width;
        const pageH = state.project.pageSize.height;
        if (pageW !== syncedPageW || pageH !== syncedPageH) geometryDirty = true;
        if (geometryDirty) {
          geometryDirty = false;
          syncGeometry();
          applyViewTransform();
          syncedPageW = pageW;
          syncedPageH = pageH;
        }
        if (syncSurface()) {
          dirty.bg = true;
          dirty.content = true;
        }
        if (dirty.bg || dirty.content) layout.beginFrame();
        drawStats.redraws += 1;
        if (dirty.bg) {
          dirty.bg = false;
          drawBackgroundLayer(page);
          drawStats.bg += 1;
        }
        if (dirty.content) {
          dirty.content = false;
          drawContentLayer(page);
          drawStats.content += 1;
        }
        if (dirty.chrome) {
          dirty.chrome = false;
          appCtx.chrome.drawChrome(page);
          drawStats.chrome += 1;
        }
        if (dirty.overlay) {
          dirty.overlay = false;
          appCtx.chrome.drawOverlayLayer(page);
          drawStats.overlay += 1;
        }
        if (dirty.draft) {
          dirty.draft = false;
          appCtx.draft.scheduleDraftSave();
        }
        appCtx.chrome.refreshHoverCursor();
      }
    
      function applyViewTransform() {
        if (!surface.viewEl) return;
        const pageW = Math.max(1, state.project.pageSize.width);
        const pageH = Math.max(1, state.project.pageSize.height);
        surface.viewEl.style.width = pageW + 'px';
        surface.viewEl.style.height = pageH + 'px';
        surface.viewEl.style.transformOrigin = '0 0';
        surface.viewEl.style.transform = 'translate(' + viewport.originX + 'px,' + viewport.originY + 'px) scale(' + viewport.scale + ')';
    
        sizeViewportCanvas(surface.overlay);
        sizeViewportCanvas(surface.overlayChrome);
      }
    
      function sizeViewportCanvas(canvas) {
        if (!canvas) return;
        const pixelWidth = Math.max(1, Math.round(viewport.width * viewport.dpr));
        const pixelHeight = Math.max(1, Math.round(viewport.height * viewport.dpr));
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
        if (canvas.style.width !== viewport.width + 'px' || canvas.style.height !== viewport.height + 'px') {
          canvas.style.width = viewport.width + 'px';
          canvas.style.height = viewport.height + 'px';
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
        scheduleRedraw(['all']);
      }
    
      function preparePageContext(ctx) {
        const pageW = Math.max(1, state.project.pageSize.width);
        const pageH = Math.max(1, state.project.pageSize.height);
        ctx.setTransform(ctx.canvas.width / pageW, 0, 0, ctx.canvas.height / pageH, 0, 0);
      }
    
      function drawBackgroundLayer(page) {
        if (!surface.bgCtx) return;
        const pageW = state.project.pageSize.width;
        const pageH = state.project.pageSize.height;
        preparePageContext(surface.bgCtx);
        surface.bgCtx.clearRect(0, 0, pageW, pageH);
        renderer.drawBackground(surface.bgCtx, state.project, page);
      }
    
      function drawContentLayer(page) {
        if (!surface.contentCtx) return;
        const pageW = state.project.pageSize.width;
        const pageH = state.project.pageSize.height;
        preparePageContext(surface.contentCtx);
        surface.contentCtx.clearRect(0, 0, pageW, pageH);
        renderer.drawPage(surface.contentCtx, state.project, page, {
          editMode: true,
          selectedId: state.selection.type === 'element' ? state.selection.id : null,
          includeBackground: false
        });
      }
    
      function fit() {
        viewport.mode = 'fit';
        if (surface.scrollEl) {
          surface.scrollEl.scrollLeft = 0;
          surface.scrollEl.scrollTop = 0;
        }
        syncGeometry();
        applyViewTransform();
        scheduleRedraw(['chrome', 'overlay']);
      }
    
      function updateZoomUI() {
        if (!surface.zoomInput) return;
        const percent = Math.round(viewport.scale * 100);
        if (document.activeElement !== surface.zoomInput) {
          surface.zoomInput.value = percent + '%';
        }
        if (surface.zoomOutBtn) {
          const disabled = percent <= Math.round(ZOOM_MIN * 100);
          surface.zoomOutBtn.disabled = disabled;
          surface.zoomOutBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        }
        if (surface.zoomInBtn) {
          const disabled = percent >= Math.round(ZOOM_MAX * 100);
          surface.zoomInBtn.disabled = disabled;
          surface.zoomInBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        }
      }
    
      function centerAnchor() {
        return { x: viewport.width / 2, y: viewport.height / 2 };
      }
    
      function zoomAround(nextScale, anchor) {
        if (!surface.scrollEl || !surface.stageEl) return;
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
        surface.scrollEl.scrollLeft = clamp(viewport.originX + pageX * viewport.scale - point.x, 0, maxX);
        surface.scrollEl.scrollTop = clamp(viewport.originY + pageY * viewport.scale - point.y, 0, maxY);
        syncGeometry();
        applyViewTransform();
        scheduleRedraw(['chrome', 'overlay']);
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
        if (!surface.scrollEl) return;
        viewport.scrollX = surface.scrollEl.scrollLeft;
        viewport.scrollY = surface.scrollEl.scrollTop;
        viewport.offsetX = viewport.originX - viewport.scrollX;
        viewport.offsetY = viewport.originY - viewport.scrollY;
      }
    
      function onCanvasScroll() {
        if (surface.scrollRaf) return;
        surface.scrollRaf = requestAnimationFrame(function () {
          surface.scrollRaf = 0;
          syncScrollOffsets();
          scheduleRedraw(['chrome', 'overlay']);
        });
      }
    
      function onCanvasWheel(event) {
        if (!surface.scrollEl) return;
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const rect = surface.overlay.getBoundingClientRect();
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
        surface.scrollEl.scrollLeft += dx;
        surface.scrollEl.scrollTop += dy;
      }
    
      function handleResize() {
        requestGeometry();
        scheduleRedraw(['chrome', 'overlay']);
      }

      return {
        surfaceRatio, syncSurface, setupSurface, toolbarChromeLeft, measureCanvas, effectiveScale, syncGeometry, scheduleRedraw, requestGeometry, requestRedrawFrame, flushRedraw, applyViewTransform, sizeViewportCanvas, pageScreenRect, toScreen, toPage, redraw, preparePageContext, drawBackgroundLayer, drawContentLayer, fit, updateZoomUI, centerAnchor, zoomAround, setZoomPercent, stepZoom, zoomIn, zoomOut, syncScrollOffsets, onCanvasScroll, onCanvasWheel, handleResize, stats: drawStats
      };
    }
  };
})();
