import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const configPath = fileURLToPath(new URL("../../config/database.local.json", import.meta.url));
const EXPECTED_TABLES = ["articles", "keywords", "posts", "serp_snapshots", "sites", "tasks"];

function assertSafeSchema(schema = "seo_agent") {
  const clean = String(schema || "seo_agent").trim();
  if (!/^[a-z_][a-z0-9_]*$/i.test(clean)) {
    throw new Error("数据库 schema 名称不合法，只能使用字母、数字和下划线。");
  }
  return clean;
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function jsonArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function intValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function safeSiteStatus(value = "") {
  const status = cleanText(value || "active").toLowerCase();
  return ["active", "paused", "archived"].includes(status) ? status : "active";
}

function safePriority(value = "") {
  const priority = cleanText(value || "P3");
  return ["P0", "P1", "P2", "P3", "Hold"].includes(priority) ? priority : "P3";
}

function safeKeywordStatus(value = "") {
  const status = cleanText(value || "imported").toLowerCase();
  const mapped = {
    imported: "imported",
    analyzed: "analyzed",
    planned: "planned",
    queued: "queued",
    written: "written",
    generated: "written",
    uploaded: "published",
    published: "published",
    reviewed: "reviewed",
    hold: "hold",
    skipped: "hold",
    dropped: "dropped",
  };
  return mapped[status] || "imported";
}

function safePostFormat(value = "") {
  const format = cleanText(value || "unknown").toLowerCase();
  return ["markdown", "html", "mixed", "unknown"].includes(format) ? format : "unknown";
}

function safeArticleStatus(value = "") {
  const status = cleanText(value || "generated").toLowerCase();
  const mapped = {
    queued: "draft",
    running: "draft",
    generated: "generated",
    done: "generated",
    approved: "approved",
    uploaded: "published",
    published: "published",
    failed: "failed",
    archived: "archived",
  };
  return mapped[status] || "generated";
}

function maskConnectionString(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return raw.replace(/(:\/\/[^:\s]+:)([^@\s]+)(@)/, "$1****$3");
  }
}

function normalizeConfig(config = {}, { includeSecrets = false } = {}) {
  const connectionString = String(config.connectionString || process.env.DATABASE_URL || "").trim();
  const schema = String(config.schema || "seo_agent").trim() || "seo_agent";
  return {
    enabled: Boolean(config.enabled ?? connectionString),
    autoSync: Boolean(config.autoSync ?? false),
    schema,
    hasConnectionString: Boolean(connectionString),
    connectionString: includeSecrets ? connectionString : "",
    connectionPreview: maskConnectionString(connectionString),
    lastTestedAt: config.lastTestedAt || "",
    lastStatus: config.lastStatus || "",
    lastMessage: config.lastMessage || "",
  };
}

export function readDatabaseConfig(options = {}) {
  try {
    const data = JSON.parse(readFileSync(configPath, "utf8"));
    return normalizeConfig(data, options);
  } catch {
    return normalizeConfig({}, options);
  }
}

export function saveDatabaseConfig(config = {}) {
  const previous = readDatabaseConfig({ includeSecrets: true });
  const clear = Boolean(config.clearConnectionString);
  const connectionString = clear
    ? ""
    : String(config.connectionString || "").trim() || previous.connectionString || "";
  const next = normalizeConfig({
    ...previous,
    ...config,
    connectionString,
    schema: config.schema || previous.schema || "seo_agent",
  }, { includeSecrets: true });

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(next, null, 2), "utf8");
  return normalizeConfig(next);
}

export async function withDatabaseClient(fn, config = readDatabaseConfig({ includeSecrets: true })) {
  const normalized = normalizeConfig(config, { includeSecrets: true });
  if (!normalized.connectionString) {
    throw new Error("还没有配置 PostgreSQL 连接串。");
  }

  const client = new pg.Client({
    connectionString: normalized.connectionString,
    application_name: "seo-workbench-agent",
  });
  await client.connect();
  try {
    return await fn(client, normalized);
  } finally {
    await client.end().catch(() => {});
  }
}

