import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { handleAiStagesRoute } from "./routes/ai-stages.mjs";
import { handleArticlesRoute } from "./routes/articles.mjs";
import { handleBlogSitesRoute } from "./routes/blog-sites.mjs";
import { handleGenerateRoute } from "./routes/generate.mjs";
import { handleMainSitesRoute } from "./routes/main-sites.mjs";
import { handleSiteSnapshotRoute } from "./routes/site-snapshot.mjs";
import { handleTodosRoute } from "./routes/todos.mjs";
import { handleWorkflowRoute } from "./routes/workflow.mjs";
import { handleWpSitesRoute } from "./routes/wp-sites.mjs";
import { sendJson, sendText } from "./http.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultPort = Number(process.env.PORT || 5177);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function isBlockedStaticPath(pathname) {
  return (
    pathname.startsWith("/src/") ||
    pathname.startsWith("/workflows/") ||
    pathname.startsWith("/node_modules/") ||
    pathname === "/package.json"
  );
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);

  if (isBlockedStaticPath(pathname)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const target = normalize(join(projectRoot, pathname));
  if (!target.startsWith(projectRoot)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const file = await readFile(target);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch {
    sendText(response, 404, "Not found");
  }
}

export function createSeoWorkbenchServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      if (url.pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          name: "seo-workbench",
          time: new Date().toISOString(),
        });
        return;
      }

      if (url.pathname.startsWith("/api/workflow/")) {
        const handled = await handleWorkflowRoute(request, response, url.pathname);
        if (!handled) sendJson(response, 404, { error: "Workflow endpoint not found" });
        return;
      }

      if (url.pathname === "/api/ai-stages") {
        await handleAiStagesRoute(request, response);
        return;
      }

      if (url.pathname === "/api/todos") {
        await handleTodosRoute(request, response);
        return;
      }

      if (url.pathname === "/api/site-snapshot") {
        await handleSiteSnapshotRoute(request, response);
        return;
      }

      if (url.pathname.startsWith("/api/wp-sites")) {
        await handleWpSitesRoute(request, response, url.pathname);
        return;
      }

      if (url.pathname.startsWith("/api/blog-sites")) {
        await handleBlogSitesRoute(request, response, url.pathname);
        return;
      }

      if (url.pathname.startsWith("/api/main-sites")) {
        await handleMainSitesRoute(request, response, url.pathname);
        return;
      }

      if (url.pathname === "/api/generate") {
        await handleGenerateRoute(request, response);
        return;
      }

      if (url.pathname === "/api/articles/save") {
        await handleArticlesRoute(request, response);
        return;
      }

      await serveStatic(request, response);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });
}

export function startServer({ port = defaultPort } = {}) {
  const server = createSeoWorkbenchServer();
  server.listen(port, () => {
    console.log(`SEO Workbench is running at http://localhost:${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
