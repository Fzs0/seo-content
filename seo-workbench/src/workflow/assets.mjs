import { slugify } from "./utils.mjs";

function isUsableUrl(value = "") {
  const clean = String(value || "").trim();
  return /^https?:\/\//i.test(clean) || clean.startsWith("/");
}

export function projectPages(project = {}) {
  return String(project.mainPages || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/https?:\/\/\S+|\/[A-Za-z0-9_./?=&%#-]+/);
      return match ? match[0].replace(/[，,。;；]+$/, "") : line;
    })
    .filter(Boolean);
}

function plannedUrlFor(item) {
  const base = item.assignedSite?.startsWith("主站") ? "/blog" : "/posts";
  return `${base}/${slugify(item.topicCluster || item.pageGroup || item.keyword)}`;
}

function fallbackAsset(project = {}) {
  const siteType = String(project.siteType || "").toLowerCase();
  if (siteType.includes("b2b")) return "/products";
  if (siteType.includes("saas")) return "/features";
  if (siteType.includes("内容")) return "/guides";
  return "/collections/all";
}

export function resolveTargetAsset(item, project = {}) {
  if (!item) {
    return {
      url: "",
      status: "missing",
      contentAction: "needs_keyword",
      reason: "未选择关键词。",
    };
  }

  if (isUsableUrl(item.url)) {
    return {
      url: item.url,
      status: "existing",
      contentAction: "update_or_link",
      reason: "导入数据里已有可用 URL，视为已存在页面。",
    };
  }

  const pages = projectPages(project);
  if (pages.length) {
    const keywordTerms = String(`${item.keyword} ${item.topicCluster} ${item.pageGroup}`)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3);
    const scored = pages
      .map((page) => ({
        page,
        score: keywordTerms.filter((term) => page.toLowerCase().includes(term)).length,
      }))
      .sort((a, b) => b.score - a.score);

    const matched = scored.find((entry) => entry.score > 0);
    if (matched) {
      return {
        url: matched.page,
        status: "existing",
        contentAction: item.assignedSite === "主站-集合页" ? "optimize_existing_page" : "create_or_update_supporting_content",
        reason: "已匹配到网站定位里填写的主站页面。",
      };
    }

    const defaultPage = pages.find((page) => !/blog|post|guide|article/i.test(page)) || pages[0];
    return {
      url: defaultPage,
      status: "needs_review",
      contentAction: "manual_parent_review",
      reason: "有主站页面可选，但没有与关键词明显匹配，需要人工确认承接页。",
    };
  }

  return {
    url: plannedUrlFor(item) || fallbackAsset(project),
    status: "planned",
    contentAction: item.assignedSite === "主站-集合页" ? "create_commercial_page_first" : "create_new_article",
    reason: "当前没有可确认的已存在页面，先作为规划页面，不应在正文生成真实内链。",
  };
}

export function pageRoleFor(item) {
  if (!item) return "";
  if (item.assignedSite === "主站-集合页") return "Commercial Hub";
  if (item.assignedSite === "主站-博客") return "Buyer Education";
  if (item.assignedSite?.includes("知识")) return "Knowledge Support";
  if (item.assignedSite?.includes("场景")) return "Scenario Support";
  if (item.assignedSite?.includes("对比")) return "Comparison Support";
  if (item.assignedSite === "暂不做") return "Hold";
  return "Content Support";
}