export async function testDatabaseConnection(config = {}) {
  const saved = readDatabaseConfig({ includeSecrets: true });
  const candidate = normalizeConfig({
    ...saved,
    ...config,
    connectionString: String(config.connectionString || "").trim() || saved.connectionString,
    schema: config.schema || saved.schema || "seo_agent",
  }, { includeSecrets: true });

  const result = await withDatabaseClient(async (client, normalized) => {
    const nowResult = await client.query("select now() as now, current_database() as database, current_user as username");
    const tablesResult = await client.query(
      `select table_name
       from information_schema.tables
       where table_schema = $1
       order by table_name`,
      [normalized.schema],
    );
    const tables = tablesResult.rows.map((row) => row.table_name);
    const missingTables = EXPECTED_TABLES.filter((table) => !tables.includes(table));
    return {
      ok: missingTables.length === 0,
      connected: true,
      schema: normalized.schema,
      database: nowResult.rows[0]?.database || "",
      user: nowResult.rows[0]?.username || "",
      serverTime: nowResult.rows[0]?.now || "",
      tables,
      expectedTables: EXPECTED_TABLES,
      missingTables,
      message: missingTables.length
        ? `数据库已连接，但 ${normalized.schema} 缺少表：${missingTables.join(", ")}`
        : `数据库已连接，${normalized.schema} 的 6 张 Agent 基础表已就绪。`,
    };
  }, candidate);

  const status = result.ok ? "ok" : "schema_incomplete";
  saveDatabaseConfig({
    ...candidate,
    lastTestedAt: new Date().toISOString(),
    lastStatus: status,
    lastMessage: result.message,
  });
  return {
    ...result,
    config: readDatabaseConfig(),
  };
}

export async function readDatabaseSchemaStatus() {
  const config = readDatabaseConfig({ includeSecrets: true });
  if (!config.connectionString) {
    return {
      ok: false,
      connected: false,
      schema: config.schema,
      tables: [],
      expectedTables: EXPECTED_TABLES,
      missingTables: EXPECTED_TABLES,
      config: readDatabaseConfig(),
      message: "还没有配置 PostgreSQL 连接串。",
    };
  }
  return testDatabaseConnection(config);
}

async function upsertSite(client, schema, site = {}) {
  const siteKey = cleanText(site.siteKey || site.key || `${site.type || "site"}:${site.id || site.name || site.baseUrl || Date.now()}`);
  const profile = site.profile || {};
  const siteType = ["main", "wp", "blog", "other"].includes(site.type) ? site.type : "other";
  const result = await client.query(
    `insert into ${schema}.sites (
      site_key, name, site_type, domain, base_url, api_base_url, market, language_code,
      google_gl, google_hl, semrush_database, content_role, content_scope, is_main,
      allow_external_links, publish_config, api_config, status, notes, raw
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$20::jsonb
    )
    on conflict (site_key) do update set
      name = excluded.name,
      site_type = excluded.site_type,
      domain = excluded.domain,
      base_url = excluded.base_url,
      api_base_url = excluded.api_base_url,
      market = excluded.market,
      language_code = excluded.language_code,
      google_gl = excluded.google_gl,
      google_hl = excluded.google_hl,
      semrush_database = excluded.semrush_database,
      content_role = excluded.content_role,
      content_scope = excluded.content_scope,
      is_main = excluded.is_main,
      allow_external_links = excluded.allow_external_links,
      publish_config = excluded.publish_config,
      api_config = excluded.api_config,
      status = excluded.status,
      notes = excluded.notes,
      raw = excluded.raw
    returning id, site_key`,
    [
      siteKey,
      cleanText(site.name || site.siteUrl || site.apiBaseUrl || site.baseUrl || siteKey),
      siteType,
      cleanText(site.domain || site.siteUrl || site.baseUrl || ""),
      cleanText(site.baseUrl || site.siteUrl || site.url || ""),
      cleanText(site.apiBaseUrl || site.apiUrl || ""),
      cleanText(site.targetMarket || site.market || profile.targetMarket || ""),
      cleanText(site.targetLanguage || site.languageCode || profile.targetLanguage || ""),
      cleanText(site.googleGl || profile.googleGl || ""),
      cleanText(site.googleHl || profile.googleHl || ""),
      cleanText(site.semrushDatabase || profile.semrushDatabase || ""),
      cleanText(site.contentRole || profile.contentRole || ""),
      cleanText(site.contentScope || ""),
      siteType === "main" || Boolean(site.isMain),
      Boolean(site.allowExternalLinks),
      json(site.publishConfig || {}),
      json({
        id: site.id || "",
        key: site.key || "",
        hasOpenApiKey: Boolean(site.openApiKeySet || site.tokenSet || site.apiKeySet),
      }),
      safeSiteStatus(site.status || "active"),
      cleanText(site.incompatibleReason || site.notes || ""),
      json(site),
    ],
  );
  return result.rows[0];
}

