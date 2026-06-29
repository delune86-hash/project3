const SERIES = [
  { id: "FEDFUNDS", title: "미국 기준금리", category: "rates", unit: "%", freq: "월간", transform: "raw", caption: "Effective Federal Funds Rate", decimals: 2 },
  { id: "DGS10", title: "미국 10년물 금리", category: "rates", unit: "%", freq: "일간", transform: "raw", caption: "10-Year Treasury Yield", decimals: 2 },
  { id: "T10Y2Y", title: "장단기 금리차", category: "rates", unit: "%p", freq: "일간", transform: "raw", caption: "10Y − 2Y Treasury Spread", decimals: 2 },
  { id: "PCEPILFE", title: "근원 PCE 물가", category: "inflation", unit: "%", freq: "월간", transform: "yoy", caption: "Core PCE · 전년 대비", decimals: 1 },
  { id: "CPIAUCSL", title: "소비자물가 CPI", category: "inflation", unit: "%", freq: "월간", transform: "yoy", caption: "Headline CPI · 전년 대비", decimals: 1 },
  { id: "UNRATE", title: "실업률", category: "growth", unit: "%", freq: "월간", transform: "raw", caption: "U.S. Unemployment Rate", decimals: 1 },
  { id: "PAYEMS", title: "비농업 고용", category: "growth", unit: "K", freq: "월간", transform: "diff", caption: "월간 신규 고용", decimals: 0 },
  { id: "GDPC1", title: "실질 GDP 성장률", category: "growth", unit: "%", freq: "분기", transform: "qoqAnnual", caption: "전분기 대비 연율", decimals: 1 },
  { id: "BAMLH0A0HYM2", title: "하이일드 스프레드", category: "liquidity", unit: "%p", freq: "일간", transform: "raw", caption: "미국 투기등급 신용위험", decimals: 2 },
  { id: "NFCI", title: "금융여건지수", category: "liquidity", unit: "", freq: "주간", transform: "raw", caption: "0 이상이면 평균보다 긴축", decimals: 2 },
  { id: "M2SL", title: "M2 통화량", category: "liquidity", unit: "%", freq: "월간", transform: "yoy", caption: "광의통화 · 전년 대비", decimals: 1 },
  { id: "ICSA", title: "신규 실업수당", category: "growth", unit: "K", freq: "주간", transform: "thousands", caption: "Initial Jobless Claims", decimals: 0 },
  { id: "MORTGAGE30US", title: "30년 모기지 금리", category: "rates", unit: "%", freq: "주간", transform: "raw", caption: "30-Year Fixed Mortgage", decimals: 2 },
  { id: "DTWEXBGS", title: "달러 지수", category: "liquidity", unit: "", freq: "일간", transform: "raw", caption: "Broad U.S. Dollar Index", decimals: 1 }
];

const FALLBACK = {
  FEDFUNDS: 4.15, DGS10: 4.32, T10Y2Y: .42, PCEPILFE: 2.8, CPIAUCSL: 2.6, UNRATE: 4.2,
  PAYEMS: 139, GDPC1: 2.4, BAMLH0A0HYM2: 3.12, NFCI: -.48, M2SL: 4.1, ICSA: 236,
  MORTGAGE30US: 6.81, DTWEXBGS: 119.4
};

const CORRELATION_IDS = ["FEDFUNDS", "DGS10", "PCEPILFE", "UNRATE", "PAYEMS", "GDPC1", "BAMLH0A0HYM2", "NFCI"];
const SHORT_LABELS = {
  FEDFUNDS: "기준금리", DGS10: "10년물", PCEPILFE: "근원 PCE", UNRATE: "실업률",
  PAYEMS: "비농업 고용", GDPC1: "실질 GDP", BAMLH0A0HYM2: "하이일드", NFCI: "금융여건"
};

let state = { data: {}, selected: "FEDFUNDS", filter: "all", range: 36, live: false, correlationPair: ["PCEPILFE", "DGS10"] };

