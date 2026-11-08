# Design

## Context

- 当前模型：`page.background` 是单图对象 `{assetId, fit, opacity, blur, color}`；`page.backgroundRef` 指向所有者页；引用页在运行时共享同一个背景对象（`js/model.js` 的 `resolveBackgroundOwner` / `referencingPages`）。
- 当前渲染：`drawBackground` 先填充色，再画一张图；`backgroundGeometry` 支持 `original/fill-width/fill-height/cover`，居中裁剪。背景层独立于 `page.elements`，`hitTest` 只命中内容，`pageOverflow` 只统计内容，`pageAssets` 只取 `page.background.assetId` + 内容图片。
- 当前持久化：版本 2；所有者页写 `background`，引用页写 `background:null, backgroundRef`；`js/io.js` 负责 v1 迁移和引用链/环检测。
- 当前 UI：图层面板一条背景行；背景属性面板单图；新增页弹窗二选一“空白/引用上页”。
- 约束：零构建、`file://`、Chrome、唯一运行时依赖 Leafer UMD、无测试套件；用 `agent-browser` 手测。
- 行为契约：`background-layer`、`project-persistence`、`page-editor`、`canvas-view`、`editor-shell` 的本次 delta。

## Goals / Non-Goals

**Goals:**

- 背景库项目级；每个背景多张有序图片；每页通过 `backgroundId` 引用任意背景。
- 每张图保留四种页面相对 fit + 自定义 `none`（固定矩形/旋转/等比）。
- 全局背景开关非破坏性；提供固化/独立副本。
- 背景图可在图层选中后于画布编辑；正常内容编辑不受影响。
- v3 持久化与 v1/v2 迁移；资产范围覆盖未使用背景。
- 背景库管理闭环：新建/复制/重命名/删除/引用页数。

**Non-Goals:**

- 不实现需求文档里的“主标题”文字项；本版背景项只支持图片。
- 不让背景图片进入 `page.elements` 或与内容交叉层级。
- 不做每页不同页面尺寸、PDF、长图拼接、撤销/重做。
- 不做背景库缩略图预览、拖拽排序（用上移/下移按钮）。
- 不改变播放列表导入、分类排版、字体选择、表格边距。
- 不新增 `png-export` delta；导出模式由 `add-export-options` 负责。

## Decisions

### 1. 项目级背景库，而不是每页组合 + 引用组

数据模型：

```js
project = {
  version: 3,
  backgrounds: [{
    id, name, color,
    images: [{
      id, assetId, fit, // original | fill-width | fill-height | cover | none
      x, y, width, height, rotation, keepRatio, // 仅 none 有意义
      opacity, blur
    }]
  }],
  unifiedBackground: false,
  unifiedBackgroundId: null,
  pages: [{ id, backgroundId, elements: [] }]
}
```

理由：

- 背景库不属于任何页，删除页不会解散共享；任意页可直接引用任意背景，不要求相邻或所有者。
- 复制/重命名/引用页数/全局模式都落在项目级，语义清晰。
- `backgroundId` 是普通字符串引用，加载时一次解析，不需要引用链/环检测。

备选：

- A：`page.background.images[] + backgroundRef`。改动小，但保留所有者页、删除页物化、非相邻页不能直接复用；多图共享是按整组还是按单图也会含糊。
- 把背景图打上 `isBackground` 放进 `page.elements`。否决：会破坏“背景永远在内容下、不参与内容 z-order、不参与内容命中和溢出、仅歌单层整层跳过”等不变量。

### 2. 背景层继续独立于 `page.elements`

背景仍由 `drawBackground` 单独绘制，不进入内容数组。直接规则：

- 背景永远在内容下方，不能与内容交叉层级。
- 正常内容编辑时 `hitTest` 不命中背景；只有背景编辑状态才走 `hitTestBackground`。
- `pageOverflow` 不统计背景；背景超出页面按设计裁剪。
- 仅歌单层导出直接 `includeBackground:false`，不需要按元素类型过滤。
- “设为背景/移出背景”是层间移动，不是给元素加 flag。

### 3. 每图 fit + 自定义 `none`

- `original/fill-width/fill-height/cover`：以页面中心为基准，按当前页面尺寸实时计算；页面尺寸/方向变化时重排。
- `none`：使用图片自身 `x/y/width/height`（页面坐标）与 `rotation`；支持 `keepRatio`；页面尺寸变化不重排。
- 从 fit 切到 `none`：把当前 `backgroundGeometry` 的矩形写入 x/y/宽高，旋转为 0。
- 从 `none` 切回 fit：保留字段但渲染忽略；属性面板隐藏自定义字段。
- 画布直接拖拽/缩放/旋转 fit 图：自动执行“切到 none 并烘焙”，再应用操作；属性面板出现“恢复为最适合”（设回 `cover` 并清空自定义）。
- 旋转只对 `none` 有意义；fit 模式旋转值写 0，避免 cover 旋转后露角。

