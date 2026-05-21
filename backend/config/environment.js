import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const environmentSchema = z.object({
  PORT: z.string().default("3000"),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  REDIS_URI: z.string().min(1, "REDIS_URI is required"),
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

  return Object.freeze(result.data);
}

let environment;

try {
  environment = validateEnvironment();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

export { environment };
