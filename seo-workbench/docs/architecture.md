# SEO Workbench Architecture

这个项目采用“模块化单体”。

它不像真正微服务那样需要多个进程、多个端口、服务注册和消息队列，但代码边界按微服务思路拆开了：

1. `workflow` 是业务标准层。
2. `server/routes` 是 API 层。
3. `app.js` 是前端交互层。
4. `workflows/seo-standard.json` 是规则配置层。

## 为什么先不做真微服务

真正微服务会带来额外成本：

1. 多服务部署。
2. 服务间通信。
3. 日志链路。
4. 鉴权同步。
5. 数据一致性。

当前 SEO 工具最重要的是流程稳定、标准可迭代、能快速验证。因此先做模块化单体更合适。

等后面有多人使用、任务队列、批量生成、成本统计、发布系统时，再拆成微服务。

## 以后怎么拆

可以按这个方向拆：

```text
seo-web              前端页面
seo-workflow-api     关键词分站、评分、Brief、Prompt
seo-ai-gateway       多模型 API 代理、成本记录、重试
seo-storage-api      项目、关键词、文章、版本、审核状态
seo-publisher        WordPress / Shopify / Webflow 发布
```

## 修改指南

如果 Semrush 导入字段不匹配：

```text
workflows/seo-standard.json -> csvColumnAliases
src/workflow/csv.mjs
src/workflow/file-import.mjs
src/workflow/xlsx.mjs
```

如果关键词分站不准：

```text
workflows/seo-standard.json -> signals
src/workflow/classifier.mjs
```

如果评分标准不准：

```text
workflows/seo-standard.json -> scoring
src/workflow/scorer.mjs
```

如果 Brief 结构要改：

```text
src/workflow/content-plan.mjs -> briefFor / outlineFor
```

如果 References 触发不准：

```text
workflows/seo-standard.json -> references
src/workflow/content-plan.mjs -> referencePlan
```

如果图片位置规则要改：

```text
workflows/seo-standard.json -> imagePlacements
src/workflow/content-plan.mjs -> imagePlanFor
```

如果 AI Prompt 要改：

```text
src/workflow/prompt.mjs
```

如果要接真实 AI：

```text
src/server/routes/generate.mjs
src/server/ai-stage-config.mjs
config/ai-stages.local.json
```

如果要调整不同阶段使用哪个 AI：

```text
网页端 -> AI 阶段路由
GET/POST /api/ai-stages
src/server/routes/generate.mjs
环境变量 -> AI_KEYWORD_ANALYSIS_URL / AI_ARTICLE_GENERATION_URL
```

如果使用 OpenAI 兼容中转站：

```text
网页端 -> 调用格式选择 openai-compatible
Base URL -> https://relay.example.com/v1
API Key -> 保存到 config/ai-stages.local.json
generate.mjs -> /chat/completions
```

如果要让网页端编辑更多标准配置：

```text
index.html -> standard 面板
app.js -> renderStandard / saveStandardFromEditor
app.js -> reloadStandardFromDisk
src/server/routes/workflow.mjs -> /api/workflow/standard
src/server/routes/workflow.mjs -> /api/workflow/standard/reload
```

如果前端展示错了：

```text
index.html
styles.css
app.js
```

如果要调整 Todo 模块：

```text
index.html -> todos 面板
app.js -> renderTodos / loadTodos / saveTodos
src/server/routes/todos.mjs
src/server/todos-store.mjs
data/todos.local.json
```

## 数据流

```text
Semrush CSV
  -> /api/workflow/import-csv 或 /api/workflow/import-file
  -> csv.mjs / xlsx.mjs / file-import.mjs
  -> classifier.mjs
  -> scorer.mjs
  -> content-plan.mjs
  -> app.js 展示
  -> /api/workflow/prompt
  -> /api/generate
  -> Markdown Article
```

## 核心原则

1. 前端不保存 API Key。
2. 规则先配置化，再代码化。
3. 关键词先判页面类型，再评分。
4. 主站可以写文章，不只是集合页。
5. 博客站不抢主站交易词。
6. References 不是每篇默认有。
7. 每次生成文章都要带 Brief、图片位置、内链策略和写作边界。
8. 不同 AI 阶段可以使用不同供应商，但密钥只放服务端。
9. OpenAI 兼容中转站走 openai-compatible；自定义服务走 raw-proxy。
10. Todo 用来承载项目路线图，保存到本地数据文件，不混在 SEO 标准配置里。
