# Tasks

## 1. 图形几何模块

- [x] 1.1 新建 `js/shape.js`，加入 `SHAPE_KINDS` / `SHAPE_MODES` / `DEFAULT_SHAPE` 和最小模块骨架；在 `index.html` 中把 `js/shape.js` 放到 `js/model.js` 之后、其它运行时脚本之前，并在 `scripts/README.md` 补充脚本角色；验证：新增 `scripts/checks/shape.test.js` 的加载冒烟用例通过，`node --test scripts/checks/shape.test.js` 能访问 `L.shape`
- [x] 1.2 实现 `createShapeElement` / `createBackgroundShape` 与默认字段；验证：`shape.test.js` 覆盖默认颜色、实心、圆角 0、边框厚度 8、效果默认值、`type: 'shape'` / `kind: 'shape'`、id 前缀，且断言没有 `assetId`
- [x] 1.3 实现 `diamondAngle(width, height)` 与 `diamondSizeFromAngle(width, height, angle)`；验证：`shape.test.js` 覆盖 240×240 → 90°、240×120 → 约 53.13°、240×240 设 45° → 高约 99.4、90° → 正方形、0° → 短边 1、宽小于高时保留高并改宽
- [x] 1.4 实现 `shapeInradius(shape)`、`shapeConcaveLimit(shape)` 与 `clampShape(shape)`；验证：`shape.test.js` 覆盖正圆角上限（矩形 `min(w,h)/2`、菱形 `w*h/(4*sqrt((w/2)^2+(h/2)^2))`）、负圆角上限（矩形 `min(w,h)/2`、菱形 `sqrt((w/2)^2+(h/2)^2)/2`）、尺寸/角度变化后带符号圆角与边框厚度被夹取、宽高最小 1px
- [x] 1.5 实现基础多边形、内偏移多边形、负圆角内凹轮廓与 `shapeOutline(shape)` 路径命令；验证：`shape.test.js` 断言矩形/菱形在 `r=0` 时得到四个直线段，`r>0` 时每个角产生内偏移圆弧且切点位于相邻原边上，`r<0` 时每个角产生以原角点为圆心的内凹圆弧并在边中点可相接，路径闭合且不超出外接框
- [x] 1.6 实现 `shapeContains(shape, localX, localY)`；验证：`shape.test.js` 覆盖矩形/菱形中心命中、菱形外接框空白角不命中、正圆角外侧不命中、负圆角内凹缺口不命中、`r=0` 时退化为凸多边形判断
- [x] 1.7 运行 `node --test scripts/checks/shape.test.js`，确认几何模块全部用例通过

## 2. 模型与 v5 数据层

- [x] 2.1 在 `js/model.js` 增加 `PROJECT_VERSION = 5`，`createDefaultProject` 改用该常量；验证：`node --test scripts/checks/model.test.js` 断言默认项目版本为 5，且 `PROJECT_VERSION` 已导出
- [x] 2.2 把 `createPageBackground` 改为返回 `{ color, items: [] }`，给 `createBackgroundImage` / `DEFAULT_BACKGROUND_IMAGE` 增加 `kind: 'image'`；验证：`model.test.js` 断言新建背景没有 `images`、图片条目带 `kind`
- [x] 2.3 重写 `clonePageBackground` / 背景条目克隆：按 `kind` 克隆，图片共享 `assetId`、生成新 id，图形深拷贝并生成新 id，items 顺序不变；验证：`model.test.js` 覆盖图片 + 图形交错顺序、id 全部变化、图形字段独立
- [x] 2.4 更新 `docs/歌单生成器需求.md` 的背景数据模型章节，写明每页背景为填充色 + 有序 items、图片/图形 kind、项目版本 5，并加入图形字段、带符号圆角与默认值说明；验证：文档中不再把背景描述为纯图片列表，且搜索 `background.images` 只出现在迁移说明中

## 3. 校验、序列化与草稿迁移

