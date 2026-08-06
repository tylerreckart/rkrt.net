import "dotenv/config";
import { bundleAssets } from "../src";

bundleAssets().catch((error) => {
  console.error(error);
  process.exit(1);
});
