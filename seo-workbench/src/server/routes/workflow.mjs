import {
  SAMPLE_KEYWORDS,
  STANDARD,
  analyzeKeywords,
  buildBrief,
  buildMockArticle,
  buildProjectPackage,
  buildPrompt,
  getDefaultProject,
  importAndAnalyzeCsv,
  importAndAnalyzeFile,
  reloadStandard,
  saveStandard,
} from "../../workflow/index.mjs";
import { methodNotAllowed, readJson, sendJson } from "../http.mjs";
import { generateAiContent } from "./generate.mjs";

const AI_BRIEF_CACHE_TTL_MS = 10 * 60 * 1000;
const AI_BRIEF_CACHE_MAX = 50;
const aiBriefCache = new Map();

function canEnhanceBrief(aiStage = {}) {
  return Boolean(aiStage && aiStage.provider && aiStage.provider !== "local" && aiStage.apiFormat !== "local");
}

function aiBriefCacheKey(keyword, project, aiStage) {
  return JSON.stringify({
    keyword,
    project,
    stage: {
      provider: aiStage?.provider || "",
      apiFormat: aiStage?.apiFormat || "",
      baseUrl: aiStage?.baseUrl || aiStage?.proxyUrl || "",
      model: aiStage?.model || "",
      temperature: aiStage?.temperature ?? "",
    },
  });
}

function rememberAiBrief(key, data) {
  if (aiBriefCache.size >= AI_BRIEF_CACHE_MAX) {
    aiBriefCache.delete(aiBriefCache.keys().next().value);
  }
  aiBriefCache.set(key, { data, expiresAt: Date.now() + AI_BRIEF_CACHE_TTL_MS });
}

function readCachedAiBrief(key) {
  const cached = aiBriefCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    aiBriefCache.delete(key);
    return null;
  }
  return {
    ...cached.data,
    aiMeta: {
      ...(cached.data.aiMeta || {}),
      cached: true,
    },
  };
}

function localBriefResponse(localBriefData, reason = "local-stage", aiResult = {}) {
  return {
    ...localBriefData,
    briefSource: "local",
    aiEnhanced: false,
    aiMeta: {
      stage: "briefGeneration",
      reason,
      configured: Boolean(aiResult.configured),
      provider: aiResult.provider || "",
      model: aiResult.model || "",
      apiFormat: aiResult.apiFormat || "",
      status: aiResult.status || null,
    },
  };
}

function buildAiBriefPrompt({ keyword, project, localBriefData }) {
  const standard = {
    articleBriefTemplate: STANDARD.articleBriefTemplate,
    articleRules: STANDARD.articleRules,
    references: STANDARD.references,
    anchorTextRules: STANDARD.anchorTextRules,
    articleOutputFormat: STANDARD.articleOutputFormat,
  };

  return [
    "# Task",
    "Enhance the local SEO brief below. Do not write the article.",
    "",
    "Return only the final enhanced Markdown brief. Do not wrap the answer in code fences.",
    "",
    "# Hard Rules",
    "- Keep every hard constraint from the local brief unless the input data clearly contradicts it.",
    "- Use the supplied SEO standard as the source of truth for structure, quality gates, references, anchors, and output expectations.",
    "- Do not fabricate Google rankings, traffic, SERP checks, competitor data, product specs, prices, legal claims, health claims, or URLs.",
    "- If evidence is missing, add it to `## Evidence Needed` instead of guessing.",
    "- If a target asset is not marked `existing`, do not approve clickable internal links to it; put it under `## Internal Link Suggestions`.",
    "- Use Chinese for planning notes. Keep title ideas, H1/H2 ideas, URL slugs, FAQ questions, and SERP-facing copy in the target article language.",
    "- Make the brief practical enough that a writer or article-generation model can produce one focused page without re-deciding the strategy.",
    "",
    "# Required Enhancements",
    "- Clarify the search intent and reader job-to-be-done.",
    "- Identify the page type and whether it should be a blog article, collection page, comparison page, or supporting page.",
    "- Strengthen the H2/H3 outline around the user's decision path, not generic keyword stuffing.",
    "- Add internal-link and CTA guidance that respects the source site and target asset status.",
    "- Add evidence, reference, image, and QA requirements based on the standard.",
    "- Keep the output concise, structured, and directly usable.",
    "",
    "# Project And Keyword Data",
    JSON.stringify(
      {
        project,
        keyword,
        locale: localBriefData.locale,
        articleBriefTemplate: localBriefData.articleBriefTemplate,
        reference: localBriefData.reference,
        targetAsset: localBriefData.targetAsset,
        imagePlan: localBriefData.imagePlan,
        recommendedUrl: localBriefData.recommendedUrl,
        standard,
      },
      null,
      2,
    ),
    "",
    "# Local Brief To Enhance",
    localBriefData.brief || "",
  ].join("\n");
}

