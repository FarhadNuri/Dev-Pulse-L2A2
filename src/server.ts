import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import config from "./config";
import { routeHandler } from "./routes/route";
import { testConnection } from "./database/db";

// Export routeHandler for Vercel serverless function
export { routeHandler };

const server: Server = createServer(
  (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    routeHandler(req, res);
  },
);

// Only start server if not in serverless environment
if (process.env.VERCEL !== "1") {
  testConnection().then(() => {
    server.listen(config.port, () => {
      console.log(`DevPulse server is running on port ${config.port}`);
    });
  });
}
