# Design

## Context

当前外壳是 `#app` 纵向 flex：56px 顶栏、42px 页签条、`main` 三件套（左侧栏 + 画布）。左侧栏内部再分上下：分类/图层视图占 `flex: 1 1 45%`，属性区占 `flex: 0 0 44%`（最小 190px）。画布是唯一伸缩区域，但页签条和顶栏各占一整行，顶栏同时放着导入、添加文字、添加图片、保存、加载、导出七个动作。

`js/ui.js` 通过固定 id 绑定这些入口：`#btn-import`、`#btn-add-text`、`#btn-add-image`、`#btn-save`、`#btn-load`、`#btn-export`、`#btn-add-page`、`#btn-delete-page`，页签渲染进 `#page-tabs`，分类列表渲染进 `#category-panel`，属性渲染进 `#property-panel`。`js/app.js` 的 `computeViewport()` 用 `#canvas-pane` 的完整矩形计算缩放和居中；页签条一旦移除，画布会多出 42px 高度。

约束不变：零构建、经典 `<script>`、`file://` 可运行、只依赖 vendored LeaferJS、无网络。见 `proposal.md - Why` 了解动机，`specs/editor-shell/spec.md` 是行为契约。

## Goals / Non-Goals

**Goals:**

- 建立稳定的三区工作台：左素材、中画布、右检查；顶栏只做项目生命周期。
- 让导入、分页、插入、调参入口靠近它们作用的对象，减少跨屏视线移动。
- 在不改数据模型、不改导入/排版/导出行为的前提下重排 DOM 与 CSS。
- 在 900px 最小宽度下仍保持固定框架，不出现上下重排。

**Non-Goals:**

- 不新增折叠面板、可拖拽分隔条、主题切换或移动端布局。
- 不改变属性面板内部的分组、字段或控件顺序。
- 不改变页签的语义（页面仍是对象级标签），也不改变分类/图层视图的语义。
- 不调整导出图片内容或 PNG 导出流程。

## Layout assessment（impeccable / Operate）

在 1440×900 下检查当前实现，结构问题不是“间距不够”，而是**职责没有分区**：

- **阅读顺序**：模糊细节后，最先看到的是顶栏七个等权动作，其次是左侧窄栏里的属性表，最后才是画布上的白纸。画布没有成为第一视觉主体。
- **分组**：导入属于歌单素材，却和导出、保存放在一起；添加文字/图片属于当前页，却和项目级动作放在一起；分页属于页面对象，却独占一条横贯全屏的条带。
- **节奏**：顶栏、页签条、左栏、画布四层都是满宽或满高容器，层与层之间只有 1px 线，缺少“主工作区 vs 辅助栏”的宽度对比。
- **密度**：左栏同时承担列表和检查表，属性区最小 190px，表格卡片和长属性很快触发滚动；右侧整块屏幕留白却未被使用。
- **极端状态**：页签增多时整条页签条横向滚动，和顶栏动作互不相干；属性字段多时左栏下半区独立滚动，分类列表被压到很矮。

### Spatial thesis

- **主任务路径**：左侧导入/选分类 → 中部切页、插入、在画布上放置 → 右侧调参 → 顶栏导出。
- **归属**：左侧 = 歌单素材清单；中部 = 当前页工作表面；右侧 = 当前选择的检查表；顶栏 = 项目级动作。
- **层级**：画布上的白纸是第一主体，左右栏是固定宽度的辅助轨道，顶栏退为一条低矮的命令带。
- **密度与节奏**：左右栏固定宽度、画布弹性；三区之间只用 1px 结构线，不新增阴影；画布工具条是“画布 chrome”，不是新的全局命令条。
- **适配**：桌面固定框架；窄宽度只压缩画布，工具条通过换行/滚动保持全部动作可达。

## Decisions

### 1. `main` 改成三列 flex，右侧检查栏是画布的兄弟节点

结构：

```html
<div class="main">
  <aside class="sidebar">...</aside>
  <main id="canvas-pane" class="canvas-pane">
    <div id="canvas-toolbar" class="canvas-toolbar">...</div>
    <div id="leafer-view" class="leafer-view"></div>
    <canvas id="overlay" class="overlay"></canvas>
    <div id="empty-hint" class="empty-hint">...</div>
  </main>
  <aside class="inspector" aria-label="属性检查栏">
    <div class="property-heading">...</div>
    <div id="property-panel" class="property-panel"></div>
  </aside>
</div>
```

