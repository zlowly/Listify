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

  function fieldPair(labelA, controlA, labelB, controlB) {
    return '<div class="field-row">' +
      field(labelA, controlA) + field(labelB, controlB) +
      '</div>';
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

  function selectInput(id, options, value, disabled) {
    return '<select id="' + id + '" class="select"' + (disabled ? ' disabled' : '') + '>' + options.map(function (option) {
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

  function normalizeAngle(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    let angle = ((number % 360) + 360) % 360;
    if (angle > 180) angle -= 360;
    return Math.round(angle * 10) / 10;
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
        sub = element.rotation ? '旋转 ' + normalizeAngle(element.rotation) + '°' : '自由图片';
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
        '<button class="icon-btn" data-bg-add="' + esc(set.id) + '" title="添加背景图片">＋</button>' +
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
        if (event.target.closest('[data-bg-add]')) {
          L.app.pickBackgroundImage(row.getAttribute('data-bg-set'), null);
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
    if (selection.type === 'backgroundSet') {
      const set = model.findBackground(project, selection.setId);
      if (!set) {
        L.app.selectPage();
        return;
      }
      renderBackgroundSetProperties(set);
      return;
    }
    if (selection.type === 'backgroundImage') {
      const set = model.findBackground(project, selection.setId);
      const image = set ? (set.images || []).find(function (item) { return item.id === selection.imageId; }) : null;
      if (!set || !image) {
        L.app.selectPage();
        return;
      }
      renderBackgroundImageProperties(set, image);
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
        fieldPair(
          '宽度', numberInput('prop-page-w', project.pageSize.width, 200, 5000, 1) + '<span class="unit">px</span>',
          '高度', numberInput('prop-page-h', project.pageSize.height, 200, 5000, 1) + '<span class="unit">px</span>'
        ) +
        '<div class="inline-actions"><button id="prop-orient-portrait" class="btn btn-sm">纵向 1080×1920</button>' +
        '<button id="prop-orient-landscape" class="btn btn-sm">横向 1920×1080</button></div>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">页面边距 <span class="hint">仅参考线</span></div>' +
        fieldPair(
          '上', numberInput('prop-margin-top', project.margins.top, 0, 1000, 1) + '<span class="unit">px</span>',
          '下', numberInput('prop-margin-bottom', project.margins.bottom, 0, 1000, 1) + '<span class="unit">px</span>'
        ) +
        fieldPair(
          '左', numberInput('prop-margin-left', project.margins.left, 0, 1000, 1) + '<span class="unit">px</span>',
          '右', numberInput('prop-margin-right', project.margins.right, 0, 1000, 1) + '<span class="unit">px</span>'
        ) +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">页面背景</div>' +
        (project.unifiedBackground
          ? '<p class="hint">全局背景生效中，各页仍保留自己的背景；关闭全局后恢复。</p>'
          : '<p class="hint">背景位于内容下方，可在图层中选中后编辑。</p>') +
        field('当前页背景', selectInput('prop-page-bg', backgroundOptions(project), page.backgroundId, project.unifiedBackground)) +
        field('', '<label class="check-row"><input id="prop-unified" type="checkbox"' +
          (project.unifiedBackground ? ' checked' : '') + '> 所有页面使用同一背景</label>') +
        field('全局背景组', selectInput('prop-unified-id', backgroundOptions(project), project.unifiedBackgroundId, !project.unifiedBackground)) +
        '<div class="inline-actions"><button id="prop-bg-library" class="btn btn-sm">管理背景库</button></div>' +
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
    bind('prop-page-bg', 'change', function () {
      L.app.setPageBackground(valueOf('prop-page-bg'));
    });
    bind('prop-unified', 'change', function () {
      const input = document.getElementById('prop-unified');
      L.app.toggleUnifiedBackground(input ? input.checked : false);
    });
    bind('prop-unified-id', 'change', function () {
      L.app.setUnifiedBackground(valueOf('prop-unified-id'));
    });
    bind('prop-bg-library', 'click', openBackgroundLibrary);
  }

  function backgroundOptions(project) {
    return (project.backgrounds || []).map(function (set) {
      return { value: set.id, label: set.name };
    });
  }

  function fitLabel(fit) {
    if (fit === 'original') return '原大小';
    if (fit === 'fill-width') return '横向占满';
    if (fit === 'fill-height') return '竖向占满';
    if (fit === 'none') return '自定义';
    return '最适合';
  }

  function renderBackgroundSetProperties(set) {
    const project = L.app.state.project;
    const page = L.app.currentPage();
    const isGlobal = !!project.unifiedBackground && project.unifiedBackgroundId === set.id;
    const referenceCount = model.backgroundReferenceCount(project, set.id);
    const check = model.canDeleteBackground(project, set.id);
    const pageIndex = project.pages.indexOf(page);
    const usage = project.unifiedBackground
      ? '全局背景生效中；修改会立即影响所有页面。'
      : (referenceCount > 0
        ? '第 ' + (pageIndex + 1) + ' 页正在使用；另有 ' + Math.max(0, referenceCount - 1) + ' 页使用同一背景。'
        : '当前没有页面使用该背景。');
    ui.els.propertyPanel.innerHTML =
      '<div class="prop-group">' +
        '<div class="prop-group-title">背景组' + (isGlobal ? ' <span class="pill pill-blue">全局</span>' : '') + '</div>' +
        '<p class="hint">' + esc(usage) + '</p>' +
        field('名称', textInput('prop-bg-name', set.name, '背景名称')) +
        field('填充色', colorInput('prop-bg-set-color', set.color || '#ffffff')) +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">图片 <span class="hint">' + (set.images || []).length + ' 张</span></div>' +
        '<p class="hint">图片按列表顺序从底到顶绘制；在图层中选中图片后可拖拽定位。</p>' +
        '<div class="inline-actions">' +
          '<button id="prop-bg-add-image" class="btn btn-sm">添加图片</button>' +
          '<button id="prop-bg-duplicate" class="btn btn-sm">复制背景</button>' +
          '<button id="prop-bg-library" class="btn btn-sm">管理背景库</button>' +
          '<button id="prop-bg-delete" class="btn btn-sm btn-danger"' + (check.ok ? '' : ' disabled title="' + esc(check.reason) + '"') + '>删除背景</button>' +
        '</div>' +
        (check.ok ? '' : '<p class="hint">' + esc(check.reason) + '</p>') +
      '</div>' +
      (project.unifiedBackground
        ? '<div class="prop-group">' +
            '<div class="prop-group-title">全局背景</div>' +
            '<p class="hint">取消全局会恢复各页自己的背景。要让当前效果保留下来，可先固化或创建副本。</p>' +
            '<div class="inline-actions">' +
              '<button id="prop-bg-bake" class="btn btn-sm">固化到所有页</button>' +
              '<button id="prop-bg-copy" class="btn btn-sm">本页独立副本</button>' +
            '</div>' +
          '</div>'
        : '');

    bind('prop-bg-name', 'change', function () { L.app.renameBackgroundSet(set.id, valueOf('prop-bg-name')); });
    bind('prop-bg-set-color', 'input', function () {
      set.color = valueOf('prop-bg-set-color');
      L.app.changed({ property: false });
    });
    bind('prop-bg-add-image', 'click', function () { L.app.pickBackgroundImage(set.id, null); });
    bind('prop-bg-duplicate', 'click', function () { L.app.duplicateBackgroundSet(set.id); });
    bind('prop-bg-library', 'click', openBackgroundLibrary);
    bind('prop-bg-delete', 'click', function () { L.app.deleteBackgroundSet(set.id); });
    bind('prop-bg-bake', 'click', function () { L.app.bakeUnifiedBackground(); });
    bind('prop-bg-copy', 'click', function () { L.app.copyUnifiedBackgroundToPage(); });
  }

  function renderBackgroundImageProperties(set, image) {
    const project = L.app.state.project;
    const index = (set.images || []).indexOf(image);
    const isGlobal = !!project.unifiedBackground && project.unifiedBackgroundId === set.id;
    const meta = image.assetId ? (L.assets.getMeta(image.assetId) || project.assets.find(function (asset) {
      return asset.id === image.assetId;
    })) : null;
    const custom = image.fit === 'none';
    ui.els.propertyPanel.innerHTML =
      '<div class="prop-group">' +
        '<div class="prop-group-title">背景图片 ' + (index + 1) + ' / ' + set.images.length + '</div>' +
        '<p class="hint">所属背景：' + esc(set.name) + (isGlobal ? '（全局，修改会影响所有页面）' : '') + '</p>' +
        '<p class="hint">' + (meta ? '当前图片：' + esc(meta.name) : '图片缺失或未选择。') + '</p>' +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">定位</div>' +
        field('尺寸', selectInput('prop-bg-fit', [
          { value: 'original', label: '原大小' },
          { value: 'fill-width', label: '横向占满' },
          { value: 'fill-height', label: '竖向占满' },
          { value: 'cover', label: '最适合（居中裁剪）' },
          { value: 'none', label: '自定义' }
        ], image.fit || 'cover')) +
        (custom
          ? fieldPair(
              'X', numberInput('prop-bg-x', Math.round(image.x), -20000, 20000, 1) + '<span class="unit">px</span>',
              'Y', numberInput('prop-bg-y', Math.round(image.y), -20000, 20000, 1) + '<span class="unit">px</span>'
            ) +
            fieldPair(
              '宽', numberInput('prop-bg-w', Math.round(image.width), 1, 20000, 1) + '<span class="unit">px</span>',
              '高', numberInput('prop-bg-h', Math.round(image.height), 1, 20000, 1) + '<span class="unit">px</span>'
            ) +
            field('旋转', numberInput('prop-bg-rotation', Math.round(Number(image.rotation) || 0), -360, 360, 1) + '<span class="unit">°</span>') +
            field('', '<label class="check-row"><input id="prop-bg-ratio" type="checkbox"' +
              (image.keepRatio !== false ? ' checked' : '') + '> 缩放时保持比例</label>') +
            '<div class="inline-actions"><button id="prop-bg-restore" class="btn btn-sm">恢复为最适合</button></div>'
          : '<p class="hint">该模式随页面尺寸自动重排。直接在画布拖动或缩放会转为自定义。</p>') +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">显示</div>' +
        field('透明度', rangeInput('prop-bg-opacity', image.opacity == null ? 1 : image.opacity, 0, 1, 0.01)) +
        field('边缘模糊', rangeInput('prop-bg-blur', image.blur || 0, 0, 40, 1) + '<span class="unit">px</span>') +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="inline-actions">' +
          '<button id="prop-bg-move-up" class="btn btn-sm"' + (index >= set.images.length - 1 ? ' disabled' : '') + '>上移一层</button>' +
          '<button id="prop-bg-move-down" class="btn btn-sm"' + (index <= 0 ? ' disabled' : '') + '>下移一层</button>' +
          '<button id="prop-bg-replace" class="btn btn-sm">替换图片</button>' +
          '<button id="prop-bg-image-delete" class="btn btn-sm btn-danger">删除图片</button>' +
        '</div>' +
      '</div>';

    bind('prop-bg-fit', 'change', function () { L.app.setBackgroundImageFit(set.id, image.id, valueOf('prop-bg-fit')); });
    bind('prop-bg-x', 'change', function () { L.app.setBackgroundImageValue(set.id, image.id, 'x', Number(valueOf('prop-bg-x')) || 0); });
    bind('prop-bg-y', 'change', function () { L.app.setBackgroundImageValue(set.id, image.id, 'y', Number(valueOf('prop-bg-y')) || 0); });
    bind('prop-bg-w', 'change', function () { L.app.setBackgroundImageValue(set.id, image.id, 'width', Math.max(1, Number(valueOf('prop-bg-w')) || 1)); });
    bind('prop-bg-h', 'change', function () { L.app.setBackgroundImageValue(set.id, image.id, 'height', Math.max(1, Number(valueOf('prop-bg-h')) || 1)); });
    bind('prop-bg-rotation', 'change', function () { L.app.setBackgroundImageValue(set.id, image.id, 'rotation', Number(valueOf('prop-bg-rotation')) || 0); });
    bind('prop-bg-ratio', 'change', function () {
      const input = document.getElementById('prop-bg-ratio');
      image.keepRatio = input ? input.checked : true;
      L.app.changed({ property: false });
    });
    bind('prop-bg-opacity', 'input', function () {
      image.opacity = Number(valueOf('prop-bg-opacity'));
      const label = document.getElementById('prop-bg-opacity-value');
      if (label) label.textContent = image.opacity.toFixed(2);
      L.app.changed({ property: false });
    });
    bind('prop-bg-blur', 'input', function () {
      image.blur = Number(valueOf('prop-bg-blur'));
      const label = document.getElementById('prop-bg-blur-value');
      if (label) label.textContent = image.blur;
      L.app.changed({ property: false });
    });
    bind('prop-bg-restore', 'click', function () { L.app.restoreBackgroundImageFit(set.id, image.id); });
    bind('prop-bg-move-up', 'click', function () { L.app.moveBackgroundImage(set.id, image.id, 1); });
    bind('prop-bg-move-down', 'click', function () { L.app.moveBackgroundImage(set.id, image.id, -1); });
    bind('prop-bg-replace', 'click', function () { L.app.pickBackgroundImage(set.id, image.id); });
    bind('prop-bg-image-delete', 'click', function () { L.app.deleteBackgroundImage(set.id, image.id); });
  }

  function fontPairStatusHtml(style) {
    const pair = model.normalizeFontPair(style.fontPair);
    const isDefault = style.fontFamily === model.DEFAULT_FONT;
    const latin = pair ? (pair.latin || '默认') : (isDefault ? '默认' : '自定义');
    const cjk = pair ? (pair.cjk || '默认') : (isDefault ? '默认' : '自定义');
    return '<span class="font-pair-value">西文：' + esc(latin) + '</span>' +
      '<span class="font-pair-sep">·</span>' +
      '<span class="font-pair-value">中文：' + esc(cjk) + '</span>';
  }

  function syncFontField(prefix, style) {
    const input = document.getElementById(prefix + '-family');
    if (input) input.value = style.fontFamily || '';
    const status = document.getElementById(prefix + '-pair-status');
    if (status) status.innerHTML = fontPairStatusHtml(style);
  }

  function fontField(prefix, style) {
    const supported = !!(L.fontPicker && L.fontPicker.isSupported && L.fontPicker.isSupported());
    const disabled = supported ? '' : ' disabled title="当前浏览器不支持本机字体选择，请直接输入字体族"';
    return '<div class="field font-field-row">' +
        '<label>字体</label>' +
        '<div class="control">' +
          '<div class="font-field">' +
            '<div class="font-field-control">' +
              textInput(prefix + '-family', style.fontFamily, '字体族') +
            '</div>' +
            '<div class="font-pair-actions">' +
              '<button id="' + prefix + '-pick-latin" class="btn btn-sm font-pick-btn" type="button"' + disabled + '>选西文字体</button>' +
              '<button id="' + prefix + '-pick-cjk" class="btn btn-sm font-pick-btn" type="button"' + disabled + '>选中文字体</button>' +
              '<button id="' + prefix + '-pair-clear" class="btn btn-sm font-pick-btn" type="button">使用同一字体</button>' +
            '</div>' +
            '<div id="' + prefix + '-pair-status" class="font-pair-status">' + fontPairStatusHtml(style) + '</div>' +
            '<p class="font-pair-hint">西文优先用于拉丁字符；系统不检测字形覆盖，中文可能仍用西文字形。</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function bindFontField(prefix, style) {
    bind(prefix + '-family', 'input', function () {
      style.fontFamily = valueOf(prefix + '-family');
      delete style.fontPair;
      const status = document.getElementById(prefix + '-pair-status');
      if (status) status.innerHTML = fontPairStatusHtml(style);
      L.app.changed({ property: false });
    });

    bind(prefix + '-family', 'change', function () {
      const normalized = model.normalizeFontStack(valueOf(prefix + '-family'));
      if (normalized === style.fontFamily) return;
      style.fontFamily = normalized;
      syncFontField(prefix, style);
      L.app.changed({ property: false });
    });

    function openSlot(slot) {
      if (!L.fontPicker || !L.fontPicker.isSupported()) return;
      const pair = model.normalizeFontPair(style.fontPair) || { latin: '', cjk: '' };
      L.fontPicker.open({
        slot: slot,
        currentValue: pair[slot] || '',
        onPick: function (value) {
          const next = model.normalizeFontPair(style.fontPair) || { latin: '', cjk: '' };
          next[slot] = typeof value === 'string' ? value : '';
          model.applyFontPair(style, next);
          syncFontField(prefix, style);
          L.app.changed({ property: false });
        }
      });
    }

    bind(prefix + '-pick-latin', 'click', function () { openSlot('latin'); });
    bind(prefix + '-pick-cjk', 'click', function () { openSlot('cjk'); });
    bind(prefix + '-pair-clear', 'click', function () {
      delete style.fontPair;
      syncFontField(prefix, style);
      L.app.changed({ property: false });
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
      fieldPair(
        '列数', '<input class="input" data-table-field="columns" type="number" min="1" max="50" step="1" value="' + table.columns + '">',
        '行数', '<input class="input" data-table-field="rows" type="number" min="' + (isLast ? 0 : 1) +
        '" max="500" step="1" value="' + table.rows + '">'
      ) +
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
        marginInput('bottom', '下') +
        marginInput('left', '左') +
        marginInput('right', '右') +
      '</div>') +
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
        fieldPair(
          '位置 X', numberInput('prop-el-x', Math.round(element.x), -5000, 10000, 1) + '<span class="unit">px</span>',
          '位置 Y', numberInput('prop-el-y', Math.round(element.y), -5000, 20000, 1) + '<span class="unit">px</span>'
        ) +
        field('宽度', numberInput('prop-el-w', Math.round(element.width), 120, 5000, 1) + '<span class="unit">px</span>') +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">分类名子分区</div>' +
        field('', '<label class="check-row"><input id="prop-title-visible" type="checkbox"' +
          (element.showTitle !== false ? ' checked' : '') + '> 显示分类名</label>') +
        '<p class="hint" id="prop-title-hidden-hint"' +
          (element.showTitle !== false ? ' hidden' : '') + '>隐藏时样式保留，重新显示后生效。</p>' +
        categoryStyleFields('prop-title', element.titleStyle) +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">歌名子分区</div>' +
        categoryStyleFields('prop-song', element.songStyle) +
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
    bind('prop-title-visible', 'change', function () {
      const input = document.getElementById('prop-title-visible');
      element.showTitle = input ? input.checked : true;
      L.app.changed({ property: false });
      const hint = document.getElementById('prop-title-hidden-hint');
      if (hint) hint.hidden = element.showTitle !== false;
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
        fieldPair(
          '位置 X', numberInput('prop-text-x', Math.round(element.x), -5000, 10000, 1) + '<span class="unit">px</span>',
          '位置 Y', numberInput('prop-text-y', Math.round(element.y), -5000, 20000, 1) + '<span class="unit">px</span>'
        ) +
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
        fieldPair(
          '位置 X', numberInput('prop-img-x', Math.round(element.x), -5000, 10000, 1) + '<span class="unit">px</span>',
          '位置 Y', numberInput('prop-img-y', Math.round(element.y), -5000, 20000, 1) + '<span class="unit">px</span>'
        ) +
        fieldPair(
          '宽度', numberInput('prop-img-w', Math.round(element.width), 40, 5000, 1) + '<span class="unit">px</span>',
          '高度', numberInput('prop-img-h', Math.round(element.height), 40, 5000, 1) + '<span class="unit">px</span>'
        ) +
      '</div>' +
      '<div class="prop-group">' +
        '<div class="prop-group-title">外观</div>' +
        '<div class="field field-compact"><label>比例</label><div class="control">' +
          '<label class="check-row"><input id="prop-img-ratio" type="checkbox"' +
          (element.keepRatio !== false ? ' checked' : '') + '> 缩放时保持比例</label>' +
        '</div></div>' +
        field('旋转', numberInput('prop-img-rotation', Math.round(element.rotation || 0), -180, 180, 1) +
          '<span class="unit">°</span>') +
        field('透明度', rangeInput('prop-img-opacity', element.opacity == null ? 1 : element.opacity, 0, 1, 0.01)) +
        field('模糊', rangeInput('prop-img-blur', element.blur || 0, 0, 40, 1) + '<span class="unit">px</span>') +
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
    bind('prop-img-ratio', 'change', function () {
      const input = document.getElementById('prop-img-ratio');
      L.app.setImageKeepRatio(element, input ? input.checked : true);
    });
    bind('prop-img-rotation', 'change', function () {
      const angle = normalizeAngle(valueOf('prop-img-rotation'));
      element.rotation = angle;
      const input = document.getElementById('prop-img-rotation');
      if (input) input.value = angle;
      L.app.changed({ property: false });
    });
    bind('prop-img-opacity', 'input', function () {
      element.opacity = Number(valueOf('prop-img-opacity'));
      document.getElementById('prop-img-opacity-value').textContent = element.opacity.toFixed(2);
      L.app.changed({ property: false });
    });
    bind('prop-img-blur', 'input', function () {
      element.blur = Number(valueOf('prop-img-blur'));
      document.getElementById('prop-img-blur-value').textContent = element.blur;
      L.app.changed({ property: false });
    });
    bind('prop-delete-block', 'click', function () { L.app.deleteSelection(); });
  }

  function openBackgroundLibrary() {
    const project = L.app.state.project;
    const rows = (project.backgrounds || []).map(function (set) {
      const count = model.backgroundReferenceCount(project, set.id);
      const isGlobal = !!project.unifiedBackground && project.unifiedBackgroundId === set.id;
      const check = model.canDeleteBackground(project, set.id);
      return '<div class="bg-library-row" data-bg-lib-row="' + esc(set.id) + '">' +
        '<input class="input" data-bg-lib-name="' + esc(set.id) + '" value="' + esc(set.name) + '">' +
        '<span class="hint">' + count + ' 页使用' + (isGlobal ? ' · 全局使用中' : '') + '</span>' +
        '<div class="inline-actions">' +
          '<button class="btn btn-sm" data-bg-lib-duplicate="' + esc(set.id) + '">复制</button>' +
          '<button class="btn btn-sm btn-danger" data-bg-lib-delete="' + esc(set.id) + '"' +
            (check.ok ? '' : ' disabled title="' + esc(check.reason) + '"') + '>删除</button>' +
        '</div>' +
      '</div>';
    }).join('');
    const modal = ui.modal.open({
      title: '背景库',
      width: '560px',
      body: '<div class="prop-group">' +
        '<p class="hint">背景库只管理背景本身；页面使用哪一套背景由页面属性或全局背景决定。</p>' +
        '<div class="bg-library-list">' + rows + '</div>' +
      '</div>',
      actions: [
        {
          label: '新建空白背景',
          onClick: function () {
            L.app.addBackgroundSet();
            openBackgroundLibrary();
          }
        },
        { label: '关闭', className: 'btn-primary', onClick: function (close) { close(); } }
      ]
    });
    modal.body.querySelectorAll('[data-bg-lib-name]').forEach(function (input) {
      input.addEventListener('change', function () {
        L.app.renameBackgroundSet(input.getAttribute('data-bg-lib-name'), input.value);
      });
    });
    modal.body.querySelectorAll('[data-bg-lib-duplicate]').forEach(function (button) {
      button.addEventListener('click', function () {
        L.app.duplicateBackgroundSet(button.getAttribute('data-bg-lib-duplicate'));
        openBackgroundLibrary();
      });
    });
    modal.body.querySelectorAll('[data-bg-lib-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        L.app.deleteBackgroundSet(button.getAttribute('data-bg-lib-delete'));
        openBackgroundLibrary();
      });
    });
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
      function close(force) {
        if (closed) return;
        if (force !== true && typeof options.beforeClose === 'function' && options.beforeClose() === false) {
          return;
        }
        closed = true;
        root.hidden = true;
        root.innerHTML = '';
        document.removeEventListener('keydown', onKey);
        root.removeEventListener('click', onBackdrop);
        if (options.onClose) options.onClose();
      }
      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }
      function onBackdrop(event) {
        if (event.target === root) close();
      }
      document.addEventListener('keydown', onKey);
      header.querySelector('.modal-close').addEventListener('click', function () { close(); });
      root.addEventListener('click', onBackdrop);

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

  /* ---------- playlist editor ---------- */
  ui.playlistEditor = {
    open: function (options) {
      const opts = options || {};
      const project = L.app.state.project;
      const source = opts.categories || project.playlist.categories;
      const working = {
        categories: source.map(function (category) {
          return {
            originalName: category.name,
            name: category.name,
            originalSongs: category.songs.slice(),
            songs: category.songs.slice()
          };
        }),
        activeIndex: 0
      };

      if (opts.defaultCategoryName) {
        for (let i = 0; i < working.categories.length; i += 1) {
          if (working.categories[i].originalName === opts.defaultCategoryName) {
            working.activeIndex = i;
            break;
          }
        }
      }

      const snapshot = JSON.stringify(working.categories.map(function (category) {
        return { name: category.name, songs: category.songs };
      }));

      let activeIndex = working.activeIndex;
      let errors = {};
      let modal = null;

      function currentCategory() {
        return working.categories[activeIndex];
      }

      function isDirty() {
        return JSON.stringify(working.categories.map(function (category) {
          return { name: category.name, songs: category.songs };
        })) !== snapshot;
      }

      function validate() {
        const issues = {};
        const categoryNames = new Map();

        working.categories.forEach(function (category, categoryIndex) {
          const name = category.name.trim();
          if (!name) {
            issues['cat:' + categoryIndex] = '分类名不能为空';
            return;
          }
          if (categoryNames.has(name)) {
            const first = categoryNames.get(name);
            issues['cat:' + categoryIndex] = '分类名与另一个分类重复';
            issues['cat:' + first] = '分类名与另一个分类重复';
          } else {
            categoryNames.set(name, categoryIndex);
          }
        });

        const songPositions = new Map();
        working.categories.forEach(function (category, categoryIndex) {
          category.songs.forEach(function (song, songIndex) {
            const key = 'song:' + categoryIndex + ':' + songIndex;
            const value = song.trim();
            if (!value) {
              issues[key] = '歌名不能为空';
              return;
            }
            if (value.charAt(0) === '#') {
              issues[key] = '歌名不能以 # 开头';
              return;
            }
            if (!songPositions.has(value)) songPositions.set(value, []);
            songPositions.get(value).push(key);
          });
        });

        songPositions.forEach(function (keys) {
          if (keys.length > 1) {
            keys.forEach(function (key) { issues[key] = '歌名与另一首歌重复'; });
          }
        });

        return issues;
      }

      const body = document.createElement('div');
      body.className = 'playlist-editor';
      body.innerHTML =
        '<div class="playlist-editor-rail">' +
          '<div class="playlist-editor-rail-title">分类</div>' +
          '<div class="playlist-editor-category-list" role="tablist" aria-label="歌单分类"></div>' +
        '</div>' +
        '<div class="playlist-editor-main">' +
          '<div class="playlist-editor-head">' +
            '<label class="playlist-editor-head-label" for="playlist-editor-category-name">分类名</label>' +
            '<input id="playlist-editor-category-name" class="input playlist-editor-name-input" type="text"' +
              ' autocomplete="off" spellcheck="false" aria-label="当前分类名">' +
            '<span class="playlist-editor-songcount hint"></span>' +
          '</div>' +
          '<div class="playlist-editor-grid" role="group" aria-label="歌名列表"></div>' +
        '</div>' +
        '<div class="playlist-editor-discard" hidden>' +
          '<span class="playlist-editor-discard-text">有未应用的修改，确定放弃？</span>' +
          '<button type="button" class="btn btn-sm" data-discard-cancel>继续编辑</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-discard-confirm>放弃修改</button>' +
        '</div>';

      const railList = body.querySelector('.playlist-editor-category-list');
      const nameInput = body.querySelector('#playlist-editor-category-name');
      const grid = body.querySelector('.playlist-editor-grid');
      const countEl = body.querySelector('.playlist-editor-songcount');
      const discardBar = body.querySelector('.playlist-editor-discard');

      modal = ui.modal.open({
        title: '编辑歌单',
        width: 'min(960px, 92vw)',
        body: body,
        beforeClose: function () {
          if (!isDirty()) return true;
          discardBar.hidden = false;
          return false;
        },
        onClose: function () {
          discardBar.hidden = true;
        },
        actions: [
          { label: '取消', onClick: function (close) { close(); } },
          {
            label: '应用',
            className: 'btn-primary',
            onClick: function () {
              commitActiveElement();
              working.categories.forEach(function (category) {
                category.name = category.name.trim();
                category.songs = category.songs.map(function (song) { return song.trim(); });
              });
              errors = validate();
              updateValidation();
              if (Object.keys(errors).length) {
                ui.toast('还有 ' + Object.keys(errors).length + ' 处待修正。', 'error');
                return;
              }
              if (opts.onApply) {
                opts.onApply(working.categories.map(function (category) {
                  return {
                    originalName: category.originalName,
                    name: category.name,
                    originalSongs: category.originalSongs.slice(),
                    songs: category.songs.slice()
                  };
                }));
              }
              modal.close(true);
            }
          }
        ]
      });

      const modalEl = modal.root.querySelector('.modal');
      if (modalEl) modalEl.classList.add('playlist-editor-modal');

      const status = document.createElement('span');
      status.className = 'playlist-editor-status';
      status.setAttribute('aria-live', 'polite');
      modal.footer.insertBefore(status, modal.footer.firstChild);

      const actionButtons = modal.footer.querySelectorAll('button.btn');
      const applyButton = actionButtons[actionButtons.length - 1];

      discardBar.querySelector('[data-discard-cancel]').addEventListener('click', function () {
        discardBar.hidden = true;
      });
      discardBar.querySelector('[data-discard-confirm]').addEventListener('click', function () {
        modal.close(true);
      });

      function categoryHasError(categoryIndex) {
        return Object.keys(errors).some(function (key) {
          return key === 'cat:' + categoryIndex ||
            key.indexOf('song:' + categoryIndex + ':') === 0;
        });
      }

      function renderRail() {
        errors = validate();
        railList.innerHTML = working.categories.map(function (category, index) {
          const name = category.name.trim();
          const hasError = categoryHasError(index);
          const active = index === activeIndex;
          return '<button type="button" role="tab" class="playlist-editor-rail-row' +
            (active ? ' active' : '') + (hasError ? ' has-error' : '') +
            '" data-cat-index="' + index + '" aria-selected="' + (active ? 'true' : 'false') + '"' +
            (hasError ? ' aria-invalid="true"' : '') + ' title="' + esc(name || '未命名') + '">' +
            '<span class="playlist-editor-rail-name' + (name ? '' : ' is-empty') + '">' +
              esc(name || '未命名') + '</span>' +
            '<span class="playlist-editor-rail-count">' + category.songs.length + '</span>' +
            '</button>';
        }).join('');
        railList.querySelectorAll('[data-cat-index]').forEach(function (button) {
          button.addEventListener('click', function () {
            selectCategory(Number(button.getAttribute('data-cat-index')));
          });
        });
      }

      function renderGrid() {
        const category = currentCategory();
        grid.innerHTML = category.songs.map(function (song, index) {
          return '<div class="playlist-editor-cell" data-song-index="' + index + '">' +
            '<input class="input playlist-editor-input" type="text" value="' + esc(song) + '"' +
              ' autocomplete="off" spellcheck="false"' +
              ' aria-label="第 ' + (index + 1) + ' 首歌名" title="' + esc(song) + '">' +
            '<button type="button" class="playlist-editor-delete" tabindex="-1"' +
              ' aria-label="删除歌名 ' + esc(song) + '" title="删除">×</button>' +
            '</div>';
        }).join('') +
          '<div class="playlist-editor-cell playlist-editor-add-cell">' +
            '<input class="input playlist-editor-input playlist-editor-add-input" type="text"' +
              ' placeholder="添加歌名…" autocomplete="off" spellcheck="false" aria-label="添加歌名">' +
          '</div>';

        grid.querySelectorAll('[data-song-index]').forEach(function (cell) {
          const index = Number(cell.getAttribute('data-song-index'));
          const input = cell.querySelector('input');
          bindCellInput(input, index);
          const deleteButton = cell.querySelector('.playlist-editor-delete');
          deleteButton.addEventListener('click', function () {
            const categoryNow = currentCategory();
            if (!categoryNow.songs[index] && categoryNow.songs[index] !== '') return;
            categoryNow.songs.splice(index, 1);
            refreshAfterStructureChange();
            focusCell(index < categoryNow.songs.length ? index : categoryNow.songs.length);
          });
        });

        bindAddInput(grid.querySelector('.playlist-editor-add-input'));
      }

      function bindCellInput(input, index) {
        input.addEventListener('focus', function () {
          input.__initialValue = input.value;
        });
        input.addEventListener('compositionstart', function () {
          input.__composing = true;
        });
        input.addEventListener('compositionend', function () {
          input.__composing = false;
        });
        input.addEventListener('input', function () {
          currentCategory().songs[index] = input.value;
          updateValidation();
        });
        input.addEventListener('blur', function () {
          commitCell(input, index);
        });
        input.addEventListener('keydown', function (event) {
          if (event.isComposing || input.__composing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            commitCell(input, index);
            focusCell(index + 1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            const initial = input.__initialValue != null ? input.__initialValue : input.value;
            input.value = initial;
            currentCategory().songs[index] = initial;
            updateValidation();
          }
        });
      }

      function bindAddInput(addInput) {
        addInput.addEventListener('compositionstart', function () {
          addInput.__composing = true;
        });
        addInput.addEventListener('compositionend', function () {
          addInput.__composing = false;
        });
        addInput.addEventListener('keydown', function (event) {
          if (event.isComposing || addInput.__composing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            addSingleSong(addInput);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            addInput.value = '';
          }
        });
        addInput.addEventListener('paste', function (event) {
          const clipboard = event.clipboardData || window.clipboardData;
          if (!clipboard) return;
          const text = clipboard.getData('text');
          if (!text) return;
          event.preventDefault();
          const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
          appendSongs(lines, true);
          focusAdd();
        });
      }

      function commitCell(input, index) {
        const category = currentCategory();
        if (!category || !category.songs[index] && category.songs[index] !== '') return;
        const trimmed = input.value.trim();
        input.value = trimmed;
        category.songs[index] = trimmed;
        input.title = trimmed;
        input.__initialValue = trimmed;
        updateValidation();
      }

      function commitActiveElement() {
        const active = document.activeElement;
        if (!active || !active.classList || !active.classList.contains('playlist-editor-input')) return;
        const cell = active.closest('[data-song-index]');
        if (cell) commitCell(active, Number(cell.getAttribute('data-song-index')));
      }

      function focusCell(index) {
        const inputs = grid.querySelectorAll('[data-song-index] .playlist-editor-input');
        if (index >= 0 && index < inputs.length) {
          inputs[index].focus();
          return;
        }
        focusAdd();
      }

      function focusAdd() {
        const add = grid.querySelector('.playlist-editor-add-input');
        if (add) add.focus();
      }

      function addSingleSong(addInput) {
        const value = addInput.value.trim();
        if (!value) return;
        if (value.charAt(0) === '#') {
          ui.toast('歌名不能以 # 开头。', 'error');
          return;
        }
        const category = currentCategory();
        const exists = working.categories.some(function (item) {
          return item.songs.some(function (song) { return song.trim() === value; });
        });
        if (exists) {
          ui.toast('歌名已存在。', 'error');
          return;
        }
        category.songs.push(value);
        addInput.value = '';
        refreshAfterStructureChange();
        focusAdd();
      }

      function appendSongs(lines, announce) {
        const category = currentCategory();
        const existing = new Set();
        working.categories.forEach(function (item) {
          item.songs.forEach(function (song) { existing.add(song.trim()); });
        });
        let added = 0;
        let skipped = 0;
        lines.forEach(function (line) {
          const value = String(line).trim();
          if (!value || value.charAt(0) === '#' || existing.has(value)) {
            skipped += 1;
            return;
          }
          existing.add(value);
          category.songs.push(value);
          added += 1;
        });
        refreshAfterStructureChange();
        if (announce) {
          ui.toast('已添加 ' + added + ' 首，跳过 ' + skipped + ' 行。', added ? 'success' : '');
        }
      }

      function selectCategory(index) {
        if (index < 0 || index >= working.categories.length) return;
        activeIndex = index;
        working.activeIndex = index;
        renderActive();
      }

      function refreshAfterStructureChange() {
        countEl.textContent = currentCategory().songs.length + ' 首';
        renderGrid();
        renderRail();
        updateValidation();
      }

      function renderActive() {
        const category = currentCategory();
        nameInput.value = category.name;
        countEl.textContent = category.songs.length + ' 首';
        renderGrid();
        renderRail();
        updateValidation();
      }

      function updateValidation() {
        errors = validate();
        const category = currentCategory();
        const categoryKey = 'cat:' + activeIndex;
        const categoryInvalid = !!errors[categoryKey];
        nameInput.classList.toggle('is-invalid', categoryInvalid);
        nameInput.title = categoryInvalid ? errors[categoryKey] : '';

        grid.querySelectorAll('[data-song-index]').forEach(function (cell) {
          const index = Number(cell.getAttribute('data-song-index'));
          const input = cell.querySelector('.playlist-editor-input');
          const key = 'song:' + activeIndex + ':' + index;
          const invalid = !!errors[key];
          input.classList.toggle('is-invalid', invalid);
          cell.classList.toggle('has-error', invalid);
          input.title = invalid ? errors[key] + '：' + input.value : input.value;
        });

        railList.querySelectorAll('[data-cat-index]').forEach(function (button) {
          const index = Number(button.getAttribute('data-cat-index'));
          const hasError = categoryHasError(index);
          button.classList.toggle('has-error', hasError);
          if (hasError) button.setAttribute('aria-invalid', 'true');
          else button.removeAttribute('aria-invalid');
        });

        const count = Object.keys(errors).length;
        status.textContent = count ? count + ' 处待修正' : '';
        status.classList.toggle('has-errors', count > 0);
        if (applyButton) applyButton.disabled = count > 0;

        // keep the rail label in sync with the text being typed
        const activeRow = railList.querySelector('[data-cat-index="' + activeIndex + '"]');
        if (activeRow) {
          const label = activeRow.querySelector('.playlist-editor-rail-name');
          if (label) {
            const trimmed = category.name.trim();
            label.textContent = trimmed || '未命名';
            label.classList.toggle('is-empty', !trimmed);
            activeRow.title = trimmed || '未命名';
          }
          const railCount = activeRow.querySelector('.playlist-editor-rail-count');
          if (railCount) railCount.textContent = category.songs.length;
        }
      }

      nameInput.addEventListener('input', function () {
        currentCategory().name = nameInput.value;
        renderRail();
        updateValidation();
      });

      renderActive();
      nameInput.focus();
      nameInput.select();
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
