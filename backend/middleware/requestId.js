import { randomUUID } from "crypto";
import logger from "../config/logger.js";

export function requestId(req, res, next) {
  const requestId = randomUUID();

  req.requestId = requestId;
  req.logger = logger.child({
    requestId,
    method: req.method,
    path: req.originalUrl,
  });

  res.setHeader("X-Request-Id", requestId);
  next();
}
