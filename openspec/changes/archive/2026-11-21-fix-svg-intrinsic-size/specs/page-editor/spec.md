# Spec Delta

## ADDED Requirements

### Requirement: SVG 自由图片的默认尺寸

自由图片的默认插入几何 SHALL 使用图片的内在尺寸计算；对无 `width`/`height` 的 SVG，MUST NOT 使用浏览器默认 300×150 替换元素框。插入 SHALL 继续遵守按原始比例、长边不超过 480px、最小 40px、位于当前页中心并自动选中。

#### Scenario: 文件选择添加示例 SVG

- **WHEN** 用户通过“添加图片”选择 `samples/gdj-divider-8799234.svg`
- **THEN** 元素约为 480×104，宽高比等于 5000:1081.5，等比锁定开启，位于当前页中心并自动选中

#### Scenario: 粘贴示例 SVG

- **WHEN** 用户把同一 SVG 放入剪贴板并粘贴到画布
- **THEN** 新元素使用与文件选择相同的 480×104 默认几何，而不是 300×65

#### Scenario: 内容只占 viewBox 一角的 SVG

- **WHEN** 用户添加一个 `viewBox="0 0 1000 1000"`、实际图形仅为 100×50 的 SVG
- **THEN** 元素按 100×50 插入，图形填满元素，不保留 1000×1000 的空白区域

#### Scenario: 光栅图片不变

- **WHEN** 用户添加一张 1200×800 的 PNG
- **THEN** 元素仍按 480×320 插入，行为与改动前一致
