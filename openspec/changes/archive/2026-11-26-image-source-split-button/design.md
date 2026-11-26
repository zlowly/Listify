# Design

## Context

见 proposal.md 的 Why。现状关键点：

- 工具条按钮 `#btn-add-image` 的点击在 `js/ui.js` 绑定到 `L.app.insertImage()`；`insertImage`（`js/app.js`）按 `insertTarget` 的落点分流：背景层走 `ctx.backgrounds.pickBackgroundImage(null)`，内容层走 `pickFreeImage()`（`#free-image-file` 用户手势文件选择）。
- 粘贴已有成熟链路：`handlePastedImages`（Ctrl+V 粘贴事件驱动），菜单项需程序式触发同一管线。
- 预设图库弹窗是 `js/ui-pickers.js` 的 `openPresetPicker(mode, context)`（mode: whole/add/replace）；弹窗内的本地入口是 `createLocalRow`（网格末整行虚线按钮），索引加载失败的回退分支 `renderPresetIndexError` 也引用了它。
- 交互样板已经过用户审核：`/tmp/listify-splitbtn-demo.html`（DOM 结构、样式、键鼠行为以它为基准）。
- 项目约束：零构建、经典 `<script defer>`、UI 不得直接改模型、平台语义优先（原生 `<dialog>`、ARIA 模式）、刻意避开非 Baseline API（不用 `popover` 属性）。

## Goals / Non-Goals

**Goals**

- 添加图片变成「主按钮执行上次来源 + 箭头弹出来源菜单」的分裂按钮，三个来源：本地文件 / 粘贴剪贴板 / 预设图库。
- 预设图库复用 `openPresetPicker`，弹窗内移除「本地图片」入口。
- 菜单可完整键盘操作，符合 ARIA menu 模式。

**Non-Goals**

- 「添加图形」分裂按钮（后续迭代）。
- 来源记忆不持久化（不写入项目文件、localStorage 或 IndexedDB；会话内存即可）。
- 不改动粘贴/文件读取/预置物化的底层管线。

## Decisions

### 1. 菜单容器用绝对定位的 `role="menu"`，不用 `<dialog>`

`<dialog>` 的模态语义（遮罩、焦点圈禁、Esc 整体关闭）对几像素宽的箭头菜单过重；web 惯例是 `role="menu"` + `menuitemradio` 的轻量弹层。与项目「平台语义」原则不冲突——这里的地道语义就是 ARIA menu 模式。备选的 `<dialog show>`（非模态）被否，因为其定位/层叠与工具条耦合更差且无额外收益。

### 2. 分裂按钮 DOM 结构

```html
<div class="tool-split">
  <button id="btn-add-image" class="icon-btn" aria-label="…当前来源…">…</button>
  <button id="btn-add-image-more" class="icon-btn caret-btn"
          aria-label="更多图片来源" aria-haspopup="menu" aria-expanded="false">‹</button>
  <div class="tool-flyout" role="menu" hidden>…</div>
</div>
```

- 主按钮 id 保持 `btn-add-image` 不变，`js/ui.js` 现有绑定与 `app.js` 的 `updateInsertButtons` 改动最小。
- 箭头用左向 chevron（工具条在左缘，菜单向右弹出；与示范一致）。
- 命中区约 12px，与主按钮贴合共享 hover 边框（示范已审核）。

### 3. 三个来源的执行入口收敛到 `insertImage`

`insertImage(source)` 增加来源参数，内部分流：

- `local`（默认）：现行为不变——`pickFreeImage()` / `pickBackgroundImage(null)` 按落点；
- `paste`：调用 `navigator.clipboard.read()` 提取 `image/*` blob 后走 `handlePastedImages` 同一管线；`file://` 或权限拒绝时 `ui.toast('当前环境不支持读取剪贴板，请直接按 Ctrl+V 粘贴')`，不抛未处理异常。备选方案「菜单项只聚焦画布模拟按键」被否：合成键盘事件不可靠且语义差。
- `preset`：内容层落点调用新的 `openPresetPicker('free')` 模式（图层面板加图 `add` 模式走背景链路，内容层需要一条新分支把所选预置物化为自由图片；复用 `pickFreeImage` 的资产读取与插入代码），背景层落点复用 `add` 模式。

### 4. 来源记忆与菜单状态

- 来源记忆存内存（`ui.js` 模块局部变量，每个落点维度各一份：内容层/背景层）。默认 `local`。切换落点不重置记忆。
- 主按钮图标不随来源切换（三个来源共用图片图标，避免图标歧义），只更新 `aria-label` 与浮动提示文案——与示范的差异点：示范中图形按钮图标随来源变化，对图片来源无此必要。
- 菜单开合由 `hidden` + `aria-expanded` 驱动；外部关闭用 `pointerdown` 委托（`setTimeout(0)` 注册避免立即自关，示范同款做法）；菜单内焦点循环 + Escape 归还焦点到箭头，按示范实现。

### 5. 画廊移除本地入口的范围

- 删除 `createLocalRow` 及三处调用（正常渲染、`renderPresetIndexError` 回退）。
- 索引失败回退文案改为只提示重试（「预置素材索引加载失败，请重试。」），拖入图片仍可用，保留拖拽监听。
- 「本地图片」瓦片相关 spec（`background-layer`）按 delta 修改；`spec.md` 中「清单加载失败不影响本地图片」场景在 `background-layer` 预置素材清单需求里，仅指拖入链路继续可用，实现上无需改动拖拽逻辑。

## Risks / Trade-offs

- [程序读取剪贴板在 `file://` 不可用] → 菜单项保留并降级提示 Ctrl+V；toast 说明不影响数据。
- [`navigator.clipboard.read()` 需要用户手势] → 菜单项点击本身是手势，调用处于同一任务内，满足要求。
- [`openPresetPicker` 新增 `free` 模式与既有 whole/add/replace 并存] → mode 分支集中在 `ui-pickers.js` 应用链路处，只加一个分支；不动既有三模式行为。
- [箭头命中区窄（12px）可能难点] → 与主按钮共享 hover 边框并提供键盘入口（主按钮聚焦后 ArrowDown 可开菜单），失误率可控。
- [菜单与画布 `z-index` 冲突] → 工具条已 `z-index: 6`，弹层在其内 `z-index: 20`，高于画布与页签。

## Migration Plan

纯前端、无持久化变更：单次部署即生效，无数据迁移。回滚 = 还原四个文件的改动。

## Open Questions

无。
