import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const source = JSON.parse(
  await readFile(resolve(root, "data/source.json"), "utf8"),
);
try {
  const args = process.argv.slice(2);
  if (args.length && (args[0] !== "--source" || args.length !== 2))
    throw new Error(
      "Usage: npm run data:prepare -- [--source /path/to/twtown2010.3.json]",
    );
  let bytes;
  if (args[0] === "--source") bytes = await readFile(resolve(args[1]));
  else {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(`Download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
    throw new Error(
      "Source checksum mismatch. Review provenance before updating data/source.json.",
    );
  const input = JSON.parse(bytes.toString("utf8"));
  const features = input.features.filter(
    (f) => f.properties.county === source.filter.county,
  );
  if (
    features.length !== source.expected_features ||
    new Set(features.map((f) => f.properties.town)).size !== 12
  )
    throw new Error("Unexpected Taipei district coverage.");
  await mkdir(resolve(root, "data"), { recursive: true });
  await writeFile(
    resolve(root, "data/taipei.json"),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  console.log(
    "Prepared 12 legacy Taipei district features. See docs/DATA.md for vintage and licensing limitations.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
