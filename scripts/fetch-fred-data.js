const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "fred-data.json");
const OBSERVATION_START = "2018-01-01";
const SERIES_IDS = [
  "FEDFUNDS",
  "DGS10",
  "T10Y2Y",
  "PCEPILFE",
  "CPIAUCSL",
  "UNRATE",
  "PAYEMS",
  "GDPC1",
  "BAMLH0A0HYM2",
  "NFCI",
  "M2SL",
  "ICSA",
  "MORTGAGE30US",
  "DTWEXBGS"
];

function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath) || process.env.FRED_API_KEY) return;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function fetchSeries(seriesId, apiKey) {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    observation_start: OBSERVATION_START,
    sort_order: "asc"
  });

  const response = await fetch(`https://api.stlouisfed.org/fred/series/observations?${params}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`${seriesId}: ${payload.error_message || `HTTP ${response.status}`}`);
  }

  return (payload.observations || [])
    .map(item => ({ date: item.date, value: Number(item.value) }))
    .filter(item => Number.isFinite(item.value));
}

async function fetchVooPrices() {
  const start = Math.floor(new Date(`${OBSERVATION_START}T00:00:00Z`).getTime() / 1000);
  const end = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/VOO?period1=${start}&period2=${end}&interval=1d&events=history&includeAdjustedClose=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`VOO: HTTP ${response.status}`);

  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.adjclose?.[0]?.adjclose || result?.indicators?.quote?.[0]?.close || [];

  const rows = timestamps.map((timestamp, index) => {
      const date = new Date(timestamp * 1000);
      return { date: date.toISOString().slice(0, 10), value: Number(closes[index]) };
    })
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.value));

  if (!rows.length) throw new Error("VOO: no price rows returned");
  return rows;
}

async function main() {
  loadLocalEnv();

  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("FRED_API_KEY is missing. Add it to GitHub Actions Secrets or local .env.");
  }

  console.log(`Fetching ${SERIES_IDS.length} FRED series...`);
  const results = await Promise.all(SERIES_IDS.map(async seriesId => [seriesId, await fetchSeries(seriesId, apiKey)]));
  const market = {};

  try {
    console.log("Fetching VOO prices...");
    market.VOO = await fetchVooPrices();
  } catch (error) {
    console.warn(`VOO price fetch failed: ${error.message}`);
    market.VOO = [];
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: "Federal Reserve Bank of St. Louis FRED API + Yahoo Finance daily adjusted prices",
    observationStart: OBSERVATION_START,
    series: Object.fromEntries(results),
    market
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output), "utf8");
  console.log(`Done: ${OUTPUT_PATH} (${Math.round(fs.statSync(OUTPUT_PATH).size / 1024)} KB)`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
