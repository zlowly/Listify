# font-selection Specification

## Purpose

定义编辑器中的字体选择入口如何通过 Local Font Access API 枚举、搜索和预览本机字体，并把选择结果写回分类名、歌名和自由文字的字体设置；同时明确授权、降级、隐私和持久化边界。

## Requirements

### Requirement: 浏览器能力与降级

选择器 SHALL 检测 `window.queryLocalFonts` 或 `navigator.queryLocalFonts`；两者都不存在时，系统 MUST NOT 调用 API，SHALL 把字体列表降级为可编辑文本行并保留手动添加入口；两者存在时，每个字体行 SHALL 可点击打开选择器。两条路径 MUST 使用相同的字体列表语义和渲染结果。

#### Scenario: 不支持的浏览器

- **WHEN** 用户在 Firefox 或 Safari 中打开编辑器并查看字体设置
- **THEN** 字体行显示为可编辑文本输入，列表底部显示手动添加输入，不显示选择器

#### Scenario: 支持的浏览器

- **WHEN** 支持 Local Font Access 的 Chromium 浏览器打开编辑器
- **THEN** 每个字体行都可以点击打开选择器

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

### Requirement: 拒绝、空结果与异常

授权被拒绝、API 返回空数组或调用抛错时，选择器 SHALL 显示可理解的空状态/错误提示，SHALL 提供重试入口，并 MUST NOT 修改现有字体列表。支持本机字体选择时，提示 SHALL NOT 引导用户手输字体族；不支持时，SHALL 引导用户使用文本输入行。

#### Scenario: 拒绝授权

- **WHEN** 用户在授权提示中选择拒绝
- **THEN** 选择器显示“未获得本机字体访问权限”的说明和重试按钮，字体列表保持原值

#### Scenario: 空列表

- **WHEN** API 成功返回但没有字体族
- **THEN** 选择器显示“没有找到可用字体”的说明，并保留重试入口

#### Scenario: 调用异常

- **WHEN** `queryLocalFonts()` 抛出异常
- **THEN** 选择器显示错误信息，不关闭属性面板，也不修改字体列表

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

样式 SHALL 保存有序的 `fontFamilies` 数组，并同时保存由该数组派生的 `fontFamily` 字符串供渲染和旧版本读取；MUST NOT 再保存 `fontPair`。加载时若存在 `fontFamilies`，系统 SHALL 归一化该数组并据此重新计算 `fontFamily`；若不存在，系统 SHALL 把已保存的 `fontFamily` 拆成列表行，同时保留原 `fontFamily` 渲染，MUST NOT 静默改写旧项目。旧项目中的 `fontPair` SHALL 被忽略，已保存的 `fontFamily` 为准。字体在本机缺失时 SHALL 保留原字符串并按 CSS 回退栈渲染。

#### Scenario: 项目往返

- **WHEN** 用户设置字体列表后保存并重新加载项目
- **THEN** `fontFamilies` 和 `fontFamily` 都被保存，重新加载后的列表顺序与画面一致

#### Scenario: 旧项目加载

- **WHEN** 加载只有 `fontFamily`、没有 `fontFamilies` 的旧项目
- **THEN** 系统把该字体栈拆成列表行，保留原 `fontFamily` 渲染，不要求用户重新选择字体

#### Scenario: 旧项目带 fontPair

- **WHEN** 加载同时含有 `fontPair` 和 `fontFamily` 的旧项目
- **THEN** 系统忽略 `fontPair`，按保存的 `fontFamily` 渲染并生成列表行

#### Scenario: 旧版本读取新项目

- **WHEN** 旧版本应用加载包含 `fontFamilies` 的项目
- **THEN** 旧版本忽略该字段并继续按 `fontFamily` 渲染

#### Scenario: 字体缺失

- **WHEN** 项目在另一台没有该字体的机器上加载
- **THEN** 字体字符串保持不变，浏览器按回退栈渲染，系统不修改项目数据

### Requirement: 渲染与导出一致

画布渲染和 PNG 导出 SHALL 使用当前 `fontFamily` 选择的字体；导出 SHALL 继续等待字体加载完成后再生成图片。

#### Scenario: 导出所选字体

