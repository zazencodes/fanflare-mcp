import { auth } from "./auth.ts";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { Hono } from "hono";
import * as C from "@fanflare/contracts";
import { z } from "zod";
import {
  type App,
  type Web,
  page,
  Heading,
  reader,
  Position,
  positionLabel,
  TextField,
  formText,
  keyField,
  hidden,
  bookChapters,
} from "./view.tsx";
import {
  stageImage,
  receive,
  draft,
  ownDraft,
  editDraft,
  decide,
  removePost,
} from "./media.ts";
import { submit, withdraw } from "./contributions.ts";
import { getBook } from "./books.ts";
import { ReaderLinks } from "./me.tsx";
import { ProfileSettings } from "./profile-pages.tsx";
import { ownProfile } from "./profiles.ts";
import { fail, first, required, rows, statement, now } from "./common.ts";
export const readers = new Hono<App>();
function signInPage(
  c: Web,
  state: { email?: string; sent?: boolean; message?: string } = {},
) {
  const query = new URL(c.req.url).search;
  return page(
    c,
    "Sign in",
    <div class="narrow tight">
      <Heading
        title="Sign in"
        sub="Sign in with a password, or use an email code to get started."
      />
      <div class="card stack">
        {c.env.MAIL_FROM ? (
          <>
            <form
              class="stack"
              method="post"
              action={"/sign-in/password" + query}
              data-auth="flow"
            >
              <label>
                Email for password sign-in
                <input
                  required
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={state.email ?? ""}
                />
              </label>
              <label>
                Password
                <input
                  required
                  type="password"
                  name="password"
                  autoComplete="current-password"
                />
              </label>
              <button>Sign in with password</button>
            </form>
            <a
              href={
                "/password?returnTo=" + encodeURIComponent("/sign-in" + query)
              }
            >
              Set or recover a password
            </a>
            <p>
              Email code · create an account or sign in without a password. If
              you enabled two-step verification, use your password above.
            </p>
            <form
              class="stack"
              method="post"
              action={"/sign-in/send" + query}
              data-auth="send"
            >
              <label>
                Email address
                <input
                  required
                  type="email"
                  name="email"
                  value={state.email ?? ""}
                  autoComplete="email"
                />
              </label>
              <button>Send code</button>
            </form>
            <form
              id="verify"
              class="stack"
              method="post"
              action={"/sign-in/verify" + query}
              hidden={!state.sent}
              data-auth="verify"
            >
              <input type="hidden" name="email" value={state.email ?? ""} />
              <label>
                Six-digit code
                <input
                  required
                  name="otp"
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
              <button>Sign in</button>
            </form>
          </>
        ) : (
          <p class="panel">
            Email sign-in will open when the sending domain is connected. You
            can browse the library and look up scenes now.
          </p>
        )}
        <p role="status" aria-live="polite">
          {state.message || c.req.query("message")}
        </p>
      </div>
    </div>,
  );
}
readers.get("/sign-in", (c) => signInPage(c));

