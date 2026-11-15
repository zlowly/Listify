# Listify 现代 Web 标准审计报告

- **审计日期**：2026-11-15
- **审计对象**：Listify 1.0.0（`index.html` 149 行、`style.css` 1519 行、`js/` 30 个应用模块约 11,200 行，另有 7 个生成的素材数据块）
- **审计依据**：`modern-web-guidance` 指南库（2026_11_09-5bcc021b）+ `legacy-scan` 确定性规则 + 逐文件人工通读
- **产出性质**：只读审计。**本次未修改任何源码**，本文档是唯一新增文件。
- **结论**：整体代码质量偏高（rAF 合帧、`setPointerCapture`、`accent-color`、`:has()`、特性检测都已到位），问题集中在 **IME 输入安全、原生弹层能力未使用、启动与悬停路径的主线程长任务、ARIA 标签页模型** 四类。

---

## 1. 审计范围与方法

### 1.1 已扫描

| 范围 | 说明 |
| --- | --- |
| `index.html` | 全文，含 31 个 `<script>`、ARIA 结构、隐藏 file input |
| `style.css` | 全文，含令牌、弹层、画布、提示、响应式断点 |
| `js/*.js` | 全部 30 个应用模块逐个通读（含 `presets-data` 的加载器，不含数据本体） |
| `build.sh` / `scripts/` | 确认发布链路不改运行时语义 |

### 1.2 明确排除

- `vendor/leafer-editor.min.js`、`vendor/leafer-filter.min.js`：第三方压缩产物，不属于本项目可维护代码。
- `js/presets-data/*.js`：由 `scripts/build-presets.sh` 生成的数据块（约 7.9 MB base64），只审计加载方式。
- Canvas 绘制结果的像素正确性、Leafer 内部渲染实现。

### 1.3 自动化扫描结果

`npx modern-web-guidance@latest legacy-scan . --json` 共扫描 33 篇指南 / 35 条确定性规则，命中 3 条：

| # | 规则 | 位置 | 结论 |
| --- | --- | --- | --- |
| 1 | `dialog` | `js/ui-modal.js:94` | 手写遮罩点击关闭，应由 `<dialog closedby="any">` 承担 |
| 2 | `ime-safe-enter-submit` | `js/app-interactions.js:428` | `Enter` 提交缺少 `isComposing` 判断（**真实缺陷**） |
| 3 | `ime-safe-enter-submit` | `js/ui.js:258` | 缩放输入框 `Enter` 提交缺少同样判断（影响低） |

> `legacy-scan` 只覆盖约 20% 的指南语料，以下高/中优先级结论主要来自人工通读，不是扫描器可以发现的模式。

### 1.4 兼容性基线假设

本项目有硬约束：`file://` 直接打开、零构建、零依赖、无 CDN。因此所有建议按三档处理：

| 档位 | 含义 | 处理原则 |
| --- | --- | --- |
| **A 档** | Baseline Widely available | 可直接采用，不需要 polyfill |
| **B 档** | Newly available（Chrome/Edge/Firefox/Safari 均已支持） | 采用 + `@supports` / 特性检测，缺失时优雅降级 |
| **C 档** | Limited（部分浏览器缺失） | **只能做渐进增强**，必须保留现有实现作为回退，不得成为功能前提 |

所有建议都不要求引入打包器、`package.json`、`type="module"` 或网络请求。

---

## 2. 高优先级（建议下个迭代修）

### H-1　中文输入法按 Enter 会直接提交并关闭编辑器（数据丢失）

**位置**：`js/app-interactions.js:424-432`（内联文本编辑器）；同类问题 `js/ui.js:257-268`（缩放输入框）

```js
// js/app-interactions.js:424
textarea.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') { ... }
  else if (event.key === 'Enter' && !event.shiftKey) {   // ← 缺 isComposing
    event.preventDefault();
    finish(true);                                         // 提交并销毁编辑器
  }
});
```

**为什么是过时写法**：这是从 `keyCode === 13` 迁移到 `event.key === 'Enter'` 时最典型的回归。用中文/日文/韩文输入法时，**回车是"确认候选词"**，不是"换行/提交"。此时 `keydown` 的 `key` 仍然是 `Enter`，但 `isComposing === true`。当前实现会在用户选词的瞬间关闭编辑器并写回半成品文案，属于不可恢复的数据丢失。

指南原文点明了这个陷阱：

> "legacy `event.keyCode === 13` handlers are already immune to IME confirmation, whereas migrating them to `event.key === 'Enter'` without `event.isComposing` and `event.keyCode === 229` will introduce premature submission."

**佐证**：项目里已经有一处写对了 —— `js/ui-playlist-editor.js:331`、`:362` 都有 `if (event.isComposing || input.__composing) return;`。也就是说这是**局部遗漏，不是设计取舍**，修复不需要新增依赖。

**现代方案**（A 档，`isComposing` 从 Chrome 56 / Firefox 31 起可用；`keyCode === 229` 是 Safari 的兼容补丁）：

```js
textarea.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    finish(false);
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    // 顺序很重要：先判断组合，再 preventDefault，避免吞掉选词
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    finish(true);
  }
});
```

缩放输入框同理（单行输入不需要 `!shiftKey`）：

```js
if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { ... }
```

**验收**：Chrome 下切到微软拼音/搜狗，双击画布文字 → 输入 `nihao` → 按 Enter 选词，编辑器必须**保持打开**；再按一次 Enter 才提交。

**顺带**：`js/ui.js:329-354` 的全局快捷键（Delete、方向键微调）也没有 `isComposing` 守卫。影响较小（焦点在输入框时已排除），但既然要改，建议统一加一个 `function composing(e){ return e.isComposing || e.keyCode === 229; }`，放在 `ui.js` 顶部，全局复用。

---

### H-2　自建模态框重复实现了浏览器已有的能力（焦点陷阱、遮罩、Esc、top layer）

**位置**：`js/ui-modal.js:12-111`；`index.html:109`；`style.css:1031-1057`

