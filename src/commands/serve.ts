import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { collectAllSessions, collectProjectSessions } from "../adapters/claude.js";
import { colors } from "../renderer/colors.js";
import { createContext, daysAgo } from "./shared.js";
import {
  buildDashboardData,
  pickFeaturedSession,
} from "../dashboard/data.js";
import { buildDemoDashboardData } from "../dashboard/demo-data.js";
import { generateDashboardHTML } from "../dashboard/html-dashboard.js";

/**
 * co2de serve — live-refreshing local server for the Soot Ledger.
 *
 * Regenerates HTML on each request from the latest JSONL state, so a
 * reload after a new coding turn reflects the updated numbers. No API
 * keys, no outbound traffic — pure localhost read from ~/.claude/projects.
 */
export async function serveCommand(options: {
  port?: string;
  month?: boolean;
  open?: boolean;
  demo?: boolean;
  all?: boolean;
}): Promise<void> {
  const port = Number(options.port ?? 4869);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    console.log(colors.red(`  Invalid port: ${options.port}`));
    return;
  }

  const { config, adapter } = createContext();

  const server = createServer(async (req, res) => {
    try {
      if (req.url && req.url !== "/" && !req.url.startsWith("/?")) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }

      let html: string;
      if (options.demo) {
        html = generateDashboardHTML(buildDemoDashboardData(config.region));
      } else {
        const now = new Date();
        const from = options.month ? daysAgo(30) : daysAgo(7);
        const projectPath = process.cwd();

        const sessions = options.all
          ? collectAllSessions(from, now, config.region)
          : collectProjectSessions(projectPath, from, now, config.region);

        if (sessions.length === 0) {
          res.statusCode = 200;
          res.setHeader("content-type", "text/html; charset=utf-8");
          const msg = options.all
            ? "No sessions found for this period. Try: co2de serve --demo"
            : "No sessions for this project. Try: co2de serve --all  (or --demo for sample data)";
          res.end(renderEmpty(msg));
          return;
        }

        const featured = pickFeaturedSession(sessions);
        if (!featured) {
          res.statusCode = 200;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(renderEmpty("No featured session candidate."));
          return;
        }

        const turns = await adapter.getSessionUsage(featured.sessionId);
        const data = buildDashboardData(sessions, featured, turns, config.region);
        html = generateDashboardHTML(data);
      }

      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(html);
    } catch (err) {
      res.statusCode = 500;
      res.end(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(colors.bold("\n  co2de serve\n"));
    console.log(`  Listening at ${url}`);
    console.log(`  Region:      ${config.region}`);
    console.log(`  Reload the page for fresh data.`);
    console.log(colors.dim("  Ctrl-C to stop.\n"));

    if (options.open !== false) {
      try {
        if (process.platform === "darwin") execSync(`open "${url}"`);
        else if (process.platform === "linux") execSync(`xdg-open "${url}"`);
      } catch {
        /* user can open manually */
      }
    }
  });

  process.on("SIGINT", () => {
    console.log(colors.dim("\n  shutting down."));
    server.close(() => process.exit(0));
  });
}

function renderEmpty(msg: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>co2de — empty</title>
<style>body{font-family:system-ui;background:#f7f5f0;color:#1a1611;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}p{font-size:14px;color:#5a544b}</style>
</head><body><p>${msg}</p></body></html>`;
}
