import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const startedAt = new Date();

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});

app.get("/api/info", (_req, res) => {
  res.json({
    app: "render-demo",
    hostedOn: "Render",
    deployedVia: "Render REST API",
    node: process.version,
    region: process.env.RENDER_REGION || "unknown",
    serviceId: process.env.RENDER_SERVICE_ID || "unknown",
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
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
    p { opacity:.8; line-height:1.6; }
    code { background:rgba(255,255,255,0.1); padding:.15rem .4rem; border-radius:6px; }
    .pill { display:inline-block; margin-top:1rem; padding:.4rem .9rem;
      background:#4f7cff; border-radius:999px; font-weight:600; font-size:.9rem; }
    a { color:#9db4ff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="pill">● Live on Render</div>
    <h1>Hello from Render 👋</h1>
    <p>This Node/Express app was created and deployed entirely through the
       <strong>Render REST API</strong>.</p>
    <p>Try the JSON endpoints:
       <a href="/api/info">/api/info</a> · <a href="/healthz">/healthz</a></p>
    <p style="font-size:.85rem;opacity:.6">Started ${startedAt.toISOString()}</p>
  </div>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`render-demo listening on ${PORT}`));
