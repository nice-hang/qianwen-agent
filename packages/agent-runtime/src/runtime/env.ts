import type { RuntimeEnv } from "./types";

export function readProcessEnv(): RuntimeEnv {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnv };
  };

  return globalWithProcess.process?.env ?? {};
}
