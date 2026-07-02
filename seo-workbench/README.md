# SEO Workbench

一个本地可运行、后续可部署的 Google SEO 关键词与内容规划项目。

它把我们前面沉淀的流程拆成了 5 层：

1. 前端界面：负责导入、查看、选择、导出。
2. 工作流 API：负责关键词分站、评分、Brief、Prompt、文章规则。
3. 内容资产层：负责判断已有页面、规划页面、文章缺口、内链建议和发布状态。
4. 规则配置：负责沉淀 Excel 表结构、分词标准、引用规则、图片规则。
5. AI 代理：以后统一接 OpenAI、Claude、Gemini、DeepSeek 或其他模型。

当前是“模块化单体”结构，开发和部署都简单；未来如果需要，可以把 `/api/workflow`、`/api/generate`、发布系统、数据存储拆成真正微服务。

## 现在网页端可以做什么

1. 在页面里修改 SEO 标准配置，并保存回 `workflows/seo-standard.json`。
2. 直接上传 Semrush 导出的 `.csv`、`.tsv`、`.xlsx` 关键词表。
3. 粘贴 CSV 内容快速测试。
4. 对关键词进行主站/博客站分配、主题集群、页面角色、内容动作和优先级判断。
5. 生成单个关键词的结构化文章 Brief、Prompt、图片位置规划、内链建议和 References 触发判断。
6. 按阶段配置不同 AI 供应商，例如关键词分析用 DeepSeek，文章生成用 OpenAI 或 OpenAI 兼容中转站。
7. 导出关键词分配表、内容日历、项目 JSON 和标准 JSON。
8. 在 Todo 模块记录后续待做、缺口、问题修复和路线图。

## 启动

进入项目目录：

```bash
cd seo-workbench
npm start
```

打开：

```text
http://localhost:5177
```

如果要改端口：

```bash
$env:PORT="3000"
npm start
```

## 目录结构

```text
seo-workbench/
  index.html                 前端页面
  styles.css                 页面样式
  app.js                     前端交互，只调用后端 API
  package.json               本地项目入口
  server.example.mjs         兼容入口，转到 src/server
  workflows/
    seo-standard.json        SEO/Excel 流程标准配置
  src/
    server/
      index.mjs              本地 HTTP 服务
      http.mjs               请求/响应工具
      routes/
        workflow.mjs         SEO 工作流 API
        site-snapshot.mjs    站点 API 数据源预览
        ai-stages.mjs        AI 阶段配置保存
        todos.mjs            Todo 保存
        generate.mjs         AI 生成代理 API
    workflow/
      standard.mjs           读取规则配置
      csv.mjs                Semrush CSV 解析
      classifier.mjs         搜索意图与分站判断
      scorer.mjs             关键词量化评分
      content-plan.mjs       Brief、图片、引用、模拟文章
      prompt.mjs             AI 写作 Prompt
      index.mjs              工作流统一出口
```

## 工作流 API

本地服务提供这些接口：

```text
GET  /api/health
GET  /api/workflow/standard
POST /api/workflow/standard
POST /api/workflow/standard/reload
GET  /api/workflow/sample
POST /api/workflow/import-csv
POST /api/workflow/import-file
POST /api/workflow/analyze
POST /api/workflow/brief
POST /api/workflow/prompt
POST /api/workflow/mock-article
POST /api/workflow/project-package
POST /api/generate
GET  /api/todos
POST /api/todos
POST /api/site-snapshot
```

前端不再直接写死 SEO 逻辑，而是调用这些接口。

这意味着后续如果“关键词怎么分站”“怎么打分”“哪些词要写文章”“References 什么时候触发”出了问题，优先改 `src/workflow/` 和 `workflows/seo-standard.json`。

`重新读取标准` 会调用 `/api/workflow/standard/reload`，强制从 `workflows/seo-standard.json` 重新加载到服务端内存。

`保存标准` 会调用 `/api/workflow/standard`，把页面里的 JSON 写回 `workflows/seo-standard.json`，并刷新服务端内存标准。

## 导入 Semrush 关键词表

网页端现在支持两种方式：

1. 上传文件：支持 `.csv`、`.tsv`、`.xlsx`，选择文件后会自动导入。
2. 粘贴 CSV：适合快速测试或复制少量关键词。

