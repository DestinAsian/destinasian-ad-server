// Resolve the public SDK from the configured API, never from a staging or
// production hostname hardcoded into the shared application bundle.
export const buildCmsScriptTag = (apiUrl, pageOrigin, deliveryUrl = "") => {
  try {
    const api = new URL(String(apiUrl || "/api"), pageOrigin);
    const base = deliveryUrl ? new URL(String(deliveryUrl)) : api;
    if (!/^https?:$/.test(base.protocol) || base.username || base.password) return null;
    if (base.search || base.hash) return null;
    const relativeApi = !deliveryUrl && !/^https?:\/\//i.test(String(apiUrl || "/api"));
    const prefix = deliveryUrl
      ? base.pathname.replace(/\/$/, "")
      : relativeApi
        ? base.pathname.replace(/\/$/, "")
        : base.pathname.replace(/\/api\/?$/, "").replace(/\/$/, "");
    // A non-standard API path needs an explicit public delivery URL.
    if (!deliveryUrl && !/\/api\/?$/.test(api.pathname)) return null;
    // With a same-origin API proxy the admin root is a frontend SPA. Serve
    // the SDK through the API proxy instead of receiving its index.html.
    const source = `${base.origin}${prefix}/ad-client.js`;
    const escaped = source.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return `<script src="${escaped}"></script>`;
  } catch {
    return null;
  }
};
