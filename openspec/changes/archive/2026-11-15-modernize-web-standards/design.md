# Design

## Context

运行时是零构建、`file://` 直开的经典脚本应用（见 `openspec/specs/code-architecture/spec.md`），UI 由 `js/ui*.js` 命令式重建 DOM，画布由 LeaferJS + 手写 `render.js` 绘制。审计报告 `docs/modern-web-audit-2026-11.md` 给出了逐项位置与基线分档；本设计只解决「怎么改」，需求见 `specs/`。

四条约束决定了方案形状：

1. **不能引入构建期工具链**——脚本合并、模块化、预处理器都不可用，能用的只有原生平台能力与 `build.sh` 的拷贝/注入。
2. **不能引入运行时网络请求**——预置素材只能靠 `<script>` 注入本地文件，`fetch`/XHR 在 `file://` 下不可用。
3. **不能改变现有视觉与交互**——只换底层实现；外观、布局、动效节奏、Tab 顺序、点击/拖拽语义保持逐像素与逐行为一致。
4. **只用 Baseline Widely Available**——三引擎稳定版同时可用且已过 30 个月窗口；不达标的能力连回退分支都不引入。

### Baseline 门禁（已核实）

| 能力 | 状态 | 结论 |
| --- | --- | --- |
| `<dialog>` + `showModal()` / `::backdrop` | Baseline widely，2024-09-14 | 采用 |
| `<details>/<summary>` | Baseline widely | 采用 |
| `defer` 经典脚本、`prefers-reduced-motion`、`clip-path`、`Blob`/IndexedDB | Baseline widely | 采用 |
| `popover` | Baseline newly，2025-01-27（Safari iOS 18.3 才补齐） | 不采用 |
| CSS 锚点定位（`anchor-name`/`position-area`） | 无 Baseline（Chromium 部分、Safari 26+ 部分、Firefox 147+ 部分） | 不采用 |
| `dialog closedby` | 仅近期 Chromium，无 Baseline | 不采用 |
| `scrollbar-gutter` | Baseline newly，2024-12-11（Safari 18.2 才支持） | 不采用 |
| `requestIdleCallback` | Baseline limited（Safari 无实现） | 不采用 |
| `hidden="until-found"` | Baseline newly | 不采用 |

来源：`webstatus.dev` 特性数据与 `caniuse.com` 支持表（2026-11 核对）。

## Goals / Non-Goals

**Goals:**

- 把模态与披露控件这两类「浏览器已有语义」的交还给平台，同时保留现有 `ui.*` 调用接口，避免大面积改调用点。
- 让 IME 组合期间的按键在任何文本入口都无副作用，判定逻辑只有一处实现。
- 让首屏与预置弹窗的主线程任务可预测：无解析阻塞脚本、悬停不触发大块解析、画布热路径每帧至多一次布局读。
- 让草稿写入退出交互路径，同时保证 `pagehide` 仍有最终兜底。
- 全程零视觉与交互漂移：改动前后的截图与手工清单必须通过。

**Non-Goals:**

- 不重写属性面板的数据流，不引入虚拟 DOM 或响应式框架；只把「整面板重建」收窄为「按字段就地更新」。
- 不改动项目 JSON、PNG 导出、歌单导出格式；不改 LeaferJS 的使用方式。
- 不做任何视觉或布局现代化：不加焦点环、不放大命中区、不引入 `dvh`、不做窄窗重排、不加 hover 媒体查询、不改 toast 退场。
- 不新增键盘交互：不引入方向键漫游、Home/End 或 roving tabindex。
- 不引入 `popover`、锚点定位、`closedby`、`scrollbar-gutter`、`requestIdleCallback` 或 `hidden="until-found"`。
- 不实现服务端、PWA、离线缓存或跨标签页同步协议的扩展。

## Decisions

### D1. `<dialog>` 封装在 `ui.modal` 内部，接口与外观不变

