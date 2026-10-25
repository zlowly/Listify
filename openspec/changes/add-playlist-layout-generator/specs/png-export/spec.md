# Spec Delta

## Purpose

把当前页面按用户指定的像素尺寸导出为 PNG，排除编辑辅助并裁剪到页面边界。

## ADDED Requirements

### Requirement: 当前页导出
系统 SHALL 只导出当前选中的页面；第一版 MUST NOT 导出全部页面或打包多个文件。

#### Scenario: 导出第 2 页
- **WHEN** 用户在第 2 页点击导出
- **THEN** 只生成第 2 页的 PNG，不生成第 1 页

### Requirement: 指定导出尺寸
导出前系统 SHALL 让用户输入宽度和高度；默认值 SHALL 为当前页面尺寸；默认 SHALL 锁定页面宽高比；锁定后修改一边 SHALL 自动更新另一边；解锁后 SHALL 允许分别输入并按输入尺寸拉伸。

#### Scenario: 使用默认尺寸
- **WHEN** 用户直接确认导出
- **THEN** PNG 像素尺寸等于页面尺寸

#### Scenario: 自定义尺寸
- **WHEN** 用户输入 2160×3840 并锁定比例
- **THEN** 导出的 PNG 为 2160×3840

#### Scenario: 解锁比例
- **WHEN** 用户解锁比例并输入不同宽高比
- **THEN** 导出结果按输入尺寸拉伸

### Requirement: 完整内容与裁剪
导出 SHALL 包含当前页的背景和全部内容元素；导出 SHALL 按页面边界裁剪，页面外的元素部分 MUST NOT 出现；导出 SHALL 等待图片和字体加载完成。

#### Scenario: 溢出元素
- **WHEN** 分类块超出页面底边
- **THEN** PNG 只包含页面内的部分

#### Scenario: 背景与文字
- **WHEN** 页面有背景图和自由文字
- **THEN** PNG 同时包含背景图和文字

### Requirement: 排除编辑辅助
导出 MUST NOT 包含页面阴影、边距参考线、分类块/子分区/表格边框、红格警告、选中框、缩放控制点或溢出警告标记。

#### Scenario: 编辑辅助隐藏
- **WHEN** 页面上显示边距线和表格边框
- **THEN** 导出的 PNG 中看不到这些元素

### Requirement: 导出失败处理
图片加载失败、字体加载失败或画布导出失败时，系统 SHALL 显示错误并且 MUST NOT 下载不完整或空白的 PNG。

#### Scenario: 背景图加载失败
- **WHEN** 当前页背景图无法加载
- **THEN** 系统提示导出失败，不产生下载文件

### Requirement: 文件命名
导出的文件 SHALL 使用可识别的名称，包含页码，例如 `歌单_第2页.png`。

#### Scenario: 文件名包含页码
- **WHEN** 用户导出第 3 页
- **THEN** 下载文件名为 `歌单_第3页.png`
