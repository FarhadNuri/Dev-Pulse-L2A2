import type { IncomingMessage, ServerResponse } from "http";
import { StatusCodes } from "http-status-codes";
import { sendResponse } from "../utility/sendResponse";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// In-memory rate limiter per (IP + email).
// Note: In-memory rate limiting operates per Node.js process. In serverless deployment (e.g. Vercel),
// serverless instances do not share memory, so this provides basic instance-level protection rather
// than globally distributed rate limiting (which would require Redis or Upstash).
const store = new Map<string, RateLimitRecord>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

// Periodic cleanup of expired entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (now > record.resetTime) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function getClientIp(req: IncomingMessage): string {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (xForwardedFor) {
    const ips = Array.isArray(xForwardedFor)
      ? xForwardedFor[0]
      : xForwardedFor.split(",")[0];
    if (ips) {
      return ips.trim();
    }
  }
  return req.socket.remoteAddress || "unknown";
}

export function checkRateLimit(
  req: IncomingMessage,
  res: ServerResponse,
  identifier: string,
  maxAttempts = MAX_ATTEMPTS,
  windowMs = WINDOW_MS,
): boolean {
  const ip = getClientIp(req);
  const key = `${ip}:${identifier.toLowerCase().trim()}`;
  const now = Date.now();

  let record = store.get(key);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + windowMs,
    };
    store.set(key, record);
    return true;
  }

  record.count++;

  if (record.count > maxAttempts) {
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    sendResponse(
      res,
      StatusCodes.TOO_MANY_REQUESTS,
      false,
      "Too many attempts, please try again later",
    );
    return false;
  }

  return true;
}

export function resetRateLimit(req: IncomingMessage, identifier: string): void {
  const ip = getClientIp(req);
  const key = `${ip}:${identifier.toLowerCase().trim()}`;
  store.delete(key);
}

// For unit testing:
export function clearRateLimitStore(): void {
  store.clear();
}