当前实现：`<div id="modal-root">` + 手写 `role="dialog" aria-modal="true"` + 手写 Tab 循环（`focusableList()` / `onKey`，L57-88）+ 手写 `onBackdrop`（L89-91）+ 手写 `previousFocus` 还原（L40、L52-54）+ 全局 `document.addEventListener('keydown', onKey)`（L92）。

**为什么是过时写法**：

1. **背景没有真正 inert**。焦点陷阱只拦 Tab，读屏用户仍可用虚拟光标遍历背景内容；浏览器原生 modal 会把背景整棵树设为 inert。
2. **不在 top layer**。`z-index: 50` 与 `z-index: 80`（toast）、`90`（tip）靠数值协调，未来加层就要重排；原生弹层永远在最上层，无需 z-index。
3. **Esc 靠全局监听**。`document` 级 keydown 与画布的 Escape 逻辑（`js/ui.js:329-354`）存在顺序耦合，`fontpicker.js:282-286` 已经在靠 `stopPropagation` 打补丁。
4. 指南明确要求不要手写这些：

> "DON'T add `role="dialog"`, `aria-modal`, a focus trap, `inert` toggling or an `Esc` handler."（`dialog` 指南）

**现代方案**（`dialog` 为 A 档；`closedby` 为 C 档，Safari 缺失 → 用指南给的坐标回退补齐 light dismiss）：

```js
ui.modal.open = function (options) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal';
  dlg.setAttribute('closedby', 'any');          // 点遮罩关闭；缺失时由下方回退补
  dlg.setAttribute('aria-labelledby', titleId);
  dlg.innerHTML = header + bodyHtml + footerHtml;
  document.body.appendChild(dlg);

  // 未保存拦截：映射原来的 options.beforeClose
  dlg.addEventListener('cancel', function (event) {
    if (typeof options.beforeClose === 'function' && options.beforeClose() === false) {
      event.preventDefault();
    }
  });
  dlg.addEventListener('close', function () {
    dlg.remove();
    if (options.onClose) options.onClose();     // 注意：close 事件后 dialog.returnValue 可判断按钮
  });

  dlg.showModal();                              // 不要用 show() 或 open 属性
  return { close: function () { dlg.close(); }, body: ..., footer: dlg };
};
```

配套 CSS：

```css
dialog.modal {
  border: 0; padding: 0; background: transparent;   /* 清掉 UA 默认边框/内边距 */
  max-height: min(86dvh, 900px);
  /* 不再需要 position: fixed / inset / flex 居中，UA 已处理 */
}
dialog.modal:modal {
  overscroll-behavior: contain;                     /* 弹窗内滚动不传递给页面 */
}
dialog.modal::backdrop {
  background: rgba(15, 23, 42, .38);
}
```

**必须注意的回归点**：

- 现有 `close()` 会同步 `root.innerHTML = ''`，而 `onClose` 在其后调用。改成 `<dialog>` 后，`close` 事件是**异步派发**的，调用方若依赖"`close()` 返回时 DOM 已清空"需要复核。
- `ui-playlist-editor.js:181` 用 `modal.root.querySelector('.modal')` 找到弹窗本体再加 `playlist-editor-modal` 类。迁移后 `modal.root` 的语义需要重新定义（建议直接返回 `<dialog>` 元素，并把 `:181` 改成 `modal.dialog.classList.add(...)`）。
- `fontpicker.js:282-286`、`ui.js:167-173` 里的 Escape 拦截可以删除，改由 `cancel` 事件统一处理；否则 `<dialog>` 的 Esc 会被提前吞掉。
- Safari 没有 `closedby`，按下述回退（来自指南，注意用**按下与抬起都在外部**判定，避免选中文字拖到遮罩就误关）：

```js
if (!('closedBy' in HTMLDialogElement.prototype)) {
  const outside = (e, d) => {
    const r = d.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  for (const d of document.querySelectorAll('dialog[closedby="any"]')) {
    let pressedOutside = false;
    d.addEventListener('pointerdown', (e) => { pressedOutside = outside(e, d); });
    d.addEventListener('pointerup', (e) => { if (pressedOutside && outside(e, d)) d.close(); });
  }
}
```

**收益**：删除约 45 行手写焦点/遮罩逻辑，`aria-modal` 与 `inert` 由浏览器保证，toast/tip 的 z-index 不必再避让。

---

### H-3　悬停预取 3.6 MB 的 base64 分块，在交互路径上制造长任务

**位置**：`js/ui-pickers.js:235`、`:318`（`pointerenter` → `prefetch`）、`:262`；`js/presets.js:19-28`（动态注入 `<script>`）、`:52-67`（`loadChunk`）

**现状与体积**：

| 文件 | 大小 |
| --- | --- |
| `js/presets-data/overlay.js` | 3.6 MB |
| `js/presets-data/pattern.js` | 2.4 MB |
| `js/presets-data/landscape.js` | 740 KB |
| `js/presets-data/texture.js` | 604 KB |
| `js/presets-data/floral.js` | 452 KB |
| `js/presets-data/index.js` | 256 KB |

鼠标**只是划过**分类标签或素材瓦片，就会 `loadScript()` 注入一个几 MB 的 JS 文件。浏览器必须：读取文件 → 解析 JS → 创建 3.6 MB 字符串字面量 → 求值 → 生成 data URL。这是典型的主线程长任务，直接抬高 INP，并且在低配机器上会卡住拖拽/缩放。

**为什么现在这么做是"合理但有代价"的**：`file://` 下不能用 `fetch`/XHR 读本地图片，且把 `file://` 图片画进 canvas 会**污染画布**，导致 `toBlob()` 导出失败（SecurityError）。所以 base64 内联是当前架构下的正确选择 —— **不建议改成引用真实图片文件**。问题不在编码方式，而在**加载时机与解析粒度**。

**现代方案（不改变 file:// 架构）**：

1. **预取降级**：`pointerenter` 改为"悬停 300ms 且未离开"或改成 `pointerdown` 时预取。用户打开面板后真正要点的分类只有一两个，悬停不是强意图。

