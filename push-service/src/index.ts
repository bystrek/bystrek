import { app } from "./app";
import { PORT } from "./env";

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`push-service listening on :${PORT}`);