// Delegate plain forms to the same HTTP endpoints as /js/auth.js, including
// Better Auth's rate limiting, OAuth hooks, OTP rules and session cookies.
async function authForm(
  c: Web,
  endpoint: string,
  body: Record<string, string>,
) {
  const signed = new URL(c.req.url).searchParams;
  if (signed.has("sig")) body.oauth_query = signed.toString();
  const headers = new Headers(c.req.raw.headers);
  headers.delete("content-length");
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const response = await auth(c.env).handler(
    new Request(c.env.ORIGIN + "/api/auth/" + endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  for (const name of ["Retry-After", "X-Retry-After"]) {
    const retryAfter = response.headers.get(name);
    if (retryAfter) c.header(name, retryAfter);
  }
  for (const cookie of response.headers.getSetCookie())
    c.header("Set-Cookie", cookie, { append: true });
  return response;
}
async function signInForm(c: Web, verify: boolean) {
  const data = await c.req.formData(),
    email = formText(data, "email");
  const response = await authForm(
    c,
    verify ? "sign-in/email-otp" : "email-otp/send-verification-otp",
    verify ? { email, otp: formText(data, "otp") } : { email, type: "sign-in" },
  );
  const result = (await response.json()) as { message?: string; url?: string };
  if (!response.ok) {
    const rendered = await signInPage(c, {
      email,
      sent: verify,
      message: result.message ?? "The request could not be completed.",
    });
    return new Response(rendered.body, {
      status: response.status,
      headers: rendered.headers,
    });
  }
  if (verify) {
    const next = safeAuthNext(c);
    return c.redirect(
      result.url || "/signed-in?next=" + encodeURIComponent(next),
      303,
    );
  }
  return signInPage(c, {
    email,
    sent: true,
    message: "Check your inbox for your six-digit code.",
  });
}
readers.post("/sign-in/send", (c) => signInForm(c, false));
readers.post("/sign-in/verify", (c) => signInForm(c, true));
// The enhancement submits these same forms and receives only a destination or
// error. Passwords and codes never enter redirect URLs.
function safeAuthNext(c: Web) {
  const next = c.req.query("next");
  return next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !/[\x00-\x20\x7f\\]/.test(next)
    ? next
    : "/account";
}
function authDestination(c: Web, url: string) {
  return c.req.header("Accept") === "application/json"
    ? c.json({ url })
    : c.redirect(url, 303);
}
function securityPage(
  c: Web,
  message = "",
  twoStep = c.req.path.startsWith("/sign-in/two-step"),
) {
  const query = new URL(c.req.url).search;
  const token = c.req.query("token");
  const returnTo = c.req.query("returnTo");
  const signIn =
    returnTo &&
    (returnTo === "/sign-in" || returnTo.startsWith("/sign-in?")) &&
    !/[\x00-\x20\x7f\\]/.test(returnTo)
      ? returnTo
      : "/sign-in";
  return page(
    c,
    twoStep ? "Email verification" : "Set or recover password",
    <div class="narrow tight">
      <Heading
        title={twoStep ? "Check your email" : "Set or recover your password"}
        sub={
          twoStep
            ? "Complete password sign-in with your email code."
            : "Use an emailed link to choose a password of at least 12 characters."
        }
      />
      <div class="card stack">
        {twoStep ? (
          <>
            <form
              class="stack"
              method="post"
              action={"/sign-in/two-step/send" + query}
              data-auth="flow"
            >
              <button>Send a new code</button>
            </form>
            <form
              class="stack"
              method="post"
              action={"/sign-in/two-step/verify" + query}
              data-auth="flow"
            >
              <label>
                Six-digit code
                <input
                  required
                  name="code"
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
              <button>Complete sign-in</button>
            </form>
          </>
        ) : token ? (
          <form
            class="stack"
            method="post"
            action={"/password/reset" + query}
            data-auth="flow"
          >
            {hidden("token", token)}
            <label>
              New password
              <input
                required
                name="newPassword"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <button>Save password</button>
          </form>
        ) : (
          <form
            class="stack"
            method="post"
            action={"/password/send" + query}
            data-auth="flow"
          >
            <label>
              Email address
              <input required type="email" name="email" autoComplete="email" />
            </label>
            <button>Email password link</button>
          </form>
        )}
        <p role="status" aria-live="polite">
          {message ||
            (c.req.query("error")
              ? "This link is invalid or expired. Request a new password link."
              : c.req.query("message"))}
        </p>
        {!twoStep && token && (
          <a
            href={
              "/password" +
              (returnTo ? "?returnTo=" + encodeURIComponent(returnTo) : "")
            }
          >
            Request a new password link
          </a>
        )}
        <a href={twoStep ? "/sign-in" + query : signIn}>Back to sign in</a>
      </div>
    </div>,
  );
}
readers.get("/password", (c) => securityPage(c));
readers.get("/sign-in/two-step", (c) => securityPage(c));
async function securityAction(
  c: Web,
  endpoint: string,
  body: Record<string, string>,
  destination: string,
) {
  const response = await authForm(c, endpoint, body);
  const result = (await response.json()) as {
    message?: string;
    url?: string;
    twoFactorRedirect?: boolean;
  };
  if (!response.ok) {
    const message = result.message || "The request could not be completed.";
    if (c.req.header("Accept") === "application/json")
      return c.json({ message }, response.status as 400);
    const rendered = c.req.path.startsWith("/account/")
      ? await accountPage(c, message)
      : c.req.path === "/sign-in/password"
        ? await signInPage(c, { email: body.email, message })
        : await securityPage(c, message);
    return new Response(rendered.body, {
      status: response.status,
      headers: rendered.headers,
    });
  }
  if (result.twoFactorRedirect) {
    // Forward the pending challenge cookie for the send call within this SSR
    // request; the browser receives all original cookies through authForm.
    const cookies = response.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    const headers = new Headers(c.req.raw.headers);
    headers.set("cookie", cookies);
    headers.set("Content-Type", "application/json");
    const sent = await auth(c.env).handler(
      new Request(c.env.ORIGIN + "/api/auth/two-factor/send-otp", {
        method: "POST",
        headers,
        body: "{}",
      }),
    );
    if (!sent.ok) {
      const result = (await sent.json()) as { message?: string };
      const message =
        result.message || "Code delivery failed. Send a new code to retry.";
      if (c.req.header("Accept") === "application/json")
        return c.json({ message }, sent.status as 400);
      return securityPage(c, message, true);
    }
    const query = new URL(c.req.url).search;
    // The challenge remains usable when delivery fails; the page always offers
    // resend. Keep signed OAuth query parameters byte-for-byte intact.
    return authDestination(c, "/sign-in/two-step" + query);
  }
  return authDestination(c, result.url || destination);
}
readers.post("/sign-in/password", async (c) => {
  const data = await c.req.formData();
  return securityAction(
    c,
    "sign-in/email",
    {
      email: formText(data, "email"),
      password: String(data.get("password") ?? ""),
    },
    "/signed-in?next=" + encodeURIComponent(safeAuthNext(c)),
  );
});
readers.post("/sign-in/two-step/send", (c) =>
  securityAction(
    c,
    "two-factor/send-otp",
    {},
    "/sign-in/two-step" + new URL(c.req.url).search,
  ),
);
readers.post("/sign-in/two-step/verify", async (c) =>
  securityAction(
    c,
    "two-factor/verify-otp",
    { code: formText(await c.req.formData(), "code") },
    "/signed-in?next=" + encodeURIComponent(safeAuthNext(c)),
  ),
);
readers.post("/password/send", async (c) =>
  securityAction(
    c,
    "request-password-reset",
    {
      email: formText(await c.req.formData(), "email"),
      redirectTo:
        c.env.ORIGIN +
        "/password" +
        (c.req.query("returnTo")
          ? "?returnTo=" + encodeURIComponent(c.req.query("returnTo")!)
          : ""),
    },
    "/password?message=" +
      encodeURIComponent(
        "If the account exists, check your inbox for a password link.",
      ),
  ),
);
readers.post("/password/reset", async (c) => {
  const data = await c.req.formData();
  return securityAction(
    c,
    "reset-password",
    {
      token: formText(data, "token"),
      newPassword: String(data.get("newPassword") ?? ""),
    },
    (() => {
      const next = c.req.query("returnTo");
      return next &&
        (next === "/sign-in" || next.startsWith("/sign-in?")) &&
        !/[\x00-\x20\x7f\\]/.test(next)
        ? next
        : "/sign-in?message=" +
            encodeURIComponent(
              "Password saved. Sign in with your new password.",
            );
    })(),
  );
});
readers.post("/account/security/:action", async (c) => {
  const action = c.req.param("action"),
    data = await c.req.formData();
  const endpoint = {
    enable: "two-factor/enable",
    send: "two-factor/send-otp",
    disable: "two-factor/disable",
  }[action];
  if (!endpoint) fail("Unknown security action", 404);
  if (action === "disable") {
    const verified = await authForm(c, "two-factor/verify-otp", {
      code: formText(data, "code"),
    });
    if (!verified.ok) {
      const result = (await verified.json()) as { message?: string };
      if (c.req.header("Accept") === "application/json")
        return c.json(result, verified.status as 400);
      const rendered = await accountPage(c, result.message);
      return new Response(rendered.body, {
        status: verified.status,
        headers: rendered.headers,
      });
    }
  }
  return securityAction(
    c,
    endpoint,
    { password: String(data.get("password") ?? ""), method: "otp" },
    "/account?security=" + (action === "send" ? "sent" : "saved") + "#security",
  );
});
readers.post("/sign-out", async (c) => {
  const response = await authForm(c, "sign-out", {});
  if (!response.ok) return response;
  return c.redirect("/", 303);
});
readers.get("/consent", async (c) => {
  if (
    !(await verifyOAuthQueryParams(
      new URL(c.req.url).search.slice(1),
      c.env.AUTH_SECRET,
    ))
  )
    fail("Consent request expired or invalid", 400);
  const client = await required(
    c.env,
    "SELECT name,clientId FROM oauthClient WHERE clientId=?",
    c.req.query("client_id") ?? "",
  );
  return page(
    c,
    "Authorize client",
    <div class="narrow tight">
      <Heading
        title="Authorize a client"
        sub={client.name ?? client.clientId}
      />
      <div class="card">
        <p>Requested permissions for Fanflare</p>
        <ul>
          {(c.req.query("scope") ?? "").split(" ").map((s) => (
            <li>{s}</li>
          ))}
        </ul>
        <form data-auth="consent" class="actions">
          <button value="yes">Grant access</button>
          <button value="no" class="secondary">
            Decline
          </button>
        </form>
        <p role="status" />
      </div>
    </div>,
  );
});
async function accountPage(c: Web, message = "") {
  const u = reader(c),
    grants = await rows(
      c.env,
      "SELECT g.id,g.scopes,cl.name FROM oauthConsent g JOIN oauthClient cl ON cl.clientId=g.clientId WHERE g.userId=?",
      u.id,
    ),
    items = await rows(
      c.env,
      "SELECT id,state,subject FROM contributions WHERE owner=? ORDER BY created DESC",
      u.id,
    ),
    drafts = await rows(
      c.env,
      "SELECT d.id,d.state,b.title FROM drafts d JOIN books b ON b.id=d.book WHERE owner=? AND state IN ('draft','published') ORDER BY d.rowid DESC",
      u.id,
    );
  const profile = await ownProfile(c.env, u.id);
  const security = await first(
    c.env,
    "SELECT twoFactorEnabled FROM user WHERE id=?",
    u.id,
  );
  return page(
    c,
    "Account",
    <div class="narrow">
      <Heading
        title="Your reading desk"
        sub="Your profile, reading preferences and connected agents."
      />
      <ReaderLinks />
      <section class="card stack">
        <h2>Reading preferences</h2>
        <form class="stack" method="post" action="/api/prefs/spoilers">
          {hidden("next", "/account")}
          <label>
            Spoilers
            <select name="hidden">
              <option value="0" selected={!c.get("prefs").spoilersHidden}>
                Show spoilers
              </option>
              <option value="1" selected={c.get("prefs").spoilersHidden}>
                Hide spoilers
              </option>
            </select>
          </label>
          <p class="muted">
            When hidden, artwork follows the reading position saved for each
            book on your shelf.
          </p>
          <button>Save preference</button>
        </form>
      </section>
      <section class="card stack" id="profile">
        <h2>Profile</h2>
        {profile.studio ? (
          <p class="muted">The studio profile is managed by Fanflare.</p>
        ) : (
          <ProfileSettings profile={profile} next="/account" />
        )}
        <a class="text-link" href="/me/avatar">
          Edit your avatar →
        </a>
      </section>
      <section class="card stack" id="security">
        <h2>Password and email verification</h2>
        <a href="/password">Set or recover your password</a>
        <p>
          Email two-step verification is{" "}
          {security?.twoFactorEnabled ? "enabled" : "disabled"}. When enabled,
          every sign-in requires your password and an email code. Password
          recovery keeps this setting.
        </p>
        {security?.twoFactorEnabled ? (
          <>
            <form
              method="post"
              action="/account/security/send"
              data-auth="flow"
            >
              <button>Send code to disable two-step</button>
            </form>
            <form
              class="stack"
              method="post"
              action="/account/security/disable"
              data-auth="flow"
            >
              <label>
                Current password
                <input
                  required
                  type="password"
                  name="password"
                  autoComplete="current-password"
                />
              </label>
              <label>
                Email code
                <input
                  required
                  name="code"
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
              <button>Disable email two-step</button>
            </form>
          </>
        ) : (
          <form
            class="stack"
            method="post"
            action="/account/security/enable"
            data-auth="flow"
          >
            <label>
              Current password
              <input
                required
                type="password"
                name="password"
                autoComplete="current-password"
              />
            </label>
            <button>Enable email two-step</button>
          </form>
        )}
        <p role="status" aria-live="polite">
          {message ||
            (c.req.query("security") === "sent"
              ? "Check your inbox for your six-digit code."
              : c.req.query("security") === "saved"
                ? "Security settings saved."
                : "")}
        </p>
      </section>
      <h2>Connected clients</h2>
      {!grants.length && <p>No active grants.</p>}
      {grants.map((g) => (
        <form method="post" class="actions" action={"/account/revoke/" + g.id}>
          <p>
            {g.name} · {g.scopes}
          </p>
          <button>Revoke</button>
        </form>
      ))}
      <h2>Artwork</h2>
      {drafts.length ? (
        drafts.map((d) => (
          <p>
            <a href={(d.state === "published" ? "/posts/" : "/review/") + d.id}>
              {d.title} · {d.state}
            </a>
          </p>
        ))
      ) : (
        <p>No drafts or posts yet.</p>
      )}
      <h2>Contributions</h2>
      {items.length ? (
        items.map((i) => (
          <form
            class="actions"
            action={"/account/withdraw/" + i.id}
            method="post"
          >
            <span>
              {i.subject} · {i.state}
            </span>
            {i.state !== "withdrawn" && <button>Withdraw</button>}
          </form>
        ))
      ) : (
        <p>No contributions yet.</p>
      )}
      {c.get("moderator") && (
        <p>
          <a href="/admin">Moderator desk</a>
        </p>
      )}
      <hr />
      <form method="post" action="/sign-out" data-auth="logout">
        <button class="secondary">Sign out</button>
      </form>
      <p role="status" />
    </div>,
    { styles: ["desk", "me", "profile"], modules: ["profile-form"] },
  );
}
readers.get("/account", (c) => accountPage(c));
readers.post("/account/revoke/:id", async (c) => {
  const u = reader(c),
    g = await required(
      c.env,
      "SELECT clientId FROM oauthConsent WHERE userId=? AND id=?",
      u.id,
      c.req.param("id"),
    );
  await c.env.DB.batch([
    statement(
      c.env,
      "INSERT INTO revocations VALUES(?,?,?) ON CONFLICT(owner,client) DO UPDATE SET at=excluded.at",
      u.id,
      g.clientId,
      Math.floor(now() / 1000),
    ),
    ...["oauthAccessToken", "oauthRefreshToken", "oauthConsent"].map((table) =>
      statement(
        c.env,
        "DELETE FROM " + table + " WHERE userId=? AND clientId=?",
        u.id,
        g.clientId,
      ),
    ),
  ]);
  return c.redirect("/account", 303);
});
readers.post("/account/withdraw/:id", async (c) => {
  await withdraw(c.env, reader(c).id, c.req.param("id"));
  return c.redirect("/account", 303);
});
const pos = (f: FormData) =>
  formText(f, "chapter")
    ? { kind: "finished", chapter: Number(formText(f, "chapter")) }
    : { kind: "unknown" };
async function metaFields(
  c: Web,
  book: string,
  m?: z.infer<typeof C.metadata>,
) {
  const ch = await bookChapters(c, book);
  return (
    <>
      <Position
        chapters={ch}
        value={
          m?.position.kind === "finished"
            ? m.position.chapter
            : m && m.position.kind !== "unknown"
              ? "keep"
              : undefined
        }
      />
      <TextField
        name="credit"
        label="Public credit"
        value={m?.credit}
        required
      />
      <label>
        Describe the image for readers
        <textarea name="alt" maxLength={1200} required>
          {m?.alt}
        </textarea>
      </label>
      <TextField
        name="characters"
        label="Character IDs, separated by commas (optional)"
        value={m?.character_ids.join(", ")}
      />
      <div class="grid2">
        <TextField name="mood" label="Mood" value={m?.mood} />
        <TextField name="style" label="Art style" value={m?.style} />
      </div>
    </>
  );
}
function metadata(f: FormData, current?: z.infer<typeof C.position>) {
  return C.metadata.parse({
    position: formText(f, "chapter") === "keep" ? current : pos(f),
    credit: formText(f, "credit"),
    alt: formText(f, "alt"),
    character_ids: formText(f, "characters")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    mood: formText(f, "mood") || undefined,
    style: formText(f, "style") || undefined,
  });
}
const fileField = (required: boolean) => (
  <label>
    Image file · up to 12 MiB
    <input
      type="file"
      name="image"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic"
      required={required}
    />
    <small>
      JPEG, PNG and WebP are verified. HEIC decoding is currently unreliable.
    </small>
  </label>
);
async function browserAsset(
  c: Web,
  book: string,
  f: FormData,
  purpose: "artwork" | "evidence",
) {
  const file = f.get("image");
  if (!(file instanceof File) || !file.size) fail("Choose an image file");
  const staged = await stageImage(
    c.env,
    reader(c).id,
    C.stage.parse({
      book_id: book,
      purpose,
      mime: file.type,
      size: file.size,
      request_key: formText(f, "request_key"),
    }),
  );
  if (!staged.validated) {
    const asset = await required(
      c.env,
      "SELECT * FROM assets WHERE id=?",
      staged.asset_id,
    );
    await receive(c.env, asset, file.stream());
  }
  return staged.asset_id;
}
readers.get("/books/:book/share", async (c) => {
  const b = await getBook(c.env, c.req.param("book"));
  return page(
    c,
    "Share artwork",
    <div class="narrow">
      <Heading
        title="Share an illustration"
        sub={b.title}
        back={"/books/" + b.id}
      />
      <form class="stack" method="post" encType="multipart/form-data">
        {keyField()}
        {fileField(true)}
        {await metaFields(c, b.id)}
        <button>Review illustration</button>
      </form>
    </div>,
  );
});
readers.post("/books/:book/share", async (c) => {
  const book = c.req.param("book"),
    f = await c.req.raw.formData(),
    m = metadata(f),
    asset = await browserAsset(c, book, f, "artwork");
  const d = await draft(c.env, reader(c).id, {
    ...m,
    book_id: book,
    asset_id: asset,
    request_key: formText(f, "request_key"),
  });
  return c.redirect("/review/" + d.draft_id, 303);
});
readers.get("/review/:id", async (c) => {
  const d = await ownDraft(c.env, reader(c).id, c.req.param("id"));
  const path = "/review/" + d.id;
  if (d.state !== "draft" || d.expires <= now())
    return page(
      c,
      "Review closed",
      <div class="narrow">
        <Heading
          title={d.state === "draft" ? "Draft expired" : "Review closed"}
          sub={d.state}
        />
        {d.state === "published" && <a href={"/posts/" + d.id}>Open post</a>}
      </div>,
    );
  const m = C.metadata.parse(JSON.parse(d.metadata));
  return page(
    c,
    "Review illustration",
    <div class="narrow">
      <Heading
        title="Review illustration"
        sub={d.title + " · Revision " + d.revision}
      />
      {d.object_prefix ? (
        <img class="preview" src={"/media/" + d.asset} alt={m.alt} />
      ) : (
        <form
          class="stack panel"
          encType="multipart/form-data"
          method="post"
          action={path + "/file"}
        >
          {fileField(true)}
          <button>Attach image</button>
        </form>
      )}
      <div class="panel">
        <h3>Public details</h3>
        <p>{m.alt}</p>
        <p>
          Credit · {m.credit}
          <br />
          Position · {positionLabel(m.position)}
          <br />
          Characters · {m.character_ids.join(", ") || "Unknown"}
          <br />
          Mood · {m.mood ?? "Unknown"}
          <br />
          Style · {m.style ?? "Unknown"}
        </p>
      </div>
      <form class="actions" method="post" action={path + "/decision"}>
        {hidden("challenge", d.challenge)}
        {d.object_prefix && (
          <button name="decision" value="publish">
            Publish
          </button>
        )}
        <button class="secondary" name="decision" value="decline">
          Discard draft
        </button>
      </form>
      <details>
        <summary>Edit public details</summary>
        <form class="stack" method="post" action={path + "/edit"}>
          {hidden("revision", d.revision)}
          {await metaFields(c, d.book, m)}
          <button>Save and review changes</button>
        </form>
      </details>
    </div>,
    { styles: ["desk"] },
  );
});
readers.post("/review/:id/file", async (c) => {
  const d = await ownDraft(c.env, reader(c).id, c.req.param("id"));
  if (d.state !== "draft" || d.expires <= now()) fail("Draft closed", 410);
  const f = await c.req.raw.formData(),
    file = f.get("image");
  if (!(file instanceof File)) fail("Select the staged file");
  await receive(
    c.env,
    await required(c.env, "SELECT * FROM assets WHERE id=?", d.asset),
    file.stream(),
  );
  return c.redirect("/review/" + d.id, 303);
});
readers.post("/review/:id/edit", async (c) => {
  const f = await c.req.raw.formData();
  await editDraft(
    c.env,
    reader(c).id,
    c.req.param("id"),
    Number(f.get("revision")),
    metadata(
      f,
      C.metadata.parse(
        JSON.parse(
          (await ownDraft(c.env, reader(c).id, c.req.param("id"))).metadata,
        ),
      ).position,
    ),
  );
  return c.redirect("/review/" + c.req.param("id"), 303);
});
readers.post("/review/:id/decision", async (c) => {
  const f = await c.req.raw.formData();
  const r = await decide(
    c.env,
    reader(c).id,
    c.req.param("id"),
    formText(f, "challenge"),
    formText(f, "decision") === "publish",
  );
  return c.redirect(r.permalink ?? "/account", 303);
});
readers.post("/posts/:id/remove", async (c) => {
  await removePost(c.env, reader(c).id, c.req.param("id"), c.get("moderator"));
  return c.redirect("/account", 303);
});
readers.get("/books/:book/contribute", async (c) => {
  const b = await getBook(c.env, c.req.param("book"));
  return page(
    c,
    "Contribute context",
    <div class="narrow">
      <Heading
        title="Contribute context"
        sub={b.title}
        back={"/books/" + b.id}
      />
      <form class="stack" method="post" encType="multipart/form-data">
        {keyField()}
        <label>
          Subject type
          <select name="subject_kind" required>
            <option value="character">Character</option>
            <option value="place">Place</option>
          </select>
        </label>
        <TextField label="Character or place" name="character" required />
        <label>
          Description
          <textarea name="description" maxLength={1800} />
        </label>
        {fileField(false)}
        <Position chapters={await bookChapters(c, b.id)} />
        <label>
          Contribution type
          <select name="kind">
            <option value="fact">Sourced observation</option>
            <option value="interpretation">Reader interpretation</option>
          </select>
        </label>
        <TextField
          label="Source and passage (required for observations)"
          name="source"
        />
        <TextField label="Public attribution" name="credit" required />
        {[
          ["display", "Allow a moderator to publish my description and credit"],
          [
            "original",
            "The image is my original sketch and I permit public display",
          ],
          [
            "reference",
            "Allow my approved original sketch to be returned through MCP",
          ],
          ["external", "Allow external research-model review of my evidence"],
        ].map(([n, t]) => (
          <label class="check">
            <input type="checkbox" name={n} />
            {t}
          </label>
        ))}
        <small>
          Page photos remain private and expire after review or 30 days. You can
          withdraw from your account.
        </small>
        <button>Submit for review</button>
      </form>
    </div>,
  );
});
readers.post("/books/:book/contribute", async (c) => {
  const f = await c.req.raw.formData(),
    book = c.req.param("book"),
    file = f.get("image"),
    asset =
      file instanceof File && file.size
        ? await browserAsset(c, book, f, "evidence")
        : undefined;
  await submit(
    c.env,
    reader(c).id,
    C.contribute.parse({
      book_id: book,
      character: formText(f, "character"),
      subject_kind: formText(f, "subject_kind"),
      description: formText(f, "description") || undefined,
      asset_id: asset,
      position: pos(f),
      kind: formText(f, "kind"),
      source: formText(f, "source") || undefined,
      credit: formText(f, "credit"),
      allow_display: f.has("display"),
      original_sketch: f.has("original"),
      allow_reference: f.has("reference"),
      allow_external_model: f.has("external"),
      request_key: formText(f, "request_key"),
    }),
  );
  return c.redirect("/account", 303);
});
