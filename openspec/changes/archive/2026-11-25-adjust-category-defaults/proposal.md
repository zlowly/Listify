# Proposal

## Why

新建分类块的初始值偏小：分类名 44px、歌名 28px、表格 3 列。用户拖入第一个分类后通常要立刻放大字号并调整列数，才能得到适合 1080×1920 页面的排版。把这三项默认值调大，可减少重复调整。

## What Changes

- 无继承来源时，新建分类块的分类名字号默认从 44px 改为 64px。
- 无继承来源时，新建分类块的歌名字号默认从 28px 改为 32px。
- 新建分类块的首张表格列数默认从 3 改为 4。
- 上述默认值只影响新建对象：已有分类块、已保存项目、从其他分类块继承的样式、手动新增表格（复制上一表列数）均保持不变。
- 字体、粗细、颜色、行距、对齐、填充顺序、行数等其余默认值不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `category-layout`: 明确新建分类块的默认初始值——分类名字号 64px、歌名字号 32px、首张表格 4 列。

## Impact

- `js/model.js`: `DEFAULT_TITLE_STYLE.fontSize` 改为 64，`DEFAULT_SONG_STYLE.fontSize` 改为 32，`createTable()` 的 `columns` 默认值改为 4。
- `scripts/checks/`: 现有测试以显式样式/列数构造元素，预期无需改动；实施时需确认默认值断言与 `node --test` 通过。
- 不涉及项目格式、版本升级、构建流程或运行时依赖；旧项目加载行为不变。
