# Tasks

## 1. 全局开关行结构

- [x] 1.1 在 `js/ui-property-panel.js` 的 `backgroundGroup(page)` 未覆盖分支中，把 `field('全局背景', '<label class="check-row">…所有页使用此背景</label>')` 替换为单行模板：`<div class="global-bg-row">` 内依次放包住 `input#prop-bg-global` 与「全局背景」文字的 `<label class="check-row">`，再接 `helpTip('所有页使用此背景')`；保留 `id`、`checked`（`isSource`）与既有 `bindBackgroundGroup` 的 `change` 绑定不变，`index.html` 脚本顺序不改；验证：浏览器打开页面属性，行内顺序为「☐ 全局背景 ?」，正文不再出现常驻「所有页使用此背景」，勾选/取消仍设置/清空全局并可撤销
- [x] 1.2 保持被覆盖分支的 `field('全局背景', '…本页接管')` 文案与控件顺序不变，不新增或重排该行 DOM；验证：切到被覆盖页，仍显示「全局背景」与「本页接管」，勾选后本页成为全局来源且无需确认

## 2. 间距与行样式

- [x] 2.1 在 `style.css` 的页面背景卡片区域新增 `.global-bg-row { display: flex; align-items: center; gap: 6px; margin-top: 12px; }` 与 `.global-bg-row .help-tip { margin-left: 0; }`，并补 `.prop-group[data-group="background"] .inline-actions + .field { margin-top: 12px; }`；验证：未覆盖页全局行与上方按钮网格之间、被覆盖页「本页接管」行与「取消全局背景」按钮之间均出现 12px 间距，`?` 紧贴「全局背景」文字
- [x] 2.2 走查窄属性栏与面板底部边界：`☐ 全局背景 ?` 不换行、不溢出，`?` 浮层在底部自动翻到上方，复选框与 `?` 的键盘焦点环可见；验证：把浏览器缩到最窄属性栏并滚动到底部逐项确认

## 3. 集成验证

- [x] 3.1 运行 `node --test scripts/checks/*.test.js` 确认无回归；验证：全部通过（本次无纯逻辑改动，预期零失败）
- [x] 3.2 用 `agent-browser`（或手动）按 delta spec 场景走查：未覆盖页行结构、`?` 悬停/聚焦显示「所有页使用此背景」且离开/失焦消失、行与按钮间距、被覆盖页接管行间距、勾选/取消/撤销、刷新后草稿恢复；验证：逐场景通过并记录结果

## Workflow follow-up

- 评审通过后归档本变更：`openspec archive refine-global-background-toggle`，并确认 `openspec/specs/background-layer/spec.md` 的「页面背景分组的动作与文案」与「全局背景覆盖」已按 delta 更新。