理由：保留现有“换页面尺寸仍铺满”的价值，同时允许叠加定位图。全固定像素会让 cover 在横竖切换时露边；全 fit 又无法做叠加构图。

### 4. 全局模式是渲染覆盖，不是批量赋值

- `unifiedBackground` 是项目级布尔；`unifiedBackgroundId` 记住全局背景。
- 开启：所有页渲染 `unifiedBackgroundId`，忽略 `page.backgroundId`；不修改页面字段。
- 关闭：恢复各页 `backgroundId`；`unifiedBackgroundId` 保留，下次开启优先使用。
- 首次开启：若记住的 ID 有效则用它；否则用当前页有效背景；再否则用背景库第一项。
- 全局下拉只在开启时可用；页面背景下拉在开启时禁用并提示“全局背景生效中”。
- 为避免“取消后其它页突然变回旧背景”：
  - “固化到所有页”：所有页 `backgroundId = unifiedBackgroundId`，然后关闭全局。外观不变，之后各页可独立改。
  - “本页独立副本”：复制全局背景为 A'，当前页用 A'，其它页写全局 ID A，然后关闭全局。之后编辑 A' 只影响当前页。
- 全局模式下新增页：`backgroundId = unifiedBackgroundId`；非全局：继承当前页有效背景 ID。

备选：开启时直接把所有页 `backgroundId` 改成全局背景（一次性批量赋值）。否决：破坏各页原设置，取消时无法恢复；用户想试一下全局效果时代价太大。

### 5. 画布编辑用“选中背景项后激活”，不做常驻命中

- 正常状态：`onPointerDown` 顺序保持内容优先；背景不参与命中，空白处仍选页面/拖边距。
- 背景编辑状态：图层面板选中背景组或某张图后，选择状态为 `backgroundSet` / `backgroundImage`；画布命中顺序为“背景手柄 → 内容 → 背景图 → 页面/边距”。内容点击仍优先，点击内容会退出背景编辑。
- Escape 或点击页面标签清空选择，回到页面属性。
- 背景图复用内容图片的几何/手柄逻辑：拖拽、八向缩放、旋转、等比锁定、旋转后命中；只在绘制层用“背景不按单图矩形裁剪”的差异。
- 页面尺寸手柄、分类分隔线等内容专属手柄在背景选择时禁用，避免误操作。

理由：如果背景图常驻命中，铺满页面的背景会让“点空白选页面”失效；如果只做数值输入，多图构图不可用。选中后激活是两者折中。

### 6. 图层树与属性面板

- 图层视图：内容行在上；下方是当前页有效背景的组行，组行显示名称、`全局` 徽标、引用页数；组行展开为图片子行，显示缩略图、fit/自定义标记。组行选中背景集；子行选中背景图。
- 背景集属性：名称、填充色、引用/全局状态、添加图片、复制、重命名、删除、管理背景库；全局时显示“固化到所有页”“本页独立副本”和“修改影响所有页面”提示。
- 背景图属性：fit 五选一、透明度、模糊；`none` 时显示 x/y/宽高/旋转/等比；上移/下移、替换、删除、恢复为最适合。
- 页面属性：页面尺寸/方向/边距之外，增加“当前页背景”下拉（全局时禁用+提示）、全局开关、全局背景下拉、管理背景库按钮。
- 背景库弹窗：管理用途，列出名称/引用页数/全局标记；新建空白、复制、重命名、删除；不在弹窗里直接改页面引用（页面下拉负责）。删除被引用/全局/最后一个时提示原因。
- 新图默认：空背景第一张 `cover`，非空追加 `original` 居中；都可改。这样单图仍是旧版“铺满”，多图叠加不会一上来就互相盖住。

### 7. 渲染与资产