- [x] 3.1 更新 `js/project-schema.js` 的版本校验到 1–5，v5 要求 `background.items`，拒绝未知 item kind；增加 shape 元素/条目的几何、枚举、颜色、带符号圆角、边框厚度与效果校验；验证：新增/扩展 schema 测试覆盖 v6、未知 kind、非法 shape/mode、圆角超出正/负上限、边框厚度超出内切圆上限、仅 images 的 v5 背景
- [x] 3.2 实现 `buildBackgroundItem` / 新版 `buildPageBackground` / `resolvePageBackgrounds`，把 v1–v4 的 `images` 按顺序映射为 `kind: 'image'` 的 items；验证：schema 测试覆盖 v4 → v5、v3/v1/v2 原有迁移路径仍通过
- [x] 3.3 更新 `js/project-io.js`：`serializeBackgroundItem`、`serializePageBackground` 写 items、`serializeElement` 增加 shape 分支、`serializeProjectStructure` 写版本 5、`collectReferencedAssetIds` 只收集 image 条目与 image 元素；验证：`io.test.js` 断言 v5 JSON 没有 `images`、shape 字段完整、图形不产生资产引用
- [x] 3.4 更新 `js/project-io.js` 的 `buildProject`：v5 读取 items，v1–v4 迁移后输出 v5；验证：`io.test.js` 覆盖 v5 往返保持 items 顺序/图片效果/图形字段（含负圆角），以及 v4 fixture 的 `images` 按原顺序变成 image items
- [x] 3.5 更新 `js/draft-store.js`：恢复上限改为 `PROJECT_VERSION`，`pruneMissingAssets` 只检查 image 条目；验证：草稿编码/恢复测试断言 v5 可恢复、v6 返回 `reason: 'version'`、图形不影响资产清理
- [x] 3.6 更新 `docs/歌单生成器需求.md` 的项目版本与导入导出章节，说明 v5 格式、v1–v4 兼容、草稿上限；验证：文档明确“v5 只写 items”，并列出旧版不支持读取 v5
- [x] 3.7 运行 `node --test scripts/checks/*.test.js`，确认模型、schema、io、草稿相关测试全部通过

## 4. 渲染、命中与导出

- [x] 4.1 在 `js/render.js` 实现 `drawShape` 的无效果快速路径：平移/旋转、实心填充、边框裁剪后描边；导出 `L.render.drawShape`；验证：用 `agent-browser` 在临时 canvas 上绘制实心/边框、正圆角/负圆角图形，断言中心像素有色、边框外侧透明、`strokeWidth` 可见厚度符合预期、内凹缺口透明
- [x] 4.2 实现图形效果离屏路径：模糊/亮度/色相 `ctx.filter`，复用 `fillFadeMask` / `fadeProfile` 做渐隐，最后按 `opacity` 合成；验证：`agent-browser` 调整模糊、亮度、色相、单向/双向渐隐，确认效果只作用于该图形且不超出外接框
- [x] 4.3 更新 `paintBackground` 遍历 `background.items` 并按 kind 分派图片/图形，更新 `drawPage` 支持 `type: 'shape'` 与 `includeElementTypes` 过滤；验证：`agent-browser` 绘制图片与图形交错的背景，确认顺序、页面裁剪、缩略图合成一致
- [x] 4.4 更新 `hitTest` / `hitTestBackground` / `elementBounds` / `pageOverflow` / `pageAssets` / `allBackgroundAssets`：shape 用实际路径命中（负圆角用扁平化轮廓），背景返回统一 item，资产只统计 image；验证：`agent-browser` 点击菱形空白角、正圆角外侧与负圆角内凹缺口不选中，点击空心边框内部可选中；Node 测试断言资产列表不含图形
- [x] 4.5 更新 `js/export.js` 的完整页/仅歌单层导出路径并验证：完整页包含内容图形与背景图形及其效果，仅歌单层只包含分类块，图形工具预览不出现；验证：`agent-browser` 用合成项目调用 `render.drawPage` 或导出流程，对比两种模式的像素/文件
- [x] 4.6 更新 `docs/歌单生成器需求.md` 的图形渲染与导出章节，写明实心/边框内侧、带符号圆角（正值外凸/负值内凹）、效果、完整页与仅歌单层差异；验证：文档描述与 `png-export` / `shape-tool` delta 规格一致

## 5. 背景条目操作、选择态与属性写入

- [x] 5.1 在 `js/app.js` 引入统一的 `backgroundItem` 选择态与辅助函数：`selectedBackgroundItem` / `selectedBackgroundImage` / `selectedBackgroundShape` / `backgroundItemBounds`，保留 `selectBackgroundImage` 兼容入口；验证：`agent-browser` 控制台分别选中背景图片与背景图形，确认选择标题、属性和 bounds 正确
- [x] 5.2 把 `js/app-backgrounds.js` 全部迁移到 `page.background.items`，实现通用 `moveBackgroundItem` / `moveBackgroundItemTo` / `deleteBackgroundItem`，复制/清空/整套替换/资产释放覆盖图片与图形；验证：`agent-browser` 控制台调用复制、清空、整套替换、上下移动，确认 items 顺序与图片资产引用正确
- [x] 5.3 更新 `js/app-presets.js`：新图追加到 items 末尾，fit 判断只看图片条目；整套替换清空已有图形，加图/替换只作用于图片条目；验证：`agent-browser` 分别在有图形、无图片、有图片的背景上套用预置，确认图形清除/保留规则与选中项正确
- [x] 5.4 在 `js/app.js` 增加 `setShapeField` / `setShapeKind` / `setShapeAngle`，扩展 `ELEMENT_FIELDS` 与 `assetIsReferenced`，让删除/方向键识别背景图形；验证：`agent-browser` 控制台修改形状、角度、颜色、正/负圆角、边框厚度，确认宽高/角度推导、带符号夹取与重绘正确
- [x] 5.5 更新 `docs/歌单生成器需求.md` 的背景操作与预置章节，写明 items 顺序、图形复制/清空/整套替换、资产只针对图片；验证：文档不再出现“背景仅图片列表”的旧描述