```js
let hoverTimer;
tab.addEventListener('pointerenter', function () {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(function () { prefetch(def.id); }, 300);
});
tab.addEventListener('pointerleave', function () { clearTimeout(hoverTimer); });
```

2. **把分块解析挪出关键路径**：用 `requestIdleCallback`（B 档，Safari 不支持 → 回退 `setTimeout`）或 `scheduler.postTask({ priority: 'background' })`（C 档，需特性检测），在空闲时才注入脚本：

```js
const idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
idle(function () { prefetch(catId); }, { timeout: 2000 });
```

3. **拆分超大块**：`overlay.js` 3.6 MB 单文件建议按 10~15 张图拆成 `overlay-1.js`、`overlay-2.js`，索引仍指向同一分类。单次解析从 3.6 MB 降到 300 KB 量级，长任务被切碎。生成脚本 `scripts/build-presets.sh` 是唯一的改动点，运行时加载逻辑不变。

4. **解码交给浏览器线程**：拿到 data URL 后用 `createImageBitmap` 替代 `new Image()`（见 L-8），解码发生在主线程之外。

**量化验收**：Chrome Performance 面板录制"打开背景面板 → 悬停一个分类 → 应用一张图"，`Long Task` 数量应从多次 100ms+ 降到 0~1 次 50ms 以内；INP 目标 < 200ms。

---

### H-4　31 个同步 `<script>` 串行求值，首帧被整条依赖链卡住

**位置**：`index.html:117-147`

```html
<script src="vendor/leafer-editor.min.js"></script>
<script src="vendor/leafer-filter.min.js"></script>
<script src="js/assets.js?v=20261110c"></script>
... 共 29 个应用模块 ...
<script src="js/app.js?v=20261110c"></script>
```

31 个 classic script，**没有 `defer`、没有 `async`、没有 `fetchpriority`**。虽然都在 `</body>` 前，但浏览器必须按顺序求值完全部脚本才会进入可交互状态；`app.js:893` 的 `init()` 还会 `await ctx.draft.restoreDraftOnStartup()`（IndexedDB + localStorage 读取）后才首次 `ui.renderAll()`。也就是说：**解析 31 个文件 → 求值 → 恢复草稿 → 建 DOM → 首帧**，全部串在一条链上。

**为什么是过时写法**：`defer` 从 2010 年代起就是外部脚本的标准加载方式；当前写法还让每个脚本都成为解析阻塞点，并且阻碍了浏览器对本地文件的并行读取。指南的对应规则：

> "DO NOT use `fetchpriority` on every script tag; it should only be used to change the browser's default heuristic when it is known to be sub-optimal."

**现代方案**（A 档，改动极小）：

```html
<!-- 关键渲染依赖：保留顺序，改为 defer -->
<script defer src="vendor/leafer-editor.min.js"></script>
<script defer src="vendor/leafer-filter.min.js"></script>
<script defer src="js/assets.js?v=..."></script>
...
<script defer src="js/app.js?v=..."></script>
```

要点：

- `defer` **保持执行顺序**，IIFE 模块之间的 `L.xxx` 依赖不受影响（这也是不能改用 `type="module"` 的原因：`file://` 下被 CORS 阻断）。
- `app.js` 目前直接调用 `init()` 而不等 `DOMContentLoaded`，是因为脚本在 body 末尾。加了 `defer` 后，脚本在解析完成后、`DOMContentLoaded` 前执行，DOM 同样就绪，行为不变；但更稳妥的写法是显式等待：

```js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
```

- 若部署到 `gh-pages`（`build.sh --pages`），可以只给 1~2 个关键脚本加 `fetchpriority="high"`（例如 `leafer-editor`），**不要给每个标签都加**；`file://` 下该属性无意义，加了也无害。
- 真正的收益来源是"解析完成即可绘制静态外壳（顶栏、侧栏、检查栏骨架）"，而不是省掉下载时间。

**进一步（可选，需评估）**：`build.sh` 可以把 29 个应用模块合并成 1 个 `js/bundle.js`（纯文本拼接，因为都是 IIFE，顺序即依赖）。这仍是"零构建运行时"（文件已生成好，用户不需要构建），能把 31 次求值降到 3 次。属于发布脚本改动，需确认 `dist/` 与源码调试体验的平衡，建议单独提案。

---

### H-5　提示气泡是自绘浮层：读屏不可达、定位与翻转全部手写

**位置**：`js/ui.js:23-78`（`initToolbarTips`）、`js/ui.js:81-137`（`propTip`）、`js/ui.js:104-128`（`place()`）、`style.css:808-833`（`.prop-tip`）、`style.css:918-934`（`.canvas-tip`）

**现状**：

- 创建**单例** `<div class="canvas-tip" role="tooltip">` 挂到 `document.body`，用 `getBoundingClientRect()` 算坐标，写 `style.left/top`，再 `requestAnimationFrame` 加 `.show` 类触发 CSS 过渡。
- `propTip.place()` 用 `window.innerWidth/innerHeight` 手动夹取边界，设置 `--arrow-x` 变量，切 `.pos-above` / `.pos-below` 来翻转箭头。
- 全局扫描 **0 处 `aria-describedby`**：`role="tooltip"` 有了，但触发按钮与气泡之间没有可访问性关联，读屏用户听不到提示内容。
- 每 150ms 延迟 + `setTimeout` + rAF + 手动边界计算，全部是浏览器已经内建的能力。

**为什么是过时写法**：这是"用 JS 复刻 popover + CSS Anchor Positioning"的教科书案例。指南明确：popover 的 `popovertarget` 会**自动建立隐式锚点关系**，无需手写 `anchor-name`/`position-anchor`；翻转用 `position-try-fallbacks` 而非 `innerWidth` 计算。

**现代方案（三步，可独立落地）**：

**第 1 步（无兼容性风险，先做）**：补 `aria-describedby`。这是纯可访问性修复，不改视觉：

```html
<button class="help-tip" type="button" aria-label="帮助：列宽自动" aria-describedby="tip-colwidth">?</button>
<div id="tip-colwidth" class="prop-tip" role="tooltip">自动列宽按最长歌名计算…</div>
```

