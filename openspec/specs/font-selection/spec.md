# font-selection Specification

## Purpose

定义编辑器中的字体选择入口如何通过 Local Font Access API 枚举、搜索和预览本机字体，并把选择结果写回分类名、歌名和自由文字的字体设置；同时明确授权、降级、隐私和持久化边界。

## Requirements

### Requirement: 字体选择入口

分类名子分区、歌名子分区和自由文字三处字体设置 SHALL 在保留字体族输入框的同时提供“选择”按钮；点击按钮 SHALL 打开本机字体选择器；用户仍 SHALL 能直接编辑输入框。

#### Scenario: 三处入口

- **WHEN** 用户分别选中分类块或自由文字
- **THEN** 分类名、歌名和自由文字的字体设置旁都出现“选择”按钮

#### Scenario: 保留手输

- **WHEN** 用户在字体族输入框中输入自定义字体栈
- **THEN** 输入值被接受，画布按该栈渲染，不要求使用选择器

### Requirement: 浏览器能力与降级

选择器 SHALL 检测 `window.queryLocalFonts` 或 `navigator.queryLocalFonts`；两者都不存在时，系统 MUST NOT 调用 API，SHALL 禁用或隐藏选择器，并 SHALL 保留手输输入框和说明。

#### Scenario: 不支持的浏览器

- **WHEN** 用户在 Firefox 或 Safari 中打开编辑器并查看字体设置
- **THEN** 不出现可用的“选择”按钮，或按钮显示不可用，字体族输入框仍可编辑

#### Scenario: 支持的浏览器

- **WHEN** 支持 Local Font Access 的 Chromium 浏览器打开编辑器
- **THEN** “选择”按钮可用

### Requirement: 点击后授权与枚举

字体枚举 MUST 只在用户点击“选择”或“重新获取”后发起；页面加载、打开属性面板或打开选择器但未点击时 MUST NOT 调用枚举 API。首次调用 SHALL 触发浏览器的本机字体访问授权；调用进行中 SHALL 显示加载状态。

#### Scenario: 首次点击

- **WHEN** 用户首次点击“选择”
- **THEN** 浏览器显示本机字体访问授权提示，选择器显示加载状态

#### Scenario: 不自动枚举

- **WHEN** 用户打开编辑器或属性面板但没有点击字体选择按钮
- **THEN** 系统不调用 `queryLocalFonts()`，也不显示字体列表

#### Scenario: 加载中

- **WHEN** `queryLocalFonts()` 尚未完成
- **THEN** 选择器显示加载提示，并禁止重复发起同一请求

### Requirement: 字体族列表

列表 SHALL 以字体族为粒度，每个族只出现一次；同一族的 Regular、Bold、Italic 等字面 MUST NOT 作为独立选项；列表 SHALL 按用户语言的字母顺序排序，并对数字段使用自然排序。

#### Scenario: 同族多字面

- **WHEN** 本机字体数据中同一族有 Regular、Bold 和 Italic 多个字面
- **THEN** 列表中该族只出现一行

#### Scenario: 排序

- **WHEN** 字体族包含 `Noto Sans 2`、`Noto Sans 10` 和 `Adwaita Sans`
- **THEN** 列表按自然顺序排列，数字 2 排在 10 前面

### Requirement: 搜索与预览

选择器 SHALL 提供搜索框，按字体族、全名或 PostScript 名进行不区分大小写的匹配；每一行 SHALL 用该字体渲染包含中文和拉丁字符的示例；列表顶部 SHALL 提供“系统默认”项。

#### Scenario: 搜索字体族

- **WHEN** 用户输入 `noto`
- **THEN** 列表中只保留族名、全名或 PostScript 名包含 `noto` 的字体族

#### Scenario: 预览中英文

- **WHEN** 字体列表显示某字体族
- **THEN** 该行用该字体渲染包含中文字符和拉丁字符的示例，用户可据此判断字形覆盖

#### Scenario: 系统默认项

- **WHEN** 用户打开选择器
- **THEN** 列表顶部始终显示“系统默认”，不受搜索过滤影响

### Requirement: 应用字体选择

用户选择某个字体族后，系统 SHALL 把该族名用双引号包裹并追加 `, sans-serif` 写入当前字体设置的 `fontFamily`；系统 SHALL 同步更新输入框、立即重绘画布并重新排版；选择“系统默认” SHALL 恢复项目默认字体栈。关闭选择器但不选择时 MUST NOT 改变字体。

