import { z } from "zod";

export const cronExpressionSchema = z
  .string()
  .regex(
    /^(\S+\s+){4,5}\S+$/,
    "Cron expression must contain 5 or 6 fields",
  );

const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid ObjectId");

const httpPayloadSchema = z.object({
  url: z.string().url(),
  method: z.string().min(1),
  headers: z.record(z.string(), z.unknown()).default({}).optional(),
  body: z.unknown().optional(),
});

const shellPayloadSchema = z.object({
  command: z.string().min(1),
});

const sinkSchema = z.object({
  type: z.enum(["mongo"]).nullable().optional(),
  uri: z.string().nullable().optional(),
  databaseName: z.string().nullable().optional(),
  collectionName: z.string().nullable().optional(),
  exportFormat: z.array(z.enum(["CSV", "JSON", "Excel"])).optional(),
  encryptionAlg: z.string().optional(),
});

const notificationsSchema = z.object({
  onSuccess: z.boolean().optional(),
  onFailure: z.boolean().optional(),
  recipients: z.array(z.string()).optional(),
});

const executionWindowSchema = z.object({
  enabled: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  activeDays: z
    .array(z.enum(["M", "T", "W", "Th", "F", "Sa", "Su"]))
    .optional(),
});

const jobFields = {
  name: z.string().min(1),
  type: z.enum(["http", "shell"]),
  schedule: cronExpressionSchema,
  payload: z.union([httpPayloadSchema, shellPayloadSchema]),
  enabled: z.boolean().optional(),
  retryLimit: z.number().int().min(0).optional(),
  webhookUrl: z.string().url().nullable().optional(),
  orgId: objectIdSchema.optional(),
  dependsOn: z.array(objectIdSchema).optional(),
  status: z.enum(["active", "paused"]).optional(),
  nextRunAt: z.coerce.date().nullable().optional(),
  sink: sinkSchema.optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(["Low", "Medium", "High"]).optional(),
  tags: z.array(z.string()).optional(),
  timeout: z.number().min(0).optional(),
  notifications: notificationsSchema.optional(),
  executionWindow: executionWindowSchema.optional(),
  scheduleType: z.enum(["Cron", "Interval", "Once"]).optional(),
  timezone: z.string().optional(),
};

export const createJobSchema = z.object(jobFields);
export const updateJobSchema = z.object(jobFields).partial();