**第 2 步（B/C 档增强）**：改用 `popover` + 锚点定位，保留现有 JS 作为回退。

```html
<button class="help-tip" type="button" popovertarget="tip-colwidth" aria-describedby="tip-colwidth">?</button>
<div id="tip-colwidth" popover="manual" role="tooltip">自动列宽按最长歌名计算…</div>
```

```css
@supports (anchor-name: --x) {
  .help-tip { anchor-name: --tip; }
  .prop-tip {
    position-anchor: --tip;
    position-area: block-start;
    position-try-fallbacks: flip-block, flip-inline;
    inset: auto;            /* 清掉 popover 的 UA inset/margin */
    margin: 0 0 8px;
    /* 箭头方向随翻转自动切换：Chrome 143+ 的锚点容器查询，缺失时保留默认箭头 */
  }
  @supports (container-type: anchored) {
    .prop-tip { container-type: anchored; }
    .prop-tip::before { content: "▲" / ""; }              /* 默认在上方 */
    @container anchored(fallback: flip-block) {
      .prop-tip::before { content: "▼" / ""; }            /* 翻转到下方 */
    }
  }
}
```

**第 3 步（可选）**：入场动画改 `@starting-style`，删除 rAF 加类的写法：

```css
.prop-tip[popover] { opacity: 0; transition: opacity .15s ease-out, display .15s, overlay .15s; transition-behavior: allow-discrete; }
.prop-tip:popover-open { opacity: 1; @starting-style { opacity: 0; } }
```

**保留现有 JS 的理由**：Safari/Firefox 目前不支持锚点定位，`@supports` 之外必须继续走 `place()`。`place()` 本身可以保留，但建议加一个 `if (CSS.supports('anchor-name: --x')) return;` 短路，避免无谓的布局读取。

**附带问题**：`.help-tip` 只有 12×12 px（见 M-10），`cursor: help` 在小目标上很难命中，本身就是可用性问题。

---

### H-6　标签页的 ARIA 模型不完整，且页面标签用错了语义

**位置**：`index.html:30-35`（侧栏 tablist）、`index.html:44-45`（tabpanel）、`index.html:51`（页面 tablist）、`js/ui.js:360-370`（`setPanel`）、`js/ui.js:384-398`（`renderPageTabs`）

**问题 A：侧栏标签页缺键盘模型。** 有 `role="tablist"` / `role="tab"` / `aria-selected`，但：

- 没有方向键切换、没有 `Home`/`End`；
- 没有 roving tabindex（两个 tab 都能被 Tab 命中，符合"每个 tab 都是 Tab 停靠点"的错误模型）；
- 面板有 `role="tabpanel"` 但**没有 `aria-labelledby`**，面板没有可访问名；
- 反过来，tab 上写了 `aria-controls` —— 指南明确说这是噪音：

> "Do not add `aria-controls` to the tabs: no screen reader uses it."

**问题 B：页面标签根本不是标签页。** `index.html:51` 的 `role="tablist"` 用于**多页文档切换**（新增/删除/切换页），这是导航而非"同一内容的多个视图"。指南直接禁止这种用法：

> "DO NOT use this or the WAI-ARIA tabs pattern for page navigation, even if it is intended to be presented as a tabbed interface."

读屏用户会听到 "第 1 页，标签 1/3"，然后期待一个 `tabpanel`，但实际发生的是整页内容替换，语义完全错位。

**现代方案**：

**B 先改**（删语义比加语义安全）：

```html
<!-- 页面切换：普通按钮组，当前页用 aria-current -->
<nav id="page-tabs" class="page-tabs" aria-label="页面列表">
  <button type="button" class="page-tab" aria-current="page" aria-label="第 1 页">1</button>
  <button type="button" class="page-tab" aria-label="第 2 页">2</button>
  <button type="button" class="page-tab page-tab-add" aria-label="新增页面">＋</button>
</nav>
```

`ui.js:384-398` 同步：去掉 `role="tab"`/`aria-selected`，改 `aria-current`（用 `el.toggleAttribute('aria-current', isActive)`，值设为 `'page'` 时用 `setAttribute`）。CSS 里 `[aria-selected="true"]` 选择器相应改为 `[aria-current="page"]`。

**A 再改**（保留真标签页，补键盘模型）。因为 `focusgroup`（Chrome 150+）不能作为前提，手写 roving tabindex：

```js
const tabs = Array.from(document.querySelectorAll('.sidebar-tabs [role="tab"]'));
let activeIndex = Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'));

function selectTab(i, focus) {
  activeIndex = (i + tabs.length) % tabs.length;
  tabs.forEach((tab, idx) => {
    const on = idx === activeIndex;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;                       // roving tabindex
    if (on && focus) tab.focus();
  });
  ui.setPanel(tabs[activeIndex].getAttribute('data-panel'));
}

document.querySelector('.sidebar-tabs').addEventListener('keydown', (e) => {
  const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (e.key in map) { e.preventDefault(); selectTab(activeIndex + map[e.key], true); }
  else if (e.key === 'Home') { e.preventDefault(); selectTab(0, true); }
  else if (e.key === 'End') { e.preventDefault(); selectTab(tabs.length - 1, true); }
});
```

面板补名，删掉 tab 上的 `aria-controls`：

```html
<button ... role="tab" id="tab-categories" aria-selected="true" tabindex="0">分类</button>
<button ... role="tab" id="tab-layers" aria-selected="false" tabindex="-1">图层</button>
<div id="category-panel" role="tabpanel" aria-labelledby="tab-categories" tabindex="0"></div>
<div id="layer-panel" role="tabpanel" aria-labelledby="tab-layers" tabindex="0" hidden></div>
```

**可选增强**：把 `hidden` 改为 `hidden="until-found"`，让浏览器"页内查找"能搜到非活动面板里的内容（C 档，Safari 缺失时自动退化为普通 `hidden`）。**注意**：`style.css:42` 的 `[hidden] { display: none !important; }` 会破坏 `until-found` 的语义（它本应用 `content-visibility: hidden`），需要改成 `[hidden]:not([hidden="until-found"])`。

