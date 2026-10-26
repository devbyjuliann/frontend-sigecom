import { createServer } from "node:http";
import process from "node:process";
import { createDatabasePool } from "../../../backend-sigecom/src/db/pool.js";
import { createApp } from "../../../backend-sigecom/src/app.js";
import { getAuthConfig } from "../../../backend-sigecom/src/modules/auth/auth-config.js";
import { createLogger } from "../../../backend-sigecom/src/shared/logger.js";

const port = Number(process.env.SIGECOM_E2E_API_PORT || 3002);
const dbPool = createDatabasePool("test");
const authConfig = getAuthConfig({
  ...process.env,
  FRONTEND_ORIGIN: "http://127.0.0.1:5173",
  AUTH_RATE_LIMIT_MAX: "20",
});

await dbPool.query("SELECT 1");
const server = createServer(
  createApp({ dbPool, authConfig, logger: createLogger({ level: "silent" }) }),
);

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`SIGECOM test API listening on 127.0.0.1:${port}\n`);
});

async function shutdown() {
  await new Promise((resolveClose) => server.close(resolveClose));
  await dbPool.end();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