async function findKeywordId(client, schema, keyword = {}) {
  const result = await client.query(
    `select id
     from ${schema}.keywords
     where normalized_keyword = lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
       and coalesce(semrush_database, '') = coalesce($2, '')
       and coalesce(market, '') = coalesce($3, '')
       and coalesce(language_code, '') = coalesce($4, '')
     limit 1`,
    [
      cleanText(keyword.keyword),
      cleanText(keyword.database || keyword.semrushDatabase || ""),
      cleanText(keyword.locale?.rawMarket || keyword.market || ""),
      cleanText(keyword.locale?.languageCode || keyword.languageCode || ""),
    ],
  );
  return result.rows[0]?.id || null;
}

async function upsertKeyword(client, schema, keyword = {}, siteIdByKey = new Map()) {
  if (!cleanText(keyword.keyword)) return null;
  const existingId = await findKeywordId(client, schema, keyword);
  const assignedSiteId = siteIdByKey.get(keyword.siteKey || keyword.assignedSiteKey || "") || null;
  const values = [
    cleanText(keyword.keyword),
    cleanText(keyword.source || "semrush"),
    cleanText(keyword.sourceFile || ""),
    cleanText(keyword.database || keyword.semrushDatabase || ""),
    cleanText(keyword.locale?.rawMarket || keyword.market || ""),
    cleanText(keyword.locale?.languageCode || keyword.languageCode || ""),
    cleanText(keyword.locale?.googleGl || keyword.googleGl || ""),
    cleanText(keyword.locale?.googleHl || keyword.googleHl || ""),
    intValue(keyword.volume),
    numberValue(keyword.kd ?? keyword.difficulty),
    numberValue(keyword.cpc),
    cleanText(keyword.intent || ""),
    jsonArray(String(keyword.serpFeatures || "").split(/[,;|]/).map((item) => item.trim()).filter(Boolean)),
    cleanText(keyword.topicCluster || ""),
    cleanText(keyword.seedKeyword || ""),
    cleanText(keyword.pageGroup || ""),
    assignedSiteId,
    cleanText(keyword.assignedSite || ""),
    cleanText(keyword.pageType || ""),
    cleanText(keyword.pageRole || ""),
    cleanText(keyword.targetAsset || keyword.targetAssetUrl || ""),
    cleanText(keyword.assetStatus || ""),
    cleanText(keyword.contentAction || ""),
    safePriority(keyword.priority || "P3"),
    numberValue(keyword.scores?.total ?? keyword.score, null),
    safeKeywordStatus(keyword.status || (keyword.aiReview ? "analyzed" : "imported")),
    cleanText(keyword.reason || keyword.assetReason || ""),
    json(keyword.aiReview || {}),
    json(keyword),
  ];

  if (existingId) {
    const result = await client.query(
      `update ${schema}.keywords set
        source=$1, source_file=$2, semrush_database=$3, market=$4, language_code=$5,
        google_gl=$6, google_hl=$7, volume=$8, kd=$9, cpc=$10, intent=$11,
        serp_features=$12::jsonb, topic_cluster=$13, seed_keyword=$14, page_group=$15,
        assigned_site_id=$16, assigned_site_label=$17, page_type=$18, page_role=$19,
        target_asset_url=$20, asset_status=$21, content_action=$22, priority=$23,
        score=$24, status=$25, reason=$26, ai_review=$27::jsonb, raw=$28::jsonb
       where id=$29
       returning id`,
      [...values.slice(1), existingId],
    );
    return result.rows[0]?.id || existingId;
  }

  const result = await client.query(
    `insert into ${schema}.keywords (
      keyword, source, source_file, semrush_database, market, language_code, google_gl, google_hl,
      volume, kd, cpc, intent, serp_features, topic_cluster, seed_keyword, page_group,
      assigned_site_id, assigned_site_label, page_type, page_role, target_asset_url, asset_status,
      content_action, priority, score, status, reason, ai_review, raw
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28::jsonb,$29::jsonb
    )
    returning id`,
    values,
  );
  return result.rows[0]?.id || null;
}