- **WHEN** 用户选择本机字体并导出当前页
- **THEN** PNG 中的文字使用该字体渲染；字体缺少的字形按浏览器回退规则显示

### Requirement: 字体列表入口

分类名子分区、歌名子分区和自由文字三处字体设置 SHALL 提供一个有序字体列表编辑器，不再区分“西文字体”和“中文字体”槽位。列表 SHALL 逐行显示字体族，`sans-serif` 项 SHALL 显示为“系统默认”；列表底部 SHALL 提供“添加字体”。支持本机字体选择时，每行 SHALL 可点击打开选择器；不支持时，每行 SHALL 降级为文本输入。

#### Scenario: 三处入口

- **WHEN** 用户分别选中分类块或自由文字
- **THEN** 分类名、歌名和自由文字的字体设置都显示同一个有序字体列表编辑器

#### Scenario: 新样式默认一项

- **WHEN** 用户新建分类块或自由文字
- **THEN** 字体列表只有一个“系统默认”行，没有“西文 / 中文”槽位标签

#### Scenario: 添加入口

- **WHEN** 用户查看字体列表底部
- **THEN** 可以看到“添加字体”操作

### Requirement: 字体搜索与预览

选择器 SHALL 提供搜索框，按字体族、全名或 PostScript 名进行不区分大小写的匹配；每一行 SHALL 用该字体渲染同时包含中文和拉丁字符的示例。列表顶部 SHALL 始终提供“系统默认”项，且该项 MUST NOT 被搜索过滤。选择“系统默认” SHALL 返回默认项，而不是某个具体字体族。

#### Scenario: 搜索字体族

- **WHEN** 用户输入 `noto`
- **THEN** 列表中只保留族名、全名或 PostScript 名包含 `noto` 的字体族

#### Scenario: 混合预览

- **WHEN** 用户打开选择器
- **THEN** 每一行用该字体渲染同时包含中文和拉丁字符的示例；字体缺少对应字形时按浏览器回退显示

#### Scenario: 系统默认项

- **WHEN** 用户打开选择器或输入搜索关键词
- **THEN** 列表顶部始终显示“系统默认”，不受搜索过滤影响

### Requirement: 字体列表应用

用户选择某个字体族后，系统 SHALL 把它写入当前行的列表位置；通过“添加字体”选择时 SHALL 追加到列表末尾。系统 SHALL 根据完整列表重新计算当前样式的 `fontFamily`，立即重绘画布并重新排版。选择“系统默认” SHALL 清除当前行的具体字体；列表没有具体字体时 SHALL 显示唯一的“系统默认”行。关闭选择器但不选择时 MUST NOT 改变字体。

#### Scenario: 替换某行

- **WHEN** 用户点击字体列表中的第 2 行并选择 `Noto Sans SC`
- **THEN** 第 2 行变为 `Noto Sans SC`，列表顺序不变，画布立即重绘

#### Scenario: 添加字体

- **WHEN** 用户点击“添加字体”并选择 `Inter`
- **THEN** 列表末尾新增 `Inter` 行，画布立即重绘

#### Scenario: 只有系统默认时添加

- **WHEN** 列表只有“系统默认”行，用户点击“添加字体”并选择 `Inter`
- **THEN** 列表变为只有 `Inter` 一行，而不是“系统默认”与 `Inter` 并存

#### Scenario: 选择系统默认

- **WHEN** 用户把某一行替换为“系统默认”，且列表还有其它字体
- **THEN** 该具体字体行被移除，其余行顺序不变

#### Scenario: 重新排版

- **WHEN** 用户选择的字体与原字体宽度不同
- **THEN** 画布上的换行、列宽和分类块高度按新字体重新计算

#### Scenario: 取消

- **WHEN** 用户按 Escape、点击遮罩或关闭按钮退出选择器
- **THEN** 当前字体列表保持不变

### Requirement: 字体列表语义

样式 SHALL 使用有序的 `fontFamilies: string[]` 表示字体选择，数组 MUST 至少包含一项，顺序即 CSS 回退优先级。`sans-serif` SHALL 保留为“系统默认”的唯一标记：只有没有任何具体字体时才出现；存在具体字体时，派生字体栈 SHALL 在末尾隐式追加 `sans-serif`。系统 SHALL 去除空白项并按不区分大小写去重。

