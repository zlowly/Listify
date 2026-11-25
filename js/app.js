(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;
  const shape = L.shape;

  const clamp = model.clamp;

  const BUILD = '20261110b';
  L.BUILD = BUILD;
  console.info('[Listify] build ' + BUILD);

  const state = {
    project: model.createDefaultProject(),
    currentPageId: null,
    selection: { type: 'page' },
    // 属性面板「表格」卡片聚焦的表格下标（null = 无聚焦）；chrome 据此画聚焦高亮
    focusTableIndex: null,
    shapeTool: { active: false, target: 'content', pageId: null, preview: null }
  };
  state.currentPageId = state.project.pages[0].id;

  let pendingImageElementId = null;
  let uiRenderDepth = 0;

  let lastExternalDraftNotice = 0;

  // 方向键微调的撤销合并会话：同选择、同方向的连续微调只产生一条撤销记录
  const nudgeSession = { key: null, direction: null };

  const undo = {
    stack: [],
    max: 20
  };

  function pushUndo(label) {
    ctx.undo.stack.push({
      label: label,
      project: model.clone(state.project),
      currentPageId: state.currentPageId,
      selection: model.clone(state.selection)
    });
    if (ctx.undo.stack.length > ctx.undo.max) ctx.undo.stack.shift();
  }

  // 撤销后按快照里的 id 重新命中；失效则退回页面选区
  function restoredSelection(selection) {
    if (!selection) return { type: 'page' };
    if (selection.type === 'element' && findElementAnywhere(selection.id)) return selection;
    const page = currentPage();
    if (selection.type === 'background' && page && model.canEditPageBackground(state.project, page)) {
      return selection;
    }
    if (selection.type === 'backgroundItem' && page && model.canEditPageBackground(state.project, page)) {
      const exists = (page.background.items || []).some(function (item) {
        return item.id === selection.itemId;
      });
      if (exists) return selection;
    }
    if (selection.type === 'backgroundImage' && page && model.canEditPageBackground(state.project, page)) {
      const exists = (page.background.items || page.background.images || []).some(function (item) {
        return item.id === selection.imageId;
      });
      if (exists) return { type: 'backgroundItem', itemId: selection.imageId };
    }
    return { type: 'page' };
  }

  function performUndo() {
    const entry = ctx.undo.stack.pop();
    if (!entry) {
      ui.toast('没有可撤销的操作。');
      return;
    }
    // 撤销会替换项目状态，微调会话的旧快照随之失效
    ctx.nudgeSession.key = null;
    ctx.nudgeSession.direction = null;
    state.project = entry.project;
    state.currentPageId = model.getPage(state.project, entry.currentPageId)
      ? entry.currentPageId
      : state.project.pages[0].id;
    state.selection = restoredSelection(entry.selection);
    ui.renderAll();
    ctx.draft.scheduleDraftSave();
    ui.toast('已撤销：' + entry.label + '。');
  }

    const surface = {
    pane: null,
    viewEl: null,
    overlay: null,
    overlayCtx: null,
    overlayChrome: null,
    overlayChromeCtx: null,
    bgCanvas: null,
    bgCtx: null,
    contentCanvas: null,
    contentCtx: null,
    scrollEl: null,
    stageEl: null,
    zoomInput: null,
    zoomOutBtn: null,
    zoomInBtn: null,
    scrollRaf: 0,
    drag: null,
    hoverPoint: null,
    inlineEditor: null,
    overflowCache: null
  };

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
    paddingX: 48,
    paddingY: 16,
    originX: 0,
    originY: 0,
    stageWidth: 0,
    stageHeight: 0,
    scrollX: 0,
    scrollY: 0
  };

  const ctx = {
    state: state,
    surface: surface,
    viewport: viewport,
    actions: {},
    chrome: null,
    interactions: null,
    backgrounds: null,
    presets: null,
    importExport: null,
    draft: null,
    undo: undo,
    nudgeSession: nudgeSession
  };


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
    return (state.selection.type === 'background' ||
      state.selection.type === 'backgroundItem' ||
      state.selection.type === 'backgroundImage') &&
      model.canEditPageBackground(state.project, currentPage());
  }

  function backgroundItems(page) {
    const background = page && page.background;
    return background && (background.items || background.images) || [];
  }

  function selectedBackgroundItem() {
    const selection = state.selection;
    const itemId = selection.type === 'backgroundItem'
      ? selection.itemId
      : (selection.type === 'backgroundImage' ? selection.imageId : null);
    if (!itemId) return null;
    const page = currentPage();
    if (!page || !model.canEditPageBackground(state.project, page)) return null;
    return backgroundItems(page).find(function (item) {
      return item.id === itemId;
    }) || null;
  }

  function selectedBackgroundImage() {
    const item = selectedBackgroundItem();
    return item && item.kind === 'image' ? item : null;
  }

  function selectedBackgroundShape() {
    const item = selectedBackgroundItem();
    return item && item.kind === 'shape' ? item : null;
  }

  function backgroundItemBounds(item) {
    if (!item) return { x: 0, y: 0, width: 0, height: 0 };
    if (item.kind === 'shape' || item.kind === 'text') {
      return { x: item.x, y: item.y, width: item.width, height: item.height };
    }
    const loaded = item.assetId ? L.assets.getCachedImage(item.assetId) : null;
    if (!loaded) return renderer.backgroundImageRect(state.project.pageSize, item, null);
    return renderer.backgroundVisibleRect(state.project.pageSize, item, loaded);
  }

  function backgroundImageBounds(image) {
    return backgroundItemBounds(image);
  }

  function findElementAnywhere(id) {
    return model.findElement(state.project, id);
  }




























  /* ---------- rotated handle cursors ---------- */

  // 双向箭头字形与手柄类型无关，只随方向旋转；按 1° 归一化角度缓存光标串。
  // 屏幕 y 向下、正角顺时针：0° 水平、45° “\”、90° 竖直、135° “/”。








  /* ---------- hit testing ---------- */





  /* ---------- pointer interactions ---------- */







  /* ---------- drag and drop ---------- */



  function placeCategory(name) {
    const page = currentPage();
    if (!page) return;
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
    const width = Math.max(
      120,
      state.project.pageSize.width - state.project.margins.left - state.project.margins.right
    );
    const position = layout.categoryDropPosition(page, state.project, Infinity);
    pushUndo('放置分类');
    const element = model.createCategoryElement(name, position.x, position.y, state.project, width, page);
    page.elements.push(element);
    state.selection = { type: 'element', id: element.id };
    ui.renderAll();
    ui.toast('已把“' + name + '”放到第 ' + (state.project.pages.indexOf(page) + 1) + ' 页。', 'success');
  }

  /* ---------- page and selection actions ---------- */

  // 统一插入落点解析：纯逻辑在 model.insertTarget（Node 回归可测），此处仅转接。
  function insertTarget(selection, project, page) {
    return model.insertTarget(selection, project, page);
  }

  /* 静态节点（工具条按钮）可直接命令式更新；属性面板里的入口按钮每次重渲染都会重建，
     其按下态必须在渲染期从 state.shapeTool 派生。 */
  // 统一插入组按钮态：aria-label 随落点声明，被覆盖页选中背景时禁用（aria-disabled 保留点击以给出提示）。
  function updateInsertButtons() {
    const page = currentPage();
    const resolved = insertTarget(state.selection, state.project, page);
    const labels = {
      'btn-add-text': ['添加文字', '添加背景文字'],
      'btn-add-image': ['添加图片（也可 Ctrl+V 粘贴）', '添加背景图片'],
      'btn-add-shape': ['添加图形（拖拽绘制，单击插入方形，画一次即退出）', '添加背景图形（拖拽绘制，单击插入方形，画一次即退出）']
    };
    Object.keys(labels).forEach(function (id) {
      const button = document.getElementById(id);
      if (!button) return;
      const isBackground = resolved.target === 'background';
      button.setAttribute('aria-label', isBackground ? labels[id][1] : labels[id][0]);
      button.setAttribute('aria-disabled', resolved.disabled ? 'true' : 'false');
      button.classList.toggle('is-disabled', resolved.disabled);
      button.title = resolved.disabled ? resolved.reason : '';
    });
  }

  function updateShapeToolButton() {
    // 落点在工具激活时锁定：单按钮，按下态即表示工具激活。
    const button = document.getElementById('btn-add-shape');
    const active = state.shapeTool.active;
    if (button) {
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('is-active', active);
    }
    const pane = document.getElementById('canvas-pane');
    if (pane) pane.classList.toggle('shape-tool-active', active);
  }

  function exitShapeTool() {
    if (!state.shapeTool.active) return;
    state.shapeTool.active = false;
    state.shapeTool.pageId = null;
    state.shapeTool.preview = null;
    updateShapeToolButton();
    if (ctx.chrome) ctx.chrome.refreshHoverCursor();
  }

  function toggleShapeTool() {
    const page = currentPage();
    if (!page) return;
    if (state.shapeTool.active && state.shapeTool.pageId === page.id) {
      exitShapeTool();
      ui.renderAll();
      return;
    }
    const resolved = insertTarget(state.selection, state.project, page);
    if (resolved.target === 'background') {
      if (resolved.disabled) {
        ui.toast(resolved.reason);
        return;
      }
    }
    state.shapeTool.active = true;
    state.shapeTool.target = resolved.target;
    state.shapeTool.pageId = page.id;
    state.shapeTool.preview = null;
    state.selection = { type: 'page' };
    updateShapeToolButton();
    ui.renderAll();
    ui.toast(resolved.target === 'background'
      ? '图形工具：拖拽或单击，把图形添加到背景层；画一次即退出，Esc 取消。'
      : '图形工具：拖拽或单击，把图形添加到内容层；画一次即退出，Esc 取消。');
  }

  function selectPage() {
    exitShapeTool();
    state.selection = { type: 'page' };
    if (uiRenderDepth > 0) ctx.viewport.redraw();
    else ui.renderAll();
  }

  function selectBackground() {
    exitShapeTool();
    const page = currentPage();
    if (!page || !model.canEditPageBackground(state.project, page)) return;
    state.selection = { type: 'background' };
    ui.renderAll();
  }

  // 选中图层面板的常驻「内容层」分组头行：插入落点切到内容层。
  // 不退出图形工具——落点在激活时已锁定，激活期间改变选中 MUST NOT 改变本会话落点。
  function selectContentLayer() {
    state.selection = { type: 'content-layer' };
    ui.renderAll();
  }

  function selectBackgroundItem(itemId) {
    exitShapeTool();
    const page = currentPage();
    if (!page || !model.canEditPageBackground(state.project, page)) return;
    const item = backgroundItems(page).find(function (entry) { return entry.id === itemId; });
    if (!item) return;
    state.selection = { type: 'backgroundItem', itemId: itemId };
    ui.renderAll();
  }

  function selectBackgroundImage(imageId) {
    const page = currentPage();
    if (!page) return;
    const image = backgroundItems(page).find(function (item) {
      return item.id === imageId && item.kind === 'image';
    });
    if (!image) return;
    selectBackgroundItem(imageId);
  }

  function selectBackgroundShape(shapeId) {
    const page = currentPage();
    if (!page) return;
    const item = backgroundItems(page).find(function (entry) {
      return entry.id === shapeId && entry.kind === 'shape';
    });
    if (!item) return;
    selectBackgroundItem(shapeId);
  }

  function selectElement(id) {
    exitShapeTool();
    const page = currentPage();
    if (!page) return;
    const element = page.elements.find(function (item) { return item.id === id; });
    if (!element) return;
    state.selection = { type: 'element', id: id };
    ui.renderAll();
  }

  // 方向键微调：返回是否移动了对象（true 时调用方应 preventDefault）
  function nudgeSelection(dx, dy) {
    const page = currentPage();
    if (!page) return false;
    let target = null;
    let key = null;
    let label = '';
    let layers = ['content', 'overlay'];
    if (state.selection.type === 'element') {
      target = page.elements.find(function (item) { return item.id === state.selection.id; });
      if (target) {
        key = 'el:' + target.id;
        label = '微调元素';
      }
    } else if ((state.selection.type === 'backgroundItem' || state.selection.type === 'backgroundImage') &&
      model.canEditPageBackground(state.project, page)) {
      target = selectedBackgroundItem();
      if (target) {
        key = 'bg:' + target.id;
        label = '微调背景条目';
        layers = ['bg', 'overlay'];
      }
    }
    if (!target) return false;
    const direction = (dx < 0 ? 'l' : dx > 0 ? 'r' : '') + (dy < 0 ? 'u' : dy > 0 ? 'd' : '');
    if (ctx.nudgeSession.key !== key || ctx.nudgeSession.direction !== direction) {
      ctx.nudgeSession = { key: key, direction: direction };
      pushUndo(label);
    }
    target.x = Math.round((target.x || 0) + dx);
    target.y = Math.round((target.y || 0) + dy);
    changed({ property: false, layers: layers });
    ui.renderAll();
    return true;
  }

  function switchPage(pageId) {
    exitShapeTool();
    const page = model.getPage(state.project, pageId);
    if (!page) return;
    state.currentPageId = pageId;
    state.selection = { type: 'page' };
    ui.renderAll();
  }

  function addPageDialog() {
    const current = currentPage();
    const page = model.createPage(model.effectiveBackground(state.project, current));
    pushUndo('新增页面');
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
      pushUndo('删除页面');
      state.project.pages.splice(index, 1);
      if (state.project.globalBackgroundPageId === page.id) {
        model.clearGlobalBackground(state.project);
      }
      const next = state.project.pages[Math.min(index, state.project.pages.length - 1)];
      state.currentPageId = next.id;
      state.selection = { type: 'page' };
      ui.renderAll();
      ui.toast('已删除页面。');
    });
  }

  function deleteSelection() {
    const page = currentPage();
    const backgroundItem = selectedBackgroundItem();
    if (page && backgroundItem && model.canEditPageBackground(state.project, page)) {
      const label = backgroundItem.kind === 'shape' ? '图形' : backgroundItem.kind === 'text' ? '文字' : '图片';
      ui.modal.confirm('删除背景' + label, '确定删除当前背景' + label + '吗？',
        { confirmLabel: '删除', danger: true }).then(function (ok) {
        if (!ok) return;
        const items = backgroundItems(page);
        const index = items.indexOf(backgroundItem);
        if (index < 0) return;
        pushUndo('删除背景条目');
        items.splice(index, 1);
        if (backgroundItem.assetId) releaseUnusedAsset(backgroundItem.assetId);
        state.selection = { type: 'background' };
        ui.renderAll();
        ui.toast('已删除背景' + label + '。');
      });
      return;
    }
    const element = selectedElement();
    if (!page || !element) return;
    const isCategory = element.type === 'category';
    let kind = '图片';
    if (element.type === 'text') kind = '文字';
    if (element.type === 'shape') kind = '图形';
    const message = isCategory
      ? '删除分类块“' + element.category + '”？该分类会回到左侧未放置状态。'
      : '确定删除当前' + kind + '元素吗？';
    ui.modal.confirm('删除元素', message, { confirmLabel: '删除', danger: true }).then(function (ok) {
      if (!ok) return;
      const index = page.elements.indexOf(element);
      if (index < 0) return;
      pushUndo('删除元素');
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
    pushUndo('调整图层顺序');
    page.elements.splice(index, 1);
    page.elements.splice(target, 0, element);
    ui.renderAll();
  }

  function moveLayerTo(id, targetId, placement) {
    const page = currentPage();
    if (!page) return false;
    const plan = model.planDisplayMove(page.elements, id, targetId, placement);
    if (!plan) return false;
    pushUndo('调整图层顺序');
    model.moveItem(page.elements, plan.from, plan.to);
    ui.renderAll();
    return true;
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

  const songKey = L.playlistCheck.key;
  const diffSongChanges = L.playlistCheck.diffSongs;
  const countSongChanges = L.playlistCheck.countSongChanges;

  function songOrderChanged(original, next) {
    if (original.length !== next.length) return false;
    for (let i = 0; i < original.length; i += 1) {
      if (songKey(original[i]) !== songKey(next[i])) return true;
    }
    return false;
  }

  function applyPlaylistEdits(categories) {
    pushUndo('编辑歌单');
    const renameMap = {};
    const summary = { renamed: 0, modified: 0, added: 0, removed: 0, sorted: 0 };
    categories.forEach(function (category) {
      if (category.originalName !== category.name) {
        renameMap[category.originalName] = category.name;
        summary.renamed += 1;
      }
      const originalSongs = category.originalSongs || [];
      const diff = diffSongChanges(originalSongs, category.songs);
      summary.modified += diff.modified;
      summary.added += diff.added;
      summary.removed += diff.removed;
      if (category.sorted && songOrderChanged(originalSongs, category.songs)) {
        summary.sorted += 1;
      }
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
    if (summary.modified) parts.push(summary.modified + ' 处歌名修改');
    if (summary.added) parts.push(summary.added + ' 首新增');
    if (summary.removed) parts.push(summary.removed + ' 首删除');
    if (summary.renamed) parts.push(summary.renamed + ' 个分类改名');
    if (summary.sorted) parts.push(summary.sorted + ' 个分类已排序');
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
    pushUndo('修改页面尺寸');
    state.project.pageSize.width = Math.round(clamp(w, model.PAGE_SIZE_MIN, model.PAGE_SIZE_MAX));
    state.project.pageSize.height = Math.round(clamp(h, model.PAGE_SIZE_MIN, model.PAGE_SIZE_MAX));
    ui.renderAll();
    ctx.draft.scheduleDraftSave();
  }

  function setMargins(margins) {
    if (!margins) return;
    pushUndo('修改页边距');
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

  function autoLayoutCategory(element, options) {
    if (!element || element.type !== 'category') return { ok: false, reason: 'invalid' };
    const category = model.getCategory(state.project, element.category);
    const result = layout.arrangeTables(element, category, options);
    if (!result || !Array.isArray(result.tables) || !result.tables.length) {
      return { ok: false, reason: 'unsupported' };
    }
    pushUndo('自动布局');
    element.tables = result.tables;
    changed({ property: false });
    return { ok: true, result: result };
  }

  function changed(options) {
    const opts = options || {};
    if (opts.property === false) {
      if (layout.invalidate) layout.invalidate();
      ctx.viewport.scheduleRedraw(opts.layers || ['content', 'overlay']);
      return;
    }
    ui.renderAll();
  }

  /* 属性面板表格卡片的聚焦状态：仅影响编辑装饰层（drawSelection 所在的 overlay），不进导出 */
  function setFocusTableIndex(index) {
    const next = Number.isInteger(index) ? index : null;
    if (state.focusTableIndex === next) return;
    state.focusTableIndex = next;
    changed({ property: false, layers: ['overlay'] });
  }

  /* ---------- 属性意图动作（供 UI 面板写入） ---------- */

  const ELEMENT_FIELDS = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'blur', 'text', 'showTitle',
    'brightness', 'hue', 'fadeMode', 'fadeAngle',
    'fadePosition', 'fadeWidth', 'fadeTop', 'fadeBottom',
    'shape', 'mode', 'color', 'radius', 'strokeWidth'];
  const ELEMENT_STYLE_FIELDS = ['fontSize', 'fontWeight', 'color', 'lineHeight', 'align', 'fontFamily', 'fontFamilies'];
  const BACKGROUND_TEXT_FIELDS = ['x', 'y', 'width', 'text'];
  const BACKGROUND_TEXT_STYLE_FIELDS = ['fontSize', 'fontWeight', 'color', 'lineHeight', 'align', 'fontFamily', 'fontFamilies'];

  function setElementField(field, value) {
    const element = selectedElement();
    if (!element || ELEMENT_FIELDS.indexOf(field) === -1) return;
    element[field] = value;
    changed({ property: false });
  }

  /* 背景文字条目的字段写入：UI 不直改模型，统一走这里调度重绘。 */
  function setBackgroundItemField(field, value) {
    const item = selectedBackgroundItem();
    if (!item || item.kind !== 'text' || BACKGROUND_TEXT_FIELDS.indexOf(field) === -1) return;
    item[field] = value;
    changed({ property: false, layers: ['bg', 'overlay'] });
  }

  function setBackgroundItemStyleField(field, value) {
    const item = selectedBackgroundItem();
    if (!item || item.kind !== 'text' || !item.style ||
        BACKGROUND_TEXT_STYLE_FIELDS.indexOf(field) === -1) return;
    item.style[field] = value;
    changed({ property: false, layers: ['bg', 'overlay'] });
  }

  function cachedNatural(assetId) {
    const image = assetId ? L.assets.getCachedImage(assetId) : null;
    if (!image) return null;
    const size = L.assets.imageSize(image);
    const width = size.width;
    const height = size.height;
    return width > 0 && height > 0 ? { width: width, height: height } : null;
  }

  function setElementCrop(side, value) {
    const element = selectedElement();
    if (!element || element.type !== 'image') return;
    const natural = cachedNatural(element.assetId);
    if (!natural) return;
    pushUndo('裁剪图片');
    element.crop = model.setCropSide(element.crop, side, value, natural);
    ui.renderAll();
  }

  function resetElementCrop() {
    const element = selectedElement();
    if (!element || element.type !== 'image') return;
    pushUndo('重置裁剪');
    model.resetCrop(element);
    ui.renderAll();
  }

  function setElementVisibleSize(field, value) {
    const element = selectedElement();
    if (!element || element.type !== 'image' || (field !== 'width' && field !== 'height')) return;
    const natural = cachedNatural(element.assetId);
    const next = Math.max(1, Number(value) || 0);
    if (!natural) {
      element[field] = Math.round(next);
    } else {
      const frame = { x: element.x, y: element.y, width: element.width, height: element.height };
      const visible = model.visibleRect(frame, natural, element.crop);
      visible[field] = next;
      const nextFrame = model.frameRectFromVisible(visible, natural, element.crop);
      element[field] = nextFrame[field];
    }
    changed({ property: false });
    if (ui.updateCropSummary) {
      ui.updateCropSummary('prop-img', element, {
        x: element.x, y: element.y, width: element.width, height: element.height
      });
    }
  }

  function backgroundImageById(imageId) {
    const page = currentPage();
    if (!page) return null;
    const items = page.background.items || page.background.images || [];
    return items.find(function (item) {
      return item.id === imageId && item.kind === 'image';
    }) || null;
  }

  function setBackgroundImageCrop(imageId, side, value) {
    const page = currentPage();
    if (!page || !model.canEditPageBackground(state.project, page)) return;
    const image = backgroundImageById(imageId);
    if (!image) return;
    const natural = cachedNatural(image.assetId);
    if (!natural) return;
    pushUndo('裁剪背景图');
    image.crop = model.setCropSide(image.crop, side, value, natural);
    ui.renderAll();
  }

  function resetBackgroundImageCrop(imageId) {
    const page = currentPage();
    if (!page || !model.canEditPageBackground(state.project, page)) return;
    const image = backgroundImageById(imageId);
    if (!image) return;
    pushUndo('重置背景裁剪');
    model.resetCrop(image);
    ui.renderAll();
  }

  function setBackgroundImageVisibleSize(imageId, field, value) {
    const page = currentPage();
    if (!page || !model.canEditPageBackground(state.project, page)) return;
    const image = backgroundImageById(imageId);
    if (!image || image.fit !== 'none' || (field !== 'width' && field !== 'height')) return;
    const natural = cachedNatural(image.assetId);
    const next = Math.max(1, Number(value) || 0);
    if (!natural) {
      image[field] = Math.round(next);
    } else {
      const frame = { x: image.x, y: image.y, width: image.width, height: image.height };
      const visible = model.visibleRect(frame, natural, image.crop);
      visible[field] = next;
      const nextFrame = model.frameRectFromVisible(visible, natural, image.crop);
      image[field] = nextFrame[field];
    }
    changed({ property: false, layers: ['bg', 'overlay'] });
    if (ui.updateCropSummary) {
      const loaded = image.assetId ? L.assets.getCachedImage(image.assetId) : null;
      ui.updateCropSummary('prop-bg', image,
        renderer.backgroundImageRect(state.project.pageSize, image, loaded));
    }
  }

  function setElementStyleField(field, value) {
    const element = selectedElement();
    if (!element || !element.style || ELEMENT_STYLE_FIELDS.indexOf(field) === -1) return;
    element.style[field] = value;
    changed({ property: false });
  }

  function setBackgroundColor(color) {
    const page = currentPage();
    if (!page || !model.canEditPageBackground(state.project, page)) return;
    page.background.color = color;
    changed({ property: false, layers: ['bg', 'overlay'] });
    // 取色器保持焦点时不重渲染面板，这里直接补画可见的背景缩略图。
    renderer.paintBackgroundPreviews(ui.els.propertyPanel);
  }

  const SHAPE_FIELDS = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'blur',
    'brightness', 'hue', 'fadeMode', 'fadeAngle',
    'fadePosition', 'fadeWidth', 'fadeTop', 'fadeBottom',
    'shape', 'mode', 'color', 'radius', 'strokeWidth'];

  function shapeEditTarget() {
    const element = selectedElement();
    if (element && element.type === 'shape') {
      return { item: element, background: false };
    }
    const backgroundShape = selectedBackgroundShape();
    if (backgroundShape) {
      return { item: backgroundShape, background: true };
    }
    return null;
  }

  function shapeChanged(background) {
    changed({ property: false, layers: background ? ['bg', 'overlay'] : ['content', 'overlay'] });
  }

  function setShapeField(field, value) {
    const target = shapeEditTarget();
    if (!target || SHAPE_FIELDS.indexOf(field) === -1) return;
    target.item[field] = value;
    shape.clampShape(target.item);
    shapeChanged(target.background);
  }

  function setShapeKind(kind) {
    const target = shapeEditTarget();
    if (!target || shape.SHAPE_KINDS.indexOf(kind) === -1) return;
    target.item.shape = kind;
    shape.clampShape(target.item);
    shapeChanged(target.background);
  }

  // 菱形内夹角只由外接框宽高推导；输入角度时保留长边，改短边。
  function setShapeAngle(angle) {
    const target = shapeEditTarget();
    if (!target || target.item.shape !== 'diamond') return;
    const size = shape.diamondSizeFromAngle(target.item.width, target.item.height, angle);
    target.item.width = size.width;
    target.item.height = size.height;
    shape.clampShape(target.item);
    shapeChanged(target.background);
  }

  function setBackgroundImageField(imageId, field, value) {
    const page = currentPage();
    if (!page || !model.canEditPageBackground(state.project, page)) return;
    const image = backgroundItems(page).find(function (item) { return item.id === imageId; });
    if (!image || image.kind === 'shape' || field !== 'keepRatio') return;
    image.keepRatio = !!value;
    changed({ property: false, layers: ['bg', 'overlay'] });
  }

  /* ---------- content creation ---------- */

  // 统一插入入口：按 insertTarget 的解析结果分发到内容层或背景层。
  function insertText() {
    const page = currentPage();
    if (!page) return;
    if (insertTarget(state.selection, state.project, page).target === 'background') {
      addBackgroundText();
    } else {
      addText();
    }
  }

  function insertImage() {
    const page = currentPage();
    if (!page) return;
    if (insertTarget(state.selection, state.project, page).target === 'background') {
      ctx.backgrounds.pickBackgroundImage(null);
    } else {
      pickFreeImage();
    }
  }

  function addText() {
    const page = currentPage();
    if (!page) return;
    const element = model.createTextElement(state.project, '双击编辑文字', page);
    page.elements.push(element);
    state.selection = { type: 'element', id: element.id };
    ui.renderAll();
    ui.toast('已添加文字，双击可编辑。');
  }

  // 背景层加字：条目写入 page.background.items，行为对齐背景图形（固定坐标、选中、一条撤销）。
  function addBackgroundText() {
    const page = currentPage();
    if (!page || !model.canEditPageBackground(state.project, page)) return;
    pushUndo('添加背景文字');
    const item = model.createBackgroundText(state.project, '背景文字');
    page.background.items.push(item);
    state.selection = { type: 'backgroundItem', itemId: item.id };
    ui.renderAll();
    ui.toast('已添加背景文字，在图层面板或画布选中后编辑。');
  }

  function pickFreeImage(elementId) {
    pendingImageElementId = elementId || null;
    const input = document.getElementById('free-image-file');
    input.value = '';
    input.click();
  }

  function assetIsReferenced(assetId) {
    if (!assetId) return false;
    return state.project.pages.some(function (page) {
      const items = page.background && (page.background.items || page.background.images) || [];
      const backgroundReferenced = items.some(function (item) {
        return item.kind === 'image' && item.assetId === assetId;
      });
      const elementReferenced = page.elements.some(function (element) {
        return element.type === 'image' && element.assetId === assetId;
      });
      return backgroundReferenced || elementReferenced;
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
      await ctx.draft.persistDraftAssetQuietly(assetId);
      return { assetId: assetId, image: image };
    } catch (err) {
      releaseUnusedAsset(assetId);
      throw err;
    }
  }

  function buildFreeImageElement(assetId, image, offset) {
    const natural = L.assets.imageSize(image);
    const naturalWidth = natural.width || 400;
    const naturalHeight = natural.height || 300;
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
          model.resetCrop(found.element);
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
    const natural = L.assets.imageSize(cached);
    const naturalWidth = natural.width;
    const naturalHeight = natural.height;
    if (!naturalWidth || !naturalHeight) return;
    const aspect = model.visibleAspect(
      { width: naturalWidth, height: naturalHeight },
      element.crop
    );
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const width = Math.max(40, element.width);
    const height = Math.max(40, aspect > 0 ? width / aspect : naturalHeight);
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
    const pageSize = state.project.pageSize;
    const loaded = image.assetId ? L.assets.getCachedImage(image.assetId) : null;
    // 烘焙完整框，而不是可见框；裁剪值保持，否则会二次裁剪。
    const frame = renderer.backgroundImageRect(pageSize, image, loaded);
    image.fit = 'none';
    image.x = Math.round(frame.width > 0 ? frame.x : 0);
    image.y = Math.round(frame.height > 0 ? frame.y : 0);
    image.width = Math.round(frame.width > 0 ? frame.width : pageSize.width);
    image.height = Math.round(frame.height > 0 ? frame.height : pageSize.height);
  }





  /* ---------- import ---------- */





  /* ---------- draft persistence ---------- */







  /* ---------- import / export ---------- */




  /* ---------- bootstrap ---------- */

  async function init() {
    ctx.viewport.setupSurface();
    ui.init();
    ui.setStartupLoading(true);
    const originalRenderAll = ui.renderAll;
    ui.renderAll = function () {
      uiRenderDepth += 1;
      try {
        return originalRenderAll.apply(ui, arguments);
      } finally {
        uiRenderDepth -= 1;
      }
    };

    surface.overlay.addEventListener('pointerdown', ctx.interactions.onPointerDown);
    surface.overlay.addEventListener('pointermove', ctx.interactions.onPointerMove);
    surface.overlay.addEventListener('pointerleave', ctx.interactions.onPointerLeave);
    surface.overlay.addEventListener('pointerup', ctx.interactions.onPointerUp);
    surface.overlay.addEventListener('pointercancel', ctx.interactions.onPointerUp);
    surface.overlay.addEventListener('dblclick', ctx.interactions.onDoubleClick);
    surface.overlay.addEventListener('dragover', ctx.interactions.onDragOver);
    surface.overlay.addEventListener('drop', ctx.interactions.onDrop);
    surface.pane.addEventListener('wheel', ctx.viewport.onCanvasWheel, { passive: false });
    if (surface.scrollEl) surface.scrollEl.addEventListener('scroll', ctx.viewport.onCanvasScroll);

    window.addEventListener('pagehide', ctx.draft.flushDraftSync);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') ctx.draft.flushDraftSync();
    });
    window.addEventListener('storage', function (event) {
      if (!event || event.key !== L.io.DRAFT_KEY) return;
      if (ctx.draft.restoring) return;
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

    let startup;
    try {
      startup = await ctx.draft.restoreDraftOnStartup();
      ctx.viewport.fit();
      ui.renderAll();
    } finally {
      ctx.draft.restoring = false;
      ui.setStartupLoading(false);
    }

    if (startup.reason === 'unavailable') {
      ctx.draft.enabled = false;
      ctx.draft.setDraftStatus('unavailable', startup.error || '浏览器本地存储不可用');
    } else {
      ctx.draft.enabled = true;
      ctx.draft.setDraftStatus(startup.restored ? 'saved' : 'idle');
      if (startup.restored && startup.missingCount) {
        ctx.draft.saveDraftNow({ force: true });
      }
    }

    ctx.draft.notifyDraftRecovery(startup);
  }

  /* ---------- 子域装配 ---------- */

  Object.assign(ctx.actions, {
    changed: changed,
    currentPage: currentPage,
    selectedElement: selectedElement,
    editingBackground: editingBackground,
    selectedBackgroundImage: selectedBackgroundImage,
    selectedBackgroundItem: selectedBackgroundItem,
    selectedBackgroundShape: selectedBackgroundShape,
    backgroundItemBounds: backgroundItemBounds,
    canEditPageBackground: function (page) {
      return model.canEditPageBackground(state.project, page);
    },
    backgroundImageBounds: backgroundImageBounds,
    switchPage: switchPage,
    ensureCustomBackgroundImage: ensureCustomBackgroundImage,
    pushUndo: pushUndo,
    releaseUnusedAsset: releaseUnusedAsset,
    countSongChanges: countSongChanges,
    findElementAnywhere: findElementAnywhere,
    selectPage: selectPage,
    selectElement: selectElement,
    selectBackground: selectBackground,
    selectContentLayer: selectContentLayer,
    selectBackgroundImage: selectBackgroundImage,
    selectBackgroundItem: selectBackgroundItem,
    selectBackgroundShape: selectBackgroundShape,
    placeCategory: placeCategory,
    openPlaylistEditor: openPlaylistEditor,
    setPageSize: setPageSize,
    setMargins: setMargins,
    autoLayoutCategory: autoLayoutCategory,
    resizeElementWidth: resizeElementWidth,
    setImageKeepRatio: setImageKeepRatio,
    setElementField: setElementField,
    setBackgroundItemField: setBackgroundItemField,
    setBackgroundItemStyleField: setBackgroundItemStyleField,
    setElementCrop: setElementCrop,
    resetElementCrop: resetElementCrop,
    setElementVisibleSize: setElementVisibleSize,
    setBackgroundImageCrop: setBackgroundImageCrop,
    resetBackgroundImageCrop: resetBackgroundImageCrop,
    setBackgroundImageVisibleSize: setBackgroundImageVisibleSize,
    setElementStyleField: setElementStyleField,
    setShapeField: setShapeField,
    setShapeKind: setShapeKind,
    setShapeAngle: setShapeAngle,
    setBackgroundColor: setBackgroundColor,
    setBackgroundImageField: setBackgroundImageField,
    addText: addText,
    insertText: insertText,
    insertImage: insertImage,
    addBackgroundText: addBackgroundText,
    updateInsertButtons: updateInsertButtons,
    insertTarget: insertTarget,
    pickFreeImage: pickFreeImage,
    handleFreeImageFile: handleFreeImageFile,
    handlePastedImages: handlePastedImages,
    toggleShapeTool: toggleShapeTool,
    exitShapeTool: exitShapeTool,
    moveLayer: moveLayer,
    deleteSelection: deleteSelection,
    addPageDialog: addPageDialog,
    deleteCurrentPage: deleteCurrentPage,
    jumpToCategory: jumpToCategory,
    nudgeSelection: nudgeSelection
  });

  ctx.draft = L.appDraft.create(ctx);
  ctx.chrome = L.appChrome.create(ctx);
  Object.assign(ctx.viewport, L.appViewport.create(ctx));
  ctx.interactions = L.appInteractions.create(ctx);
  ctx.backgrounds = L.appBackgrounds.create(ctx);
  Object.assign(ctx.actions, {
    setGlobalBackgroundPage: ctx.backgrounds.setGlobalBackgroundPage,
    clearGlobalBackground: ctx.backgrounds.clearGlobalBackground,
    copyBackgroundFromPage: ctx.backgrounds.copyBackgroundFromPage,
    clearPageBackground: ctx.backgrounds.clearPageBackground,
    replacePageBackground: ctx.backgrounds.replacePageBackground
  });
  ctx.presets = L.appPresets.create(ctx);
  ctx.importExport = L.appImportExport.create(ctx);

  L.app = {
    state: state,
    init: init,
    currentPage: currentPage,
    selectedElement: selectedElement,
    selectPage: selectPage,
    selectBackground: selectBackground,
    selectContentLayer: selectContentLayer,
    selectBackgroundImage: selectBackgroundImage,
    selectBackgroundItem: selectBackgroundItem,
    selectBackgroundShape: selectBackgroundShape,
    selectedBackgroundItem: selectedBackgroundItem,
    selectedBackgroundImage: selectedBackgroundImage,
    selectedBackgroundShape: selectedBackgroundShape,
    backgroundItemBounds: backgroundItemBounds,
    selectElement: selectElement,
    nudgeSelection: nudgeSelection,
    switchPage: switchPage,
    addPageDialog: addPageDialog,
    addPage: addPageDialog,
    deleteCurrentPage: deleteCurrentPage,
    jumpToCategory: jumpToCategory,
    openPlaylistEditor: openPlaylistEditor,
    changed: changed,
    setFocusTableIndex: setFocusTableIndex,
    fit: ctx.viewport.fit,
    redraw: ctx.viewport.redraw,
    handleResize: ctx.viewport.handleResize,
    zoomIn: ctx.viewport.zoomIn,
    zoomOut: ctx.viewport.zoomOut,
    zoomFit: ctx.viewport.fit,
    setZoomPercent: ctx.viewport.setZoomPercent,
    getZoomPercent: function () {
      return Math.round(viewport.scale * 100);
    },
    isFitMode: function () {
      return viewport.mode === 'fit';
    },
    setPageSize: setPageSize,
    setMargins: setMargins,
    autoLayoutCategory: autoLayoutCategory,
    resizeElementWidth: resizeElementWidth,
    addText: addText,
    insertText: insertText,
    insertImage: insertImage,
    addBackgroundText: addBackgroundText,
    updateInsertButtons: updateInsertButtons,
    insertTarget: insertTarget,
    pickFreeImage: pickFreeImage,
    handleFreeImageFile: handleFreeImageFile,
    handlePastedImages: handlePastedImages,
    toggleShapeTool: toggleShapeTool,
    exitShapeTool: exitShapeTool,
    setImageKeepRatio: setImageKeepRatio,
    setElementField: setElementField,
    setBackgroundItemField: setBackgroundItemField,
    setBackgroundItemStyleField: setBackgroundItemStyleField,
    setElementCrop: setElementCrop,
    resetElementCrop: resetElementCrop,
    setElementVisibleSize: setElementVisibleSize,
    setBackgroundImageCrop: setBackgroundImageCrop,
    resetBackgroundImageCrop: resetBackgroundImageCrop,
    setBackgroundImageVisibleSize: setBackgroundImageVisibleSize,
    setElementStyleField: setElementStyleField,
    setShapeField: setShapeField,
    setShapeKind: setShapeKind,
    setShapeAngle: setShapeAngle,
    setBackgroundColor: setBackgroundColor,
    setBackgroundImageField: setBackgroundImageField,
    setGlobalBackgroundPage: ctx.backgrounds.setGlobalBackgroundPage,
    clearGlobalBackground: ctx.backgrounds.clearGlobalBackground,
    copyBackgroundFromPage: ctx.backgrounds.copyBackgroundFromPage,
    clearPageBackground: ctx.backgrounds.clearPageBackground,
    replacePageBackground: ctx.backgrounds.replacePageBackground,
    pickBackgroundImage: ctx.backgrounds.pickBackgroundImage,
    pickBackgroundImageWhole: ctx.backgrounds.pickBackgroundImageWhole,
    handleBackgroundFile: ctx.backgrounds.handleBackgroundFile,
    handleDroppedBackgroundFile: ctx.backgrounds.handleDroppedBackgroundFile,
    applyPreset: ctx.presets.applyPreset,
    deleteBackgroundImage: ctx.backgrounds.deleteBackgroundImage,
    deleteBackgroundItem: ctx.backgrounds.deleteBackgroundItem,
    moveBackgroundImage: ctx.backgrounds.moveBackgroundImage,
    moveBackgroundImageTo: ctx.backgrounds.moveBackgroundImageTo,
    moveBackgroundItem: ctx.backgrounds.moveBackgroundItem,
    moveBackgroundItemTo: ctx.backgrounds.moveBackgroundItemTo,
    setBackgroundImageFit: ctx.backgrounds.setBackgroundImageFit,
    restoreBackgroundImageFit: ctx.backgrounds.restoreBackgroundImageFit,
    setBackgroundImageValue: ctx.backgrounds.setBackgroundImageValue,
    openImport: ctx.importExport.openImport,
    exportPlaylist: ctx.importExport.exportPlaylist,
    handleImportFile: ctx.importExport.handleImportFile,
    placeCategory: placeCategory,
    undo: performUndo,
    newProject: ctx.importExport.newProject,
    exportProject: ctx.importExport.exportProject,
    openImportProject: ctx.importExport.openImportProject,
    handleImportProject: ctx.importExport.handleImportProject,
    saveProject: ctx.importExport.exportProject,
    openLoadProject: ctx.importExport.openImportProject,
    handleLoadFile: ctx.importExport.handleImportProject,
    moveLayer: moveLayer,
    moveLayerTo: moveLayerTo,
    deleteSelection: deleteSelection
  };

  L.debugStats = function () {
    return {
      draws: {
        redraws: ctx.viewport.stats.redraws,
        bg: ctx.viewport.stats.bg,
        content: ctx.viewport.stats.content,
        chrome: ctx.viewport.stats.chrome,
        overlay: ctx.viewport.stats.overlay,
        geometry: ctx.viewport.stats.geometry
      },
      layout: layout.getStats ? layout.getStats() : null
    };
  };

  L.resetDebugStats = function () {
    ctx.viewport.stats.redraws = 0;
    ctx.viewport.stats.bg = 0;
    ctx.viewport.stats.content = 0;
    ctx.viewport.stats.chrome = 0;
    ctx.viewport.stats.overlay = 0;
    ctx.viewport.stats.geometry = 0;
    if (layout.resetStats) layout.resetStats();
  };

  function boot() {
    init().catch(function (err) {
      console.error('[Listify] 初始化失败', err);
      try {
        ui.setStartupLoading(false);
        ui.toast('初始化失败：' + (err && err.message ? err.message : '未知错误'), 'error');
      } catch (ignored) { /* empty */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
