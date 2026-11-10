import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import config from "./config";
import { routeHandler } from "./routes/route";
import { testConnection } from "./database/db";
import { applySecurityHeaders } from "./middleware/securityHeaders";

export { routeHandler, applySecurityHeaders };

const server: Server = createServer(
  (req: IncomingMessage, res: ServerResponse) => {
    if (applySecurityHeaders(req, res)) {
      return;
    }

    routeHandler(req, res);
  },
);

if (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "test") {
  testConnection().then(() => {
    server.listen(config.port, () => {
      console.log(`DevPulse server is running on port ${config.port}`);
    });
  });
}
