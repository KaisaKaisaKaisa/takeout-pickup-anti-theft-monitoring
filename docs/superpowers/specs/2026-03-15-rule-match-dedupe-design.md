# 规则命中去重索引与筛选一致性设计

## 目标

提升规则命中列表的实时一致性与性能：避免重复插入、保持筛选条件一致、在增量更新与全量刷新间保持索引同步。

## 范围

- 前端规则命中列表的去重索引
- 筛选条件变更的增量插入一致性
- 兜底刷新策略与最小化测试

## 设计要点

### 1) 去重索引

- 维护 `ruleMatchIndex: Map<id, node>`
- 全量渲染后重建索引：
  - `renderRuleMatches(rows)` 执行完成后调用 `rebuildRuleMatchIndex(listEl)`
- 增量插入：
  - 若 `id` 已存在，替换节点并更新索引
  - 若不存在，插入节点并写入索引
- 与容量裁剪联动：
  - 裁剪移除节点时同步从索引删除

### 2) 筛选一致性

- 计算 `filterSignature`：
  - `event_type / range / include_suppressed / search`
- 筛选条件变更时：
  - 触发 `loadRuleMatches(1)` 全量刷新
  - 重建索引
- WS 增量插入：
  - 仅当 `filterSignature` 未变化且 `shouldInsertRuleMatch` 返回 true 才插入
  - 若签名已变化，标记 `needsFullReload`，走一次轻量刷新

### 3) 兜底策略

- WS payload 缺少 `id` 时直接触发 `loadRuleMatches(1)`（避免错乱）
- 失败或异常按现有 `loadRuleMatches` 兜底

## 测试策略（Node 纯 JS）

- `rebuildRuleMatchIndex` 能正确建立/清理索引
- `filterSignature` 变更时增量插入被阻止
- 裁剪后索引一致（被裁剪项不在索引中）

## 兼容性

- 不改变后端 API
- 复用现有 `shouldInsertRuleMatch`
