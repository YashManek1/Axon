import { randomUUID } from "crypto";
import { context, propagation, trace } from "@opentelemetry/api";
import logger from "../config/logger.js";

export function requestId(req, res, next) {
  const reqId = randomUUID();
  req.requestId = reqId;

  // Attach requestId as W3C baggage so it propagates to downstream services.
  const bag = propagation.createBaggage({ "request.id": { value: reqId } });
  const ctxWithBaggage = propagation.setBaggage(context.active(), bag);

  // Add requestId and traceId to the active span if OTEL is enabled.
  // trace.getActiveSpan() returns undefined when the SDK is not running (no-op).
  const activeSpan = trace.getActiveSpan();
  const spanCtx = activeSpan?.spanContext();
  const traceId = spanCtx?.traceId;

  if (activeSpan) {
    activeSpan.setAttributes({
      "request.id": reqId,
      "http.request.method": req.method,
      "http.url": req.originalUrl,
    });
  }

  req.logger = logger.child({
    requestId: reqId,
    method: req.method,
    path: req.originalUrl,
    ...(traceId && { traceId }),
  });

  res.setHeader("X-Request-Id", reqId);
  // Run the rest of the middleware chain inside the context that carries baggage.
  context.with(ctxWithBaggage, next);
}
