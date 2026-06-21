import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const environmentSchema = z.object({
  PORT: z.string().default("3000"),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  // Accept either a full REDIS_URI (production) or component vars (dev/RedisLabs)
  REDIS_URI: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters long"),
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[a-fA-F0-9]{64}$/,
      "ENCRYPTION_KEY must be exactly 64 hex characters",
    ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.string().default("587"),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  EMAIL_FROM:      z.string().optional(),
});

function formatEnvironmentError(error) {
  const details = error.issues
    .map((issue) => {
      const variable = issue.path.join(".") || "environment";
      return `${variable}: ${issue.message}`;
    })
    .join("; ");

  return `Invalid environment configuration: ${details}`;
}

export function validateEnvironment(source = process.env) {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    throw new Error(formatEnvironmentError(result.error));
  }

  const data = result.data;

  // Resolve REDIS_URI: use it directly if provided, otherwise build from components.
  let redisUri = data.REDIS_URI;
  if (!redisUri) {
    if (!data.REDIS_HOST || !data.REDIS_PORT) {
      throw new Error(
        "Invalid environment configuration: provide REDIS_URI or both REDIS_HOST and REDIS_PORT",
      );
    }
    const auth = data.REDIS_PASSWORD ? `:${data.REDIS_PASSWORD}@` : "";
    redisUri = `redis://${auth}${data.REDIS_HOST}:${data.REDIS_PORT}`;
  }

  return Object.freeze({ ...data, REDIS_URI: redisUri });
}

let environment;

try {
  environment = validateEnvironment();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

export { environment };
