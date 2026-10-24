import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const allowed = new Set([
  "index.html",
  "app.js",
  "style.css",
  "taipei.json",
  "taipei-villages.json",
  "elections/2022-council.json",
  "elections/2022-council-source.json",
]);
const server = createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const name = pathname === "/" ? "index.html" : pathname.slice(1);
    if (!allowed.has(name)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const body = await readFile(resolve(root, name));
    res.writeHead(200, {
      "Content-Type": types[extname(name)],
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found. Run npm run build first.");
  }
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${port}`),
);
