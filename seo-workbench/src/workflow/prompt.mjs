import { referencePlan } from "./content-plan.mjs";
import { localeForProject, localeInstruction } from "./locale.mjs";
import { STANDARD } from "./standard.mjs";

function articleBriefTemplateInstructions() {
  const template = STANDARD.articleBriefTemplate;
  const modules = template?.modules || [];

  if (!modules.length) return [];

  return [
    "## 文章 Brief 模板执行规则",
    `模板来源：${template.sourceSheet || "文章Brief模板"}`,
    template.description || "每篇文章开写前先填这个 Brief，避免写成泛泛而谈的 AI 水文。",
    "",
    "写作前必须逐项读取当前 Brief 里的《文章 Brief 模板（完整结构化）》。如果某一项没有足够数据，不要编造，把它写入 Evidence Needed 或 Internal Link Suggestions。",
    "",
    "必须覆盖的模块：",
    ...modules.map((module, index) => `${index + 1}. ${module.label}：${module.promptInstruction || `${module.field}；${module.standard}`}`),
    "",
    "质量门槛：",
    ...(template.qualityGate || []).map((rule) => `- ${rule}`),
    "",
  ];
}

function articleOutputFormatInstructions() {
  const format = STANDARD.articleOutputFormat;
  if (!format) return [];

  return [
    "## WordPress 导入格式规范",
    `格式名称：${format.name || "WordPress Import Markdown"}`,
    format.purpose || "文章必须按可脚本化导入 WordPress 的 Markdown 块格式输出。",
    "",
    format.forbidYamlFrontmatter ? "禁止输出 YAML frontmatter，也不要用 --- 包裹元数据。" : "",
    "",
    "必须按这个顺序输出：",
    ...(format.requiredOrder || []).map((item, index) => `${index + 1}. ${item}`),
    "",
    "格式规则：",
    ...(format.rules || []).map((rule) => `- ${rule}`),
    "",
  ].filter(Boolean);
}

export function promptFor(item, project = {}, brief = "") {
  const refs = referencePlan(item);
  const locale = localeForProject(project);

  return [
    "你是一个 Google SEO 内容策略与文章写作助手。请严格按照下面的项目标准生成内容。",
    "",
    "## 项目背景",
    `主站：${project.domain || ""}`,
    `站点类型：${project.siteType || ""}`,
    `目标市场：${project.market || ""}`,
    `转化目标：${project.conversion || ""}`,
    `核心产品/类目词：${project.coreProducts || ""}`,
    "",
    "## 主站页面",
    project.mainPages || "未填写",
    "",
    "## 博客站分工",
    project.blogRoles || "未填写",
    "",
    "## P0 Locale / SERP Guardrail",
    localeInstruction(locale),
    "",
    locale.configured
      ? `Hard rule: write the final article in ${locale.language}. Use spelling, terminology, examples, compliance wording, and buying context that match ${locale.market}.`
      : "Hard rule: target market is missing. Do not produce a production-ready article; output Evidence Needed asking for target market/language.",
    `If doing Google SERP validation, it must use this locale: gl=${locale.googleGl || "not-set"}, hl=${locale.googleHl || "not-set"}.`,
    "Do not claim you checked Google top 10 unless real SERP data for this exact locale is provided in the brief or tool output.",
    "",
    "## 当前关键词 Brief",
    brief,
    "",
    ...articleBriefTemplateInstructions(),
    "## 必须遵守的内容规则",
    "1. 先按 Brief 判断页面类型；如果是集合页，不要写成普通博客文章。",
    "2. 如果是博客文章，必须先解决搜索意图，再自然导向父页面或主站承接页。",
    "3. 标题、H2、FAQ、内链、CTA 都要服务关键词意图，不要堆词。",
    "4. 每篇文章必须给出 Image Placement Map，并写清楚图片放在哪里、图片主题和 alt。",
    "5. References 是触发式模块，不是固定模块。普通经验、口味、场景、产品灵感文可以 0 引用。",
    "6. 如果使用了官方外部资料，正文最后使用 References，格式为：- 来源名: [具体锚文本](URL)。",
    "7. 如果没有使用外部资料，不要添加 References 标题，也不要硬塞 CDC/FDA/EPA。",
    "8. 涉及健康、安全、法规、年龄、电池回收时，只能引用官方或高可信来源，不要编造结论。",
    "9. 内部链接必须遵守锚文本规范：同一目标 URL 不要重复完全相同的锚文本；不要为了换表达而写生硬短语；如果不能自然变化，就减少链接次数。",
    "10. 只有 Brief 中资产状态为 existing 的目标资产，才允许在正文生成可点击内部链接；planned、missing、needs_review 只能写入 Internal Link Suggestions，不要伪造或提前链接。",
    "",
    "## 锚文本规范",
    `原则：${STANDARD.anchorTextRules?.purpose || "内部链接要自然、具体、服务读者下一步。"}`,
    "",
    "内部链接：",
    ...(STANDARD.anchorTextRules?.internalLinks || []).map((rule) => `- ${rule}`),
    "",
    "外部官方引用：",
    ...(STANDARD.anchorTextRules?.externalReferences || []).map((rule) => `- ${rule}`),
    "",
    "## 本文引用要求",
    refs.triggered
      ? refs.sources.map((source) => `- ${source.name}: [${source.label}](${source.url})`).join("\n")
      : "本文当前不触发官方引用，默认 0 引用；除非你在写作中确实使用了新的外部资料。",
    "",
    ...articleOutputFormatInstructions(),
    "## 输出结构要求",
    "请严格使用 WordPress 可导入的 Markdown 块格式，不要使用 YAML frontmatter。必须按下面顺序输出：",
    "1. `## Title`，下一行写文章标题。",
    "2. `## Meta Title`，下一行写 SEO title。",
    "3. `## Meta Description`，下一行写 140-160 字符左右的 meta description。",
    "4. `## URL Slug`，下一行写英文小写 slug。",
    "5. `## Primary Keyword: 主关键词`。",
    "6. `## Secondary Keywords: 关键词1, 关键词2, 关键词3`。",
    "7. `## Last Updated`，下一行写英文日期，例如 June 30, 2026。",
    "8. 从 `# H1` 开始输出正文。正文第一屏必须给一句话答案，不能绕半天才回答。",
    "9. 正文 H2 必须按 Brief 的 H2 结构与用户决策顺序组织。",
    "10. 正文必须体现原创证据、竞品缺口、E-E-A-T 线索；缺少真实证据时放入 `## Evidence Needed`，不要编造。",
    "11. 如果目标资产不是 existing，正文不要放可点击内部链接，只在 `## Internal Link Suggestions` 里列建议。",
    "12. 如果触发官方引用，正文最后输出 `## References`；不触发时不要输出 References 标题。",
    "13. 文章后输出 `## Image Placement Map`，写清楚图片用途、建议文件名、精确插入位置、目的和 alt。",
    "14. 最后输出 `## Content QA Checklist`，逐项说明文章 Brief 模板的关键项是否已满足。",
    "",
    "请输出完整 Markdown。不要解释你做了什么，直接给文章。",
  ].join("\n");
}
