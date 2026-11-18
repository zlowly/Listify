(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const ui = L.ui = L.ui || {};

  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const esc = ui.esc;
  const field = ui.field;
  const fieldHelp = ui.fieldHelp;
  const fieldPair = ui.fieldPair;
  const propGroup = ui.propGroup;
  const helpTip = ui.helpTip;
  const numberTier = ui.numberTier;
  const numberInput = ui.numberInput;
  const textInput = ui.textInput;
  const colorInput = ui.colorInput;
  const selectInput = ui.selectInput;
  const rangeInput = ui.rangeInput;
  const weightOptions = ui.weightOptions;
  const alignOptions = ui.alignOptions;
  const bind = ui.bind;
  const valueOf = ui.valueOf;
  const normalizeAngle = ui.normalizeAngle;
  const setGroupCollapsed = ui.setGroupCollapsed;
  const openPresetPicker = ui.openPresetPicker;
  const openCopyBackground = ui.openCopyBackground;
  const advancedToggle = ui.advancedToggle;
  const bindAdvancedToggle = ui.bindAdvancedToggle;

  /* 图片效果：范围与默认值统一取自 model，面板只做格式化和夹取 */
  function effectNumber(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function clampEffect(raw, min, max, fallback) {
    if (raw == null || raw === '') return fallback;
    const value = Number(raw);
    if (!isFinite(value)) return fallback;
    return model.clamp(value, min, max);
  }

  function updateRangeLabel(id, text) {
    const label = document.getElementById(id + '-value');
    if (label) label.textContent = text;
  }

  function percentLabel(value) {
    return Math.round(value * 100) + '%';
  }

  function degreeLabel(value) {
    return value + '°';
  }

  /* 页面边距十字：上(1,2) 左(2,1) 右(2,3) 下(3,2)，中心页面示意 */
  function marginCross(margins, idPrefix) {
    const item = function (side) {
      return '<input id="' + idPrefix + side + '" class="input ' + numberTier(0, 1000, 1) + ' cross-' + side +
        '" type="number" min="0" max="1000" step="1" data-ctrl-step="10" value="' + esc(margins[side]) + '">';
    };
    return '<div class="margin-cross">' +
      item('top') + item('left') + item('right') +
      '<span class="cross-page"></span>' +
      item('bottom') +
    '</div>';
  }

  /* 重渲染前后捕获/恢复面板内聚焦控件（含光标）：点数值箭头改值会触发重渲染，
     若不恢复，聚焦节点被 innerHTML 销毁后焦点丢失，蓝色焦点边框随之消失 */
  function capturePanelFocus() {
    const active = document.activeElement;
    if (!active || !ui.els.propertyPanel.contains(active)) return null;
    const tag = active.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return null;
    const state = { id: active.id, tag: tag };
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      state.start = active.selectionStart;
      state.end = active.selectionEnd;
    }
    return state;
  }

  function restorePanelFocus(state) {
    if (!state || !state.id) return;
    const el = document.getElementById(state.id);
    if (!el) return;
    el.focus();
    if ((state.tag === 'INPUT' || state.tag === 'TEXTAREA') && state.start != null) {
      try { el.setSelectionRange(state.start, state.end); } catch (err) { /* 部分控件不支持 */ }
    }
  }

  /* 预览框跟随页面比例：等比装进 96×96 的箱，页面比例优先于最短边下限 */
  function previewBox(pageSize) {
    const pw = Math.max(1, Number(pageSize && pageSize.width) || 1);
    const ph = Math.max(1, Number(pageSize && pageSize.height) || 1);
    let width = 96;
    let height = Math.round(96 * ph / pw);
    if (height > 96) {
      height = 96;
      width = Math.round(96 * pw / ph);
    }
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  /* 背景缩略图：canvas 占位，插入 DOM 后由 render.paintBackgroundPreviews 合成 */
  function backgroundPreview(page, extraClass, box) {
    const size = box ? ' style="width:' + box.width + 'px;height:' + box.height + 'px"' : '';
    return '<canvas class="bg-preview' + (extraClass ? ' ' + extraClass : '') + '"' + size +
      ' data-preview-page="' + esc(page.id) + '" aria-hidden="true"></canvas>';
  }

  function pageNumber(project, page) {
    return project.pages.indexOf(page) + 1;
  }

  ui.renderPropertyPanel = function () {
    const focusState = capturePanelFocus();
    try {
      renderPropertyPanelBody();
      renderer.paintBackgroundPreviews(ui.els.propertyPanel);
    } finally {
      restorePanelFocus(focusState);
    }
  };

  const renderPropertyPanelBody = function () {
    if (ui.propTip) ui.propTip.hide();
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
    if (selection.type === 'backgroundImage') {
      const image = (page.background.images || []).find(function (item) {
        return item.id === selection.imageId;
      });
      if (!image) {
        L.app.selectPage();
        return;
      }
      renderBackgroundImageProperties(page, image);
      return;
    }
    renderPageProperties(page);
  };

  function renderPageProperties(page) {
    const project = L.app.state.project;
    const pageIndex = project.pages.indexOf(page);
    const sizePreset = model.matchPageSizePreset(project.pageSize.width, project.pageSize.height);
    const sizeOptions = model.PAGE_SIZE_PRESETS.map(function (preset) {
      return { value: preset.id, label: preset.label };
    });
    sizeOptions.push({
      value: 'custom',
      label: sizePreset ? '自定义' : '自定义 ' + project.pageSize.width + '×' + project.pageSize.height
    });
    const sizeValue = sizePreset ? sizePreset.id : 'custom';
    ui.els.propertyPanel.innerHTML =
      propGroup('page', '当前页',
        '<p class="hint">第 ' + (pageIndex + 1) + ' 页 / 共 ' + project.pages.length + ' 页。</p>',
        { right: helpTip('页面尺寸与边距为全局设置。') }) +
      propGroup('size', '页面尺寸',
        field('预设', selectInput('prop-page-preset', sizeOptions, sizeValue)) +
        fieldPair(
          '宽度', numberInput('prop-page-w', project.pageSize.width, model.PAGE_SIZE_MIN, model.PAGE_SIZE_MAX, 1, false, 10),
          '高度', numberInput('prop-page-h', project.pageSize.height, model.PAGE_SIZE_MIN, model.PAGE_SIZE_MAX, 1, false, 10)
        ) +
        '<div class="inline-actions"><button id="prop-page-swap" class="btn btn-sm" aria-label="交换宽高" title="交换宽高">⇄ 交换宽高</button></div>') +
      propGroup('margins', '页面边距',
        marginCross(project.margins, 'prop-margin-'),
        { right: helpTip('仅参考线') }) +
      backgroundGroup(page);

    bind('prop-page-preset', 'change', function () {
      const value = valueOf('prop-page-preset');
      if (value === 'custom') {
        const select = document.getElementById('prop-page-preset');
        if (select) select.value = sizeValue;
        const widthInput = document.getElementById('prop-page-w');
        if (widthInput) widthInput.focus();
        return;
      }
      const preset = model.PAGE_SIZE_PRESETS.find(function (item) { return item.id === value; });
      if (preset) L.app.setPageSize(preset.width, preset.height);
    });
    bind('prop-page-w', 'change', function () {
      L.app.setPageSize(Number(valueOf('prop-page-w')), project.pageSize.height);
    });
    bind('prop-page-h', 'change', function () {
      L.app.setPageSize(project.pageSize.width, Number(valueOf('prop-page-h')));
    });
    bind('prop-page-swap', 'click', function () {
      L.app.setPageSize(project.pageSize.height, project.pageSize.width);
    });
    ['top', 'right', 'bottom', 'left'].forEach(function (key) {
      bind('prop-margin-' + key, 'change', function () {
        const margins = Object.assign({}, project.margins);
        margins[key] = Math.max(0, Number(valueOf('prop-margin-' + key)) || 0);
        L.app.setMargins(margins);
      });
    });
    bindBackgroundGroup(page);
  }

  function backgroundGroup(page) {
    const project = L.app.state.project;
    const source = model.findGlobalBackgroundPage(project);
    const covered = model.isBackgroundCovered(project, page);
    const isSource = !!(source && source.id === page.id);
    const count = (page.background.images || []).length;
    const box = previewBox(project.pageSize);
    const color = page.background.color || model.DEFAULT_BACKGROUND_COLOR;
    const badges = '<span class="pill pill-gray">' + (count ? count + ' 张图' : '无图片') + '</span>' +
      (isSource ? '<span class="pill pill-blue">全局来源</span>' : '');
    const preview = backgroundPreview(page, '', box);
    const tip = '背景位于内容下方。选择或更换背景会整套替换填充色与图片；' +
      '勾选后所有页使用本页背景，改本页会同步所有页。';
    let body;
    if (covered) {
      body =
        '<div class="bg-card">' + preview +
          '<div class="bg-fields">' +
            '<p class="bg-source-note">显示第 ' + pageNumber(project, source) + ' 页的全局背景</p>' +
          '</div>' +
        '</div>' +
        '<div class="inline-actions">' +
          '<button id="prop-bg-cancel-global" class="btn btn-sm" type="button">取消全局背景</button>' +
        '</div>' +
        field('全局背景', '<label class="check-row"><input id="prop-bg-global" type="checkbox"> 本页接管</label>');
    } else {
      body =
        '<div class="bg-card">' + preview +
          '<div class="bg-fields">' +
            field('图片', '<span class="bg-count">' + (count ? count + ' 张' : '无图片') + '</span>') +
            field('填充色', colorInput('prop-bg-color', color, false) +
              '<span class="bg-color-value">' + esc(color) + '</span>') +
          '</div>' +
        '</div>' +
        '<div class="bg-actions">' +
          '<button id="prop-bg-pick" class="btn btn-sm" type="button">' + (count ? '更换背景' : '选择背景') + '</button>' +
          '<button id="prop-bg-add-image" class="btn btn-sm" type="button" aria-label="添加背景图片">＋ 图片</button>' +
          '<button id="prop-bg-copy-from" class="btn btn-sm" type="button">复制背景…</button>' +
          '<button id="prop-bg-clear" class="btn btn-sm" type="button"' + (count ? '' : ' disabled') + '>清空背景</button>' +
        '</div>' +
        field('全局背景', '<label class="check-row"><input id="prop-bg-global" type="checkbox"' +
          (isSource ? ' checked' : '') + '> 所有页使用此背景</label>');
    }
    return propGroup('background', '页面背景', body, { right: badges + helpTip(tip) });
  }

  function bindBackgroundGroup(page) {
    bind('prop-bg-color', 'input', function () {
      const value = valueOf('prop-bg-color');
      L.app.setBackgroundColor(value);
      // 取色器不触发面板重渲染，色值文本就地跟上，避免显示旧值。
      const label = ui.els.propertyPanel.querySelector('.bg-color-value');
      if (label) label.textContent = value;
    });
    bind('prop-bg-pick', 'click', function () { openPresetPicker('whole', null); });
    bind('prop-bg-add-image', 'click', function () { openPresetPicker('add', null); });
    bind('prop-bg-copy-from', 'click', function () {
      if (openCopyBackground) openCopyBackground(page.id);
    });
    bind('prop-bg-clear', 'click', function () { L.app.clearPageBackground(); });
    bind('prop-bg-global', 'change', function () {
      const input = document.getElementById('prop-bg-global');
      if (!input) return;
      if (input.checked) L.app.setGlobalBackgroundPage();
      else L.app.clearGlobalBackground();
    });
    bind('prop-bg-cancel-global', 'click', function () { L.app.clearGlobalBackground(); });
  }

  function fitLabel(fit) {
    if (fit === 'original') return '原大小';
    if (fit === 'fill-width') return '横向占满';
    if (fit === 'fill-height') return '竖向占满';
    if (fit === 'none') return '自定义';
    return '最适合';
  }

  /* 高级图片效果字段：背景图与自由图片共用同一组名字、范围与展示格式。
     渐隐参数比照 Kdenlive 的 Alpha Gradient：位置、转场宽度、角度、顶部/底部透明度。 */
  function imageEffectFields(prefix, item) {
    const brightness = effectNumber(item.brightness, 1);
    const hue = effectNumber(item.hue, 0);
    const fade = model.fadeValues(item);
    const fadeDisabled = fade.mode === 'off';
    const widthLabel = fade.mode === 'double' ? '不透明区宽度' : '转场宽度';
    return field('亮度', rangeInput(prefix + '-brightness', brightness,
        model.BRIGHTNESS_MIN, model.BRIGHTNESS_MAX, 0.01, percentLabel)) +
      field('色相', rangeInput(prefix + '-hue', hue, model.HUE_MIN, model.HUE_MAX, 1, degreeLabel)) +
      fieldHelp('渐隐模式', selectInput(prefix + '-fade-mode', [
        { value: 'off', label: '关闭' },
        { value: 'single', label: '单向' },
        { value: 'double', label: '双向' }
      ], fade.mode), '切换模式会把位置、转场宽度与两端透明度重置为该模式的默认值。') +
      field('渐隐位置', rangeInput(prefix + '-fade-position', fade.position,
        model.FADE_POSITION_MIN, model.FADE_POSITION_MAX, 0.01, percentLabel, fadeDisabled)) +
      field(widthLabel, rangeInput(prefix + '-fade-width', fade.width,
        model.FADE_WIDTH_MIN, model.FADE_WIDTH_MAX, 0.01, percentLabel, fadeDisabled)) +
      field('渐隐角度', rangeInput(prefix + '-fade-angle', fade.angle,
        model.FADE_ANGLE_MIN, model.FADE_ANGLE_MAX, 1, degreeLabel, fadeDisabled)) +
      field('顶部透明度', rangeInput(prefix + '-fade-top', fade.top,
        model.FADE_TRANSPARENCY_MIN, model.FADE_TRANSPARENCY_MAX, 0.01, percentLabel, fadeDisabled)) +
      field('底部透明度', rangeInput(prefix + '-fade-bottom', fade.bottom,
        model.FADE_TRANSPARENCY_MIN, model.FADE_TRANSPARENCY_MAX, 0.01, percentLabel, fadeDisabled));
  }

  function panelFadeDefaults(prefix) {
    const raw = valueOf(prefix + '-fade-mode');
    return model.fadeDefaults(model.FADE_MODES.indexOf(raw) >= 0 ? raw : 'off');
  }

  /* 效果控件绑定：写入统一走 write(key, value) 意图动作，标签文本同步格式化 */
  function bindImageEffectFields(prefix, write) {
    bind(prefix + '-brightness', 'input', function () {
      const value = clampEffect(valueOf(prefix + '-brightness'), model.BRIGHTNESS_MIN, model.BRIGHTNESS_MAX, 1);
      write('brightness', value);
      updateRangeLabel(prefix + '-brightness', percentLabel(value));
    });
    bind(prefix + '-hue', 'input', function () {
      const value = clampEffect(valueOf(prefix + '-hue'), model.HUE_MIN, model.HUE_MAX, 0);
      write('hue', value);
      updateRangeLabel(prefix + '-hue', degreeLabel(value));
    });
    bind(prefix + '-fade-mode', 'change', function () {
      const raw = valueOf(prefix + '-fade-mode');
      const mode = model.FADE_MODES.indexOf(raw) >= 0 ? raw : 'off';
      const defaults = model.fadeDefaults(mode);
      // 模式即预设：几何含义在单向/双向之间不同，沿用旧数值会把两端淡出变成全不透明。
      write('fadeMode', mode);
      write('fadePosition', defaults.fadePosition);
      write('fadeWidth', defaults.fadeWidth);
      write('fadeTop', defaults.fadeTop);
      write('fadeBottom', defaults.fadeBottom);
      // 模式变化会影响控件标签、禁用状态与数值，重渲染面板但不额外重绘画布
      ui.renderPropertyPanel();
    });
    bind(prefix + '-fade-position', 'input', function () {
      const defaults = panelFadeDefaults(prefix);
      const value = clampEffect(valueOf(prefix + '-fade-position'),
        model.FADE_POSITION_MIN, model.FADE_POSITION_MAX, defaults.fadePosition);
      write('fadePosition', value);
      updateRangeLabel(prefix + '-fade-position', percentLabel(value));
    });
    bind(prefix + '-fade-width', 'input', function () {
      const defaults = panelFadeDefaults(prefix);
      const value = clampEffect(valueOf(prefix + '-fade-width'),
        model.FADE_WIDTH_MIN, model.FADE_WIDTH_MAX, defaults.fadeWidth);
      write('fadeWidth', value);
      updateRangeLabel(prefix + '-fade-width', percentLabel(value));
    });
    bind(prefix + '-fade-angle', 'input', function () {
      const value = clampEffect(valueOf(prefix + '-fade-angle'), model.FADE_ANGLE_MIN, model.FADE_ANGLE_MAX, 0);
      write('fadeAngle', value);
      updateRangeLabel(prefix + '-fade-angle', degreeLabel(value));
    });
    bind(prefix + '-fade-top', 'input', function () {
      const defaults = panelFadeDefaults(prefix);
      const value = clampEffect(valueOf(prefix + '-fade-top'),
        model.FADE_TRANSPARENCY_MIN, model.FADE_TRANSPARENCY_MAX, defaults.fadeTop);
      write('fadeTop', value);
      updateRangeLabel(prefix + '-fade-top', percentLabel(value));
    });
    bind(prefix + '-fade-bottom', 'input', function () {
      const defaults = panelFadeDefaults(prefix);
      const value = clampEffect(valueOf(prefix + '-fade-bottom'),
        model.FADE_TRANSPARENCY_MIN, model.FADE_TRANSPARENCY_MAX, defaults.fadeBottom);
      write('fadeBottom', value);
      updateRangeLabel(prefix + '-fade-bottom', percentLabel(value));
    });
  }

  function renderBackgroundImageProperties(page, image) {
    const project = L.app.state.project;
    const images = page.background.images || [];
    const index = images.indexOf(image);
    const isSource = project.globalBackgroundPageId === page.id;
    const meta = image.assetId ? (L.assets.getMeta(image.assetId) || project.assets.find(function (asset) {
      return asset.id === image.assetId;
    })) : null;
    const custom = image.fit === 'none';
    ui.els.propertyPanel.innerHTML =
      propGroup('info', '背景图片 ' + (index + 1) + ' / ' + images.length,
        '<p class="hint">所属背景：第 ' + pageNumber(project, page) + ' 页' +
          (isSource ? '（全局来源，修改会影响所有页面）' : '') + '</p>' +
        '<p class="hint">' + (meta ? '当前图片：' + esc(meta.name) : '图片缺失或未选择。') + '</p>') +
      propGroup('position', '定位',
        (custom ? field : fieldHelp)('尺寸', selectInput('prop-bg-fit', [
          { value: 'original', label: '原大小' },
          { value: 'fill-width', label: '横向占满' },
          { value: 'fill-height', label: '竖向占满' },
          { value: 'cover', label: '最适合（居中裁剪）' },
          { value: 'none', label: '自定义' }
        ], image.fit || 'cover'), '该模式随页面尺寸自动重排。直接在画布拖动或缩放会转为自定义。') +
        (custom
          ? fieldPair(
              'X', numberInput('prop-bg-x', Math.round(image.x), -20000, 20000, 1, false, 10),
              'Y', numberInput('prop-bg-y', Math.round(image.y), -20000, 20000, 1, false, 10)
            ) +
            fieldPair(
              '宽', numberInput('prop-bg-w', Math.round(image.width), 1, 20000, 1, false, 10),
              '高', numberInput('prop-bg-h', Math.round(image.height), 1, 20000, 1, false, 10)
            ) +
            field('旋转', numberInput('prop-bg-rotation', Math.round(Number(image.rotation) || 0), -360, 360, 1, false, 45) + '<span class="unit">°</span>') +
            field('', '<label class="check-row"><input id="prop-bg-ratio" type="checkbox"' +
              (image.keepRatio !== false ? ' checked' : '') + '> 缩放时保持比例</label>') +
            '<div class="inline-actions"><button id="prop-bg-restore" class="btn btn-sm">恢复为最适合</button></div>'
          : '')) +
      propGroup('display', '显示',
        field('透明度', rangeInput('prop-bg-opacity', image.opacity == null ? 1 : image.opacity, 0, 1, 0.01)) +
        field('边缘模糊', rangeInput('prop-bg-blur', image.blur || 0, 0, 40, 1) + '<span class="unit">px</span>') +
        (ui.advancedImage ? imageEffectFields('prop-bg', image) : ''),
        { right: advancedToggle(model.hasImageEffects(image)) }) +
      propGroup('actions', '',
        '<div class="inline-actions">' +
          '<button id="prop-bg-move-up" class="btn btn-sm"' + (index >= images.length - 1 ? ' disabled' : '') + '>上移一层</button>' +
          '<button id="prop-bg-move-down" class="btn btn-sm"' + (index <= 0 ? ' disabled' : '') + '>下移一层</button>' +
          '<button id="prop-bg-replace" class="btn btn-sm">替换图片</button>' +
          '<button id="prop-bg-image-delete" class="btn btn-sm btn-danger">删除图片</button>' +
        '</div>', { plain: true });

    bind('prop-bg-fit', 'change', function () { L.app.setBackgroundImageFit(image.id, valueOf('prop-bg-fit')); });
    bind('prop-bg-x', 'change', function () { L.app.setBackgroundImageValue(image.id, 'x', Number(valueOf('prop-bg-x')) || 0); });
    bind('prop-bg-y', 'change', function () { L.app.setBackgroundImageValue(image.id, 'y', Number(valueOf('prop-bg-y')) || 0); });
    bind('prop-bg-w', 'change', function () { L.app.setBackgroundImageValue(image.id, 'width', Math.max(1, Number(valueOf('prop-bg-w')) || 1)); });
    bind('prop-bg-h', 'change', function () { L.app.setBackgroundImageValue(image.id, 'height', Math.max(1, Number(valueOf('prop-bg-h')) || 1)); });
    bind('prop-bg-rotation', 'change', function () { L.app.setBackgroundImageValue(image.id, 'rotation', Number(valueOf('prop-bg-rotation')) || 0); });
    bind('prop-bg-ratio', 'change', function () {
      const input = document.getElementById('prop-bg-ratio');
      L.app.setBackgroundImageField(image.id, 'keepRatio', input ? input.checked : true);
    });
    bind('prop-bg-opacity', 'input', function () {
      const value = Number(valueOf('prop-bg-opacity'));
      L.app.setBackgroundImageValue(image.id, 'opacity', value);
      const label = document.getElementById('prop-bg-opacity-value');
      if (label) label.textContent = value.toFixed(2);
    });
    bind('prop-bg-blur', 'input', function () {
      const value = Number(valueOf('prop-bg-blur'));
      L.app.setBackgroundImageValue(image.id, 'blur', value);
      const label = document.getElementById('prop-bg-blur-value');
      if (label) label.textContent = value;
    });
    bindAdvancedToggle();
    if (ui.advancedImage) {
      bindImageEffectFields('prop-bg', function (key, value) {
        L.app.setBackgroundImageValue(image.id, key, value);
      });
    }
    bind('prop-bg-restore', 'click', function () { L.app.restoreBackgroundImageFit(image.id); });
    bind('prop-bg-move-up', 'click', function () { L.app.moveBackgroundImage(image.id, 1); });
    bind('prop-bg-move-down', 'click', function () { L.app.moveBackgroundImage(image.id, -1); });
    bind('prop-bg-replace', 'click', function () { openPresetPicker('replace', { imageId: image.id }); });
    bind('prop-bg-image-delete', 'click', function () { L.app.deleteBackgroundImage(image.id); });
  }

  function fontListValues(style) {
    return Array.isArray(style.fontFamilies)
      ? model.normalizeFontFamilies(style.fontFamilies)
      : model.fontFamiliesFromFamily(style.fontFamily);
  }

  function isDefaultFont(family) {
    return String(family || '').toLocaleLowerCase() === 'sans-serif';
  }

  function fontListField(prefix, style) {
    const supported = !!(L.fontPicker && L.fontPicker.isSupported && L.fontPicker.isSupported());
    const families = fontListValues(style);
    const rows = families.map(function (family, index) {
      const isDefault = isDefaultFont(family);
      const deleteDisabled = families.length <= 1 ? ' disabled' : '';
      let name;
      if (supported) {
        name = '<button id="' + prefix + '-font-' + index + '" class="font-list-name" type="button" title="点击替换字体">' +
          esc(isDefault ? '系统默认' : family) + '</button>';
      } else {
        name = '<input id="' + prefix + '-font-' + index + '" class="input font-list-input" type="text" value="' +
          (isDefault ? '' : esc(family)) + '" placeholder="系统默认">';
      }
      return '<div class="font-list-row" data-font-index="' + index + '">' + name +
        '<button id="' + prefix + '-font-delete-' + index + '" class="icon-btn font-list-delete" type="button" title="删除字体"' +
        deleteDisabled + '>×</button></div>';
    }).join('');
    const add = supported
      ? '<button id="' + prefix + '-font-add" class="btn btn-sm font-list-add" type="button">＋ 添加字体</button>'
      : '<div class="font-list-manual">' +
          '<input id="' + prefix + '-font-manual" class="input" type="text" placeholder="输入字体族名">' +
          '<button id="' + prefix + '-font-manual-add" class="btn btn-sm" type="button">添加</button>' +
        '</div>';
    return '<div class="field font-list-field field-help">' +
        '<label for="' + prefix + '-font-0">字体</label>' +
        '<div class="control"><div class="font-list">' + rows + add + '</div></div>' +
        helpTip('按列表顺序回退；至少保留一个字体。') +
      '</div>';
  }

  function bindFontList(prefix, style) {
    const supported = !!(L.fontPicker && L.fontPicker.isSupported && L.fontPicker.isSupported());

    function current() {
      return fontListValues(style);
    }

    function commit(list) {
      model.applyFontFamilies(style, list);
      L.app.changed({ property: false });
      ui.renderPropertyPanel();
    }

    function pick(index) {
      if (!supported || !L.fontPicker) return;
      const families = current();
      const value = index == null ? '' : families[index];
      L.fontPicker.open({
        currentValue: isDefaultFont(value) ? '' : (value || ''),
        onPick: function (picked) {
          const next = current();
          if (typeof picked === 'string' && picked) {
            if (index == null) {
              if (next.length === 1 && isDefaultFont(next[0])) next[0] = picked;
              else next.push(picked);
            } else {
              next[index] = picked;
            }
          } else if (index != null && next.length > 1) {
            next.splice(index, 1);
          } else if (index != null) {
            next[0] = 'sans-serif';
          }
          commit(next);
        }
      });
    }

    function deleteAt(index) {
      const next = current();
      if (next.length <= 1) return;
      next.splice(index, 1);
      commit(next);
    }

    if (supported) {
      current().forEach(function (family, index) {
        bind(prefix + '-font-' + index, 'click', function () { pick(index); });
        bind(prefix + '-font-delete-' + index, 'click', function () { deleteAt(index); });
      });
      bind(prefix + '-font-add', 'click', function () { pick(null); });
      return;
    }

    current().forEach(function (family, index) {
      bind(prefix + '-font-' + index, 'change', function () {
        const next = current();
        const raw = valueOf(prefix + '-font-' + index).trim();
        if (!raw) {
          if (next.length <= 1) next[0] = 'sans-serif';
          else next.splice(index, 1);
        } else {
          next[index] = raw;
        }
        commit(next);
      });
      bind(prefix + '-font-' + index, 'keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.target.blur();
        }
      });
      bind(prefix + '-font-delete-' + index, 'click', function () { deleteAt(index); });
    });

    function addManual() {
      const raw = valueOf(prefix + '-font-manual').trim();
      if (!raw) return;
      const next = current();
      if (next.length === 1 && isDefaultFont(next[0])) next[0] = raw;
      else next.push(raw);
      commit(next);
    }

    bind(prefix + '-font-manual-add', 'click', addManual);
    bind(prefix + '-font-manual', 'keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        addManual();
      }
    });
  }

  function shadowOutlineFields(prefix, style) {
    const shadow = model.normalizeShadow(style.shadow);
    const outline = model.normalizeOutline(style.outline);
    return '<div class="so-group">' +
      '<label class="check-row"><input id="' + prefix + '-shadow-enabled" type="checkbox"' +
        (shadow.enabled ? ' checked' : '') + '> 阴影（投影）</label>' +
      fieldPair(
        '颜色', colorInput(prefix + '-shadow-color', shadow.color, !shadow.enabled),
        '模糊', numberInput(prefix + '-shadow-blur', shadow.blur, 0, 100, 1, !shadow.enabled)
      ) +
      fieldPair(
        '偏移 X', numberInput(prefix + '-shadow-x', shadow.offsetX, -200, 200, 1, !shadow.enabled),
        '偏移 Y', numberInput(prefix + '-shadow-y', shadow.offsetY, -200, 200, 1, !shadow.enabled)
      ) +
      '<div class="so-sep"></div>' +
      '<label class="check-row"><input id="' + prefix + '-outline-enabled" type="checkbox"' +
        (outline.enabled ? ' checked' : '') + '> 轮廓</label>' +
      fieldPair(
        '颜色', colorInput(prefix + '-outline-color', outline.color, !outline.enabled),
        '线宽', numberInput(prefix + '-outline-width', outline.width, 0, 50, 0.5, !outline.enabled)
      ) +
    '</div>';
  }

  function bindShadowOutline(prefix, style) {
    function shadowPatch(key, parse) {
      return function () {
        const shadow = model.normalizeShadow(style.shadow);
        shadow[key] = parse();
        style.shadow = shadow;
        L.app.changed({ property: false });
      };
    }
    function outlinePatch(key, parse) {
      return function () {
        const outline = model.normalizeOutline(style.outline);
        outline[key] = parse();
        style.outline = outline;
        L.app.changed({ property: false });
      };
    }
    function enablePatch(key, normalize) {
      return function () {
        const input = document.getElementById(prefix + '-' + key + '-enabled');
        const value = normalize(style[key]);
        value.enabled = !!(input && input.checked);
        style[key] = value;
        L.app.changed({ property: false });
        ui.renderPropertyPanel();
      };
    }

    bind(prefix + '-shadow-enabled', 'change', enablePatch('shadow', model.normalizeShadow));
    bind(prefix + '-shadow-color', 'input', shadowPatch('color', function () { return valueOf(prefix + '-shadow-color'); }));
    bind(prefix + '-shadow-x', 'input', shadowPatch('offsetX', function () { return Number(valueOf(prefix + '-shadow-x')) || 0; }));
    bind(prefix + '-shadow-y', 'input', shadowPatch('offsetY', function () { return Number(valueOf(prefix + '-shadow-y')) || 0; }));
    bind(prefix + '-shadow-blur', 'input', shadowPatch('blur', function () { return Math.max(0, Number(valueOf(prefix + '-shadow-blur')) || 0); }));
    bind(prefix + '-outline-enabled', 'change', enablePatch('outline', model.normalizeOutline));
    bind(prefix + '-outline-color', 'input', outlinePatch('color', function () { return valueOf(prefix + '-outline-color'); }));
    bind(prefix + '-outline-width', 'input', outlinePatch('width', function () { return Math.max(0, Number(valueOf(prefix + '-outline-width')) || 0); }));
  }

  function categoryStyleFields(prefix, style) {
    return fontListField(prefix, style) +
      fieldPair(
        '字号', numberInput(prefix + '-size', style.fontSize, 6, 300, 1) + '<span class="unit">px</span>',
        '粗细', selectInput(prefix + '-weight', weightOptions(), String(style.fontWeight), false, 'select-compact'),
        'field-row-weight'
      ) +
      field('颜色', colorInput(prefix + '-color', style.color)) +
      field('行距', numberInput(prefix + '-lineheight', style.lineHeight, 0.8, 3, 0.05)) +
      shadowOutlineFields(prefix, style);
  }

  function bindCategoryStyle(prefix, style) {
    bindFontList(prefix, style);
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
    bindShadowOutline(prefix, style);
  }

  function tableCard(table, index, isLast) {
    const widthLabel = table.widthMode === 'manual' ? '固定' : '自动';
    const margins = model.normalizeMargins(table.margins);
    function marginInput(side) {
      return '<input class="input num-mid cross-' + side + '" data-table-field="margin-' + side +
        '" type="number" min="0" step="1" value="' + esc(margins[side]) + '">';
    }
    return '<div class="table-card" data-table-index="' + index + '">' +
      '<div class="table-card-head"><span class="table-card-title">表格 ' + (index + 1) +
      (isLast ? ' · 末表' : '') + '</span>' +
      '<span class="row-actions">' +
      '<button class="btn btn-sm" data-table-action="auto">恢复自动</button>' +
      '<button class="icon-btn" data-table-action="remove" title="删除表格">×</button>' +
      '</span></div>' +
      fieldPair(
        '列数', '<input id="prop-table-' + index + '-columns" class="input num-slim" data-table-field="columns" type="number" min="1" max="50" step="1" value="' + table.columns + '">',
        '行数', '<input id="prop-table-' + index + '-rows" class="input num-mid" data-table-field="rows" type="number" min="' + (isLast ? 0 : 1) +
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
      field('边距', '<div class="margin-cross">' +
        marginInput('top') + marginInput('left') + marginInput('right') +
        '<span class="cross-page"></span>' +
        marginInput('bottom') +
      '</div>') +
      (isLast && table.rows === 0
        ? fieldHelp('列宽', '<span class="pill ' + (table.widthMode === 'manual' ? 'pill-blue' : 'pill-gray') + '">' +
          widthLabel + '</span>', '0 行 = 动态行')
        : field('列宽', '<span class="pill ' + (table.widthMode === 'manual' ? 'pill-blue' : 'pill-gray') + '">' +
          widthLabel + '</span>')) +
      '</div>';
  }

  function renderCategoryProperties(element) {
    const project = L.app.state.project;
    const category = model.getCategory(project, element.category);

    ui.els.propertyPanel.innerHTML =
      propGroup('block', '分类块',
        fieldPair(
          '位置 X', numberInput('prop-el-x', Math.round(element.x), -5000, 10000, 1, false, 10),
          '位置 Y', numberInput('prop-el-y', Math.round(element.y), -5000, 20000, 1, false, 10)
        ) +
        field('宽度', numberInput('prop-el-w', Math.round(element.width), 120, 5000, 1, false, 10) + '<span class="unit">px</span>'),
        { right: '<span class="pill pill-green">' + (category ? category.songs.length : 0) + ' 首</span>' }) +
      propGroup('title', '分类名子分区',
        fieldHelp('', '<label class="check-row"><input id="prop-title-visible" type="checkbox"' +
          (element.showTitle !== false ? ' checked' : '') + '> 显示分类名</label>',
          '隐藏时样式保留，重新显示后生效。') +
        categoryStyleFields('prop-title', element.titleStyle)) +
      propGroup('song', '歌名子分区',
        categoryStyleFields('prop-song', element.songStyle)) +
      propGroup('tables', '表格',
        tableGroupBody(element),
        { right: tableGroupRight(element) }) +
      propGroup('actions', '',
        '<div class="title-tip-row"><button id="prop-delete-block" class="btn btn-danger btn-sm">删除分类块</button>' +
          helpTip('删除后分类回到左侧未放置状态，歌单数据保留。') + '</div>', { plain: true });

    bind('prop-el-x', 'input', function () {
      L.app.setElementField('x', Number(valueOf('prop-el-x')) || 0);
    });
    bind('prop-el-y', 'input', function () {
      L.app.setElementField('y', Number(valueOf('prop-el-y')) || 0);
    });
    bind('prop-el-w', 'input', function () {
      const next = Math.max(120, Number(valueOf('prop-el-w')) || 120);
      L.app.resizeElementWidth(element, next);
      L.app.changed({ property: false });
    });
    bind('prop-title-visible', 'change', function () {
      const input = document.getElementById('prop-title-visible');
      const visible = input ? input.checked : true;
      L.app.setElementField('showTitle', visible);
      setGroupCollapsed('title', !visible);
    });
    bindCategoryStyle('prop-title', element.titleStyle);
    bindCategoryStyle('prop-song', element.songStyle);
    bindAddTable(element, category, ui.els.propertyPanel.querySelector('[data-group="tables"]'));
    bind('prop-delete-block', 'click', function () {
      L.app.deleteSelection();
    });

    ui.els.propertyPanel.querySelectorAll('.table-card').forEach(function (card) {
      bindTableCard(card, element, category);
    });
  }

  /* 表格组内容：全部表格卡片 + 添加表格按钮 */
  function tableGroupBody(element) {
    const tables = element.tables;
    return tables.map(function (table, index) {
      return tableCard(table, index, index === tables.length - 1);
    }).join('') +
      '<button id="prop-add-table" class="btn btn-sm">＋ 添加表格</button>';
  }

  /* 表格组头右侧状态：表格个数 + 帮助提示 */
  function tableGroupRight(element) {
    return '<span class="hint">' + element.tables.length + ' 个</span>' +
      helpTip('只有最后一个表格可以是动态行（行数 0）。列宽拖动后整表变为固定列宽。表格边距相对分类块边缘，上下边距相加。');
  }

  /* 添加表格按钮绑定：结构动作只做表格组级刷新（只更新受影响区域） */
  function bindAddTable(element, category, group) {
    bind('prop-add-table', 'click', function () {
      layout.addTable(element, category);
      L.app.changed({ property: false });
      refreshTableGroup(group, element, category);
    });
  }

  /* 表格卡片内部的字段绑定：抽出来，结构性改值（列数/行数）只重建当前卡片 */
  function bindTableCard(card, element, category) {
    const index = Number(card.getAttribute('data-table-index'));
    const table = element.tables[index];
    if (!table) return;
    const songCount = (category && category.songs.length) || 0;
    const group = card.closest('.prop-group');
    card.querySelectorAll('[data-table-field]').forEach(function (input) {
      const fieldName = input.getAttribute('data-table-field');
      if (!input.hasAttribute('data-field')) {
        input.setAttribute('data-field', input.id || 'table-' + index + '-' + fieldName);
      }
      const eventName = fieldName.indexOf('margin-') === 0 ? 'input' : 'change';
      input.addEventListener(eventName, function () {
        if (fieldName.indexOf('margin-') === 0) {
          const side = fieldName.slice('margin-'.length);
          table.margins = model.normalizeMargins(table.margins);
          table.margins[side] = Math.max(0, Number(input.value) || 0);
          L.app.changed({ property: false });
        } else if (fieldName === 'columns' || fieldName === 'rows') {
          const before = element.tables.length;
          if (fieldName === 'columns') {
            layout.setColumns(element, index, Number(input.value), songCount);
          } else {
            layout.setRows(element, index, Number(input.value), songCount);
          }
          L.app.changed({ property: false });
          // 表格数量变化 → 表格组级刷新；否则只重建当前卡片
          if (element.tables.length !== before) refreshTableGroup(group, element, category);
          else refreshTableCard(card, element, index, category);
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
          L.app.changed();
        } else if (action === 'remove') {
          layout.removeTable(element, index, songCount);
          L.app.changed({ property: false });
          refreshTableGroup(group, element, category);
        }
      });
    });
  }

  /* 只替换单张表格卡片，保留面板滚动位置与当前输入的焦点/选区 */
  function refreshTableCard(card, element, index, category) {
    if (!element.tables[index]) return;
    const focusState = capturePanelFocus();
    const host = document.createElement('div');
    host.innerHTML = tableCard(element.tables[index], index, index === element.tables.length - 1);
    const next = host.firstElementChild;
    if (!next) return;
    card.replaceWith(next);
    bindTableCard(next, element, category);
    restorePanelFocus(focusState);
  }

  /* 只替换表格组内容（卡片 + 添加按钮）与组头计数，
     保留其余分组、折叠状态与焦点/选区（连续步进不中断） */
  function refreshTableGroup(group, element, category) {
    if (!group) return;
    const focusState = capturePanelFocus();
    const body = group.querySelector('.prop-group-body');
    const right = group.querySelector('.title-right');
    if (body) body.innerHTML = tableGroupBody(element);
    if (right) right.innerHTML = tableGroupRight(element);
    group.querySelectorAll('.table-card').forEach(function (card) {
      bindTableCard(card, element, category);
    });
    bindAddTable(element, category, group);
    restorePanelFocus(focusState);
  }

  function textStyleFields(prefix, style) {
    return fontListField(prefix, style) +
      fieldPair(
        '字号', numberInput(prefix + '-size', style.fontSize, 6, 300, 1) + '<span class="unit">px</span>',
        '粗细', selectInput(prefix + '-weight', weightOptions(), String(style.fontWeight), false, 'select-compact'),
        'field-row-weight'
      ) +
      field('颜色', colorInput(prefix + '-color', style.color)) +
      field('行距', numberInput(prefix + '-lineheight', style.lineHeight, 0.8, 3, 0.05)) +
      field('对齐', selectInput(prefix + '-align', alignOptions(), style.align || 'left')) +
      shadowOutlineFields(prefix, style);
  }

  function renderTextProperties(element) {
    ui.els.propertyPanel.innerHTML =
      propGroup('content', '自由文字',
        fieldHelp('内容', '<textarea id="prop-text-content" class="input" rows="3" style="height:auto;padding:6px 7px;resize:vertical">' +
          esc(element.text) + '</textarea>', '也可以双击画布上的文字直接编辑。')) +
      propGroup('layout', '位置与尺寸',
        fieldPair(
          '位置 X', numberInput('prop-text-x', Math.round(element.x), -5000, 10000, 1, false, 10),
          '位置 Y', numberInput('prop-text-y', Math.round(element.y), -5000, 20000, 1, false, 10)
        ) +
        fieldHelp('宽度', numberInput('prop-text-w', Math.round(element.width), 40, 5000, 1, false, 10) + '<span class="unit">px</span>',
          '高度随文字自动增长。')) +
      propGroup('style', '文字样式',
        textStyleFields('prop-text', element.style)) +
      propGroup('actions', '', '<button id="prop-delete-block" class="btn btn-danger btn-sm">删除文字</button>', { plain: true });

    bind('prop-text-content', 'input', function () {
      L.app.setElementField('text', valueOf('prop-text-content'));
    });
    bind('prop-text-x', 'input', function () {
      L.app.setElementField('x', Number(valueOf('prop-text-x')) || 0);
    });
    bind('prop-text-y', 'input', function () {
      L.app.setElementField('y', Number(valueOf('prop-text-y')) || 0);
    });
    bind('prop-text-w', 'input', function () {
      L.app.setElementField('width', Math.max(40, Number(valueOf('prop-text-w')) || 40));
    });
    bindFontList('prop-text', element.style);
    bind('prop-text-size', 'input', function () {
      L.app.setElementStyleField('fontSize', Math.max(6, Number(valueOf('prop-text-size')) || 6));
    });
    bind('prop-text-weight', 'change', function () {
      L.app.setElementStyleField('fontWeight', Number(valueOf('prop-text-weight')));
    });
    bind('prop-text-color', 'input', function () {
      L.app.setElementStyleField('color', valueOf('prop-text-color'));
    });
    bind('prop-text-lineheight', 'input', function () {
      L.app.setElementStyleField('lineHeight', Math.max(0.8, Number(valueOf('prop-text-lineheight')) || 0.8));
    });
    bind('prop-text-align', 'change', function () {
      L.app.setElementStyleField('align', valueOf('prop-text-align'));
    });
    bindShadowOutline('prop-text', element.style);
    bind('prop-delete-block', 'click', function () { L.app.deleteSelection(); });
  }

  function renderImageProperties(element) {
    const meta = L.assets.getMeta(element.assetId) || L.app.state.project.assets.find(function (asset) {
      return asset.id === element.assetId;
    });
    ui.els.propertyPanel.innerHTML =
      propGroup('info', '自由图片',
        '<p class="hint">当前图片：' + esc(meta ? meta.name : (element.assetId || '未选择')) + '</p>' +
        '<div class="inline-actions"><button id="prop-img-replace" class="btn btn-sm">替换图片</button></div>') +
      propGroup('layout', '位置与尺寸',
        fieldPair(
          '位置 X', numberInput('prop-img-x', Math.round(element.x), -5000, 10000, 1, false, 10),
          '位置 Y', numberInput('prop-img-y', Math.round(element.y), -5000, 20000, 1, false, 10)
        ) +
        fieldPair(
          '宽度', numberInput('prop-img-w', Math.round(element.width), 40, 5000, 1, false, 10),
          '高度', numberInput('prop-img-h', Math.round(element.height), 40, 5000, 1, false, 10)
        )) +
      propGroup('appearance', '外观',
        '<div class="field field-compact"><label>比例</label><div class="control">' +
          '<label class="check-row"><input id="prop-img-ratio" type="checkbox"' +
          (element.keepRatio !== false ? ' checked' : '') + '> 缩放时保持比例</label>' +
        '</div></div>' +
        field('旋转', numberInput('prop-img-rotation', Math.round(element.rotation || 0), -180, 180, 1, false, 45) +
          '<span class="unit">°</span>') +
        field('透明度', rangeInput('prop-img-opacity', element.opacity == null ? 1 : element.opacity, 0, 1, 0.01)) +
        field('模糊', rangeInput('prop-img-blur', element.blur || 0, 0, 40, 1) + '<span class="unit">px</span>') +
        (ui.advancedImage ? imageEffectFields('prop-img', element) : ''),
        { right: advancedToggle(model.hasImageEffects(element)) }) +
      propGroup('actions', '', '<button id="prop-delete-block" class="btn btn-danger btn-sm">删除图片</button>', { plain: true });

    bind('prop-img-replace', 'click', function () { L.app.pickFreeImage(element.id); });
    bind('prop-img-x', 'input', function () {
      L.app.setElementField('x', Number(valueOf('prop-img-x')) || 0);
    });
    bind('prop-img-y', 'input', function () {
      L.app.setElementField('y', Number(valueOf('prop-img-y')) || 0);
    });
    bind('prop-img-w', 'input', function () {
      L.app.setElementField('width', Math.max(40, Number(valueOf('prop-img-w')) || 40));
    });
    bind('prop-img-h', 'input', function () {
      L.app.setElementField('height', Math.max(40, Number(valueOf('prop-img-h')) || 40));
    });
    bind('prop-img-ratio', 'change', function () {
      const input = document.getElementById('prop-img-ratio');
      L.app.setImageKeepRatio(element, input ? input.checked : true);
    });
    bind('prop-img-rotation', 'change', function () {
      const angle = normalizeAngle(valueOf('prop-img-rotation'));
      L.app.setElementField('rotation', angle);
      const input = document.getElementById('prop-img-rotation');
      if (input) input.value = angle;
    });
    bind('prop-img-opacity', 'input', function () {
      const value = Number(valueOf('prop-img-opacity'));
      L.app.setElementField('opacity', value);
      document.getElementById('prop-img-opacity-value').textContent = value.toFixed(2);
    });
    bind('prop-img-blur', 'input', function () {
      const value = Number(valueOf('prop-img-blur'));
      L.app.setElementField('blur', value);
      document.getElementById('prop-img-blur-value').textContent = value;
    });
    bindAdvancedToggle();
    if (ui.advancedImage) {
      bindImageEffectFields('prop-img', function (key, value) {
        L.app.setElementField(key, value);
      });
    }
    bind('prop-delete-block', 'click', function () { L.app.deleteSelection(); });
  }

  /* 图层/属性共用：供 ui.js 渲染背景图片行时使用 */
  ui.fitLabel = fitLabel;
})();
