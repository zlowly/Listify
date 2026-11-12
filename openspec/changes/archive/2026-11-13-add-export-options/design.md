# Design

## Context

- 导出目前完全在 `js/export.js`：`exportPage()` 建 canvas、调用 `L.render.drawPage(ctx, project, page, { editMode: false })`、`canvas.toBlob`、`L.model.downloadBlob`。
- `js/render.js` 的 `drawPage()` 先画背景（`drawBackground`），再按 `page.elements` 顺序画分类块、自由文字、自由图片；编辑态与导出共用同一条路径，`editMode` 只控制辅助线。
- 页面尺寸是项目级 `project.pageSize`，所有页共用，不存在混合尺寸。
- `js/model.js` 的 `downloadBlob()` 用 `<a download>` + `URL.createObjectURL`，1 秒后回收。
- 约束：零构建、无网络、无新依赖、Chrome + `file://`；项目 JSON 结构不变。
- 行为契约见 `specs/png-export/spec.md`（本次 delta）。

## Goals / Non-Goals

**Goals:**

- 本页 / 所有页两种范围；所有页只触发一次下载。
- 完整页面 / 仅歌单层（透明底）两种内容模式，透明模式只画分类块。
- 复用现有 Canvas2D 渲染，不维护第二套绘制逻辑。
- ZIP 在项目内生成，不引入第三方库。

**Non-Goals:**

- 不做页码范围、每页不同尺寸、PDF、长图拼接。
- 不做图层可见性开关；内容模式只影响本次导出，不改项目数据或编辑态预览。
- 不压缩 ZIP 条目（PNG 已压缩，store 足够）。
- 不支持 ZIP64。

## Decisions

### 1. 用渲染选项扩展 `drawPage`，不写第二套绘制

`drawPage(ctx, project, page, opts)` 增加两个选项：

- `includeBackground`（默认 `true`）：为 `false` 时跳过 `drawBackground`。
- `includeElementTypes`（默认 `null` 表示全部）：数组时只绘制匹配的 `element.type`。

导出按模式传：

```
{ editMode: false,
  includeBackground: mode === 'full',
  includeElementTypes: mode === 'playlist' ? ['category'] : null }
```

编辑态调用保持不变。备选是单独写 `drawPlaylistOnly()`，否决：分类块的排版、裁剪、字体逻辑会与编辑态漂移。

### 2. 拆成 `renderPageBlob` + 交付层

`renderPageBlob(project, page, width, height, mode)` 只负责建 canvas、缩放、`drawPage`、`toBlob`，返回 `{ blob, width, height }`，不触发下载。

- 单页：`renderPageBlob` → `downloadBlob`。
- 所有页：逐页 `renderPageBlob` → 收集 `{ name, blob }` → `buildZip` → `downloadBlob`。

这样 ZIP 路径能直接复用渲染，单页行为也保持一致。

### 3. ZIP 用项目内 store-only 实现

结构：`[本地头 + PNG 字节] × N` → 中央目录 → EOCD。

- 实现放在 `js/zip.js`，暴露 `L.zip.build(entries)`；`index.html` 在 `js/export.js` 之前加载。
- method 0（store），压缩后大小等于原始大小；PNG 已压缩，再 deflate 收益接近零。
- 每个条目计算 CRC32（运行时生成 256 项表）。
- 文件名用 `TextEncoder` 编码为 UTF-8，通用标志位设 bit 11（`0x0800`），中文条目名在现代解压工具中正常显示。
- DOS 时间/日期取导出时刻；不写 extra field。
- 最后 `new Blob(parts, { type: 'application/zip' })`，仍然是单次 `<a download>`。
- 不做 ZIP64：页数远小于 65535，单个 PNG 远小于 4GB。

备选：

- `fflate` 等库：违反“唯一运行时依赖是 Leafer”的约束。
- 逐页下载：Chrome 的 `DownloadRequestLimiter` 会弹多文件提示，且 JS 无法感知被拦。
- 长图：受 canvas 单边/面积上限约束，透明模式叠透明也没有意义。

