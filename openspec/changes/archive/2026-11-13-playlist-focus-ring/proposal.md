# Proposal

## Why

歌单编辑器的歌名格与分类名输入框聚焦时，叠了三层同心线：`.input:focus` 的蓝描边和 2px 半透明焦点环，外加一段 `outline: 2px solid var(--blue); outline-offset: 1px` 的实色硬环。这既违背设计规范已有的焦点约定（描边转工坊蓝 + `rgba(37, 99, 235, 0.12)` 焦点环、不使用实色 outline），也和右侧属性面板输入框的观感明显不一致——用户的原话是「效果不好看」。

更要紧的是错误格：歌名校验逐字触发，清空格子重打时必然短暂标红，于是「红描边 + 红色外环 + 实线蓝 outline」三种信号同时出现，而这个画面每次改歌名都会出现一次。

## What Changes

- 歌名格与分类名输入框的聚焦样式收回到 `.input:focus` 已有的规范：蓝描边 + `0 0 0 2px rgba(37, 99, 235, 0.12)` 柔和焦点环，移除 `focus-visible` 上的实色 outline。
- 错误格获得焦点时：**保留红色描边与红色错误底色**（错误信号不变），外环切回柔和蓝（焦点信号），不再叠加实色环。即「边框表达错误、外环表达焦点」的双通道约定。
- 分类导航行（无边框按钮，无法靠描边表达焦点）改用规范里为无边框控件预留的 `2px solid rgba(37, 99, 235, 0.25)` 柔和环；删除按钮为 `tabindex="-1"`，键盘不可达，不再单独定义焦点样式。
- 把这条焦点约定写进规格，避免以后再次分叉；设计文档补充「错误 + 聚焦」这一组合态。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `playlist-editing`: 新增「歌名格焦点样式」需求——聚焦态与错误态同时存在时的信号分工、禁止实色 outline、分类导航行的替代焦点环。

## Impact

- `style.css`：`.playlist-editor-input` / `.playlist-editor-name-input` / `.playlist-editor-rail-row` / `.playlist-editor-delete` 的 `:focus-visible` 规则，以及错误格聚焦的外环覆盖。
- `DESIGN.md`：Inputs / Fields 与歌单编辑器无效格条目补充组合态说明。
- 不改动：颜色 token、错误判定的行为与文案、属性面板输入框、其他控件。
- 无行为回归风险：只改视觉层，`is-invalid` 的判定与应用禁用逻辑不动。
