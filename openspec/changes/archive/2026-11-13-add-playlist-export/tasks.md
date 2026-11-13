# Tasks

## 1. 工具条 UI（? 图标与浮动提示）

- [x] 1.1 在 `index.html` 的 `#category-toolbar` 中：`#btn-import` 之后新增 `<button id="btn-export-playlist" class="btn btn-sm">导出歌单</button>`（默认样式，导入保持 `btn-primary`）；删除 `<span class="hint">或拖入 .txt</span>`，在原位置放一个与 `helpTip()` 输出同构的静态按钮（`type="button"`、`class="help-tip"`、`data-tip` 与 `aria-label` 为“也可以直接把 .txt 文件拖入分类区域导入”）；用 `file://` 打开页面，确认工具条顺序为导入（主样式）/导出/编辑歌单/? 图标，且全页不再出现“或拖入 .txt”文字。
- [x] 1.2 在 `js/ui.js` 元素捕获中新增 `categoryToolbar = getElementById('category-toolbar')`，并把 `initPropTips()` 的委托根数组由 `[propertyPanel, modalRoot]` 扩为包含该工具条；浏览器验证：悬停与 Tab 聚焦工具条 `?` 图标均显示浮动提示，指针移开、焦点离开、按 Esc 均关闭，提示不遮挡按钮（在 1440px 与约 900px 最小宽度窗口各查一次）；回归属性面板与背景库弹窗的既有 `?` 提示仍正常。

## 2. 导出模块与交互流程

- [x] 2.1 新增 `js/playlist-export.js`（经典脚本，`index.html` 中在 `app.js` 之前引入）：暴露 `L.playlistExport.serialize(categories)`（按存储顺序输出 `#分类名` 行 + 歌名行，“未分类”输出显式 `#未分类` 行，空分类只输出分类名行，`\n` 换行、文件末尾一个换行）、`sampleTemplate()`（固定样例：`#流行` 夜曲/晴天/七里香/告白气球，`#摇滚` 光辉岁月/海阔天空/无地自容）、`exportPlaylist(project)`（非空返回序列化文本并 `L.model.downloadBlob` 下载 `歌单.txt`，返回 `text`；空返回 `{ empty: true }` 不下载）；在浏览器控制台验证 `serialize` 输出经 `L.importer.parseText` 解析后分类与歌名集合、顺序与原数据一致，且覆盖空分类与含“未分类”两组用例。
- [x] 2.2 在 `js/app.js` 中（与 `#btn-import` 绑定同一处）绑定 `#btn-export-playlist`：调用 `L.playlistExport.exportPlaylist`；非空时 toast “歌单已导出。”；空时打开模态（标题“没有歌单”，正文说明目前没有歌单并询问是否导出歌单模板，动作为「导出模板」主样式 + 「取消」），确认后下载 `歌单模板.txt` 并 toast，取消则关闭；`node --check js/playlist-export.js js/app.js` 通过，浏览器验证三条路径（非空导出、空歌单确认后下载、空歌单取消无下载且数据不变）。
- [x] 2.3 验证导出往返闭环：浏览器中导入 `samples/utf8.txt`，点“导出歌单”得到 `歌单.txt`，把该文件重新导入；确认导入成功、分类与歌名和导出前一致，已放置的分类块版面（位置/样式）不变（对照 `playlist-import` 重复导入规则）。

## 3. 文档与集成验证

- [x] 3.1 更新 `docs/歌单生成器需求.md`：在歌单导入附近补“导出歌单”小节（入口位置、导出格式与往返一致性、空歌单模板引导与模板示例），并把“或拖入 .txt”文字改为 `?` 图标加浮动提示的描述；核对文案与 `specs/playlist-export/spec.md`、`specs/editor-shell/spec.md` 场景一致。
- [x] 3.2 全量冒烟：`node --check` 全部 js 文件；`file://` 依次走查——分类视图工具条（按钮顺序/样式/? 提示悬停与键盘）、图层视图下导出按钮隐藏、空项目导出模板并导入模板成功（2 个分类各 4 首）、属性面板/弹窗既有提示与 Esc 语义不受影响、导出 PNG 结果与改动前一致。
- [x] 3.3 运行 `openspec validate add-playlist-export --strict` 并确认通过。
- [x] 3.4 移除“导入示例歌单”入口：`js/ui.js` 空态按钮与绑定、`js/app.js` 的 `SAMPLE_PLAYLIST_TEXT`/`importSamplePlaylist` 及 API 项、`style.css` 空态按钮样式；同步更新 PRODUCT.md 与 DESIGN.md；`node --check` 通过，浏览器验证空态不再出现按钮且文案完整。

## Workflow follow-up

- 满足项目审阅要求后，用 `openspec archive add-playlist-export` 归档变更。
- 归档后确认 `openspec/specs/playlist-export/spec.md` 主规范已生成、`editor-shell` 主规范中「左侧歌单素材栏」已更新。
