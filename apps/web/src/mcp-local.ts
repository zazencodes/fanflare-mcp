// Standalone MCP distribution with the browser routes used by its tools.
import { app, fetchRequest, withImages } from "./worker-http.tsx";
import { readers } from "./reader.tsx";
import { profileRoutes } from "./profile-pages.tsx";
import { viewerRoutes } from "./viewer.tsx";
import { connectionPages } from "./connection-pages.tsx";
import { prefsRoutes } from "./prefs.ts";
import { socialRoutes } from "./social-routes.ts";
import { cleanup } from "./media.ts";
import type { Env } from "./common.ts";
export { PublicImages } from "./worker-http.tsx";

app.route("/", connectionPages);
app.route("/", profileRoutes);
app.route("/", prefsRoutes);
app.route("/", socialRoutes);
app.route("/", readers);
app.route("/", viewerRoutes);
app.get("/", (c) => c.redirect("/connect"));

export default {
  fetch: fetchRequest,
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    if (env.MAINTENANCE !== "true") await cleanup(withImages(env, ctx));
  },
};
