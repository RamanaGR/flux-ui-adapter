import { FastifyInstance } from "fastify";
import { getDb, isDbOpen } from "../storage/sqlite.js";

interface SessionRow {
  id: string;
  status: string;
  created_at: number;
  completed_at: number | null;
  screenshot_count: number;
}

export async function sessionsListRoutes(app: FastifyInstance): Promise<void> {
  app.get("/sessions", async (_request, reply) => {
    if (!isDbOpen()) {
      return reply.status(503).send("Database unavailable");
    }

    const db = getDb();
    const sessions = db
      .prepare(
        `SELECT s.id, s.status, s.created_at, s.completed_at,
                COUNT(DISTINCT cs.id) AS screenshot_count
         FROM sessions s
         LEFT JOIN canvas_snapshots cs ON cs.session_id = s.id
         GROUP BY s.id
         ORDER BY s.created_at DESC`,
      )
      .all() as SessionRow[];

    return reply.type("text/html").send(renderSessionsPage(sessions));
  });
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function renderSessionsPage(sessions: SessionRow[]): string {
  const rows = sessions
    .map((s) => {
      const isActive = s.status === "ACTIVE";
      const shortId = s.id.slice(0, 8);
      const created = fmtDate(s.created_at);
      const completed = s.completed_at ? fmtDate(s.completed_at) : "—";
      return `<tr class="${isActive ? "row-active" : ""}">
        <td><a href="/session/${s.id}/view" class="session-link" title="${s.id}"><code>${shortId}…</code></a></td>
        <td><span class="status-badge ${isActive ? "badge-active" : "badge-complete"}">${s.status}</span></td>
        <td>${created}</td>
        <td>${completed}</td>
        <td class="num">${s.screenshot_count}</td>
        <td><a href="/session/${s.id}/view" class="open-btn">Open View</a></td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChromaBridge — Sessions</title>
  <style>
    :root {
      --bg: #0a0e1a; --surface: #131825; --surface2: #1a2035;
      --text: #e2e8f0; --muted: #64748b;
      --accent: #a78bfa; --accent-dim: rgba(167,139,250,0.15);
      --border: #1e293b;
      --green: #34d399; --green-dim: rgba(52,211,153,0.12);
      --red: #f87171;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'SF Mono','Cascadia Code','Fira Code','JetBrains Mono',monospace; background: var(--bg); color: var(--text); min-height: 100vh; }

    .container { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
    h1 { font-size: 1.1rem; color: var(--accent); margin-bottom: 0.3rem; }
    .subtitle { font-size: 0.75rem; color: var(--muted); margin-bottom: 1.5rem; }

    table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    th { text-align: left; padding: 0.6rem 0.75rem; font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); background: var(--surface2); }
    td { padding: 0.55rem 0.75rem; font-size: 0.72rem; border-bottom: 1px solid rgba(30,41,59,0.5); }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: var(--surface2); }
    tr.row-active { background: var(--green-dim); }
    tr.row-active:hover { background: rgba(52,211,153,0.18); }

    .num { text-align: right; font-variant-numeric: tabular-nums; }

    code { font-family: inherit; color: var(--text); }
    .session-link { color: var(--accent); text-decoration: none; }
    .session-link:hover { text-decoration: underline; }

    .status-badge { font-size: 0.6rem; padding: 2px 6px; border-radius: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
    .badge-active { background: var(--green-dim); color: var(--green); }
    .badge-complete { background: rgba(100,116,139,0.15); color: var(--muted); }

    .open-btn { display: inline-block; padding: 0.2rem 0.6rem; font-size: 0.65rem; font-family: inherit; font-weight: 600; color: var(--accent); background: var(--accent-dim); border: 1px solid transparent; border-radius: 4px; text-decoration: none; transition: all 0.15s; }
    .open-btn:hover { border-color: var(--accent); }

    .empty { text-align: center; padding: 3rem 1rem; color: var(--muted); font-size: 0.8rem; }
    .refresh-hint { font-size: 0.65rem; color: var(--muted); margin-top: 1rem; text-align: right; }
  </style>
</head>
<body>
  <div class="container">
    <h1>ChromaBridge Sessions</h1>
    <p class="subtitle">${sessions.length} session${sessions.length !== 1 ? "s" : ""} recorded</p>
    ${
      sessions.length === 0
        ? '<div class="empty">No sessions yet. Connect an extension to get started.</div>'
        : `<table>
      <thead>
        <tr>
          <th>Session</th>
          <th>Status</th>
          <th>Created</th>
          <th>Completed</th>
          <th class="num">Screenshots</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`
    }
    <p class="refresh-hint">Refresh the page to update counts.</p>
  </div>
</body>
</html>`;
}
