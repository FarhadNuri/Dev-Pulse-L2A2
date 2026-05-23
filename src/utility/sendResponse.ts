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

  if (errors !== undefined) {
    response.errors = errors;
  }

  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(response));
};
