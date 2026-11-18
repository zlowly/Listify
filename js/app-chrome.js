(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;
  const clamp = model.clamp;
  const escapeHtml = ui.esc;

  L.appChrome = {
    create: function (appCtx) {
      const state = appCtx.state;
      const viewport = appCtx.viewport;
      const surface = appCtx.surface;
      const actions = appCtx.actions;

      let lastAppliedCursor = '';
      const rotatedCursorCache = new Map();
      const RESIZE_CURSOR_KEYWORDS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
      const CURSOR_STANDARD_STEP = 45;
      const CURSOR_SNAP_TOLERANCE = 0.5;
      const HANDLE_CURSOR_OFFSETS = {
        e: 0, w: 0,
        n: 90, s: 90,
        se: 45, nw: 45,
        ne: 135, sw: 135
      };
      const ROTATE_STEM_LENGTH = 24;   // 茎线长度（屏幕像素，与缩放无关）
      const ROTATE_HANDLE_HIT = 10;    // 旋转手柄命中半径（屏幕像素）
      function rotateCursorSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
          '<path d="M25 16 A9 9 0 1 1 16 7" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>' +
          '<path d="M25 16 A9 9 0 1 1 16 7" fill="none" stroke="#111827" stroke-width="1.5" stroke-linecap="round"/>' +
          '<path d="M11 2 L22 7 L11 12 Z" fill="#ffffff" stroke="#111827" stroke-width="1" stroke-linejoin="round"/></svg>';
      }
      const ROTATE_CURSOR = 'url("data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(rotateCursorSvg()) + '") 16 16, grab';

      function drawChrome(page) {
        if (!surface.overlayChromeCtx) return;
        const ctx = surface.overlayChromeCtx;
        ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.width, viewport.height);
        const rect = appCtx.viewport.pageScreenRect();
    
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
        if (!actions.editingBackground()) drawPageSizeHandle(ctx, rect);
      }
    
      function drawOverlayLayer(page) {
        if (!surface.overlayCtx) return;
        surface.overlayCtx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
        surface.overlayCtx.clearRect(0, 0, viewport.width, viewport.height);
        drawSelection(surface.overlayCtx, page);
        drawShapePreview(surface.overlayCtx);
      }

      function drawShapePreview(ctx) {
        const preview = state.shapeTool && state.shapeTool.preview;
        if (!preview) return;
        const x = viewport.offsetX + preview.x * viewport.scale;
        const y = viewport.offsetY + preview.y * viewport.scale;
        const width = preview.width * viewport.scale;
        const height = preview.height * viewport.scale;
        ctx.save();
        ctx.strokeStyle = '#2563eb';
        ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        if (width > 0 && height > 0) ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, Math.max(1, width), Math.max(1, height));
        ctx.setLineDash([]);
        ctx.restore();
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
    
      function cachedOverflow(page) {
        if (!surface.overflowCache) surface.overflowCache = renderer.pageOverflow(state.project, page);
        return surface.overflowCache;
      }
    
      function drawOverflow(ctx, page, rect) {
        const overflow = cachedOverflow(page);
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
    
      function normalizeCursorAngle(degrees) {
        let angle = Number(degrees);
        if (!Number.isFinite(angle)) angle = 0;
        angle = angle % 180;
        if (angle < 0) angle += 180;
        return angle;
      }
    
      function resizeCursorKeyword(angle) {
        const bucket = Math.round(angle / CURSOR_STANDARD_STEP) % RESIZE_CURSOR_KEYWORDS.length;
        return RESIZE_CURSOR_KEYWORDS[bucket];
      }
    
      function rotatedCursorSvg(angle) {
        // 32×32 是 Chrome/Edge 光标图上限；箭头画在中间约 20px 范围内。
        const path = 'M6 16 L11 11.5 L11 14.5 L21 14.5 L21 11.5 L26 16 ' +
          'L21 20.5 L21 17.5 L11 17.5 L11 20.5 Z';
        return '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
          '<g transform="rotate(' + angle + ' 16 16)">' +
          '<path d="' + path + '" fill="none" stroke="#ffffff" stroke-width="4" ' +
          'stroke-linejoin="round" stroke-linecap="round"/>' +
          '<path d="' + path + '" fill="#111827" stroke="#111827" stroke-width="1" ' +
          'stroke-linejoin="round" stroke-linecap="round"/>' +
          '</g></svg>';
      }
    
      function handleCursor(handleName, rotationDegrees) {
        const offset = HANDLE_CURSOR_OFFSETS[handleName] || 0;
        const angle = normalizeCursorAngle((Number(rotationDegrees) || 0) + offset);
        const snapped = Math.round(angle / CURSOR_STANDARD_STEP) * CURSOR_STANDARD_STEP;
        const gap = Math.abs(angle - snapped);
        if (Math.min(gap, 180 - gap) <= CURSOR_SNAP_TOLERANCE) return resizeCursorKeyword(angle);
    
        const key = Math.round(angle) % 180;
        let cursor = rotatedCursorCache.get(key);
        if (!cursor) {
          cursor = 'url("data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(rotatedCursorSvg(key)) + '") 16 16, ' + resizeCursorKeyword(key);
          rotatedCursorCache.set(key, cursor);
        }
        return cursor;
      }
    
      function imageHandlePoints(element) {
        const width = element.width;
        const height = element.height;
        const centerX = element.x + width / 2;
        const centerY = element.y + height / 2;
        const radians = model.rotationRadians(element);
        const degrees = radians * 180 / Math.PI;
        const defs = [
          { name: 'nw', sx: -1, sy: -1 },
          { name: 'n', sx: 0, sy: -1 },
          { name: 'ne', sx: 1, sy: -1 },
          { name: 'e', sx: 1, sy: 0 },
          { name: 'se', sx: 1, sy: 1 },
          { name: 's', sx: 0, sy: 1 },
          { name: 'sw', sx: -1, sy: 1 },
          { name: 'w', sx: -1, sy: 0 }
        ];
        return defs.map(function (def) {
          const offset = model.rotateVector(def.sx * width / 2, def.sy * height / 2, radians);
          const screen = screenFromPage(centerX + offset.x, centerY + offset.y);
          return { name: def.name, x: screen.x, y: screen.y, cursor: handleCursor(def.name, degrees) };
        });
      }
    
      // 旋转手柄：自选框顶边中点沿旋转后的法线向外伸出一段固定屏幕长度的茎线，末端为圆形手柄。
      function rotateHandlePoint(element) {
        const width = element.width;
        const height = element.height;
        if (!(width > 0) || !(height > 0)) return null;
        const centerX = element.x + width / 2;
        const centerY = element.y + height / 2;
        const radians = model.rotationRadians(element);
        const topMid = model.rotateVector(0, -height / 2, radians);
        const normal = model.rotateVector(0, -1, radians);
        const stemStart = screenFromPage(centerX + topMid.x, centerY + topMid.y);
        return {
          stemStart: stemStart,
          handle: {
            x: stemStart.x + normal.x * ROTATE_STEM_LENGTH,
            y: stemStart.y + normal.y * ROTATE_STEM_LENGTH
          }
        };
      }
    
      function drawRotateHandle(ctx, rp) {
        if (!rp) return;
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(rp.stemStart.x, rp.stemStart.y);
        ctx.lineTo(rp.handle.x, rp.handle.y);
        ctx.stroke();
        drawRoundHandle(ctx, rp.handle.x, rp.handle.y, 5, '#2563eb', '#ffffff');
      }
    
      function drawRotateBadge(ctx, rp, angle) {
        if (!rp) return;
        const text = Math.round(angle) + '°';
        ctx.save();
        ctx.font = '600 12px "Microsoft YaHei", "PingFang SC", sans-serif';
        const textWidth = ctx.measureText(text).width;
        const bw = textWidth + 14;
        const bh = 20;
        const bx = rp.handle.x - bw / 2;
        const by = rp.handle.y - 14 - bh;
        ctx.fillStyle = '#1d4ed8';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6);
        else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, rp.handle.x, by + bh / 2 + 0.5);
        ctx.restore();
      }
    
      function handlePoints(bounds, element) {
        if (element.type === 'image' || element.type === 'shape') return imageHandlePoints(element);
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
        const backgroundItem = actions.selectedBackgroundItem();
        if (backgroundItem) {
          drawBackgroundSelection(ctx, backgroundItem);
          return;
        }
        const element = actions.selectedElement();
        if (!element) return;
        const bounds = renderer.elementBounds(state.project, page, element);
    
        ctx.save();
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        if (element.type === 'image' || element.type === 'shape') {
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
        if (element.type === 'image' || element.type === 'shape') {
          const rp = rotateHandlePoint(element);
          drawRotateHandle(ctx, rp);
          if (surface.drag && surface.drag.type === 'rotate' && !surface.drag.background) {
            drawRotateBadge(ctx, rp, surface.drag.liveAngle || 0);
          }
        }
        ctx.restore();
    
        if (element.type === 'category') drawTableDividers(ctx, page, element);
      }
    
      function drawBackgroundSelection(ctx, item) {
        const bounds = actions.backgroundItemBounds(item);
        if (!(bounds.width > 0) || !(bounds.height > 0)) return;
        const box = {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          rotation: item.rotation
        };
        const corners = renderer.elementCorners(box);
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
        imageHandlePoints(box).forEach(function (handle) {
          drawSquareHandle(ctx, handle.x, handle.y, 8, '#2563eb', '#ffffff');
        });
        const rp = rotateHandlePoint(box);
        drawRotateHandle(ctx, rp);
        if (surface.drag && surface.drag.type === 'rotate' && surface.drag.background) {
          drawRotateBadge(ctx, rp, surface.drag.liveAngle || 0);
        }
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
          const active = surface.drag && surface.drag.type === 'divider' &&
            surface.drag.tableIndex === divider.tableIndex &&
            surface.drag.dividerIndex === divider.dividerIndex;
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
    
      function handleAt(screenX, screenY) {
        const backgroundItem = actions.selectedBackgroundItem();
        if (backgroundItem) {
          const bounds = actions.backgroundItemBounds(backgroundItem);
          const box = {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            rotation: backgroundItem.rotation
          };
          const rpBg = rotateHandlePoint(box);
          if (rpBg && Math.abs(screenX - rpBg.handle.x) <= ROTATE_HANDLE_HIT && Math.abs(screenY - rpBg.handle.y) <= ROTATE_HANDLE_HIT) {
            return { type: 'rotate-background', item: backgroundItem, image: backgroundItem, cursor: ROTATE_CURSOR };
          }
          for (const point of imageHandlePoints(box)) {
            if (Math.abs(screenX - point.x) <= 8 && Math.abs(screenY - point.y) <= 8) {
              return {
                type: 'resize-background',
                item: backgroundItem,
                image: backgroundItem,
                handle: point.name,
                cursor: point.cursor,
                bounds: bounds
              };
            }
          }
          return null;
        }
        const page = actions.currentPage();
        const element = actions.selectedElement();
        if (!page || !element) return null;
        if (element.type === 'image' || element.type === 'shape') {
          const rpEl = rotateHandlePoint(element);
          if (rpEl && Math.abs(screenX - rpEl.handle.x) <= ROTATE_HANDLE_HIT && Math.abs(screenY - rpEl.handle.y) <= ROTATE_HANDLE_HIT) {
            return { type: 'rotate', element: element, cursor: ROTATE_CURSOR };
          }
        }
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
        const page = actions.currentPage();
        const element = actions.selectedElement();
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
        const rect = appCtx.viewport.pageScreenRect();
        const x = rect.x + rect.width + 10;
        const y = rect.y + rect.height + 10;
        if (Math.abs(screenX - x) <= 10 && Math.abs(screenY - y) <= 10) {
          return { type: 'page-size' };
        }
        return null;
      }
    
      function marginAt(screenX, screenY) {
        const rect = appCtx.viewport.pageScreenRect();
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
          const page = actions.currentPage();
          if (page) {
            const pt = appCtx.viewport.toPage(screenX, screenY);
            if (renderer.hitTest(state.project, page, pt.x, pt.y)) cursor = 'move';
            else if (actions.editingBackground() && renderer.hitTestBackground(state.project, page, pt.x, pt.y)) {
              cursor = 'move';
            }
          }
        }
        if (cursor === 'default') {
          const margin = marginAt(screenX, screenY);
          if (margin) cursor = margin.side === 'left' || margin.side === 'right' ? 'ew-resize' : 'ns-resize';
        }
        if (cursor !== lastAppliedCursor) {
          lastAppliedCursor = cursor;
          surface.overlay.style.cursor = cursor;
        }
      }
    
      function refreshHoverCursor() {
        if (!surface.hoverPoint || surface.drag || surface.inlineEditor) return;
        updateCursor(surface.hoverPoint.x, surface.hoverPoint.y);
      }
    
      let overlayRect = null;
      let overlayRectVersion = -1;

      function overlayPoint(event) {
        const version = appCtx.viewport.stats.geometry;
        if (!overlayRect || overlayRectVersion !== version) {
          overlayRect = surface.overlay.getBoundingClientRect();
          overlayRectVersion = version;
        }
        return { x: event.clientX - overlayRect.left, y: event.clientY - overlayRect.top };
      }

      let cursorRaf = 0;
      let pendingCursor = null;

      function requestCursor(screenX, screenY) {
        pendingCursor = { x: screenX, y: screenY };
        if (cursorRaf) return;
        cursorRaf = requestAnimationFrame(function () {
          cursorRaf = 0;
          const point = pendingCursor;
          pendingCursor = null;
          if (point) updateCursor(point.x, point.y);
        });
      }

      return {
        drawChrome, drawOverlayLayer, drawMarginGuides, marginHandlePoints, cachedOverflow, drawOverflow, drawRoundHandle, drawSquareHandle, screenFromPage, normalizeCursorAngle, resizeCursorKeyword, rotatedCursorSvg, handleCursor, imageHandlePoints, handlePoints, drawSelection, drawBackgroundSelection, drawTableDividers, drawPageSizeHandle, handleAt, dividerAt, pageSizeHandleAt, marginAt, updateCursor, requestCursor, refreshHoverCursor, overlayPoint
      };
    }
  };
})();
