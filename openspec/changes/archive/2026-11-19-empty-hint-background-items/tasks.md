# Tasks

## 1. 空态判定纯函数

- [x] 1.1 在 `js/model.js` 新增 `isPageEmpty(project, page)`：项目无歌单分类、页面无内容元素、且 `effectiveBackground(project, page)` 的 `items`（兼容 `images`）为空时返回 true；导出到 `L.model`。验证：`node --test scripts/checks/model.test.js` 通过，且现有 `effectiveBackground` 相关用例不受影响。
- [x] 1.2 在 `scripts/checks/model.test.js` 补充用例：默认项目为空；仅背景图片非空；仅背景图形非空；全局背景来自含条目页时非空；全局指针悬空时回退本页；仅改填充色仍为空；清空背景条目后恢复为空。验证：`node --test scripts/checks/model.test.js` 全部通过。

## 2. 画布空态接入

- [x] 2.1 修改 `js/ui.js` 的 `ui.updateEmptyHint`，改用 `model.isPageEmpty(L.app.state.project, L.app.currentPage())`，删除本地 `categories.length`/`elements.length` 判定。验证：代码中不再有重复判定；`node --test scripts/checks/*.test.js` 通过。
- [x] 2.2 浏览器验证（`agent-browser` 或手动打开 `index.html`）：空项目显示提示；添加背景图片后提示立即消失；添加背景图形后消失；复制含图片背景/应用预设背景后消失；设为全局背景后其它页提示消失；删除最后背景条目、清空背景、取消全局背景后提示恢复；仅改填充色时提示保持。验证：逐项观察 DOM 中 `#empty-hint` 的 `hidden` 状态与画面一致。

## 3. 集成检查

- [x] 3.1 运行完整零依赖回归 `node --test scripts/checks/*.test.js`，确认无失败；并确认未新增运行时文件、`index.html` 脚本顺序无需调整。验证：命令退出码为 0。
- [x] 3.2 打开页面走一遍导入歌单、拖分类到画布、删除全部元素的流程，确认内容层与背景层的提示显隐互不干扰。验证：内容层清空且背景有条目时提示不出现；两者都空时提示出现。
