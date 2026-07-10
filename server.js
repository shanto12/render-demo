import express from "express";
import { pool, migrate } from "./db.js";
import {
  initCache,
  cacheAvailable,
  cacheGet,
  cacheSet,
  cacheDel,
} from "./cache.js";

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;
const startedAt = new Date();

const requireDb = (_req, res, next) =>
  pool ? next() : res.status(503).json({ error: "no database configured" });

// ---------- health / info ----------

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});

app.get("/api/info", async (_req, res) => {
  const info = {
    app: "render-demo",
    hostedOn: "Render",
    deployedVia: "Render REST API",
    node: process.version,
    serviceId: process.env.RENDER_SERVICE_ID || "unknown",
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    postgres: { configured: !!pool },
    redis: { configured: !!process.env.REDIS_URL, connected: cacheAvailable() },
  };
  if (pool) {
    try {
      const r = await pool.query(
        "SELECT (SELECT count(*)::int FROM visits) AS visits, (SELECT count(*)::int FROM projects) AS projects, (SELECT count(*)::int FROM tasks) AS tasks"
      );
      info.postgres = { configured: true, connected: true, counts: r.rows[0] };
    } catch (e) {
      info.postgres = { configured: true, connected: false, error: e.message };
    }
  }
  res.json(info);
});

// legacy demo endpoint
app.get("/api/visit", requireDb, async (_req, res) => {
  await pool.query("INSERT INTO visits DEFAULT VALUES");
  const r = await pool.query("SELECT count(*)::int AS n FROM visits");
  res.json({ recorded: true, totalVisits: r.rows[0].n });
});

// ---------- projects CRUD ----------

app.post("/api/projects", requireDb, async (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== "string")
    return res.status(400).json({ error: "name (string) is required" });
  try {
    const r = await pool.query(
      "INSERT INTO projects (name) VALUES ($1) RETURNING *",
      [name.trim()]
    );
    await cacheDel("stats");
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res.status(409).json({ error: "project name already exists" });
    throw e;
  }
});

app.get("/api/projects", requireDb, async (_req, res) => {
  const r = await pool.query(
    `SELECT p.*, count(t.id)::int AS task_count,
            count(t.id) FILTER (WHERE t.done)::int AS done_count
     FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
     GROUP BY p.id ORDER BY p.id`
  );
  res.json(r.rows);
});

app.get("/api/projects/:id", requireDb, async (req, res) => {
  const r = await pool.query("SELECT * FROM projects WHERE id = $1", [
    req.params.id,
  ]);
  if (!r.rows.length) return res.status(404).json({ error: "not found" });
  const tasks = await pool.query(
    "SELECT * FROM tasks WHERE project_id = $1 ORDER BY id",
    [req.params.id]
  );
  res.json({ ...r.rows[0], tasks: tasks.rows });
});

app.delete("/api/projects/:id", requireDb, async (req, res) => {
  const r = await pool.query(
    "DELETE FROM projects WHERE id = $1 RETURNING id",
    [req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: "not found" });
  await cacheDel("stats");
  res.json({ deleted: true, cascadedTasks: true });
});

// ---------- tasks CRUD ----------

app.post("/api/projects/:id/tasks", requireDb, async (req, res) => {
  const { title } = req.body || {};
  if (!title || typeof title !== "string")
    return res.status(400).json({ error: "title (string) is required" });
  try {
    const r = await pool.query(
      "INSERT INTO tasks (project_id, title) VALUES ($1, $2) RETURNING *",
      [req.params.id, title.trim()]
    );
    await cacheDel("stats");
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === "23503")
      return res.status(404).json({ error: "project not found" });
    throw e;
  }
});

app.patch("/api/tasks/:id", requireDb, async (req, res) => {
  const { done, title } = req.body || {};
  const r = await pool.query(
    `UPDATE tasks SET done = COALESCE($2, done), title = COALESCE($3, title)
     WHERE id = $1 RETURNING *`,
    [req.params.id, done ?? null, title ?? null]
  );
  if (!r.rows.length) return res.status(404).json({ error: "not found" });
  await cacheDel("stats");
  res.json(r.rows[0]);
});

