import express from "express";
import pg from "pg";

const app = express();
const PORT = process.env.PORT || 3000;
const startedAt = new Date();

// Postgres pool (only if DATABASE_URL is configured)
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
    })
  : null;

async function initDb() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS visits (
    id serial PRIMARY KEY,
    seen_at timestamptz NOT NULL DEFAULT now()
  )`);
}

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});

app.get("/api/info", async (_req, res) => {
  let db = { configured: !!pool };
  if (pool) {
    try {
      const r = await pool.query("SELECT count(*)::int AS n FROM visits");
      db.connected = true;
      db.totalVisits = r.rows[0].n;
    } catch (e) {
      db.connected = false;
      db.error = e.message;
    }
  }
  res.json({
    app: "render-demo",
    hostedOn: "Render",
    deployedVia: "Render REST API",
    node: process.version,
    serviceId: process.env.RENDER_SERVICE_ID || "unknown",
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    db,
  });
});

// Writes a row to Postgres and returns the running total — proves DB read+write.
app.get("/api/visit", async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "no database configured" });
  try {
    await pool.query("INSERT INTO visits DEFAULT VALUES");
    const r = await pool.query("SELECT count(*)::int AS n FROM visits");
    res.json({ recorded: true, totalVisits: r.rows[0].n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Deployed on Render</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin:0; min-height:100vh; display:grid; place-items:center;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: radial-gradient(1200px 600px at 50% -10%, #1f2d5c, #0b1020);
      color:#e8ecff; }
    .card { text-align:center; padding:3rem 2.5rem; max-width:640px;
      background: rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
      border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.4); }
    h1 { font-size:2.2rem; margin:0 0 .5rem; }
    p { opacity:.85; line-height:1.6; }
    .pill { display:inline-block; margin-bottom:1rem; padding:.4rem .9rem;
      background:#4f7cff; border-radius:999px; font-weight:600; font-size:.9rem; }
    button { margin-top:1rem; padding:.7rem 1.4rem; font-size:1rem; font-weight:600;
      border:0; border-radius:10px; background:#4f7cff; color:#fff; cursor:pointer; }
    #count { font-size:2.5rem; font-weight:700; margin:.5rem 0; }
    a { color:#9db4ff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="pill">● Live on Render + Postgres</div>
    <h1>Hello from Render 👋</h1>
    <p>Node/Express web app <strong>and</strong> a Postgres database, both created
       through the Render REST API.</p>
    <div id="count">—</div>
    <button onclick="visit()">Record a visit (writes to Postgres)</button>
    <p style="font-size:.85rem;opacity:.6">
       JSON: <a href="/api/info">/api/info</a> · <a href="/api/visit">/api/visit</a></p>
  </div>
  <script>
    async function refresh() {
      const r = await fetch('/api/info'); const j = await r.json();
      document.getElementById('count').textContent =
        (j.db && j.db.connected) ? j.db.totalVisits + ' visits stored' : 'DB not connected';
    }
    async function visit() {
      await fetch('/api/visit'); refresh();
    }
    refresh();
  </script>
</body>
</html>`);
});

initDb()
  .catch((e) => console.error("initDb failed:", e.message))
  .finally(() =>
    app.listen(PORT, () => console.log(`render-demo listening on ${PORT}`))
  );
