import { mkdir, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { methodNotAllowed, readJson, sendJson } from "../http.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const articlesRoot = join(projectRoot, "generated-articles");

function sanitizePathPart(value, fallback) {
  const text = String(value || fallback || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

  return text || fallback;
}

function slugify(value) {
  return String(value || "seo-article")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function safeTarget(...parts) {
  const target = normalize(join(...parts));
  if (!target.startsWith(articlesRoot)) {
    throw new Error("文章保存路径越界。");
  }
  return target;
}

export async function handleArticlesRoute(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  const body = await readJson(request);
  const content = String(body.content || "");
  if (!content.trim()) {
    sendJson(response, 400, { error: "没有可保存的文章内容。" });
    return;
  }

  const siteName = sanitizePathPart(body.siteName || body.keyword?.assignedSite || "未分配站点", "未分配站点");
  const batchId = sanitizePathPart(body.batchId || "", "");
  const filename = `${slugify(body.slug || body.keyword?.keyword || "seo-article")}.md`;
  const directory = batchId ? safeTarget(articlesRoot, siteName, batchId) : safeTarget(articlesRoot, siteName);
  const target = safeTarget(directory, filename);

  await mkdir(directory, { recursive: true });
  await writeFile(target, content.trimEnd() + "\n", "utf8");

  sendJson(response, 200, {
    ok: true,
    siteName,
    batchId,
    filename,
    relativePath: batchId
      ? `generated-articles/${siteName}/${batchId}/${filename}`
      : `generated-articles/${siteName}/${filename}`,
    absolutePath: target,
    savedAt: new Date().toISOString(),
  });
}
