# Spec Delta

## ADDED Requirements

### Requirement: 裁剪导出

完整页面导出 SHALL 按图片的裁剪设置绘制，只输出可见矩形内的像素；被裁掉的部分 MUST NOT 出现在 PNG 中；裁剪后的模糊、调色与渐隐 SHALL 与画布一致；透明歌单层导出 MUST NOT 包含任何图片，因而不受裁剪影响。

#### Scenario: 裁剪区域不导出
- **WHEN** 用户把一张背景图或自由图片裁剪掉一部分后导出完整页面
- **THEN** PNG 中只出现可见区域，被裁掉的边缘不出现

#### Scenario: 裁剪后效果一致
- **WHEN** 已裁剪图片同时设置了模糊与渐隐
- **THEN** PNG 的模糊边缘、渐隐起点与可见区域与画布一致，不出现透明晕或渐变错位

#### Scenario: 歌单层不受影响
- **WHEN** 用户选择仅歌单层导出
- **THEN** PNG 只包含分类块，不包含任何图片或裁剪痕迹