`ui.modal.open({ title, body, actions, ... })`、`ui.modal.alert/confirm` 的签名与返回的 Promise 保持不变；内部改为创建 `<dialog>` + `showModal()`，`#modal-root` 容器保留但只作为对话框宿主，不再承担遮罩与居中。

- 理由：调用点有 6 处（背景库、导出、字体、歌单编辑器、确认框、预置详情），逐处改写会把焦点管理与关闭逻辑复制 6 份，正好违反「工具函数唯一实现」的既有约束。
- 视觉对齐：`dialog` 先做 UA 重置（`border:0; padding:0; margin:auto; max-width:none; max-height:none; background:transparent; color:inherit`），再把现有 `.modal` 的宽度、圆角、`max-height:86vh`、`animation: modal-in .14s ease-out` 原样挂到 `dialog` 上；`::backdrop` 使用现有遮罩色 `rgba(15, 23, 42, .38)`，不加模糊。
- 语义：`dialog` 自带 `role="dialog"` 与模态语义，不再手写 `aria-modal`；标题用 `aria-labelledby` 指向可见 `<h2>`；`alert` 用 `role="alertdialog"`。焦点循环交给平台，删除 `focusableList()` 与 Tab 包裹逻辑。
- 滚动锁定：`showModal()` 只让背景 inert，并不保证锁滚动；本应用 `body` 已是 `overflow:hidden`，先沿用现状，若实测背景仍随滚轮移动，则在打开时对 `html` 加锁、关闭时恢复，不引入第三方滚动锁。
- 备选：保留自定义模态只补 ARIA——拿不到顶层、`::backdrop`、原生焦点约束与滚动锁定，等于把问题保留下来。

### D2. 遮罩关闭用坐标判定，不依赖 `closedby`

`closedby` 未达 Baseline，因此不引入能力检测分支：统一在 `click` 里判断「`pointerdown` 与 `pointerup` 都落在 `dialog` 自身矩形之外」才关闭。

- 理由：只判断 `event.target === dialog` 不够——点击对话框内边距也会命中 dialog 自身，会误关；按下/抬起分开记录还能避免「在对话框内按下、拖到遮罩抬起」的误触。
- 与现状等价：现有实现也是 `event.target === root` 的遮罩判定，改动后行为一致，只是宿主从 div 变成 dialog。
- Escape 仍由平台的 `cancel` 事件承载，删除 `js/ui.js` 与 `js/fontpicker.js` 中「capture + stopPropagation」的局部拦截；歌单编辑器的「有未提交工作副本」语义在 `cancel` 里 `preventDefault()` 并走既有确认流程。

### D3. 焦点返回做幂等守卫

`showModal()` 已按规范把焦点还给打开前的元素；显式 `previousFocus.focus()` 只在「关闭后 `document.activeElement` 落到 `body`」时执行。

- 理由：双写会让焦点跳过用户预期的控件（例如从确认框返回后又被抢回顶栏）。
- 记录打开者用 `document.activeElement` 快照，而不是每个调用点传参。

### D4. 浮动提示只补描述关联，定位逻辑不动

提示仍是现有单例节点与 `place()` 坐标计算；只把触发控件的 `aria-describedby` 指向提示节点的 id，并在显示时写入文案。

- 理由：`popover` 与锚点定位都未达 Baseline，且锚点定位会改变夹取与翻转的细微行为（视觉漂移）。`aria-describedby` 是纯属性补充，读屏收益最大、风险最小。
- 现状保留：150ms 延迟、`--arrow-x`、`.pos-below/.pos-above`、Escape 捕获、rAF `.show` 全部保持；不引入 `popover="manual"`。
- 提示节点常驻 DOM（视觉隐藏），因此描述关联在隐藏时仍可被读屏读取，符合「聚焦即读出提示」的目标。

### D5. 视图切换只改语义，不新增键盘交互

