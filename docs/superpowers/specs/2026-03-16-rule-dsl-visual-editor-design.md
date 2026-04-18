# Rule DSL 可视化编辑器前端设计

## 概述
在 PWA 中新增“规则可视化编辑器”，用于构建与预览规则 DSL，并通过后端校验与评估接口提供实时反馈。编辑器保存时只提交 `dsl_json`，由后端统一转换与持久化对应的 `conditions`。

## 目标
- 提供可视化规则构建（AND/OR 组、规则行）。
- 支持 DSL 校验与评估预览。
- 与现有规则集/规则列表整合，能创建与更新规则。
- 在不改动后端业务逻辑的情况下提升可用性与可解释性。

## 非目标
- 不实现复杂表达式或脚本语法（保持当前 DSL 能力）。
- 不做拖拽式画布或图形化连线。
- 不引入大型前端框架（沿用当前 PWA 原生 JS 风格）。

## 用户体验与流程
1. 用户选择规则集与规则。
2. 进入可视化编辑器，默认显示当前规则的 DSL（若无 DSL，则从条件初始化一条规则行）。
3. 用户增删规则行、切换组的 AND/OR。
4. 点击“校验”即调用 `/rules/dsl/validate`。
5. 用户输入一段 `metrics` 示例，点击“评估”调用 `/rules/dsl/evaluate`。
6. 保存时提交 `dsl_json`，后端负责条件转换与校验。

## 页面结构
- 规则集列表（保持现有）
  - 增加 DSL 状态标识：是否含 `dsl_json`。
- 规则编辑器（新）
  - 规则组头：组运算符 AND/OR + 添加规则/子组
  - 规则行：字段、运算符、值、删除
  - DSL 预览区（可折叠）：显示 JSON 文本
  - 校验/评估区：
    - 校验结果（成功/失败 + 错误信息）
    - 评估输入（metrics JSON 文本框）
    - 评估结果（matched true/false）

## 数据结构与状态
- UI 规则树：
```json
{ "op": "and", "rules": [ { "field": "motion_score", "op": "gte", "value": 5 } ] }
```
- 规则行结构：`{ field, op, value }`
- 规则组结构：`{ op: "and"|"or", rules: Array<rule|group> }`

## API 使用
- `GET /api/v1/rules/dsl/meta`：运算符/示例说明
- `GET /api/v1/rules/dsl/fields`：字段字典
- `POST /api/v1/rules/dsl/validate`：校验 DSL，返回条件结构
- `POST /api/v1/rules/dsl/evaluate`：校验并评估，返回 matched
- `POST /api/v1/rules/sets/{setId}/rules` / `PATCH /api/v1/rules/rules/{ruleId}`：提交 `dsl_json`

## 错误处理
- 缺少 `dsl_json` 或 `metrics`：展示接口返回错误。
- DSL 校验失败：突出显示错误原因，不阻塞继续编辑。
- 评估失败：提示 metrics 格式或字段不匹配。
- 保存失败：提示 API 失败 detail。

## 兼容与约束
- 沿用现有 `apps/pwa/src` 的原生 JS 组织方式。
- 不引入新依赖或构建工具。

## 测试策略
- 仅在前端自检：校验与评估按钮是否能正确调用接口并渲染结果。
- 后端功能已具备，前端通过 mock/真实接口验证。