async function upsertPost(client, schema, post = {}, siteIdByKey = new Map(), keywordIdByFrontendId = new Map()) {
  const siteId = siteIdByKey.get(post.siteKey || "") || siteIdByKey.get(post.sourceSiteKey || "") || null;
  if (!siteId || !cleanText(post.title || post.name || post.slug || post.url || post.link)) return null;
  const externalId = cleanText(post.externalId || post.id || "");
  const url = cleanText(post.url || post.link || post.permalink || "");
  let existing = null;
  if (externalId) {
    const result = await client.query(`select id from ${schema}.posts where site_id=$1 and external_id=$2 limit 1`, [siteId, externalId]);
    existing = result.rows[0]?.id || null;
  }
  if (!existing && url) {
    const result = await client.query(`select id from ${schema}.posts where site_id=$1 and url=$2 limit 1`, [siteId, url]);
    existing = result.rows[0]?.id || null;
  }

  const values = [
    siteId,
    externalId,
    cleanText(post.title || post.name || post.slug || "Untitled"),
    cleanText(post.slug || post.handle || ""),
    url,
    cleanText(post.status || ""),
    cleanText(post.author || post.author_name || ""),
    cleanText(post.categoryId || post.category_id || ""),
    cleanText(post.languageCode || post.language_code || ""),
    cleanText(post.market || ""),
    keywordIdByFrontendId.get(post.primaryKeywordId || post.keywordId || "") || null,
    cleanText(post.primaryKeyword || post.keyword || ""),
    cleanText(post.topicCluster || ""),
    cleanText(post.pageType || ""),
    safePostFormat(post.format || post.contentFormat || "unknown"),
    post.content_md || post.contentMd || "",
    post.content_html || post.contentHtml || post.content || "",
    cleanText(post.excerpt || post.description || post.descript || ""),
    cleanText(post.metaTitle || post.meta_title || ""),
    cleanText(post.metaDescription || post.meta_description || post.meta_descript || ""),
    jsonArray(post.metaKeywords || post.meta_keywords || []),
    cleanText(post.coverUrl || post.cover_url || post.image || ""),
    post.publishedAt || post.published_at || null,
    post.modifiedAt || post.modified_at || null,
    cleanText(post.source || "api"),
    json(post),
  ];

  if (existing) {
    await client.query(
      `update ${schema}.posts set
        site_id=$1, external_id=$2, title=$3, slug=$4, url=$5, status=$6, author=$7, category_id=$8,
        language_code=$9, market=$10, primary_keyword_id=$11, primary_keyword=$12,
        topic_cluster=$13, page_type=$14, content_format=$15, content_md=$16,
        content_html=$17, excerpt=$18, meta_title=$19, meta_description=$20,
        meta_keywords=$21::jsonb, cover_url=$22, published_at=$23, modified_at=$24,
        fetched_at=now(), source=$25, raw=$26::jsonb
       where id=$27`,
      [...values, existing],
    );
    return existing;
  }

  const result = await client.query(
    `insert into ${schema}.posts (
      site_id, external_id, title, slug, url, status, author, category_id, language_code, market,
      primary_keyword_id, primary_keyword, topic_cluster, page_type, content_format, content_md,
      content_html, excerpt, meta_title, meta_description, meta_keywords, cover_url,
      published_at, modified_at, source, raw
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23,$24,$25,$26::jsonb
    )
    returning id`,
    values,
  );
  return result.rows[0]?.id || null;
}