左侧两个切换按钮：`role="tab"`/`aria-selected` 改为 `aria-pressed` 互斥切换按钮，补 `aria-controls`；面板补 `aria-labelledby`。页面页签去掉 `role="tablist"/"tab"`，改为普通按钮 + `aria-current="page"`。

- 理由：当前实现只有点击，没有方向键与 roving tabindex；保留 `role="tab"` 会让读屏期待一套并不存在的键盘模式（审计记为误用）。改成切换按钮后语义与真实行为一致，而 Tab 顺序、点击结果与视觉状态完全不变。
- 为什么不做完整 tab 模式：那需要新增方向键、Home/End 与 roving tabindex，属于「新增键盘交互」，与本次「只换底层实现」的约束冲突。留作后续单独变更（见 Open Questions）。
- 不做 `hidden="until-found"` 相关改动：该能力未达 Baseline，`style.css` 的 `[hidden] { display:none !important }` 保持原样。

### D6. 披露控件改用 `<details>/<summary>`，外观对齐

属性分区卡片改为 `<details open>` + `<summary>`，折叠状态仍存在既有的 `collapsedByObject` 记忆表里，`toggle` 事件写回。

- 理由：原生披露自带键盘、状态朗读与「无 JS 可用」，删掉手写 Enter/Space 处理与 `aria-expanded` 同步。
- 视觉对齐：`summary { list-style: none }` + `summary::-webkit-details-marker { display: none }`；现有 1.5px 边框三角用 `::before` 复刻并把旋转过渡挂在 `[open]` 上；`summary` 的 `display`、`padding`、`gap` 显式设为与原 `.prop-group-head` 相同，避免默认 `list-item` 造成缩进。
- 不引入高度动画：现有实现是 `hidden` 直接切换，没有展开动画，因此 `details` 也不加动画，只保留箭头旋转，节奏与现状一致。
- 状态写入仍走 `L.app`，`toggle` 只记录 UI 状态，不碰模型。

### D7. IME 判定收敛为一个工具函数

在 `js/ui.js` 暴露 `ui.isComposingEvent(event)`：返回 `event.isComposing || event.keyCode === 229 || activeComposition`，并维护一个模块级 `composing` 标志，由 `compositionstart` / `compositionend` 在捕获阶段更新（`compositionend` 后置零延迟到微任务，因为部分浏览器在 `compositionend` 后仍派发一次 `keydown`）。

- 理由：`isComposing` 在某些 IME 的 `keydown` 上不可靠，`keyCode === 229` 是必要的第二判据；歌单编辑器已经验证了这套组合（`ui-playlist-editor.js:331,362`），直接复用而不是第三次实现。
- 行内编辑器的 Enter 处理（`app-interactions.js:428`）与缩放输入（`ui.js:257`）改为先查该函数；Escape 同理。

### D8. 脚本 `defer` + 就绪启动，不改文件组织

`index.html` 的 31 个 `<script src>` 全部加 `defer`，顺序不变（`defer` 保证按文档顺序执行）。`js/app.js` 启动改为：

```
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
```

- 理由：不加 `defer` 时，`<script>` 在 `</body>` 前仍会阻塞解析且逐个同步执行；加 `defer` 后解析与下载并行，启动点在 DOM 完整之后，现有的 `getElementById` 假设反而更安全。
- 备选：`build.sh` 合并成单文件 bundle——能减少请求数，但会破坏「`dist/` 与源码逐文件一致」的构建需求，且 `file://` 下请求开销本就不是瓶颈。列为后续可选项（见 Open Questions）。
- `file://` 下 `defer` 行为与 http 一致，无需额外分支。

### D9. 预取从「进入即加载」改为「停留 300ms / 按下 / 独立任务注入」

`ui-pickers.js` 的 `pointerenter` 改为启动 300ms 计时器（`pointerleave` 取消），`pointerdown` 立即预取；`presets.js` 的 `loadScript` 把「创建 script 并插入」放到 `setTimeout(inject, 0)` 中，并返回去重后的 Promise。

