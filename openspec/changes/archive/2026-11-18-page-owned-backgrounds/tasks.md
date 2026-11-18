# Tasks

## 1. 数据模型与项目结构（v4）

- [x] 1.1 把 `js/model.js` 的背景模型改为页面拥有：`page.background = { color, images }`，新增 `project.globalBackgroundPageId`；提供 `createPageBackground`、`effectiveBackground`、`globalBackgroundPage`、`isBackgroundCovered`、`canEditPageBackground`、`copyPageBackground`（深拷贝图片条目、共享 `assetId`）与 `setGlobalBackgroundPage` / `clearGlobalBackground`。验证：`node --test scripts/checks/model.test.js` 覆盖默认背景、复制后条目 ID 不同、全局指针覆盖与取消。
- [x] 1.2 删除 `backgrounds`/`backgroundId`/`unifiedBackground*` 相关模型辅助与默认项目；`createDefaultProject()` 产出版本 4 与每页空背景。验证：`node --test scripts/checks/model.test.js` 中断言默认项目结构。
- [x] 1.3 重写 `js/project-schema.js` 的校验：页面背景必填且图片字段沿用现有校验；`globalBackgroundPageId` 为 `null` 或存在的页面 ID；版本上限改为 4，拒绝更高版本。验证：在 `scripts/checks/io.test.js` 增加 v4 合法/非法夹具，`node --test scripts/checks/io.test.js` 通过。
- [x] 1.4 实现 v3 → v4 迁移：按 `backgroundId` 展开每页背景；`unifiedBackground` 有页面引用时取首个引用页为来源；无页面引用时把全局背景复制到第一页并设为来源；无全局时指针为 `null`。验证：新增迁移单测覆盖有引用、无引用、无全局三种情况。
- [x] 1.5 让 v1/v2 迁移链落到 v4：复用现有引用组折叠，再执行 v3 → v4；保留 v2 共享引用折叠后的画面一致性。验证：`io.test.js` 中 v1/v2 夹具导入后页面背景与旧画面一致，且不残留背景库字段。

## 2. 序列化、渲染、草稿与资产

- [x] 2.1 更新 `js/project-io.js`：序列化版本 4、每页 `background` 与 `globalBackgroundPageId`，删除背景库字段；`collectReferencedAssetIds` 改为收集页面背景与内容图片。验证：`io.test.js` 的结构往返、资产收集与 v3 导入用例通过。
- [x] 2.2 更新 `js/render.js` 的背景读取与命中：按 `effectiveBackground` 渲染；新增当前页是否可编辑背景的查询，供交互层阻止被覆盖页命中。验证：`node --test scripts/checks/layout.test.js` 通过，并在浏览器手动画布拖动背景图确认选择框与裁剪不变。
- [x] 2.3 更新 `js/export.js` / `js/playlist-export.js` 的资产与背景读取：整页导出使用有效背景，仅歌单层仍跳过背景层；导出缺失资产报错路径保持。验证：手动导出整页与仅歌单层各一次，对照画面；`node --test scripts/checks/zip.test.js` 通过。
- [x] 2.4 更新 `js/draft-store.js`：项目版本上限改为 4，`pruneMissingAssets` 遍历 `page.background.images`，旧草稿经迁移恢复。验证：`node --test scripts/checks/draft-encoding.test.js` 通过，并在浏览器用旧草稿启动一次确认迁移。

## 3. 动作层与只读守卫

