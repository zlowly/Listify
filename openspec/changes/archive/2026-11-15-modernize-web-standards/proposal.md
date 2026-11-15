# Proposal

## Why

`docs/modern-web-audit-2026-11.md` 对运行时做了一次现代 Web 标准审计，命中 30 项问题。其中最高的一档不是风格问题，而是**平台语义与真实缺陷**：行内文字编辑与缩放输入在输入法组合期间按 Enter 会直接提交并关闭编辑框（中文用户高频路径，`legacy-scan` 的 `ime-safe-enter-submit` 命中）；自定义模态层与视图切换按钮用 JS 重建了浏览器已经提供的对话框与状态语义，导致读屏语义缺失、焦点管理脆弱；`index.html` 的 31 个经典脚本全部同步阻塞解析，预置分类块在 `pointerenter` 上无条件注入 3.6 MB 脚本，直接拉长 INP 与首屏任务。

本变更只做「底层实现方式升级」：用户看到的像素、布局、动效节奏与点击/键盘行为保持不变。凡是会改变视觉或交互的审计项（命中区放大、`dvh`、窄窗重排、焦点环重绘、toast 退场动画、方向键漫游）一律不做，留作后续单独决策。

## 约束

1. **视觉与交互零变化**：不改变现有 UI 外观、布局尺寸、间距、颜色、动效时长与触发方式；不新增方向键漫游、不改变 Tab 顺序、不改变点击/拖拽语义。验收以改动前后的同尺寸截图对比与手工交互清单为准。
2. **只用 Baseline Widely Available 能力**：新引入的 HTML/CSS/JS 能力必须在 Chromium、Firefox、Safari 三引擎稳定版同时可用且已过 30 个月窗口。据此明确**不采用**：`popover`（Baseline newly，2025-01）、CSS 锚点定位（尚无 Baseline）、`dialog closedby`（仅近期 Chromium）、`scrollbar-gutter`（Baseline newly，2024-12）、`requestIdleCallback`（Safari 不支持，Baseline limited）、`hidden="until-found"`（Baseline newly）。`<dialog>` + `showModal()` 本身已是 Baseline widely（2024-09），可以使用。
3. **性能优先的例外**：历史变更曾因重绘/拖拽性能做过专门优化（参见 `2026-11-14-optimize-redraw-performance`）。若某个平台原生实现带来可测量的交互回退（例如遮罩合成或顶层绘制使画布帧时间上升），允许保留现有实现，只补齐语义与属性，不为了「更标准」牺牲已优化的热路径。
4. **既有硬约束不变**：零构建、`file://` 直开、无网络请求、经典脚本、`build.sh` 产物语义不变。

## What Changes

- **输入法组合安全**：所有文本输入（行内文字编辑、缩放百分比、模态内表单）在 `compositionstart`…`compositionend` 期间按 Enter MUST NOT 提交或关闭，按 Escape MUST NOT 关闭编辑框；统一以 `event.isComposing`/`keyCode === 229` 与显式组合标志判定，与歌单编辑器已有实现对齐。
- **原生对话框**：背景库、字体选择、导出 PNG、歌单编辑器、alert/confirm 等模态界面在 `ui.modal.*` 内部改用原生 `<dialog>` + `showModal()`，由平台承担顶层呈现、焦点进入与返回、背景不可交互；滚动锁定沿用现有 `body` 滚动策略（`showModal()` 本身不保证锁滚动，必要时显式加锁）。遮罩颜色、卡片宽度/圆角/最大高度、进入时长 MUST 与现状一致；遮罩关闭仍以「按下与抬起都落在对话框外」的坐标判定实现，不依赖 `closedby`。
- **视图切换语义**：左侧「分类 / 图层」由 `role="tab"` 改为互斥切换按钮（`aria-pressed` + `aria-controls`/`aria-labelledby`），页面页签改用 `aria-current="page"`；只改属性与角色，不改外观、Tab 顺序与点击行为，不引入方向键漫游或 roving tabindex。
- **浮动提示**：仅补 `aria-describedby` 关联，使读屏能读出提示文字；既有定位算法、150ms 出现节奏、外观与 Escape 行为保持不变。不引入 `popover` 或 CSS 锚点定位。
- **脚本加载时序**：`index.html` 的经典脚本改为 `defer` 保序加载，启动逻辑在文档就绪后执行；不再有解析阻塞脚本，依赖顺序仍由文档顺序声明。
- **预取策略**：预置分类块改为延迟预取（悬停停留 300ms 或 `pointerdown`），并在独立异步任务（`setTimeout`）中注入，避免悬停瞬间产生长任务；超大分类块在生成阶段拆分。
- **画布热路径**：悬停光标更新与窗口 resize 合帧处理，几何矩形按版本缓存；保留现有两次测量路径（不依赖 `scrollbar-gutter`）。
- **草稿写入**：图片资产在 IndexedDB 中存 `Blob` 而非 base64 字符串；项目信封序列化移出输入/拖拽事件路径，仅在 `pagehide` 保留一次同步兜底。
- **属性面板与外壳**：结构性改值不再整面板重建（保留焦点与滚动）；分组折叠改用 `<details>/<summary>` 并保持卡片外观；分类行改为真正的 `<button>`；toast 增加 `role="status"`/`aria-live`（不改可见时长与退场方式）；补齐 `prefers-reduced-motion` 与 `clip-path: inset(50%)`。