- 理由：`pointerenter` 覆盖了「鼠标扫过一排分类」的路径，3.6 MB 的 `overlay.js` 在悬停瞬间被解析，直接吃掉几十到上百毫秒主线程。
- 为什么不用 `requestIdleCallback`：Safari 无实现，不在 Baseline 内；`setTimeout(0)` 已足以把注入移出事件处理，且行为在三引擎一致。
- 分块：`scripts/build-presets.sh` 按分类内序号把超大分类（overlay、pattern）拆成多个块，`index` 记录分块文件名；预置 ID 不变，运行时按 id 前缀懒加载对应块。这是 `background-layer` 新需求的体积预算落地方式。
- 不改成外部图片引用：会污染画布同源与 PNG 导出（报告 §5 的约束项）。

### D10. 画布热路径合帧与几何缓存，保留现有测量路径

- `app-chrome.updateCursor` 的调用点从 `pointermove` 处理器内移到 rAF 队列，同一帧只保留最后一个指针位置。
- `overlayPoint` 使用的 `getBoundingClientRect()` 缓存到几何版本号，`syncGeometry` 完成时自增版本；缓存失效才重新读取。
- `app-viewport.handleResize` 改为 `requestGeometry()`：rAF 内合并多次 resize，执行一次 `syncGeometry` + `applyViewTransform` + 重绘。
- **不引入 `scrollbar-gutter`**：未达 Baseline，且会改变滚动条出现时的布局计算。`syncGeometry` 的两次测量保留原样——它只在尺寸变化时执行，不在拖拽热路径上，性能收益不足以换取跨浏览器风险。

### D11. 草稿资产迁移到 Blob，写入退到异步任务

- IndexedDB 升到 v2：新增 `assetBlobs` store（key 为资产 id，值为 `Blob`）；旧 `assets` store 的 base64 记录在读取时转为 Blob 写入新 store，旧记录保留，不主动删，避免升级失败丢数据。
- 信封仍写 localStorage（它小且同步写有 `pagehide` 兜底价值），但值的构建从 `input` 事件路径移出：`saveDraftNow` 只做「快照键判重 + 入队」，序列化在 `setTimeout(0)`（或下一帧之后）执行。
- `file://` 下无法用 Worker（`new Worker(blobURL)` 在部分浏览器被同源策略拒绝），因此不承诺「完全离开主线程」，只承诺「不在输入/拖拽的事件处理里同步整包序列化」。
- 图片在项目 JSON 里仍 base64——这是导出格式，不动。

### D12. 属性面板按字段就地更新

给每个字段容器加 `data-field` 稳定键；改值后只更新该字段的 `value`/`textContent` 与状态标签。结构性变化（行列数、显示分类名、增删图片）只重建对应卡片，重建前记录 `document.activeElement` 的字段键与 `selectionStart`，重建后恢复。

- 理由：当前 6 处 `innerHTML =` 全量重建是「输入丢焦点」与「步进中断」的直接原因，而既有需求「面板输入就地提交」已经承诺了不重建。
- 不做细粒度 diff 框架：按 `data-field` 定位足够，且不引入新抽象。

### D13. 无障碍 CSS 只做不可见项

- 新增 `@media (prefers-reduced-motion: reduce)` 块，统一把 `animation`/`transition` 时长设为 `0.01ms` 并禁用 `scroll-behavior`；默认模式下的时长与缓动不变。
- `clip: rect(0 0 0 0)` → `clip-path: inset(50%)`（视觉等价，且不再依赖已废弃属性）。
- **明确不做**：`:focus-visible` 重绘焦点环（会改变键盘用户看到的外观）、放大命中区（会改变可点击范围与内边距）、`dvh`/窄窗重排（会改变布局）、`@media (hover)` 包裹（会改变混合设备的悬停表现）。这些项留待产品明确允许视觉变化时再评估。

### D14. 性能优先的回退规则

任何子项若在改动后引入可测量的交互回退，允许放弃该子项的标准收益、保留现有实现，只补语义：