async function insertSerpSnapshot(client, schema, serp = {}, keywordIdByFrontendId = new Map()) {
  if (!cleanText(serp.query || serp.keyword)) return null;
  const result = await client.query(
    `insert into ${schema}.serp_snapshots (
      keyword_id, keyword, engine, google_gl, google_hl, location, requested_at, top_result_count,
      organic_results, related_questions, related_searches, page_type_summary, intent_summary,
      competitor_gaps, raw
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb,$15::jsonb)
    returning id`,
    [
      keywordIdByFrontendId.get(serp.keywordId || "") || null,
      cleanText(serp.query || serp.keyword),
      cleanText(serp.engine || "google"),
      cleanText(serp.gl || serp.googleGl || ""),
      cleanText(serp.hl || serp.googleHl || ""),
      cleanText(serp.location || ""),
      serp.requestedAt || new Date().toISOString(),
      Array.isArray(serp.organicResults) ? serp.organicResults.length : 0,
      jsonArray(serp.organicResults || []),
      jsonArray(serp.relatedQuestions || []),
      jsonArray(serp.relatedSearches || []),
      cleanText(serp.pageTypeSummary || ""),
      cleanText(serp.intentSummary || ""),
      jsonArray(serp.competitorGaps || []),
      json(serp),
    ],
  );
  return result.rows[0]?.id || null;
}

async function upsertTask(client, schema, task = {}, siteIdByKey = new Map(), keywordIdByFrontendId = new Map()) {
  const frontendId = cleanText(task.id || task.taskId || "");
  if (!frontendId) return null;
  const existing = await client.query(`select id from ${schema}.tasks where payload->>'frontendId' = $1 limit 1`, [frontendId]);
  const siteId = siteIdByKey.get(task.siteKey || "") || null;
  const keywordId = keywordIdByFrontendId.get(task.keywordId || "") || null;
  const taskType = cleanText(task.taskType || (task.planningDecision === "update_article" ? "update_article" : "new_article"));
  const safeTaskType = ["keyword_review", "serp_check", "new_article", "update_article", "internal_link", "publish", "review", "product_extract"].includes(taskType)
    ? taskType
    : "new_article";
  const statusMap = {
    queued: "queued",
    running: "running",
    serp_ready: "running",
    generated: "done",
    uploaded: "done",
    failed: "failed",
    skipped: "skipped",
  };
  const status = statusMap[task.status] || "queued";
  const payload = { ...task, frontendId };
  const values = [
    safeTaskType,
    status,
    cleanText(task.priority || "P2") || "P2",
    numberValue(task.score, null),
    siteId,
    keywordId,
    null,
    cleanText(task.targetUrl || ""),
    cleanText(task.title || task.keyword || ""),
    json(payload),
    Array.isArray(task.requiredData) ? task.requiredData : [],
    json({
      planningDecision: task.planningDecision || "",
      reason: task.message || "",
      step: task.step || "",
    }),
    jsonArray(task.logs || []),
    cleanText(task.error || task.errorMessage || ""),
    task.startedAt || null,
    task.finishedAt || null,
  ];

  if (existing.rows[0]?.id) {
    await client.query(
      `update ${schema}.tasks set
        task_type=$1, status=$2, priority=$3, score=$4, site_id=$5, keyword_id=$6,
        serp_snapshot_id=$7, target_url=$8, title=$9, payload=$10::jsonb,
        required_data=$11, decision=$12::jsonb, logs=$13::jsonb, error_message=$14,
        started_at=$15, finished_at=$16
       where id=$17`,
      [...values, existing.rows[0].id],
    );
    return existing.rows[0].id;
  }
  const result = await client.query(
    `insert into ${schema}.tasks (
      task_type, status, priority, score, site_id, keyword_id, serp_snapshot_id, target_url,
      title, payload, required_data, decision, logs, error_message, started_at, finished_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14,$15,$16)
    returning id`,
    values,
  );
  return result.rows[0]?.id || null;
}

