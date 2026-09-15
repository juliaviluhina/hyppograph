// network-guard — makes an outbound connection attempt an ACTIVE failure, not merely absent
// (FR-006, T021: "the no-network assertion MUST be an active failure condition"). Patches
// `globalThis.fetch` and `http(s).request`/`.get` for the duration of a guarded run; any call
// throws immediately and is recorded with the URL that reached out.

import http from "node:http";
import https from "node:https";

export function installNetworkGuard() {
  const calls = [];
  const originals = {
    fetch: globalThis.fetch,
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
  };

  function blocked(label, url) {
    const target = typeof url === "string" ? url : url?.href ?? url?.url ?? JSON.stringify(url);
    calls.push(target);
    throw new Error(`network-guard: outbound ${label} blocked during a hermetic run — ${target}`);
  }

  globalThis.fetch = (url, ...rest) => blocked("fetch", url);
  http.request = (url, ...rest) => blocked("http.request", url);
  http.get = (url, ...rest) => blocked("http.get", url);
  https.request = (url, ...rest) => blocked("https.request", url);
  https.get = (url, ...rest) => blocked("https.get", url);

  return {
    calls,
    restore() {
      globalThis.fetch = originals.fetch;
      http.request = originals.httpRequest;
      http.get = originals.httpGet;
      https.request = originals.httpsRequest;
      https.get = originals.httpsGet;
    },
  };
}