- 判定阈值：在含多页与多图的样例项目上录制 5 秒连续拖拽，改动前后各 3 次取中位数；帧时间中位数上升超过 1ms，或新增任一 >50ms 长任务，即视为回退。
- 优先回退顺序：`<dialog>` 顶层/遮罩（保留自定义遮罩 + 补语义）→ `<details>`（保留按钮 + `aria-expanded`）→ 预取延迟（缩短或取消延迟）→ 草稿 Blob（回退旧 store 写入路径）。
- 理由：历史变更（`2026-11-14-optimize-redraw-performance` 等）已经为画布热路径做过专门优化，不能用标准合规换回卡顿。

## Risks / Trade-offs

- **[`<dialog>` 的顶层合成开销]** → 按 D14 判定；若遮罩绘制使拖拽帧时间上升，保留自定义遮罩并把 `role`/焦点仍按 `modal-dialog` 需求补齐。
- **[焦点返回双触发导致焦点跳位]** → D3 的幂等守卫；验收清单包含「从确认框返回后焦点停在触发按钮」。
- **[`defer` 改变启动时序，`dev-checks.js` 或手工脚本假设同步 `L`]** → 启动集中在 `boot()`，`L` 命名空间仍在脚本执行时建立；`node --test` 不受影响；手工验收覆盖 `file://` 直开与 `dist/` 两处。
- **[预置分块破坏既有 ID 稳定性]** → 只改块文件划分，不改 `presets/manifest.json` 的 ID；`build.sh` 已校验索引列的块都存在，分块后该校验继续生效；回归用「已应用预置的旧项目导出再导入」。
- **[IDB v2 升级失败导致草稿不可恢复]** → 升级只新增 store、不删旧 store；读取优先新 store，缺失时回退旧 store；升级异常时保留 v1 并提示，不 `deleteDatabase`。
- **[`<details>` 与现有卡片 CSS 冲突，出现默认 marker 或缩进]** → D6 的显式重置；验收用改动前后的属性面板截图逐项对比。
- **[`aria-pressed` 让读屏听到「切换按钮」而非「标签页」]** → 这是与真实交互一致的取舍；若后续允许新增方向键，再改回完整 tab 模式（见 Open Questions）。
- **[悬停延迟 300ms 让「快速点击分类」变慢]** → `pointerdown` 立即预取，点击路径不等计时器。

## Migration Plan

1. **第 1 批（无结构风险）**：IME 判定函数与两处调用点、`clip-path`、toast 的 live region、reduced-motion 块、提示的 `aria-describedby` 关联。每步可独立发布，`VERSION` 递增。
2. **第 2 批（结构替换）**：`ui.modal` 内部换 `<dialog>`、Escape 拦截删除、视图切换语义、页面页签语义、分类行改按钮、`<details>` 折叠。同一批次内先模态后视图切换，避免同时改焦点路径；每步都要做截图对比。
3. **第 3 批（性能）**：`defer` + 启动就绪、预取延迟与异步注入、分块生成、画布合帧、草稿 Blob 与异步写入、属性面板就地更新。草稿格式升级是唯一不可逆项，因此放在最后且保留旧 store。

回滚以批次为单位：每批结束跑一次 `node --test scripts/checks/*.test.js`、`./build.sh`、截图对比与手动清单；任一批引入回归即回退该批提交，不影响已发布的前序批次。

## Open Questions

- 是否在 `build.sh` 里把 29 个应用脚本合并为单个 bundle 以进一步减少 `file://` 的请求开销？取决于后续在低端设备上的实测，合并会改变「产物与源文件逐文件一致」的既有构建需求，需要单独变更。
- 支持的浏览器下限是否正式定为「最近两个大版本的 Chromium / Firefox / Safari」？当前按 Baseline widely 实现，未写死版本号。
- 后续是否允许为左侧视图切换补完整 tab 键盘模式（方向键 + roving tabindex）？那属于新增交互，需要产品单独确认。