无用户可见的 **BREAKING** 变更：项目 JSON、数据模型、导出的 PNG/歌单文件格式均不变，现有草稿可继续恢复（旧 base64 资产在读取时兼容转换）。低优先级 12 项（OKLCH 令牌、SVG 雪碧图、`structuredClone`、`crypto.randomUUID`、`img.decode`、CSS 嵌套/`@layer` 等）不在本变更内，另开后续变更。

## Capabilities

### New Capabilities

- `modal-dialog`：所有模态界面的原生对话框契约——顶层呈现与背景不可交互、焦点进入与返回、关闭途径、滚动锁定与动效偏好，且外观与既有实现一致。
- `ime-safe-input`：文本输入的输入法组合契约——组合期间的按键不触发提交、关闭或导航，覆盖行内编辑、数值输入与模态表单。

### Modified Capabilities

- `editor-shell`：新增视图切换的语义与状态、页面页签的导航语义、浮动提示的可访问关联、状态提示的可感知性、动效偏好、可操作行的原生语义；修改「属性分组折叠」与「面板输入就地提交」两条既有需求。
- `canvas-view`：新增指针反馈与视图几何的合帧需求。
- `background-layer`：修改「预置分类按需加载」——预取不得在悬停瞬间无条件注入大脚本，改为停留/按下触发并在独立任务中加载，同时约束单块体积。
- `project-persistence`：新增草稿写入不阻塞交互的需求——资产以 `Blob` 存 IndexedDB，编辑期间不同步序列化整包。
- `code-architecture`：修改「零构建与经典脚本约束」——经典脚本以 `defer` 保序加载，启动在文档就绪后执行，不得引入解析阻塞脚本或 ES module。

## Impact

- 结构：`index.html`（`<dialog>` 容器、脚本 `defer`、语义属性）、`style.css`（`::backdrop`、`details/summary` 外观对齐、`prefers-reduced-motion`、`clip-path`）。
- 交互层：`js/ui-modal.js`（改为 `<dialog>` 封装，接口 `ui.modal.open/alert/confirm` 保持签名）、`js/ui.js`（提示描述关联、视图切换语义、toast live region、resize 合帧）、`js/app-interactions.js`（行内编辑 Enter）、`js/ui-playlist-editor.js` / `js/fontpicker.js`（移除自带 Escape 拦截、改用新模态）、`js/ui-pickers.js`（预取时机）。
- 渲染与视图：`js/app-viewport.js`（resize 合帧）、`js/app-chrome.js`（光标更新合帧与矩形缓存）、`js/ui-property-panel.js`（就地更新）。
- 持久化：`js/draft-store.js`、`js/app-draft.js`（Blob 资产、异步写入）。
- 构建：`index.html` 脚本标记由 `build.sh` 原样拷贝，无需改构建脚本；`scripts/build-presets.sh` 若调整分类块切分需同步重生成 `js/presets-data/`。
- 验证：`node --test scripts/checks/*.test.js`（纯逻辑不回归）、`./build.sh`（产物仍无开发期文件、`?v=` 注入一致）、`file://` 手动清单（模态、IME、提示、视图切换、导出）与 `agent-browser` 自动化回归，外加改动前后截图对比确认无视觉漂移。