---

## 3. 中优先级

### 3.1　总表

| # | 位置 | 过时点 | 现代替代 | 影响 |
| --- | --- | --- | --- | --- |
| M-1 | `ui-property-panel.js:119,208,253,597,705,756` | 属性面板整块 `innerHTML` 重建；`columns`/`rows` 改动即重建（:665、:669），输入中途丢焦点 | 局部 DOM 更新或 `replaceChildren` + 焦点恢复 | INP、可编辑性 |
| M-2 | `app-interactions.js:210-265`、`app-chrome.js:419-459` | 每个 `pointermove` 都跑 5 次命中测试 + `updateCursor`；`overlayPoint()` 每次 `getBoundingClientRect()` | rAF 合并；缓存 overlay 矩形（`syncGeometry` 时更新） | 拖拽掉帧 |
| M-3 | `app-viewport.js:104-144` | 读写交替的强制同步布局（测滚动条宽度） | `scrollbar-gutter: stable` 消除二次测量；`ResizeObserver` 替代 resize 读数 | 布局抖动 |
| M-4 | `ui.js:325-327` | `window.resize` 直接调 `handleResize()`，无合并 | 复用已有的 `viewport.requestGeometry()`（rAF 合帧） | resize 掉帧 |
| M-5 | `style.css:1052,1485,500` | `modal-in`/`toast-in`/chevron 动画无 reduced-motion 处理 | `@media (prefers-reduced-motion: no-preference)` 包裹 | 前庭敏感用户 |
| M-6 | `style.css:47`、`:44-49` | `height: 100vh`；`min-width: 900px` + `body{overflow:hidden}` 在小屏直接裁掉右侧 | `100dvh`；小屏允许滚动或折叠检查栏 | 移动端/分屏 |
| M-7 | `draft-store.js:217-234`、`:159-166` | 每次保存同步写整个项目 JSON 到 localStorage；图片以 base64 字符串存 IDB（+33% 体积 + 主线程编解码） | 信封也放 IDB；IDB 直接存 `Blob` | 保存卡顿、配额 |
| M-8 | `ui.js:407-421,434-439`、`style.css:277-293` | `<div role="button" tabindex="0">` 手写 Enter/Space | `<button type="button" draggable="true">` | 语义、焦点、拖拽一致性 |
| M-9 | `style.css:443-503` | `.prop-group` 手风琴 + 自绘三角 chevron + `hidden` 无法动画 | `<details>/<summary>`（`::details-content` 动画为增强） | 语义、查找 |
| M-10 | `style.css:154-168,772-796,170-201` | 12/28/32 px 点击目标；`hover` 样式未用 `@media (hover:hover)` 包裹 | 最小 24×24（AA），主操作 44×44；hover 用能力查询 | 触摸误触、粘滞 hover |
| M-11 | `ui.js:579-589`、`style.css:1465-1493` | toast 无 `role="status"`/`aria-live`，无退出动画，无堆叠上限 | `#toast-root` 加 `role="status"`；错误 toast 用 `role="alert"` | 读屏静默 |
| M-12 | `style.css:1509-1512` | `clip: rect(0 0 0 0)` 已废弃 | `clip-path: inset(50%)` | 未来浏览器移除 |

### 3.2　需要展开的几条

**M-1 属性面板重建**。`bind('prop-el-w', 'input', …)`（L627）每敲一个字符就 `resizeElementWidth` + 重绘；表格局部的 `columns`/`rows` 直接 `ui.renderPropertyPanel()`（L665/L669），**正在输入的数字框会被替换掉**，光标丢失。建议：结构不变时只更新 `textContent`/`value`；必须重建时记录 `document.activeElement.id` 与 `selectionStart`，重建后恢复。这是纯内部重构，风险可控。

**M-3 强制同步布局**。`syncGeometry` 先读 `clientWidth`，写 `stage.style.width`，再读 `scrollEl.clientWidth` 判断滚动条是否出现 —— 每次都是 layout thrash。给 `.canvas-scroll` 加 `scrollbar-gutter: stable;`（A 档，Chrome 94+/Firefox 97+/Safari 18.2+，旧浏览器只是没有预留槽位，功能不受影响）后，滚动条出现不再改变内容宽度，第二次读取可以直接删掉。

**M-7 草稿写入**。`writeDraftEnvelope`（`draft-store.js:217-234`）在 300ms 防抖后仍然 `JSON.stringify` + `localStorage.setItem` 同步执行；项目含多页多元素时是几十 KB 的同步写。建议把信封也搬进 IDB（异步、配额大），`localStorage` 只留一个 `{version, updatedAt}` 指针用于启动时快速判断。图片资源改存 `Blob`：

```js
// 现在：base64 字符串
store.put({ id, data: await blobToBase64(blob) });

// 建议：直接存 Blob（IDB 结构化克隆原生支持）
store.put({ id, blob });                       // 读出后用 URL.createObjectURL(blob)
```

**M-5 reduced-motion**。当前三处动画都是 0.14~0.16s 的位移/缩放，属于"空间运动"，应当默认关闭：

```css
@media (prefers-reduced-motion: no-preference) {
  .modal { animation: modal-in .14s ease-out; }
  .toast { animation: toast-in .16s ease-out; }
}
.prop-group-chevron { transition: none; }
@media (prefers-reduced-motion: no-preference) {
  .prop-group-chevron { transition: transform .15s ease; }
}
```

> 指南明确反对全局 `animation-duration: 0.01ms` 的"一刀切"写法：它会让某些动画变得更突兀，且会连带关掉颜色过渡。

**M-9 `<details>` 的取舍**。现有手风琴有"按选中对象记忆折叠状态"（`ui.groupCollapse`）与自绘 chevron，换成 `<details>` 需要：

