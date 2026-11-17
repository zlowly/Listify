# Tasks

## 1. 重排纯函数

- [x] 1.1 在 `js/model.js` 新增按显示顺序重排的纯函数（例如 `model.moveInDisplayOrder(list, id, targetId, placement)` 与显示序/模型序互转），输入输出只依赖对象 id 与 `'before'|'after'`，不读 DOM；验证：`node --test scripts/checks/model.test.js` 通过，且函数不新增对 `window`/`document` 的引用
- [x] 1.2 在 `scripts/checks/model.test.js` 补齐用例：拖到最顶、最底、原位、相邻互换、单元素、空列表、显示序反转映射；验证：`node --test scripts/checks/model.test.js` 全绿，且用例覆盖上述七种情形各至少一条
- [x] 1.3 用纯函数替换现有 `moveBackgroundImage` 的下标算术（或让其委托新函数），保持属性面板上移/下移行为不变；验证：`node --test scripts/checks/model.test.js` 与 `node --test scripts/checks/layout.test.js` 均通过

## 2. 撤销与动作入口

- [x] 2.1 `js/app.js` 新增 `moveLayerTo(fromIndex, toIndex)` 与 `js/app-backgrounds.js` 新增 `moveBackgroundImageTo(setId, imageId, targetId, placement)`，两者各在改数组前 `pushUndo` 一次并把新方法挂到 `L.app`；验证：浏览器控制台调用一次，撤销栈只增加一条，`Ctrl+Z` 可回到原顺序
- [x] 2.2 给 `moveBackgroundImage` 补 `pushUndo('调整背景图片顺序')`，与 `moveLayer` 的 `pushUndo('调整图层顺序')` 对齐；验证：属性面板点上移后执行一次撤销，顺序恢复且只撤销一步
- [x] 2.3 `performUndo` 的选区恢复扩展到 `backgroundSet` / `backgroundImage`（快照内 id 仍存在时保留，否则退回 `page`）；验证：撤销一次背景图换序后属性面板仍停在原背景图，撤销一次内容层级后仍停在原元素，撤销一次删除元素后仍退回页面

## 3. 图层行语义结构

- [x] 3.1 改造 `js/ui.js` 的 `renderLayerPanel`：外层 `div.layer-row` + 行内 `<button class="layer-row-main" draggable="true">` + 兄弟 `.row-actions`，选中类留在外层；验证：图层列表可点击选中、Tab 可聚焦、Enter 触发选中，控制台无嵌套按钮告警
- [x] 3.2 调整 `style.css`：`.layer-row` 保留边框/圆角/内边距/悬停/选中，`.layer-row-main` 重置为透明 flex（`flex:1;min-width:0;border:0;background:none;padding:0;font:inherit;color:inherit`），`cursor: grab`；验证：300px 与 280px 两档侧栏下，内容行与背景图片子行行高、内边距、字号、图标位置与改动前一致（截图比对），名称超长时省略号截断且不撑高
- [x] 3.3 清理行点击守卫：选中逻辑移到主按钮，`[data-layer-move]` / `[data-bg-add]` 的判断改为动作按钮自身的独立监听；验证：点击箭头只换序不改变选中之外的状态，点击 ＋ 只打开选图弹窗，点击主按钮只选中

## 4. 背景图片子行换序按钮

- [x] 4.1 在背景图片子行渲染下移/上移图标按钮（`aria-label` 为动作名称），两端 `disabled`；验证：三张图时中间行两钮可用、最底层只有上移可点、最顶层只有下移可点，背景只有一张图时两钮均禁用
- [x] 4.2 按钮分别调用 `L.app.moveBackgroundImage`，并确认换序后属性面板仍显示同一张图；验证：点一次上移后画布叠放、子行顺序、属性面板标题三处同步，且只产生一条撤销记录
- [x] 4.3 由 `docs/歌单生成器需求.md` 背景层“每张图片独立设置透明度、边缘模糊和绘制顺序”一句补上图层入口说明；验证：文档描述与实现一致，`README.md` 中若有图层相关说明同步更新

## 5. 拖拽换序

- [x] 5.1 在 `js/ui.js` 增加模块级 `dragPayload` 与四条拖拽监听（`dragstart` / `dragover` / `dragleave` / `dragend`），`dragstart` 写入 `{ kind, id, setId }` 并设置 `dataTransfer`；验证：拖动内容行与背景图片子行各一次，控制台 payload 的 `kind` 正确，从箭头按钮起拖不产生 payload
- [x] 5.2 实现落点判定与插入线：按目标行上下半区切换 `drop-before` / `drop-after`，并加对应 CSS（`box-shadow` 4px 蓝线、`cursor: grabbing`）；验证：指针在上半区显示上行线、下半区显示下行线，离开面板后指示线消失
- [x] 5.3 在 `drop` 中按 `kind` 分流调用 `moveLayerTo` / `moveBackgroundImageTo`，落回原位、跨列表、落在背景集行三种情况直接返回且不压撤销栈；验证：三种情况顺序均不变且 `Ctrl+Z` 提示“没有可撤销的操作”不出现新增记录
- [x] 5.4 用 `agent-browser` 跑一遍完整拖拽流：内容行拖到顶部、背景图片子行拖到底部、跨列表两种方向、拖到背景集行、拖回原位；验证：每步的顺序与画布叠放符合预期，控制台无报错

## 6. 集成验证

- [x] 6.1 运行 `node --test scripts/checks/*.test.js`；验证：全部通过、无新增失败
- [x] 6.2 运行 `./build.sh` 并检查产物；验证：`dist/` 正常生成、版本注入与分类分片校验通过、`dist/index.html` 不引用 `js/dev-checks.js`
- [x] 6.3 浏览器手动回归：导入 `.txt` → 加两页 → 放分类块与自由图片 → 图层视图各换序一次 → 刷新恢复草稿 → 导出两张 PNG（完整页与仅歌单层）；验证：顺序在刷新后保留，仅歌单层导出不含背景，控制台无报错

## 前置缺陷（已由 fix-draft-asset-restore 修复）

- 验证 6.3 时发现：`js/draft-store.js` 的 `draftAssetGetAll()` 把二进制资产读成 **data URL**（`data:image/png;base64,…`），而 `js/project-io.js` 的 `buildProject()` 用 `L.assets.base64ToBlob()` 直接 `atob()`，于是任何含图片资产的草稿恢复都会抛「图片数据不是合法 base64」并被判为 corrupt。`git stash` 回 HEAD 复测同样失败，确认与本次改动无关（`blobToDataUrl` 由上一版 `b4c694b` 引入）。
- 该缺陷已在独立变更 `fix-draft-asset-restore` 中修复（纯 base64 交接 + 历史前缀兼容 + 旧记录写回二进制 + 6 条回归用例）。
- 修复后的 6.3 证据：3 页项目、页面 3 上 1 个分类块 + 1 张自由图片 + 4 张背景图，拖拽调整内容层级与背景图片顺序后刷新 —— 当前页、内容顺序 `[摇滚, image]`、背景顺序 `[b-6, f-4, u-5, x-7]` 全部保留且无报错弹窗；完整页面导出角落像素 `[230,235,240,255]`（含背景），仅歌单层导出角落像素 `[0,0,0,0]`（透明），两者均导出成功。

## Workflow follow-up

- 实现完成后运行 `openspec validate layer-panel-reorder --strict`，再按 `openspec-archive-change` 归档并把 delta 合入主规格。
- 实现落地后运行 `graphify update .` 保持知识图与源码一致。
