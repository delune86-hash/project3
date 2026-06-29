const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();

const ALLOWED_SERIES = new Set([
  "FEDFUNDS", "DGS10", "T10Y2Y", "PCEPILFE", "CPIAUCSL", "UNRATE", "PAYEMS",
  "GDPC1", "BAMLH0A0HYM2", "NFCI", "M2SL", "ICSA", "MORTGAGE30US", "DTWEXBGS"
]);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.join(ROOT, ".env"));

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": CONTENT_TYPES[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function requestFred(params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      series_id: params.seriesId,
      api_key: process.env.FRED_API_KEY,
      file_type: "json",
      observation_start: params.observationStart,
      sort_order: "asc"
    });
    const request = https.get(`https://api.stlouisfed.org/fred/series/observations?${query}`, {
      headers: { "User-Agent": "Macro-Lens/1.0" },
      timeout: 15000
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(parsed.error_message || `FRED API 응답 오류 (${response.statusCode})`));
            return;
          }
          resolve(parsed);
        } catch {
          reject(new Error("FRED API가 올바른 JSON을 반환하지 않았습니다."));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("FRED API 요청 시간이 초과되었습니다.")));
    request.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  if (!process.env.FRED_API_KEY) {
    json(res, 503, { error: ".env 파일에 FRED_API_KEY를 입력해 주세요." });
    return;
  }

  const seriesId = (url.searchParams.get("series_id") || "").toUpperCase();
  const observationStart = url.searchParams.get("observation_start") || "2018-01-01";
  if (!ALLOWED_SERIES.has(seriesId)) {
    json(res, 400, { error: "허용되지 않은 FRED 시리즈입니다." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observationStart)) {
    json(res, 400, { error: "observation_start는 YYYY-MM-DD 형식이어야 합니다." });
    return;
  }

  const cacheKey = `${seriesId}:${observationStart}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    json(res, 200, cached.payload);
    return;
  }

  try {
    const payload = await requestFred({ seriesId, observationStart });
    cache.set(cacheKey, { createdAt: Date.now(), payload });
    json(res, 200, payload);
  } catch (error) {
    json(res, 502, { error: error.message || "FRED API 요청에 실패했습니다." });
  }
}

function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(ROOT, requested);
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
    json(res, 403, { error: "접근할 수 없는 경로입니다." });
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      json(res, error.code === "ENOENT" ? 404 : 500, { error: "파일을 불러올 수 없습니다." });
      return;
    }
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (req.method === "GET" && url.pathname === "/api/fred") {
    await handleApi(req, res, url);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    json(res, 405, { error: "허용되지 않은 요청 방식입니다." });
    return;
  }
  serveStatic(res, url.pathname);
});

server.listen(PORT, HOST, () => {
  const keyStatus = process.env.FRED_API_KEY ? "configured" : "missing";
  console.log(`Macro Lens: http://${HOST}:${PORT}`);
  console.log(`FRED_API_KEY: ${keyStatus}`);
});
