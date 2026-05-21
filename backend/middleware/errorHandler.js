import { environment } from "../config/environment.js";

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const requestId = req.requestId;
  const response = {
    error: err.message,
    requestId,
  };

  if (environment.NODE_ENV === "development") {
    response.stack = err.stack;
  }

  req.logger?.error({ err, statusCode }, "Unhandled request error");

  return res.status(statusCode).json(response);
}
