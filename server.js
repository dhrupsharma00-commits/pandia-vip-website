/**
 * PANDIA VIP OWNER - persistent result collector
 * Node.js 18+ required (uses native fetch).
 *
 * The collector runs independently of the browser and stores the latest
 * WinGo 1M results in data/results.json. The website reads the same-origin
 * /api/latest endpoint, so the browser does not need to call the upstream API.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM =
  process.env.UPSTREAM_URL ||
  "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";
const INTERVAL_MS = Math.max(5000, Number(process.env.COLLECT_INTERVAL_MS || 15000));
const MAX_RECORDS = 9999;

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "results.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let db = loadDb();

function saveDb() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db.slice(0, MAX_RECORDS), null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function normalize(item) {
  if (!item || item.issueNumber == null) return null;
  return {
    issueNumber: String(item.issueNumber),
    number: String(item.number ?? ""),
    color: item.color ?? null,
    sourceTime: item.createTime ?? item.time ?? null,
    collectedAt: new Date().toISOString()
  };
}

async function collectOnce() {
  const url = `${UPSTREAM}${UPSTREAM.includes("?") ? "&" : "?"}ts=${Date.now()}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PANDIA-VIP-Collector/1.0",
        "Accept": "application/json,text/plain,*/*"
      }
    });
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);

    const json = await response.json();
    const list = Array.isArray(json?.data?.list) ? json.data.list : [];

    const incoming = list.map(normalize).filter(Boolean);
    const map = new Map(db.map(x => [x.issueNumber, x]));
    for (const row of incoming) {
      if (!map.has(row.issueNumber)) map.set(row.issueNumber, row);
      else map.set(row.issueNumber, { ...map.get(row.issueNumber), ...row });
    }

    db = Array.from(map.values())
      .sort((a, b) => b.issueNumber.localeCompare(a.issueNumber, undefined, { numeric: true }))
      .slice(0, MAX_RECORDS);

    saveDb();
    console.log(`[collector] ${new Date().toISOString()} records=${db.length} latest=${db[0]?.issueNumber || "-"}`);
    return list;
  } catch (err) {
    console.error(`[collector] ${new Date().toISOString()} ${err.message}`);
    return null;
  }
}

function sendJson(res, status, body) {
  const out = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(out);
}

function safeFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const target = path.normalize(path.join(PUBLIC, clean === "/" ? "index.html" : clean));
  if (!target.startsWith(PUBLIC)) return null;
  return target;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (u.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      collector: true,
      records: db.length,
      latestPeriod: db[0]?.issueNumber || null,
      updatedAt: db[0]?.collectedAt || null
    });
  }

  if (u.pathname === "/api/latest") {
    // Return the same shape expected by the existing HTML.
    const latest = db.slice(0, 50).map(x => ({
      issueNumber: x.issueNumber,
      number: x.number,
      color: x.color
    }));
    return sendJson(res, 200, { data: { list: latest } });
  }

  if (u.pathname === "/api/history") {
    return sendJson(res, 200, {
      count: db.length,
      limit: MAX_RECORDS,
      list: db
    });
  }

  if (u.pathname === "/api/stats") {
    return sendJson(res, 200, {
      count: db.length,
      limit: MAX_RECORDS,
      latestPeriod: db[0]?.issueNumber || null
    });
  }

  const file = safeFile(u.pathname);
  if (!file) return sendJson(res, 403, { error: "Forbidden" });

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    const ext = path.extname(file).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`PANDIA website: http://localhost:${PORT}`);
  console.log(`Upstream: ${UPSTREAM}`);
  collectOnce();
  setInterval(collectOnce, INTERVAL_MS);
});
