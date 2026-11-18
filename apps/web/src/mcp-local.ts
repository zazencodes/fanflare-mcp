// Standalone MCP distribution with the browser routes used by its tools.
import { app, fetchRequest } from "./worker-http.tsx";
import { readers } from "./reader.tsx";
import { profileRoutes } from "./profile-pages.tsx";
import { viewerRoutes } from "./viewer.tsx";
import { connectionPages } from "./connection-pages.tsx";
export { PublicImages } from "./worker-http.tsx";

app.route("/", connectionPages);
app.route("/", profileRoutes);
app.route("/", readers);
app.route("/", viewerRoutes);
app.get("/", (c) => c.redirect("/connect"));

export default { fetch: fetchRequest };
