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
  const openPresetPicker = ui.openPresetPicker;
  const fitLabel = ui.fitLabel;

  ui.activePanel = 'categories';
  ui.els = {};
  ui.initialized = false;
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
      L.app.addText();
    });
    document.getElementById('btn-add-image').addEventListener('click', function () {
      L.app.pickFreeImage();
    });
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
        if (L.app.state.selection.type === 'element') {
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
      L.app.redraw();
    }
  };

  ui.renderPageTabs = function () {
    const project = L.app.state.project;
    const current = L.app.state.currentPageId;
    ui.els.pageTabs.innerHTML = project.pages.map(function (page, index) {
      const active = page.id === current;
      return '<button class="page-tab' + (active ? ' active' : '') + '"' +
        (active ? ' aria-current="page"' : '') + ' aria-label="第 ' + (index + 1) + ' 页" data-page-id="' +
        esc(page.id) + '">' + (index + 1) + '</button>';
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

  ui.renderLayerPanel = function () {
    const project = L.app.state.project;
    const page = L.app.currentPage();
    const selection = L.app.state.selection;
    if (!page) return;
    const rows = [];
    const elements = page.elements.slice().reverse();
    elements.forEach(function (element, reverseIndex) {
      const realIndex = page.elements.length - 1 - reverseIndex;
      const selected = selection.type === 'element' && selection.id === element.id;
      let icon = '▤';
      let name = '元素';
      let sub = '';
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
        icon = '▧';
        name = '图片';
        sub = element.rotation ? '旋转 ' + normalizeAngle(element.rotation) + '°' : '自由图片';
      }
      rows.push('<div class="layer-row' + (selected ? ' selected' : '') + '" data-layer-id="' + esc(element.id) + '">' +
        '<span class="layer-icon">' + icon + '</span>' +
        '<span class="layer-name">' + esc(name) + '<span class="layer-sub"> ' + esc(sub) + '</span></span>' +
        '<span class="row-actions">' +
        '<button class="icon-btn" data-layer-move="' + realIndex + ':-1" title="下移一层" aria-label="下移一层"' +
        (realIndex === 0 ? ' disabled' : '') + '>↓</button>' +
        '<button class="icon-btn" data-layer-move="' + realIndex + ':1" title="上移一层" aria-label="上移一层"' +
        (realIndex === page.elements.length - 1 ? ' disabled' : '') + '>↑</button>' +
        '</span></div>');
    });
    const set = model.effectiveBackground(project, page);
    if (set) {
      const isGlobal = !!project.unifiedBackground && project.unifiedBackgroundId === set.id;
      const bgSelected = selection.type === 'backgroundSet' && selection.setId === set.id;
      const referenceCount = model.backgroundReferenceCount(project, set.id);
      const subParts = [referenceCount + ' 页使用'];
      if (isGlobal) subParts.push('全局背景');
      rows.push('<div class="layer-row layer-bg-row' + (bgSelected ? ' selected' : '') +
        '" data-bg-set="' + esc(set.id) + '">' +
        '<span class="layer-icon">▦</span>' +
        '<span class="layer-name">' + esc(set.name) +
          '<span class="layer-sub"> ' + esc(subParts.join(' · ')) + '</span></span>' +
        (isGlobal ? '<span class="pill pill-blue">全局</span>' : '') +
        '<span class="pill pill-blue">底层</span>' +
        '<button class="icon-btn" data-bg-add="' + esc(set.id) + '" title="添加背景图片" aria-label="添加背景图片">＋</button>' +
        '</div>');
      const images = (set.images || []).slice().reverse();
      images.forEach(function (image, reverseIndex) {
        const realIndex = set.images.length - 1 - reverseIndex;
        const imageSelected = selection.type === 'backgroundImage' &&
          selection.setId === set.id && selection.imageId === image.id;
        const fitText = image.fit === 'none' ? '自定义' : fitLabel(image.fit);
        rows.push('<div class="layer-row layer-bg-image-row' + (imageSelected ? ' selected' : '') +
          '" data-bg-image="' + esc(set.id) + ':' + esc(image.id) + '">' +
          '<span class="layer-icon">▧</span>' +
          '<span class="layer-name">图片 ' + (realIndex + 1) +
            '<span class="layer-sub"> ' + esc(fitText) + '</span></span>' +
          '</div>');
      });
    }
    ui.els.layerPanel.innerHTML = rows.join('');
    ui.els.layerPanel.querySelectorAll('.layer-row').forEach(function (row) {
      row.addEventListener('click', function (event) {
        if (event.target.closest('[data-layer-move]')) return;
        const bgAddBtn = event.target.closest('[data-bg-add]');
        if (bgAddBtn) {
          openPresetPicker('add', { setId: bgAddBtn.getAttribute('data-bg-add') });
          return;
        }
        if (row.hasAttribute('data-bg-set')) {
          L.app.selectBackgroundSet(row.getAttribute('data-bg-set'));
          return;
        }
        if (row.hasAttribute('data-bg-image')) {
          const parts = row.getAttribute('data-bg-image').split(':');
          L.app.selectBackgroundImage(parts[0], parts[1]);
          return;
        }
        L.app.selectElement(row.getAttribute('data-layer-id'));
      });
    });
    ui.els.layerPanel.querySelectorAll('[data-layer-move]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        const parts = button.getAttribute('data-layer-move').split(':');
        L.app.moveLayer(Number(parts[0]), Number(parts[1]));
      });
    });
  };

  ui.updateSelectionLabel = function () {
    const selection = L.app.state.selection;
    const project = L.app.state.project;
    const page = L.app.currentPage();
    let label = '页面';
    if (selection.type === 'backgroundSet') {
      const set = model.findBackground(project, selection.setId);
      label = set ? '背景 · ' + set.name : '背景';
    }
    if (selection.type === 'backgroundImage') label = '背景图片';
    if (selection.type === 'element') {
      const found = page ? page.elements.find(function (element) { return element.id === selection.id; }) : null;
      if (found) {
        if (found.type === 'category') label = '分类 · ' + found.category;
        if (found.type === 'text') label = '文字';
        if (found.type === 'image') label = '图片';
      } else {
        label = '元素';
      }
    }
    ui.els.selectionLabel.textContent = label;
  };

  ui.updateEmptyHint = function () {
    const project = L.app.state.project;
    const page = L.app.currentPage();
    const empty = project.playlist.categories.length === 0 && (!page || page.elements.length === 0);
    ui.els.emptyHint.hidden = !empty;
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
