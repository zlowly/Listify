# Tasks

## 1. 渲染选项

- [x] 1.1 在 `js/render.js` 的 `drawPage` 增加 `includeBackground` 与 `includeElementTypes` 选项，默认值保持现有行为；验证：编辑态打开含背景、自由文字、自由图片的页面，画布与改动前一致。
- [x] 1.2 在浏览器控制台建临时 canvas，调用 `drawPage` 传 `{ editMode: false, includeBackground: false, includeElementTypes: ['category'] }` 并插入页面查看；验证：只剩分类块，背景、自由文字、自由图片都不出现。

## 2. 导出核心重构

- [x] 2.1 把 `js/export.js` 的渲染与下载拆开：新增 `renderPageBlob(project, page, width, height, mode)` 返回 blob，`exportPage` 复用它；验证：单页完整模式导出的 PNG 尺寸与内容与改动前一致。
- [x] 2.2 让 `waitForAssets` 按模式加载：完整模式加载图片并等字体，透明模式只等字体；验证：把当前页背景图换成损坏文件，透明模式仍能导出，完整模式报错。
- [x] 2.3 增加命名与补零 helper：单页 `歌单_第3页[_透明].png`，ZIP 条目 `歌单_第01页[_透明].png`；验证：用 8 页项目检查单页名与补零宽度，12 页时补零仍为两位。

## 3. ZIP 构建器

- [x] 3.1 新增 `js/zip.js`，实现 CRC32、本地头、中央目录与 EOCD，暴露 `L.zip.build(entries)`；在 `index.html` 于 `js/export.js` 之前加载；验证：控制台用两个小 Blob 生成 zip 并下载，`unzip -t` 通过。
- [x] 3.2 条目名用 `TextEncoder` 编码为 UTF-8 并设置通用标志位 bit 11；验证：`unzip -l` 显示中文条目名，解压后文件名正确。

## 4. 多页导出流程

- [x] 4.1 在 `js/export.js` 增加 `exportAllPages`：预加载目标页图片、逐页 `renderPageBlob`、收集条目、`L.zip.build`、单次下载；验证：8 页项目导出得到 1 个 ZIP，`unzip -t` 通过且条目顺序与页签一致。
- [x] 4.2 增加进度与取消：每页后更新“3/8”并 `requestAnimationFrame` 让出一帧；关闭/取消设置标志，循环在下一页前停止；验证：导出中途点取消，对话框关闭且不产生文件，控制台无报错。
- [x] 4.3 处理透明模式空页与 1 页项目：无分类块的页跳过并在结束时报告；所有页但只有 1 页时走 PNG；验证：构造 4 页且第 2 页无分类块，导出透明 ZIP 的条目为 01/03/04，toast 提到第 2 页已跳过；单页项目选所有页得到 PNG。
- [x] 4.4 批量失败原子性：任意一页失败时中止且不下载 ZIP，提示页码；验证：完整模式下让第 3 页背景图损坏，导出所有页得到错误提示且无 ZIP。
- [x] 4.5 把 `js/model.js` 的 `downloadBlob` URL 回收从 1 秒改为 10 秒；验证：导出较大的 ZIP，下载正常开始并完成。

## 5. 导出对话框与文档

- [x] 5.1 在 `js/export.js` 的 `openDialog` 增加“导出范围”和“导出内容”两组单选，默认本页 + 完整页面；输出提示随选择实时更新；验证：切换四种组合，提示中的文件名与尺寸正确。
- [x] 5.2 导出期间禁用导出按钮与所有输入，取消/关闭可中止；验证：点击导出后按钮显示“导出中…”，输入不可改，取消后对话框关闭且无文件。
- [x] 5.3 增加空内容保护：本页透明模式无分类块时禁用导出并提示；所有页透明模式全为空时同样阻止；验证：空页项目无法生成空文件。
- [x] 5.4 在 `style.css` 补单选行样式，复用现有 `.field` 与 `.check-row` 变量；验证：对话框在 1280 宽与窄窗口下不溢出，视觉与现有属性面板一致。
- [x] 5.5 更新 `PRODUCT.md` 的工作流与能力列表，写入本页/所有页、完整/透明、ZIP；验证：文档不再写“仅当前页”，描述与实现一致。

## 6. 集成验证

- [x] 6.1 用多页项目走完 2×2 矩阵（本页/所有页 × 完整/透明）；验证：单页 PNG、透明 PNG、完整 ZIP、透明 ZIP 四种产物都正确，命名符合规范。
- [x] 6.2 把透明 PNG 叠到深色背景或棋盘格上；验证：分类块边缘干净，背景区域完全透明。
- [x] 6.3 以 `file://` 打开 `index.html`，在 DevTools Network 面板确认导出期间没有网络请求；验证：无新增依赖、无控制台错误。
- [x] 6.4 用系统解压工具打开 ZIP；验证：中文条目名正常，PNG 可打开，页序正确。

## Workflow follow-up

- Archive the change after review.
- Run `openspec validate` and the project's archive step.