建议 Semrush 表里包含这些列：

```text
Keyword
Volume
Keyword Difficulty / KD
Intent
URL
```

只要有 `Keyword` 列就能导入；其他列缺失时会按默认值处理。

`.xlsx` 解析器是项目内置的轻量解析器，适合读取 Semrush 这种普通工作表。如果后续遇到复杂 Excel 格式，可以再替换为专业库或服务端 Python 解析。

Semrush 的 Keywords / Pages 导出都可以识别。对于带有 `Keywords` 和 `Pages` 两个 sheet 的文件，系统会优先使用字段更完整的 `Keywords` 原始数据表；对于只有 Pages 透视表的文件，也兼容 `Volume2`、`Keyword Difficulty2`、`Page URL`、`Landing Page` 等表头。

## 网站定位输入卡是否参与分析

会参与。

页面里的主站域名、网站类型、目标市场、转化目标、核心产品/类目词、主站商业页面、博客站群定位，会通过 `readProject()` 传给这些流程：

1. 关键词导入与分析。
2. 单关键词 Brief。
3. AI Prompt。
4. 项目 JSON 导出。

当前机器分站评分主要依据关键词、搜索意图、商业信号、KD、搜索量和规则配置；其中“核心产品/类目词”和“主站商业页面路径”会参与判断关键词是否属于当前业务核心。网站定位还会用于 Brief、Prompt、目标资产、内容动作和 AI 判断。

主站商业页面会参与“目标资产”推荐：系统会优先从你填写的页面里匹配关键词相关路径；如果没有匹配到，会把目标资产标记为 `planned` 或 `needs_review`，不会在文章正文里强行生成真实链接。后续如果要让“目标市场、现有页面覆盖情况、库存/利润”等更深度影响分站评分，可以继续改 `src/workflow/scorer.mjs`、`classifier.mjs` 和 `assets.mjs`。

## 分站评分结果从哪里来

分站评分结果是基于“已导入的关键词”计算出来的第一轮机器判断。它不会自动代表真实 Google SERP，也不会在没有导入关键词时凭空生成结果。

计算链路是：

1. Semrush 关键词表导入。
2. 解析 Keyword、Topic、Seed keyword、Page、Page type、Volume、KD、Intent、URL 等字段。
3. 按 `workflows/seo-standard.json` 里的信号词和规则判断搜索意图、页面类型和目标站点。
4. 结合主题集群、页面角色和内容资产状态，判断是新建、更新、人工确认还是只做内链建议。
5. 按需求、难度、商业价值、内容可写性、站点匹配、风险扣分生成总分和 P0/P1/P2/P3。
6. 选择具体关键词后，再结合网站定位生成 Brief、Prompt、目标资产和文章规划。

因此它适合作为“关键词初筛和分工表”，上线前仍建议对 P0/P1 词人工看 Google SERP。

### 本地规则和 AI 的分工

默认分站表先用本地 SEO 标准打分，这样有几个好处：

1. 导入 1000+ 关键词时速度快、成本为 0。
2. 同一批规则每次运行结果稳定，方便复盘。
3. 不会因为 AI 输出格式飘掉导致整张表不可用。

Step 04 的关键词分站表现在默认只展示本地规则结果，不再让 AI 直接把分站、页面类型和评分写回表格。这样可以保证整张关键词表的判断口径稳定，方便复盘和改规则。

如果要结合站点现有文章、站点角色和关键词机会做进一步判断，推荐去“站点内容中枢”里先读取目标站点文章，再做 AI 诊断、内容机会规划和后续生成。

推荐用法是：

1. 本地规则先跑完整表，做第一轮低成本初筛。
2. 选择具体站点，进入“站点内容中枢”读取该站文章和关键词机会。
3. 先做站点级 AI 诊断，再决定是更新旧文还是生成新文。
4. 如果 AI 经常指出同一类规则问题，把这个规律写回 `workflows/seo-standard.json` 或分类器。

如果你换了一个新网站，推荐先填写：

1. 主站域名。
2. 网站类型。
3. 目标市场。
4. 转化目标。
5. 核心产品/类目词。
6. 主站商业页面。
7. 博客站群定位。

填完后点击“按当前定位重新分析”，系统会用同一批关键词按新网站定位重新分站和推荐承接页。

## SEO 标准配置的作用

