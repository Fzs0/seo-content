import { resolveStageConfig } from "../ai-stage-config.mjs";
import { readJson, sendJson } from "../http.mjs";

function normalizeOpenAiBaseUrl(baseUrl = "", provider = "") {
  const clean = String(baseUrl || "").trim().replace(/\/+$/g, "");
  if (!clean) return "";
  if (clean.endsWith("/chat/completions")) return clean;
  if (provider === "deepseek" && clean === "https://api.deepseek.com") return `${clean}/chat/completions`;
  if (clean.endsWith("/v1")) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

function extractOpenAiContent(data) {
  return (
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    data?.output_text ||
    data?.content ||
    ""
  );
}

function systemMessageForStage(stage) {
  if (stage === "keywordAnalysis") {
    return "You are a senior Google SEO strategist. Review keyword allocation. When the user asks for JSON, return strict parseable JSON only.";
  }

  if (stage === "productExtraction") {
    return "You are a senior ecommerce SEO product taxonomy analyst. Extract product assets from raw API data. When the user asks for JSON, return strict parseable JSON only and do not invent products.";
  }

  if (stage === "briefGeneration") {
    return "You are a senior Google SEO content strategist. Enhance the supplied local SEO brief without fabricating facts, rankings, traffic, SERP results, or product specs. Return the final Markdown brief only.";
  }

  if (stage === "contentOptimization") {
    return "You are a senior SEO editor. Improve clarity, search intent matching, internal linking, and conversion flow without fabricating facts.";
  }

  if (stage === "siteDiagnosis") {
    return "You are a senior Google SEO content auditor. Diagnose existing site posts using the supplied standard. Return practical, prioritized Markdown with tables. Do not fabricate search data, rankings, traffic, or URLs.";
  }

  return "You are a senior Google SEO content writer. Follow the supplied brief exactly and output clean Markdown.";
}

async function callOpenAiCompatible({ payload, stage, config }) {
  const url = normalizeOpenAiBaseUrl(config.baseUrl || config.proxyUrl || "", config.provider || "");
  const apiKey = config.apiKey || "";

  if (!url || !apiKey) {
    return {
      content: [
        "---",
        `title: "${payload.keyword?.keyword || "SEO Draft"}"`,
        "status: openai-compatible-not-configured",
        `stage: "${stage}"`,
        `provider: "${config.provider || "not-set"}"`,
        "---",
        "",
        "# AI stage is not configured yet",
        "",
        "请在网页的“AI 阶段路由”里填写 Base URL、API Key 和模型名，然后保存到服务端。",
        "",
        "OpenAI 兼容中转站通常这样填：",
        "- Base URL: https://your-relay.example.com/v1",
        "- API Key: 你的中转站 key",
        "- Model: 中转站支持的模型名",
      ].join("\n"),
      configured: false,
    };
  }

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: payload.model || config.model,
      temperature: Number(config.temperature ?? 0.7),
      stream: false,
      messages: [
        {
          role: "system",
          content: systemMessageForStage(stage),
        },
        {
          role: "user",
          content: payload.prompt || "",
        },
      ],
    }),
  });

  const text = await upstream.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { content: text };
  }

  if (!upstream.ok) {
    return {
      content: `AI 请求失败：${upstream.status}\n\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`,
      status: upstream.status,
      configured: true,
    };
  }

  const content = String(extractOpenAiContent(data) || "").trim();
  if (!content) {
    return {
      content: "",
      raw: data,
      configured: true,
      status: "empty-content",
      error:
        "AI returned no assistant content. The response may contain reasoning_content only, which is not a publishable article.",
    };
  }

  return {
    content,
    raw: data,
    configured: true,
  };
}

async function callRawProxy({ payload, stage, config }) {
  const proxyUrl = config.baseUrl || config.proxyUrl || "";
  const proxyKey = config.apiKey || "";

  if (!proxyUrl) {
    return {
      content: [
        "---",
        `title: "${payload.keyword?.keyword || "SEO Draft"}"`,
        "status: raw-proxy-not-configured",
        `stage: "${stage}"`,
        "---",
        "",
        "# Raw proxy is not configured yet",
        "",
        "请为这个阶段填写代理端点。Raw proxy 模式会把工作台 payload 原样转发给你的自定义接口。",
      ].join("\n"),
      configured: false,
    };
  }

  const upstream = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(proxyKey ? { Authorization: `Bearer ${proxyKey}` } : {}),
    },
    body: JSON.stringify({
      ...payload,
      stage,
      stageConfig: {
        ...config,
        apiKey: undefined,
      },
      model: payload.model || config.model || "",
      provider: payload.provider || config.provider || "",
    }),
  });

  const text = await upstream.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { content: text };
  }

  return {
    content: data.content || data.text || text,
    raw: data,
    configured: true,
  };
}

export async function generateAiContent(payload = {}) {
  const stage = payload.stage || "articleGeneration";
  const config = resolveStageConfig(stage, payload.stageConfig || {});
  const apiFormat = config.apiFormat || "openai-compatible";

  if (apiFormat === "local" || config.provider === "local") {
    return {
      content: "当前阶段设置为 Local，不会调用外部 AI。请切换供应商并填写 Base URL / API Key / Model。",
      configured: false,
      stage,
      provider: config.provider,
      model: payload.model || config.model,
      apiFormat,
    };
  }

  const result =
    apiFormat === "raw-proxy"
      ? await callRawProxy({ payload, stage, config })
      : await callOpenAiCompatible({ payload, stage, config });

  return {
    ...result,
    stage,
    provider: config.provider,
    model: payload.model || config.model,
    apiFormat,
  };
}

export async function handleGenerateRoute(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return true;
  }

  const payload = await readJson(request);
  const result = await generateAiContent(payload);
  sendJson(response, 200, result);
  return true;
}
