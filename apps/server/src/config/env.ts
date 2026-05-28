import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export interface ServerConfig {
  port: number;
  host: string;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(currentDir, "../..");
const envPath = join(serverRoot, ".env");

if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? "0.0.0.0"
  };
}
