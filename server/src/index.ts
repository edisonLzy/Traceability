import "dotenv/config";
import { startApi } from "./app.js";
import { isMainModule } from "./shared/isMainModule.js";

if (isMainModule(import.meta.url)) {
  await startApi();
}
