# Spec Delta

## Purpose

定义图片内在尺寸的统一来源，特别是无 `width`/`height` 的 SVG 如何从根标签属性与 `viewBox` 推导、如何裁剪到实际绘制内容边界，确保插入、背景定位、裁剪与属性面板使用一致的原图尺寸。

## ADDED Requirements

### Requirement: SVG 内在尺寸解析

系统 SHALL 从 SVG 根标签解析内在尺寸：绝对 `width` 与 `height` 均有效时使用二者；否则使用 `viewBox` 宽高；仅一个绝对尺寸且存在有效 `viewBox` 时按 `viewBox` 比例推导另一边；均不可用时回退浏览器解码尺寸。绝对长度单位 SHALL 按 CSS 96dpi 换算为像素，百分比与相对单位 MUST NOT 视为绝对尺寸。解析 MUST NOT 修改资产字节。

#### Scenario: 无宽高时使用 viewBox

- **WHEN** 添加的 SVG 没有 `width`/`height`，根标签为 `viewBox="0 0 5000 1081.5"`
- **THEN** 内在尺寸为 5000×1081.5，而不是浏览器默认的 300×65

#### Scenario: 显式宽高优先

- **WHEN** SVG 根标签为 `width="24" height="24" viewBox="0 0 48 48"`
- **THEN** 内在尺寸为 24×24

#### Scenario: 绝对单位换算

- **WHEN** SVG 根标签为 `width="10cm" height="5cm"`
- **THEN** 内在尺寸约为 377.95×188.98 像素（按 96dpi 换算）

#### Scenario: 百分比回退 viewBox

- **WHEN** SVG 根标签为 `width="100%" height="100%" viewBox="0 0 640 480"`
- **THEN** 百分比不作为绝对尺寸，内在尺寸回退为 640×480

#### Scenario: 单边绝对尺寸推导

- **WHEN** SVG 根标签为 `width="300" viewBox="0 0 640 480"`
- **THEN** 内在宽度为 300，高度按比例推导为 225

#### Scenario: 无可用尺寸信息

- **WHEN** SVG 既没有绝对 `width`/`height`，也没有有效 `viewBox`
- **THEN** 系统使用浏览器解码得到的尺寸作为内在尺寸

### Requirement: SVG 内容边界

当 SVG 的实际绘制内容没有铺满 `viewBox` 时，系统 SHALL 使用 SVG DOM 的 `getBBox()` 取得内容边界，并按最大 `stroke-width` 外扩，再夹取到 `viewBox` 内。内容宽高均达到 `viewBox` 的 99% 时 MUST 保持 `viewBox` 尺寸，避免浮点误差改变已有结果；`getBBox()` 不可用或解析失败时 MUST 回退内在尺寸。内容边界 SHALL 作为逻辑原图尺寸参与插入、背景 fit、裁剪与属性面板。

裁剪后的内容 SHALL 在解码阶段烘焙成位图取样源，并按 `preserveAspectRatio` 把 `viewBox` 映射到实际像素；位图最多放大 4 倍，长边不超过 4096px，总像素不超过 8M。绘制与裁剪 SHALL 使用该取样源，MUST NOT 把逻辑内容坐标直接当作 SVG `<img>` 的像素取样框。

#### Scenario: 内容只占 viewBox 一角

- **WHEN** SVG 的 `viewBox="0 0 1000 1000"`，唯一图形为 `rect x="10" y="20" width="100" height="50"`
- **THEN** 逻辑原图尺寸为 100×50，插入元素为 100×50 而不是 1000×1000，且图形填满元素、没有大面积空白

#### Scenario: 描边计入内容边界

- **WHEN** SVG 的几何边界为 100×50，描边宽度为 20
- **THEN** 内容边界向外扩展 10，逻辑原图尺寸为 120×70

#### Scenario: 内容接近铺满时不裁剪

- **WHEN** SVG 的绘制内容覆盖 `viewBox` 宽高的 99% 以上
- **THEN** 逻辑原图尺寸仍为 `viewBox` 尺寸，示例 SVG 保持 5000×1081.5

#### Scenario: 无 DOM 时回退

- **WHEN** 运行环境没有 `DOMParser` 或 `document.body`，无法计算 `getBBox()`
- **THEN** 系统使用内在尺寸，不因内容边界计算失败而阻止图片加载

#### Scenario: 内容边界背景定位

- **WHEN** 上述 100×50 内容的 SVG 作为背景并选择 `original`
- **THEN** 背景矩形为 100×50 并居中，而不是 1000×1000

#### Scenario: 内容边界裁剪

- **WHEN** 用户选中上述 100×50 内容的 SVG 并把左边裁剪设为 10
- **THEN** 可见区域为 90×50，裁剪上限按 100 宽计算，而不是按 1000 宽计算

### Requirement: 内在尺寸的一致使用

所有需要原图宽高的功能 SHALL 使用同一内在尺寸（存在内容边界时为内容边界）：自由图片默认插入、背景图片 fit 矩形、裁剪边界与摘要、属性面板显示、项目导入与草稿恢复。光栅图片 SHALL 继续使用其解码宽高。

#### Scenario: 插入示例 SVG

- **WHEN** 用户通过文件选择添加 `samples/gdj-divider-8799234.svg`
- **THEN** 图片按 5000:1081.5 的比例插入，长边收敛到 480px，元素约为 480×104 并位于当前页中心

#### Scenario: 背景原大小

- **WHEN** 用户把该 SVG 作为背景图并选择 `original`
- **THEN** 背景矩形为 5000×1081.5 并按页面中心定位

#### Scenario: 裁剪摘要

- **WHEN** 用户选中该 SVG 并查看裁剪属性
- **THEN** 原图尺寸显示为 5000×1081.5，裁剪边界按该尺寸计算

#### Scenario: 项目与草稿恢复

- **WHEN** 用户导出项目后重新导入，或刷新后从草稿恢复
- **THEN** 该 SVG 的插入几何、背景矩形与裁剪边界仍按 5000×1081.5 计算
