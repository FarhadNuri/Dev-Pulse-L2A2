const { routeHandler } = require("../dist/server.js");

module.exports = function handler(req, res) {
  // 1. Basic security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // 2. Strict CORS from FRONTEND_URL, never "*"
  const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5173";
  const requestOrigin = req.headers.origin;

  if (requestOrigin && (requestOrigin === allowedOrigin || !process.env.FRONTEND_URL)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  routeHandler(req, res);
};
