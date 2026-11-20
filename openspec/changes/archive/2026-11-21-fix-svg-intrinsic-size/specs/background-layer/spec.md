# Spec Delta

## ADDED Requirements

### Requirement: SVG 背景图的内在尺寸

背景图片的 fit 计算 SHALL 使用图片的内在尺寸；对无 `width`/`height` 的 SVG，MUST NOT 使用浏览器默认 300×150 替换元素框。`original`、`fill-width`、`fill-height` 与 `cover` 的既有定位规则保持不变，只把原图宽高替换为内在尺寸。

#### Scenario: 原大小定位

- **WHEN** 用户把 `samples/gdj-divider-8799234.svg` 设为背景图并选择 `original`
- **THEN** 图片按 5000×1081.5 的原始尺寸居中显示，而不是 300×65

#### Scenario: 横向占满

- **WHEN** 页面宽 1080，该 SVG 背景选择 `fill-width`
- **THEN** 背景宽度为 1080，高度约为 233.6（1080×1081.5/5000）并垂直居中

#### Scenario: 竖向占满

- **WHEN** 页面高 1920，该 SVG 背景选择 `fill-height`
- **THEN** 背景高度为 1920，宽度约为 8879.3（1920×5000/1081.5）并水平居中

#### Scenario: 最适合

- **WHEN** 页面为 1080×1920，该 SVG 背景选择 `cover`
- **THEN** 按 5000:1081.5 的比例放大到覆盖页面，宽高比与内在尺寸一致

#### Scenario: 内容边界原大小定位

- **WHEN** 用户把一个 `viewBox="0 0 1000 1000"`、实际图形为 100×50 的 SVG 设为背景并选择 `original`
- **THEN** 背景矩形为 100×50 并居中，图形填满矩形，不保留 1000×1000 的空白区域

#### Scenario: 光栅背景不变

- **WHEN** 用户把一张 1200×800 的 PNG 设为背景并选择 `original`
- **THEN** 仍按 1200×800 居中显示，行为与改动前一致
