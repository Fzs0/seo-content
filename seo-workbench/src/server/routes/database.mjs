import { readJson, sendJson } from "../http.mjs";
import {
  readDatabaseConfig,
  readDatabaseMemorySummary,
  readDatabaseSchemaStatus,
  resetDatabaseMemory,
  saveDatabaseConfig,
  syncWorkspaceToDatabase,
  testDatabaseConnection,
} from "../database-store.mjs";

export async function handleDatabaseRoute(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/database/config") {
    sendJson(response, 200, readDatabaseConfig());
    return;
  }

  if (request.method === "GET" && pathname === "/api/database/schema") {
    sendJson(response, 200, await readDatabaseSchemaStatus());
    return;
  }

  if (request.method === "GET" && pathname === "/api/database/summary") {
    sendJson(response, 200, await readDatabaseMemorySummary());
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readJson(request);

  if (pathname === "/api/database/config") {
    sendJson(response, 200, saveDatabaseConfig(body.config || body || {}));
    return;
  }

  if (pathname === "/api/database/test") {
    sendJson(response, 200, await testDatabaseConnection(body.config || body || {}));
    return;
  }

  if (pathname === "/api/database/sync-workspace") {
    sendJson(response, 200, await syncWorkspaceToDatabase(body.snapshot || {}));
    return;
  }

  if (pathname === "/api/database/reset") {
    sendJson(response, 200, await resetDatabaseMemory());
    return;
  }

  sendJson(response, 404, { error: "Database endpoint not found" });
}