app.delete("/api/tasks/:id", requireDb, async (req, res) => {
  const r = await pool.query("DELETE FROM tasks WHERE id = $1 RETURNING id", [
    req.params.id,
  ]);
  if (!r.rows.length) return res.status(404).json({ error: "not found" });
  await cacheDel("stats");
  res.json({ deleted: true });
});

// ---------- stats (aggregate query, Redis-cached) ----------

app.get("/api/stats", requireDb, async (_req, res) => {
  const cached = await cacheGet("stats");
  if (cached) {
    return res.json({ ...JSON.parse(cached), cache: "hit" });
  }
  const r = await pool.query(
    `SELECT (SELECT count(*)::int FROM projects) AS projects,
            (SELECT count(*)::int FROM tasks) AS tasks,
            (SELECT count(*)::int FROM tasks WHERE done) AS tasks_done,
            (SELECT count(*)::int FROM visits) AS visits`
  );
  const stats = { ...r.rows[0], computedAt: new Date().toISOString() };
  await cacheSet("stats", JSON.stringify(stats), 30);
  res.json({ ...stats, cache: cacheAvailable() ? "miss" : "unavailable" });
});

// ---------- landing page ----------

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Render Full-Stack Demo</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin:0; min-height:100vh; display:grid; place-items:center;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: radial-gradient(1200px 600px at 50% -10%, #1f2d5c, #0b1020);
      color:#e8ecff; }
    .card { padding:2.5rem; max-width:720px;
      background: rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
      border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.4); }
    h1 { font-size:1.9rem; margin:0 0 .5rem; text-align:center; }
    .pill { display:block; width:fit-content; margin:0 auto 1rem; padding:.4rem .9rem;
      background:#4f7cff; border-radius:999px; font-weight:600; font-size:.9rem; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; margin-top:1rem; }
    td, th { padding:.45rem .6rem; border-bottom:1px solid rgba(255,255,255,0.1); text-align:left; }
    code { background:rgba(255,255,255,0.1); padding:.1rem .35rem; border-radius:5px; font-size:.85em; }
    a { color:#9db4ff; }
  </style>
</head>
<body>
  <div class="card">
    <span class="pill">● Express + Postgres + Redis on Render</span>
    <h1>Full-Stack API Demo</h1>
    <p>REST API with a relational schema (projects → tasks, FK + cascade),
       aggregate stats cached in Redis, all provisioned via the Render REST API.</p>
    <table>
      <tr><th>Endpoint</th><th>What it does</th></tr>
      <tr><td><code>GET /api/projects</code></td><td>List projects with task counts (JOIN + aggregate)</td></tr>
      <tr><td><code>POST /api/projects</code></td><td>Create project (validated, unique)</td></tr>
      <tr><td><code>GET /api/projects/:id</code></td><td>Project + its tasks</td></tr>
      <tr><td><code>POST /api/projects/:id/tasks</code></td><td>Add task (FK-checked)</td></tr>
      <tr><td><code>PATCH /api/tasks/:id</code></td><td>Update task</td></tr>
      <tr><td><code>DELETE /api/projects/:id</code></td><td>Delete + cascade tasks</td></tr>
      <tr><td><code>GET /api/stats</code></td><td>Aggregates, Redis-cached 30s</td></tr>
      <tr><td><code>GET /api/info</code></td><td><a href="/api/info">Runtime + datastore status</a></td></tr>
    </table>
  </div>
</body>
</html>`);
});

// ---------- error handling ----------

app.use((err, _req, res, _next) => {
  console.error("unhandled:", err.message);
  res.status(500).json({ error: "internal error" });
});

async function main() {
  try {
    await migrate();
  } catch (e) {
    console.error("migrate failed:", e.message);
  }
  try {
    await initCache();
  } catch (e) {
    console.error("redis connect failed:", e.message);
  }
  app.listen(PORT, () => console.log(`render-demo listening on ${PORT}`));
}
main();
