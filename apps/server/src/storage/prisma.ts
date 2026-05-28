import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = join(currentDir, "../../data/dev.db");

process.env.DATABASE_URL ??= `file:${defaultDatabasePath}`;

export const prisma = new PrismaClient();
