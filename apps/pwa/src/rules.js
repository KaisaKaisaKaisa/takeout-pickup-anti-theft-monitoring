const API_BASE = typeof window.API_BASE !== "undefined" ? window.API_BASE : "http://localhost:18000/api/v1";

async function parseApiResponse(res) {
  const contentType = res.headers?.get?.("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const message =
      (payload && typeof payload === "object" && (payload.detail || payload.message)) ||
      (typeof payload === "string" ? payload : "") ||
      `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return payload;
}

async function requestJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  return parseApiResponse(res);
}

function rulesUI(root) {
  if (!root) {
    return;
  }

  const wrapper = document.createElement("section");
  wrapper.className = "panel";
  wrapper.id = "rules-engine";
  wrapper.innerHTML = `
    <div class="panel-head">
      <h2>规则编排中心</h2>
      <span class="hint">管理规则集、可视化 DSL、动作策略与命中日志。</span>
    </div>
    <div class="command-shell command-shell-data rules-command-core">
    <div class="rule-grid rules-command-grid">
      <div class="rule-card">
        <h3>规则集</h3>
        <div class="form-row">
          <label>名称</label>
          <input type="text" id="rule-set-name" placeholder="例如：宿舍门口监控策略" />
        </div>
        <div class="form-row">
          <label>说明</label>
          <input type="text" id="rule-set-desc" placeholder="描述规则集适用场景" />
        </div>
        <label class="inline-check">
          <input type="checkbox" id="rule-set-global" />
          创建为全局规则集
        </label>
        <div class="btn-row">
          <button class="primary" id="create-rule-set">创建规则集</button>
          <button class="ghost" id="refresh-rule-sets">刷新列表</button>
        </div>
        <ul id="rule-sets" class="list list-shell compact"></ul>
      </div>

      <div class="rule-card">
        <h3>当前规则</h3>
        <div class="form-row">
          <label>规则集</label>
          <select id="rule-set-select"></select>
        </div>
        <ul id="rules-list" class="list list-shell"></ul>
      </div>

      <div class="rule-card rule-card-wide rule-card-editor">
        <div class="panel-head compact">
          <div>
            <h3>可视化 DSL 编辑器</h3>
            <div id="rule-editing" class="hint small">创建新规则，或从左侧选择已有规则继续编辑。</div>
          </div>
          <div class="panel-actions command-toolbar">
            <button class="ghost" id="dsl-validate">校验 DSL</button>
            <button class="ghost" id="dsl-evaluate">评估命中</button>
          </div>
        </div>

        <div class="rule-editor-grid">
          <div class="rule-editor-main">
            <div class="form-row">
              <label>规则名称</label>
              <input type="text" id="rule-name" placeholder="例如：高风险异常取餐" />
            </div>

            <div class="form-row">
              <label>事件类型</label>
              <select id="rule-event-type">
                <option value="object_missing">object_missing</option>
                <option value="motion">motion</option>
                <option value="weight_drop">weight_drop</option>
              </select>
            </div>

            <div class="dsl-toolbar command-toolbar">
              <div class="inline-check">
                <span class="meta">根逻辑</span>
                <select id="dsl-root-op">
                  <option value="and">AND</option>
                  <option value="or">OR</option>
                </select>
              </div>
              <div class="btn-row">
                <button class="ghost" id="dsl-add-rule">添加条件</button>
                <button class="ghost" id="dsl-add-group">添加分组</button>
              </div>
            </div>

            <div id="dsl-builder" class="dsl-builder list-shell"></div>

            <label class="inline-check">
              <input type="checkbox" id="rule-enabled" checked />
              启用该规则
            </label>

            <div class="form-row">
              <label>冷却时间（秒）</label>
              <input type="number" id="rule-cooldown" value="120" />
            </div>

            <div class="form-row">
              <label>动作</label>
              <select id="rule-action">
                <option value="alert">触发告警</option>
                <option value="suppress">仅记录不告警</option>
              </select>
            </div>

            <div class="form-row">
              <label>优先级</label>
              <input type="number" id="rule-priority" value="100" />
            </div>

            <div class="btn-row">
              <button class="primary" id="save-rule">保存规则</button>
              <button class="ghost" id="reset-rule">重置编辑器</button>
            </div>

            <div class="hint small">用可视化 DSL 表达多条件逻辑，并用 metrics JSON 快速验证命中结果。</div>
          </div>

          <div class="rule-editor-side">
            <div class="form-row">
              <label>DSL 预览</label>
              <pre id="dsl-preview" class="code list-shell"></pre>
            </div>

            <div class="form-row">
              <label>评估 metrics（JSON）</label>
              <textarea id="dsl-metrics" class="code code-input list-shell" rows="6" placeholder="{&quot;motion_score&quot;: 1200, &quot;weight_delta&quot;: -90}"></textarea>
            </div>

            <div id="dsl-result" class="dsl-status">等待校验...</div>
          </div>
        </div>
      </div>
    </div>
    </div>
  `;

  root.appendChild(wrapper);
}

window.rulesUI = rulesUI;
window.rulesApi = {
  async listSets(token) {
    return requestJson("/rules/sets", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  async createSet(token, payload) {
    return requestJson("/rules/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  },
  async updateSet(token, setId, payload) {
    return requestJson(`/rules/sets/${setId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  },
  async listSetsWithGlobal(token) {
    return requestJson("/rules/sets?include_global=true", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  async listRules(token, setId) {
    return requestJson(`/rules/sets/${setId}/rules`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  async createRule(token, setId, payload) {
    return requestJson(`/rules/sets/${setId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  },
  async updateRule(token, ruleId, payload) {
    return requestJson(`/rules/rules/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  },
  async deleteRule(token, ruleId) {
    return requestJson(`/rules/rules/${ruleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  async getDslMeta(token) {
    return requestJson("/rules/dsl/meta", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  async getDslFields(token) {
    return requestJson("/rules/dsl/fields", {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  async validateDsl(token, payload) {
    return requestJson("/rules/dsl/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  },
  async evaluateDsl(token, payload) {
    return requestJson("/rules/dsl/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  },
};
