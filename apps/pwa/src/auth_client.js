(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root || globalThis);
  } else {
    root.authClient = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const STORAGE_KEY = "tg_token";
  const DEFAULT_API_BASE =
    typeof root.API_BASE !== "undefined" ? root.API_BASE : "http://localhost:18000/api/v1";
  const DEFAULT_DEMO_ACCOUNT = { phone: "demo-user", password: "demo-pass", name: "Demo" };

  function resolveApiClient() {
    return root.apiClient || null;
  }

  function getStorage() {
    return root.localStorage || {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    };
  }

  function getToken(store) {
    return store?.token || null;
  }

  function setToken(store, token) {
    if (store) {
      store.token = token || null;
    }
    if (token) {
      getStorage().setItem(STORAGE_KEY, token);
    } else {
      getStorage().removeItem(STORAGE_KEY);
    }
    return token || null;
  }

  function loadCachedToken(store) {
    if (getToken(store)) {
      return getToken(store);
    }
    const cached = getStorage().getItem(STORAGE_KEY);
    if (cached) {
      if (store) {
        store.token = cached;
      }
      return cached;
    }
    return null;
  }

  async function ensureAuth(config = {}) {
    const store = config.store || null;
    const apiBase = config.apiBase || DEFAULT_API_BASE;
    const demoAccount = config.demoAccount || DEFAULT_DEMO_ACCOUNT;
    const client = config.apiClient || resolveApiClient();

    if (!client || typeof client.request !== "function") {
      throw new Error("api client unavailable");
    }

    const cached = loadCachedToken(store);
    if (cached) {
      return cached;
    }

    const loginPayload = { phone: demoAccount.phone, password: demoAccount.password };
    let data = null;

    try {
      data = await client.request(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify(loginPayload),
        },
        {
          apiBase,
          useAuth: false,
          retry: false,
        },
      );
    } catch (_loginError) {
      try {
        data = await client.request(
          "/auth/register",
          {
            method: "POST",
            body: JSON.stringify(demoAccount),
          },
          {
            apiBase,
            useAuth: false,
            retry: false,
          },
        );
      } catch (_registerError) {
        data = null;
      }
    }

    if (!data || !data.access_token) {
      throw new Error("登录失败");
    }
    return setToken(store, data.access_token);
  }

  function clearAuth(store) {
    return setToken(store, null);
  }

  async function fetchJson(path, options = {}, config = {}) {
    const client = config.apiClient || resolveApiClient();
    if (!client || typeof client.request !== "function") {
      throw new Error("api client unavailable");
    }
    const store = config.store || null;
    const apiBase = config.apiBase || DEFAULT_API_BASE;
    return client.request(path, options, {
      apiBase,
      useAuth: config.useAuth !== false,
      retry: config.retry !== false,
      getToken: async () => getToken(store),
      refreshAuth: async () => {
        clearAuth(store);
        return ensureAuth({ ...config, store, apiBase, apiClient: client });
      },
    });
  }

  async function fetchBlob(path, options = {}, config = {}) {
    const client = config.apiClient || resolveApiClient();
    if (!client || typeof client.requestBlob !== "function") {
      throw new Error("api client unavailable");
    }
    const store = config.store || null;
    const apiBase = config.apiBase || DEFAULT_API_BASE;
    return client.requestBlob(path, options, {
      apiBase,
      useAuth: config.useAuth !== false,
      getToken: async () => getToken(store),
      refreshAuth: async () => {
        clearAuth(store);
        return ensureAuth({ ...config, store, apiBase, apiClient: client });
      },
    });
  }

  async function downloadWithAuth(path, filename, config = {}) {
    const blob = await fetchBlob(path, {}, config);
    const url = root.URL.createObjectURL(blob);
    const link = root.document.createElement("a");
    link.href = url;
    link.download = filename;
    root.document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
  }

  return {
    STORAGE_KEY,
    clearAuth,
    downloadWithAuth,
    ensureAuth,
    fetchBlob,
    fetchJson,
    getToken,
    loadCachedToken,
    setToken,
  };
});
