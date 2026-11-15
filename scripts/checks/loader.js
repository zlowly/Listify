'use strict';

/*
 * 回归检查用的运行时装载器。
 *
 * 为什么需要它：项目保持零构建、运行时只有经典 <script> 标签。Node 里没有 DOM，
 * 而 js/model.js 在归一化字体栈时会通过 canvas 探测 `ctx.font` 是否被接受、
 * js/layout.js 在加载时就用 `document.createElement('canvas')` 建测量画布。
 * （需求里提到的 `supportsColorMix` 颜色探测在当前 model.js 中已不存在，但同一类
 * “加载期创建 canvas 并读写上下文”的依赖仍然成立。）
 * 这里用 Node 内置 `vm` 造一个最小沙箱，注入确定性的 canvas / document 桩，
 * 再按 index.html 的顺序执行脚本，从而在没有浏览器、没有 npm 依赖的前提下跑纯逻辑回归。
 *
 * 明确不追求保真：canvas 桩不做真实排版，只保证 measureText 可复现
 * （virtualWidth * fontSize * 0.6）。任何依赖真实字体度量或像素绘制的断言都不该
 * 放在这里。
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

/*
 * 脚本清单从 index.html 实读（见 readRuntimeScripts），下面只列必需项与跳过项。
 * js/assets.js 之类的基础模块会自动跟随 index.html 的加载顺序。
 *
 * 跳过：
 *   js/ui.js / js/ui-*.js —— UI 入口与字段工厂、模态框、选择器、歌单编辑器、属性面板，
 *                            与真实 DOM 控件、事件委托、面板渲染绑定；装载它们会诱导
 *                            我们为整个界面造桩，超出回归检查边界。
 *   js/fontpicker.js      —— 依赖 navigator.queryLocalFonts、Intl 字体枚举与 UI 弹窗。
 *   js/clipboard-image.js —— 依赖 ClipboardEvent/DataTransfer 的真实对象。
 *   js/presets.js         —— 运行时向 document.head 注入 <script> 加载预置索引，
 *                            file:// 场景由浏览器完成，Node 中无意义。
 *   js/app.js             —— 末尾直接 init()，启动即操作 canvas、事件与 IndexedDB。
 *
 * export.js 虽然是导出入口，但加载期只定义函数（document 仅在调用时使用），
 * 与 render.js 同属可安全装载的纯模块，因此一并加载，方便后续测试导出文件名等逻辑。
 */
const RUNTIME_SCRIPTS_BASE = [
  'js/model.js',
  'js/layout.js',
  'js/import.js',
  'js/playlist-export.js',
  'js/render.js',
  'js/io.js',
  'js/zip.js'
];

const SKIPPED_SCRIPTS = [
  { file: 'js/ui-fields.js', reason: 'UI 字段工厂，与 ui.js 同属 DOM 界面层' },
  { file: 'js/ui-modal.js', reason: '模态框依赖真实 DOM 焦点与事件' },
  { file: 'js/ui-pickers.js', reason: '选择器弹窗依赖真实 DOM 与预置资源加载' },
  { file: 'js/ui-playlist-editor.js', reason: '歌单编辑器依赖真实 DOM 表格与事件' },
  { file: 'js/ui-property-panel.js', reason: '属性面板依赖真实 DOM 输入控件' },
  { file: 'js/ui.js', reason: 'UI 状态与真实 DOM 控件绑定' },
  { file: 'js/fontpicker.js', reason: '依赖 navigator.queryLocalFonts 与 UI 弹窗' },
  { file: 'js/clipboard-image.js', reason: '依赖真实 ClipboardEvent/DataTransfer' },
  { file: 'js/presets.js', reason: '运行时向 document.head 注入脚本加载预置索引' },
  { file: 'js/app-chrome.js', reason: '应用子域工厂，依赖真实 DOM/canvas 与 init 上下文' },
  { file: 'js/app-viewport.js', reason: '应用子域工厂，依赖真实 DOM/canvas 与 init 上下文' },
  { file: 'js/app-interactions.js', reason: '应用子域工厂，依赖真实 DOM/canvas 与 init 上下文' },
  { file: 'js/app-backgrounds.js', reason: '应用子域工厂，依赖真实 DOM/canvas 与 init 上下文' },
  { file: 'js/app-presets.js', reason: '应用子域工厂，依赖真实 DOM/canvas 与 init 上下文' },
  { file: 'js/app-draft.js', reason: '应用子域工厂，依赖真实 DOM/canvas 与 init 上下文' },
  { file: 'js/app-import-export.js', reason: '应用子域工厂，依赖真实 DOM/canvas 与 init 上下文' },
  { file: 'js/app.js', reason: '加载即 init()，需要 canvas、事件与 IndexedDB' }
];

/*
 * 从 index.html 动态读取 js/ 脚本顺序，而不是把清单写死。
 * 这样拆分 io/model/assets 等模块后，装载器会自动跟随真实加载顺序；
 * 只有 UI 层（入口与其子模块）需要显式跳过。任何必需脚本从 index.html 消失都会立即报错。
 */
function readRuntimeScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const skip = new Set(SKIPPED_SCRIPTS.map(function (entry) { return entry.file; }));
  const scripts = [];
  const pattern = /<script\s[^>]*src\s*=\s*"([^"]+)"/g;
  let match = pattern.exec(html);
  while (match) {
    const source = match[1].split('?')[0];
    if (source.indexOf('js/') === 0 && scripts.indexOf(source) === -1) scripts.push(source);
    match = pattern.exec(html);
  }
  const loadable = scripts.filter(function (file) { return !skip.has(file); });
  RUNTIME_SCRIPTS_BASE.forEach(function (file) {
    if (loadable.indexOf(file) === -1) {
      throw new Error('index.html 缺少可加载脚本：' + file);
    }
  });
  return loadable;
}

const RUNTIME_SCRIPTS = readRuntimeScripts();

/* ---------- 确定性文本宽度 ---------- */

// 与 js/model.js 的 virtualWidth 保持同一规则：CJK/全角/emoji 记 2，其余记 1。
// 这里单独实现，避免 loader 反过来依赖被测代码（测试基线必须独立）。
function virtualWidth(text) {
  let width = 0;
  for (const char of String(text == null ? '' : text)) {
    const cp = char.codePointAt(0);
    width += isWideCodePoint(cp) ? 2 : 1;
  }
  return width;
}

