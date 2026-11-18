import { Hono } from "hono";
import { z } from "zod";
import * as C from "@fanflare/contracts";
import type { App } from "./view.tsx";
import { fail } from "./common.ts";
import {
  requestKeySchema,
  shelfStateSchema,
  avatarSchema,
} from "../../../packages/contracts/social.ts";
import {
  toggleUpvote,
  toggleFavorite,
  createComment,
  deleteComment,
  setShelf,
  reportSocial,
  reportFact,
} from "./social.ts";
import { saveProfile } from "./profiles.ts";
import { buyItem, saveAvatar, equipItem } from "./store.ts";
import { markNotificationsRead } from "./notifications.ts";
export const socialRoutes = new Hono<App>();
for (const action of [
  "upvote",
  "favorite",
  "comment",
  "comment-delete",
  "report-comment",
  "report-profile",
  "report-fact",
  "shelf",
  "profile",
  "store-buy",
  "store-equip",
  "avatar",
  "notifications-read",
])
  socialRoutes.post("/api/" + action, async (c) => {
    const user = c.get("reader")?.id ?? fail("Sign in to continue", 401);
    const json = c.req.header("Content-Type")?.includes("application/json");
    const data = z
      .record(z.string(), z.any())
      .parse(
        json
          ? await c.req.json().catch(() => fail("Invalid JSON body"))
          : Object.fromEntries(await c.req.raw.formData()),
      );
    const next = typeof data.next === "string" ? data.next : "/account";
    const url = new URL(next, c.env.ORIGIN);
    if (
      !json &&
      (!next.startsWith("/") ||
        next.startsWith("//") ||
        url.origin !== c.env.ORIGIN)
    )
      fail("Invalid return path");
    const decode = (value: unknown): unknown => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        return fail("Invalid JSON field");
      }
    };
    const key = requestKeySchema.parse(data.request_key),
      text = (name: string) => z.string().min(1).parse(data[name]);
    const active = () =>
      z
        .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
        .transform((v) => v === true || v === "true" || v === "1")
        .parse(data.active);
    const flag = (name: string) =>
      z
        .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
        .transform((v) => v === true || v === "true" || v === "1")
        .parse(data[name]);
    const avatar = () => avatarSchema.parse(decode(data.avatar));
    let result: unknown;
    switch (action) {
      case "upvote":
        result = await toggleUpvote(
          c.env,
          user,
          text("post"),
          active(),
          key,
          c.get("prefs"),
        );
        break;
      case "favorite":
        result = await toggleFavorite(
          c.env,
          user,
          text("post"),
          active(),
          key,
          c.get("prefs"),
        );
        break;
      case "comment":
        result = await createComment(
          c.env,
          user,
          text("post"),
          text("body"),
          key,
          c.get("prefs"),
        );
        break;
      case "comment-delete":
        result = await deleteComment(
          c.env,
          user,
          text("comment"),
          key,
          c.get("moderator"),
        );
        break;
      case "report-comment":
      case "report-profile":
        result = await reportSocial(
          c.env,
          user,
          action === "report-comment" ? "comment" : "profile",
          text("target"),
          text("detail"),
          key,
          c.get("prefs"),
        );
        break;
      case "report-fact": {
        const book = text("book");
        const prefs = c.get("prefs");
        result = await reportFact(
          c.env,
          user,
          C.reportFact.parse({
            book_id: book,
            fact_id: text("target"),
            position: { kind: "unknown" },
            reason: text("reason"),
            explanation: text("explanation"),
            correction: data.correction || undefined,
            source: data.source || undefined,
            request_key: key,
          }),
          prefs.spoilersHidden ? (prefs.positions[book] ?? -1) : null,
        );
        break;
      }
      case "shelf":
        result = await setShelf(
          c.env,
          user,
          text("book"),
          data.state === null || data.state === "remove"
            ? null
            : shelfStateSchema.parse(data.state),
          key,
        );
        break;
      case "profile":
        result = await saveProfile(c.env, user, {
          handle: text("handle"),
          shown: data.shown,
          realName: data.realName ?? "",
          private: flag("private"),
          request_key: key,
        });
        break;
      case "store-buy":
        result = await buyItem(c.env, user, text("item"), key);
        break;
      case "store-equip":
        result = await equipItem(c.env, user, text("item"), key);
        break;
      case "avatar":
        result = await saveAvatar(c.env, user, avatar(), key);
        break;
      case "notifications-read":
        result = await markNotificationsRead(
          c.env,
          user,
          data.ids
            ? z.array(z.string()).max(100).parse(decode(data.ids))
            : null,
          key,
        );
        break;
      default:
        return c.notFound();
    }
    if (json) return c.json(result as any);
    return c.redirect(url.pathname + url.search + url.hash, 303);
  });
