# 赛博高能风格升级 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有 DOM/JS 逻辑的前提下，为 PWA 全站统一升级赛博高能视觉与动效，并保持主题切换一致。

**Architecture:** 通过新增少量装饰性 DOM 节点与 CSS 变量体系扩展来实现视觉升级。样式集中在 `styles.css`，结构增量集中在 `index.html`，不修改任何 JS 逻辑。

**Tech Stack:** HTML5, CSS3 (keyframes/gradients/filters), 原生 JS (不改动)

---

## Chunk 1: 结构增量与样式骨架

### Task 1: 新增全局装饰层 DOM

**Files:**
- Modify: `apps/pwa/src/index.html`

- [ ] **Step 1: 添加全局装饰容器**

在 `<body>` 内 `.ambient-lines` 之后、`.app` 之前插入装饰层：

```html
    <div class="cyber-veil" aria-hidden="true">
      <span class="veil glow"></span>
      <span class="veil grid"></span>
      <span class="veil scan"></span>
    </div>
```

- [ ] **Step 2: 添加区块装饰节点（Hero 与主要面板）**

在 `#overview`、`#console`、`#mission`、`#gallery`、`#motion`、`#workflow`、`#reports`、`#ops`、`#rules`、`#orders`、`#alerts`、`#alert-detail`、`#devices`、`#rule-matches` 各 section 开头插入：

```html
          <div class="panel-decor" aria-hidden="true">
            <span class="corner tl"></span>
            <span class="corner tr"></span>
            <span class="corner bl"></span>
            <span class="corner br"></span>
            <span class="scanline"></span>
          </div>
```

### Task 2: 新增主题变量与全局背景层样式

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 扩展 :root 变量**

添加以下变量：

```css
  --accent-glow: 0 0 34px rgba(83, 255, 228, 0.35);
  --accent-2-glow: 0 0 30px rgba(255, 88, 200, 0.3);
  --accent-3-glow: 0 0 26px rgba(164, 255, 106, 0.28);
  --scanline: rgba(120, 180, 255, 0.15);
  --grid-strong: rgba(98, 128, 180, 0.25);
  --neon-border: rgba(83, 255, 228, 0.4);
```

- [ ] **Step 2: 主题色适配**

在每个 `body[data-theme=...]` 中补全对应 `--accent-*-glow` 与 `--neon-border` 的颜色。

- [ ] **Step 3: 新增全局装饰层样式**

```css
.cyber-veil {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  opacity: 0.8;
}

.cyber-veil .veil {
  position: absolute;
  inset: -10%;
  mix-blend-mode: screen;
}

.cyber-veil .veil.glow {
  background: radial-gradient(circle at 20% 20%, var(--accent-soft), transparent 50%),
              radial-gradient(circle at 80% 30%, var(--accent-2-soft), transparent 55%),
              radial-gradient(circle at 40% 80%, var(--accent-3-soft), transparent 60%);
  filter: blur(8px);
  animation: veilDrift 16s ease-in-out infinite;
}

.cyber-veil .veil.grid {
  background-image:
    linear-gradient(var(--grid-strong) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-strong) 1px, transparent 1px);
  background-size: 140px 140px;
  opacity: 0.35;
  animation: gridDrift 18s linear infinite;
}

.cyber-veil .veil.scan {
  background: linear-gradient(120deg, transparent 0%, rgba(120,180,255,0.12) 50%, transparent 100%);
  opacity: 0.35;
  animation: scanSweep 8s linear infinite;
}
```

- [ ] **Step 4: 动画 keyframes**

```css
@keyframes veilDrift {
  0%, 100% { transform: translate3d(0,0,0) scale(1); }
  50% { transform: translate3d(2%, -2%, 0) scale(1.04); }
}

@keyframes gridDrift {
  0% { background-position: 0 0, 0 0; }
  100% { background-position: 140px 140px, 140px 140px; }
}

@keyframes scanSweep {
  0% { transform: translateX(-20%); }
  100% { transform: translateX(20%); }
}
```

