(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const DEFAULT_FONT = 'sans-serif';
  const DEFAULT_TITLE_STYLE = {
    fontFamilies: ['sans-serif'],
    fontFamily: DEFAULT_FONT,
    fontSize: 44,
    fontWeight: 700,
    color: '#1f2937',
    lineHeight: 1.2,
    shadow: { enabled: false, color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
    outline: { enabled: false, color: '#000000', width: 2 }
  };
  const DEFAULT_SONG_STYLE = {
    fontFamilies: ['sans-serif'],
    fontFamily: DEFAULT_FONT,
    fontSize: 28,
    fontWeight: 400,
    color: '#374151',
    lineHeight: 1.35,
    shadow: { enabled: false, color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
    outline: { enabled: false, color: '#000000', width: 2 }
  };
  const DEFAULT_TEXT_STYLE = {
    fontFamilies: ['sans-serif'],
    fontFamily: DEFAULT_FONT,
    fontSize: 48,
    fontWeight: 700,
    color: '#111827',
    lineHeight: 1.3,
    align: 'left',
    shadow: { enabled: false, color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
    outline: { enabled: false, color: '#000000', width: 2 }
  };
  const BACKGROUND_FITS = ['original', 'fill-width', 'fill-height', 'cover', 'none'];
  // 校验与编辑共用的数值边界，避免 validateProject 再写一份字面量。
  const OPACITY_MIN = 0;
  const OPACITY_MAX = 1;
  const BLUR_MIN = 0;
  // 图片调色与渐隐：属性面板、校验与渲染共用同一份范围定义。
  const BRIGHTNESS_MIN = 0.5;
  const BRIGHTNESS_MAX = 1.5;
  const HUE_MIN = -180;
  const HUE_MAX = 180;
  const FADE_MODES = ['off', 'single', 'double'];
  const FADE_ANGLE_MIN = 0;
  const FADE_ANGLE_MAX = 360;
  // 渐隐额外参数（比照 Kdenlive 的 Alpha Gradient）：
  // 位置与转场宽度都按“沿角度轴的图片投影长度”归一化，透明度 0 = 不透明、1 = 全透明。
  // 双向下位置是不透明带中心、宽度是不透明带宽度；平台被夹到图片内，贴边的一端没有过渡坡。
  const FADE_POSITION_MIN = 0;
  const FADE_POSITION_MAX = 1;
  const FADE_WIDTH_MIN = 0;
  const FADE_WIDTH_MAX = 1;
  const FADE_TRANSPARENCY_MIN = 0;
  const FADE_TRANSPARENCY_MAX = 1;
  // 单向转场宽度为 0 时退化成硬边；给一个极窄的坡避免零长度渐变。
  const FADE_MIN_SPAN = 0.0001;
  const FADE_MODE_DEFAULTS = {
    off: { fadePosition: 0, fadeWidth: 1, fadeTop: 0, fadeBottom: 1 },
    single: { fadePosition: 0, fadeWidth: 1, fadeTop: 0, fadeBottom: 1 },
    double: { fadePosition: 0.5, fadeWidth: 0, fadeTop: 1, fadeBottom: 1 }
  };
  const MARGIN_MIN = 0;
  // 页面尺寸的输入范围与预设；属性面板、setPageSize 与校验共用同一份定义。
  const PAGE_SIZE_MIN = 320;
  const PAGE_SIZE_MAX = 5000;
  const PAGE_SIZE_PRESETS = [
    { id: '1080p-portrait', label: '1080P 竖屏', width: 1080, height: 1920 },
    { id: '1080p-landscape', label: '1080P 横屏', width: 1920, height: 1080 },
    { id: '2k-portrait', label: '2K 竖屏', width: 1440, height: 2560 },
    { id: '2k-landscape', label: '2K 横屏', width: 2560, height: 1440 }
  ];
  // 需要“大于该值”的尺寸下限（页面尺寸、元素宽高、图片尺寸、表格列宽）。
  const IMAGE_MIN_SIZE = 0;
  const PROJECT_VERSION = 5;
  const DEFAULT_BACKGROUND_COLOR = '#ffffff';
  const DEFAULT_BACKGROUND_IMAGE = {
    kind: 'image',
    assetId: null,
    fit: 'cover',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    keepRatio: true,
    opacity: 1,
    blur: 0,
    brightness: 1,
    hue: 0,
    fadeMode: 'off',
    fadeAngle: 0,
    fadePosition: 0,
    fadeWidth: 1,
    fadeTop: 0,
    fadeBottom: 1
  };
  const DEFAULT_TABLE_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 };
  const CROP_SIDES = ['top', 'right', 'bottom', 'left'];
  const DEFAULT_CROP = { top: 0, right: 0, bottom: 0, left: 0 };

  let seq = 0;
  function uid(prefix) {
    seq += 1;
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + seq;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /* ---------- 图片裁剪 ---------- */

  // 裁剪值属于图片条目：四边原图像素，缺省 0。读取时只做安全归一，
  // 越界合计交给 clampCrop 按原图尺寸夹取，避免渲染出空白图片。
  function cropValues(item) {
    const source = item && item.crop;
    const result = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!source || typeof source !== 'object') return result;
    CROP_SIDES.forEach(function (side) {
      const value = Number(source[side]);
      result[side] = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
    });
    return result;
  }

  function hasCrop(item) {
    const crop = cropValues(item);
    return crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;
  }

  function cropSignature(item) {
    const crop = cropValues(item);
    return crop.top + '|' + crop.right + '|' + crop.bottom + '|' + crop.left;
  }

  function clampCrop(crop, natural) {
    const result = cropValues({ crop: crop });
    const naturalWidth = Number(natural && natural.width) || 0;
    const naturalHeight = Number(natural && natural.height) || 0;
    if (!(naturalWidth > 0) || !(naturalHeight > 0)) return result;
    function fitPair(first, second, max) {
      const total = first + second;
      if (total <= max) return [first, second];
      if (total <= 0 || max <= 0) return [0, 0];
      const scaledFirst = Math.min(max, Math.floor(first * max / total));
      return [scaledFirst, max - scaledFirst];
    }
    const horizontal = fitPair(result.left, result.right, Math.max(0, Math.floor(naturalWidth) - 1));
    const vertical = fitPair(result.top, result.bottom, Math.max(0, Math.floor(naturalHeight) - 1));
    result.left = horizontal[0];
    result.right = horizontal[1];
    result.top = vertical[0];
    result.bottom = vertical[1];
    return result;
  }

  // 单边编辑：只夹取当前边，保留对边与其它方向，适合面板逐项输入。
  function setCropSide(crop, side, value, natural) {
    const result = cropValues({ crop: crop });
    if (CROP_SIDES.indexOf(side) < 0) return result;
    const number = Number(value);
    const next = Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
    const horizontal = side === 'left' || side === 'right';
    const opposite = side === 'left' ? 'right' : (side === 'right' ? 'left' : (side === 'top' ? 'bottom' : 'top'));
    const dimension = horizontal
      ? Number(natural && natural.width) || 0
      : Number(natural && natural.height) || 0;
    const max = dimension > 0
      ? Math.max(0, Math.floor(dimension) - 1 - result[opposite])
      : next;
    result[side] = Math.min(next, max);
    return result;
  }

  // 完整框 -> 可见矩形：完整框始终映射整张原图，裁剪只内缩可见区域。
  function visibleRect(frame, natural, crop) {
    if (!frame) return { x: 0, y: 0, width: 0, height: 0 };
    const naturalWidth = Number(natural && natural.width) || 0;
    const naturalHeight = Number(natural && natural.height) || 0;
    if (!(naturalWidth > 0) || !(naturalHeight > 0)) {
      return {
        x: Number(frame.x) || 0,
        y: Number(frame.y) || 0,
        width: Number(frame.width) || 0,
        height: Number(frame.height) || 0
      };
    }
    const values = clampCrop(crop, natural);
    const scaleX = (Number(frame.width) || 0) / naturalWidth;
    const scaleY = (Number(frame.height) || 0) / naturalHeight;
    return {
      x: (Number(frame.x) || 0) + values.left * scaleX,
      y: (Number(frame.y) || 0) + values.top * scaleY,
      width: Math.max(0, naturalWidth - values.left - values.right) * scaleX,
      height: Math.max(0, naturalHeight - values.top - values.bottom) * scaleY
    };
  }

  // 可见矩形 -> 完整框：交互只操作可见矩形，写回模型前统一换算。
  function frameRectFromVisible(visible, natural, crop) {
    const naturalWidth = Math.max(1, Number(natural && natural.width) || 1);
    const naturalHeight = Math.max(1, Number(natural && natural.height) || 1);
    const values = clampCrop(crop, natural);
    const sourceWidth = Math.max(1, naturalWidth - values.left - values.right);
    const sourceHeight = Math.max(1, naturalHeight - values.top - values.bottom);
    const scaleX = (Number(visible.width) || 0) / sourceWidth;
    const scaleY = (Number(visible.height) || 0) / sourceHeight;
    return {
      x: (Number(visible.x) || 0) - values.left * scaleX,
      y: (Number(visible.y) || 0) - values.top * scaleY,
      width: naturalWidth * scaleX,
      height: naturalHeight * scaleY
    };
  }

  function visibleAspect(natural, crop) {
    const naturalWidth = Math.max(1, Number(natural && natural.width) || 1);
    const naturalHeight = Math.max(1, Number(natural && natural.height) || 1);
    const values = clampCrop(crop, natural);
    return Math.max(0, naturalWidth - values.left - values.right) /
      Math.max(1, naturalHeight - values.top - values.bottom);
  }

  function resetCrop(item) {
    if (!item) return;
    item.crop = { top: 0, right: 0, bottom: 0, left: 0 };
  }

  /* ---------- 图片调色与渐隐 ---------- */

  function effectNumber(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function fadeModeOf(item) {
    const mode = item && item.fadeMode;
    return FADE_MODES.indexOf(mode) >= 0 ? mode : 'off';
  }

  // 模式预设：切换模式时面板会用目标模式的预设重置渐隐参数，
  // 避免把“单向的 100% 坡长”直接当成“双向的 100% 不透明带”。
  function fadeDefaults(mode) {
    const preset = FADE_MODE_DEFAULTS[fadeModeOf({ fadeMode: mode })] || FADE_MODE_DEFAULTS.off;
    return {
      fadePosition: preset.fadePosition,
      fadeWidth: preset.fadeWidth,
      fadeTop: preset.fadeTop,
      fadeBottom: preset.fadeBottom
    };
  }

  // 把图片条目上的渐隐字段归一成渲染/面板共用的一组数值。
  // 字段缺失时按当前模式的预设补齐，旧项目因此保持原观感。
  function fadeValues(item) {
    const source = item || {};
    const mode = fadeModeOf(source);
    const preset = FADE_MODE_DEFAULTS[mode];
    return {
      mode: mode,
      angle: clamp(effectNumber(source.fadeAngle, 0), FADE_ANGLE_MIN, FADE_ANGLE_MAX),
      position: clamp(effectNumber(source.fadePosition, preset.fadePosition), FADE_POSITION_MIN, FADE_POSITION_MAX),
      width: clamp(effectNumber(source.fadeWidth, preset.fadeWidth), FADE_WIDTH_MIN, FADE_WIDTH_MAX),
      top: clamp(effectNumber(source.fadeTop, preset.fadeTop), FADE_TRANSPARENCY_MIN, FADE_TRANSPARENCY_MAX),
      bottom: clamp(effectNumber(source.fadeBottom, preset.fadeBottom), FADE_TRANSPARENCY_MIN, FADE_TRANSPARENCY_MAX)
    };
  }

  // 任一效果字段非默认即视为“已调整”，供面板提示使用。
  function hasImageEffects(item) {
    if (!item) return false;
    const brightness = effectNumber(item.brightness, 1);
    const hue = effectNumber(item.hue, 0);
    const fade = fadeValues(item);
    return brightness !== 1 || hue !== 0 || fade.mode !== 'off' || fade.angle !== 0 ||
      fade.position !== FADE_MODE_DEFAULTS.off.fadePosition ||
      fade.width !== FADE_MODE_DEFAULTS.off.fadeWidth ||
      fade.top !== FADE_MODE_DEFAULTS.off.fadeTop ||
      fade.bottom !== FADE_MODE_DEFAULTS.off.fadeBottom;
  }

  // 渐隐渐变两端点（相对图片矩形中心的局部坐标）。
  // 0° 自上而下、顺时针递增；half 为盒子在渐变方向上的半投影长度，
  // 保证任意角度下渐变恰好铺满矩形而不提前截断。
  function fadeGradientPoints(angle, width, height) {
    const degrees = effectNumber(Number(angle), 0);
    const radians = degrees * Math.PI / 180;
    const dx = Math.sin(radians);
    const dy = Math.cos(radians);
    const w = Math.max(0, effectNumber(Number(width), 0));
    const h = Math.max(0, effectNumber(Number(height), 0));
    const half = Math.abs((w / 2) * dx) + Math.abs((h / 2) * dy);
    return { x1: -dx * half, y1: -dy * half, x2: dx * half, y2: dy * half };
  }

  function pushFadeStop(stops, t, alpha) {
    const rounded = Math.round(t * 1e6) / 1e6;
    const last = stops[stops.length - 1];
    if (last && last.t === rounded) {
      last.alpha = alpha;
      return;
    }
    stops.push({ t: rounded, alpha: alpha });
  }

  // 沿角度轴（0 = 起点边，1 = 终点边）把渐隐描述成“渐变向量 + 色标”。
  // 单向：位置是渐变起点、宽度是坡长；坡可以伸出图片外，图片只采样其中一段。
  // 双向：位置是不透明带中心、宽度是不透明带宽度；不透明带被夹到图片内，
  //       贴边的一端自然没有过渡坡（该端的透明度不再可见）。
  // stops.t 使用与 from/to 相同的轴向坐标；渲染时再换算成 0–1 的色标偏移。
  function fadeProfile(item) {
    const fade = fadeValues(item);
    if (fade.mode === 'double') {
      const alphaTop = 1 - fade.top;
      const alphaBottom = 1 - fade.bottom;
      const start = clamp(fade.position - fade.width / 2, 0, 1 - fade.width);
      const end = start + fade.width;
      const stops = [];
      if (start > 0) {
        pushFadeStop(stops, 0, alphaTop);
        pushFadeStop(stops, start, 1);
      } else {
        pushFadeStop(stops, 0, 1);
      }
      if (end < 1) {
        pushFadeStop(stops, end, 1);
        pushFadeStop(stops, 1, alphaBottom);
      } else {
        pushFadeStop(stops, 1, 1);
      }
      return { from: 0, to: 1, stops: stops };
    }
    const from = fade.position;
    const to = from + Math.max(fade.width, FADE_MIN_SPAN);
    const stops = [];
    pushFadeStop(stops, from, 1 - fade.top);
    pushFadeStop(stops, to, 1 - fade.bottom);
    return { from: from, to: to, stops: stops };
  }

  function matchPageSizePreset(width, height) {
    const w = Math.round(Number(width));
    const h = Math.round(Number(height));
    if (!isFinite(w) || !isFinite(h)) return null;
    for (let i = 0; i < PAGE_SIZE_PRESETS.length; i += 1) {
      const preset = PAGE_SIZE_PRESETS[i];
      if (preset.width === w && preset.height === h) return preset;
    }
    return null;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function copyStyle(style, overrides) {
    // Deep-clone so nested shadow/outline objects are not shared between
    // elements (or with the DEFAULT_*_STYLE prototypes).
    return Object.assign(clone(style || {}), overrides || {});
  }

  function quoteFamily(family) {
    const value = String(family == null ? '' : family).replace(/[\r\n\f]/g, ' ');
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  // CSS generic families must stay unquoted; everything else is quoted so that
  // names like "Alibaba PuHuiTi 3.0" do not make the whole ctx.font invalid.
  const GENERIC_FONT_FAMILIES = [
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
    'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    'emoji', 'math', 'fangsong'
  ];

  function splitFontStack(family) {
    const text = String(family == null ? '' : family);
    const parts = [];
    let buffer = '';
    let quote = '';
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charAt(i);
      if (quote) {
        buffer += ch;
        if (ch === '\\' && i + 1 < text.length) {
          buffer += text.charAt(i + 1);
          i += 1;
        } else if (ch === quote) {
          quote = '';
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        buffer += ch;
      } else if (ch === ',') {
        parts.push(buffer);
        buffer = '';
      } else {
        buffer += ch;
      }
    }
    parts.push(buffer);
    return parts;
  }

  const fontStackCache = new Map();
  let fontProbeCtx = null;

  // A double-quoted family that itself ends in `, sans-serif` is the signature
  // of an old picker value that was composed twice.
  const LEGACY_PREVIEW_FAMILY = /["']\s*,\s*sans-serif\s*["']/i;

  // Ask the canvas parser whether the stack is usable; an invalid stack makes
  // ctx.font a silent no-op, which looks like "the font did not change".
  function fontStackIsValid(raw) {
    if (typeof document === 'undefined' || !document.createElement) return true;
    if (!fontProbeCtx) {
      const canvas = document.createElement('canvas');
      fontProbeCtx = canvas.getContext ? canvas.getContext('2d') : null;
    }
    if (!fontProbeCtx) return true;
    const probe = '16px "__listify_probe_a__"';
    fontProbeCtx.font = probe;
    const fallback = fontProbeCtx.font;
    fontProbeCtx.font = '16px ' + raw;
    return fontProbeCtx.font !== fallback;
  }

  function normalizeFontStack(family) {
    const raw = String(family == null ? '' : family);
    const cached = fontStackCache.get(raw);
    if (cached) return cached;
    if (!raw.trim()) return DEFAULT_FONT;
    if (!LEGACY_PREVIEW_FAMILY.test(raw) && fontStackIsValid(raw)) {
      fontStackCache.set(raw, raw);
      return raw;
    }

    const families = [];
    splitFontStack(raw).forEach(function (part) {
      let name = part.trim();
      if (!name) return;
      if ((name.charAt(0) === '"' && name.charAt(name.length - 1) === '"') ||
          (name.charAt(0) === "'" && name.charAt(name.length - 1) === "'")) {
        name = name.slice(1, -1);
      }
      name = name
        .replace(/\\(["'\\])/g, '$1')
        .replace(/[\r\n\f]/g, ' ')
        .trim();
      if (!name) return;
      name = cleanFamilyName(name);
      if (!name) return;
      if (GENERIC_FONT_FAMILIES.indexOf(name.toLocaleLowerCase()) >= 0) {
        families.push(name.toLocaleLowerCase());
      } else {
        families.push(quoteFamily(name));
      }
    });

    const value = families.length ? families.join(', ') : DEFAULT_FONT;
    if (fontStackCache.size > 256) fontStackCache.clear();
    fontStackCache.set(raw, value);
    return value;
  }

  // Older picker builds stored the whole preview stack (e.g. `"Foo", sans-serif`)
  // in the list; keep only the family name so a stale picker cannot corrupt it.
  function cleanFamilyName(value) {
    let name = String(value == null ? '' : value).replace(/[\r\n\f]/g, ' ').trim();
    if (!name) return '';
    const legacy = name.match(/^["']?([^"']+?)["']?\s*,\s*sans-serif\s*$/i);
    if (legacy) name = legacy[1];
    if (name.indexOf(',') !== -1) {
      // A list item holds one family; a comma means an old picker saved a stack.
      name = name.split(',')[0];
    }
    return name.replace(/^["']+/, '').replace(/["']+$/, '').trim();
  }

  function normalizeFontFamilies(list) {
    const source = Array.isArray(list) ? list : [];
    const families = [];
    const seen = Object.create(null);
    source.forEach(function (item) {
      const name = cleanFamilyName(item);
      if (!name) return;
      const key = name.toLocaleLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      families.push(name);
    });
    const concrete = families.filter(function (name) {
      return name.toLocaleLowerCase() !== 'sans-serif';
    });
    if (concrete.length) return concrete;
    return ['sans-serif'];
  }

  function fontFamiliesFromFamily(fontFamily) {
    const raw = String(fontFamily == null ? '' : fontFamily);
    const families = splitFontStack(raw).map(function (part) {
      let name = part.trim();
      if ((name.charAt(0) === '"' && name.charAt(name.length - 1) === '"') ||
          (name.charAt(0) === "'" && name.charAt(name.length - 1) === "'")) {
        name = name.slice(1, -1);
      }
      name = name
        .replace(/\\(["'\\])/g, '$1')
        .replace(/[\r\n\f]/g, ' ')
        .trim();
      return cleanFamilyName(name);
    }).filter(function (name) {
      return name && name.toLocaleLowerCase() !== 'sans-serif';
    });
    return normalizeFontFamilies(families);
  }

  function fontFamilyFromList(list) {
    const families = normalizeFontFamilies(list);
    if (families.length === 1 && families[0].toLocaleLowerCase() === 'sans-serif') {
      return 'sans-serif';
    }
    const parts = families.map(function (name) {
      const key = name.toLocaleLowerCase();
      return GENERIC_FONT_FAMILIES.indexOf(key) >= 0 ? key : quoteFamily(name);
    });
    if (parts.indexOf('sans-serif') === -1) parts.push('sans-serif');
    return parts.join(', ');
  }

  function applyFontFamilies(style, list) {
    if (!style) return style;
    const families = normalizeFontFamilies(list);
    style.fontFamilies = families;
    style.fontFamily = fontFamilyFromList(families);
    delete style.fontPair;
    return style;
  }

  function styleNumber(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function styleColor(value) {
    return typeof value === 'string' && value ? value : '#000000';
  }

  function normalizeShadow(shadow) {
    if (!shadow || typeof shadow !== 'object' || Array.isArray(shadow)) {
      return { enabled: false, color: '#000000', offsetX: 2, offsetY: 2, blur: 4 };
    }
    return {
      enabled: shadow.enabled === true,
      color: styleColor(shadow.color),
      offsetX: styleNumber(shadow.offsetX, 2),
      offsetY: styleNumber(shadow.offsetY, 2),
      blur: Math.max(0, styleNumber(shadow.blur, 4))
    };
  }

  function normalizeOutline(outline) {
    if (!outline || typeof outline !== 'object' || Array.isArray(outline)) {
      return { enabled: false, color: '#000000', width: 2 };
    }
    return {
      enabled: outline.enabled === true,
      color: styleColor(outline.color),
      width: Math.max(0, styleNumber(outline.width, 2))
    };
  }

  function normalizeStyle(style) {
    if (!style || typeof style !== 'object') return style;
    delete style.fontPair;
    if (Array.isArray(style.fontFamilies)) {
      const families = normalizeFontFamilies(style.fontFamilies);
      style.fontFamilies = families;
      style.fontFamily = fontFamilyFromList(families);
    } else {
      const saved = typeof style.fontFamily === 'string' ? style.fontFamily : '';
      style.fontFamilies = fontFamiliesFromFamily(saved);
      style.fontFamily = saved.trim() ? saved : DEFAULT_FONT;
    }
    style.shadow = normalizeShadow(style.shadow);
    style.outline = normalizeOutline(style.outline);
    return style;
  }

  function findStyleSource(project, page, type, y) {
    const targetY = typeof y === 'number' && isFinite(y) ? y : 0;
    const elements = page && Array.isArray(page.elements) ? page.elements : [];
    const candidates = elements.filter(function (element) {
      return element && element.type === type;
    });

    let above = null;
    candidates.forEach(function (element) {
      const elementY = typeof element.y === 'number' && isFinite(element.y) ? element.y : 0;
      if (elementY <= targetY && (!above || elementY >= above.y)) {
        above = { element: element, y: elementY };
      }
    });
    if (above) return above.element;

    let nearest = null;
    candidates.forEach(function (element) {
      const elementY = typeof element.y === 'number' && isFinite(element.y) ? element.y : 0;
      const distance = Math.abs(elementY - targetY);
      if (!nearest || distance <= nearest.distance) {
        nearest = { element: element, distance: distance };
      }
    });
    if (nearest) return nearest.element;

    if (!project || !Array.isArray(project.pages)) return null;
    let last = null;
    project.pages.forEach(function (item) {
      const list = item && Array.isArray(item.elements) ? item.elements : [];
      list.forEach(function (element) {
        if (element && element.type === type) last = element;
      });
    });
    return last;
  }

  function inheritedStyle(sourceStyle, fallback) {
    return normalizeStyle(copyStyle(sourceStyle || fallback));
  }

  function createBackgroundImage(assetId, fit) {
    const mode = BACKGROUND_FITS.indexOf(fit) >= 0 ? fit : 'cover';
    return Object.assign({}, DEFAULT_BACKGROUND_IMAGE, {
      id: uid('bgimg'),
      assetId: assetId || null,
      fit: mode
    });
  }

  function createPageBackground(color) {
    return {
      color: color || DEFAULT_BACKGROUND_COLOR,
      items: []
    };
  }

  function cloneBackgroundImage(image) {
    return Object.assign({}, DEFAULT_BACKGROUND_IMAGE, image, {
      kind: 'image',
      id: uid('bgimg')
    });
  }

  function cloneBackgroundItem(item) {
    if (!item) return item;
    if (item.kind === 'shape') {
      return Object.assign(clone(item), { id: uid('bgshape'), kind: 'shape' });
    }
    return cloneBackgroundImage(item);
  }

  // 页面背景是纯值：复制时所有条目换新 ID；图片资产继续共享，图形深拷贝。
  function clonePageBackground(background) {
    const list = background && Array.isArray(background.items)
      ? background.items
      : (background && Array.isArray(background.images) ? background.images : []);
    return {
      color: background && background.color ? background.color : DEFAULT_BACKGROUND_COLOR,
      items: list.map(cloneBackgroundItem)
    };
  }

  function createPage(background) {
    return {
      id: uid('page'),
      background: clonePageBackground(background),
      elements: []
    };
  }

  function findGlobalBackgroundPage(project) {
    if (!project || !project.globalBackgroundPageId || !Array.isArray(project.pages)) return null;
    return project.pages.find(function (page) {
      return page.id === project.globalBackgroundPageId;
    }) || null;
  }

  function effectiveBackground(project, page) {
    const source = findGlobalBackgroundPage(project);
    if (source && source.background) return source.background;
    return page && page.background ? page.background : null;
  }

  // 当前页显示的是否来自另一页的全局背景。悬空指针按“无全局”处理。
  function isBackgroundCovered(project, page) {
    if (!project || !page || !project.globalBackgroundPageId) return false;
    const source = findGlobalBackgroundPage(project);
    return !!source && source.id !== page.id;
  }

  function canEditPageBackground(project, page) {
    return !!page && !!page.background && !isBackgroundCovered(project, page);
  }

  // 画布空态判定：无歌单分类、当前页无内容元素、有效背景也没有条目（图片或图形）。
  function isPageEmpty(project, page) {
    if (!project) return true;
    const categories = project.playlist && project.playlist.categories;
    const hasCategories = Array.isArray(categories) && categories.length > 0;
    const hasElements = !!page && Array.isArray(page.elements) && page.elements.length > 0;
    const background = effectiveBackground(project, page);
    const items = background && Array.isArray(background.items)
      ? background.items
      : (background && Array.isArray(background.images) ? background.images : []);
    return !hasCategories && !hasElements && items.length === 0;
  }

  function setGlobalBackgroundPage(project, page) {
    if (!project || !page || !Array.isArray(project.pages) ||
        !project.pages.some(function (item) { return item.id === page.id; })) {
      return false;
    }
    project.globalBackgroundPageId = page.id;
    return true;
  }

  function clearGlobalBackground(project) {
    if (!project) return;
    project.globalBackgroundPageId = null;
  }

  function createDefaultProject() {
    const page = createPage(createPageBackground(DEFAULT_BACKGROUND_COLOR));
    const project = {
      version: PROJECT_VERSION,
      pageSize: { width: 1080, height: 1920 },
      margins: { top: 60, right: 60, bottom: 60, left: 60 },
      playlist: { categories: [] },
      assets: [],
      globalBackgroundPageId: null,
      pages: [page]
    };
    return project;
  }

  function createTable(overrides) {
    return Object.assign({
      columns: 3,
      rows: 0,
      fill: 'column',
      align: 'left',
      widthMode: 'auto',
      widths: [],
      margins: { top: 0, right: 0, bottom: 0, left: 0 }
    }, overrides || {});
  }

  function normalizeMargins(margins) {
    const source = margins && typeof margins === 'object' ? margins : {};
    function value(key) {
      const number = Number(source[key]);
      return Number.isFinite(number) ? Math.max(0, number) : 0;
    }
    return {
      top: value('top'),
      right: value('right'),
      bottom: value('bottom'),
      left: value('left')
    };
  }

  function createCategoryElement(categoryName, x, y, project, width, page) {
    const fallbackWidth = project.pageSize.width - project.margins.left - project.margins.right;
    const elementY = typeof y === 'number' ? y : project.margins.top;
    const source = page ? findStyleSource(project, page, 'category', elementY) : null;
    return {
      id: uid('el'),
      type: 'category',
      category: categoryName,
      showTitle: true,
      x: typeof x === 'number' ? x : project.margins.left,
      y: elementY,
      width: typeof width === 'number' ? width : fallbackWidth,
      titleStyle: inheritedStyle(source && source.titleStyle, DEFAULT_TITLE_STYLE),
      songStyle: inheritedStyle(source && source.songStyle, DEFAULT_SONG_STYLE),
      tables: [createTable()]
    };
  }

  function createTextElement(project, text, page) {
    const elementY = Math.round(project.pageSize.height / 2 - 60);
    const source = page ? findStyleSource(project, page, 'text', elementY) : null;
    return {
      id: uid('el'),
      type: 'text',
      x: Math.round(project.pageSize.width / 2 - 240),
      y: elementY,
      width: 480,
      text: typeof text === 'string' ? text : '双击编辑文字',
      style: inheritedStyle(source && source.style, DEFAULT_TEXT_STYLE)
    };
  }

  function createImageElement(project, assetId, width, height) {
    const w = typeof width === 'number' ? width : 400;
    const h = typeof height === 'number' ? height : 300;
    return {
      id: uid('el'),
      type: 'image',
      x: Math.round(project.pageSize.width / 2 - w / 2),
      y: Math.round(project.pageSize.height / 2 - h / 2),
      width: w,
      height: h,
      assetId: assetId || null,
      keepRatio: true,
      rotation: 0,
      opacity: 1,
      blur: 0,
      brightness: 1,
      hue: 0,
      fadeMode: 'off',
      fadeAngle: 0,
      fadePosition: 0,
      fadeWidth: 1,
      fadeTop: 0,
      fadeBottom: 1
    };
  }

  function rotationRadians(element) {
    const degrees = Number(element && element.rotation);
    return (Number.isFinite(degrees) ? degrees : 0) * Math.PI / 180;
  }

  function rotateVector(x, y, radians) {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }

  /* Sutherland–Hodgman：把多边形裁到轴对齐矩形内（只保留内部部分）。 */
  function clipPolygonToRect(points, rect) {
    const EPSILON = 1e-9;
    function clip(polygon, axis, limit, keepGreater) {
      if (!polygon.length) return polygon;
      const result = [];
      function inside(point) {
        return keepGreater ? point[axis] >= limit - EPSILON : point[axis] <= limit + EPSILON;
      }
      function cut(from, to) {
        const fromDelta = from[axis] - limit;
        const toDelta = to[axis] - limit;
        const t = fromDelta === toDelta ? 0 : fromDelta / (fromDelta - toDelta);
        return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      }
      for (let i = 0; i < polygon.length; i += 1) {
        const current = polygon[i];
        const previous = polygon[(i + polygon.length - 1) % polygon.length];
        const currentInside = inside(current);
        const previousInside = inside(previous);
        if (currentInside) {
          if (!previousInside) result.push(cut(previous, current));
          result.push(current);
        } else if (previousInside) {
          result.push(cut(previous, current));
        }
      }
      return result;
    }
    let polygon = points;
    polygon = clip(polygon, 'x', rect.x, true);
    polygon = clip(polygon, 'x', rect.x + rect.width, false);
    polygon = clip(polygon, 'y', rect.y, true);
    polygon = clip(polygon, 'y', rect.y + rect.height, false);
    return polygon;
  }

  // 图片矩形（页面坐标，可旋转）与页面的交集，换算成图片局部坐标的外接矩形。
  // 返回相对图片中心的 { x, y, width, height }；完全在页面外时返回 null。
  // 掩膜只需覆盖可见部分，避免 4K 导出时分配整张超大位图。
  function fadeMaskRect(rect, pageSize, rotation) {
    if (!rect || !pageSize) return null;
    const width = Number(rect.width);
    const height = Number(rect.height);
    const pageWidth = Number(pageSize.width);
    const pageHeight = Number(pageSize.height);
    if (!(width > 0) || !(height > 0) || !(pageWidth > 0) || !(pageHeight > 0)) return null;
    const centerX = (Number(rect.x) || 0) + width / 2;
    const centerY = (Number(rect.y) || 0) + height / 2;
    const radians = (Number(rotation) || 0) * Math.PI / 180;
    const corners = [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [width / 2, height / 2],
      [-width / 2, height / 2]
    ].map(function (point) {
      const rotated = rotateVector(point[0], point[1], radians);
      return { x: centerX + rotated.x, y: centerY + rotated.y };
    });
    const clipped = clipPolygonToRect(corners, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight
    });
    if (clipped.length < 3) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    clipped.forEach(function (point) {
      const local = rotateVector(point.x - centerX, point.y - centerY, -radians);
      if (local.x < minX) minX = local.x;
      if (local.y < minY) minY = local.y;
      if (local.x > maxX) maxX = local.x;
      if (local.y > maxY) maxY = local.y;
    });
    const maskWidth = maxX - minX;
    const maskHeight = maxY - minY;
    if (!(maskWidth > 0) || !(maskHeight > 0)) return null;
    return { x: minX, y: minY, width: maskWidth, height: maskHeight };
  }

  // 把任意角度归一到 [-halfRange, halfRange]（0.1 精度），作为旋转角度的规范存储值。
  function wrapAngle(degrees, halfRange) {
    const number = Number(degrees);
    if (!Number.isFinite(number)) return 0;
    const half = (Number(halfRange) > 0 ? Number(halfRange) : 180);
    const range = half * 2;
    let angle = ((number % range) + range) % range;
    if (angle > half) angle -= range;
    return Math.round(angle * 10) / 10;
  }

  // 指针绕中心 (cx,cy) 从 (x0,y0) 到 (x1,y1) 的角度增量（度），归一到 (-180,180] 防 ±180° 接缝跳变。
  function angleDeltaDeg(cx, cy, x0, y0, x1, y1) {
    const from = Math.atan2(y0 - cy, x0 - cx);
    const to = Math.atan2(y1 - cy, x1 - cx);
    let delta = (to - from) * 180 / Math.PI;
    delta = ((delta % 360) + 360) % 360;
    if (delta > 180) delta -= 360;
    return Math.round(delta * 10) / 10;
  }

  // 把角度吸附到 step 的整数倍；step 非正数时按 1 处理。
  function snapAngle(degrees, step) {
    const number = Number(degrees);
    if (!Number.isFinite(number)) return 0;
    const s = (Number(step) > 0 ? Number(step) : 1);
    return Math.round(number / s) * s;
  }

  function computeImageResize(start, handle, delta, keepRatio, minSize) {
    const width0 = start.width;
    const height0 = start.height;
    const minimum = typeof minSize === 'number' && minSize >= 0 ? minSize : 40;
    const radians = (Number(start.rotation) || 0) * Math.PI / 180;
    const local = rotateVector(delta.x, delta.y, -radians);
    const directionX = handle.indexOf('e') >= 0 ? 1 : (handle.indexOf('w') >= 0 ? -1 : 0);
    const directionY = handle.indexOf('s') >= 0 ? 1 : (handle.indexOf('n') >= 0 ? -1 : 0);
    let width = width0;
    let height = height0;

    if (keepRatio) {
      if (directionX && directionY) {
        const diagonal = width0 * width0 + height0 * height0;
        const projected = (width0 * directionX + local.x) * width0 * directionX +
          (height0 * directionY + local.y) * height0 * directionY;
        let scale = diagonal > 0 ? projected / diagonal : 1;
        scale = Math.max(scale, minimum / width0, minimum / height0);
        width = width0 * scale;
        height = height0 * scale;
      } else if (directionX) {
        width = Math.max(minimum, width0 + directionX * local.x);
        height = width0 > 0 ? width * (height0 / width0) : height0;
        if (height < minimum) {
          height = minimum;
          width = height0 > 0 ? height * (width0 / height0) : width;
        }
      } else if (directionY) {
        height = Math.max(minimum, height0 + directionY * local.y);
        width = height0 > 0 ? height * (width0 / height0) : width0;
        if (width < minimum) {
          width = minimum;
          height = width0 > 0 ? width * (height0 / width0) : height;
        }
      }
    } else {
      if (directionX) width = Math.max(minimum, width0 + directionX * local.x);
      if (directionY) height = Math.max(minimum, height0 + directionY * local.y);
    }

    const anchorX = -directionX;
    const anchorY = -directionY;
    const centerX = start.x + width0 / 2;
    const centerY = start.y + height0 / 2;
    const anchorOffset = rotateVector(anchorX * width0 / 2, anchorY * height0 / 2, radians);
    const anchorPageX = centerX + anchorOffset.x;
    const anchorPageY = centerY + anchorOffset.y;
    const nextAnchorOffset = rotateVector(anchorX * width / 2, anchorY * height / 2, radians);

    return {
      x: anchorPageX - nextAnchorOffset.x - width / 2,
      y: anchorPageY - nextAnchorOffset.y - height / 2,
      width: width,
      height: height
    };
  }

  function migrateImageRect(fit, rect, natural) {
    if (fit === 'stretch' || !natural || !natural.width || !natural.height) {
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        keepRatio: fit !== 'stretch'
      };
    }
    const scale = fit === 'contain'
      ? Math.min(rect.width / natural.width, rect.height / natural.height)
      : Math.max(rect.width / natural.width, rect.height / natural.height);
    const width = Math.max(1, natural.width * scale);
    const height = Math.max(1, natural.height * scale);
    return {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y + (rect.height - height) / 2,
      width: width,
      height: height,
      keepRatio: true
    };
  }

  function getPage(project, pageId) {
    return project.pages.find(function (page) { return page.id === pageId; }) || null;
  }

  function getCategory(project, name) {
    return project.playlist.categories.find(function (category) { return category.name === name; }) || null;
  }

  function getPlacedBlock(project, categoryName) {
    for (let pageIndex = 0; pageIndex < project.pages.length; pageIndex += 1) {
      const page = project.pages[pageIndex];
      for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex += 1) {
        const element = page.elements[elementIndex];
        if (element.type === 'category' && element.category === categoryName) {
          return { page: page, pageIndex: pageIndex, element: element, elementIndex: elementIndex };
        }
      }
    }
    return null;
  }

  function allCategoryBlocks(project) {
    const result = [];
    project.pages.forEach(function (page, pageIndex) {
      page.elements.forEach(function (element, elementIndex) {
        if (element.type === 'category') {
          result.push({ page: page, pageIndex: pageIndex, element: element, elementIndex: elementIndex });
        }
      });
    });
    return result;
  }

  function unplacedCategories(project) {
    return project.playlist.categories.filter(function (category) {
      return !getPlacedBlock(project, category.name);
    });
  }

  function findElement(project, elementId) {
    for (let i = 0; i < project.pages.length; i += 1) {
      const page = project.pages[i];
      const element = page.elements.find(function (item) { return item.id === elementId; });
      if (element) return { page: page, pageIndex: i, element: element };
    }
    return null;
  }

  function ensureAssetMeta(project, id, name, mime) {
    if (!id) return;
    const existing = project.assets.find(function (asset) { return asset.id === id; });
    if (existing) {
      if (!existing.name && name) existing.name = name;
      if (!existing.mime && mime) existing.mime = mime;
      return;
    }
    project.assets.push({ id: id, name: name || 'image', mime: mime || 'image/png' });
  }

  function pageIndexOf(project, pageId) {
    return project.pages.findIndex(function (page) { return page.id === pageId; });
  }

  /* ---------- 图层顺序（模型序与显示序相反：模型下标 0 = 最底/最后绘制） ---------- */

  // 返回显示顺序（最顶层在前）的新数组，不改动入参。
  function displayOrder(list) {
    return Array.isArray(list) ? list.slice().reverse() : [];
  }

  // 把 id 拖到 targetId 的显示序「上方/下方」后应做的移动计划。
  // placement: 'before' = 显示序中位于 target 之上（更靠顶层）；'after' = 位于 target 之下。
  // 返回模型下标 { from, to }；无需移动或参数非法时返回 null。
  function planDisplayMove(list, id, targetId, placement) {
    if (!Array.isArray(list)) return null;
    if (placement !== 'before' && placement !== 'after') return null;
    if (!id || !targetId || id === targetId) return null;
    const from = list.findIndex(function (item) { return item && item.id === id; });
    const targetModelIndex = list.findIndex(function (item) { return item && item.id === targetId; });
    if (from < 0 || targetModelIndex < 0) return null;
    // 先按显示序取下标，移除后再插回：移除会让目标之后的下标前移，直接算会错位
    const displayIds = list.map(function (item) { return item.id; }).reverse();
    const fromDisplayIndex = displayIds.indexOf(id);
    const reduced = displayIds.slice();
    reduced.splice(fromDisplayIndex, 1);
    const targetDisplayIndex = reduced.indexOf(targetId);
    const insertAt = targetDisplayIndex + (placement === 'before' ? 0 : 1);
    reduced.splice(insertAt, 0, id);
    // 落点与当前显示位置一致时无需移动
    const toDisplayIndex = reduced.indexOf(id);
    if (toDisplayIndex === fromDisplayIndex) return null;
    // 显示下标换算回模型下标（模型序是显示序的反转）
    return { from: from, to: list.length - 1 - toDisplayIndex };
  }

  // 步进移动计划：id 在模型数组中移动 delta 位（+1 更靠顶层，-1 更靠底层）。
  // 越界或非法返回 null。
  function planStepMove(list, id, delta) {
    if (!Array.isArray(list)) return null;
    const step = Number(delta);
    if (!Number.isInteger(step) || step === 0) return null;
    const from = list.findIndex(function (item) { return item && item.id === id; });
    if (from < 0) return null;
    const to = from + step;
    if (to < 0 || to >= list.length) return null;
    return { from: from, to: to };
  }

  // 按模型下标移动元素并就地修改 list；from===to 或下标越界返回 false。
  function moveItem(list, from, to) {
    if (!Array.isArray(list)) return false;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return false;
    if (from === to) return false;
    const item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    return true;
  }

  function isCjkCodePoint(cp) {
    return (
      (cp >= 0x1100 && cp <= 0x11ff) ||
      (cp >= 0x2e80 && cp <= 0x303f) ||
      (cp >= 0x3040 && cp <= 0x30ff) ||
      (cp >= 0x3100 && cp <= 0x312f) ||
      (cp >= 0x3130 && cp <= 0x318f) ||
      (cp >= 0x3190 && cp <= 0x31ff) ||
      (cp >= 0x3200 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xa000 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7af) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd)
    );
  }

  function virtualWidth(text) {
    let width = 0;
    const source = String(text == null ? '' : text);
    for (const char of source) {
      const cp = char.codePointAt(0);
      width += isCjkCodePoint(cp) ? 2 : 1;
    }
    return width;
  }

  // 定位歌曲：跨分类部分匹配歌名（大小写不敏感），命中区间为原歌名坐标。
  // 逐字符小写化并记录每个小写字符对应的原串起点，
  // 避免 toLocaleLowerCase 变长（如 'İ'→'i̇'）导致 start/end 错位。
  function findSongMatches(categories, query) {
    const q = String(query == null ? '' : query).trim().toLocaleLowerCase();
    if (!q || !Array.isArray(categories)) return [];
    const matches = [];
    categories.forEach(function (category, categoryIndex) {
      const songs = category && Array.isArray(category.songs) ? category.songs : [];
      songs.forEach(function (rawSong, songIndex) {
        const song = String(rawSong == null ? '' : rawSong);
        let lowered = '';
        const starts = [];
        for (let i = 0; i < song.length; i += 1) {
          const charLower = song.charAt(i).toLocaleLowerCase();
          for (const ch of charLower) {
            lowered += ch;
            starts.push(i);
          }
        }
        const pos = lowered.indexOf(q);
        if (pos < 0) return;
        const start = starts[pos];
        const end = pos + q.length < starts.length ? starts[pos + q.length] : song.length;
        matches.push({ categoryIndex: categoryIndex, songIndex: songIndex, start: start, end: end });
      });
    });
    return matches;
  }

  function fontString(style) {
    const weight = style && style.fontWeight ? style.fontWeight : 400;
    const size = style && style.fontSize ? style.fontSize : 16;
    const family = normalizeFontStack(style && style.fontFamily ? style.fontFamily : DEFAULT_FONT);
    const italic = style && style.italic ? 'italic ' : '';
    return italic + weight + ' ' + size + 'px ' + family;
  }

  L.model = {
    DEFAULT_FONT: DEFAULT_FONT,
    DEFAULT_TITLE_STYLE: DEFAULT_TITLE_STYLE,
    DEFAULT_SONG_STYLE: DEFAULT_SONG_STYLE,
    DEFAULT_TEXT_STYLE: DEFAULT_TEXT_STYLE,
    BACKGROUND_FITS: BACKGROUND_FITS,
    OPACITY_MIN: OPACITY_MIN,
    OPACITY_MAX: OPACITY_MAX,
    BLUR_MIN: BLUR_MIN,
    BRIGHTNESS_MIN: BRIGHTNESS_MIN,
    BRIGHTNESS_MAX: BRIGHTNESS_MAX,
    HUE_MIN: HUE_MIN,
    HUE_MAX: HUE_MAX,
    FADE_MODES: FADE_MODES,
    FADE_ANGLE_MIN: FADE_ANGLE_MIN,
    FADE_ANGLE_MAX: FADE_ANGLE_MAX,
    FADE_POSITION_MIN: FADE_POSITION_MIN,
    FADE_POSITION_MAX: FADE_POSITION_MAX,
    FADE_WIDTH_MIN: FADE_WIDTH_MIN,
    FADE_WIDTH_MAX: FADE_WIDTH_MAX,
    FADE_TRANSPARENCY_MIN: FADE_TRANSPARENCY_MIN,
    FADE_TRANSPARENCY_MAX: FADE_TRANSPARENCY_MAX,
    MARGIN_MIN: MARGIN_MIN,
    PAGE_SIZE_MIN: PAGE_SIZE_MIN,
    PAGE_SIZE_MAX: PAGE_SIZE_MAX,
    PAGE_SIZE_PRESETS: PAGE_SIZE_PRESETS,
    IMAGE_MIN_SIZE: IMAGE_MIN_SIZE,
    PROJECT_VERSION: PROJECT_VERSION,
    DEFAULT_BACKGROUND_COLOR: DEFAULT_BACKGROUND_COLOR,
    DEFAULT_BACKGROUND_IMAGE: DEFAULT_BACKGROUND_IMAGE,
    DEFAULT_TABLE_MARGINS: DEFAULT_TABLE_MARGINS,
    CROP_SIDES: CROP_SIDES,
    DEFAULT_CROP: DEFAULT_CROP,
    uid: uid,
    clamp: clamp,
    matchPageSizePreset: matchPageSizePreset,
    clone: clone,
    copyStyle: copyStyle,
    quoteFamily: quoteFamily,
    normalizeFontStack: normalizeFontStack,
    normalizeFontFamilies: normalizeFontFamilies,
    fontFamiliesFromFamily: fontFamiliesFromFamily,
    fontFamilyFromList: fontFamilyFromList,
    applyFontFamilies: applyFontFamilies,
    findStyleSource: findStyleSource,
    normalizeStyle: normalizeStyle,
    normalizeShadow: normalizeShadow,
    normalizeOutline: normalizeOutline,
    createBackgroundImage: createBackgroundImage,
    cloneBackgroundImage: cloneBackgroundImage,
    cloneBackgroundItem: cloneBackgroundItem,
    createPageBackground: createPageBackground,
    clonePageBackground: clonePageBackground,
    createPage: createPage,
    findGlobalBackgroundPage: findGlobalBackgroundPage,
    effectiveBackground: effectiveBackground,
    isBackgroundCovered: isBackgroundCovered,
    canEditPageBackground: canEditPageBackground,
    isPageEmpty: isPageEmpty,
    setGlobalBackgroundPage: setGlobalBackgroundPage,
    clearGlobalBackground: clearGlobalBackground,
    createDefaultProject: createDefaultProject,
    createTable: createTable,
    normalizeMargins: normalizeMargins,
    createCategoryElement: createCategoryElement,
    createTextElement: createTextElement,
    createImageElement: createImageElement,
    rotationRadians: rotationRadians,
    rotateVector: rotateVector,
    cropValues: cropValues,
    hasCrop: hasCrop,
    cropSignature: cropSignature,
    clampCrop: clampCrop,
    setCropSide: setCropSide,
    visibleRect: visibleRect,
    frameRectFromVisible: frameRectFromVisible,
    visibleAspect: visibleAspect,
    resetCrop: resetCrop,
    hasImageEffects: hasImageEffects,
    fadeDefaults: fadeDefaults,
    fadeValues: fadeValues,
    fadeProfile: fadeProfile,
    fadeGradientPoints: fadeGradientPoints,
    fadeMaskRect: fadeMaskRect,
    wrapAngle: wrapAngle,
    angleDeltaDeg: angleDeltaDeg,
    snapAngle: snapAngle,
    computeImageResize: computeImageResize,
    migrateImageRect: migrateImageRect,
    getPage: getPage,
    getCategory: getCategory,
    getPlacedBlock: getPlacedBlock,
    allCategoryBlocks: allCategoryBlocks,
    unplacedCategories: unplacedCategories,
    findElement: findElement,
    displayOrder: displayOrder,
    planDisplayMove: planDisplayMove,
    planStepMove: planStepMove,
    moveItem: moveItem,
    ensureAssetMeta: ensureAssetMeta,
    pageIndexOf: pageIndexOf,
    virtualWidth: virtualWidth,
    findSongMatches: findSongMatches,
    isCjkCodePoint: isCjkCodePoint,
    fontString: fontString
  };
})();