- `<details open>` 承载展开态，`<summary class="prop-group-title">` 自带键盘与读屏语义；
- 记忆状态改为读写 `details.open`；
- chevron 用 `summary::marker { content: "" }` 去掉原生三角，再画自己的；
- 展开动画：`::details-content` + `interpolate-size: allow-keywords`（仅 Chromium），**建议先不做动画**，语义收益大于动效收益。

**M-10 触摸目标**。`.help-tip` 12×12、`.icon-btn` 28×28（1180px 断点下还有 28×28 的 `.page-tab`）。WCAG 2.5.8（AA）要求 24×24，Apple/Google 建议 44×44。桌面 Chrome 为主可以接受 28，但 `.help-tip` 的 12px 即使鼠标也很难点中 —— 建议用透明 padding 扩到 24×24 而**不改变视觉尺寸**：

```css
.help-tip { position: relative; }
.help-tip::after { content: ""; position: absolute; inset: -6px; }  /* 命中区 24×24 */
```

另外 `.btn:hover`、`.category-row:hover`、`.page-tab:hover` 等需要包在 `@media (hover: hover) and (pointer: fine)` 里，否则触摸设备上点完会留下"粘住"的 hover 态。

---

## 4. 低优先级

| # | 位置 | 现状 | 现代替代 | 备注 |
| --- | --- | --- | --- | --- |
| L-1 | `style.css:1-23` | 设计令牌全是 hex + rgba | `oklch()` 渐变、`color-mix()` 派生、`light-dark()` 双主题 | 收益是主题化，不是性能 |
| L-2 | `index.html:3-8` | 无 `color-scheme`、无 `theme-color`、无 description | `<meta name="color-scheme" content="light">` 起步 | 防止 UA 深色模式反色 |
| L-3 | `index.html:53-79` | 十几个内联 SVG 重复 | `<symbol>` + `<use>` 雪碧图 | 减少重复标记 |
| L-4 | `export.js:93-104` | `nextFrame()` 用 rAF + `setTimeout(50)` 双保险竞态 | `scheduler.yield?.() ?? new Promise(r => setTimeout(r, 0))` | Chrome 129+，需回退 |
| L-5 | `zip.js:108-143` | STORE（不压缩）+ 串行 `arrayBuffer()` | PNG 已压缩，**保留 STORE 是对的**；仅可 `Promise.all` 并行读取 | 不建议引入 `CompressionStream` 压 PNG，纯浪费 CPU |
| L-6 | `model.js:71` | `JSON.parse(JSON.stringify(v))` 深拷贝 | `structuredClone(v)`（A 档） | 大项目下更快，且保留 `Date`/`Map` |
| L-7 | `model.js:63` | `Date.now().toString(36) + seq` 生成 id | `crypto.randomUUID()`（`file://` 也是安全上下文） | 跨项目合并时避免碰撞 |
| L-8 | `assets.js:74-82`、`project-io.js:189` | `new Image()` + `onload` 后直接绘制 | `await img.decode()`；或 `createImageBitmap(blob)` 在 worker 线程解码 | 大图首绘不阻塞 |
| L-9 | `style.css:1007` | `.empty-hint` 在 canvas 上叠 `backdrop-filter: blur(2px)` | 改为纯色半透明底 | 每次重绘都要重新合成模糊 |
| L-10 | 全局 | 无 CSS 嵌套、无 `@layer`、无 `@container` | 令牌层 → 组件层用 `@layer`；面板宽度用容器查询 | 工程性改进，可延后 |
| L-11 | `index.html` | 无 `<noscript>` | 加一行提示"本应用需要启用 JavaScript" | 5 秒成本 |
| L-12 | `index.html:117-118` | 无 `fetchpriority` | 仅 http 部署时给 `leafer-editor` 加 `high` | `file://` 下无效 |

---

## 5. 已符合现代标准 / 不建议改动的部分

审计同样要确认"不该动的地方"，避免为改而改：

| 位置 | 写法 | 评价 |
| --- | --- | --- |
| `style.css:669-677` | checkbox/radio/range 用 `accent-color` | 正确，别自绘 |
| `style.css:1498-1500` | `:has()` 做窄栏布局 | 正确用法 |
| `style.css:942-954` | `scrollbar-width/color` + `::-webkit-scrollbar` 回退 | 双写是有意的兼容策略，不是残留 |
| `style.css:941` | `.canvas-scroll { overscroll-behavior: contain }` | 正确 |
| `app-interactions.js:204-208` | `setPointerCapture` | 正确，指针拖拽的标准做法 |
| `app-viewport.js:146-175` | `scheduleRedraw` + `requestRedrawFrame` + `pen` | rAF 合帧到位 |
| `app-chrome.js:126-127` | `ctx.roundRect ? … : ctx.rect` | 显式能力回退，正确 |
| `app-viewport.js:30-34` | DPR 上限 2 + 像素预算 | 移动端/高分屏的必要保护 |
| `fontpicker.js:12-25` | `queryLocalFonts` 特性检测 + 权限错误映射 + 用户手势内调用 | 处理完整（该 API 仅 Chromium，已有 toast 回退） |
| `ui-playlist-editor.js:331,362` | `event.isComposing` 守卫 | 正确，可作为 H-1 的修复范本 |
| `ui-playlist-editor.js:186`、`fontpicker.js:115` | `aria-live="polite"` 状态区 | 正确 |
| `ui.js` / `project-io.js` | 所有用户文本经 `ui.esc` | 无 XSS 面 |
| `export.js:60-76` | `canvas.toBlob()` | 未用已废弃的 `toDataURL` |
| `draft-store.js:27-67` | IDB `onversionchange`/`onblocked` | 多标签页场景处理到位 |
| `index.html:112-115` | 隐藏 `<input type="file">` + 用户手势 | 浏览器唯一允许的本地文件入口 |
| `ui-pickers.js:180-187` | `rel="noopener"` | 正确 |

**约束性"不改造"项**：

- 不引入 `type="module"` / import maps（`file://` CORS）。
- 不引入 `fetch()` 读本地资源（`file://` 禁止）。
- 不引入 polyfill CDN（离线要求）；C 档特性一律走"渐进增强 + 保留回退"。
- 不把 `presets-data` 改成外部图片引用（会污染画布，破坏 PNG 导出）。