function pseudoHistory(series, length = 72) {
  const end = FALLBACK[series.id];
  const seed = [...series.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const amplitude = Math.max(Math.abs(end) * .25, series.id === "PAYEMS" ? 90 : .5);
  const now = new Date();
  return Array.from({ length }, (_, i) => {
    const wave = Math.sin((i + seed) * .22) * amplitude * .28;
    const trend = (i / (length - 1) - 1) * amplitude * .55;
    const value = i === length - 1 ? end : end + wave + trend;
    const date = new Date(now); date.setMonth(now.getMonth() - (length - 1 - i));
    return { date, value };
  });
}

function transformData(rows, type) {
  if (type === "raw") return rows;
  if (type === "thousands") return rows.map(d => ({ ...d, value: d.value / 1000 }));
  if (type === "diff") return rows.slice(1).map((d, i) => ({ ...d, value: d.value - rows[i].value }));
  if (type === "yoy") return rows.slice(12).map((d, i) => ({ ...d, value: (d.value / rows[i].value - 1) * 100 }));
  if (type === "qoqAnnual") return rows.slice(1).map((d, i) => ({ ...d, value: (Math.pow(d.value / rows[i].value, 4) - 1) * 100 }));
  return rows;
}

async function loadSeries(series) {
  const url = `/api/fred?series_id=${encodeURIComponent(series.id)}&observation_start=2018-01-01`;
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `${series.id}: ${response.status}`);
  const observations = Array.isArray(payload.observations) ? payload.observations : [];
  const rawRows = observations.map(item => ({
    date: new Date(`${item.date}T00:00:00`),
    value: Number(item.value)
  })).filter(item => Number.isFinite(item.value));
  const rows = transformData(rawRows, series.transform);
  if (!rows.length) throw new Error(`${series.id}: empty`);
  return rows;
}

async function loadAll() {
  const button = document.querySelector("#refreshButton");
  button.classList.add("loading");
  document.querySelector("#dataStatus").textContent = "FRED 데이터 동기화 중";
  const results = await Promise.allSettled(SERIES.map(loadSeries));
  let liveCount = 0;
  SERIES.forEach((series, i) => {
    if (results[i].status === "fulfilled") { state.data[series.id] = results[i].value; liveCount++; }
    else state.data[series.id] = pseudoHistory(series);
  });
  state.live = liveCount > SERIES.length / 2;
  const now = new Date();
  document.querySelector("#lastSync").textContent = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(now);
  document.querySelector("#dataStatus").textContent = state.live ? `${liveCount}/${SERIES.length}개 지표 실시간 연결` : "오프라인 샘플 데이터 표시 중";
  button.classList.remove("loading");
  render();
}

function latest(series) { const rows = state.data[series.id] || pseudoHistory(series); return rows[rows.length - 1]; }
function previous(series) { const rows = state.data[series.id] || pseudoHistory(series); return rows[Math.max(0, rows.length - 2)]; }
function fmt(series, value) {
  const sign = series.id === "NFCI" && value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("ko-KR", { minimumFractionDigits: series.decimals, maximumFractionDigits: series.decimals })}${series.unit ? `<small>${series.unit}</small>` : ""}`;
}
function changeInfo(series) {
  const current = latest(series).value, prior = previous(series).value, diff = current - prior;
  const inverse = ["UNRATE", "BAMLH0A0HYM2", "NFCI", "ICSA", "PCEPILFE", "CPIAUCSL"].includes(series.id);
  const good = inverse ? diff <= 0 : diff >= 0;
  return { diff, className: Math.abs(diff) < .005 ? "neutral" : good ? "positive" : "negative", arrow: diff >= 0 ? "↑" : "↓" };
}

function pointsFor(rows, width, height, pad = 2) {
  const values = rows.map(d => d.value); let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  return rows.map((d, i) => ({ x: pad + i / Math.max(1, rows.length - 1) * (width - pad * 2), y: pad + (max - d.value) / (max - min) * (height - pad * 2), ...d }));
}
function sparkline(rows) {
  const points = pointsFor(rows.slice(-28), 180, 42, 1); const path = points.map(p => `${p.x},${p.y}`).join(" ");
  const area = `M ${points[0].x} 42 L ${path.replaceAll(" ", " L ")} L ${points.at(-1).x} 42 Z`;
  return `<svg viewBox="0 0 180 42" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#74a78d"/><stop offset="1" stop-color="#74a78d" stop-opacity="0"/></linearGradient></defs><path class="area" d="${area}"/><polyline class="line" points="${path}"/></svg>`;
}

