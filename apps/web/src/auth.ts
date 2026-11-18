import { betterAuth } from "better-auth";
import { jwt, emailOTP, twoFactor } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { mcp } from "@better-auth/mcp";
import { scopes } from "@fanflare/contracts";
import { mac, type Env } from "./common.ts";
export function auth(env: Env) {
  const resource = env.ORIGIN + "/mcp";
  return betterAuth({
    appName: "Fanflare",
    baseURL: env.ORIGIN,
    secret: env.AUTH_SECRET,
    database: env.DB,
    disabledPaths: [
      "/token",
      "/sign-up/email",
      "/email-otp/reset-password",
      "/email-otp/request-password-reset",
      "/forget-password/email-otp",
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
      "/two-factor/generate-backup-codes",
    ],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      async onPasswordReset({ user }) {
        const challenges = await env.DB.prepare(
          "SELECT identifier FROM verification WHERE value=? AND identifier LIKE '2fa-%'",
        )
          .bind(user.id)
          .all<{ identifier: string }>();
        for (const challenge of challenges.results) {
          await env.DB.prepare(
            "DELETE FROM verification WHERE identifier IN (?, ?, ?)",
          )
            .bind(
              challenge.identifier,
              "2fa-otp-" + challenge.identifier,
              "2fa-attempts-" + challenge.identifier,
            )
            .run();
        }
      },
      async sendResetPassword({ user, url }) {
        if (!env.MAIL || !env.MAIL_FROM)
          throw new Error("Email delivery is unavailable");
        await env.MAIL.send({
          from: env.MAIL_FROM,
          to: user.email,
          subject: "Set your Fanflare password",
          text:
            "Set or recover your Fanflare password: " +
            url +
            "\nThis link expires in one hour. Email two-step verification stays enabled.",
        });
      },
    },
    // Enforce the same policy for HTTP, SSR and direct library calls. The
    // session hook also closes a race with enrollment during email-code login.
    databaseHooks: {
      session: {
        create: {
          before: async (session, ctx) => {
            const user = await ctx?.context.adapter.findOne<{
              twoFactorEnabled: boolean;
            }>({
              model: "user",
              where: [{ field: "id", value: session.userId }],
            });
            if (
              user?.twoFactorEnabled &&
              ![
                "/sign-in/email",
                "/two-factor/verify-otp",
                "/two-factor/enable",
                "/two-factor/disable",
              ].includes(ctx?.path ?? "")
            )
              throw new APIError("FORBIDDEN", {
                message: "Sign in with your password and email code.",
              });
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ["/two-factor/send-otp", "/two-factor/verify-otp"].includes(ctx.path)
        ) {
          const token = await ctx.getSignedCookie(
            ctx.context.authCookies.sessionToken.name,
            ctx.context.secret,
          );
          const session =
            token && (await ctx.context.internalAdapter.findSession(token));
          if (
            session &&
            !(
              session.user as typeof session.user & {
                twoFactorEnabled?: boolean;
              }
            ).twoFactorEnabled
          )
            throw new APIError("FORBIDDEN", {
              message: "Enable email two-step with your password first.",
            });
        }
        if (ctx.path.startsWith("/two-factor/") && ctx.body?.trustDevice)
          throw new APIError("BAD_REQUEST", {
            message: "An email code is required at every sign-in.",
          });
        if (ctx.path === "/two-factor/enable" && ctx.body?.method !== "otp")
          throw new APIError("BAD_REQUEST", {
            message: "Choose email two-step verification.",
          });
        if (ctx.path === "/two-factor/disable") {
          const session = await ctx.context.internalAdapter.findSession(
            (await ctx.getSignedCookie(
              ctx.context.authCookies.sessionToken.name,
              ctx.context.secret,
            )) || "",
          );
          const proof =
            session &&
            (await ctx.context.internalAdapter.consumeVerificationValue(
              "fanflare-disable:" + session.session.id,
            ));
          if (!proof)
            throw new APIError("FORBIDDEN", {
              message:
                "Verify a fresh email code before disabling two-step verification.",
            });
        }
        if (ctx.path === "/sign-in/email-otp") {
          const found = await ctx.context.adapter.findOne<{
            twoFactorEnabled: boolean;
          }>({
            model: "user",
            where: [
              {
                field: "email",
                value: String(ctx.body.email).trim().toLowerCase(),
              },
            ],
          });
          if (found?.twoFactorEnabled)
            throw new APIError("FORBIDDEN", {
              message: "Sign in with your password and email code.",
            });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/two-factor/enable" && ctx.context.newSession) {
          const current = ctx.context.newSession.session;
          const sessions = await ctx.context.internalAdapter.listSessions(
            current.userId,
          );
          await ctx.context.internalAdapter.deleteSessions(
            sessions
              .filter((s) => s.token !== current.token)
              .map((s) => s.token),
          );
        }
        if (
          ctx.path === "/two-factor/verify-otp" &&
          ctx.context.session &&
          (
            ctx.context.session?.user as
              { twoFactorEnabled?: boolean } | undefined
          )?.twoFactorEnabled &&
          !(ctx.context.returned instanceof APIError)
        ) {
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: "fanflare-disable:" + ctx.context.session.session.id,
            value: ctx.context.session.user.id,
            expiresAt: new Date(Date.now() + 600000),
          });
        }
      }),
    },
    rateLimit: { enabled: true, storage: "database" },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: env.ORIGIN.startsWith("https://"),
    },
    plugins: [
      jwt({ disableSettingJwtHeader: true }),
      twoFactor({
        totpOptions: { disable: true },
        otpOptions: {
          period: 10,
          allowedAttempts: 5,
          storeOTP: "hashed",
          async sendOTP({ user, otp }, ctx) {
            const accountChange = Boolean(ctx?.context.session);
            if (!env.MAIL || !env.MAIL_FROM)
              throw new Error("Email delivery is unavailable");
            await env.MAIL.send({
              from: env.MAIL_FROM,
              to: user.email,
              subject: accountChange
                ? "Confirm your Fanflare security change"
                : "Your Fanflare two-step code",
              text:
                (accountChange
                  ? "Confirm disabling email two-step verification in your account with "
                  : "Complete your Fanflare password sign-in with ") +
                otp +
                ". It expires in ten minutes.",
            });
          },
        },
      }),
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource,
        scopes: [...scopes, "offline_access"],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        clientRegistrationDefaultScopes: [...scopes, "offline_access"],
        resources: [{ identifier: resource, allowedScopes: [...scopes] }],
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        resendStrategy: "rotate",
        storeOTP: { hash: (otp) => mac(env.AUTH_SECRET, "email-code:" + otp) },
        async sendVerificationOTP({ email, otp, type }) {
          if (
            !["sign-in", "email-verification"].includes(type) ||
            !env.MAIL ||
            !env.MAIL_FROM
          )
            throw new Error("Email delivery is unavailable");
          await env.MAIL.send({
            from: env.MAIL_FROM,
            to: email,
            subject:
              type === "email-verification"
                ? "Verify your Fanflare email"
                : "Your Fanflare sign-in code",
            text:
              (type === "email-verification"
                ? "Verify your email with "
                : "Your Fanflare sign-in code is ") +
              otp +
              ". It expires in ten minutes.",
          });
        },
      }),
    ],
  });
}
