import { articleBriefTemplateFor, briefFor, imagePlanFor, mockArticleFor, referencePlan } from "./content-plan.mjs";
import { pageRoleFor, resolveTargetAsset } from "./assets.mjs";
import { importCsvKeywords } from "./csv.mjs";
import { importKeywordsFromFile } from "./file-import.mjs";
import { localeForProject } from "./locale.mjs";
import { promptFor } from "./prompt.mjs";
import { enrichKeywords } from "./scorer.mjs";
import { SAMPLE_KEYWORDS, STANDARD, getDefaultProject, reloadStandard, saveStandard } from "./standard.mjs";
import { slugify } from "./utils.mjs";

export { SAMPLE_KEYWORDS, STANDARD, getDefaultProject, reloadStandard, saveStandard };

export function analyzeKeywords(keywords = [], project = {}) {
  const locale = localeForProject(project);
  return enrichKeywords(keywords, project).map((item) => {
    const asset = resolveTargetAsset(item, project);
    const keywordDatabase = String(item.database || "").trim().toLowerCase();
    const expectedDatabase = String(locale.semrushDatabase || "").trim().toLowerCase();
    const marketMismatch = Boolean(keywordDatabase && expectedDatabase && keywordDatabase !== expectedDatabase);
    return {
      ...item,
      locale,
      marketMismatch,
      marketMismatchReason: marketMismatch
        ? `Keyword database "${item.database}" does not match selected market database "${locale.semrushDatabase}".`
        : "",
      topicCluster: item.topicCluster || item.pageGroup || item.seedKeyword || item.keyword,
      pageRole: pageRoleFor(item),
      targetAsset: asset.url,
      assetStatus: asset.status,
      contentAction: asset.contentAction,
      assetReason: asset.reason,
      parentPage: asset.status === "existing" || asset.status === "needs_review" ? asset.url : "",
      plannedUrl: asset.status === "planned" ? asset.url : "",
      reference: referencePlan(item),
      imagePlan: imagePlanFor(item),
    };
  });
}

export function importAndAnalyzeCsv(csvText, project = {}) {
  return analyzeKeywords(importCsvKeywords(csvText), project);
}

export function importAndAnalyzeFile(filePayload, project = {}) {
  return analyzeKeywords(importKeywordsFromFile(filePayload), project);
}

export function buildBrief(item, project = {}) {
  const asset = resolveTargetAsset(item, project);
  const locale = localeForProject(project);
  return {
    brief: briefFor(item, project),
    locale,
    articleBriefTemplate: articleBriefTemplateFor(item, project),
    reference: referencePlan(item),
    parentPage: asset.status === "existing" || asset.status === "needs_review" ? asset.url : "",
    targetAsset: asset,
    imagePlan: imagePlanFor(item),
    recommendedUrl: item ? item.plannedUrl || `/${slugify(item.topicCluster || item.keyword)}` : "",
  };
}

export function buildPrompt(item, project = {}, briefOverride = "") {
  const locale = localeForProject(project);
  const brief = String(briefOverride || "").trim() || briefFor(item, project);
  return {
    brief,
    locale,
    articleBriefTemplate: articleBriefTemplateFor(item, project),
    prompt: promptFor(item, project, brief),
  };
}

export function buildMockArticle(item, project = {}) {
  return {
    content: mockArticleFor(item, project),
  };
}

export function buildProjectPackage({ project = getDefaultProject(), keywords = [], selectedKeyword = null, contentHub = null, todos = [] } = {}) {
  const locale = localeForProject(project);
  const analyzed = analyzeKeywords(keywords, project);
  const selected = selectedKeyword || analyzed[0] || null;
  const brief = selected ? buildBrief(selected, project).brief : "";
  const prompt = selected ? buildPrompt(selected, project).prompt : "";

  return {
    version: STANDARD.version,
    project,
    locale,
    keywords: analyzed,
    selectedKeyword: selected,
    contentHub,
    todos,
    brief,
    prompt,
  };
}
