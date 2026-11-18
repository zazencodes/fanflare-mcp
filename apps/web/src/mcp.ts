import {
  createMcpHandler,
  McpServer,
  inputRequired,
} from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { z } from "zod";
import * as C from "@fanflare/contracts";
import { auth } from "./auth.ts";
import { type Env, first, fail } from "./common.ts";
import { search, requestIndex, context, indexStatus } from "./books.ts";
import { stageImage, draft, limited } from "./media.ts";
import { submit } from "./contributions.ts";
import { reportFact } from "./social.ts";
function packed(data: Record<string, unknown>, message: string) {
  return {
    content: [
      { type: "text" as const, text: message + "\n" + JSON.stringify(data) },
    ],
    structuredContent: data,
  };
}
function toolScope(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "request_book_index":
      return "books:request";
    case "submit_character_info":
    case "submit_context_info":
    case "report_context_claim":
      return "characters:contribute";
    case "publish_artwork":
      return "artwork:write";
    case "stage_image":
      return args.purpose === "evidence"
        ? "characters:contribute"
        : "artwork:write";
    default:
      return null;
  }
}
export async function mcpEndpoint(env: Env, request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== env.ORIGIN) fail("Origin denied", 403);
  const bytes = await limited(request.clone().body, 256 * 1024);
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail("Invalid JSON-RPC body");
  }
  const tool = body?.method === "tools/call" ? body.params?.name : "",
    scope = toolScope(tool, body?.params?.arguments ?? {});
  const serve = async (user?: string) => {
    const handler = createMcpHandler(
      ({ era }) => {
        const s = new McpServer(
          { name: "fanflare", version: "1.0.0" },
          {
            instructions:
              "Ask the reader for permission before requesting indexing, contributing or creating a draft. Only reveal facts from the returned packet. A draft is private until its owner approves.",
          },
        );
        const guide = env.ORIGIN + "/mcp-guide.md";
        s.registerResource(
          "reader-guide",
          guide,
          { title: "Use Fanflare in ChatGPT", mimeType: "text/markdown" },
          async () => {
            const response = await env.STATIC.fetch(guide);
            if (!response.ok) fail("Reader guide unavailable", 503);
            return {
              contents: [
                {
                  uri: guide,
                  mimeType: "text/markdown",
                  text: await response.text(),
                },
              ],
            };
          },
        );
        const publicMeta = {
          annotations: { readOnlyHint: true, openWorldHint: false },
          _meta: { securitySchemes: [{ type: "noauth" }] },
        };
        const writeMeta = (scopes: string[]) => ({
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
            destructiveHint: false,
          },
          _meta: { securitySchemes: [{ type: "oauth2", scopes }] },
        });
        const owner = (required: string) => {
          if (!user || scope !== required) fail("Authorization required", 403);
          return user;
        };
        s.registerTool(
          "search_books",
          {
            ...publicMeta,
            description:
              "Search title, coauthors or edition ISBN, without creating a book.",
            inputSchema: C.query,
          },
          async (v) => {
            const books = await search(env, v);
            return packed(
              {
                books,
                next_action: books.length
                  ? "Choose the matching work and identify your passage."
                  : "Offer to request indexing.",
              },
              books.length + " matching works.",
            );
          },
        );
        s.registerTool(
          "get_scene_context",
          {
            ...publicMeta,
            description:
              "Return only information a reader can know at this position. Supply a short visible cue or a verified anchor, not a whole page. For explicit whole-book completion, use the position supplied by get_index_status or clarification guidance.",
            inputSchema: C.scene,
          },
          async (v) => {
            const r = await context(env, v);
            return packed(r, r.next_action);
          },
        );
        s.registerTool(
          "get_index_status",
          {
            ...publicMeta,
            description:
              "Check the research queue, actual coverage and any whole-book completion position for a reader who explicitly finished the book.",
            inputSchema: z.object({ book_id: C.book }),
          },
          async (v) => {
            const r = await indexStatus(env, v.book_id);
            return packed(r, r.next_action);
          },
        );
        s.registerTool(
          "request_book_index",
          {
            ...writeMeta(["books:request"]),
            description: "Request research only after reader acceptance.",
            inputSchema: C.request,
          },
          async (v) => {
            const r = await requestIndex(env, owner("books:request"), v);
            return packed(r, r.next_action);
          },
        );
        const stageMeta = writeMeta(["artwork:write", "characters:contribute"]);
        s.registerTool(
          "stage_image",
          {
            ...stageMeta,
            _meta: { ...stageMeta._meta, "openai/fileParams": ["file"] },
            description:
              "Stage a private file for the specified purpose. Use the upload URL for local bytes.",
            inputSchema: C.stage,
          },
          async (v) => {
            const r = await stageImage(
              env,
              owner(
                v.purpose === "artwork"
                  ? "artwork:write"
                  : "characters:contribute",
              ),
              v,
            );
            return packed(r, r.next_action);
          },
        );
        s.registerTool(
          "publish_artwork",
          {
            ...writeMeta(["artwork:write"]),
            description:
              "Prepare a private draft and request human approval of its exact revision.",
            inputSchema: C.publish,
          },
          async (v, ctx) => {
            const d = await draft(env, owner("artwork:write"), v);
            if (
              d.state === "draft" &&
              d.validated &&
              era === "modern" &&
              s.server.getClientCapabilities()?.elicitation?.url &&
              !ctx.mcpReq.inputResponses
            ) {
              return inputRequired({
                inputRequests: {
                  review: inputRequired.elicitUrl({
                    message:
                      "Review the image, attribution and tags, then choose Publish.",
                    url: d.review_url,
                  }),
                },
              });
            }
            return packed(d, d.next_action);
          },
        );
        s.registerTool(
          "report_context_claim",
          {
            ...writeMeta(["characters:contribute"]),
            description:
              "Privately report a visible context claim for moderator review. Reports do not establish that a claim is wrong.",
            inputSchema: C.reportFact,
          },
          async (v) =>
            packed(
              await reportFact(env, owner("characters:contribute"), v),
              "Report submitted for review.",
            ),
        );
        for (const name of ["submit_context_info", "submit_character_info"])
          s.registerTool(
            name,
            {
              ...writeMeta(["characters:contribute"]),
              description:
                "Submit character or place text, a private photo, or an original sketch with explicit permissions for review. Set subject_kind to place for places. submit_character_info is retained for existing clients; new clients should use submit_context_info.",
              inputSchema:
                name === "submit_context_info"
                  ? C.contextContribution
                  : C.contribute,
            },
            async (
              v:
                | z.infer<typeof C.contribute>
                | z.infer<typeof C.contextContribution>,
            ) =>
              packed(
                {
                  ...(await submit(
                    env,
                    owner("characters:contribute"),
                    "subject" in v
                      ? C.contribute.parse({ ...v, character: v.subject })
                      : v,
                  )),
                  next_action:
                    "View or withdraw the contribution in your account.",
                },
                "Contribution received. Check your account to view or withdraw it.",
              ),
          );
        return s;
      },
      { legacy: "stateless", maxRequestBodySize: 256 * 1024 },
    );
    return handler.fetch(request);
  };
  if (!scope && !request.headers.has("Authorization")) return serve();
  return requireMcpAuth(
    auth(env),
    async (_req, claims) => {
      if (typeof claims.sub !== "string" || typeof claims.azp !== "string")
        fail("A reader grant is required", 403);
      const grant = await first(
        env,
        "SELECT scopes FROM oauthConsent WHERE userId=? AND clientId=?",
        claims.sub,
        claims.azp,
      );
      const revoked = await first(
        env,
        "SELECT at FROM revocations WHERE owner=? AND client=?",
        claims.sub,
        claims.azp,
      );
      if (
        !grant ||
        (scope && !JSON.parse(grant.scopes).includes(scope)) ||
        (revoked && Number(claims.iat) <= revoked.at)
      )
        fail("Client grant revoked or insufficient", 403);
      return serve(claims.sub);
    },
    {
      resource: env.ORIGIN + "/mcp",
      requiredScopes: scope ? [scope] : [],
      challengeScopes: scope ? [scope] : [...C.scopes],
    },
  )(request);
}
