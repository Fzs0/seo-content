import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configUrl = new URL("../../config/ai-stages.local.json", import.meta.url);
const configPath = fileURLToPath(configUrl);

export const DEFAULT_AI_STAGES = {
  keywordAnalysis: {
    label: "关键词分析",
    provider: "deepseek",
    apiFormat: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    endpoint: "/api/generate",
    temperature: 0.2,
  },
  briefGeneration: {
    label: "AI 增强 Brief",
    provider: "local",
    apiFormat: "local",
    baseUrl: "",
    model: "local-workflow",
    endpoint: "/api/generate",
    temperature: 0.2,
  },
  articleGeneration: {
    label: "文章生成",
    provider: "deepseek",
    apiFormat: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    endpoint: "/api/generate",
    temperature: 0.7,
  },
  contentOptimization: {
    label: "内容优化",
    provider: "deepseek",
    apiFormat: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    endpoint: "/api/generate",
    temperature: 0.35,
  },
  siteDiagnosis: {
    label: "站点内容诊断",
    provider: "openai",
    apiFormat: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    endpoint: "/api/generate",
    temperature: 0.2,
  },
};

function stageToEnvPrefix(stage = "default") {
  return String(stage)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

function readLocalConfig() {
  if (!existsSync(configPath)) return {};
  return JSON.parse(readFileSync(configPath, "utf8"));
}

function writeLocalConfig(config) {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function mergeStage(defaults, saved = {}, incoming = null) {
  const cleanIncoming = incoming
    ? Object.fromEntries(
        Object.entries(incoming).filter(([key]) => !["apiKeySet", "apiKeyPreview"].includes(key)),
      )
    : null;
  const merged = {
    ...defaults,
    ...saved,
    ...(cleanIncoming || {}),
  };

  if (cleanIncoming && !cleanIncoming.apiKey && saved.apiKey) {
    merged.apiKey = saved.apiKey;
  }

  return merged;
}

function applyEnv(stageKey, config) {
  const prefix = stageToEnvPrefix(stageKey);
  return {
    ...config,
    provider: process.env[`AI_${prefix}_PROVIDER`] || config.provider,
    apiFormat: process.env[`AI_${prefix}_FORMAT`] || config.apiFormat,
    baseUrl: process.env[`AI_${prefix}_BASE_URL`] || process.env[`AI_${prefix}_URL`] || config.baseUrl,
    apiKey: process.env[`AI_${prefix}_KEY`] || config.apiKey,
    model: process.env[`AI_${prefix}_MODEL`] || config.model,
  };
}

export function getAiStageConfig({ includeSecrets = false, applyEnvironment = true } = {}) {
  const saved = readLocalConfig();
  const stages = {};

  for (const [stageKey, defaults] of Object.entries(DEFAULT_AI_STAGES)) {
    const merged = mergeStage(defaults, saved.stages?.[stageKey]);
    stages[stageKey] = applyEnvironment ? applyEnv(stageKey, merged) : merged;
  }

  return includeSecrets ? { stages } : sanitizeAiStageConfig({ stages });
}

export function saveAiStageConfig(incomingStages = {}) {
  const existing = getAiStageConfig({ includeSecrets: true, applyEnvironment: false }).stages;
  const nextStages = {};

  for (const [stageKey, defaults] of Object.entries(DEFAULT_AI_STAGES)) {
    const incoming = incomingStages[stageKey] || {};
    nextStages[stageKey] = mergeStage(defaults, existing[stageKey], incoming);

    if (incoming.clearApiKey) {
      delete nextStages[stageKey].apiKey;
      delete nextStages[stageKey].clearApiKey;
    }
  }

  writeLocalConfig({ stages: nextStages, updatedAt: new Date().toISOString() });
  return sanitizeAiStageConfig({ stages: nextStages });
}

export function resolveStageConfig(stageKey = "articleGeneration", payloadStageConfig = {}) {
  const stages = getAiStageConfig({ includeSecrets: true }).stages;
  const defaults = DEFAULT_AI_STAGES[stageKey] || DEFAULT_AI_STAGES.articleGeneration;
  const saved = stages[stageKey] || {};
  return mergeStage(defaults, saved, payloadStageConfig);
}

export function sanitizeAiStageConfig(config) {
  const stages = {};

  for (const [stageKey, stage] of Object.entries(config.stages || {})) {
    const apiKey = stage.apiKey || "";
    stages[stageKey] = {
      ...stage,
      apiKey: "",
      apiKeySet: Boolean(apiKey),
      apiKeyPreview: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "",
    };
  }

  return { stages };
}
