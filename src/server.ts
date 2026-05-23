import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import config from "./config";
import { routeHandler } from "./routes/route";
import { testConnection } from "./database/db";

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

testConnection().then(() => {
  server.listen(config.port, () => {
    console.log(`DevPulse server is running on port ${config.port}`);
  });
});
