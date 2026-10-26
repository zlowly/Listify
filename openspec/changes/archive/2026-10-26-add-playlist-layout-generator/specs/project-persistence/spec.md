# Spec Delta

## Purpose

让用户把歌单、页面、版面和图片资产保存为本地 JSON，并在之后重新加载继续编辑。

## ADDED Requirements

### Requirement: 保存项目
系统 SHALL 把当前项目下载为本地 JSON 文件；文件 MUST 包含版本号、全局页面尺寸、边距、歌单数据、全部页面、内容元素、背景属性和图片资产；图片 SHALL 以 base64 存储。

#### Scenario: 保存后重新打开
- **WHEN** 用户保存项目并关闭页面
- **THEN** 得到的 JSON 包含当前所有页面和歌单数据

#### Scenario: 图片内嵌
- **WHEN** 项目使用背景图和自由图片
- **THEN** JSON 中包含对应图片的 base64 数据，不依赖原始文件路径

### Requirement: 加载项目
系统 SHALL 允许用户选择项目 JSON 并恢复页面、元素、歌单和图片；加载前 SHALL 校验版本和基本结构；校验失败 SHALL 报错并保留当前项目不变。

#### Scenario: 加载有效项目
- **WHEN** 用户选择由本应用保存的 JSON
- **THEN** 页面、版面和歌单恢复，可继续编辑

#### Scenario: 加载损坏 JSON
- **WHEN** 文件不是合法 JSON 或缺少必要字段
- **THEN** 系统报错，当前项目不被替换

### Requirement: 图片资产去重
项目 SHALL 按图片内容标识资产；相同图片字节被多页使用时 MUST 只保存一份；元素和页面 SHALL 通过资产 ID 引用图片；替换图片 SHALL 产生新资产。

#### Scenario: 两页共用一张图
- **WHEN** 第 1 页和第 2 页使用同一张背景图
- **THEN** JSON 中该图片只出现一次

#### Scenario: 换图产生新资产
- **WHEN** 用户在某页把背景换成另一张图
- **THEN** 新图作为新资产保存，原资产仍可被其它页引用

### Requirement: 项目版本
项目 JSON SHALL 包含版本号；系统 SHALL 拒绝加载不支持的版本并给出明确提示。

#### Scenario: 未来版本
- **WHEN** 用户加载版本号高于当前支持范围的项目
- **THEN** 系统提示版本不支持，不尝试部分加载

### Requirement: 往返一致
保存后重新加载 SHALL 保持页面顺序、全局尺寸和边距、元素坐标与尺寸、子分区样式、表格结构、手动列宽、z-order、背景属性和歌单原始顺序；未放置分类 SHALL 也被保留。

#### Scenario: 版面往返
- **WHEN** 用户保存含两个页面和未放置分类的项目后重新加载
- **THEN** 两页版面、层级和未放置分类与保存前一致

#### Scenario: 手动列宽往返
- **WHEN** 项目中的表格使用手动列宽
- **THEN** 加载后列宽仍为保存时的像素比例

### Requirement: 资源缺失处理
项目引用的图片资产缺失或损坏时，系统 SHALL 报错并保留当前项目，不得静默加载为空白图片。

#### Scenario: 资产缺失
- **WHEN** JSON 中某元素引用了不存在的资产 ID
- **THEN** 系统提示项目损坏并停止加载