SEO 标准配置不是某一个网站的资料库，它更像一份“方法论模板”：

1. 哪些关键词信号代表交易、对比、场景、知识、风险。
2. 哪些词应该分给主站集合页、主站博客、博客 A/B/C。
3. P0/P1/P2 的评分阈值。
4. 文章 Brief 模板、References、图片位置和写作边界。

换网站时，优先改 Step 01 的网站定位；只有当你的 SEO 方法论本身变了，比如“best 词不再默认进主站博客”或“P1 阈值要调高”，才改 Step 02 的标准配置。

## 自动保存与刷新恢复

页面会把当前项目草稿自动保存到本机浏览器，内容包括：

1. 网站定位。
2. 导入后的关键词和分站评分结果。
3. 当前选中的关键词。
4. Brief、Prompt 和生成文章草稿。
5. 分页和筛选状态。

刷新页面时，会优先恢复本机草稿；没有草稿时保持空项目状态，等待导入真实关键词或后续 API 数据。

## 站点 API 数据源预留

网站定位卡里可以填写：

```text
主站页面 API
主站文章 API
博客站 API 列表
```

点击“测试抓取 API 数据源”会调用 `POST /api/site-snapshot`，检查这些 API 是否能返回 JSON，并显示数量、字段名和示例字段。

当前这个接口只做“可读取性检查”和结构预览；下一步可以把它升级为：

1. 自动读取主站商业页面。
2. 自动读取主站博客文章。
3. 自动读取博客站群文章。
4. 对比关键词库，判断哪些词已有内容、哪些词需要新写、哪些词需要合并或重写。

## 主题集群与内容资产状态

关键词导入后不再只是一张散词表。系统会尽量保留 Semrush 的 `Topic`、`Seed keyword`、`Page`、`Page type` 等字段，并生成这些规划字段：

1. `Topic Cluster`：关键词所属主题，用来避免一堆散词各写一篇。
2. `Page Role`：页面角色，例如商业集合页、购买前教育、知识支持、场景支持、对比支持。
3. `Target Asset`：推荐承接资产，可能是已存在页面，也可能是规划 URL。
4. `Asset Status`：`existing`、`planned`、`needs_review`、`missing`。
5. `Content Action`：建议动作，例如新建文章、先建商业页、更新已有页、人工确认承接页。

文章生成时遵守一个硬规则：

```text
只有 Asset Status = existing 的目标资产，才能在正文生成可点击内部链接。
planned / missing / needs_review 只能输出 Internal Link Suggestions，不能伪造链接。
```

后续当主站页面、主站博客、博客站文章通过 API 导入后，这一层会升级为真正的内容资产库，用来分析文章主题、已有内链、缺失内链、重复内容、更新建议和发布状态。

## 分站表分页

分站评分结果已经做了前端分页，默认每页 50 条，可以切换 25、100、200。这样导入 1000 条关键词时，“全部”区域不会一次显示所有行。

当前分页发生在浏览器端，适合几百到几千条关键词。如果后续关键词库达到几万条，建议把关键词结果保存到数据库，再改为真正的服务端分页/Ajax 查询。

## Excel 流程标准在哪里

核心标准在：

```text
workflows/seo-standard.json
```

这里沉淀了：

1. Semrush 导入字段别名。
2. 主站、博客A、博客B、博客C、暂不做的分配规则。
3. 风险词、交易词、对比词、场景词、知识词信号。
4. 关键词评分阈值。
5. 关键词分配表字段。
6. 文章 Brief 表字段和完整模板模块。
7. 内容日历表字段。
8. References 触发规则。
9. 图片位置与 alt 规则。
10. 文章写作边界。

这份 JSON 就是从 Excel 流程抽取出来的“标准骨架”。

后面如果你觉得某个标准不对，比如“best 词不一定都给主站博客”，就可以先改这份规则，再改 `classifier.mjs` 里对应判断。

网页端的“SEO 标准配置”面板会直接显示和保存这份 JSON。保存后，重新分析关键词即可让新规则生效。

## 文章 Brief 模板如何进入 Prompt

`workflows/seo-standard.json` 里现在有 `articleBriefTemplate`，它来自原 Excel 的「文章Brief模板」页，包含：