---

## 6. Baseline 兼容性风险清单

| 特性 | 基线状态 | 本项目用法 | 建议 |
| --- | --- | --- | --- |
| `<dialog>` + `showModal()` | A 档（2022 起全绿） | 尚未使用 | 可直接采用（H-2） |
| `closedby` | C 档（Safari 缺失） | 尚未使用 | 采用 + 坐标回退 |
| Popover API | B 档（2025-01 Baseline） | 尚未使用 | 采用 + 特性检测 |
| CSS Anchor Positioning | C 档（Firefox/Safari 部分缺失） | 尚未使用 | 仅作 `@supports` 增强 |
| `@container anchored()` | C 档（Chrome 143+） | 尚未使用 | 仅箭头方向增强 |
| `focusgroup` | C 档（Chrome 150+） | 尚未使用 | **不要依赖**，手写 roving tabindex |
| `hidden="until-found"` | C 档（Safari 缺失） | 尚未使用 | 增强，需同时修 `[hidden]` 规则 |
| `interpolate-size` | C 档（Chromium） | 尚未使用 | 仅折叠动画增强 |
| `100dvh` | A 档 | 未使用（用了 `100vh`） | 直接替换（M-6） |
| `scrollbar-gutter` | A 档（Safari 18.2+） | 未使用 | 直接使用（M-3） |
| `structuredClone` | A 档 | 未使用 | 直接替换（L-6） |
| `crypto.randomUUID` | A 档（安全上下文） | 未使用 | 直接替换（L-7） |
| `scheduler.yield` | C 档（Chrome 129+） | 未使用 | 特性检测 + `setTimeout` 回退（L-4） |
| `CompressionStream` | A 档 | 未使用 | **不建议**用于 PNG（L-5） |
| `queryLocalFonts` | C 档（仅 Chromium） | 已用 | 已正确降级，保持 |
| `requestIdleCallback` | C 档（Safari 缺失） | 未使用 | 回退 `setTimeout`（H-3） |

---

## 7. 建议实施顺序

| 批次 | 内容 | 风险 | 预估 |
| --- | --- | --- | --- |
| **第 1 批**（当天可完成） | H-1 IME 守卫、M-12 `clip-path`、M-11 toast `role="status"`、M-5 reduced-motion、H-5 第 1 步 `aria-describedby` | 极低，纯增量 | 1~2 小时 |
| **第 2 批**（结构改造） | H-2 `<dialog>` 迁移、H-6 标签页语义与键盘、M-8 `div → button`、M-9 `<details>` | 中，需回归焦点/Esc/遮罩 | 1 天 |
| **第 3 批**（性能） | H-3 预取降级 + 分块拆分、H-4 `defer`、M-1 面板局部更新、M-2/M-3/M-4 布局与指针合帧、M-7 草稿存储 | 中，需 Performance 面板验证 | 1~2 天 |
| **第 4 批**（渐进增强） | H-5 第 2 步 popover + 锚点、M-6 响应式、L-1/L-2 主题令牌 | 低，`@supports` 隔离 | 按需 |

**每批结束的统一验收**：

1. `node --test scripts/checks/*.test.js` 全绿（纯逻辑回归）。
2. `./build.sh` 成功，`dist/` 中不含 `dev-checks.js`，`?v=` 注入正确。
3. 手动清单：导入 `.txt` → 拖分类入页 → 双击编辑中文（含 IME 选词）→ 改列数/行数 → 缩放/拖拽 → 导出 PNG/ZIP → 刷新恢复草稿。
4. 键盘专项：仅用 Tab/Shift+Tab/方向键/Enter/Esc 完成上述流程，弹窗内 Tab 不逃逸。
5. `agent-browser` 跑一遍快照，确认无控制台报错。

---

## 8. 附录：legacy-scan 原始命中

```
js/ui-modal.js:94     [dialog]              root.addEventListener('click', onBackdrop);
js/app-interactions.js:428 [ime-safe-enter-submit] } else if (event.key === 'Enter' && !event.shiftKey) {
js/ui.js:258          [ime-safe-enter-submit] if (event.key === 'Enter') {
```

扫描覆盖 33 篇指南 / 35 条确定性规则（约占语料 20%）。未命中的条目不代表合规，例如 H-2 的焦点陷阱、H-6 的标签页键盘模型、M-9 的手风琴均无确定性规则可匹配。

---

### Modern Web Guidance

- **`ime-safe-enter-submit`**：H-1 的方案同时检查 `event.isComposing` 与 `event.keyCode === 229`，并在判断后才 `preventDefault()`，因为只靠 `isComposing` 会漏掉 Safari 乱序派发的确认键，导致中文选词时误提交（"migrating them to `event.key === 'Enter'` without `event.isComposing` and `event.keyCode === 229` will introduce premature submission"）。
- **`dialog`**：H-2 迁移到 `<dialog showModal()>` 后建议删除 `role="dialog"`、`aria-modal`、手写焦点陷阱与 Esc 监听，改由浏览器提供 inert、top layer 与焦点归还，否则会与原生行为重复甚至冲突（"DON'T add `role="dialog"`, `aria-modal`, a focus trap, `inert` toggling or an `Esc` handler"）。
- **`light-dismiss-a-dialog`**：H-2 用 `closedby="any"` 声明式实现点遮罩关闭，并为 Safari 补按下/抬起坐标判定，避免把选中文字拖到遮罩的抬手误判为关闭（"MANDATORY: Use `closedby=\"any\"` to enable light-dismiss declaratively"）。
- **`animate-to-from-top-layer`**：H-5/H-2 的入场动画改用 `@starting-style` 且必须把 `overlay` 纳入过渡属性，否则元素在动画结束前就被移出 top layer 而被裁切（"MANDATORY: Include `overlay` in your `transition` list for any element moving into or out of the top layer"）。
- **`position-aware-tooltips`**：H-5 第 2 步依赖 `popovertarget` 建立隐式锚点关系，因此不需要手写 `anchor-name`/`position-anchor`，翻转交给 `position-try-fallbacks`（"Invoking the popover via `popovertarget` automatically establishes an implicit anchor connection with the trigger button"）。
- **`optimize-script-priority`**：H-4 只允许给 1~2 个关键脚本加 `fetchpriority="high"`，因为给全部 31 个标签加会互相稀释优先级并造成争用（"DO NOT use `fetchpriority` on every script tag; it should only be used to change the browser's default heuristic when it is known to be sub-optimal"）。
- **`tabs`**：H-6 把页面切换从 `role="tablist"` 改为普通按钮 + `aria-current`，因为多页文档切换是导航而非同一内容的视图切换（"DO NOT use this or the WAI-ARIA tabs pattern for page navigation, even if it is intended to be presented as a tabbed interface"）。
- **`motion`**：M-5 按元素逐个用 `@media (prefers-reduced-motion: no-preference)` 包裹空间动画，而不是全局把时长压到 0.01ms，后者会让部分动画更刺眼并连带关掉颜色过渡（"DO NOT globally apply `animation-duration: 0.01ms;` as it can cause certain animations to become more jarring"）。
- **`responsive-design`**：M-6 用 `100dvh` 替换 `100vh`，避免移动浏览器地址栏收起/展开时应用外壳高度跳变（"Use dynamic viewport units (`dvh`, `dvw`) instead of `vh`/`vw` to prevent layout breakage when mobile browser UI elements (like address bars) appear or disappear"）。

