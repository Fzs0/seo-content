import { readTodos, saveTodos } from "../todos-store.mjs";
import { methodNotAllowed, readJson, sendJson } from "../http.mjs";

export async function handleTodosRoute(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, { todos: readTodos() });
    return true;
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, 200, {
      todos: saveTodos(body.todos || []),
      saved: true,
      message: "Todo 已保存到 data/todos.local.json。",
    });
    return true;
  }

  methodNotAllowed(response);
  return true;
}
