# Spec Delta

## ADDED Requirements

### Requirement: 页面级删除入口

页面属性检查栏 MUST NOT 提供分类块删除动作；分类块删除入口 SHALL 只在选中分类块时出现在该对象的属性分组中。

#### Scenario: 选中页面
- **WHEN** 用户点击画布空白处或按 Escape 使页面成为当前选择
- **THEN** 页面属性面板不出现「删除分类块」按钮或任何禁用的删除占位控件

#### Scenario: 选中分类块
- **WHEN** 用户选中一个分类块
- **THEN** 该分类块属性面板仍显示可用的删除入口
