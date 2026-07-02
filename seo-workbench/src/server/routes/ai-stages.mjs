import { getAiStageConfig, saveAiStageConfig } from "../ai-stage-config.mjs";
import { methodNotAllowed, readJson, sendJson } from "../http.mjs";

export async function handleAiStagesRoute(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, getAiStageConfig());
    return true;
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, 200, {
      ...saveAiStageConfig(body.stages || {}),
      saved: true,
    });
    return true;
  }

  methodNotAllowed(response);
  return true;
}