async function upsertArticle(client, schema, article = {}, siteIdByKey = new Map(), keywordIdByFrontendId = new Map()) {
  if (!cleanText(article.title || article.keyword || article.slug)) return null;
  const savedPath = cleanText(article.savedPath || article.relativePath || "");
  let existing = null;
  if (savedPath) {
    const result = await client.query(`select id from ${schema}.articles where saved_path=$1 limit 1`, [savedPath]);
    existing = result.rows[0]?.id || null;
  }
  const values = [
    null,
    siteIdByKey.get(article.siteKey || "") || null,
    keywordIdByFrontendId.get(article.keywordId || "") || null,
    null,
    cleanText(article.title || article.keyword || "Untitled"),
    cleanText(article.slug || ""),
    cleanText(article.targetUrl || article.publishedUrl || ""),
    safeArticleStatus(article.status || (article.uploadedAt ? "published" : "generated")),
    cleanText(article.siteLanguage || article.languageCode || ""),
    cleanText(article.siteMarket || article.market || ""),
    article.brief || article.briefMd || "",
    article.prompt || article.promptText || "",
    article.content || article.contentMd || "",
    article.contentHtml || "",
    json(article.articleParts || {}),
    cleanText(article.metaTitle || ""),
    cleanText(article.metaDescription || ""),
    cleanText(article.keyword || article.primaryKeyword || ""),
    Array.isArray(article.secondaryKeywords) ? article.secondaryKeywords : [],
    jsonArray(article.internalLinkPlan || []),
    jsonArray(article.imagePlan || []),
    jsonArray(article.referencesPlan || []),
    jsonArray(article.qaChecklist || []),
    cleanText(article.provider || article.generationProvider || ""),
    cleanText(article.model || article.generationModel || ""),
    cleanText(article.publishedPostId || ""),
    cleanText(article.publishedUrl || ""),
    article.uploadedAt || article.publishedAt || null,
    savedPath,
    cleanText(article.logPath || article.logRelativePath || ""),
    json(article.rawAiResponse || article),
  ];
  if (existing) {
    await client.query(
      `update ${schema}.articles set
        task_id=$1, site_id=$2, keyword_id=$3, serp_snapshot_id=$4, title=$5, slug=$6,
        target_url=$7, status=$8, language_code=$9, market=$10, brief_md=$11,
        prompt_text=$12, content_md=$13, content_html=$14, article_parts=$15::jsonb,
        meta_title=$16, meta_description=$17, primary_keyword=$18, secondary_keywords=$19,
        internal_link_plan=$20::jsonb, image_plan=$21::jsonb, references_plan=$22::jsonb,
        qa_checklist=$23::jsonb, generation_provider=$24, generation_model=$25,
        published_post_id=$26, published_url=$27, published_at=$28, saved_path=$29,
        log_path=$30, raw_ai_response=$31::jsonb
       where id=$32`,
      [...values, existing],
    );
    return existing;
  }
  const result = await client.query(
    `insert into ${schema}.articles (
      task_id, site_id, keyword_id, serp_snapshot_id, title, slug, target_url, status,
      language_code, market, brief_md, prompt_text, content_md, content_html, article_parts,
      meta_title, meta_description, primary_keyword, secondary_keywords, internal_link_plan,
      image_plan, references_plan, qa_checklist, generation_provider, generation_model,
      published_post_id, published_url, published_at, saved_path, log_path, raw_ai_response
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,
      $20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb,$24,$25,$26,$27,$28,$29,$30,$31::jsonb
    )
    returning id`,
    values,
  );
  return result.rows[0]?.id || null;
}