---

## 附：实施状态（2026-11-15，变更 `modernize-web-standards`）

实施时以「不改视觉、不改交互、只用 Baseline Widely Available」为准绳，因此本报告 5.x 中提到但尚未进入 Baseline 的方案（`closedby`、CSS Anchor Positioning、`popover`、`scrollbar-gutter`、`requestIdleCallback`、`@starting-style`、`until-found`）一律未采用，改用等效降级实现。

| 条目 | 状态 | 落地位置 / 验证 |
| --- | --- | --- |
| H-1 IME Enter | 已修 | `ui.isComposingEvent`（`js/ui.js`）统一判定；缩略图缩放输入、内联文本编辑、歌单编辑器复用；浏览器模拟 composition 验证：组合中 Enter 不提交，`compositionend` 后 Enter 正常提交 |
| H-2 自定义弹窗 | 已修 | `js/ui-modal.js` 改为原生 `<dialog>` + `showModal()` + `::backdrop`；Esc 走 `cancel`；点遮罩关闭用 pointerdown/click 双坐标判定（不用 `closedby`）；`alert/confirm` 为 `role="alertdialog"`；验证：`matches(':modal')`、560px/86vh/10px、入场 `modal-in .14s`、Esc 后焦点回到触发页签 |
| H-3 预取与体积 | 已修 | 300ms 悬停驻留或 pointerdown 才预取；脚本注入推迟到独立异步任务；预置数据按 700KB 预算拆分为 `<分类>-N.js`（16 个分片），`index.js` 提供 `chunkMap` 并发合并 |
| H-4 阻塞脚本 | 已修 | `index.html` 31 个脚本全部 `defer`，`js/app.js` 在 `DOMContentLoaded` 启动；`dist/` 验证 31 处 `defer`，无 `type="module"` |
| H-5 提示气泡 | 已修（降级） | 共享节点 + `aria-describedby`；保留原有 150ms 延迟、`--arrow-x` 定位与外观；未引入 popover/锚点定位（未达 Baseline） |
| H-6 标签页语义 | 已修 | 侧栏改为 `aria-pressed` 按钮 + `role="region"` 面板；页面页签改为 `role="group"` + `aria-current="page"`；未新增方向键/roving tabindex（会改变交互） |
| M-1 面板重建 | 已修 | 输入框带 `data-field`；表格列数/行数只重建对应卡片（`refreshTableCard`），焦点与滚动不变；验证：列数 3→4 后焦点仍在 `#prop-table-0-columns`，`scrollTop` 不变 |
| M-2 指针热路径 | 已修 | 光标命中经 rAF 合帧、叠加层矩形按几何版本缓存 |
| M-3 强制同步布局 | 保留 | 两段式测量是滚动条宽度探测所必需；`scrollbar-gutter` 未达 Baseline，未采用 |
| M-4 resize 未合帧 | 已修 | `handleResize` 改为 `requestGeometry()` + 合帧重绘 |
| M-5 动效偏好 | 已修 | 末尾 `@media (prefers-reduced-motion: reduce)` 统一收敛时长 |
| M-6 视口单位/窄屏 | 未做 | 会改变布局与最小宽度策略，超出「只升级实现」范围 |
| M-7 草稿写入 | 已修 | IDB v3：`assetBlobs` 存 `Blob`、`draftMeta` 存结构化信封（不再 `JSON.stringify`），`localStorage` 仅在 `pagehide/visibilitychange` 兜底 |
| M-8 伪按钮行 | 已修 | 分类行改为原生 `<button draggable>`，样式补齐保持一致 |
| M-9 手风琴 | 已修 | 属性分组改为 `<details>/<summary>`，`toggle` 捕获阶段同步折叠状态，箭头/间距不变 |
| M-10 触摸目标/焦点环 | 未做 | 属视觉变更 |
| M-11 状态提示 | 已修 | `#toast-root` 加 `role="status" aria-live="polite"`；时长/位置/数量未变 |
| M-12 废弃隐藏技巧 | 已修 | `clip` → `clip-path: inset(50%)` |
| L-1~L-12 | 未做 | 低优先级增强（色彩空间、图标精灵、`structuredClone`、`decode()` 等），不影响当前标准符合性 |

验证证据：`node --test scripts/checks/*.test.js` 61 通过 / 0 失败；`./build.sh --zip` 版本注入 32 处、16 个分类分片校验通过；`agent-browser` 回归无控制台错误；5 秒拖拽采样 301 帧，中位帧 16.7ms、P95 16.8ms、最长 20ms、0 个 >50ms 长任务。