#### Scenario: 选择字体

- **WHEN** 用户选择 `Adwaita Mono`
- **THEN** 当前字体设置的 `fontFamily` 变为 `"Adwaita Mono", sans-serif`，输入框同步显示该值，画布立即重绘

#### Scenario: 重新排版

- **WHEN** 用户选择的字体与原字体宽度不同
- **THEN** 画布上的换行、列宽和分类块高度按新字体重新计算

#### Scenario: 恢复默认

- **WHEN** 用户选择“系统默认”
- **THEN** 当前字体设置恢复为项目的默认字体栈

#### Scenario: 取消

- **WHEN** 用户按 Escape、点击遮罩或关闭按钮退出选择器
- **THEN** 当前字体设置保持不变

### Requirement: 拒绝、空结果与异常

授权被拒绝、API 返回空数组或调用抛错时，选择器 SHALL 显示可理解的空状态/错误提示，SHALL 提供重试入口，并 SHALL 提示用户可以继续手输字体族；这些情况 MUST NOT 导致页面崩溃或清空现有字体设置。

#### Scenario: 拒绝授权

- **WHEN** 用户在授权提示中选择拒绝
- **THEN** 选择器显示“未获得本机字体访问权限”的说明和重试按钮，字体设置保持原值

#### Scenario: 空列表

- **WHEN** API 成功返回但没有字体族
- **THEN** 选择器显示“没有找到可用字体”的说明，并保留手输入口

#### Scenario: 调用异常

- **WHEN** `queryLocalFonts()` 抛出异常
- **THEN** 选择器显示错误信息，不关闭属性面板，也不修改字体设置

### Requirement: 会话缓存与重新获取

一次成功枚举后，字体族列表 SHALL 在当前页面会话内缓存，再次打开选择器 SHALL 直接使用缓存而不重新请求；用户点击“重新获取” SHALL 再次调用 API 并替换缓存。缓存 MUST NOT 写入 localStorage 或项目文件。

#### Scenario: 再次打开

- **WHEN** 用户成功加载字体列表后关闭并再次打开选择器
- **THEN** 列表立即显示，不再次触发授权提示

#### Scenario: 重新获取

- **WHEN** 用户点击“重新获取”
- **THEN** 系统再次调用 `queryLocalFonts()`，完成后用新列表替换旧列表

### Requirement: 隐私与离线

选择器 MUST NOT 读取 `FontData.blob()` 的字体文件内容，MUST NOT 上传字体数据，MUST NOT 请求网络资源，MUST NOT 写入 localStorage；字体列表 SHALL 仅保存在内存中。无网络时选择器 SHALL 仍能工作。

#### Scenario: 离线使用

- **WHEN** 设备断网后用户打开选择器并授权
- **THEN** 本机字体列表仍能加载和选择

#### Scenario: 不读取字体文件

- **WHEN** 用户浏览和选择字体
- **THEN** 系统只使用字体元数据，不调用 `blob()` 读取字体文件

### Requirement: 持久化与跨机器回退

字体选择结果 SHALL 继续以 `fontFamily` 字符串保存到项目 JSON；保存和加载格式 MUST NOT 改变；加载的项目中字体在本机不存在时，系统 SHALL 保留原字符串并按 CSS 回退栈渲染，MUST NOT 静默替换为用户选择的其它字体。

#### Scenario: 项目往返

- **WHEN** 用户选择本机字体后保存项目并重新加载
- **THEN** 字体设置仍为选择时写入的字符串，画布使用相同字体渲染

#### Scenario: 字体缺失

- **WHEN** 项目在另一台没有该字体的机器上加载
- **THEN** 字体字符串保持不变，浏览器按回退栈渲染，系统不修改项目数据

### Requirement: 渲染与导出一致

画布渲染和 PNG 导出 SHALL 使用当前 `fontFamily` 选择的字体；导出 SHALL 继续等待字体加载完成后再生成图片。

#### Scenario: 导出所选字体

- **WHEN** 用户选择本机字体并导出当前页
- **THEN** PNG 中的文字使用该字体渲染；字体缺少的字形按浏览器回退规则显示