function renderCards() {
  const items = SERIES.filter(s => state.filter === "all" || s.category === state.filter);
  document.querySelector("#indicatorGrid").innerHTML = items.map(series => {
    const row = latest(series), ch = changeInfo(series), data = state.data[series.id] || pseudoHistory(series);
    const date = new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(row.date);
    return `<article class="indicator-card ${series.id === state.selected ? "selected" : ""}" data-series="${series.id}" tabindex="0" role="button" aria-label="${series.title} 상세 차트 보기">
      <div class="card-top"><small>${series.id}</small><span>${series.freq}</span></div>
      <h3>${series.title}</h3><span class="caption">${series.caption}</span>
      <div class="card-value"><strong>${fmt(series, row.value)}</strong><span class="${ch.className}">${ch.arrow} ${Math.abs(ch.diff).toFixed(series.decimals)}</span></div>
      <div class="sparkline">${sparkline(data)}</div><div class="card-bottom"><span>최근 관측값</span><span>${date}</span></div>
    </article>`;
  }).join("") || `<div class="empty-state">표시할 지표가 없습니다.</div>`;
  document.querySelectorAll(".indicator-card").forEach(card => {
    const select = () => { state.selected = card.dataset.series; renderCards(); renderDetail(); document.querySelector(".detail-layout").scrollIntoView({ behavior: "smooth", block: "center" }); };
    card.addEventListener("click", select); card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") select(); });
  });
}

function renderDetail() {
  const series = SERIES.find(s => s.id === state.selected), all = state.data[series.id] || pseudoHistory(series);
  const rows = state.range === "max" ? all : all.slice(-Number(state.range));
  const current = latest(series), ch = changeInfo(series);
  document.querySelector("#detailSeries").textContent = series.id; document.querySelector("#detailTitle").textContent = series.title;
  document.querySelector("#detailValue").innerHTML = fmt(series, current.value);
  const detailChange = document.querySelector("#detailChange"); detailChange.className = ch.className; detailChange.textContent = `${ch.arrow} ${Math.abs(ch.diff).toFixed(series.decimals)} 직전 관측 대비`;
  document.querySelector("#legendLabel").textContent = series.title; document.querySelector("#fredLink").href = `https://fred.stlouisfed.org/series/${series.id}`;
  document.querySelector("#mainChart").innerHTML = mainChart(rows, series);
}