- `drawBackground(project, page, pageSize)`：解析有效背景 → 填充色 → 按 `images` 顺序逐张画。每张：`save` → 平移到中心 → 旋转 → `globalAlpha` → `filter: blur()` → `drawImage` → `restore`。外层只裁剪到页面，不裁剪单图矩形，让模糊/叠加自然。
- `backgroundImageRect`：fit 模式用 `backgroundGeometry`；`none` 用自身矩形；命中用逆旋转后的局部坐标。
- `pageAssets(project, page)`：有效背景全部图片资产 + 内容图片资产。`allBackgroundAssets(project)` 供背景库/保存/资产引用扫描。
- `assetIsReferenced`：内容图片 + 所有背景集；删除/替换图片或背景后调用 `releaseUnusedAsset`。保存必须包含未使用背景的资产。
- 导出：完整模式按有效背景绘制；仅歌单层 `includeBackground:false` 跳过整层；预加载用 `pageAssets`。任一背景图加载失败按现有导出失败处理。
- 解码失败：添加/替换时原子失败，背景集不变；加载时缺资产按项目损坏处理；导出时缺图按导出失败处理。

### 8. 持久化 v3 与迁移

- 保存：`version:3`；`backgrounds` 全量；页面只写 `backgroundId`；写 `unifiedBackground` / `unifiedBackgroundId`；资产按内容去重，包含未使用背景的资产。
- 加载：接受 1/2/3；v1 先走现有 v1→v2，再 v2→v3；v3 直接校验。
- v2→v3：用 `resolveBackgroundOwner` 把页面按所有者分组；每组生成一个背景，组内页面写同一 `backgroundId`；旧 `background` 的 `color` 写背景，`assetId/fit/opacity/blur` 写唯一图片，`rotation:0`、`keepRatio:true`；全部页面同组时 `unifiedBackground=true` 并写 `unifiedBackgroundId`，否则 false/null。独立但外观相同的页不合并，避免改变未来编辑的耦合关系。
- v1→v3：每页生成独立背景，`unifiedBackground=false`；外观不变，编辑互不影响。
- 校验：背景至少 1 个、ID 唯一、名称/颜色/图片字段、fit 五值、`none` 的 x/y/w/h/rotation、opacity 0..1、blur≥0、`page.backgroundId` 存在、全局 ID 存在（开启时）、资产存在；失败保留当前项目。
- 运行时不再有 `backgroundRef` / 引用链；`resolveBackgroundOwner` 仅保留给迁移。
- 默认项目：一个空白背景 + 一页；版本 3。
- 新增页：继承有效背景 ID；删除页只删页，背景留在库中；切换页清空选择。

### 9. 文档与规范

- `PRODUCT.md`：能力/工作流改为背景库、多图、全局模式。
- `docs/歌单生成器需求.md`：重写背景章节；把“主标题”标为后续未实现。
- `AGENTS.md`：更新背景领域规则；强调背景不在 `page.elements`、每图 fit/自定义、全局模式。
- 不新增 `png-export` delta；导出模式由 `add-export-options` 覆盖，背景组成由 `background-layer` 约束。`add-table-margins` 只改 `category-layout`，与本变更无 spec 冲突。

## Risks / Trade-offs

- **大范围重构，无自动测试** → 按数据/渲染/持久化/交互/UI/导出分阶段，每阶段用 `agent-browser` 手测；先保 v1/v2 加载，再改编辑。
- **迁移错误** → 用 v1/v2 样例和往返检查；覆盖 v2 引用组、独立同图、空背景、缺资产。
- **选择/命中回归** → 背景编辑只在选中后激活；内容优先；回归空白选页、边距、分隔线、文字双击、内容图片旋转命中。
- **全局模式误解** → 面板提示“全局背景生效中，取消后恢复本页设置”；固化/副本两个明确动作；开关不覆写页面字段。
- **资产泄漏/丢失** → `assetIsReferenced` 覆盖所有背景；保存包含未使用背景；删除/替换后释放；用“未分配背景 + 两页共用图”验证。
- **fit 自动转自定义的意外** → “恢复为最适合”一键回退；属性面板明确显示“自定义”；无撤销，操作可逆。
- **模糊性能/裁剪** → 背景整体裁剪到页面，单图不裁剪；图片数量通常很少，Chrome Canvas2D 可接受。
- **范围蔓延** → “主标题”、背景库预览、拖拽排序、撤销/重做都列为非目标。

## Migration Plan

- 代码替换为 v3；加载 v1/v2 时在内存迁移，保存时写 v3。
- 不做自动保存迁移；用户打开旧项目后需手动保存才升级文件。
- 回滚：还原相关 JS/CSS；旧应用会拒绝 v3（版本>2）并提示，用户可保留旧 v2 备份。
- 规范：`openspec validate rework-background-layer --strict`；实现完成后归档。`add-export-options` / `add-table-margins` 与本变更修改的 spec 不重叠，可独立归档。

## Open Questions

无阻塞问题。已选默认：新图空背景 `cover`、非空 `original`；删除被引用背景拦截；背景库弹窗只管理不赋值；fit 图直接操作自动转 `none`。这些可在实现前调整。