export async function syncWorkspaceToDatabase(snapshot = {}) {
  return withDatabaseClient(async (client, config) => {
    const schema = assertSafeSchema(config.schema);
    await client.query("begin");
    try {
      const siteIdByKey = new Map();
      const keywordIdByFrontendId = new Map();
      const counts = { sites: 0, keywords: 0, posts: 0, serpSnapshots: 0, tasks: 0, articles: 0 };

      for (const site of snapshot.sites || []) {
        const row = await upsertSite(client, schema, site);
        if (row?.id) {
          siteIdByKey.set(site.siteKey || site.key || row.site_key, row.id);
          counts.sites += 1;
        }
      }

      for (const keyword of snapshot.keywords || []) {
        const id = await upsertKeyword(client, schema, keyword, siteIdByKey);
        if (id) {
          if (keyword.id) keywordIdByFrontendId.set(keyword.id, id);
          counts.keywords += 1;
        }
      }

      for (const post of snapshot.posts || []) {
        const id = await upsertPost(client, schema, post, siteIdByKey, keywordIdByFrontendId);
        if (id) counts.posts += 1;
      }

      for (const serp of snapshot.serpSnapshots || []) {
        const id = await insertSerpSnapshot(client, schema, serp, keywordIdByFrontendId);
        if (id) counts.serpSnapshots += 1;
      }

      for (const task of snapshot.tasks || []) {
        const id = await upsertTask(client, schema, task, siteIdByKey, keywordIdByFrontendId);
        if (id) counts.tasks += 1;
      }

      for (const article of snapshot.articles || []) {
        const id = await upsertArticle(client, schema, article, siteIdByKey, keywordIdByFrontendId);
        if (id) counts.articles += 1;
      }

      await client.query("commit");
      return {
        ok: true,
        syncedAt: new Date().toISOString(),
        counts,
        message: `已同步到 PostgreSQL：站点 ${counts.sites}、关键词 ${counts.keywords}、文章库存 ${counts.posts}、SERP ${counts.serpSnapshots}、任务 ${counts.tasks}、生成文章 ${counts.articles}。`,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

export async function readDatabaseMemorySummary() {
  return withDatabaseClient(async (client, config) => {
    const schema = assertSafeSchema(config.schema);
    const result = await client.query(
      `select 'sites' as name, count(*)::int as count from ${schema}.sites
       union all select 'keywords', count(*)::int from ${schema}.keywords
       union all select 'posts', count(*)::int from ${schema}.posts
       union all select 'serp_snapshots', count(*)::int from ${schema}.serp_snapshots
       union all select 'tasks', count(*)::int from ${schema}.tasks
       union all select 'articles', count(*)::int from ${schema}.articles`,
    );
    return {
      ok: true,
      schema,
      counts: Object.fromEntries(result.rows.map((row) => [row.name, row.count])),
      readAt: new Date().toISOString(),
    };
  });
}

export async function resetDatabaseMemory() {
  return withDatabaseClient(async (client, config) => {
    const schema = assertSafeSchema(config.schema);
    await client.query(
      `truncate table
        ${schema}.articles,
        ${schema}.tasks,
        ${schema}.serp_snapshots,
        ${schema}.posts,
        ${schema}.keywords,
        ${schema}.sites
       cascade`,
    );
    return {
      ok: true,
      schema,
      resetAt: new Date().toISOString(),
      counts: {
        sites: 0,
        keywords: 0,
        posts: 0,
        serp_snapshots: 0,
        tasks: 0,
        articles: 0,
      },
      message: "数据库记忆库已清空。后续请重新同步当前工作台或重新拉取站点数据。",
    };
  });
}
