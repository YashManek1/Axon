import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import { environment } from "./environment.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);

const baseOptions = {
  level: environment.NODE_ENV === "test" ? "silent" : environment.LOG_LEVEL,
  base: {
    service: "axon-control-plane",
    version: packageJson.version,
  },
};

const transport =
  environment.NODE_ENV === "development"
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
        },
      })
    : undefined;

const logger = transport ? pino(baseOptions, transport) : pino(baseOptions);

export function createChildLogger(context) {
  return logger.child(context);
}

export default logger;
