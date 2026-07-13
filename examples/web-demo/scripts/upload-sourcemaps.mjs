import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const appId = process.env.TRACEABILITY_DEMO_APP_ID;
const token = process.env.TRACEABILITY_DEMO_TOKEN ?? "dev-token";
const server = (process.env.TRACEABILITY_SERVER ?? "http://localhost:3000").replace(/\/$/, "");
const release = process.env.TRACEABILITY_DEMO_RELEASE ?? "web-demo-preview";
const dist = resolve(import.meta.dirname, "..", "dist");

if (!appId) {
  throw new Error(
    "TRACEABILITY_DEMO_APP_ID is required. Create an application first, then export its id before uploading source maps.",
  );
}

const files = await filesBelow(dist);
const maps = files.filter((file) => file.endsWith(".map"));
if (maps.length === 0) throw new Error("No source maps found. Run `pnpm preview:build` first.");

for (const mapPath of maps) {
  const sourceMap = JSON.parse(await readFile(mapPath, "utf8"));
  const file = relative(dist, mapPath)
    .replace(/\\/g, "/")
    .replace(/\.map$/, "");
  const response = await fetch(`${server}/api/apps/${appId}/sourcemaps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ release, file, sourceMap }),
  });
  if (!response.ok)
    throw new Error(`Could not upload ${file}: ${response.status} ${await response.text()}`);
  console.log(`Uploaded source map for ${file}`);
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await filesBelow(fullPath)));
    else if (entry.isFile()) results.push(fullPath);
  }
  return results;
}
