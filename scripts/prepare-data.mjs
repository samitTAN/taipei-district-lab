import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const data = JSON.parse(
    await readFile(resolve(root, "data/taipei-villages.json"), "utf8"),
  );
  const source = JSON.parse(
    await readFile(resolve(root, "data/villages-source.json"), "utf8"),
  );
  const ids = new Set(data.features.map((f) => f.properties.id));
  if (
    data.dataset_version !== source.id ||
    data.features.length !== 456 ||
    ids.size !== 456 ||
    new Set(data.features.map((f) => f.properties.town)).size !== 12
  )
    throw Error("Official village data coverage/version mismatch");
  for (const f of data.features) {
    if (!f.properties.neighbors.every((id) => ids.has(id)))
      throw Error("Invalid village neighbor ID");
  }
  const districts = await readFile(resolve(root, "data/taipei-districts.json"));
  await writeFile(resolve(root, "data/taipei.json"), districts);
  console.log(
    "Verified checked-in official geometry: 456 villages / 12 districts. No network download required.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