#### Scenario: 顺序即回退

- **WHEN** 字体列表依次为 `Inter`、`Noto Sans SC`
- **THEN** 派生字体栈为 `"Inter", "Noto Sans SC", sans-serif`，拉丁字符优先命中 `Inter`，缺字时回退到 `Noto Sans SC`

#### Scenario: 至少一项

- **WHEN** 用户删除字体行直到只剩一项
- **THEN** 系统保留该项，删除操作不可用，列表不会变为空

#### Scenario: 重复字体

- **WHEN** 用户尝试加入与已有行仅大小写不同的字体族
- **THEN** 系统只保留一项，不产生重复行

#### Scenario: 系统默认是标记

- **WHEN** 字体列表只有 `sans-serif`
- **THEN** 派生字体栈为 `sans-serif`，界面显示唯一的“系统默认”行

### Requirement: 字体列表编辑

支持本机字体选择时，用户 SHALL 能点击任意字体行打开选择器并替换该行，SHALL 能通过“添加字体”追加新行，SHALL 能删除任意行；只剩一行时删除 MUST NOT 生效。第一版 MUST NOT 提供列表拖动排序。任意编辑后 SHALL 立即重绘并重新排版。

#### Scenario: 点击行替换

- **WHEN** 用户点击 `Arial` 行并选择 `Georgia`
- **THEN** 该行变为 `Georgia`，行位置和其余行不变

#### Scenario: 追加到末尾

- **WHEN** 用户通过“添加字体”选择 `Inter`
- **THEN** `Inter` 出现在列表末尾，已有字体顺序不变

#### Scenario: 删除行

- **WHEN** 列表有多个字体，用户点击某一行的删除按钮
- **THEN** 该行被移除，其余行顺序不变，画布立即重绘

#### Scenario: 最后一行不可删除

- **WHEN** 列表只剩一行
- **THEN** 该行的删除按钮不可用，点击不会移除字体

#### Scenario: 不支持拖动排序

- **WHEN** 用户尝试拖动字体行改变顺序
- **THEN** 系统不改变列表顺序

### Requirement: 不支持本机字体选择时的降级

浏览器不提供 `window.queryLocalFonts` 或 `navigator.queryLocalFonts` 时，系统 MUST NOT 调用字体枚举 API；字体行 SHALL 降级为可编辑文本输入，列表底部 SHALL 提供手动添加输入。文本行 SHALL 支持修改字体名、删除行和至少保留一项；“系统默认”行 SHALL 可以显示为空值或占位符。降级路径的修改 SHALL 与选择器路径产生相同的列表和渲染结果。

#### Scenario: 文本行编辑

- **WHEN** 用户在 Firefox 或 Safari 中编辑字体行文本
- **THEN** 该行字体立即更新，画布按新列表重绘

#### Scenario: 手动添加

- **WHEN** 用户在底部输入框输入 `Inter` 并确认
- **THEN** 列表末尾新增 `Inter` 行

#### Scenario: 不调用 API

- **WHEN** 浏览器不支持本机字体选择
- **THEN** 系统不调用 `queryLocalFonts()`，也不显示选择器

#### Scenario: 降级删除限制

- **WHEN** 降级文本列表中只剩一行
- **THEN** 删除按钮不可用，列表不会变为空

### Requirement: 默认字体列表

新建项目、新建分类块和新建自由文字的默认字体列表 SHALL 为 `['sans-serif']`，派生 `fontFamily` SHALL 为 `sans-serif`。默认值只用于新建样式和恢复默认；加载旧项目时 MUST NOT 用新默认值覆盖已保存的 `fontFamily`。

#### Scenario: 新建样式

- **WHEN** 用户新建分类块或自由文字
- **THEN** 字体列表只有“系统默认”，`fontFamilies` 为 `['sans-serif']`

#### Scenario: 旧项目不迁移

- **WHEN** 用户加载一个已保存 `fontFamily` 的旧项目
- **THEN** 系统保留原 `fontFamily` 和由它拆出的列表行，不替换为新的默认值

#### Scenario: 恢复默认

- **WHEN** 用户把字体列表中的具体字体全部清除
- **THEN** 列表回到唯一的“系统默认”行，渲染使用 `sans-serif`
