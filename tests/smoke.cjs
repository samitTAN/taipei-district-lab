const vm = require("node:vm"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attrs = {};
    this.className = "";
    this.value = "";
    this.classList = {
      toggle: (k, v) => {
        const a = new Set(this.className.split(" "));
        v ? a.add(k) : a.delete(k);
        this.className = [...a].join(" ");
      },
    };
  }
  append(...v) {
    this.children.push(...v);
  }
  replaceChildren(...v) {
    this.children = v;
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
    if (k === "class") this.className = v;
  }
  querySelector(s) {
    return this.children.find((c) => c.tag === s);
  }
  click() {
    this.onclick?.();
  }
  showModal() {}
  close() {}
}
const els = {},
  all = () => {
    const nodes = [];
    function walk(e) {
      nodes.push(e);
      for (const c of e.children || []) if (typeof c === "object") walk(c);
    }
    Object.values(els).forEach(walk);
    return nodes;
  },
  doc = {
    getElementById: (id) => els[id] || (els[id] = new Element()),
    createElement: (t) => new Element(t),
    createElementNS: (_, t) => new Element(t),
    querySelectorAll: (s) =>
      all().filter((e) =>
        s.includes("path")
          ? e.tag === "path" && e.dataset.name
          : e.className === "district-sub",
      ),
  };
const storage = new Map();
let copied = "";
const apiMode = process.argv.includes("--api");
const requests = [];
const ctx = vm.createContext({
  DISTRICT_API: apiMode ? "/api" : "",
  document: doc,
  fetch: async (url, options) => {
    requests.push(url);
    return {
      ok: true,
      json: async () =>
        url.endsWith("/current")
          ? {
              council_term: 14,
              assignments: Object.fromEntries(
                [
                  "北投區",
                  "士林區",
                  "內湖區",
                  "南港區",
                  "松山區",
                  "信義區",
                  "中山區",
                  "大同區",
                  "中正區",
                  "萬華區",
                  "大安區",
                  "文山區",
                ].map((n, i) => [n, Math.floor(i / 2) + 1]),
              ),
              seats: [12, 9, 9, 8, 8, 13],
            }
          : url.endsWith("/validate")
            ? { plan: JSON.parse(options.body) }
            : JSON.parse(fs.readFileSync("dist/taipei.json")),
    };
  },
  location: { origin: "https://example.test", pathname: "/", hash: "" },
  navigator: { clipboard: { writeText: async (s) => (copied = s) } },
  localStorage: {
    setItem: (k, v) => storage.set(k, v),
    getItem: (k) => storage.get(k),
  },
  console,
  URL,
  Blob,
  setTimeout: () => 0,
  clearTimeout() {},
  confirm: () => true,
});
const run = (s) => vm.runInContext(s, ctx);
run(fs.readFileSync("dist/app.js", "utf8"));
setImmediate(async () => {
  try {
    assert.equal(run("geo.features.length"), 12);
    assert.deepEqual(
      requests,
      apiMode
        ? ["/api/districts/current", "/api/districts/geometry"]
        : ["./taipei.json"],
    );
    if (apiMode) {
      const imported = run("JSON.stringify(state)");
      await els.file.onchange({
        target: {
          files: [{ size: imported.length, text: async () => imported }],
          value: "plan.json",
        },
      });
      assert.ok(requests.includes("/api/plans/validate"));
    }
    assert.equal(run("names.every(n=>adj[n].size>0)"), true);
    assert.equal(run("components(names)"), 1);
    assert.equal(doc.querySelectorAll("path").length, 12);
    assert.equal(run('membersFor(1,baseline).join(",")'), "北投區,士林區");
    assert.equal(run("seats.reduce((a,b)=>a+b,0)"), 59);
    run("setMode('edit'); selected=2; activate('北投區')");
    assert.equal(run("state.assignments['北投區']"), 2);
    assert.equal(run("components(membersFor(2,state.assignments))"), 2);
    els.undo.click();
    assert.equal(run("state.assignments['北投區']"), 1);
    els.redo.click();
    assert.equal(run("state.assignments['北投區']"), 2);
    els.erase.click();
    run("activate('北投區')");
    assert.equal(run("state.assignments['北投區']"), 0);
    els.add.click();
    assert.equal(run("state.count"), 7);
    run("activate('北投區')");
    assert.equal(run("state.assignments['北投區']"), 7);
    els.remove.click();
    assert.equal(run("state.count"), 6);
    assert.equal(run("state.assignments['北投區']"), 0);
    els.save.click();
    run("activate('士林區')");
    els.load.click();
    assert.equal(run("state.assignments['士林區']"), 1);
    await els.share.onclick();
    assert.ok(copied.startsWith("https://example.test/#plan="));
    assert.equal(
      JSON.parse(decodeURIComponent(copied.split("#plan=")[1])).count,
      6,
    );
    assert.throws(() => run("validate({...state, count:99})"));
    assert.throws(() => run("validate({...state, assignments:{}})"));
    run("setMode('current')");
    assert.equal(run("baseline['北投區']"), 1);
    assert.equal(els["editor-tools"].hidden, true);
    console.log(
      "PASS: geometry, adjacency, current map, assignments, disconnected detection, erase, undo/redo, add/remove, save/load, share round trip, invalid imports, mode isolation.",
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
});