- [x] 3.1 重写 `js/app-backgrounds.js`：按页面读写背景；新增 `setGlobalBackgroundPage`、`clearGlobalBackground`、`copyBackgroundFromPage`、`clearPageBackground`、`replacePageBackground`；所有背景写入先经过可编辑守卫，拒绝时 toast 且不改数据。验证：在 `model.test.js` 锁定纯逻辑；浏览器中在覆盖页尝试换背景、加图、改色、拖拽，确认全部被拒绝且提示一致。
- [x] 3.2 更新 `js/app.js`：选择类型改为 `{ type: 'background' }` / `{ type: 'backgroundImage', imageId }`；`selectBackground`、属性面板路由、方向键微调、撤销后选择恢复适配页面背景；删除来源页时清空全局并合并为一条撤销记录。验证：浏览器中设全局→删来源页→撤销，页面、指针与画面全部恢复。
- [x] 3.3 新增页改为复制当前有效背景（深拷贝）；`addPageDialog` 与页面删除路径更新。验证：全局开启时新增页，取消全局后新页仍保留那份背景副本。
- [x] 3.4 更新 `js/app-presets.js` 整套模式为替换当前页背景，`add`/`replace` 作用于当前页；删除按名称复用背景集的分支；被覆盖页入口拒绝。验证：连续应用两张整套预置，图片列表不累加；一次撤销回到替换前。

## 4. 界面与交互

- [x] 4.1 重写 `js/ui-property-panel.js` 页面背景分组：缩略图、填充色、更换背景、＋叠图、复制背景…、清空背景、全局复选框；实现无全局/来源页/被覆盖页三态，被覆盖页禁用编辑并显示来源页与取消全局入口；删除 `renderBackgroundSetProperties` 与背景集相关绑定。验证：浏览器逐态检查控件可用性与文案，键盘可聚焦顺序不跳位。
- [x] 4.2 更新 `js/ui.js` 图层面板：可编辑页显示背景行 + 图片子行；被覆盖页只显示「全局背景 · 来自第 N 页」，点击跳到来源页并选中其背景；移除 `backgroundSet` 选择与相关拖拽分支；页面标签为全局来源页显示标记。验证：浏览器检查两种页面的图层行、跳转与标签标记。
- [x] 4.3 在 `js/ui-pickers.js` 增加「复制背景…」弹窗：列出其它页并用离屏 canvas 生成背景预览，点击即复制并提示撤销；删除 `openBackgroundLibrary` 与背景库入口；被覆盖页禁用入口。验证：从两页互拷背景，确认填充色、图片顺序、定位与效果一致，源页不变。
- [x] 4.4 更新 `style.css` 与 `index.html`：新增/删除的背景分组状态样式、复制弹窗与预览样式、标签标记；移除背景库弹窗残留样式与按钮引用；保持既有视觉 token 与响应式布局。验证：`file://` 打开页面，1280px 与窄窗口下无溢出，焦点样式可见。

## 5. 文档与端到端验证

- [x] 5.1 更新 `docs/歌单生成器需求.md` 背景层章节：每页背景、全局来源页、只读规则、跨页复制、清空背景；删除背景库与固化/副本描述。验证：通读章节，规则与 `openspec/specs/background-layer/spec.md` 一致。
- [x] 5.2 更新 `README.md` 与 `AGENTS.md`：功能列表、模块说明、领域规则中的背景语义、项目版本与迁移说明。验证：搜索 `背景库|unifiedBackground|backgroundId|固化|独立副本` 不再命中过时描述（历史迁移说明除外）。
- [x] 5.3 运行 `node --test scripts/checks/*.test.js`，确认零失败；运行 `./build.sh`，检查 `dist/` 生成成功且 `dist/index.html` 资源版本注入正常。验证：记录两条命令的退出码与测试汇总。
- [x] 5.4 用 `agent-browser` 走查主流程：导入歌单、两页分别设不同背景、设全局、改来源页背景、取消全局、复制背景、新增页、导出整页与仅歌单层。验证：每步画面与只读/可编辑状态符合规格，控制台无报错。

## Workflow follow-up

- 归档变更前由项目维护者复核 `background-layer`、`page-editor`、`project-persistence`、`modal-dialog` 的 delta。
- 归档后运行 `openspec archive page-owned-backgrounds` 并重新生成 `graphify` 图。