- `.main` 继续用 `display: flex`；`.sidebar` 和 `.inspector` 用 `flex: 0 0 var(--sidebar-w)` / `flex: 0 0 var(--inspector-w)`，`#canvas-pane` 用 `flex: 1 1 auto; min-width: 0`。
- 选择 flex 而不是 CSS Grid：现有 `#app` 和 `main` 都是 flex，画布已经依赖“唯一伸缩子项”的行为；改成 grid 会同时影响 `#app` 的纵向布局和 `app.js` 对 `canvas-pane` 矩形的读取，收益不足。
- 右栏不采用抽屉/浮层：用户明确要求“移动到界面右边”，常驻轨道能让属性与画布同时可见，也避免新增开关状态。
- 宽度：`--sidebar-w: 300px`，`--inspector-w: 320px`。属性网格是 72px 标签列 + 1fr，320px 下控件列约 217px，足以容纳数字输入、颜色块和分段控件；表格卡片内 58px 标签列也不会挤破。窗口 ≤1180px 时收窄为 280px / 300px，保证 900px 最小宽度下画布仍有约 320px。

### 2. 左栏去掉属性区，导入入口放进分类视图的静态工具条

- 删除 `.property-section` 从 `.sidebar` 内部，左栏只剩“视图标签 + 面板”，分类/图层面板获得全部剩余高度。
- 在 `.sidebar-tabs` 与 `#category-panel` 之间加静态 `.panel-toolbar`，只在分类视图显示：

```html
<div class="panel-toolbar" id="category-toolbar">
  <button id="btn-import" class="btn btn-primary btn-sm">导入歌单</button>
  <span class="hint">或拖入 .txt</span>
</div>
```

- 不把按钮放进 `renderCategoryPanel()` 的 `innerHTML`：该函数每次渲染都会重写面板内容，静态工具条放在它外面可以避免按钮被销毁、事件重复绑定。
- 切到图层视图时 `ui.setPanel('layers')` 同时隐藏 `#category-toolbar`；拖放监听仍挂在 `#category-panel` 上，行为不变。
- 不采用“侧栏头部常驻导入按钮”：用户把导入归入分类面板，放在分类视图内可以让“导入 = 歌单素材操作”的归属更明确；图层视图不需要导入入口。

### 3. 页签条改成画布内的浮动工具条

- 删除 `.page-strip` 整行；把页签、增删页、添加文字、添加图片合并到 `#canvas-pane` 内的 `#canvas-toolbar`：

```html
<div id="canvas-toolbar" class="canvas-toolbar">
  <div class="canvas-toolbar-group canvas-toolbar-pages">
    <div id="page-tabs" class="page-tabs" role="tablist" aria-label="页面"></div>
    <button id="btn-add-page" class="icon-btn" title="新增页面" aria-label="新增页面">＋</button>
    <button id="btn-delete-page" class="icon-btn" title="删除当前页" aria-label="删除当前页">🗑</button>
  </div>
  <span class="toolbar-divider" aria-hidden="true"></span>
  <div class="canvas-toolbar-group">
    <button id="btn-add-text" class="btn btn-sm">添加文字</button>
    <button id="btn-add-image" class="btn btn-sm">添加图片</button>
  </div>
</div>
```

- 定位：`position: absolute; top: 12px; left: 12px; z-index: 6; max-width: calc(100% - 24px);`，纸白底、1px 结构线、8px 圆角、5×7 内边距、6px 间距。**不加阴影**：它是画布上的常驻 chrome，不是临时浮层；纸白 + 边框已经能从工作台灰里分离出来，避免引入新的阴影档位。
- 层级：`.leafer-view` z-index 1，`.overlay` 3，`.canvas-toolbar` 6，行内文字编辑器 8。工具条在 overlay 之上，点击不会被选择层吞掉。
- 页签区 `flex: 0 1 auto; min-width: 0; max-width: 420px; overflow-x: auto;`；动作组 `flex: 0 0 auto`。页签很多时只滚动页签，不把增删页和插入动作挤出屏幕。
- 工具条整体 `flex-wrap: wrap`。窄画布（约 320px）下页签组和插入组换行，仍然是画布内的一块 chrome，不会变成整行页签条。
- 不把工具条放到画布顶部居中：居中会压住页面顶部内容，且页签数量变化时位置漂移；左上角是画布 chrome 的稳定锚点。
- 不把添加文字/图片留在顶栏：它们作用于当前页，放进画布工具条后与页签、增删页形成“当前页操作”组。

### 4. 画布适配为工具条预留顶部内边距

`app.js` 的 `computeViewport()` 当前用 `pane.getBoundingClientRect()` 的完整宽高计算缩放和居中。工具条是绝对定位覆盖层，不会改变 `pane` 的矩形，因此页面可能被工具条压住。

