import { z } from "zod";

const neverDispatchedSchema = z.object({
  proofId: z.string().uuid(),
  expectedTransitionSequence: z.number().int().min(2),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const jobRunQuiescentReconciliationSchema = z.object({
  certificate: z.object({
    version: z.literal(1),
    attemptId: z.string().uuid(),
    targetAgentId: z.string().min(1),
    processDeadConfirmed: z.boolean(),
    journalTerminalConfirmed: z.boolean(),
    generation: z.number().int().min(1),
    verifiedAt: z.string().min(1),
  }).strict(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const jobRunReconciliationSchema = z.union([
  neverDispatchedSchema,
  jobRunQuiescentReconciliationSchema,
]);
