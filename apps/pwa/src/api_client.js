(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root || globalThis);
  } else {
    root.apiClient = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const DEFAULT_API_BASE =
    typeof root.API_BASE !== "undefined" ? root.API_BASE : "http://localhost:18000/api/v1";
  const DEFAULT_TIMEOUT_MS = 10000;

  function getApiBase() {
    return typeof root.API_BASE !== "undefined" ? root.API_BASE : DEFAULT_API_BASE;
  }

  function isFormData(value) {
    const FormDataRef = root.FormData;
    return Boolean(FormDataRef) && value instanceof FormDataRef;
  }

  function normalizeErrorPayload(payload, response) {
    if (payload && typeof payload === "object") {
      if (typeof payload.detail === "string" && payload.detail.trim()) {
        return payload.detail.trim();
      }
      if (typeof payload.error === "string" && payload.error.trim()) {
        return payload.error.trim();
      }
      if (typeof payload.message === "string" && payload.message.trim()) {
        return payload.message.trim();
      }
    }
    if (typeof payload === "string" && payload.trim()) {
      return payload.trim();
    }
    return response?.statusText || `Request failed: ${response?.status || 500}`;
  }

  async function readPayload(response) {
    if (response.status === 204) {
      return null;
    }
    const contentType = response.headers?.get?.("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  async function parseResponse(response) {
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(normalizeErrorPayload(payload, response));
    }
    return payload;
  }

  function buildHeaders(options) {
    const headers = options.headers ? { ...options.headers } : {};
    if (options.body && !isFormData(options.body)) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
    return headers;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const AbortControllerRef = root.AbortController;
    if (!AbortControllerRef || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return root.fetch(url, options);
    }
    const controller = new AbortControllerRef();
    const timer = root.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await root.fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("请求超时");
      }
      throw error;
    } finally {
      root.clearTimeout(timer);
    }
  }

  async function request(path, options = {}, config = {}) {
    const requestOptions = { ...options, headers: buildHeaders(options) };
    if (config.useAuth && typeof config.getToken === "function") {
      const token = await config.getToken();
      if (token) {
        requestOptions.headers.Authorization = `Bearer ${token}`;
      }
    }

    const response = await fetchWithTimeout(
      `${config.apiBase || getApiBase()}${path}`,
      requestOptions,
      config.timeoutMs || DEFAULT_TIMEOUT_MS,
    );

    if (response.status === 401 && config.useAuth && config.retry !== false && typeof config.refreshAuth === "function") {
      await config.refreshAuth();
      return request(path, options, { ...config, retry: false });
    }
    return parseResponse(response);
  }

  async function requestBlob(path, options = {}, config = {}) {
    const requestOptions = { ...options, headers: buildHeaders(options) };
    if (config.useAuth && typeof config.getToken === "function") {
      const token = await config.getToken();
      if (token) {
        requestOptions.headers.Authorization = `Bearer ${token}`;
      }
    }

    const response = await fetchWithTimeout(
      `${config.apiBase || getApiBase()}${path}`,
      requestOptions,
      config.timeoutMs || DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) {
      const payload = await readPayload(response);
      throw new Error(normalizeErrorPayload(payload, response));
    }
    return response.blob();
  }

  return {
    DEFAULT_TIMEOUT_MS,
    getApiBase,
    normalizeErrorPayload,
    parseResponse,
    request,
    requestBlob,
  };
});