function isWideCodePoint(cp) {
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

/* ---------- canvas 2d 桩 ---------- */

// 粗略模拟浏览器的字体简写解析：未加引号且含空格的族名会整条失效。
// model.js 正是靠“设置后读回是否变化”来判断字体栈是否可用，所以这里必须
// 对明显非法的值保持旧值，否则会把浏览器的失败路径测成成功路径。
function splitFontFamilies(text) {
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
  return { parts: parts, unterminatedQuote: !!quote };
}

function familyTokenIsValid(token) {
  const name = token.trim();
  if (!name) return false;
  const first = name.charAt(0);
  const last = name.charAt(name.length - 1);
  if (first === '"' || first === "'") return name.length >= 2 && last === first;
  return !/[\s"']/.test(name);
}

function fontShorthandIsValid(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return false;
  const match = /(\d+(?:\.\d+)?)px\s+(.+)$/.exec(text);
  if (!match) return false;
  const split = splitFontFamilies(match[2]);
  if (split.unterminatedQuote) return false;
  return split.parts.every(familyTokenIsValid);
}

function fontPixelSize(font) {
  const match = /(\d+(?:\.\d+)?)px/.exec(String(font == null ? '' : font));
  return match ? Number(match[1]) : 16;
}

function noop() {}

function createContext2d() {
  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 1)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    filter: 'none',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    _font: '10px sans-serif',
    // 面积/路径类方法一律空实现：回归检查不覆盖真实绘制。
    save: noop,
    restore: noop,
    scale: noop,
    rotate: noop,
    translate: noop,
    transform: noop,
    setTransform: noop,
    resetTransform: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    fillText: noop,
    strokeText: noop,
    drawImage: noop,
    putImageData: noop,
    setLineDash: noop,
    getLineDash: function () { return []; },
    isPointInPath: function () { return false; },
    isPointInStroke: function () { return false; },
    createLinearGradient: function () { return { addColorStop: noop }; },
    createRadialGradient: function () { return { addColorStop: noop }; },
    createPattern: function () { return null; },
    getImageData: function () {
      return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    },
    getTransform: function () {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
    // 唯一需要确定性的接口：宽度只由文本虚拟宽度与字号决定。
    measureText: function (text) {
      const width = virtualWidth(text) * fontPixelSize(ctx._font) * 0.6;
      return {
        width: width,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: width,
        actualBoundingBoxAscent: fontPixelSize(ctx._font) * 0.8,
        actualBoundingBoxDescent: fontPixelSize(ctx._font) * 0.2
      };
    }
  };
  Object.defineProperty(ctx, 'font', {
    enumerable: true,
    configurable: true,
    get: function () { return ctx._font; },
    set: function (value) {
      const next = String(value == null ? '' : value);
      if (!fontShorthandIsValid(next)) return;
      ctx._font = next;
    }
  });
  return ctx;
}

function createCanvasStub() {
  const ctx = createContext2d();
  return {
    width: 300,
    height: 150,
    style: {},
    getContext: function (type) { return type === '2d' ? ctx : null; },
    toDataURL: function () { return 'data:image/png;base64,'; },
    toBlob: function (callback) { callback(null); },
    addEventListener: noop,
    removeEventListener: noop
  };
}

/* ---------- document 桩 ---------- */

function createElementStub(tagName) {
  return {
    tagName: String(tagName || 'div').toUpperCase(),
    style: {},
    dataset: {},
    classList: {
      add: noop, remove: noop, toggle: noop, contains: function () { return false; }
    },
    children: [],
    appendChild: function (child) { this.children.push(child); return child; },
    removeChild: function (child) { return child; },
    remove: noop,
    click: noop,
    focus: noop,
    blur: noop,
    setAttribute: noop,
    removeAttribute: noop,
    getAttribute: function () { return null; },
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
}

function createDocumentStub() {
  const body = createElementStub('body');
  const head = createElementStub('head');
  const doc = {
    body: body,
    head: head,
    documentElement: createElementStub('html'),
    activeElement: null,
    visibilityState: 'visible',
    fonts: { ready: Promise.resolve(), addEventListener: noop, removeEventListener: noop },
    createElement: function (tagName) {
      return String(tagName).toLowerCase() === 'canvas' ? createCanvasStub() : createElementStub(tagName);
    },
    createTextNode: function (text) { return { nodeType: 3, textContent: String(text) }; },
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    contains: function () { return false; },
    addEventListener: noop,
    removeEventListener: noop
  };
  return doc;
}

/* ---------- 沙箱 ---------- */

function normalizeScriptName(name) {
  const text = String(name == null ? '' : name).trim();
  if (!text) throw new Error('脚本名不能为空');
  if (text.indexOf('/') !== -1) return text;
  return 'js/' + (text.endsWith('.js') ? text : text + '.js');
}

// 始终按 RUNTIME_SCRIPTS 的 index.html 顺序执行；显式 request 只用于裁剪子集。
function resolveScripts(requested) {
  if (requested == null) return RUNTIME_SCRIPTS.slice();
  if (!Array.isArray(requested)) throw new Error('scripts 必须是数组');
  const wanted = [];
  requested.forEach(function (item) {
    const file = normalizeScriptName(item);
    if (wanted.indexOf(file) === -1) wanted.push(file);
  });
  const ordered = RUNTIME_SCRIPTS.filter(function (file) { return wanted.indexOf(file) !== -1; });
  wanted.forEach(function (file) {
    if (ordered.indexOf(file) === -1) ordered.push(file);
  });
  ordered.forEach(function (file) {
    const absolute = path.resolve(ROOT, file);
    if (absolute.indexOf(ROOT + path.sep) !== 0 && absolute !== ROOT) {
      throw new Error('脚本必须位于仓库内：' + file);
    }
    if (!fs.existsSync(absolute)) throw new Error('脚本不存在：' + file);
  });
  return ordered;
}

/**
 * 创建运行时沙箱。
 * @param {object} [options]
 * @param {boolean} [options.document=true] 是否注入 document 桩；false 时默认只加载 model.js。
 * @param {string[]} [options.scripts] 只加载指定脚本（短名 'model' 或路径 'js/model.js'）。
 * @returns {{ Listify: object, sandbox: object, context: object, scripts: string[] }}
 */
function createRuntime(options) {
  const opts = options || {};
  const withDocument = opts.document !== false;
  const scripts = resolveScripts(
    opts.scripts == null && !withDocument ? ['js/model.js'] : opts.scripts
  );

  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.console = opts.console || console;
  sandbox.devicePixelRatio = typeof opts.devicePixelRatio === 'number' ? opts.devicePixelRatio : 1;
  sandbox.crypto = webcrypto;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  // URL 只用于对象 URL 的创建/释放；测试不接触真实图片，给稳定占位即可。
  sandbox.URL = {
    createObjectURL: function () { return 'blob:listify-test'; },
    revokeObjectURL: noop
  };
  sandbox.Blob = Blob;
  sandbox.TextEncoder = TextEncoder;
  sandbox.TextDecoder = TextDecoder;
  sandbox.atob = atob;
  sandbox.btoa = btoa;
  sandbox.Image = function Image() { this.width = 0; this.height = 0; this.naturalWidth = 0; this.naturalHeight = 0; };
  if (withDocument) sandbox.document = createDocumentStub();

  const context = vm.createContext(sandbox);
  scripts.forEach(function (file) {
    const absolute = path.resolve(ROOT, file);
    const source = fs.readFileSync(absolute, 'utf8');
    vm.runInContext(source, context, { filename: absolute });
  });

  if (!sandbox.Listify) throw new Error('运行时未创建 window.Listify');
  return {
    Listify: sandbox.Listify,
    sandbox: sandbox,
    context: context,
    scripts: scripts
  };
}

/**
 * 方便测试的快捷入口：只返回 window.Listify。
 * @param {object} [options] 同 createRuntime。
 * @returns {object}
 */
function load(options) {
  return createRuntime(options).Listify;
}

// vm 里创建的对象/数组带有沙箱 realm 的原型，宿主侧的 assert.deepStrictEqual
// 会因原型不同而失败。比较结构前先做一次 JSON 往返，显式丢弃 realm 差异。
function toPlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  ROOT: ROOT,
  RUNTIME_SCRIPTS: RUNTIME_SCRIPTS,
  SKIPPED_SCRIPTS: SKIPPED_SCRIPTS,
  virtualWidth: virtualWidth,
  createContext2d: createContext2d,
  createCanvasStub: createCanvasStub,
  createDocumentStub: createDocumentStub,
  createRuntime: createRuntime,
  load: load,
  toPlain: toPlain
};
