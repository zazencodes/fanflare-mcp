import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const endpoint = new URL("http://127.0.0.1:8787/mcp");
const client = new Client({ name: "fanflare-local-check", version: "1" });
await client.connect(new StreamableHTTPClientTransport(endpoint));
try {
  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === "stage_image"));
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(
      result.isError ?? false,
      false,
      JSON.stringify(result.content),
    );
    return result.structuredContent;
  };
  const { books } = await call("search_books", {
    query: "Alice",
    author: "Lewis Carroll",
  });
  const book = books.find((b) => b.id === "book_alice");
  assert.ok(book, "Run npm run setup to load the Alice sample");
  const status = await call("get_index_status", { book_id: book.id });
  assert.ok(status.coverage.length);
  const scene = await call("get_scene_context", {
    book_id: book.id,
    position: { kind: "reading", chapter: 1 },
    scene_cues: "White Rabbit with pink eyes ran close by her",
  });
  assert.deepEqual(
    scene.facts.map((fact) => fact.detail),
    ["Has pink eyes"],
  );
  assert.equal(scene.facts[0].locator, "chapter I, paragraph 2");
  const guide = (await client.listResources()).resources.find(
    (r) => r.name === "reader-guide",
  );
  assert.match(
    (await client.readResource({ uri: guide.uri })).contents[0].text,
    /No authentication/,
  );
  const write = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "request_book_index",
        arguments: { book_id: book.id, request_key: "anonymous-check" },
      },
    }),
  });
  assert.equal(write.status, 401);
  assert.match(
    write.headers.get("WWW-Authenticate") ?? "",
    /resource_metadata/,
  );
  const profile = await fetch(new URL("/api/profile", endpoint), {
    method: "POST",
    headers: { Origin: endpoint.origin, Accept: "application/json" },
  });
  assert.equal(profile.status, 401);
  console.log(
    "Passed anonymous lookup, reading boundary, guide discovery and protected-write challenge.",
  );
} finally {
  await client.close();
}