---

## Chunk 2: 模块卡片与交互动效增强

### Task 3: 面板与卡片的霓虹描边与能量流

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 面板基础增强**

```css
.panel, .hero, .signal-card, .console-card, .flow-card, .report-card, .rule-card, .alert-card, .device-card {
  position: relative;
  border: 1px solid rgba(83,255,228,0.18);
  box-shadow: var(--shadow), var(--accent-glow);
  background: linear-gradient(160deg, rgba(8,12,24,0.96), rgba(8,12,24,0.85));
}
```

- [ ] **Step 2: 面板装饰层**

```css
.panel-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.panel-decor .corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid var(--neon-border);
  filter: drop-shadow(0 0 6px var(--accent-soft));
}

.panel-decor .corner.tl { top: 12px; left: 12px; border-right: none; border-bottom: none; }
.panel-decor .corner.tr { top: 12px; right: 12px; border-left: none; border-bottom: none; }
.panel-decor .corner.bl { bottom: 12px; left: 12px; border-right: none; border-top: none; }
.panel-decor .corner.br { bottom: 12px; right: 12px; border-left: none; border-top: none; }

.panel-decor .scanline {
  position: absolute;
  left: 6%;
  right: 6%;
  height: 1px;
  top: 18%;
  background: linear-gradient(90deg, transparent, var(--scanline), transparent);
  animation: scanLine 3.6s ease-in-out infinite;
}

@keyframes scanLine {
  0%, 100% { transform: translateY(0); opacity: 0.35; }
  50% { transform: translateY(14px); opacity: 0.85; }
}
```

- [ ] **Step 3: 交互态提升**

```css
.panel:hover, .signal-card:hover, .console-card:hover, .flow-card:hover, .report-card:hover, .rule-card:hover, .alert-card:hover, .device-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow), 0 0 38px rgba(83,255,228,0.45);
}
```

### Task 4: 按钮与标签的能量态

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 主按钮动效**

```css
button.primary {
  position: relative;
  overflow: hidden;
}

button.primary::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent, rgba(255,255,255,0.18), transparent);
  transform: translateX(-120%);
  animation: buttonSweep 2.6s linear infinite;
}

@keyframes buttonSweep {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
}
```

- [ ] **Step 2: 标签与徽标**

对 `.tag`/`.pill`/`.badge` 类（若存在）统一增加半透明霓虹描边与轻微光晕。

---

## Chunk 3: 细节优化与可读性

### Task 5: 信息层级与字体细节

**Files:**
- Modify: `apps/pwa/src/styles.css`

- [ ] **Step 1: 标题与数值强化**

```css
h1, h2, h3 {
  letter-spacing: 0.04em;
  text-shadow: 0 0 14px rgba(83,255,228,0.25);
}

.metric-value, .stat-value, .kpi-value {
  font-family: "IBM Plex Mono", monospace;
  letter-spacing: 0.06em;
}
```

- [ ] **Step 2: 辅助文本与分割线**

提高辅助文本对比度，分割线使用 `--line` + 轻微发光。

---

## Chunk 4: 验证

### Task 6: 手动检查

- [ ] **Step 1: 启动本地静态服务**

Run: `python -m http.server 5178`

- [ ] **Step 2: 打开页面检查**

访问：`http://localhost:5178/apps/pwa/src/index.html`

检查点：
- 全站背景层与装饰层存在，未遮挡内容。
- 主题切换不破坏光效与对比度。
- 卡片 hover 与按钮流光工作正常。

---

Plan complete and saved to `docs/superpowers/plans/2026-03-17-cyber-ui-upgrade-plan.md`. Ready to execute?

Note: 当前工程不是 Git 仓库，未能创建 worktree；已在用户授权下直接在当前工作区执行。
