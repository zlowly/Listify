(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;

  const ui = {
    activePanel: 'categories',
    els: {},
    initialized: false
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function field(label, control) {
    return '<div class="field"><label>' + esc(label) + '</label><div class="control">' + control + '</div></div>';
  }

  function numberInput(id, value, min, max, step) {
    return '<input id="' + id + '" class="input" type="number" value="' + esc(value) + '"' +
      (min != null ? ' min="' + min + '"' : '') +
      (max != null ? ' max="' + max + '"' : '') +
      ' step="' + (step || 1) + '">';
  }

  function textInput(id, value, placeholder) {
    return '<input id="' + id + '" class="input" type="text" value="' + esc(value) + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>';
  }

  function colorInput(id, value) {
    return '<input id="' + id + '" class="color-input" type="color" value="' + esc(value) + '">';
  }

  function selectInput(id, options, value) {
    return '<select id="' + id + '" class="select">' + options.map(function (option) {
      const val = typeof option === 'string' ? option : option.value;
      const label = typeof option === 'string' ? option : option.label;
      return '<option value="' + esc(val) + '"' + (String(val) === String(value) ? ' selected' : '') + '>' +
        esc(label) + '</option>';
    }).join('') + '</select>';
  }

  function rangeInput(id, value, min, max, step) {
    return '<div class="range-row"><input id="' + id + '" type="range" min="' + min + '" max="' + max +
      '" step="' + step + '" value="' + esc(value) + '"><span class="range-value" id="' + id + '-value">' +
      esc(value) + '</span></div>';
  }

  function weightOptions() {
    return [
      { value: '300', label: '细体 300' },
      { value: '400', label: '常规 400' },
      { value: '500', label: '中等 500' },
      { value: '600', label: '半粗 600' },
      { value: '700', label: '粗体 700' },
      { value: '800', label: '特粗 800' },
      { value: '900', label: '黑体 900' }
    ];
  }

  function alignOptions() {
    return [
      { value: 'left', label: '左对齐' },
      { value: 'center', label: '居中' },
      { value: 'right', label: '右对齐' },
      { value: 'justify', label: '两端对齐' }
    ];
  }

  function bind(id, event, handler) {
    const el = document.getElementById(id);
    if (!el) return null;
    el.addEventListener(event, handler);
    return el;
  }

  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  ui.init = function () {
    if (ui.initialized) return;
    ui.initialized = true;
    ui.els.pageTabs = document.getElementById('page-tabs');
    ui.els.categoryToolbar = document.getElementById('category-toolbar');
    ui.els.categoryPanel = document.getElementById('category-panel');
    ui.els.layerPanel = document.getElementById('layer-panel');
    ui.els.propertyPanel = document.getElementById('property-panel');
    ui.els.selectionLabel = document.getElementById('selection-label');
    ui.els.emptyHint = document.getElementById('empty-hint');
    ui.els.modalRoot = document.getElementById('modal-root');
    ui.els.toastRoot = document.getElementById('toast-root');

    document.getElementById('btn-import').addEventListener('click', function () {
      L.app.openImport();
    });
    document.getElementById('btn-add-text').addEventListener('click', function () {
      L.app.addText();
    });
    document.getElementById('btn-add-image').addEventListener('click', function () {
      L.app.pickFreeImage();
    });
    document.getElementById('btn-save').addEventListener('click', function () {
      L.app.saveProject();
    });
    document.getElementById('btn-load').addEventListener('click', function () {
      L.app.openLoadProject();
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
      if (file) L.app.handleLoadFile(file);
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
  };

  ui.setPanel = function (panel) {
    ui.activePanel = panel;
    document.querySelectorAll('.sidebar-tab').forEach(function (tab) {
      const active = tab.getAttribute('data-panel') === panel;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
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
      return '<button class="page-tab' + (active ? ' active' : '') + '" role="tab" aria-selected="' +
        (active ? 'true' : 'false') + '" data-page-id="' + esc(page.id) + '">第 ' + (index + 1) + ' 页</button>';
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
      return '<div class="category-row ' + (placed ? 'placed' : 'unplaced') + '" draggable="true" data-category="' +
        esc(category.name) + '">' +
        '<span class="category-name" title="' + esc(category.name) + '">' + esc(category.name) + '</span>' +
        '<span class="category-meta">' + category.songs.length + ' 首</span>' +
        '<span class="pill ' + (placed ? 'pill-green' : 'pill-gray') + '">' +
        (placed ? '第 ' + (pageIndex + 1) + ' 页' : '未放置') + '</span>' +
        '</div>';
    }).join('');

    ui.els.categoryPanel.querySelectorAll('.category-row').forEach(function (row) {
      const name = row.getAttribute('data-category');
      row.addEventListener('click', function () {
        const placed = model.getPlacedBlock(project, name);
        if (placed) {
          L.app.jumpToCategory(name);
        } else {
          ui.toast('把“' + name + '”拖到画布上放置', '');
        }
      });
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
        sub = element.fit || 'cover';
      }
      rows.push('<div class="layer-row' + (selected ? ' selected' : '') + '" data-layer-id="' + esc(element.id) + '">' +
        '<span class="layer-icon">' + icon + '</span>' +
        '<span class="layer-name">' + esc(name) + '<span class="layer-sub"> ' + esc(sub) + '</span></span>' +
        '<span class="row-actions">' +
        '<button class="icon-btn" data-layer-move="' + realIndex + ':-1" title="下移一层"' +
        (realIndex === 0 ? ' disabled' : '') + '>↓</button>' +
        '<button class="icon-btn" data-layer-move="' + realIndex + ':1" title="上移一层"' +
        (realIndex === page.elements.length - 1 ? ' disabled' : '') + '>↑</button>' +
        '</span></div>');
    });
    const bg = page.background;
    const bgSelected = selection.type === 'background';
    rows.push('<div class="layer-row' + (bgSelected ? ' selected' : '') + '" data-layer-bg="1">' +
      '<span class="layer-icon">▦</span>' +
      '<span class="layer-name">背景<span class="layer-sub"> ' + esc(bg.fit || 'cover') + '</span></span>' +
      '<span class="pill pill-blue">底层</span></div>');
    ui.els.layerPanel.innerHTML = rows.join('');
    ui.els.layerPanel.querySelectorAll('.layer-row').forEach(function (row) {
      row.addEventListener('click', function (event) {
        if (event.target.closest('[data-layer-move]')) return;
        if (row.hasAttribute('data-layer-bg')) {
          L.app.selectBackground();
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
    if (selection.type === 'background') label = '背景';
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

  ui.renderPropertyPanel = function () {
    const project = L.app.state.project;
    const page = L.app.currentPage();
    if (!page) return;
    const selection = L.app.state.selection;
    if (selection.type === 'element') {
      const element = page.elements.find(function (item) { return item.id === selection.id; });
      if (!element) {
        L.app.selectPage();
        return;
      }
      if (element.type === 'category') renderCategoryProperties(element);
      else if (element.type === 'text') renderTextProperties(element);
      else renderImageProperties(element);
      return;
    }
    if (selection.type === 'background') {
      renderBackgroundProperties(page);
      return;
    }
    renderPageProperties(page);
  };

  function renderPageProperties(page) {
    const project = L.app.state.project;
    const pageIndex = project.pages.indexOf(page);
    ui.els.propertyPanel.innerHTML =
      '<div class="prop-group">' +
        '<div class="prop-group-title">当前页</div>' +
        '<p class="hint">第 ' + (pageIndex + 1) + ' 页 / 共 ' + project.pages.length + ' 页。页面尺寸与边距为全局设置。</p>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">页面尺寸</div>' +
        field('宽度', numberInput('prop-page-w', project.pageSize.width, 200, 5000, 1) + '<span class="unit">px</span>') +
        field('高度', numberInput('prop-page-h', project.pageSize.height, 200, 5000, 1) + '<span class="unit">px</span>') +
        '<div class="inline-actions"><button id="prop-orient-portrait" class="btn btn-sm">纵向 1080×1920</button>' +
        '<button id="prop-orient-landscape" class="btn btn-sm">横向 1920×1080</button></div>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">页面边距 <span class="hint">仅参考线</span></div>' +
        field('上', numberInput('prop-margin-top', project.margins.top, 0, 1000, 1) + '<span class="unit">px</span>') +
        field('右', numberInput('prop-margin-right', project.margins.right, 0, 1000, 1) + '<span class="unit">px</span>') +
        field('下', numberInput('prop-margin-bottom', project.margins.bottom, 0, 1000, 1) + '<span class="unit">px</span>') +
        field('左', numberInput('prop-margin-left', project.margins.left, 0, 1000, 1) + '<span class="unit">px</span>') +
      '</div>' +
      '<div class="prop-group">' +
        '<button id="prop-delete-block" class="btn btn-danger btn-sm" disabled>删除分类块</button>' +
        '<p class="hint">在画布或图层面板中选择内容后可删除。</p>' +
      '</div>';

    bind('prop-page-w', 'change', function () {
      L.app.setPageSize(Number(valueOf('prop-page-w')), project.pageSize.height);
    });
    bind('prop-page-h', 'change', function () {
      L.app.setPageSize(project.pageSize.width, Number(valueOf('prop-page-h')));
    });
    bind('prop-orient-portrait', 'click', function () {
      L.app.setPageSize(1080, 1920);
    });
    bind('prop-orient-landscape', 'click', function () {
      L.app.setPageSize(1920, 1080);
    });
    ['top', 'right', 'bottom', 'left'].forEach(function (key) {
      bind('prop-margin-' + key, 'change', function () {
        const margins = Object.assign({}, project.margins);
        margins[key] = Math.max(0, Number(valueOf('prop-margin-' + key)) || 0);
        L.app.setMargins(margins);
      });
    });
  }

  function renderBackgroundProperties(page) {
    const project = L.app.state.project;
    const bg = page.background;
    const pageIndex = project.pages.indexOf(page);
    const meta = bg.assetId ? (L.assets.getMeta(bg.assetId) || project.assets.find(function (asset) {
      return asset.id === bg.assetId;
    })) : null;
    ui.els.propertyPanel.innerHTML =
      '<div class="prop-group">' +
        '<div class="prop-group-title">第 ' + (pageIndex + 1) + ' 页背景</div>' +
        '<p class="hint">背景始终位于内容层下方，只能从这里或图层面板选中。</p>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">背景图片</div>' +
        (bg.assetId
          ? '<p class="hint">当前图片：' + esc(meta ? meta.name : bg.assetId) + '</p>'
          : '<p class="hint">当前页没有背景图片。</p>') +
        '<div class="inline-actions"><button id="prop-bg-choose" class="btn btn-sm">' +
        (bg.assetId ? '替换图片' : '选择图片') + '</button>' +
        (bg.assetId ? '<button id="prop-bg-clear" class="btn btn-sm btn-danger">清除图片</button>' : '') +
        '</div>' +
        field('填充色', colorInput('prop-bg-color', bg.color || '#ffffff')) +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">图片布局</div>' +
        field('尺寸', selectInput('prop-bg-fit', [
          { value: 'original', label: '原大小' },
          { value: 'fill-width', label: '横向占满' },
          { value: 'fill-height', label: '竖向占满' },
          { value: 'cover', label: '最适合（居中裁剪）' }
        ], bg.fit || 'cover')) +
        field('透明度', rangeInput('prop-bg-opacity', bg.opacity == null ? 1 : bg.opacity, 0, 1, 0.01)) +
        field('边缘模糊', rangeInput('prop-bg-blur', bg.blur || 0, 0, 40, 1) + '<span class="unit">px</span>') +
      '</div>';

    bind('prop-bg-choose', 'click', function () { L.app.pickBackgroundImage(); });
    bind('prop-bg-clear', 'click', function () { L.app.clearBackgroundImage(); });
    bind('prop-bg-color', 'input', function () {
      page.background.color = valueOf('prop-bg-color');
      L.app.changed({ property: false });
    });
    bind('prop-bg-fit', 'change', function () {
      page.background.fit = valueOf('prop-bg-fit');
      L.app.changed({ property: false });
    });
    bind('prop-bg-opacity', 'input', function () {
      page.background.opacity = Number(valueOf('prop-bg-opacity'));
      document.getElementById('prop-bg-opacity-value').textContent = page.background.opacity.toFixed(2);
      L.app.changed({ property: false });
    });
    bind('prop-bg-blur', 'input', function () {
      page.background.blur = Number(valueOf('prop-bg-blur'));
      document.getElementById('prop-bg-blur-value').textContent = page.background.blur;
      L.app.changed({ property: false });
    });
  }

  function fontField(prefix, style) {
    const supported = !!(L.fontPicker && L.fontPicker.isSupported && L.fontPicker.isSupported());
    return field('字体',
      '<div class="font-control">' +
        textInput(prefix + '-family', style.fontFamily, '字体族') +
        '<button id="' + prefix + '-family-pick" class="btn btn-sm font-pick-btn" type="button"' +
          (supported ? '' : ' disabled title="当前浏览器不支持本机字体选择，请直接输入字体族"') +
        '>选择</button>' +
      '</div>');
  }

  function bindFontField(prefix, style) {
    bind(prefix + '-family', 'input', function () {
      style.fontFamily = valueOf(prefix + '-family');
      L.app.changed({ property: false });
    });
    bind(prefix + '-family-pick', 'click', function () {
      if (!L.fontPicker || !L.fontPicker.isSupported()) return;
      L.fontPicker.open({
        currentValue: style.fontFamily,
        onPick: function (value) {
          style.fontFamily = value;
          const input = document.getElementById(prefix + '-family');
          if (input) input.value = value;
          L.app.changed({ property: false });
        }
      });
    });
  }

  function categoryStyleFields(prefix, style) {
    return fontField(prefix, style) +
      field('字号', numberInput(prefix + '-size', style.fontSize, 6, 300, 1) + '<span class="unit">px</span>') +
      field('粗细', selectInput(prefix + '-weight', weightOptions(), String(style.fontWeight))) +
      field('颜色', colorInput(prefix + '-color', style.color)) +
      field('行距', numberInput(prefix + '-lineheight', style.lineHeight, 0.8, 3, 0.05));
  }

  function bindCategoryStyle(prefix, style) {
    bindFontField(prefix, style);
    bind(prefix + '-size', 'input', function () {
      style.fontSize = Math.max(6, Number(valueOf(prefix + '-size')) || 6);
      L.app.changed({ property: false });
    });
    bind(prefix + '-weight', 'change', function () {
      style.fontWeight = Number(valueOf(prefix + '-weight'));
      L.app.changed({ property: false });
    });
    bind(prefix + '-color', 'input', function () {
      style.color = valueOf(prefix + '-color');
      L.app.changed({ property: false });
    });
    bind(prefix + '-lineheight', 'input', function () {
      style.lineHeight = Math.max(0.8, Number(valueOf(prefix + '-lineheight')) || 0.8);
      L.app.changed({ property: false });
    });
  }

  function tableCard(table, index, isLast) {
    const widthLabel = table.widthMode === 'manual' ? '固定' : '自动';
    const margins = model.normalizeMargins(table.margins);
    function marginInput(side, label) {
      return '<label class="table-margin-item">' + label +
        '<input class="input" data-table-field="margin-' + side + '" type="number" min="0" step="1" value="' +
        esc(margins[side]) + '"></label>';
    }
    return '<div class="table-card" data-table-index="' + index + '">' +
      '<div class="table-card-head"><span class="table-card-title">表格 ' + (index + 1) +
      (isLast ? ' · 末表' : '') + '</span>' +
      '<span class="row-actions">' +
      '<button class="btn btn-sm" data-table-action="auto">恢复自动</button>' +
      '<button class="icon-btn" data-table-action="remove" title="删除表格">×</button>' +
      '</span></div>' +
      field('列数', '<input class="input" data-table-field="columns" type="number" min="1" max="50" step="1" value="' + table.columns + '">') +
      field('行数', '<input class="input" data-table-field="rows" type="number" min="' + (isLast ? 0 : 1) +
        '" max="500" step="1" value="' + table.rows + '">') +
      field('填充', '<select class="select" data-table-field="fill">' +
        '<option value="column"' + (table.fill === 'column' ? ' selected' : '') + '>列优先（从上往下逐列）</option>' +
        '<option value="row"' + (table.fill === 'row' ? ' selected' : '') + '>行优先（从左往右逐行）</option>' +
      '</select>') +
      field('对齐', '<select class="select" data-table-field="align">' +
        alignOptions().map(function (option) {
          return '<option value="' + option.value + '"' + (table.align === option.value ? ' selected' : '') + '>' +
            option.label + '</option>';
        }).join('') + '</select>') +
      field('边距', '<div class="table-margin-grid">' +
        marginInput('top', '上') +
        marginInput('right', '右') +
        marginInput('bottom', '下') +
        marginInput('left', '左') +
      '</div><p class="hint">边距相对分类块边缘，单位为 px；上下边距相加。</p>') +
      field('列宽', '<span class="pill ' + (table.widthMode === 'manual' ? 'pill-blue' : 'pill-gray') + '">' +
        widthLabel + '</span><span class="hint">' + (isLast && table.rows === 0 ? '0 行 = 动态行' : '') + '</span>') +
      '</div>';
  }

  function renderCategoryProperties(element) {
    const project = L.app.state.project;
    const category = model.getCategory(project, element.category);
    const tables = element.tables;
    const tableCards = tables.map(function (table, index) {
      return tableCard(table, index, index === tables.length - 1);
    }).join('');

    ui.els.propertyPanel.innerHTML =
      '<div class="prop-group">' +
        '<div class="prop-group-title">分类块 <span class="pill pill-green">' + (category ? category.songs.length : 0) + ' 首</span></div>' +
        field('位置 X', numberInput('prop-el-x', Math.round(element.x), -5000, 10000, 1) + '<span class="unit">px</span>') +
        field('位置 Y', numberInput('prop-el-y', Math.round(element.y), -5000, 20000, 1) + '<span class="unit">px</span>') +
        field('宽度', numberInput('prop-el-w', Math.round(element.width), 120, 5000, 1) + '<span class="unit">px</span>') +
        '<p class="hint">高度由内容自动计算；可在画布上拖动左右边缘调整宽度。</p>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">分类名子分区</div>' +
        categoryStyleFields('prop-title', element.titleStyle) +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">歌名子分区</div>' +
        categoryStyleFields('prop-song', element.songStyle) +
        '<p class="hint">歌名样式会应用到该分类块内所有表格。</p>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">表格 <span class="hint">' + tables.length + ' 个</span></div>' +
        tableCards +
        '<button id="prop-add-table" class="btn btn-sm">＋ 添加表格</button>' +
        '<p class="hint">只有最后一个表格可以是动态行（行数 0）。列宽拖动后整表变为固定列宽。表格边距相对分类块边缘，上下边距相加。</p>' +
      '</div>' +
      '<div class="prop-group">' +
        '<button id="prop-delete-block" class="btn btn-danger btn-sm">删除分类块</button>' +
        '<p class="hint">删除后分类回到左侧未放置状态，歌单数据保留。</p>' +
      '</div>';

    bind('prop-el-x', 'input', function () {
      element.x = Number(valueOf('prop-el-x')) || 0;
      L.app.changed({ property: false });
    });
    bind('prop-el-y', 'input', function () {
      element.y = Number(valueOf('prop-el-y')) || 0;
      L.app.changed({ property: false });
    });
    bind('prop-el-w', 'input', function () {
      const next = Math.max(120, Number(valueOf('prop-el-w')) || 120);
      L.app.resizeElementWidth(element, next);
      L.app.changed({ property: false });
    });
    bindCategoryStyle('prop-title', element.titleStyle);
    bindCategoryStyle('prop-song', element.songStyle);
    bind('prop-add-table', 'click', function () {
      layout.addTable(element, category);
      L.app.changed();
      ui.renderPropertyPanel();
    });
    bind('prop-delete-block', 'click', function () {
      L.app.deleteSelection();
    });

    ui.els.propertyPanel.querySelectorAll('.table-card').forEach(function (card) {
      const index = Number(card.getAttribute('data-table-index'));
      const table = element.tables[index];
      if (!table) return;
      card.querySelectorAll('[data-table-field]').forEach(function (input) {
        const fieldName = input.getAttribute('data-table-field');
        const eventName = fieldName.indexOf('margin-') === 0 ? 'input' : 'change';
        input.addEventListener(eventName, function () {
          if (fieldName.indexOf('margin-') === 0) {
            const side = fieldName.slice('margin-'.length);
            table.margins = model.normalizeMargins(table.margins);
            table.margins[side] = Math.max(0, Number(input.value) || 0);
            L.app.changed({ property: false });
          } else if (fieldName === 'columns') {
            layout.setColumns(element, index, Number(input.value));
            L.app.changed();
            ui.renderPropertyPanel();
          } else if (fieldName === 'rows') {
            layout.setRows(element, index, Number(input.value));
            L.app.changed();
            ui.renderPropertyPanel();
          } else if (fieldName === 'fill' || fieldName === 'align') {
            table[fieldName] = input.value;
            L.app.changed({ property: false });
          }
        });
      });
      card.querySelectorAll('[data-table-action]').forEach(function (button) {
        button.addEventListener('click', function () {
          const action = button.getAttribute('data-table-action');
          if (action === 'auto') {
            layout.resetAuto(element, index);
          } else if (action === 'remove') {
            layout.removeTable(element, index);
          }
          L.app.changed();
          ui.renderPropertyPanel();
        });
      });
    });
  }

  function textStyleFields(prefix, style) {
    return fontField(prefix, style) +
      field('字号', numberInput(prefix + '-size', style.fontSize, 6, 300, 1) + '<span class="unit">px</span>') +
      field('粗细', selectInput(prefix + '-weight', weightOptions(), String(style.fontWeight))) +
      field('颜色', colorInput(prefix + '-color', style.color)) +
      field('行距', numberInput(prefix + '-lineheight', style.lineHeight, 0.8, 3, 0.05)) +
      field('对齐', selectInput(prefix + '-align', alignOptions(), style.align || 'left'));
  }

  function renderTextProperties(element) {
    ui.els.propertyPanel.innerHTML =
      '<div class="prop-group">' +
        '<div class="prop-group-title">自由文字</div>' +
        field('内容', '<textarea id="prop-text-content" class="input" rows="3" style="height:auto;padding:6px 7px;resize:vertical">' +
          esc(element.text) + '</textarea>') +
        '<p class="hint">也可以双击画布上的文字直接编辑。</p>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">位置与尺寸</div>' +
        field('位置 X', numberInput('prop-text-x', Math.round(element.x), -5000, 10000, 1) + '<span class="unit">px</span>') +
        field('位置 Y', numberInput('prop-text-y', Math.round(element.y), -5000, 20000, 1) + '<span class="unit">px</span>') +
        field('宽度', numberInput('prop-text-w', Math.round(element.width), 40, 5000, 1) + '<span class="unit">px</span>') +
        '<p class="hint">高度随文字自动增长。</p>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">文字样式</div>' +
        textStyleFields('prop-text', element.style) +
      '</div>' +
      '<div class="prop-group"><button id="prop-delete-block" class="btn btn-danger btn-sm">删除文字</button></div>';

    bind('prop-text-content', 'input', function () {
      element.text = valueOf('prop-text-content');
      L.app.changed({ property: false });
    });
    bind('prop-text-x', 'input', function () {
      element.x = Number(valueOf('prop-text-x')) || 0;
      L.app.changed({ property: false });
    });
    bind('prop-text-y', 'input', function () {
      element.y = Number(valueOf('prop-text-y')) || 0;
      L.app.changed({ property: false });
    });
    bind('prop-text-w', 'input', function () {
      element.width = Math.max(40, Number(valueOf('prop-text-w')) || 40);
      L.app.changed({ property: false });
    });
    bindFontField('prop-text', element.style);
    bind('prop-text-size', 'input', function () {
      element.style.fontSize = Math.max(6, Number(valueOf('prop-text-size')) || 6);
      L.app.changed({ property: false });
    });
    bind('prop-text-weight', 'change', function () {
      element.style.fontWeight = Number(valueOf('prop-text-weight'));
      L.app.changed({ property: false });
    });
    bind('prop-text-color', 'input', function () {
      element.style.color = valueOf('prop-text-color');
      L.app.changed({ property: false });
    });
    bind('prop-text-lineheight', 'input', function () {
      element.style.lineHeight = Math.max(0.8, Number(valueOf('prop-text-lineheight')) || 0.8);
      L.app.changed({ property: false });
    });
    bind('prop-text-align', 'change', function () {
      element.style.align = valueOf('prop-text-align');
      L.app.changed({ property: false });
    });
    bind('prop-delete-block', 'click', function () { L.app.deleteSelection(); });
  }

  function renderImageProperties(element) {
    const meta = L.assets.getMeta(element.assetId) || L.app.state.project.assets.find(function (asset) {
      return asset.id === element.assetId;
    });
    ui.els.propertyPanel.innerHTML =
      '<div class="prop-group">' +
        '<div class="prop-group-title">自由图片</div>' +
        '<p class="hint">当前图片：' + esc(meta ? meta.name : (element.assetId || '未选择')) + '</p>' +
        '<div class="inline-actions"><button id="prop-img-replace" class="btn btn-sm">替换图片</button></div>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">位置与尺寸</div>' +
        field('位置 X', numberInput('prop-img-x', Math.round(element.x), -5000, 10000, 1) + '<span class="unit">px</span>') +
        field('位置 Y', numberInput('prop-img-y', Math.round(element.y), -5000, 20000, 1) + '<span class="unit">px</span>') +
        field('宽度', numberInput('prop-img-w', Math.round(element.width), 40, 5000, 1) + '<span class="unit">px</span>') +
        field('高度', numberInput('prop-img-h', Math.round(element.height), 40, 5000, 1) + '<span class="unit">px</span>') +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">填充</div>' +
        field('模式', selectInput('prop-img-fit', [
          { value: 'cover', label: 'cover · 填满并居中裁剪' },
          { value: 'contain', label: 'contain · 完整显示' },
          { value: 'stretch', label: 'stretch · 拉伸' }
        ], element.fit || 'cover')) +
        field('透明度', rangeInput('prop-img-opacity', element.opacity == null ? 1 : element.opacity, 0, 1, 0.01)) +
      '</div>' +
      '<div class="prop-group"><button id="prop-delete-block" class="btn btn-danger btn-sm">删除图片</button></div>';

    bind('prop-img-replace', 'click', function () { L.app.pickFreeImage(element.id); });
    bind('prop-img-x', 'input', function () {
      element.x = Number(valueOf('prop-img-x')) || 0;
      L.app.changed({ property: false });
    });
    bind('prop-img-y', 'input', function () {
      element.y = Number(valueOf('prop-img-y')) || 0;
      L.app.changed({ property: false });
    });
    bind('prop-img-w', 'input', function () {
      element.width = Math.max(40, Number(valueOf('prop-img-w')) || 40);
      L.app.changed({ property: false });
    });
    bind('prop-img-h', 'input', function () {
      element.height = Math.max(40, Number(valueOf('prop-img-h')) || 40);
      L.app.changed({ property: false });
    });
    bind('prop-img-fit', 'change', function () {
      element.fit = valueOf('prop-img-fit');
      L.app.changed({ property: false });
    });
    bind('prop-img-opacity', 'input', function () {
      element.opacity = Number(valueOf('prop-img-opacity'));
      document.getElementById('prop-img-opacity-value').textContent = element.opacity.toFixed(2);
      L.app.changed({ property: false });
    });
    bind('prop-delete-block', 'click', function () { L.app.deleteSelection(); });
  }

  /* ---------- modal ---------- */
  ui.modal = {
    open: function (options) {
      const root = ui.els.modalRoot;
      root.hidden = false;
      root.innerHTML = '';
      const modal = document.createElement('div');
      modal.className = 'modal';
      if (options.width) modal.style.width = options.width;
      const header = document.createElement('div');
      header.className = 'modal-header';
      header.innerHTML = '<div class="modal-title">' + esc(options.title || '') + '</div>' +
        '<button class="modal-close" type="button" aria-label="关闭">×</button>';
      const body = document.createElement('div');
      body.className = 'modal-body';
      if (typeof options.body === 'string') body.innerHTML = options.body;
      else if (options.body) body.appendChild(options.body);
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      root.appendChild(modal);

      let closed = false;
      function close() {
        if (closed) return;
        closed = true;
        root.hidden = true;
        root.innerHTML = '';
        document.removeEventListener('keydown', onKey);
        if (options.onClose) options.onClose();
      }
      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }
      document.addEventListener('keydown', onKey);
      header.querySelector('.modal-close').addEventListener('click', close);
      root.addEventListener('click', function (event) {
        if (event.target === root) close();
      }, { once: true });

      (options.actions || []).forEach(function (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn ' + (action.className || '');
        button.textContent = action.label;
        button.addEventListener('click', function () {
          if (action.onClick) action.onClick(close, button);
          else close();
        });
        footer.appendChild(button);
      });
      return { close: close, body: body, footer: footer, root: root };
    },

    alert: function (title, message) {
      return new Promise(function (resolve) {
        let settled = false;
        let closeFn;
        function finish() {
          if (settled) return;
          settled = true;
          closeFn();
          resolve();
        }
        const modal = ui.modal.open({
          title: title,
          body: '<p>' + esc(message).replace(/\n/g, '<br>') + '</p>',
          onClose: finish,
          actions: [{ label: '确定', className: 'btn-primary', onClick: finish }]
        });
        closeFn = modal.close;
      });
    },

    confirm: function (title, message, options) {
      return new Promise(function (resolve) {
        let settled = false;
        let closeFn;
        function finish(value) {
          if (settled) return;
          settled = true;
          closeFn();
          resolve(value);
        }
        const modal = ui.modal.open({
          title: title,
          body: '<p>' + esc(message).replace(/\n/g, '<br>') + '</p>',
          onClose: function () { finish(false); },
          actions: [
            { label: '取消', onClick: function () { finish(false); } },
            {
              label: (options && options.confirmLabel) || '确定',
              className: (options && options.danger) ? 'btn-danger' : 'btn-primary',
              onClick: function () { finish(true); }
            }
          ]
        });
        closeFn = modal.close;
      });
    }
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
