import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const secrets = "apps/web/.dev.vars";
if (!existsSync(secrets)) {
  writeFileSync(
    secrets,
    "AUTH_SECRET=" + randomBytes(48).toString("hex") + "\n",
    {
      flag: "wx",
      mode: 0o600,
    },
  );
}
for (const args of [
  ["d1", "migrations", "apply", "DB"],
  ["d1", "execute", "DB", "--file", "../../fixtures/alice.sql"],
]) {
  execFileSync("../../node_modules/.bin/wrangler", [...args, "--local"], {
    cwd: "apps/web",
    stdio: "inherit",
  });
}
