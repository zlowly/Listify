(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;
  const shape = L.shape;
  const clamp = model.clamp;
  const escapeHtml = ui.esc;

  L.appInteractions = {
    create: function (appCtx) {
      const state = appCtx.state;
      const viewport = appCtx.viewport;
      const surface = appCtx.surface;
      const actions = appCtx.actions;
      const categoryDropPosition = layout.categoryDropPosition;

      function selectedElementAt(page, x, y) {
        if (state.selection.type !== 'element') return null;
        const element = page.elements.find(function (item) { return item.id === state.selection.id; });
        if (!element) return null;
        const bounds = renderer.elementBounds(state.project, page, element);
        if (element.type === 'image' || element.type === 'shape') {
          const local = renderer.imageLocalPoint(element, x, y);
          if (element.type === 'shape') {
            return shape.shapeContains(element, local.x, local.y) ? { element: element, bounds: bounds } : null;
          }
          const visible = renderer.elementVisibleLocalRect(element);
          if (Math.abs(local.x - visible.x) > visible.width / 2 ||
              Math.abs(local.y - visible.y) > visible.height / 2) return null;
          return { element: element, bounds: bounds };
        }
        if (x < bounds.x || y < bounds.y || x > bounds.x + bounds.width || y > bounds.y + bounds.height) return null;
        return { element: element, bounds: bounds };
      }

      const snap = L.snap;
      const SNAP_INSET = 0.5;

      // 同一坐标只保留优先级最高的目标；目标按扫描顺序稳定保留。
      function addSnapTarget(list, item) {
        if (!item || !Number.isFinite(item.value)) return;
        for (let i = 0; i < list.length; i += 1) {
          if (Math.abs(list[i].value - item.value) <= 1e-6) {
            if (item.priority < list[i].priority) list[i] = item;
            return;
          }
        }
        list.push(item);
      }

      function tableSnapshot(element) {
        if (!element || element.type !== 'category') return [];
        const category = model.getCategory(state.project, element.category);
        const computed = layout.layoutCategory(category, element, { editMode: true });
        return (computed.tables || []).map(function (table, index) {
          const margins = table.margins || { top: 0, right: 0, bottom: 0, left: 0 };
          const left = element.x + table.x;
          const top = element.y + table.y;
          return {
            index: index,
            left: left,
            right: left + table.tableWidth,
            top: top,
            bottom: top + table.height,
            width: table.tableWidth,
            height: table.height,
            widths: (table.widths || []).slice(),
            margins: {
              top: Number(margins.top) || 0,
              right: Number(margins.right) || 0,
              bottom: Number(margins.bottom) || 0,
              left: Number(margins.left) || 0
            }
          };
        });
      }

      // 宽度与表格边距的简单反比关系在表格被最小宽度或 x 位置钳制后不再成立，
      // 这类退化的表格只参与移动和分隔线吸附，不参与改宽吸附。
      function tableWidthRelationValid(element, table, width) {
        const w = width == null ? element.width : width;
        const expected = w - table.margins.left - table.margins.right;
        return Math.abs(table.width - expected) <= SNAP_INSET;
      }

      function buildSnapContext(page, element, options) {
        const opts = options || {};
        const size = state.project.pageSize;
        const margins = state.project.margins;
        const pageRect = { x: 0, y: 0, width: size.width, height: size.height };
        const content = {
          left: margins.left,
          right: size.width - margins.right,
          top: margins.top,
          bottom: size.height - margins.bottom
        };
        const targets = { x: [], y: [], divider: [] };

        addSnapTarget(targets.x, {
          value: content.left, priority: snap.PRIORITY.page, role: 'page', side: 'left', span: pageRect
        });
        addSnapTarget(targets.x, {
          value: content.right, priority: snap.PRIORITY.page, role: 'page', side: 'right', span: pageRect
        });
        addSnapTarget(targets.x, {
          value: size.width / 2, priority: snap.PRIORITY.page, role: 'page', side: 'center', span: pageRect
        });
        addSnapTarget(targets.y, {
          value: content.top, priority: snap.PRIORITY.page, role: 'page', side: 'top', span: pageRect
        });
        addSnapTarget(targets.y, {
          value: content.bottom, priority: snap.PRIORITY.page, role: 'page', side: 'bottom', span: pageRect
        });
        addSnapTarget(targets.y, {
          value: size.height / 2, priority: snap.PRIORITY.page, role: 'page', side: 'center', span: pageRect
        });
        addSnapTarget(targets.divider, {
          value: content.left, priority: snap.PRIORITY.page, role: 'page', side: 'left', span: pageRect
        });
        addSnapTarget(targets.divider, {
          value: content.right, priority: snap.PRIORITY.page, role: 'page', side: 'right', span: pageRect
        });

        const draggedId = element ? element.id : null;
        page.elements.forEach(function (other) {
          if (!other || other.type !== 'category') return;
          const isDragged = other.id === draggedId;
          const bounds = renderer.elementBounds(state.project, page, other);
          const blockSpan = {
            x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height
          };
          if (!isDragged) {
            addSnapTarget(targets.x, {
              value: bounds.x, priority: snap.PRIORITY.block, role: 'block', side: 'left',
              elementId: other.id, span: blockSpan
            });
            addSnapTarget(targets.x, {
              value: bounds.x + bounds.width / 2, priority: snap.PRIORITY.block, role: 'block', side: 'center',
              elementId: other.id, span: blockSpan
            });
            addSnapTarget(targets.x, {
              value: bounds.x + bounds.width, priority: snap.PRIORITY.block, role: 'block', side: 'right',
              elementId: other.id, span: blockSpan
            });
            addSnapTarget(targets.y, {
              value: bounds.y, priority: snap.PRIORITY.block, role: 'block', side: 'top',
              elementId: other.id, span: blockSpan
            });
            addSnapTarget(targets.y, {
              value: bounds.y + bounds.height / 2, priority: snap.PRIORITY.block, role: 'block', side: 'center',
              elementId: other.id, span: blockSpan
            });
            addSnapTarget(targets.y, {
              value: bounds.y + bounds.height, priority: snap.PRIORITY.block, role: 'block', side: 'bottom',
              elementId: other.id, span: blockSpan
            });
          }

          tableSnapshot(other).forEach(function (table) {
            const tableSpan = {
              x: table.left, y: table.top, width: table.width, height: table.height
            };
            if (!isDragged) {
              if (Math.abs(table.left - bounds.x) > SNAP_INSET) {
                addSnapTarget(targets.x, {
                  value: table.left, priority: snap.PRIORITY.table, role: 'table', side: 'left',
                  elementId: other.id, tableIndex: table.index, span: tableSpan
                });
              }
              if (Math.abs(table.right - (bounds.x + bounds.width)) > SNAP_INSET) {
                addSnapTarget(targets.x, {
                  value: table.right, priority: snap.PRIORITY.table, role: 'table', side: 'right',
                  elementId: other.id, tableIndex: table.index, span: tableSpan
                });
              }
            }
            if (!(table.height > 0)) return;
            let dividerX = table.left;
            for (let col = 0; col < table.widths.length - 1; col += 1) {
              dividerX += table.widths[col];
              if (opts.divider &&
                  other.id === opts.divider.elementId &&
                  table.index === opts.divider.tableIndex &&
                  col === opts.divider.dividerIndex) continue;
              addSnapTarget(targets.divider, {
                value: dividerX, priority: snap.PRIORITY.divider, role: 'divider',
                elementId: other.id, tableIndex: table.index, dividerIndex: col,
                span: { x: dividerX, y: table.top, width: 0, height: table.height }
              });
            }
          });
        });

        return {
          pageRect: pageRect,
          threshold: snap.pageThreshold(viewport.scale),
          release: snap.RELEASE_SCREEN / viewport.scale,
          targets: targets,
          movingTables: element ? tableSnapshot(element) : [],
          bounds: opts.bounds || (element ? renderer.elementBounds(state.project, page, element) : null)
        };
      }

      function attachSnap(drag, page, element, options) {
        if (!element || element.type !== 'category') return;
        drag.snap = buildSnapContext(page, element, options);
        drag.snapHold = { x: null, y: null };
      }

      function chooseSnapAnchors(anchors, targets, context, hold, isValid) {
        let best = null;
        for (let i = 0; i < anchors.length; i += 1) {
          const anchor = anchors[i];
          const useHold = hold && hold.anchor && hold.anchor.id === anchor.id ? hold : null;
          const result = snap.choose({
            anchor: anchor,
            targets: targets,
            threshold: context.threshold,
            release: context.release,
            hold: useHold,
            isValid: isValid
          });
          if (!result) continue;
          if (useHold && result.target &&
              Math.abs(result.target.value - useHold.target.value) <= 1e-6) {
            return result;
          }
          if (!best) {
            best = result;
            continue;
          }
          const distance = Math.abs(result.target.value - result.anchor.value);
          const bestDistance = Math.abs(best.target.value - best.anchor.value);
          if (distance < bestDistance - 1e-9 ||
              (Math.abs(distance - bestDistance) <= 1e-9 &&
               result.target.priority < best.target.priority)) {
            best = result;
          }
        }
        return best;
      }

      // 参考线的跨度取被拖元素与目标的并集，并裁剪到页面。
      function makeSnapGuide(axis, result, movingRect, pageRect) {
        const target = result.target;
        const span = target.span || pageRect;
        let guide;
        if (axis === 'x') {
          const y1 = Math.max(pageRect.y, Math.min(movingRect.y, span.y));
          const y2 = Math.min(
            pageRect.y + pageRect.height,
            Math.max(movingRect.y + movingRect.height, span.y + span.height)
          );
          guide = {
            axis: 'x',
            value: target.value,
            span: { x: target.value, y: y1, width: 0, height: Math.max(0, y2 - y1) }
          };
        } else {
          const x1 = Math.max(pageRect.x, Math.min(movingRect.x, span.x));
          const x2 = Math.min(
            pageRect.x + pageRect.width,
            Math.max(movingRect.x + movingRect.width, span.x + span.width)
          );
          guide = {
            axis: 'y',
            value: target.value,
            span: { x: x1, y: target.value, width: Math.max(0, x2 - x1), height: 0 }
          };
        }
        if (axis === 'x' && result.anchor.kind === 'table' &&
            Number.isFinite(result.anchor.offsetY) && Number.isFinite(result.anchor.height)) {
          guide.marker = {
            x: target.value,
            y: movingRect.y + result.anchor.offsetY + result.anchor.height / 2,
            length: 6
          };
        }
        return guide;
      }

      function applyMoveSnap(drag, rawX, rawY) {
        const context = drag.snap;
        const start = drag.startBounds;
        let xResult = null;
        let yResult = null;
        if (!drag.altKey) {
          const xAnchors = [
            { id: 'block-left', value: rawX, kind: 'block', side: 'left' },
            { id: 'block-center', value: rawX + start.width / 2, kind: 'block', side: 'center' },
            { id: 'block-right', value: rawX + start.width, kind: 'block', side: 'right' }
          ];
          context.movingTables.forEach(function (table) {
            if (Math.abs(table.left - start.x) > SNAP_INSET) {
              xAnchors.push({
                id: 'table-' + table.index + '-left',
                value: table.left + (rawX - start.x),
                kind: 'table',
                side: 'left',
                tableIndex: table.index,
                offsetY: table.top - start.y,
                height: table.height
              });
            }
            if (Math.abs(table.right - (start.x + start.width)) > SNAP_INSET) {
              xAnchors.push({
                id: 'table-' + table.index + '-right',
                value: table.right + (rawX - start.x),
                kind: 'table',
                side: 'right',
                tableIndex: table.index,
                offsetY: table.top - start.y,
                height: table.height
              });
            }
          });
          const yAnchors = [
            { id: 'block-top', value: rawY, kind: 'block', side: 'top' },
            { id: 'block-middle', value: rawY + start.height / 2, kind: 'block', side: 'center' },
            { id: 'block-bottom', value: rawY + start.height, kind: 'block', side: 'bottom' }
          ];
          xResult = chooseSnapAnchors(xAnchors, context.targets.x, context, drag.snapHold.x);
          yResult = chooseSnapAnchors(yAnchors, context.targets.y, context, drag.snapHold.y);
        }
        drag.snapHold.x = xResult;
        drag.snapHold.y = yResult;

        const finalX = rawX + (xResult ? xResult.delta : 0);
        const finalY = rawY + (yResult ? yResult.delta : 0);
        surface.snapGuides = [];
        if (xResult) {
          surface.snapGuides.push(makeSnapGuide('x', xResult, {
            x: finalX, y: finalY, width: start.width, height: start.height
          }, context.pageRect));
        }
        if (yResult) {
          surface.snapGuides.push(makeSnapGuide('y', yResult, {
            x: finalX, y: finalY, width: start.width, height: start.height
          }, context.pageRect));
        }
        return { x: finalX, y: finalY };
      }

      function widthAnchors(drag, side, dx) {
        const element = drag.element;
        const start = drag.startBounds;
        const anchors = [];
        if (side === 'e') {
          anchors.push({
            id: 'block-right', value: start.x + start.width + dx, kind: 'block', side: 'right', margin: 0
          });
          drag.snap.movingTables.forEach(function (table) {
            if (Math.abs(table.right - (start.x + start.width)) <= SNAP_INSET) return;
            if (!tableWidthRelationValid(element, table, start.width)) return;
            anchors.push({
              id: 'table-' + table.index + '-right',
              value: table.right + dx,
              kind: 'table',
              side: 'right',
              tableIndex: table.index,
              margin: table.margins.right,
              offsetY: table.top - start.y,
              height: table.height
            });
          });
        } else {
          anchors.push({
            id: 'block-left', value: start.x + dx, kind: 'block', side: 'left', margin: 0
          });
          drag.snap.movingTables.forEach(function (table) {
            if (Math.abs(table.left - start.x) <= SNAP_INSET) return;
            if (!tableWidthRelationValid(element, table, start.width)) return;
            anchors.push({
              id: 'table-' + table.index + '-left',
              value: table.left + dx,
              kind: 'table',
              side: 'left',
              tableIndex: table.index,
              margin: table.margins.left,
              offsetY: table.top - start.y,
              height: table.height
            });
          });
        }
        return anchors;
      }

      function applyWidthSnap(drag, side, dx) {
        const context = drag.snap;
        const start = drag.startBounds;
        const pageWidth = state.project.pageSize.width;
        const anchors = widthAnchors(drag, side, dx);
        const isValid = function (anchor, target) {
          const kind = target.role === 'table' ? 'table' : 'block';
          const width = snap.widthFromEdge({
            side: side,
            kind: kind,
            target: target.value,
            elementX: start.x,
            elementRight: start.x + start.width,
            margin: Number(anchor.margin) || 0
          });
          return Number.isFinite(width) && width >= 80 && width <= pageWidth * 3;
        };
        const result = chooseSnapAnchors(anchors, context.targets.x, context, drag.snapHold.x, isValid);
        if (!result) {
          drag.snapHold.x = null;
          surface.snapGuides = [];
          return null;
        }
        const width = snap.widthFromEdge({
          side: side,
          kind: result.target.role === 'table' ? 'table' : 'block',
          target: result.target.value,
          elementX: start.x,
          elementRight: start.x + start.width,
          margin: Number(result.anchor.margin) || 0
        });
        if (!Number.isFinite(width)) {
          drag.snapHold.x = null;
          surface.snapGuides = [];
          return null;
        }
        drag.snapHold.x = result;
        const finalWidth = clamp(width, 80, pageWidth * 3);
        const finalX = side === 'e' ? start.x : start.x + start.width - finalWidth;
        surface.snapGuides = [makeSnapGuide('x', result, {
          x: finalX, y: start.y, width: finalWidth, height: start.height
        }, context.pageRect)];
        return { x: finalX, width: finalWidth };
      }

      function onSnapModifierChange(event) {
        const drag = surface.drag;
        if (!drag || !drag.snap) return;
        if (event.key !== 'Alt' && event.key !== 'Option') return;
        if (!!event.altKey === !!drag.altKey) return;
        if (drag.lastClientX == null || drag.lastClientY == null) return;
        onPointerMove({
          clientX: drag.lastClientX,
          clientY: drag.lastClientY,
          altKey: !!event.altKey,
          preventDefault: function () {}
        });
      }

      function bindSnapModifier() {
        window.addEventListener('keydown', onSnapModifierChange);
        window.addEventListener('keyup', onSnapModifierChange);
      }

      function unbindSnapModifier() {
        window.removeEventListener('keydown', onSnapModifierChange);
        window.removeEventListener('keyup', onSnapModifierChange);
      }
    
      function onPointerDown(event) {
        if (event.button !== 0) return;
        // 任何拖拽开始都终结微调会话，避免微调快照吞掉后续拖拽的撤销
        appCtx.nudgeSession.key = null;
        appCtx.nudgeSession.direction = null;
        const point = appCtx.chrome.overlayPoint(event);
        const page = actions.currentPage();
        if (!page) return;
        surface.snapGuides = [];
    
        const pageHandle = actions.editingBackground() ? null : appCtx.chrome.pageSizeHandleAt(point.x, point.y);
        if (pageHandle) {
          surface.drag = {
            type: 'page-size',
            startClientX: event.clientX,
            startClientY: event.clientY,
            startWidth: state.project.pageSize.width,
            startHeight: state.project.pageSize.height
          };
          actions.pushUndo('调整页面尺寸');
          beginPointer(event);
          return;
        }
    
        const handle = appCtx.chrome.handleAt(point.x, point.y);
        if (handle) {
          if (handle.type === 'rotate' || handle.type === 'rotate-background') {
            const isBackground = handle.type === 'rotate-background';
            const target = isBackground ? (handle.item || handle.image) : handle.element;
            if (isBackground && target.kind !== 'shape') actions.ensureCustomBackgroundImage(target);
            const pp = appCtx.viewport.toPage(point.x, point.y);
            const centerX = target.x + target.width / 2;
            const centerY = target.y + target.height / 2;
            surface.drag = {
              type: 'rotate',
              background: isBackground,
              element: isBackground ? null : handle.element,
              image: isBackground ? target : null,
              center: { x: centerX, y: centerY },
              startPointerX: pp.x,
              startPointerY: pp.y,
              startRotation: Number(target.rotation) || 0,
              startClientX: event.clientX,
              startClientY: event.clientY,
              liveAngle: Number(target.rotation) || 0
            };
            const label = isBackground
              ? (target.kind === 'shape' ? '旋转背景图形' : '旋转背景图片')
              : (handle.element.type === 'shape' ? '旋转图形' : '旋转图片');
            actions.pushUndo(label);
            beginPointer(event);
            return;
          }
          if (handle.type === 'resize-background') {
            const target = handle.item || handle.image;
            if (target.kind !== 'shape') actions.ensureCustomBackgroundImage(target);
            const bounds = actions.backgroundItemBounds
              ? actions.backgroundItemBounds(target)
              : actions.backgroundImageBounds(target);
            surface.drag = {
              type: 'resize',
              background: true,
              image: target,
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
            surface.drag = {
              type: 'resize',
              element: handle.element,
              handle: handle.handle,
              startClientX: event.clientX,
              startClientY: event.clientY,
              startBounds: handle.bounds
            };
          }
          if (surface.drag.element && surface.drag.element.type === 'category') {
            attachSnap(surface.drag, page, surface.drag.element, { bounds: surface.drag.startBounds });
          }
          actions.pushUndo(surface.drag.background ? '调整背景图片' : '调整元素大小');
          beginPointer(event);
          return;
        }
    
        const divider = appCtx.chrome.dividerAt(point.x, point.y);
        if (divider) {
          surface.drag = {
            type: 'divider',
            element: divider.element,
            tableIndex: divider.divider.tableIndex,
            dividerIndex: divider.divider.dividerIndex,
            startWidths: divider.divider.widths.slice(),
            startBoundary: divider.divider.x,
            dividerSpan: { y: divider.divider.y, height: divider.divider.height },
            startClientX: event.clientX,
            startClientY: event.clientY
          };
          attachSnap(surface.drag, page, divider.element, {
            divider: {
              elementId: divider.element.id,
              tableIndex: divider.divider.tableIndex,
              dividerIndex: divider.divider.dividerIndex
            }
          });
          actions.pushUndo('调整列宽');
          beginPointer(event);
          return;
        }
    
        const pt = appCtx.viewport.toPage(point.x, point.y);
    
        if (state.shapeTool && state.shapeTool.active && state.shapeTool.pageId === page.id) {
          const width = state.project.pageSize.width;
          const height = state.project.pageSize.height;
          if (pt.x >= 0 && pt.y >= 0 && pt.x <= width && pt.y <= height) {
            surface.drag = {
              type: 'shape-draw',
              pageId: page.id,
              target: state.shapeTool.target,
              startX: pt.x,
              startY: pt.y,
              currentX: pt.x,
              currentY: pt.y,
              startClientX: event.clientX,
              startClientY: event.clientY,
              moved: false
            };
            state.shapeTool.preview = { x: pt.x, y: pt.y, width: 0, height: 0 };
            beginPointer(event);
            return;
          }
        }
    
        // 选中者优先（内容元素）：指针在选中元素范围内时直接抓取，无视上层覆盖
        const selectedHit = selectedElementAt(page, pt.x, pt.y);
        if (selectedHit) {
          surface.drag = {
            type: 'move',
            element: selectedHit.element,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: selectedHit.element.x,
            startY: selectedHit.element.y,
            startBounds: selectedHit.bounds
          };
          attachSnap(surface.drag, page, selectedHit.element, { bounds: selectedHit.bounds });
          actions.pushUndo('移动元素');
          beginPointer(event);
          return;
        }
    
        // 选中者优先（背景条目）：选中具体条目时，其可见范围内优先于内容元素
        if (state.selection.type === 'backgroundItem' || state.selection.type === 'backgroundImage') {
          const selectionId = state.selection.itemId || state.selection.imageId;
          const backgroundPriority = renderer.hitTestBackground(state.project, page, pt.x, pt.y);
          if (backgroundPriority && backgroundPriority.item.id === selectionId) {
            if (backgroundPriority.item.kind !== 'shape') actions.ensureCustomBackgroundImage(backgroundPriority.item);
            surface.drag = {
              type: 'move-background',
              image: backgroundPriority.item,
              startClientX: event.clientX,
              startClientY: event.clientY,
              startX: backgroundPriority.item.x,
              startY: backgroundPriority.item.y
            };
            actions.pushUndo(backgroundPriority.item.kind === 'shape' ? '移动背景图形' : '移动背景图片');
            beginPointer(event);
            return;
          }
        }
    
        const hit = renderer.hitTest(state.project, page, pt.x, pt.y);
        if (hit) {
          if (state.selection.type !== 'element' || state.selection.id !== hit.element.id) {
            state.selection = { type: 'element', id: hit.element.id };
            ui.renderAll();
          }
          surface.drag = {
            type: 'move',
            element: hit.element,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: hit.element.x,
            startY: hit.element.y,
            startBounds: hit.bounds
          };
          attachSnap(surface.drag, page, hit.element, { bounds: hit.bounds });
          actions.pushUndo('移动元素');
          beginPointer(event);
          return;
        }
    
        if (actions.editingBackground()) {
          const backgroundHit = renderer.hitTestBackground(state.project, page, pt.x, pt.y);
          if (backgroundHit) {
            const item = backgroundHit.item;
            if (item.kind !== 'shape') actions.ensureCustomBackgroundImage(item);
            state.selection = {
              type: 'backgroundItem',
              itemId: item.id
            };
            ui.renderAll();
            surface.drag = {
              type: 'move-background',
              image: item,
              startClientX: event.clientX,
              startClientY: event.clientY,
              startX: item.x,
              startY: item.y
            };
            actions.pushUndo(item.kind === 'shape' ? '移动背景图形' : '移动背景图片');
            beginPointer(event);
            return;
          }
        }
    
        const margin = appCtx.chrome.marginAt(point.x, point.y);
        if (margin) {
          surface.drag = {
            type: 'margin',
            side: margin.side,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startValue: state.project.margins[margin.side]
          };
          actions.pushUndo('调整页边距');
          beginPointer(event);
          return;
        }
    
        actions.selectPage();
      }
    
      function beginPointer(event) {
        if (surface.drag) {
          surface.drag.lastClientX = event.clientX;
          surface.drag.lastClientY = event.clientY;
          surface.drag.altKey = !!event.altKey;
          if (surface.drag.snap && !surface.drag.snapHold) {
            surface.drag.snapHold = { x: null, y: null };
          }
          if (surface.drag.snap) bindSnapModifier();
        }
        surface.snapGuides = [];
        if (surface.overlay.setPointerCapture) surface.overlay.setPointerCapture(event.pointerId);
        renderer.setBlurCacheFrozen(true);
        event.preventDefault();
      }
    
      function onPointerMove(event) {
        if (!surface.drag) {
          const point = appCtx.chrome.overlayPoint(event);
          surface.hoverPoint = point;
          appCtx.chrome.requestCursor(point.x, point.y);
          return;
        }
        event.preventDefault();
        surface.drag.lastClientX = event.clientX;
        surface.drag.lastClientY = event.clientY;
        surface.drag.altKey = !!event.altKey;
        if (surface.drag.altKey) {
          if (surface.drag.snapHold) {
            surface.drag.snapHold.x = null;
            surface.drag.snapHold.y = null;
          }
          surface.snapGuides = [];
        }
        const dx = (event.clientX - surface.drag.startClientX) / viewport.scale;
        const dy = (event.clientY - surface.drag.startClientY) / viewport.scale;
    
        if (surface.drag.type === 'shape-draw') {
          const drag = surface.drag;
          const pp = appCtx.viewport.toPage(
            appCtx.chrome.overlayPoint(event).x,
            appCtx.chrome.overlayPoint(event).y
          );
          drag.currentX = pp.x;
          drag.currentY = pp.y;
          drag.moved = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 6;
          state.shapeTool.preview = {
            x: Math.min(drag.startX, pp.x),
            y: Math.min(drag.startY, pp.y),
            width: Math.abs(pp.x - drag.startX),
            height: Math.abs(pp.y - drag.startY)
          };
          appCtx.viewport.scheduleRedraw(['overlay']);
          return;
        }
    
        if (surface.drag.type === 'move-background') {
          surface.drag.image.x = Math.round(surface.drag.startX + dx);
          surface.drag.image.y = Math.round(surface.drag.startY + dy);
          appCtx.viewport.scheduleRedraw(['bg', 'overlay']);
          return;
        }
    
        if (surface.drag.type === 'move') {
          const drag = surface.drag;
          let x = drag.startX + dx;
          let y = drag.startY + dy;
          if (drag.snap) {
            const snapped = applyMoveSnap(drag, x, y);
            x = snapped.x;
            y = snapped.y;
          } else {
            surface.snapGuides = [];
          }
          drag.element.x = Math.round(x);
          drag.element.y = Math.round(y);
          appCtx.viewport.scheduleRedraw(['content', 'overlay']);
          return;
        }
    
        if (surface.drag.type === 'rotate') {
          const drag = surface.drag;
          const sp = appCtx.chrome.overlayPoint(event);
          const pp = appCtx.viewport.toPage(sp.x, sp.y);
          const delta = model.angleDeltaDeg(drag.center.x, drag.center.y,
            drag.startPointerX, drag.startPointerY, pp.x, pp.y);
          let newRotation = drag.startRotation + delta;
          if (!(event.ctrlKey || event.metaKey)) newRotation = model.snapAngle(newRotation, 15);
          const finalRotation = model.wrapAngle(newRotation, drag.background ? 360 : 180);
          if (drag.background) drag.image.rotation = finalRotation;
          else drag.element.rotation = finalRotation;
          drag.liveAngle = finalRotation;
          appCtx.viewport.scheduleRedraw(drag.background ? ['bg', 'overlay'] : ['content', 'overlay']);
          return;
        }
    
        if (surface.drag.type === 'resize') {
          resizeDrag(dx, dy);
          appCtx.viewport.scheduleRedraw(surface.drag.background ? ['bg', 'overlay'] : ['content', 'overlay']);
          return;
        }
    
        if (surface.drag.type === 'divider') {
          dividerDrag(dx);
          appCtx.viewport.scheduleRedraw(['content', 'overlay']);
          return;
        }
    
        if (surface.drag.type === 'page-size') {
          const width = clamp(surface.drag.startWidth + dx, 320, 5000);
          const height = clamp(surface.drag.startHeight + dy, 320, 5000);
          state.project.pageSize.width = Math.round(width);
          state.project.pageSize.height = Math.round(height);
          appCtx.viewport.requestGeometry();
          appCtx.viewport.scheduleRedraw(['bg', 'content', 'chrome', 'overlay']);
          return;
        }
    
        if (surface.drag.type === 'margin') {
          const max = Math.min(state.project.pageSize.width, state.project.pageSize.height) / 2;
          const horizontal = surface.drag.side === 'left' || surface.drag.side === 'right';
          let delta = horizontal ? dx : dy;
          if (surface.drag.side === 'right' || surface.drag.side === 'bottom') delta = -delta;
          state.project.margins[surface.drag.side] = Math.round(clamp(surface.drag.startValue + delta, 0, max));
          appCtx.viewport.scheduleRedraw(['chrome', 'overlay']);
        }
      }
    
      function frameFromVisible(item, visible) {
        if (!item || item.kind === 'shape') return visible;
        const img = item.assetId ? L.assets.getCachedImage(item.assetId) : null;
        if (!img) return visible;
        const natural = L.assets.imageSize(img);
        if (!(natural.width > 0) || !(natural.height > 0)) return visible;
        return model.frameRectFromVisible(visible, natural, item.crop);
      }

      function resizeDrag(dx, dy) {
        if (surface.drag.background) {
          const item = surface.drag.image;
          const start = surface.drag.startBounds;
          const isShape = item.kind === 'shape';
          const next = model.computeImageResize(
            { x: start.x, y: start.y, width: start.width, height: start.height, rotation: item.rotation },
            surface.drag.handle,
            { x: dx, y: dy },
            isShape ? false : item.keepRatio !== false,
            isShape ? 1 : undefined
          );
          const frame = frameFromVisible(item, next);
          item.x = Math.round(frame.x);
          item.y = Math.round(frame.y);
          item.width = Math.round(frame.width);
          item.height = Math.round(frame.height);
          if (isShape) shape.clampShape(item);
          return;
        }
        const element = surface.drag.element;
        const start = surface.drag.startBounds;
        const minWidth = element.type === 'text' ? 80 : 80;
        if (element.type === 'image' || element.type === 'shape') {
          const isShape = element.type === 'shape';
          const next = model.computeImageResize(
            { x: start.x, y: start.y, width: start.width, height: start.height, rotation: element.rotation },
            surface.drag.handle,
            { x: dx, y: dy },
            isShape ? false : element.keepRatio !== false,
            isShape ? 1 : undefined
          );
          const frame = isShape ? next : frameFromVisible(element, next);
          element.x = Math.round(frame.x);
          element.y = Math.round(frame.y);
          element.width = Math.round(frame.width);
          element.height = Math.round(frame.height);
          if (isShape) shape.clampShape(element);
          return;
        }
    
        const oldWidth = element.width;
        let width;
        let x = element.x;
        const snapped = element.type === 'category' && surface.drag.snap && !surface.drag.altKey
          ? applyWidthSnap(surface.drag, surface.drag.handle === 'e' ? 'e' : 'w', dx)
          : null;
        if (snapped) {
          x = snapped.x;
          width = snapped.width;
        } else if (surface.drag.handle === 'e') {
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
        const drag = surface.drag;
        const element = drag.element;
        const index = drag.dividerIndex;
        if (index < 0 || index + 1 >= drag.startWidths.length) return;
        if (drag.snap && !drag.altKey) {
          const rawBoundary = drag.startBoundary + dx;
          const result = chooseSnapAnchors(
            [{ id: 'divider', value: rawBoundary, kind: 'divider' }],
            drag.snap.targets.divider,
            drag.snap,
            drag.snapHold.x
          );
          if (result) {
            const snapped = snap.applyDividerDelta({
              widths: drag.startWidths,
              dividerIndex: index,
              // startWidths 对应拖动开始时的边界；结果要相对它计算，
              // 不能直接用相对当前原始边界的结果，否则 dx 会被抵消。
              delta: result.target.value - drag.startBoundary,
              minWidth: layout.MIN_COL_WIDTH
            });
            if (snapped) {
              drag.snapHold.x = result;
              layout.setManualWidths(element, drag.tableIndex, snapped);
              surface.snapGuides = [makeSnapGuide('x', result, {
                x: rawBoundary,
                y: drag.dividerSpan.y,
                width: 0,
                height: drag.dividerSpan.height
              }, drag.snap.pageRect)];
              return;
            }
          }
        }
        drag.snapHold.x = null;
        surface.snapGuides = [];
        const widths = drag.startWidths.slice();
        if (index < 0 || index + 1 >= widths.length) return;
        const left = widths[index] + dx;
        const right = widths[index + 1] - dx;
        if (left < layout.MIN_COL_WIDTH || right < layout.MIN_COL_WIDTH) return;
        widths[index] = left;
        widths[index + 1] = right;
        layout.setManualWidths(element, drag.tableIndex, widths);
      }
    
      function onPointerLeave() {
        surface.hoverPoint = null;
      }
    
      function createShapeFromDrag(drag) {
        const page = model.getPage(state.project, drag.pageId);
        if (!page) return;
        const pageSize = state.project.pageSize;
        let rect;
        if (!drag.moved) {
          const size = Math.min(240, pageSize.width, pageSize.height);
          rect = {
            x: clamp(drag.startX - size / 2, 0, Math.max(0, pageSize.width - size)),
            y: clamp(drag.startY - size / 2, 0, Math.max(0, pageSize.height - size)),
            width: size,
            height: size
          };
        } else {
          const current = {
            x: drag.currentX == null ? drag.startX : drag.currentX,
            y: drag.currentY == null ? drag.startY : drag.currentY
          };
          rect = {
            x: Math.min(drag.startX, current.x),
            y: Math.min(drag.startY, current.y),
            width: Math.max(1, Math.abs(current.x - drag.startX)),
            height: Math.max(1, Math.abs(current.y - drag.startY))
          };
        }
        if (drag.target === 'background' && !model.canEditPageBackground(state.project, page)) return;
        actions.pushUndo('添加图形');
        if (drag.target === 'background') {
          const item = shape.createBackgroundShape(
            Math.round(rect.x), Math.round(rect.y),
            Math.round(rect.width), Math.round(rect.height)
          );
          page.background.items.push(item);
          state.selection = { type: 'backgroundItem', itemId: item.id };
        } else {
          const element = shape.createShapeElement(
            Math.round(rect.x), Math.round(rect.y),
            Math.round(rect.width), Math.round(rect.height)
          );
          page.elements.push(element);
          state.selection = { type: 'element', id: element.id };
        }
        actions.exitShapeTool();
        ui.toast(drag.target === 'background' ? '已添加背景图形。' : '已添加图形。');
      }

      function onPointerUp(event) {
        if (!surface.drag) return;
        const finished = surface.drag;
        surface.drag = null;
        surface.snapGuides = [];
        unbindSnapModifier();
        renderer.setBlurCacheFrozen(false);
    
        if (finished.type === 'shape-draw') {
          createShapeFromDrag(finished);
          if (state.shapeTool) state.shapeTool.preview = null;
        }
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
        if (finished.type === 'rotate') {
          if (finished.background && finished.image) finished.image.rotation = Math.round(finished.image.rotation);
          if (finished.element) finished.element.rotation = Math.round(finished.element.rotation);
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
          if (finished.element.type === 'image' || finished.element.type === 'shape') {
            finished.element.height = Math.round(finished.element.height);
          }
        }
    
        if (surface.overlay.releasePointerCapture && event && event.pointerId != null) {
          try { surface.overlay.releasePointerCapture(event.pointerId); } catch (err) { /* ignore */ }
        }
        if (event) surface.hoverPoint = appCtx.chrome.overlayPoint(event);
        ui.renderAll();
        appCtx.chrome.refreshHoverCursor();
      }
    
      function onDoubleClick(event) {
        const point = appCtx.chrome.overlayPoint(event);
        const page = actions.currentPage();
        if (!page) return;
        const pt = appCtx.viewport.toPage(point.x, point.y);
        const hit = renderer.hitTest(state.project, page, pt.x, pt.y);
        if (!hit || hit.element.type !== 'text') return;
        event.preventDefault();
        state.selection = { type: 'element', id: hit.element.id };
        ui.renderAll();
        startInlineEditor(hit.element);
      }
    
      function startInlineEditor(element) {
        closeInlineEditor(false);
        const page = actions.currentPage();
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
          surface.inlineEditor = null;
          ui.renderAll();
        }
    
        textarea.addEventListener('keydown', function (event) {
          if (ui.isComposingEvent(event)) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            finish(false);
          } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            finish(true);
          }
        });
        textarea.addEventListener('blur', function () { finish(true); });
    
        surface.pane.appendChild(textarea);
        surface.inlineEditor = textarea;
        textarea.focus();
        textarea.select();
      }
    
      function closeInlineEditor(save) {
        if (!surface.inlineEditor) return;
        if (save) {
          const element = actions.selectedElement();
          if (element) element.text = surface.inlineEditor.value;
        }
        surface.inlineEditor.remove();
        surface.inlineEditor = null;
      }
    
      function onDragOver(event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      }
    
      function onDrop(event) {
        event.preventDefault();
        const page = actions.currentPage();
        if (!page) return;
    
        if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
          appCtx.importExport.handleImportFile(event.dataTransfer.files[0]);
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
          if (placed.page.id !== state.currentPageId) actions.switchPage(placed.page.id);
          state.selection = { type: 'element', id: placed.element.id };
          ui.renderAll();
          ui.toast('“' + name + '”已经放置，已为你选中。');
          return;
        }
    
        const point = appCtx.chrome.overlayPoint(event);
        const pt = appCtx.viewport.toPage(point.x, point.y);
        const width = Math.max(
          120,
          state.project.pageSize.width - state.project.margins.left - state.project.margins.right
        );
        const position = categoryDropPosition(page, state.project, pt.y);
        const element = model.createCategoryElement(name, position.x, position.y, state.project, width, page);
        page.elements.push(element);
        state.selection = { type: 'element', id: element.id };
        ui.renderAll();
      }

      return {
        selectedElementAt, onPointerDown, beginPointer, onPointerMove, resizeDrag, dividerDrag, onPointerLeave, onPointerUp, onDoubleClick, startInlineEditor, closeInlineEditor, onDragOver, categoryDropPosition, onDrop
      };
    }
  };
})();
