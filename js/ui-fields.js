(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const ui = L.ui = L.ui || {};

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function field(label, control) {
    const match = / id="([^"]+)"/.exec(control);
    const forAttr = match ? ' for="' + match[1] + '"' : '';
    return '<div class="field"><label' + forAttr + '>' + esc(label) + '</label><div class="control">' + control + '</div></div>';
  }

  function fieldHelp(label, control, tip) {
    const match = / id="([^"]+)"/.exec(control);
    const forAttr = match ? ' for="' + match[1] + '"' : '';
    return '<div class="field field-help"><label' + forAttr + '>' + esc(label) + '</label><div class="control">' + control + '</div>' +
      helpTip(tip) + '</div>';
  }

  function fieldPair(labelA, controlA, labelB, controlB, extraClass) {
    const half = function (cls, label, control) {
      const match = / id="([^"]+)"/.exec(control);
      const forAttr = match ? ' for="' + match[1] + '"' : '';
      return '<div class="field ' + cls + '"><label' + forAttr + '>' + esc(label) + '</label><div class="control">' + control + '</div></div>';
    };
    return '<div class="field-row' + (extraClass ? ' ' + extraClass : '') + '">' +
      half('field-a', labelA, controlA) + half('field-b', labelB, controlB) +
      '</div>';
  }

  /* 当前选中对象的稳定键，用于按对象隔离折叠记忆 */
  function selectionKey() {
    const state = L.app && L.app.state;
    if (!state || !state.selection) return 'none';
    const selection = state.selection;
    if (selection.type === 'element') return 'el:' + selection.id;
    if (selection.type === 'backgroundSet') return 'bgset:' + selection.setId;
    if (selection.type === 'backgroundImage') return 'bgimg:' + selection.setId + ':' + selection.imageId;
    return 'page:' + (state.currentPageId || '');
  }

  /* 无记忆时：仅分类名子分区在分类名隐藏时默认收起 */
  function defaultCollapsed(groupKey) {
    if (groupKey !== 'title') return false;
    const state = L.app && L.app.state;
    if (!state || !state.selection || state.selection.type !== 'element') return false;
    const page = L.app.currentPage();
    if (!page) return false;
    const element = page.elements.find(function (item) { return item.id === state.selection.id; });
    return !!element && element.type === 'category' && element.showTitle === false;
  }

  function isCollapsed(groupKey) {
    const key = selectionKey() + '::' + groupKey;
    if (key in ui.groupCollapse) return ui.groupCollapse[key];
    return defaultCollapsed(groupKey);
  }

  function syncGroupDom(groupKey, collapsed) {
    const section = ui.els.propertyPanel.querySelector('.prop-group[data-group="' + groupKey + '"]');
    if (!section) return;
    if ('open' in section) section.open = !collapsed;
  }

  /* 写状态表并就地同步 DOM，不整块重渲染；供折叠按钮与显示开关共用 */
  function setGroupCollapsed(groupKey, collapsed) {
    collapsed = !!collapsed;
    ui.groupCollapse[selectionKey() + '::' + groupKey] = collapsed;
    syncGroupDom(groupKey, collapsed);
  }

  /* 统一分组卡片：标题条本身就是原生披露控件（summary），名称、状态与箭头保持同一行；
     状态内容留在 summary 内但不参与折叠，交互控件自行阻止默认切换 */
  function propGroup(key, titleHtml, bodyHtml, options) {
    const opts = options || {};
    if (opts.plain) {
      return '<section class="prop-group prop-group-plain" data-group="' + esc(key) + '">' + bodyHtml + '</section>';
    }
    const collapsed = isCollapsed(key);
    const bodyId = 'prop-group-body-' + key;
    return '<details class="prop-group" data-group="' + esc(key) + '"' +
        (collapsed ? '' : ' open') + '>' +
      '<summary class="prop-group-title">' +
        '<span class="prop-group-name">' + titleHtml + '</span>' +
        (opts.right ? '<span class="title-right">' + opts.right + '</span>' : '') +
        '<span class="prop-group-chevron" aria-hidden="true"></span>' +
      '</summary>' +
      '<div class="prop-group-body" id="' + bodyId + '">' + bodyHtml + '</div>' +
      '</details>';
  }

  function helpTip(text) {
    return '<button type="button" class="help-tip" data-tip="' + esc(text) + '" aria-label="' + esc(text) + '">?</button>';
  }

  /* 数值宽度档位：|max|≥1000 或带符号 → 72px；小数或两位 → 64px；其余三位整数 → 56px */
  function numberTier(min, max, step) {
    if ((max != null && Math.abs(max) >= 1000) || (min != null && min < 0)) return 'num-wide';
    const s = Number(step) || 1;
    if (s < 1 || (max != null && max <= 99)) return 'num-slim';
    return 'num-mid';
  }

  function numberInput(id, value, min, max, step, disabled, ctrlStep) {
    return '<input id="' + id + '" class="input ' + numberTier(min, max, step) + '" type="number" value="' + esc(value) + '"' +
      (min != null ? ' min="' + min + '"' : '') +
      (max != null ? ' max="' + max + '"' : '') +
      ' step="' + (step || 1) + '"' +
      (disabled ? ' disabled' : '') +
      (ctrlStep != null ? ' data-ctrl-step="' + ctrlStep + '"' : '') + '>';
  }

  function textInput(id, value, placeholder) {
    return '<input id="' + id + '" class="input" type="text" value="' + esc(value) + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>';
  }

  function colorInput(id, value, disabled) {
    return '<input id="' + id + '" class="color-input" type="color" value="' + esc(value) + '"' +
      (disabled ? ' disabled' : '') + '>';
  }

  function selectInput(id, options, value, disabled, extraClass) {
    return '<select id="' + id + '" class="select' + (extraClass ? ' ' + extraClass : '') + '"' +
      (disabled ? ' disabled' : '') + '>' + options.map(function (option) {
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
      { value: '300', label: '细体' },
      { value: '400', label: '常规' },
      { value: '500', label: '中等' },
      { value: '600', label: '半粗' },
      { value: '700', label: '粗体' },
      { value: '800', label: '特粗' },
      { value: '900', label: '黑体' }
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
    // 稳定字段键：结构性重渲染后可据此定位、恢复焦点与选区
    if (!el.hasAttribute('data-field')) el.setAttribute('data-field', id);
    el.addEventListener(event, handler);
    return el;
  }

  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  /* Ctrl/⌘ + ↑/↓ 大步进：仅作用于带 data-ctrl-step 的框，复用其 input/change 提交路径 */
  function ctrlStepNumber(target, dir) {
    const big = Number(target.getAttribute('data-ctrl-step'));
    if (!Number.isFinite(big) || big <= 0) return;
    const current = Number(target.value);
    if (!Number.isFinite(current)) return;
    const step = Number(target.step);
    const decimals = step > 0 && step < 1 ? (String(step).split('.')[1] || '').length : 0;
    let next = Number((current + dir * big).toFixed(decimals));
    const min = target.min !== '' ? Number(target.min) : null;
    const max = target.max !== '' ? Number(target.max) : null;
    if (min != null && Number.isFinite(min) && next < min) next = min;
    if (max != null && Number.isFinite(max) && next > max) next = max;
    target.value = next;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function normalizeAngle(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    let angle = ((number % 360) + 360) % 360;
    if (angle > 180) angle -= 360;
    return Math.round(angle * 10) / 10;
  }

  /* 无状态字段工厂与分组折叠辅助：供属性面板与 ui.js 复用 */
  ui.esc = esc;
  ui.field = field;
  ui.fieldHelp = fieldHelp;
  ui.fieldPair = fieldPair;
  ui.propGroup = propGroup;
  ui.helpTip = helpTip;
  ui.numberTier = numberTier;
  ui.numberInput = numberInput;
  ui.selectionKey = selectionKey;
  ui.defaultCollapsed = defaultCollapsed;
  ui.isCollapsed = isCollapsed;
  ui.syncGroupDom = syncGroupDom;
  ui.setGroupCollapsed = setGroupCollapsed;
  ui.textInput = textInput;
  ui.colorInput = colorInput;
  ui.selectInput = selectInput;
  ui.rangeInput = rangeInput;
  ui.weightOptions = weightOptions;
  ui.alignOptions = alignOptions;
  ui.bind = bind;
  ui.valueOf = valueOf;
  ui.ctrlStepNumber = ctrlStepNumber;
  ui.normalizeAngle = normalizeAngle;
})();
