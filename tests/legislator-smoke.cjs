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
  addEventListener(name, fn) {
    this["on" + name] = fn;
  }
  setPointerCapture() {}
  getBoundingClientRect() {
    return { width: 760 };
  }
  checkValidity() {
    return true;
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
    getElementById: (id) =>
      all().find((e) => e.id === id) || els[id] || (els[id] = new Element()),
    createElement: (t) => new Element(t),
    createElementNS: (_, t) => new Element(t),
    querySelectorAll: (s) =>
      all().filter((e) =>
        s.includes("path")
          ? e.tag === "path" && e.dataset.name
          : e.className === "district-sub",
      ),
  };
const storage = new Map(),
  requests = [];
let copied = "";
const apiMode = process.argv.includes("--api");
const catalog = JSON.parse(fs.readFileSync("dist/taipei-villages.json"));
const results = JSON.parse(
  fs.readFileSync("dist/elections/2024-legislator.json"),
);
const config = JSON.parse(fs.readFileSync("dist/legislator-config.json"));
const rules = JSON.parse(fs.readFileSync("dist/legal-legislator.json"));
const ctx = vm.createContext({
  DISTRICT_API: apiMode ? "/api" : "",
  document: doc,
  fetch: async (url, options) => {
    requests.push(url);
    return {
      ok: true,
      json: async () =>
        options
          ? { plan: JSON.parse(options.body) }
          : url.includes("legislator/current") ||
              url.includes("legislator-config")
            ? config
            : url.includes("legal")
              ? rules
              : url.includes("elections/")
                ? results
                : catalog,
    };
  },
  location: {
    origin: "https://example.test",
    pathname: "/",
    search: "?office=legislator",
    hash: "",
  },
  navigator: {
    clipboard: {
      writeText: async (s) => {
        copied = s;
      },
    },
  },
  localStorage: {
    setItem: (k, v) => storage.set(k, v),
    getItem: (k) => storage.get(k),
  },
  console,
  URL,
  URLSearchParams,
  Blob,
  setTimeout: () => 0,
  clearTimeout() {},
  confirm: () => true,
});
const run = (s) => vm.runInContext(s, ctx);
run(fs.readFileSync("dist/app.js", "utf8"));
setImmediate(async () => {
  try {
    assert.equal(run("state.version"), 3);
    assert.equal(run("state.office"), "legislator");
    assert.equal(run("state.count"), 8);
    assert.equal(doc.querySelectorAll("path").length, 456);
    assert.equal(els.districts.children.length, 8);
    assert.ok(els["panel-desc"].textContent.includes("1 位立委"));
    assert.ok(els["map-title"].textContent.includes("立法委員"));
    assert.equal(run("Object.keys(electionData.stations).length"), 1764);
    assert.equal(
      run(
        "unitIds.every(id=>baseline[id]===electionData.villages[id].district)",
      ),
      true,
    );
    for (let i = 1; i <= 8; i++)
      assert.equal(run(`components(membersFor(${i},baseline))`), 1);
    assert.equal(els.add.disabled, true);
    assert.equal(els.remove.disabled, true);
    els.add.click();
    els.remove.click();
    assert.equal(run("state.count"), 8);
    assert.equal(els["legal-deadline"].disabled, true);
    els["legal-enabled"].checked = true;
    els["legal-enabled"].onchange();
    const report = run("legalReport(state,{check_deadline:false})");
    assert.equal(report.items.find((i) => i.id === "seats").status, "checked");
    assert.equal(
      report.items.find((i) => i.id === "deadline").status,
      "review",
    );
    assert.equal(report.facts.deadline, null);
    assert.equal(
      report.items.find((i) => i.id === "population").status,
      "unknown",
    );
    assert.throws(() => run("validate({...state,version:2,office:undefined})"));
    assert.throws(() => run("validate({...state,count:7})"));
    assert.throws(() => run("readShare('#v2=wrong')"));
    const first = run("unitIds[0]"),
      original = run(`baseline['${first}']`);
    run(
      `setMode('edit');selected=${original === 1 ? 2 : 1};activate('${first}')`,
    );
    assert.notEqual(run(`state.assignments['${first}']`), original);
    els.undo.click();
    assert.equal(run(`state.assignments['${first}']`), original);
    els["station-number"].value = "1764";
    els["find-station"].click();
    assert.equal(run("electionStation"), "1764");
    assert.ok(els["election-status"].textContent.includes("2024-01-13"));
    assert.ok(els["station-coverage"].textContent.includes("ODS"));
    run("state.name='立委~逐里草案'");
    await els.share.onclick();
    assert.ok(copied.includes("?office=legislator#v3="));
    assert.equal(
      run(
        `readShare(${JSON.stringify(copied.slice(copied.indexOf("#")))}).name`,
      ),
      "立委~逐里草案",
    );
    els.save.click();
    assert.ok(storage.has("taipei-legislator-plan-v3"));
    assert.equal(storage.has("taipei-plan-v2"), false);
    const imported = run("JSON.stringify(state)");
    await els.file.onchange({
      target: {
        files: [{ size: imported.length, text: async () => imported }],
        value: "plan.json",
      },
    });
    if (apiMode) assert.ok(requests.includes("/api/plans/validate"));
    assert.equal(run("state.office"), "legislator");
    els["office-select"].onchange({ target: { value: "council" } });
    assert.equal(ctx.location.href, "/");
    console.log(
      `PASS legislative (${apiMode ? "FastAPI" : "static"}): 8 districts, 456 villages, 1764 stations, legal rules, undo, separate storage and v3 import/share.`,
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
});
