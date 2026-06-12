const BASE = "/api";

async function _request(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  getConfig:      ()         => _request("GET",  "/config"),
  updateConfig:   (body)     => _request("POST", "/config", body),
  getStatus:      ()         => _request("GET",  "/status"),
  listDownloads:  ()                         => _request("GET",    "/download/list"),
  deleteDownload: (ticker, timeframe)        => _request("DELETE", `/download/list/${ticker}/${timeframe}`),
  startDownload:  (body)                     => _request("POST",   "/download", body),
  downloadStatus: ()         => _request("GET",  "/download/status"),
  startTrain:     (body)     => _request("POST", "/train", body),
  stopTrain:      ()         => _request("POST", "/train/stop"),
  trainStatus:    ()         => _request("GET",  "/train/status"),
  trainPreview:   ()         => _request("GET",  "/train/data-preview"),
  startInfer:     (body)     => _request("POST", "/infer", body),
  stopInfer:      ()         => _request("POST", "/infer/stop"),
  inferResults:   ()         => _request("GET",  "/infer/results"),
  startCluster:   ()         => _request("POST", "/cluster"),
  clusterResult:  ()         => _request("GET",  "/cluster"),
  clusterQuality: ()         => _request("GET",  "/cluster/quality"),
  getWindows:     (n = 2000) => _request("GET",  `/windows?n=${n}`),
  reconstruct:    (n = 500)  => _request("POST", "/reconstruct", { n }),
  getTemporal:    ()         => _request("GET",  "/temporal"),
  listModels:     ()         => _request("GET",    "/models"),
  getActiveModel: ()         => _request("GET",    "/models/active"),
  activateModel:  (name)     => _request("POST",   `/models/${encodeURIComponent(name)}/activate`),
  deleteModel:    (name)     => _request("DELETE",  `/models/${encodeURIComponent(name)}`),
};
