// Resolve the public SDK from the configured API, never from a staging or
// production hostname hardcoded into the shared application bundle.
export const buildCmsScriptTag = (apiUrl, pageOrigin, deliveryUrl = "") => {
  try {
    const api = new URL(String(apiUrl || "/api"), pageOrigin);
    const base = deliveryUrl ? new URL(String(deliveryUrl)) : api;
    if (!/^https?:$/.test(base.protocol) || base.username || base.password) return null;
    if (base.search || base.hash) return null;
    const prefix = deliveryUrl
      ? base.pathname.replace(/\/$/, "")
      : base.pathname.replace(/\/api\/?$/, "").replace(/\/$/, "");
    // A non-standard API path needs an explicit public delivery URL.
    if (!deliveryUrl && !/\/api\/?$/.test(api.pathname)) return null;
    const source = `${base.origin}${prefix}/ad-client.js`;
    const escaped = source.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return `<script src="${escaped}"></script>`;
  } catch {
    return null;
  }
};
