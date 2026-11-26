(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const ui = L.ui = L.ui || {};

  /* 字段工厂与分组折叠辅助来自 ui-fields.js（先加载） */
  const esc = ui.esc;
  const ctrlStepNumber = ui.ctrlStepNumber;
  const setGroupCollapsed = ui.setGroupCollapsed;
  const normalizeAngle = ui.normalizeAngle;
  /* 选择器与属性面板来自 ui-pickers.js / ui-property-panel.js（先加载） */
  const fitLabel = ui.fitLabel;

  ui.activePanel = 'categories';
  ui.els = {};
  ui.initialized = false;
  /* 图层拖拽状态：{ kind: 'element' | 'bgItem', id }，拖拽结束即清空 */
  let layerDrag = null;
  /* 分组折叠状态：<selectionKey>::<groupKey> → 是否收起，仅本页会话内记忆 */
  ui.groupCollapse = Object.create(null);

  /* 输入法组合状态：compositionstart/end 显式记录，与事件自身的组合标记共同判定。
     这是全库唯一的组合判定实现，新增文本输入必须复用它。 */
  let composing = false;
  document.addEventListener('compositionstart', function () {
    composing = true;
  }, true);
  document.addEventListener('compositionend', function () {
    /* 个别浏览器在 compositionend 之后仍会补发一次 keydown，延到微任务再清标志 */
    queueMicrotask(function () { composing = false; });
  }, true);
  ui.isComposingEvent = function (event) {
    return !!(event && (event.isComposing || event.keyCode === 229 || composing));
  };

  function initToolbarTips() {
    const toolbar = document.getElementById('canvas-toolbar');
    if (!toolbar) return;
    const tip = document.createElement('div');
    tip.className = 'canvas-tip';
    tip.id = 'canvas-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);

    let showTimer = null;
    let current = null;

    function place(el) {
      const rect = el.getBoundingClientRect();
      tip.style.left = (rect.right + 10) + 'px';
      tip.style.top = (rect.top + rect.height / 2) + 'px';
    }
    function show(el) {
      const label = el.getAttribute('aria-label');
      if (!label) return;
      current = el;
      tip.textContent = label;
      el.setAttribute('aria-describedby', tip.id);
      place(el);
      tip.hidden = false;
      requestAnimationFrame(function () { tip.classList.add('show'); });
    }
    function hide() {
      clearTimeout(showTimer);
      showTimer = null;
      current = null;
      tip.classList.remove('show');
      tip.hidden = true;
    }
    function onEnter(event) {
      const el = event.target.closest && event.target.closest('button[aria-label]');
      if (!el || el === current) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(function () { show(el); }, 150);
    }
    function onLeave(event) {
      const to = event.relatedTarget;
      if (to && to.closest && to.closest('button[aria-label]') === current) return;
      hide();
    }
    toolbar.addEventListener('mouseover', onEnter);
    toolbar.addEventListener('mouseout', onLeave);
    toolbar.addEventListener('focusin', function (event) {
      const el = event.target.closest && event.target.closest('button[aria-label]');
      if (el) show(el);
    });
    toolbar.addEventListener('focusout', function (event) {
      const to = event.relatedTarget;
      if (to && to.closest && to.closest('button[aria-label]')) return;
      hide();
    });
  }

  /* 属性面板共享浮动提示：全局单例 + 事件委托，面板重渲染前隐藏 */
  const propTip = {
    el: null,
    current: null,
    ensure: function () {
      if (this.el) return this.el;
      const el = document.createElement('div');
      el.className = 'prop-tip pos-below';
      el.id = 'prop-tip';
      el.setAttribute('role', 'tooltip');
      el.hidden = true;
      document.body.appendChild(el);
      this.el = el;
      return el;
    },
    show: function (el) {
      const tip = this.ensure();
      const text = el.getAttribute('data-tip');
      if (!text) return;
      this.current = el;
      tip.textContent = text;
      el.setAttribute('aria-describedby', tip.id);
      tip.hidden = false;
      this.place(el);
      requestAnimationFrame(function () { tip.classList.add('show'); });
    },
    place: function (el) {
      const tip = this.el;
      const rect = el.getBoundingClientRect();
      const tipWidth = tip.offsetWidth;
      const tipHeight = tip.offsetHeight;
      const pad = 8;
      let left = rect.right - tipWidth;
      let top = rect.bottom + pad;
      let below = true;
      if (top + tipHeight > window.innerHeight - pad) {
        top = rect.top - pad - tipHeight;
        below = false;
      }
      if (top < pad) top = pad;
      if (left + tipWidth > window.innerWidth - pad) left = window.innerWidth - pad - tipWidth;
      if (left < pad) left = pad;
      tip.classList.toggle('pos-below', below);
      tip.classList.toggle('pos-above', !below);
      let arrowX = rect.left + rect.width / 2 - left;
      if (arrowX < 12) arrowX = 12;
      if (arrowX > tipWidth - 12) arrowX = tipWidth - 12;
      tip.style.setProperty('--arrow-x', arrowX + 'px');
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    },
    hide: function () {
      if (!this.el) return;
      this.current = null;
      this.el.classList.remove('show');
      this.el.hidden = true;
    }
  };

  ui.propTip = propTip;

  function initPropTips() {
    propTip.ensure();
    [ui.els.propertyPanel, ui.els.modalRoot, ui.els.categoryToolbar].forEach(function (root) {
      if (!root) return;
      root.addEventListener('mouseover', function (event) {
        const el = event.target.closest && event.target.closest('.help-tip');
        if (!el || el === propTip.current) return;
        propTip.show(el);
      });
      root.addEventListener('mouseout', function (event) {
        const el = event.target.closest && event.target.closest('.help-tip');
        if (!el || propTip.current !== el) return;
        const to = event.relatedTarget;
        if (to && to.closest && to.closest('.help-tip') === el) return;
        propTip.hide();
      });
      root.addEventListener('focusin', function (event) {
        const el = event.target.closest && event.target.closest('.help-tip');
        if (el) propTip.show(el);
      });
      root.addEventListener('focusout', function (event) {
        const el = event.target.closest && event.target.closest('.help-tip');
        if (!el || propTip.current !== el) return;
        const to = event.relatedTarget;
        if (to && to.closest && to.closest('.help-tip')) return;
        propTip.hide();
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (propTip.el && !propTip.el.hidden) propTip.hide();
    });
  }

  ui.init = function () {
    if (ui.initialized) return;
    ui.initialized = true;
    ui.els.pageTabs = document.getElementById('page-tabs');
    ui.els.categoryToolbar = document.getElementById('category-toolbar');
    ui.els.categoryPanel = document.getElementById('category-panel');
    ui.els.layerPanel = document.getElementById('layer-panel');
    ui.els.propertyPanel = document.getElementById('property-panel');
    /* 事件委托挂在面板上，跨属性面板重渲染存活 */
    ui.els.propertyPanel.addEventListener('keydown', function (event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      const target = event.target;
      if (!target || !target.matches || !target.matches('input[type=number][data-ctrl-step]')) return;
      event.preventDefault();
      ctrlStepNumber(target, event.key === 'ArrowUp' ? 1 : -1);
    });
    /* 分组折叠：原生 details/summary 承担键盘与展开状态，这里只把状态写回按对象的记忆表；
       summary 内的帮助图标等交互控件不触发切换 */
    ui.els.propertyPanel.addEventListener('click', function (event) {
      const control = event.target.closest && event.target.closest('summary .help-tip, summary .btn, summary a');
      if (control) event.preventDefault();
    });
    ui.els.propertyPanel.addEventListener('toggle', function (event) {
      const section = event.target;
      if (!section || !section.classList || !section.classList.contains('prop-group')) return;
      const groupKey = section.getAttribute('data-group');
      if (!groupKey) return;
      setGroupCollapsed(groupKey, !section.open);
    }, true);
    ui.els.selectionLabel = document.getElementById('selection-label');
    ui.els.emptyHint = document.getElementById('empty-hint');
    ui.els.modalRoot = document.getElementById('modal-root');
    ui.els.toastRoot = document.getElementById('toast-root');

    document.getElementById('btn-import').addEventListener('click', function () {
      L.app.openImport();
    });
    document.getElementById('btn-export-playlist').addEventListener('click', function () {
      L.app.exportPlaylist();
    });
    document.getElementById('btn-edit-playlist').addEventListener('click', function () {
      L.app.openPlaylistEditor();
    });
    document.getElementById('btn-add-text').addEventListener('click', function () {
      L.app.insertText();
    });
    document.getElementById('btn-add-image').addEventListener('click', function () {
      L.app.insertImage();
    });
    initImageSourceMenu();
    const addShapeButton = document.getElementById('btn-add-shape');
    if (addShapeButton) {
      addShapeButton.addEventListener('click', function () {
        L.app.toggleShapeTool();
      });
    }
    document.getElementById('btn-new').addEventListener('click', function () {
      L.app.newProject();
    });
    document.getElementById('btn-save').addEventListener('click', function () {
      L.app.exportProject();
    });
    document.getElementById('btn-load').addEventListener('click', function () {
      L.app.openImportProject();
    });
    document.getElementById('btn-export').addEventListener('click', function () {
      L.exporter.openDialog();
    });
    document.getElementById('btn-add-page').addEventListener('click', function () {
      L.app.addPageDialog();
    });
    document.getElementById('btn-delete-page').addEventListener('click', function () {
      L.app.deleteCurrentPage();
    });

    const zoomInput = document.getElementById('zoom-input');
    let zoomCancelled = false;
    function commitZoomInput() {
      const raw = String(zoomInput.value).replace(/[%\s]/g, '');
      const value = Number(raw);
      if (raw === '' || !Number.isFinite(value)) {
        zoomInput.value = L.app.getZoomPercent() + '%';
        return;
      }
      L.app.setZoomPercent(value);
      zoomInput.value = L.app.getZoomPercent() + '%';
    }
    zoomInput.addEventListener('focus', function () {
      zoomInput.select();
    });
    zoomInput.addEventListener('keydown', function (event) {
      if (ui.isComposingEvent(event)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        commitZoomInput();
        zoomInput.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        zoomCancelled = true;
        zoomInput.value = L.app.getZoomPercent() + '%';
        zoomInput.blur();
      }
    });
    zoomInput.addEventListener('blur', function () {
      if (zoomCancelled) {
        zoomCancelled = false;
        return;
      }
      commitZoomInput();
    });
    document.getElementById('btn-zoom-out').addEventListener('click', function () {
      L.app.zoomOut();
    });
    document.getElementById('btn-zoom-in').addEventListener('click', function () {
      L.app.zoomIn();
    });
    document.getElementById('btn-zoom-fit').addEventListener('click', function () {
      L.app.zoomFit();
    });

    document.querySelectorAll('.sidebar-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        ui.setPanel(tab.getAttribute('data-panel'));
      });
    });

    document.getElementById('import-file').addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) L.app.handleImportFile(file);
    });
    document.getElementById('load-file').addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) L.app.handleImportProject(file);
    });
    document.getElementById('bg-file').addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) L.app.handleBackgroundFile(file);
    });
    document.getElementById('free-image-file').addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (file) L.app.handleFreeImageFile(file);
    });

    ui.els.categoryPanel.addEventListener('dragover', function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    ui.els.categoryPanel.addEventListener('drop', function (event) {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length) {
        event.preventDefault();
        L.app.handleImportFile(files[0]);
      }
    });

    window.addEventListener('resize', function () {
      L.app.handleResize();
    });

    document.addEventListener('keydown', function (event) {
      const tag = (event.target && event.target.tagName || '').toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (editing) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (L.app.undo) L.app.undo();
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        if (L.app.nudgeSelection(dx, dy)) event.preventDefault();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selection = L.app.state.selection;
        if (selection.type === 'element' ||
          selection.type === 'backgroundItem' ||
          selection.type === 'backgroundImage') {
          event.preventDefault();
          L.app.deleteSelection();
        }
      }
      if (event.key === 'Escape') {
        L.app.selectPage();
      }
    });

    initToolbarTips();
    initPropTips();
  };

  /* ---------- 添加图片来源分裂按钮 ---------- */
  // 来源记忆仅存内存：内容层/背景层各一份，默认本地文件；不写入项目或本地存储。
  const imageSourceMemory = { content: 'local', background: 'local' };
  const IMAGE_SOURCE_NAMES = { local: '本地文件', paste: '粘贴剪贴板', preset: '预设图库' };

  function currentImageLayer() {
    if (!L.app || !L.app.insertTargetInfo) return 'content';
    const resolved = L.app.insertTargetInfo();
    return resolved && resolved.target === 'background' ? 'background' : 'content';
  }

  // 主按钮 aria-label：落点（内容/背景）+ 当前默认来源。
  function imageSourceLabel(isBackground) {
    const source = imageSourceMemory[isBackground ? 'background' : 'content'];
    if (isBackground) return '添加背景图片（来源：' + IMAGE_SOURCE_NAMES[source] + '）';
    return '添加图片（来源：' + IMAGE_SOURCE_NAMES[source] + '，也可 Ctrl+V 粘贴）';
  }

  function initImageSourceMenu() {
    const split = document.querySelector('.tool-split[data-split="image"]');
    if (!split) return;
    const caret = document.getElementById('btn-add-image-more');
    const menu = split.querySelector('.tool-flyout');
    if (!caret || !menu) return;

    function syncChecked() {
      const layer = currentImageLayer();
      menu.querySelectorAll('.menu-item').forEach(function (item) {
        item.setAttribute('aria-checked', item.dataset.source === imageSourceMemory[layer] ? 'true' : 'false');
      });
    }

    function openMenu() {
      syncChecked();
      menu.hidden = false;
      caret.setAttribute('aria-expanded', 'true');
      const checked = menu.querySelector('.menu-item[aria-checked="true"]') || menu.querySelector('.menu-item');
      if (checked) checked.focus();
      setTimeout(function () { document.addEventListener('pointerdown', onOutside); }, 0);
    }

    function closeMenu(refocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      caret.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onOutside);
      if (refocus) caret.focus();
    }

    function onOutside(event) {
      if (!split.contains(event.target)) closeMenu(false);
    }

    // 菜单项是原生 button：Enter/空格由浏览器产生 click，无需在此重复处理。
    function choose(source) {
      if (!IMAGE_SOURCE_NAMES[source]) return;
      imageSourceMemory[currentImageLayer()] = source;
      closeMenu(true);
      if (L.app) {
        L.app.updateInsertButtons();
        L.app.insertImage(source);
      }
    }

    caret.addEventListener('click', function () {
      if (menu.hidden) openMenu();
      else closeMenu(true);
    });
    caret.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' && menu.hidden) {
        event.preventDefault();
        openMenu();
      }
    });
    menu.addEventListener('keydown', function (event) {
      const items = Array.prototype.slice.call(menu.querySelectorAll('.menu-item'));
      const index = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(index + 1) % items.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        closeMenu(true);
      } else if (event.key === 'Tab') {
        closeMenu(false);
      }
    });
    menu.addEventListener('click', function (event) {
      const item = event.target.closest('.menu-item');
      if (item) choose(item.dataset.source);
    });
  }

  ui.imageSourceLabel = imageSourceLabel;
  ui.currentImageSource = function (layer) {
    return imageSourceMemory[layer === 'background' ? 'background' : 'content'];
  };

  ui.setPanel = function (panel) {
    ui.activePanel = panel;
    document.querySelectorAll('.sidebar-tab').forEach(function (tab) {
      const active = tab.getAttribute('data-panel') === panel;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    ui.els.categoryToolbar.hidden = panel !== 'categories';
    ui.els.categoryPanel.hidden = panel !== 'categories';
    ui.els.layerPanel.hidden = panel !== 'layers';
  };

  ui.renderAll = function () {
    ui.renderPageTabs();
    ui.renderCategoryPanel();
    ui.renderLayerPanel();
    ui.renderPropertyPanel();
    ui.updateSelectionLabel();
    ui.updateEmptyHint();
    if (L.app) {
      L.app.updateInsertButtons();
      L.app.redraw();
    }
  };

  ui.renderPageTabs = function () {
    const project = L.app.state.project;
    const current = L.app.state.currentPageId;
    ui.els.pageTabs.innerHTML = project.pages.map(function (page, index) {
      const active = page.id === current;
      const isGlobal = project.globalBackgroundPageId === page.id;
      return '<button class="page-tab' + (active ? ' active' : '') + (isGlobal ? ' global-source' : '') + '"' +
        (active ? ' aria-current="page"' : '') + ' aria-label="第 ' + (index + 1) + ' 页' +
        (isGlobal ? '，全局背景来源' : '') + '" data-page-id="' +
        esc(page.id) + '">' + (index + 1) + (isGlobal ? '<span class="page-tab-dot" aria-hidden="true"></span>' : '') + '</button>';
    }).join('');
    ui.els.pageTabs.querySelectorAll('.page-tab').forEach(function (button) {
      button.addEventListener('click', function () {
        L.app.switchPage(button.getAttribute('data-page-id'));
      });
    });
  };

  ui.renderCategoryPanel = function () {
    const project = L.app.state.project;
    const categories = project.playlist.categories;
    if (!categories.length) {
      ui.els.categoryPanel.innerHTML = '<div class="panel-empty">还没有歌单。<br>点击上方“导入歌单”，或把 .txt 文件拖到这里。</div>';
      return;
    }
    ui.els.categoryPanel.innerHTML = categories.map(function (category) {
      const placed = model.getPlacedBlock(project, category.name);
      const pageIndex = placed ? project.pages.indexOf(placed.page) : -1;
      const rowHint = placed
        ? '已放在第 ' + (pageIndex + 1) + ' 页，回车或点击跳转'
        : '未放置，回车或点击放到当前页';
      return '<button type="button" class="category-row ' + (placed ? 'placed' : 'unplaced') + '" draggable="true" aria-label="' +
        esc('分类 ' + category.name + '，' + category.songs.length + ' 首，' + rowHint) + '" data-category="' +
        esc(category.name) + '">' +
        '<span class="category-name" title="' + esc(category.name) + '">' + esc(category.name) + '</span>' +
        '<span class="category-meta">' + category.songs.length + ' 首</span>' +
        '<span class="pill ' + (placed ? 'pill-green' : 'pill-gray') + '">' +
        (placed ? '第 ' + (pageIndex + 1) + ' 页' : '未放置') + '</span>' +
        '</button>';
    }).join('');

    ui.els.categoryPanel.querySelectorAll('.category-row').forEach(function (row) {
      const name = row.getAttribute('data-category');
      const activate = function () {
        const placed = model.getPlacedBlock(project, name);
        if (placed) {
          L.app.jumpToCategory(name);
        } else {
          L.app.placeCategory(name);
        }
      };
      row.addEventListener('click', activate);
      row.addEventListener('dragstart', function (event) {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-listify-category', name);
        event.dataTransfer.setData('text/plain', name);
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('dragging');
      });
    });
  };

  /* 清除面板内所有插入线指示类（每次落点变化只保留目标行一个） */
  function clearLayerDropCues() {
    if (!ui.els.layerPanel) return;
    ui.els.layerPanel.querySelectorAll('.drop-before, .drop-after').forEach(function (row) {
      row.classList.remove('drop-before', 'drop-after');
    });
  }

  /* 清空拖拽载荷、拖拽中原行与所有插入线 */
  function clearLayerDragState() {
    layerDrag = null;
    if (!ui.els.layerPanel) return;
    ui.els.layerPanel.querySelectorAll('.dragging').forEach(function (row) {
      row.classList.remove('dragging');
    });
    clearLayerDropCues();
  }

  /* 合法落点返回目标图层 id：同列表、非自身；背景集行与跨列表一律不是落点 */
  function layerDropTargetId(row, drag) {
    if (!drag) return null;
    const kind = row.getAttribute('data-layer-kind');
    if (kind !== drag.kind) return null;
    if (kind === 'element') {
      const id = row.getAttribute('data-layer-id');
      return id && id !== drag.id ? id : null;
    }
    if (kind === 'bgItem') {
      const id = row.getAttribute('data-bg-item');
      return id && id !== drag.id ? id : null;
    }
    return null;
  }

  /* ---------- 图层行身份标识 ---------- */

  // 内容层：按模型顺序为图片编号（模型下标 0 在最底层，故编号自底向顶递增）。
  function elementImageNumbers(elements) {
    const numbers = new Map();
    let count = 0;
    elements.forEach(function (element) {
      if (element.type !== 'image') return;
      count += 1;
      numbers.set(element.id, count);
    });
    return numbers;
  }

  // 背景层：与内容层同一方向编号，只数图片，图形不占号。
  function backgroundImageNumbers(items) {
    const numbers = new Map();
    let count = 0;
    items.forEach(function (item) {
      if (item.kind === 'shape') return;
      count += 1;
      numbers.set(item.id, count);
    });
    return numbers;
  }

  // 缩略图直接复用资产已有的对象 URL；取不到时返回空串，由调用方回退到通用图标。
  // 色相非零时附带 filter（与画布同一套归一化与格式）；其余效果不烘焙。
  function layerThumb(assetId, item) {
    const url = assetId ? L.assets.getUrl(assetId) : '';
    if (!url) return '';
    const filter = L.render.hueFilter(item);
    return '<img class="layer-thumb" src="' + esc(url) + '" alt="" draggable="false"' +
      (filter ? ' style="filter:' + esc(filter) + '"' : '') + '>';
  }

  // 迷你图形只表达形状、填充方式与颜色；不透明度收敛到可辨认下限。
  function layerShapeMark(item) {
    const kind = item.shape === 'diamond' ? 'diamond' : 'rect';
    const mode = item.mode === 'stroke' ? 'stroke' : 'fill';
    const color = typeof item.color === 'string' && item.color ? item.color : '#333333';
    const opacity = Number(item.opacity);
    const alpha = Number.isFinite(opacity) ? Math.min(1, Math.max(0.35, opacity)) : 1;
    return '<span class="layer-shape is-' + kind + ' is-' + mode + '" style="--shape-color:' +
      esc(color) + ';opacity:' + alpha + '"></span>';
  }

  ui.renderLayerPanel = function () {
    const project = L.app.state.project;
    const page = L.app.currentPage();
    const selection = L.app.state.selection;
    if (!page) return;
    const rows = [];
    // 常驻「内容层」分组头行：与背景行对称的落点指示，空内容层时仍显示。
    const contentLayerSelected = selection.type === 'content-layer';
    rows.push('<div class="layer-row layer-content-header-row' + (contentLayerSelected ? ' selected' : '') +
      '" data-layer-kind="contentLayer">' +
      '<button type="button" class="layer-row-main" aria-label="内容层，点击后插入操作落到内容层">' +
      '<span class="layer-icon" aria-hidden="true">▤</span>' +
      '<span class="layer-name">内容层' +
        (page.elements.length ? '' : '<span class="layer-sub"> 空</span>') + '</span>' +
      '<span class="pill">顶层</span>' +
      '</button>' +
      '</div>');
    const imageNumbers = elementImageNumbers(page.elements);
    const elements = page.elements.slice().reverse();
    elements.forEach(function (element, reverseIndex) {
      const realIndex = page.elements.length - 1 - reverseIndex;
      const selected = selection.type === 'element' && selection.id === element.id;
      const imageNumber = imageNumbers.get(element.id) || 0;
      let icon = '▤';
      let name = '元素';
      let sub = '';
      let cropTitle = '';
      if (element.type === 'category') {
        icon = '▤';
        name = '分类 · ' + element.category;
        const category = model.getCategory(project, element.category);
        sub = (category ? category.songs.length : 0) + ' 首';
      } else if (element.type === 'text') {
        icon = 'T';
        name = '文字 · ' + (element.text || '空文字').slice(0, 16);
        sub = '自由文字';
      } else if (element.type === 'image') {
        icon = layerThumb(element.assetId, element) || '▧';
        name = '图片';
        sub = element.rotation ? '旋转 ' + normalizeAngle(element.rotation) + '°' : '自由图片';
        if (model.hasCrop(element)) {
          const crop = model.cropValues(element);
          sub += ' · 已裁剪';
          cropTitle = '已裁剪：上' + crop.top + ' 右' + crop.right + ' 下' + crop.bottom + ' 左' + crop.left;
        }
      } else if (element.type === 'shape') {
        icon = layerShapeMark(element);
        name = '图形 · ' + (element.shape === 'diamond' ? '菱形' : '方形');
        sub = '自由图形';
      }
      const label = name + (imageNumber ? ' ' + imageNumber : '');
      rows.push('<div class="layer-row layer-element-row' + (selected ? ' selected' : '') +
        '" data-layer-kind="element" data-layer-id="' + esc(element.id) + '">' +
        '<button type="button" class="layer-row-main" draggable="true"' + (cropTitle ? ' title="' + esc(cropTitle) + '"' : '') + ' aria-label="' +
          esc(label + '，' + sub + '，拖动可调整层级') + '">' +
        '<span class="layer-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="layer-name">' + esc(label) + '<span class="layer-sub"> ' + esc(sub) + '</span></span>' +
        '</button>' +
        '<span class="row-actions">' +
        '<button class="icon-btn" type="button" data-layer-move="' + realIndex + ':-1" title="下移一层" aria-label="下移一层"' +
        (realIndex === 0 ? ' disabled' : '') + '>↓</button>' +
        '<button class="icon-btn" type="button" data-layer-move="' + realIndex + ':1" title="上移一层" aria-label="上移一层"' +
        (realIndex === page.elements.length - 1 ? ' disabled' : '') + '>↑</button>' +
        '</span></div>');
    });
    const source = model.findGlobalBackgroundPage(project);
    if (model.isBackgroundCovered(project, page) && source) {
      rows.push('<div class="layer-row layer-bg-row" data-layer-kind="bgGlobal" data-bg-source="' +
        esc(source.id) + '">' +
        '<button type="button" class="layer-row-main" aria-label="' +
          esc('全局背景，来自第 ' + (project.pages.indexOf(source) + 1) + ' 页，点击前往') + '">' +
        '<span class="layer-icon" aria-hidden="true">▦</span>' +
        '<span class="layer-name">全局背景<span class="layer-sub"> 来自第 ' +
          (project.pages.indexOf(source) + 1) + ' 页</span></span>' +
        '<span class="pill pill-blue">全局</span>' +
        '</button>' +
        '<span class="row-actions"><span class="layer-jump" aria-hidden="true">→</span></span>' +
        '</div>');
    } else {
      const background = page.background;
      const isSource = !!(source && source.id === page.id);
      const bgSelected = selection.type === 'background';
      const items = background.items || background.images || [];
      const bgNumbers = backgroundImageNumbers(items);
      const imageCount = items.filter(function (item) { return item.kind === 'image'; }).length;
      const shapeCount = items.filter(function (item) { return item.kind === 'shape'; }).length;
      const textCount = items.filter(function (item) { return item.kind === 'text'; }).length;
      rows.push('<div class="layer-row layer-bg-row' + (bgSelected ? ' selected' : '') +
        '" data-layer-kind="bgSet">' +
        '<button type="button" class="layer-row-main" aria-label="' +
          esc('背景，图片 ' + imageCount + '，图形 ' + shapeCount + '，文字 ' + textCount + (isSource ? '，全局来源' : '')) + '">' +
        '<span class="layer-icon" aria-hidden="true">▦</span>' +
        '<span class="layer-name">背景' +
          '<span class="layer-sub"> 图片 ' + imageCount + ' · 图形 ' + shapeCount + ' · 文字 ' + textCount + (isSource ? ' · 全局来源' : '') + '</span></span>' +
        (isSource ? '<span class="pill pill-blue">全局</span>' : '') +
        '<span class="pill pill-blue">底层</span>' +
        '</button>' +
        '</div>');
      const reversed = items.slice().reverse();
      reversed.forEach(function (item, reverseIndex) {
        const realIndex = items.length - 1 - reverseIndex;
        const itemSelected = (selection.type === 'backgroundItem' && selection.itemId === item.id) ||
          (selection.type === 'backgroundImage' && selection.imageId === item.id);
        const isShape = item.kind === 'shape';
        const isText = item.kind === 'text';
        const icon = isText ? 'T' : (isShape ? layerShapeMark(item) : (layerThumb(item.assetId, item) || '▧'));
        const name = isText
          ? '文字'
          : (isShape
            ? '图形 · ' + (item.shape === 'diamond' ? '菱形' : '方形')
            : '图片');
        const number = (isShape || isText) ? 0 : (bgNumbers.get(item.id) || 0);
        const label = name + (number ? ' ' + number : '');
        let sub = isText
          ? '背景文字'
          : (isShape
            ? '背景图形'
            : (item.fit === 'none' ? '自定义' : fitLabel(item.fit)));
        let cropTitle = '';
        if (!isShape && !isText && model.hasCrop(item)) {
          const crop = model.cropValues(item);
          sub += ' · 已裁剪';
          cropTitle = '已裁剪：上' + crop.top + ' 右' + crop.right + ' 下' + crop.bottom + ' 左' + crop.left;
        }
        rows.push('<div class="layer-row layer-bg-image-row' + (itemSelected ? ' selected' : '') +
          '" data-layer-kind="bgItem" data-bg-item="' + esc(item.id) + '">' +
          '<button type="button" class="layer-row-main" draggable="true"' + (cropTitle ? ' title="' + esc(cropTitle) + '"' : '') + ' aria-label="' +
            esc(label + '，' + sub + '，拖动可调整顺序') + '">' +
          '<span class="layer-icon" aria-hidden="true">' + icon + '</span>' +
          '<span class="layer-name">' + esc(label) +
            '<span class="layer-sub"> ' + esc(sub) + '</span></span>' +
          '</button>' +
          '<span class="row-actions">' +
          '<button class="icon-btn" type="button" data-bg-move="' + esc(item.id) + ':-1" title="下移一层" aria-label="下移一层"' +
          (realIndex === 0 ? ' disabled' : '') + '>↓</button>' +
          '<button class="icon-btn" type="button" data-bg-move="' + esc(item.id) + ':1" title="上移一层" aria-label="上移一层"' +
          (realIndex === items.length - 1 ? ' disabled' : '') + '>↑</button>' +
          '</span></div>');
      });
    }
    ui.els.layerPanel.innerHTML = rows.join('');
    /* 缩略图加载失败（对象 URL 失效或解码失败）时退回通用图标，行仍可操作 */
    ui.els.layerPanel.querySelectorAll('img.layer-thumb').forEach(function (img) {
      img.addEventListener('error', function () {
        img.replaceWith('▧');
      });
    });
    ui.els.layerPanel.querySelectorAll('.layer-row').forEach(function (row) {
      const kind = row.getAttribute('data-layer-kind');
      const main = row.querySelector('.layer-row-main');
      main.addEventListener('click', function () {
        if (kind === 'element') {
          L.app.selectElement(row.getAttribute('data-layer-id'));
          return;
        }
        if (kind === 'contentLayer') {
          L.app.selectContentLayer();
          return;
        }
        if (kind === 'bgSet') {
          L.app.selectBackground();
          return;
        }
        if (kind === 'bgGlobal') {
          L.app.switchPage(row.getAttribute('data-bg-source'));
          L.app.selectBackground();
          return;
        }
        L.app.selectBackgroundItem(row.getAttribute('data-bg-item'));
      });
      if (main.getAttribute('draggable') === 'true') {
        main.addEventListener('dragstart', function (event) {
          if (kind === 'element') {
            layerDrag = { kind: 'element', id: row.getAttribute('data-layer-id') };
          } else {
            layerDrag = { kind: 'bgItem', id: row.getAttribute('data-bg-item') };
          }
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', layerDrag.id);
          }
          row.classList.add('dragging');
        });
        main.addEventListener('dragend', clearLayerDragState);
      }
      row.addEventListener('dragover', function (event) {
        if (!layerDropTargetId(row, layerDrag)) {
          clearLayerDropCues();
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        ui.els.layerPanel.querySelectorAll('.drop-before, .drop-after').forEach(function (other) {
          if (other !== row) other.classList.remove('drop-before', 'drop-after');
        });
        row.classList.toggle('drop-before', before);
        row.classList.toggle('drop-after', !before);
      });
      row.addEventListener('dragleave', function (event) {
        if (event.relatedTarget && row.contains(event.relatedTarget)) return;
        row.classList.remove('drop-before', 'drop-after');
      });
      row.addEventListener('drop', function (event) {
        const targetId = layerDropTargetId(row, layerDrag);
        if (!targetId) {
          clearLayerDropCues();
          return;
        }
        event.preventDefault();
        const rect = row.getBoundingClientRect();
        const placement = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        const drag = layerDrag;
        clearLayerDragState();
        if (drag.kind === 'element') {
          L.app.moveLayerTo(drag.id, targetId, placement);
        } else {
          L.app.moveBackgroundItemTo(drag.id, targetId, placement);
        }
      });
    });
    ui.els.layerPanel.querySelectorAll('[data-layer-move]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        const parts = button.getAttribute('data-layer-move').split(':');
        L.app.moveLayer(Number(parts[0]), Number(parts[1]));
      });
    });
    ui.els.layerPanel.querySelectorAll('[data-bg-move]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        const parts = button.getAttribute('data-bg-move').split(':');
        L.app.moveBackgroundItem(parts[0], Number(parts[1]));
      });
    });
  };

  ui.updateSelectionLabel = function () {
    const selection = L.app.state.selection;
    const project = L.app.state.project;
    const page = L.app.currentPage();
    let label = '页面';
    if (selection.type === 'background') label = '背景';
    if (selection.type === 'backgroundImage') label = '背景图片';
    if (selection.type === 'backgroundItem') {
      const item = L.app.selectedBackgroundItem ? L.app.selectedBackgroundItem() : null;
      label = item && item.kind === 'shape' ? '图形' : '背景图片';
    }
    if (selection.type === 'element') {
      const found = page ? page.elements.find(function (element) { return element.id === selection.id; }) : null;
      if (found) {
        if (found.type === 'category') label = '分类 · ' + found.category;
        if (found.type === 'text') label = '文字';
        if (found.type === 'image') label = '图片';
        if (found.type === 'shape') label = '图形';
      } else {
        label = '元素';
      }
    }
    ui.els.selectionLabel.textContent = label;
  };

  ui.setStartupLoading = function (active) {
    const loading = document.getElementById('startup-loading');
    if (loading) loading.hidden = !active;
    const pane = document.getElementById('canvas-pane');
    if (pane) pane.setAttribute('aria-busy', active ? 'true' : 'false');
  };

  ui.updateEmptyHint = function () {
    const project = L.app.state.project;
    const page = L.app.currentPage();
    ui.els.emptyHint.hidden = !model.isPageEmpty(project, page);
  };

  ui.toast = function (message, type) {
    const root = ui.els.toastRoot;
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 2800);
  };

  L.ui = ui;
})();