function mainChart(rows, series) {
  const W = 800, H = 250, left = 46, right = 14, top = 16, bottom = 27;
  const values = rows.map(d => d.value); let min = Math.min(...values), max = Math.max(...values); const spread = max - min || 1; min -= spread * .12; max += spread * .12;
  const pts = rows.map((d, i) => ({ x: left + i / Math.max(1, rows.length - 1) * (W-left-right), y: top + (max-d.value)/(max-min)*(H-top-bottom), ...d }));
  const poly = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M ${pts[0].x} ${H-bottom} L ${poly.replaceAll(" ", " L ")} L ${pts.at(-1).x} ${H-bottom} Z`;
  const yLines = Array.from({ length: 4 }, (_, i) => { const y = top + i / 3 * (H-top-bottom); const val = max - i / 3 * (max-min); return `<line class="grid-line" x1="${left}" x2="${W-right}" y1="${y}" y2="${y}"/><text class="axis-text" x="0" y="${y+3}">${val.toFixed(series.decimals)}</text>`; }).join("");
  const xLabels = [0, .5, 1].map(r => { const p = pts[Math.round((pts.length-1)*r)]; const anchor = r === 0 ? "start" : r === 1 ? "end" : "middle"; return `<text class="axis-text" text-anchor="${anchor}" x="${p.x}" y="${H-5}">${new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short" }).format(p.date)}</text>`; }).join("");
  const end = pts.at(-1);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${series.title} 추이"><defs><linearGradient id="mainGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#76aa90" stop-opacity=".28"/><stop offset="1" stop-color="#76aa90" stop-opacity=".02"/></linearGradient></defs>${yLines}<path class="main-area" d="${area}"/><polyline class="main-line" points="${poly}"/><circle class="end-dot" cx="${end.x}" cy="${end.y}" r="4"/>${xLabels}</svg>`;
}

function renderMacroSignal() {
  const v = id => latest(SERIES.find(s => s.id === id)).value;
  const growth = Math.max(10, Math.min(90, 55 + (v("GDPC1") - 2) * 9 - (v("UNRATE") - 4.2) * 12));
  const inflation = Math.max(10, Math.min(95, 25 + v("PCEPILFE") * 16));
  const risk = Math.max(10, Math.min(95, 18 + v("BAMLH0A0HYM2") * 10 + Math.max(0, v("NFCI")) * 25));
  document.querySelector("#growthGauge").style.width = `${growth}%`; document.querySelector("#inflationGauge").style.width = `${inflation}%`; document.querySelector("#riskGauge").style.width = `${risk}%`;
  let title = "균형적인 확장 국면", copy = "성장은 완만하고 신용위험은 안정적입니다. 물가와 장기금리의 방향을 함께 확인하세요.";
  if (inflation > 72) { title = "물가 압력 경계"; copy = "기조적 물가가 높은 구간입니다. 금리 인하 기대보다 실제 물가 둔화가 확인되는지 보세요."; }
  if (risk > 68) { title = "위험 회피 신호 확대"; copy = "신용 스프레드와 금융여건이 긴축적으로 움직입니다. 경기민감 자산의 변동성에 유의하세요."; }
  if (growth < 38) { title = "경기 둔화 신호"; copy = "성장과 고용의 모멘텀이 약해지고 있습니다. 실업률과 신규 실업수당의 동반 상승을 확인하세요."; }
  document.querySelector("#regimeTitle").textContent = title; document.querySelector("#regimeCopy").textContent = copy;
  const spread = v("T10Y2Y"), pce = v("PCEPILFE"), hy = v("BAMLH0A0HYM2");
  const checkpoints = [
    ["금리 곡선", spread < 0 ? `10년-2년 금리차가 ${spread.toFixed(2)}%p로 역전 상태입니다.` : `10년-2년 금리차는 ${spread.toFixed(2)}%p입니다. 재가팔라짐의 속도를 확인하세요.`],
    ["물가 경로", `근원 PCE는 전년 대비 ${pce.toFixed(1)}%입니다. 2% 목표를 향한 하락 추세가 핵심입니다.`],
    ["신용 위험", `하이일드 스프레드는 ${hy.toFixed(2)}%p입니다. 급격한 확대는 위험자산 경고 신호입니다.`]
  ];
  document.querySelector("#checkpoints").innerHTML = checkpoints.map((c,i) => `<div class="checkpoint"><span class="checkpoint-index">0${i+1}</span><div><h3>${c[0]}</h3><p>${c[1]}</p></div></div>`).join("");
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function correlationDataset() {
  const seriesList = CORRELATION_IDS.map(id => ({ id, rows: state.data[id] || pseudoHistory(SERIES.find(s => s.id === id)) }));
  const latestCommon = new Date(Math.min(...seriesList.map(item => item.rows.at(-1).date.getTime())));
  latestCommon.setDate(1);
  const months = Array.from({ length: 36 }, (_, index) => {
    const date = new Date(latestCommon); date.setMonth(latestCommon.getMonth() - (35 - index)); return monthKey(date);
  });
  const byId = {};
  seriesList.forEach(item => {
    const observations = new Map();
    item.rows.forEach(row => observations.set(monthKey(row.date), row.value));
    let lastValue = null;
    const allMonths = [];
    const first = new Date(latestCommon); first.setMonth(first.getMonth() - 40);
    for (let cursor = new Date(first); cursor <= latestCommon; cursor.setMonth(cursor.getMonth() + 1)) {
      const key = monthKey(cursor);
      if (observations.has(key)) lastValue = observations.get(key);
      allMonths.push([key, lastValue]);
    }
    byId[item.id] = new Map(allMonths);
  });
  return { months, byId };
}

function alignedValues(idA, idB, dataset) {
  const pairs = dataset.months.map(month => [dataset.byId[idA].get(month), dataset.byId[idB].get(month)])
    .filter(pair => pair.every(Number.isFinite));
  return { a: pairs.map(pair => pair[0]), b: pairs.map(pair => pair[1]) };
}

function pearson(a, b) {
  if (a.length < 3 || a.length !== b.length) return null;
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let numerator = 0, denominatorA = 0, denominatorB = 0;
  a.forEach((value, index) => {
    const deltaA = value - meanA, deltaB = b[index] - meanB;
    numerator += deltaA * deltaB; denominatorA += deltaA ** 2; denominatorB += deltaB ** 2;
  });
  const denominator = Math.sqrt(denominatorA * denominatorB);
  return denominator ? numerator / denominator : 0;
}

function correlationColor(value, diagonal) {
  if (diagonal) return { background: "#173c30", color: "#fff" };
  const strength = Math.min(.9, .13 + Math.abs(value) * .72);
  return value >= 0
    ? { background: `rgba(38, 121, 88, ${strength})`, color: Math.abs(value) > .45 ? "#fff" : "#173329" }
    : { background: `rgba(190, 95, 69, ${strength})`, color: Math.abs(value) > .45 ? "#fff" : "#4b2921" };
}

function renderCorrelation() {
  const dataset = correlationDataset();
  const matrix = document.querySelector("#correlationMatrix");
  let html = `<div class="matrix-label column"></div>`;
  html += CORRELATION_IDS.map(id => `<div class="matrix-label column">${SHORT_LABELS[id]}</div>`).join("");
  CORRELATION_IDS.forEach(rowId => {
    html += `<div class="matrix-label">${SHORT_LABELS[rowId]}</div>`;
    CORRELATION_IDS.forEach(columnId => {
      const diagonal = rowId === columnId;
      const values = alignedValues(rowId, columnId, dataset);
      const score = diagonal ? 1 : pearson(values.a, values.b);
      const safeScore = Number.isFinite(score) ? score : 0;
      const color = correlationColor(safeScore, diagonal);
      const selected = !diagonal && state.correlationPair.includes(rowId) && state.correlationPair.includes(columnId);
      html += `<button class="matrix-cell ${diagonal ? "diagonal" : ""} ${selected ? "selected" : ""}" data-row="${rowId}" data-column="${columnId}" style="background:${color.background};color:${color.color}" ${diagonal ? "disabled" : ""} title="${SHORT_LABELS[rowId]} × ${SHORT_LABELS[columnId]}: ${safeScore.toFixed(2)}">${safeScore.toFixed(2)}</button>`;
    });
  });
  matrix.innerHTML = html;
  matrix.querySelectorAll(".matrix-cell:not(.diagonal)").forEach(cell => cell.addEventListener("click", () => {
    state.correlationPair = [cell.dataset.row, cell.dataset.column]; renderCorrelation();
  }));
  renderRelationship(dataset);
}

function normalized(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) || 1;
  return values.map(value => (value - mean) / deviation);
}

function renderRelationship(dataset) {
  const [idA, idB] = state.correlationPair;
  const values = alignedValues(idA, idB, dataset), score = pearson(values.a, values.b) ?? 0;
  const strength = Math.abs(score) >= .7 ? "강한" : Math.abs(score) >= .4 ? "중간 수준의" : "약한";
  const direction = score >= 0 ? "같은 방향" : "반대 방향";
  document.querySelector("#relationshipScore").textContent = `${score >= 0 ? "+" : ""}${score.toFixed(2)}`;
  document.querySelector("#relationshipTitle").textContent = `${SHORT_LABELS[idA]} × ${SHORT_LABELS[idB]}`;
  document.querySelector("#relationshipCopy").textContent = `최근 36개월 동안 ${strength} 상관관계로, 대체로 ${direction}으로 움직였습니다.`;
  document.querySelector("#relationshipLegend").innerHTML = `<span><i></i>${SHORT_LABELS[idA]}</span><span><i></i>${SHORT_LABELS[idB]}</span>`;
  document.querySelector("#relationshipChart").innerHTML = relationshipChart(normalized(values.a), normalized(values.b));
}

function relationshipChart(a, b) {
  if (!a.length) return `<div class="empty-state">비교할 데이터가 부족합니다.</div>`;
  const W = 420, H = 170, padX = 8, padY = 13;
  const combined = [...a, ...b]; let min = Math.min(...combined), max = Math.max(...combined); const spread = max - min || 1; min -= spread * .1; max += spread * .1;
  const makePoints = values => values.map((value, index) => `${padX + index / Math.max(1, values.length - 1) * (W-padX*2)},${padY + (max-value)/(max-min)*(H-padY*2)}`).join(" ");
  const zeroY = padY + (max-0)/(max-min)*(H-padY*2);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="선택한 두 지표의 표준화 추이"><line class="grid-line" x1="${padX}" x2="${W-padX}" y1="${zeroY}" y2="${zeroY}"/><polyline class="relation-line-a" points="${makePoints(a)}"/><polyline class="relation-line-b" points="${makePoints(b)}"/></svg>`;
}

function render() { renderCards(); renderDetail(); renderMacroSignal(); renderCorrelation(); }
document.querySelectorAll(".filter").forEach(btn => btn.addEventListener("click", () => { document.querySelectorAll(".filter").forEach(b => b.classList.remove("active")); btn.classList.add("active"); state.filter = btn.dataset.filter; renderCards(); }));
document.querySelectorAll(".range-tabs button").forEach(btn => btn.addEventListener("click", () => { document.querySelectorAll(".range-tabs button").forEach(b => b.classList.remove("active")); btn.classList.add("active"); state.range = btn.dataset.range; renderDetail(); }));
document.querySelector("#refreshButton").addEventListener("click", loadAll);

SERIES.forEach(s => state.data[s.id] = pseudoHistory(s));
render();
loadAll();
