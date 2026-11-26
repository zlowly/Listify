# Tasks

## 1. 分裂按钮结构（index.html + style.css）

- [x] 1.1 在 `index.html` 的「添加图片」按钮外套 `.tool-split` 结构：主按钮 id 保持 `btn-add-image`，新增左向箭头子按钮 `btn-add-image-more`（`aria-haspopup="menu"`、`aria-expanded="false"`）与 `role="menu"` 弹层（本地文件 / 粘贴剪贴板 / 预设图库 三个 `menuitemradio` 项）；DOM 与 `/tmp/listify-splitbtn-demo.html` 一致。验证：浏览器打开页面，元素结构检查齐全。
- [x] 1.2 在 `style.css` 增加 `.tool-split` / `.caret-btn` / `.tool-flyout` / `.menu-item` 样式，取色与工具栏现有变量对齐，弹层向右展开且不被页签区遮挡。验证：目视对比示范文件。

## 2. 交互逻辑（js/ui.js + js/app.js）

- [x] 2.1 在 `js/ui.js` 实现菜单开合与键盘交互：箭头点击/`ArrowDown` 开合、`↑↓` 循环移动、Enter 触发、Escape 关闭并归还焦点、`pointerdown` 外部关闭；同步 `aria-expanded` 与 `aria-checked`。验证：纯键盘完成一次来源切换。
- [x] 2.2 在 `js/app.js` 把 `insertImage` 扩展为按来源分流（local/paste/preset）：local 走现有 `pickFreeImage`/`pickBackgroundImage` 链路；paste 走 `navigator.clipboard.read()` → 现有粘贴管线，失败时 `ui.toast` 提示改用 Ctrl+V；preset 落点为背景层时复用 `openPresetPicker('add')`。验证：三个来源逐一执行插入成功。
- [x] 2.3 实现来源记忆（内存变量，按内容层/背景层各一份）：选择菜单项后更新默认来源、主按钮 `aria-label` 与浮动提示文案；不改持久化。验证：切换来源后点主按钮，行为为上次来源；刷新页面后回到默认。
- [x] 2.4 在 `js/ui-pickers.js` 为内容层落点新增 `openPresetPicker('free')` 分支：所选预置按 `pickFreeImage` 管线物化为自由图片插入内容层；既有 whole/add/replace 行为不变。验证：内容层与背景层分别经预设图库插入成功。

## 3. 画廊移除本地入口（js/ui-pickers.js）

- [x] 3.1 删除 `createLocalRow` 及其在正常渲染与 `renderPresetIndexError` 回退中的调用与文案；保留拖入图片链路，回退文案改为仅提示重试。验证：画廊内无本地图片入口，拖入图片仍可应用。

## 4. 验证

- [x] 4.1 跑零依赖回归：`node --test scripts/checks/*.test.js` 全绿（预期无逻辑改动受影响）。验证：命令退出码 0。
- [x] 4.2 浏览器手工走查（`file://` 打开）：默认本地文件、粘贴降级提示（在 `file://` 下点「粘贴剪贴板」）、预设图库插入（内容层/背景层）、全局背景覆盖页的按钮禁用与提示不变、导出 PNG 不含工具条。验证：逐项操作无异常。
- [x] 4.3 运行 `graphify update .` 保持知识图谱最新。验证：命令成功退出。
