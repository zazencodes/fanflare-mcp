import { Hono } from "hono";
import * as C from "@fanflare/contracts";
import { getBook, indexStatus, requestIndex } from "./books.ts";
import {
  type App,
  page,
  Heading,
  reader,
  keyField,
  formText,
  TextField,
} from "./view.tsx";
export const connectionPages = new Hono<App>();

connectionPages.get("/new-book", (c) =>
  page(
    c,
    "Add a book",
    <div class="narrow">
      <Heading
        title="Add a book"
        sub="Create a forum and request indexing for this work."
      />
      <form class="stack" method="post">
        {keyField()}
        <TextField
          name="title"
          label="Book title"
          value={c.req.query("title")}
          required
        />
        <label>
          Authors, one per line
          <textarea name="authors" required />
        </label>
        <TextField
          name="disambiguator"
          label="Distinguishing detail, if needed"
        />
        <TextField name="isbn" label="Edition ISBN, if known" />
        <button>Request indexing</button>
      </form>
    </div>,
  ),
);
connectionPages.post("/new-book", async (c) => {
  const u = reader(c),
    f = await c.req.raw.formData();
  const r = await requestIndex(
    c.env,
    u.id,
    C.request.parse({
      title: formText(f, "title"),
      authors: formText(f, "authors").split(/\n/),
      isbn: formText(f, "isbn") || undefined,
      disambiguator: formText(f, "disambiguator") || undefined,
      request_key: formText(f, "request_key"),
    }),
  );
  return c.redirect("/status/" + r.book_id, 303);
});

connectionPages.get("/status/:book", async (c) => {
  const s = await indexStatus(c.env, c.req.param("book")),
    b = await getBook(c.env, s.book_id);
  return page(
    c,
    "Research status",
    <div class="narrow">
      <Heading title="Research status" sub={b.title} back={"/books/" + b.id} />
      <div class="panel">
        <h3>
          {s.job?.state ??
            (s.coverage.length ? "Indexed passages" : "Awaiting a request")}
        </h3>
        <p>{s.delay ?? s.job?.reason}</p>
        {s.coverage.map((x) => (
          <p>
            Chapter {x.chapter} · {x.facts} sourced details
          </p>
        ))}
        {!s.coverage.length && <p>No verified passages yet.</p>}
      </div>
      <form class="stack" method="post">
        {keyField()}
        <TextField
          name="missing"
          label="Which passage or detail needs indexing?"
          required
        />
        <button>Request coverage</button>
      </form>
      <p>
        <a href={"/books/" + b.id + "/contribute"}>Offer your own evidence</a>
      </p>
    </div>,
  );
});
connectionPages.post("/status/:book", async (c) => {
  const f = await c.req.raw.formData();
  await requestIndex(
    c.env,
    reader(c).id,
    C.request.parse({
      book_id: c.req.param("book"),
      missing_coverage: formText(f, "missing"),
      request_key: formText(f, "request_key"),
    }),
  );
  return c.redirect(c.req.path, 303);
});
connectionPages.get("/connect", (c) =>
  page(
    c,
    "Connect an agent",
    <div class="narrow prose">
      <Heading
        title="Connect an agent"
        sub="Bring Fanflare’s spoiler-bounded book context to your image-capable reader."
      />
      <h2>Connect ChatGPT to Fanflare</h2>
      <p>Copy this hosted MCP address into ChatGPT.</p>
      <p>
        <code>https://fanflare.art/mcp</code>
      </p>
      <p>
        On ChatGPT web, open Plugins, select + and choose Add custom MCP server.
        Enter the address above and choose No authentication to look up books.
        Install Fanflare, then look for @Fanflare in the same workspace on your
        phone.
      </p>
      <p>
        <a href="/mcp-guide.md">
          Read the setup guide and try the Alice example
        </a>
      </p>
      <h2>Try a scene</h2>
      <ol>
        <li>
          Attach your page photo to the client and ask, “Illustrate the scene on
          this page using Fanflare.” Your agent can search the library before
          you sign in.
        </li>
        <li>
          When you want to share, sign in and grant artwork access. Review the
          exact picture and credit, then choose Publish.
        </li>
      </ol>
      {c.env.ORIGIN !== "https://fanflare.art" && (
        <>
          <h2>Connect a client to this installation</h2>
          <p>
            For a Streamable HTTP client running on the same computer as this
            server, use <code>{c.env.ORIGIN}/mcp</code>.
          </p>
        </>
      )}
      <h2>Image transfer</h2>
      <p>
        Verified with the official TypeScript MCP client and a newly generated
        PNG. Local clients can upload the image bytes to the single-use upload
        URL. If your client gives you a download, attach the saved file on the
        private review page.
      </p>
      <p>ChatGPT’s generated-image handoff is awaiting a live client test.</p>
    </div>,
    { public: true },
  ),
);
