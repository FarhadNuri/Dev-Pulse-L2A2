import type { ServerResponse } from "http";

export const sendResponse = (
  res: ServerResponse,
  statusCode: number,
  success: boolean,
  message: string,
  data?: any,
  errors?: any,
) => {
  const response: any = {
    success,
    message,
  };

  if (data !== undefined) {
    response.data = data;
  }

  // Never send internal stack traces or database errors to the client on 500+
  if (errors !== undefined) {
    if (statusCode >= 500) {
      // Internal error: log server-side, never expose to client
      console.error(`[Internal Server Error ${statusCode}]:`, errors);
    } else {
      // 4xx client errors (e.g. validation issues) are safe to return
      response.errors = errors;
    }
  }

  // Ensure security headers are set on every response
  if (!res.headersSent) {
    if (!res.getHeader("X-Content-Type-Options")) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    }
    if (!res.getHeader("X-Frame-Options")) {
      res.setHeader("X-Frame-Options", "DENY");
    }
    if (!res.getHeader("Referrer-Policy")) {
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    }
  }

  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(response));
};
