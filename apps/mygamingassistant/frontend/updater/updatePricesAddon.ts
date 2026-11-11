import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPriceHouse } from "./fetchPriceHouse";
import { refreshPricesAddon } from "./refreshPricesAddon";

// node mga-prices-updater.mjs "<WoW>\_forever_\Interface\AddOns"
// Each run appends one line to updater.log beside this file (the scheduled task has no window).
const LOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "updater.log");

async function log(message: string): Promise<void> {
  const line = `${new Date().toISOString()} ${message}`;
  console.warn(line);
  await appendFile(LOG, `${line}\n`, "utf8");
}

const addonsDir = process.argv[2];
if (!addonsDir) {
  console.error('Usage: node mga-prices-updater.mjs "<WoW folder>\\_forever_\\Interface\\AddOns"');
  process.exit(2);
}

try {
  await log(`updated ${await refreshPricesAddon(addonsDir, fetchPriceHouse)}`);
} catch (error) {
  await log(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