1. 主关键词、父级商业页、用户问题、搜索意图、文章类型。
2. 一句话答案、H2结构、原创证据、竞品缺口。
3. 内链、CTA、图片/表格、图片插入位置、FAQ。
4. References触发判断、E-E-A-T、发布后复盘、是否更新。

生成 Brief 时，`src/workflow/content-plan.mjs` 会把这些模块按当前关键词、网站定位、目标资产、图片规则和引用规则填好。

生成 Prompt 时，`src/workflow/prompt.mjs` 会把这套模板作为硬性写作约束传给 AI：缺数据要写 Evidence Needed 或 Internal Link Suggestions，不能编造；目标资产不是 `existing` 时，正文不能生成可点击内部链接。

## AI API 接入

API Key 不保存在浏览器 localStorage。

网页端“AI 阶段路由”里填写的 Key 会保存到服务端本地文件：

```text
config/ai-stages.local.json
```

这个文件已经被 `config/.gitignore` 忽略，不建议提交到 Git。

## Todo 待做清单

网页端底部有“待做清单”模块，用来记录之后要做什么、缺什么能力、哪个流程需要优化。

Todo 会保存到：

```text
data/todos.local.json
```

这个文件已经被 `data/.gitignore` 忽略，不会默认提交到 Git。

建议用法：

1. P0：当前必须打通的能力，例如真实 AI API、真实 Semrush 表测试。
2. P1：影响效率的重要能力，例如 SQLite 保存历史、批量生成。
3. P2：体验优化，例如筛选、排序、图表。
4. P3：以后可能会做的想法。

### OpenAI 兼容中转站怎么填

如果你使用的是 OpenAI 兼容中转站，一般这样填：

```text
供应商：openai / deepseek / custom 都可以
调用格式：OpenAI 兼容中转站
Base URL：https://你的中转站域名/v1
API Key：你的中转站 key
模型名称：中转站支持的模型名，例如 gpt-4.1-mini、deepseek-chat
本地代理端点：/api/generate
```

如果你的中转站给的是完整地址：

```text
https://你的中转站域名/v1/chat/completions
```

也可以直接填到 Base URL。系统会自动识别。

保存后，页面只会显示密钥状态，例如 `sk-...abcd`，不会把完整 Key 回传到浏览器。

### DeepSeek 怎么配置

如果你现在所有阶段都用 DeepSeek：

1. 在“AI 阶段路由”点击“全部阶段使用 DeepSeek”。
2. 在“统一 DeepSeek API Key”里填写你的 DeepSeek API Key。
3. 点击“把这个 Key 应用到全部阶段”。
4. 确认调用格式是 `OpenAI 兼容中转站`。
5. Base URL 是 `https://api.deepseek.com`。
6. 关键词分析建议模型 `deepseek-v4-flash`。
7. 文章生成和内容优化建议模型 `deepseek-v4-pro`。
8. 点击“保存到服务端”。

DeepSeek 官方接口是 OpenAI 兼容格式。系统会把 `https://api.deepseek.com` 自动请求到 `/chat/completions`。

如果点击保存后看起来没生效，先检查三件事：

1. 页面必须通过 `http://localhost:5177` 打开，不能直接双击 `index.html`。
2. 终端里必须正在运行 `npm start`。
3. 保存成功后，项目里应该出现 `config/ai-stages.local.json`，页面会显示几个阶段已配置 API Key。

推荐结构：

```text
浏览器页面 -> /api/generate -> 你的服务端代理 -> 模型供应商 API
```

当前 `/api/generate` 支持两种调用格式：

```text
openai-compatible：把 Prompt 包成 OpenAI Chat Completions 格式，适合大多数 OpenAI 兼容中转站。
raw-proxy：把 SEO Workbench 的 payload 原样转发给你的自定义接口。
```

你也可以不用网页保存 Key，改用环境变量覆盖：

```bash
$env:AI_PROXY_URL="https://your-api.example.com/generate"
$env:AI_PROXY_KEY="your-server-side-key"
npm start
```

如果你要按阶段接入不同模型，可以设置阶段专属环境变量：

```bash
$env:AI_KEYWORD_ANALYSIS_URL="https://your-deepseek-proxy.example.com/generate"
$env:AI_KEYWORD_ANALYSIS_KEY="deepseek-server-side-key"
$env:AI_ARTICLE_GENERATION_URL="https://your-openai-proxy.example.com/generate"
$env:AI_ARTICLE_GENERATION_KEY="openai-server-side-key"
npm start
```

