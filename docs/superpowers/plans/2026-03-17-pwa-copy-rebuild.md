# 外卖防盗监控系统 PWA 文案重建 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `apps/pwa/src/index.html` 与 `apps/pwa/src/app.js` 中的乱码文案，确保中文可读且不改动任何结构/逻辑。

**Architecture:** 不触碰 DOM 结构、`id`、`class` 或前端逻辑，仅替换文本内容并添加一份可复用的“乱码检测”脚本作为验收。

**Tech Stack:** PWA 静态 HTML/CSS/JS，Python 3.x 脚本用于文本校验。

---

## File Map

- Create: `scripts/check_mojibake.py` — 校验指定文件是否包含乱码字符（`�` 或 `锟`）。
- Modify: `apps/pwa/src/index.html` — 重建所有中文文案文本。
- Modify: `apps/pwa/src/app.js` — 修复提示/按钮文案乱码。

---

## Chunk 1: 乱码校验脚本

### Task 1: Add mojibake checker

**Files:**
- Create: `scripts/check_mojibake.py`

- [ ] **Step 1: Write the failing test (script)**

Create `scripts/check_mojibake.py` with the following code:

```python
import sys
from pathlib import Path

BAD_MARKERS = ["\ufffd", "锟"]

def has_mojibake(text: str) -> bool:
    return any(marker in text for marker in BAD_MARKERS)

def main() -> int:
    files = [
        Path("apps/pwa/src/index.html"),
        Path("apps/pwa/src/app.js"),
    ]
    failed = []
    for path in files:
        data = path.read_text(encoding="utf-8", errors="replace")
        if has_mojibake(data):
            failed.append(str(path))
    if failed:
        sys.stderr.write("Mojibake detected in:\\n")
        for item in failed:
            sys.stderr.write(f"- {item}\\n")
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python D:\mine_codex\mycodex3\scripts\check_mojibake.py`  
Expected: exit code 1, and output lists `apps/pwa/src/index.html` (and likely `app.js`).

- [ ] **Step 3: Commit**

```bash
git add scripts/check_mojibake.py
git commit -m "test: add mojibake checker for pwa copy"
```

If no git repository exists, skip commit.

---

## Chunk 2: 重建 index.html 文案

### Task 2: Replace all visible copy in index.html

**Files:**
- Modify: `apps/pwa/src/index.html`

- [ ] **Step 1: Write the failing test**  
Already written in Chunk 1.

- [ ] **Step 2: Run test to verify it fails**

Run: `python D:\mine_codex\mycodex3\scripts\check_mojibake.py`  
Expected: FAIL.

- [ ] **Step 3: Replace copy (apply_patch only)**

Replace all garbled text while keeping all structure/`id`/`class` intact.  
Use the following authoritative copy per section:

**Topbar**
- 品牌名：`外卖防盗监控`
- 说明：`科技艺术 · 高端守护`
- 导航：`概览 / 控制台 / 案例 / 模板 / 动效 / 流程 / 报表 / 规则 / 运维`
- 右侧按钮：`文档`、`启动防护`

**Hero**
- Eyebrow：`智能守护`
- 主标题：`以科技艺术构建外卖取餐防盗的全链路监控`
- 描述：  
  `融合视觉感知、重量监测与订单回调，实时识别异常取餐，自动留存证据并推送告警。`  
  `面向校园、公寓楼与集中配餐点的高端防护平台。`
- CTA：`立即接入` / `演示模式`
- Meta：`系统运行状态：守护中 · 预警响应 180ms`

**Signal card**
- 标题：`实时波形`
- 底部：`延迟 180ms` / `同步正常`

**Metrics**
- `活跃监控` / `今日告警` / `在线设备`

**控制台**
- 标题：`视觉控制台`
- 按钮：`浮动`、`测试模式`、`演示模式`、`暂停`、`折叠`、`拖动`
- 说明：`切换主题、光效与动效密度，实时调整赛博氛围。`
- 主色标题：`主色光谱`
- 说明：`默认高端青蓝，覆盖冷暖赛博光谱。`
- 动效密度：`柔和 / 均衡 / 强化`
- 网格强度：`低噪 / 均衡 / 高能`

**案例展示**
- 标题：`案例展示`
- 右侧按钮：`查看全部`
- 过滤：`全部 / 校园 / 公寓 / 企业 / 深夜`
- 卡片：
  - `智能取餐区联防`  
    `多点位摄像头 + 重量传感联合判断异常取餐，告警时间缩短 43%。`  
    `6 栋公寓 / 24/7 监控`
  - `白名单柔性防护`  
    `室友授权 + 动态取餐码，减少误报 61%，提升安全与体验平衡。`  
    `18 层楼 / 200+ 订单/日`
  - `一键取证闭环`  
    `自动剪辑证据片段并上传云端，支持法务留档与责任追溯。`  
    `3 年存证 / 99.9% 完整率`

**能力要点**
- `实时获取送达状态，自动触发监控与提醒。`
- `动作、重量与 ROI 异常评分智能融合。`
- `推送、录制、云端备份同步完成。`

