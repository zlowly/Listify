# Proposal

## Why

分类名子分区目前总是参与绘制和布局，用户无法只保留歌名表格。部分用户希望隐藏内置分类名，再用自由文字或图片自行排版同一区域；这需要一个非破坏性的显示开关，而不是删除分类名或另建一种分类块。

## What Changes

- 分类块新增可选字段 `showTitle`（默认 `true`），随项目 JSON 保存和加载。
- 关闭 `showTitle` 时：
  - 不绘制分类名；
  - 分类名的标题行高与标题间距从布局中移除，歌名表格上移（自动填补），分类块高度随内容收缩；
  - `titleStyle` 保留，重新开启后恢复原样。
- 分类块属性面板的“分类名子分区”分组新增“显示分类名”开关。
- 导出 PNG 时，隐藏状态不绘制分类名；隐藏状态本身不改变导出模式或图层语义。
- 不改动自由文字/图片（用户自行摆放替代内容），也不改动“仅歌单层”导出的既有过滤规则。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `category-layout`: 新增“分类名子分区显示开关”需求，规定默认显示、隐藏后的绘制与高度行为、样式保留、导出与持久化。

## Impact

- `js/model.js`：新建分类块时写入 `showTitle: true`。
- `js/layout.js`：`layoutCategory()` 在隐藏时清零标题高度和标题间距。
- `js/render.js`：`drawCategory()` 在隐藏时跳过分类名绘制。
- `js/ui.js`：分类块属性面板新增开关，样式字段保留。
- `js/io.js`：序列化与反序列化 `showTitle`，旧项目缺省为 `true`。
- 项目 JSON 新增可选字段，向后兼容，不升级项目版本号。