- 在 `computeViewport()` 中读取 `#canvas-toolbar` 的 `getBoundingClientRect().height`（或 `offsetHeight`），得到 `chromeTop = toolbarHeight + 24`（12px 上边距 + 12px 间隔）。
- 缩放计算使用 `availableHeight = height - chromeTop`；垂直居中改为 `offsetY = chromeTop + (availableHeight - pageH * scale) / 2`。
- 工具条不存在或隐藏时 `chromeTop = 0`，保持旧行为。
- 不通过 CSS `padding-top` 实现：`overlay` 和 `leafer-view` 是 `inset: 0` 的绝对定位层，给 pane 加 padding 不会自动改变它们，反而会让 overlay 坐标系和 `getBoundingClientRect()` 不一致。

### 5. 顶栏收敛为项目级动作

- 保留品牌；右侧只留“保存项目 / 加载项目 / 导出 PNG”，中间用现有 `.divider` 分组。
- 导出按钮从 `.btn-accent` 改为 `.btn-primary`（两者当前视觉相同，统一成语义主按钮）；保存/加载保持默认按钮。
- 删除顶栏的导入、添加文字、添加图片。导入的蓝色主按钮身份转移到左栏分类工具条，导出成为顶栏唯一的主操作。

### 6. 文案与可访问性跟随新位置

- 分类空态：`还没有歌单。点击上方“导入歌单”，或把 .txt 文件拖到这里。`
- 画布空态：`从左侧导入歌单，再把分类拖到页面上`。
- 页签按钮加 `aria-current="page"`（当前页）或 `aria-selected`（配合 `role="tab"`）；仅图标按钮保留 `title` 并补 `aria-label`；工具条分组用 `role="group"` + `aria-label`。
- 不改键盘删除/Escape 行为。

### 7. `DESIGN.md` 同步为三区工作台

实现时更新 `DESIGN.md` 的 Layout / Components / Do's and Don'ts：

- Layout：顶栏 56px，删除页签条 42px；`main` 三列（左 300 / 中弹性 / 右 320），≤1180 时 280 / 300；属性区改为右侧全高。
- Components：新增“Canvas Toolbar”小节（纸白、1px 线、8px 圆角、无阴影、页签横向滚动、动作组固定）；Property Inspector 从“侧栏下方”改为“右侧检查栏”；Page tab 的说明改为“在画布工具条内”。
- Named Rules：`Fixed Frame Rule` 改为“新增工具进入现有命令条、侧栏或画布工具条，不新增整行工具栏”；保留 `Inspector Grid Rule`。

## Risks / Trade-offs

- **[900px 下画布只剩约 320px]** → 左右栏在 ≤1180px 收窄到 280/300；画布仍是唯一伸缩区，页面按比例缩放；不引入折叠/抽屉，避免增加状态和实现量。若后续实测仍不可用，再单独评估提高 `min-width` 或可折叠检查栏。
- **[工具条遮挡页面顶部]** → `computeViewport()` 预留 `toolbarHeight + 24` 的顶部内边距；工具条换行时高度变化会在下一次 `fit()` 被重新读取。窗口 resize 已调用 `fit()`，页签增减后也会重绘。
- **[移动 DOM id 导致事件丢失]** → `ui.init()` 的绑定集中在 `js/ui.js` 开头，按 id 逐个迁移；保留所有现有 id，不重命名，减少 `app.js`/`export.js` 的连锁改动。
- **[属性面板变窄后表格卡片拥挤]** → 右栏 320px，属性网格 72px + 1fr，表格卡片 58px + 1fr；实测如果数字输入被压缩，优先减小组内标签列而不是加宽右栏，保持画布空间。
- **[页签很多时工具条过高]** → 页签区限高单行并横向滚动，工具条整体只在窄画布换行；页签数量不影响顶栏或画布布局。
- **[导出误带工具条]** → 工具条在 `#canvas-pane` 内但不在 Leafer 的 `surface` 里，导出走 `exporter` 的页面渲染；实现后仍需按任务清单手动导出一次确认。
- **[空态文案指向“上方”但按钮在分类视图内]** → 分类空态本身就在分类面板内，按钮就在其上方；图层视图不显示该空态，不会出现指向错误。

## Migration Plan

1. 先改 `index.html` 结构，保留所有 id。
2. 再改 `style.css`：三列、右栏、左栏工具条、画布工具条、断点；删除 `.page-strip` 与旧 `.property-section` 规则。
3. 改 `js/ui.js` 的绑定、分类空态、`setPanel` 显隐、页签 `aria-current`。
4. 改 `js/app.js` 的 `computeViewport()` 顶部内边距。
5. 更新 `DESIGN.md`。
6. 用 `agent-browser` 在 1440×900、1180×800、900×700 三个尺寸检查：导入、切页、增删页、添加文字/图片、选页面/分类块/图层、属性滚动、导出 PNG。
7. 回滚策略：本次只改 DOM/CSS/少量 viewport 计算，回滚即还原上述文件；无数据迁移、无持久化格式变化。

## Open Questions

无。布局归属和宽度在本次确定；折叠检查栏、移动端布局、可拖拽分隔条均留待后续独立变更。
