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
const ctx = vm.createContext({
  DISTRICT_API: apiMode ? "/api" : "",
  document: doc,
  fetch: async (url, options) => {
    requests.push(url);
    return {
      ok: true,
      json: async () =>
        options ? { plan: JSON.parse(options.body) } : catalog,
    };
  },
  location: { origin: "https://example.test", pathname: "/", hash: "" },
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
  Blob,
  setTimeout: () => 0,
  clearTimeout() {},
  confirm: () => true,
});
const run = (s) => vm.runInContext(s, ctx);
run(fs.readFileSync("dist/app.js", "utf8"));
setImmediate(async () => {
  try {
    assert.equal(run("geo.features.length"), 456);
    assert.equal(doc.querySelectorAll("path").length, 456);
    assert.deepEqual(requests, [
      apiMode ? "/api/villages/geometry" : "./taipei-villages.json",
    ]);
    assert.equal(run("components(unitIds)"), 1);
    assert.equal(run("state.version"), 2);
    const first = run("unitIds[0]");
    const original = run(`baseline['${first}']`);
    const target = original === 1 ? 2 : 1;
    run(`setMode('edit');selected=${target};activate('${first}')`);
    assert.equal(run(`state.assignments['${first}']`), target);
    els.undo.click();
    assert.equal(run(`state.assignments['${first}']`), original);
    els.redo.click();
    assert.equal(run(`state.assignments['${first}']`), target);
    // A brush stroke touching two villages is one undo operation.
    const second = run("unitIds[1]");
    run(
      "state.assignments={...baseline};history=[];future=[];selected=12;erase=false",
    );
    run(`startStroke({button:0,pointerId:1,clientX:0,clientY:0,preventDefault(){}},'${first}')`);
    doc.elementFromPoint = () => ({dataset:{name:second}});
    els.map.onpointermove({pointerId:1,clientX:1,clientY:1});
    els.map.onpointerup();
    assert.equal(run("history.length"), 1);
    assert.equal(run(`state.assignments['${second}']`), 12);
    els.undo.click();
    assert.equal(run(`state.assignments['${first}']`), original);
    els["town-filter"].value = "北投區";
    els["town-filter"].onchange();
    run("selected=3;erase=false");
    els["assign-town"].click();
    assert.equal(
      run(
        "unitIds.filter(id=>units.get(id).town==='北投區'&&state.assignments[id]===3).length",
      ),
      42,
    );
    els.undo.click();
    assert.equal(
      run(
        "unitIds.filter(id=>units.get(id).town==='北投區'&&state.assignments[id]===1).length",
      ),
      42,
    );
    els["village-search"].value = "龍福里";
    els["town-filter"].value = "";
    els["village-search"].oninput();
    assert.ok(els["search-count"].textContent.startsWith("1 里"));
    run(`focusVillage('${first}')`);
    assert.equal(run("zoom"), 6);
    assert.ok(
      doc.getElementById("map-layer").attrs.transform.includes("scale(6)"),
    );
    run("state.name='測試~分享方案'");
    await els.share.onclick();
    assert.ok(copied.length < 1200);
    assert.ok(copied.includes("#v2="));
    assert.equal(
      run(
        `readShare(${JSON.stringify(copied.slice(copied.indexOf("#")))}).name`,
      ),
      "測試~分享方案",
    );
    assert.equal(
      run(
        `JSON.stringify(readShare(${JSON.stringify(copied.slice(copied.indexOf("#")))}).assignments)===JSON.stringify(state.assignments)`,
      ),
      true,
    );
    const legacy = {
      version: 1,
      city: "臺北市",
      unit: "district",
      name: "舊方案",
      count: 6,
      assignments: run("({...districtBaseline})"),
    };
    assert.equal(run(`validate(${JSON.stringify(legacy)}).version`), 2);
    assert.equal(
      run(
        `Object.keys(validate(${JSON.stringify(legacy)}).assignments).length`,
      ),
      456,
    );
    storage.set("taipei-plan-v1", JSON.stringify(legacy));
    els.load.click();
    assert.equal(run("state.name"), "舊方案");
    els.save.click();
    assert.ok(storage.has("taipei-plan-v2"));
    const imported = run("JSON.stringify(state)");
    await els.file.onchange({
      target: {
        files: [{ size: imported.length, text: async () => imported }],
        value: "plan.json",
      },
    });
    if (apiMode) assert.ok(requests.includes("/api/plans/validate"));
    assert.throws(() => run("validate({...state,dataset_version:'wrong'})"));
    assert.throws(() => run("validate({...state,assignments:{}})"));
    assert.throws(() => run("validate({...state,count:true})"));
    run("setMode('current')");
    assert.equal(els["editor-tools"].hidden, true);
    console.log(
      `PASS (${apiMode ? "FastAPI" : "static"}): 456 villages, brush undo, batch assignment, search, focus, v1 migration, v2 save/import/share, dataset validation.`,
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
});