更推荐使用这些更明确的变量名：

```bash
$env:AI_KEYWORD_ANALYSIS_BASE_URL="https://your-deepseek-proxy.example.com/v1"
$env:AI_KEYWORD_ANALYSIS_MODEL="deepseek-chat"
$env:AI_KEYWORD_ANALYSIS_KEY="deepseek-server-side-key"
$env:AI_ARTICLE_GENERATION_BASE_URL="https://your-openai-proxy.example.com/v1"
$env:AI_ARTICLE_GENERATION_MODEL="gpt-4.1-mini"
$env:AI_ARTICLE_GENERATION_KEY="openai-server-side-key"
npm start
```

阶段名规则：

```text
keywordAnalysis      -> AI_KEYWORD_ANALYSIS_URL / AI_KEYWORD_ANALYSIS_KEY
briefGeneration      -> AI_BRIEF_GENERATION_URL / AI_BRIEF_GENERATION_KEY
articleGeneration    -> AI_ARTICLE_GENERATION_URL / AI_ARTICLE_GENERATION_KEY
contentOptimization  -> AI_CONTENT_OPTIMIZATION_URL / AI_CONTENT_OPTIMIZATION_KEY
```

如果某个阶段没有配置专属环境变量，就会回退到 `AI_PROXY_URL` / `AI_PROXY_KEY`。

前端会发送：

```json
{
  "stage": "articleGeneration",
  "stageConfig": {
    "provider": "openai",
    "model": "content-model",
    "endpoint": "/api/generate"
  },
  "provider": "proxy",
  "model": "content-model",
  "prompt": "完整写作提示词",
  "project": {},
  "keyword": {}
}
```

你的 AI 代理建议返回：

```json
{
  "content": "Markdown article..."
}
```

## References 规则

References 是触发式模块，不是每篇文章固定模块。

普通经验文、口味文、场景文、产品灵感文可以 0 引用，不添加 References。

只有当文章使用了官方外部资料，或涉及健康、安全、法规、年龄、电子烟定义、电池回收等内容时，才触发 References。

如果触发，正文最后使用：

```markdown
## References

- FDA: [E-cigarettes, Vapes, and other Electronic Nicotine Delivery Systems](https://www.fda.gov/tobacco-products/products-ingredients-components/e-cigarettes-vapes-and-other-electronic-nicotine-delivery-systems-ends)
- EPA: [Used Lithium-Ion Batteries](https://www.epa.gov/recycle/used-lithium-ion-batteries)
```

不要每篇文章都机械放同一批来源。

## 锚文本规则

锚文本规则在 `workflows/seo-standard.json` 的 `anchorTextRules` 里。

核心原则：

1. 内部链接服务读者下一步，不是为了堆关键词。
2. 同一篇文章里，同一个目标 URL 不要重复使用完全相同的内部链接锚文本。
3. 精准匹配关键词锚文本最多使用 1 次，后续要用自然语境变化。
4. 如果上下文不适合第二次链接，宁愿少放一个链接，也不要为了变化而写生硬锚文本。
5. 官方 References 不需要刻意变化锚文本，优先使用官方页面主题或具体资料名称。

举例：

```markdown
自然内部链接：
- [compare disposable vape options](/collections/disposable-vapes)
- [choose a nicotine-free vape](/collections/nicotine-free-vapes)

不推荐：
- [click here](/collections/disposable-vapes)
- 同一篇文章里重复多次使用 [best disposable vapes](/collections/disposable-vapes)
```

## 部署建议

最简单部署方式：

```bash
npm start
```

生产环境建议：

1. 放到一台服务器上，用 Node 18+ 运行。
2. 前面加 Nginx 或宝塔反代。
3. 用 PM2、systemd 或 Docker 保持进程常驻。
4. API Key 只放服务器环境变量。
5. 后续增加数据库保存项目、关键词、Brief、文章版本和审核状态。

下一阶段可以继续做：

1. 项目/关键词保存到 SQLite。
2. AI 供应商配置持久化到服务端。
3. 文章审核状态流转。
4. 批量生成任务队列。
5. 一键导出 WordPress、Shopify、Webflow 或自建 CMS。