### 4. 命名与补零

- 单页：`歌单_第N页.png` / `歌单_第N页_透明.png`，页码不补零。
- 所有页：`歌单_N页.zip` / `歌单_N页_透明.zip`，N 为项目总页数。
- ZIP 条目：按总页数位数补零（至少两位），`歌单_第01页.png` … `歌单_第08页.png`，保证解压后按名称排序正确。
- 透明模式跳过空页时，条目保留原始页码（例如 01、02、03、05），压缩包名仍用总页数；结束时 toast 说明跳过的页码。

### 5. 资产加载

- 完整模式：先遍历所有目标页，用 `L.render.pageAssets(page)` 预加载图片，再等 `document.fonts.ready`；这样坏图会在开始渲染前暴露。
- 透明模式：不加载任何图片，只等字体；背景图损坏不影响导出。
- 字体只等一次，图片走 `L.assets` 现有缓存。

### 6. 进度、取消与失败

- 每页渲染后更新“正在导出 3/8…”，并用 `requestAnimationFrame` 让出一帧，避免进度条不刷新。
- 导出期间禁用“导出”按钮和尺寸/模式输入；“取消”按钮和关闭动作通过 `onClose` 设置 `cancelled` 标志。
- 循环在每页开始前检查标志；取消后不再渲染、不下载、不弹成功提示。ZIP 路径本身是原子的，取消不会留下半成品。
- 任意一页失败：中止整批，提示“第 5 页导出失败：…”，不产生 ZIP；单页失败不产生文件。
- 透明模式下所有目标页都没有分类块：提示“没有可导出的分类块”，不产生文件。

### 7. 单页项目回退

范围为“所有页”但项目只有 1 页时，直接走单页 PNG 路径，并在对话框提示“当前只有 1 页，将导出 PNG”。

### 8. 对话框

在现有 `.modal-form` 里加两组单选：

```
导出范围   (o) 本页   ( ) 所有页（ZIP）
导出内容   (o) 完整页面 ( ) 仅歌单层（透明底）
宽度 / 高度 / 锁定比例
输出 歌单_8页.zip
```

默认“本页 + 完整页面”，与现有行为一致。提示文案随范围、内容、页数实时更新。样式复用 `.field`、`.check-row`，只补少量单选行间距，不新增组件体系。

### 9. `downloadBlob` 回收时长

ZIP 可能到几十 MB，1 秒回收 URL 偏短；把 `revokeObjectURL` 延后到 10 秒。对单页 PNG 无副作用。

## Risks / Trade-offs

- **ZIP 中文条目名在旧解压工具中乱码** → 设 UTF-8 标志位；在目标系统用资源管理器/`unzip -t` 验证；必要时退回 ASCII 条目名（压缩包名保持中文）。
- **多页内存占用** → 顺序渲染，每页 canvas 用完即弃，只保留 PNG 字节；页数特别多或 4K 输出时内存会明显上升，v1 不设硬上限，靠对话框页数和输出尺寸提示。
- **进度不刷新** → 每页后 `requestAnimationFrame` 让出主线程。
- **ZIP 结构/CRC 写错** → 用 `unzip -t` 和系统解压工具验证；CRC 表与头部字段集中在一个小模块里，便于单点修正。
- **`toBlob` 返回 null** → 直接抛错，中止整批，不产出空文件。
- **透明文字边缘** → alpha 抗锯齿正常；合成到深色背景是否可读由使用者判断，导出侧不做补偿。
- **取消时正在渲染的页** → 完成当前页后停止，不下载；不会出现半成品 ZIP。
- **单页自定义大尺寸** → 仍受既有 canvas 上限约束，本次不改变该风险。

## Migration Plan

- 纯静态文件替换，无数据迁移；项目 JSON 不新增字段。
- 回滚：还原 `js/export.js`、`js/render.js`、`js/model.js` 及 `style.css` 中新增的对话框样式。