async function buildBriefWithOptionalAi(body) {
  const keyword = body.keyword || null;
  const project = body.project || getDefaultProject();
  const localBriefData = buildBrief(keyword, project);
  const aiStage = body.aiStage || {};

  if (!keyword || !canEnhanceBrief(aiStage)) {
    return localBriefResponse(localBriefData, !keyword ? "missing-keyword" : "local-stage");
  }

  const cacheKey = aiBriefCacheKey(keyword, project, aiStage);
  const cached = readCachedAiBrief(cacheKey);
  if (cached) return cached;

  try {
    const aiResult = await generateAiContent({
      stage: "briefGeneration",
      stageConfig: aiStage,
      provider: aiStage.provider,
      model: aiStage.model,
      prompt: buildAiBriefPrompt({ keyword, project, localBriefData }),
      project,
      keyword,
    });
    const enhancedBrief = String(aiResult.content || "").trim();

    if (!aiResult.configured || aiResult.status || !enhancedBrief) {
      return localBriefResponse(localBriefData, aiResult.status ? "ai-request-failed" : "ai-not-configured", aiResult);
    }

    const response = {
      ...localBriefData,
      brief: enhancedBrief,
      localBrief: localBriefData.brief,
      briefSource: "ai-enhanced",
      aiEnhanced: true,
      aiMeta: {
        stage: "briefGeneration",
        configured: true,
        provider: aiResult.provider || aiStage.provider || "",
        model: aiResult.model || aiStage.model || "",
        apiFormat: aiResult.apiFormat || aiStage.apiFormat || "",
        cached: false,
      },
    };
    rememberAiBrief(cacheKey, response);
    return response;
  } catch (error) {
    return localBriefResponse(localBriefData, error.message || "ai-request-error");
  }
}

export async function handleWorkflowRoute(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/workflow/standard") {
    sendJson(response, 200, { standard: STANDARD });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/workflow/standard/reload") {
    const standard = reloadStandard();
    sendJson(response, 200, {
      standard,
      reloaded: true,
      message: "已从 workflows/seo-standard.json 重新读取标准。",
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/workflow/sample") {
    sendJson(response, 200, {
      project: getDefaultProject(),
      keywords: SAMPLE_KEYWORDS,
      sites: STANDARD.sites,
      standardVersion: STANDARD.version,
    });
    return true;
  }

  if (request.method !== "POST") {
    methodNotAllowed(response);
    return true;
  }

  const body = await readJson(request);

  if (pathname === "/api/workflow/standard") {
    const standard = saveStandard(body.standard || body);
    sendJson(response, 200, {
      standard,
      saved: true,
      message: "已保存到 workflows/seo-standard.json，并刷新服务端内存标准。",
    });
    return true;
  }

  if (pathname === "/api/workflow/analyze") {
    sendJson(response, 200, {
      keywords: analyzeKeywords(body.keywords || [], body.project || getDefaultProject()),
      sites: STANDARD.sites,
      standardVersion: STANDARD.version,
    });
    return true;
  }

  if (pathname === "/api/workflow/import-csv") {
    sendJson(response, 200, {
      keywords: importAndAnalyzeCsv(body.csv || "", body.project || getDefaultProject()),
      sites: STANDARD.sites,
      standardVersion: STANDARD.version,
    });
    return true;
  }

  if (pathname === "/api/workflow/import-file") {
    sendJson(response, 200, {
      keywords: importAndAnalyzeFile(body, body.project || getDefaultProject()),
      sites: STANDARD.sites,
      standardVersion: STANDARD.version,
      filename: body.filename || "",
    });
    return true;
  }

  if (pathname === "/api/workflow/brief") {
    sendJson(response, 200, await buildBriefWithOptionalAi(body));
    return true;
  }

  if (pathname === "/api/workflow/prompt") {
    sendJson(response, 200, buildPrompt(body.keyword || null, body.project || getDefaultProject(), body.briefOverride || body.brief || ""));
    return true;
  }

  if (pathname === "/api/workflow/mock-article") {
    sendJson(response, 200, buildMockArticle(body.keyword || null, body.project || getDefaultProject()));
    return true;
  }

  if (pathname === "/api/workflow/project-package") {
    sendJson(response, 200, buildProjectPackage(body));
    return true;
  }

  return false;
}
