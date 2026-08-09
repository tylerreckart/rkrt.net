import "dotenv/config";
import { runSyncGoodreadsCli } from "../src/app/utils/sync-goodreads";

runSyncGoodreadsCli().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