## 6. 画布交互、选择框与图形工具

- [x] 6.1 更新 `js/app-interactions.js`：`selectedElementAt` 支持 shape 路径命中，`onPointerDown` 统一背景条目优先，`resizeDrag` 对 shape 使用 `computeImageResize(..., false, 1)`，移动/旋转/方向键/删除覆盖 shape 与背景图形；验证：`agent-browser` 拖动、八向缩放、旋转、方向键、Delete，确认不锁等比且背景覆盖页只读
- [x] 6.2 更新 `js/app-chrome.js`：`handlePoints` / `drawSelection` / `handleAt` 把 shape 与 image 归为同一组，背景条目按 kind 绘制旋转选框与八个手柄；验证：`agent-browser` 选中内容/背景图形，确认外接框、手柄、旋转手柄位置正确，菱形空白角与负圆角内凹缺口不出现错误命中
- [x] 6.3 在 `index.html` 增加“添加内容图形”按钮，在 `js/ui.js` 绑定切换；实现 `state.shapeTool`、固定入口落点（工具栏内容层 / 背景卡片背景层）、拖拽绘制、单击 240×240、连续绘制、Esc/再点/切页/选中其它对象退出、虚线预览与创建撤销；验证：`agent-browser` 完成内容层与背景层的连续绘制、单击插入、Esc 退出、撤销一次只移除一个图形
- [x] 6.4 更新 `docs/歌单生成器需求.md` 的图形工具章节，写明激活方式、拖拽/单击、连续绘制、退出条件、落点判定、预览不导出；验证：文档场景与 `shape-tool` delta 规格逐条对应

## 7. 属性面板、图层面板与背景分组

- [x] 7.1 在 `js/ui-property-panel.js` 增加 `renderShapeProperties` 与分派：形状、菱形角度、填充方式、颜色、带符号圆角（负值提示“内凹”）、边框厚度、位置/尺寸/旋转、不透明度、模糊、高级效果；背景图形显示所属页/全局状态，方形隐藏角度；验证：`agent-browser` 切换方形/菱形、输入 0/45/90、修改颜色与正/负圆角/边框，确认字段显隐与夹取
- [x] 7.2 更新 `js/ui.js` 图层面板：内容图形图标/名称，背景 items 混排图片/图形，标题“图片 N · 图形 M”，拖拽 kind 改为 `element` / `bgItem`，同列表换序、跨列表拒绝；验证：`agent-browser` 拖拽图片与图形交错换序、尝试跨列表、点击全局来源行，确认顺序与选择正确
- [x] 7.3 更新页面背景分组：整套入口独占一行，“＋图片”“＋图形”“复制背景”“清空背景”两列等宽，空 items 显示“无内容”并禁用清空，被覆盖页隐藏编辑入口；验证：`agent-browser` 在 300px 宽度下检查不折行/无孤行，并验证“＋图形”强制背景落点
- [x] 7.4 更新选中标题与删除确认：内容/背景图形显示“图形”，背景图片仍显示“背景图片”，删除图形走确认文案；验证：`agent-browser` 分别选中并删除内容图形、背景图形、背景图片，确认文案和资产释放正确
- [x] 7.5 更新 `README.md` / `PRODUCT.md` / `DESIGN.md` 的能力与版本说明，补充图形、items、项目版本 5；验证：三份文档均能检索到图形与 v5，且不把图形描述成图片效果的一部分

## 8. 集成验收

- [x] 8.1 运行 `node --test scripts/checks/*.test.js`，确认全部 Node 回归通过
- [x] 8.2 用 `agent-browser` 验证内容/背景图形、拖拽/单击/连续绘制、Esc/切页退出、菱形 0/45/90、正/负圆角/边框夹取、菱形空白角与负圆角内凹缺口命中；验证：按场景逐项记录通过结果
- [x] 8.3 用 `agent-browser` 验证图层混排与拖拽、复制背景、清空背景、预置整套替换、全局背景只读与接管；验证：每项操作后检查 items 顺序、图形保留/清除与撤销
- [x] 8.4 用 `agent-browser` 验证完整页导出包含内容/背景图形及效果、仅歌单层不含图形、预览不出现在导出；并导入 v4 旧项目确认背景图片顺序不变、v5 导出再导入一致
- [x] 8.5 运行 `openspec validate add-shape-tool`（或当前 CLI 对应命令）与 `openspec status --change add-shape-tool --json`，确认所有工件完成、无校验错误

## Workflow follow-up

- 实现完成并通过评审后，按 OpenSpec 流程归档该变更。
- 归档前确认 `docs/歌单生成器需求.md` 与 OpenSpec 主规格已同步到 v5 图形能力。
