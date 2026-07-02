import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const todosPath = fileURLToPath(new URL("../../data/todos.local.json", import.meta.url));

const starterTodos = [
  {
    id: "todo-ai-real-api",
    title: "接入第一个真实 AI API 并跑通文章生成",
    category: "AI 接入",
    priority: "P0",
    status: "todo",
    note: "先用 OpenAI 兼容中转站验证 /api/generate，再决定是否接更多供应商。",
    createdAt: new Date().toISOString(),
  },
  {
    id: "todo-keyword-review",
    title: "用真实 Semrush 表测试关键词分站准确率",
    category: "关键词流程",
    priority: "P0",
    status: "todo",
    note: "重点检查主站博客、博客A/B/C、暂不做的边界。",
    createdAt: new Date().toISOString(),
  },
  {
    id: "todo-database",
    title: "增加项目和关键词历史保存",
    category: "数据存储",
    priority: "P1",
    status: "todo",
    note: "后续可以接 SQLite，保存每次导入、Brief、Prompt 和文章版本。",
    createdAt: new Date().toISOString(),
  },
];

function ensureDataDir() {
  mkdirSync(dirname(todosPath), { recursive: true });
}

function normalizeTodo(todo, index) {
  return {
    id: todo.id || `todo-${Date.now()}-${index}`,
    title: String(todo.title || "").trim(),
    category: todo.category || "功能迭代",
    priority: todo.priority || "P2",
    status: todo.status || "todo",
    note: todo.note || "",
    createdAt: todo.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function readTodos() {
  if (!existsSync(todosPath)) {
    return starterTodos;
  }

  const parsed = JSON.parse(readFileSync(todosPath, "utf8"));
  return Array.isArray(parsed.todos) ? parsed.todos : [];
}

export function saveTodos(todos = []) {
  ensureDataDir();
  const normalized = todos
    .map(normalizeTodo)
    .filter((todo) => todo.title);

  writeFileSync(
    todosPath,
    `${JSON.stringify(
      {
        todos: normalized,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return normalized;
}