**场景模板**
- 标题：`场景模板`
- 右侧按钮：`浏览全部`
- 过滤：`全部 / 校园 / 公寓 / 企业 / 深夜 / 数据`
- 卡片：
  - `智能货架联防` / `针对小型外卖柜的轻量部署模板。` / `查看` / `立即启用`
  - `宿舍集群监控` / `多点位摄像头与重量传感联合策略。` / `查看` / `立即启用`
  - `多租户协同` / `白名单授权与取餐码统一管理。` / `查看` / `立即启用`
  - `企业配送点` / `集中式告警与取证闭环。` / `查看` / `立即启用`
  - `深夜监控方案` / `弱光增强与异常触发保护。` / `查看` / `立即启用`
  - `数据中心模板` / `多报表与规则集全量洞察。` / `查看` / `立即启用`

**动效案例**
- 标题：`动效案例`
- 按钮：`打开素材`
- 过滤：`全部 / 告警 / 视觉 / 取证`
- 卡片：
  - `告警路径映射` / `多源事件轨迹描边，实时展示触发链路与抑制节点。` / `6 节点 / 180ms`
  - `视觉守护网格` / `低功耗监控视野动画化，实时标注异常区域。` / `多 ROI / 24/7`
  - `取证轨迹回放` / `自动打点取证片段，回放路径即刻生成。` / `3 片段 / 24h 保留`

**流程**
- 标题：`一体化防护流程`
- 步骤：
  - `订单触发` / `平台回调或手动导入，启动监控与提醒。`
  - `多源感知` / `摄像头、重量与动作评分融合判定。`
  - `规则引擎` / `全局与个人规则并行，精准抑制误报。`
  - `告警取证` / `推送告警、证据录像、云端封存。`

**报表**
- 标题：`报表`
- 清空：`清空`
- 刷新：`刷新`
- 摘要卡标题：`订单 / 告警 / 设备 / 监控会话 / 事件（24h） / 规则命中`
- 导出按钮：`导出摘要 CSV / 导出趋势 CSV / 导出规则命中 CSV`
- 趋势卡标题：`订单 / 告警 / 事件 / 规则命中 / 设备 / 监控会话`
- 图例：`订单 / 告警 / 设备 / 会话 / 事件 / 规则`

**运维**
- 标题：`运维中心`
- 模块：
  - `订单导入`
  - `设备配置`
  - `快速验证`
  - `审计日志`
- 按钮：`导入订单 / 启用推送 / 保存配置 / 刷新设备 / 验证取餐码 / 加载审计`

**规则**
- 标题：`规则引擎`
- 其余区域标题：`订单列表 / 告警 / 告警详情 / 设备 / 规则命中日志`
- 翻页：`上一页 / 下一页`
- 其它按钮与提示按现结构替换为正常中文（语义一致）。

- [ ] **Step 4: Run test to verify it passes**

Run: `python D:\mine_codex\mycodex3\scripts\check_mojibake.py`  
Expected: still FAIL until `app.js` 文案修复完成。

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/index.html
git commit -m "fix: rebuild pwa index copy"
```

If no git repository exists, skip commit.

---

## Chunk 3: 修复 app.js 文案

### Task 3: Replace garbled user-facing strings in app.js

**Files:**
- Modify: `apps/pwa/src/app.js`

- [ ] **Step 1: Write failing test**  
Reuse `scripts/check_mojibake.py`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python D:\mine_codex\mycodex3\scripts\check_mojibake.py`  
Expected: FAIL due to `app.js`.

- [ ] **Step 3: Replace user-facing strings**

Replace any garbled Chinese in `app.js` with clear Chinese copy. Examples to normalize:

```js
throw new Error("登录失败");
```

And UI hints / toast / button labels to:
- `加载中...`
- `操作成功`
- `操作失败，请重试`
- `暂无数据`
- `已复制`
- `未授权` / `权限不足`
- `网络异常，请稍后重试`

Ensure **only user-visible strings** are changed.

- [ ] **Step 4: Run test to verify it passes**

Run: `python D:\mine_codex\mycodex3\scripts\check_mojibake.py`  
Expected: PASS (exit code 0).

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/app.js
git commit -m "fix: normalize pwa app copy"
```

If no git repository exists, skip commit.

---

## Chunk 4: Final verification

### Task 4: Sanity checks

**Files:**
- Verify: `apps/pwa/src/index.html`
- Verify: `apps/pwa/src/app.js`

- [ ] **Step 1: Re-run mojibake checker**

Run: `python D:\mine_codex\mycodex3\scripts\check_mojibake.py`  
Expected: PASS.

- [ ] **Step 2: Optional manual check**

Open `apps/pwa/src/index.html` in browser or via local server and confirm:
- 导航、首屏、模块标题与按钮全部可读中文
- 无 `�` 或 `锟` 字符

---

Plan complete and saved to `docs/superpowers/plans/2026-03-17-pwa-copy-rebuild.md`. Ready to execute?
