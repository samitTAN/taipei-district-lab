import { access, cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  await access(resolve(root, "data/taipei.json"));
} catch {
  console.error(
    "Missing data/taipei.json. Run npm run data:prepare first; see docs/DATA.md.",
  );
  process.exit(1);
}
await rm(resolve(root, "dist"), { recursive: true, force: true });
await mkdir(resolve(root, "dist"));
for (const name of ["index.html", "app.js", "style.css"])
  await cp(resolve(root, "src", name), resolve(root, "dist", name));
await cp(resolve(root, "data/taipei.json"), resolve(root, "dist/taipei.json"));
await cp(
  resolve(root, "data/taipei-villages.json"),
  resolve(root, "dist/taipei-villages.json"),
);
console.log("Built village editor in dist/.");

await cp(resolve(root, "data/elections"), resolve(root, "dist/elections"), {
  recursive: true,
});

await cp(
  resolve(root, "data/legal-rules.json"),
  resolve(root, "dist/legal-rules.json"),
);

for (const name of ["legislator-config.json", "legal-legislator.json"])
  await cp(resolve(root, "data", name), resolve(root, "dist", name));
