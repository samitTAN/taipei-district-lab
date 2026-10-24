"use strict";
const API = globalThis.DISTRICT_API || "";
const $ = (id) => document.getElementById(id),
  NS = "http://www.w3.org/2000/svg";
const names = [
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
];
const districtBaseline = Object.fromEntries(
  names.map((n, i) => [n, Math.floor(i / 2) + 1]),
);
let baseline = { ...districtBaseline },
  unitIds = [],
  units = new Map(),
  projectPoint,
  panX = 0,
  panY = 0,
  moveTool = false,
  stroke = null;
const colors = [
  "#91b7a0",
  "#d8b375",
  "#91afc0",
  "#b7a7c8",
  "#cf9690",
  "#b6c888",
  "#93bfc0",
  "#d5aa92",
  "#a6afd0",
  "#c3ba88",
  "#a9c19c",
  "#d0a6b7",
];
const seats = [12, 9, 9, 8, 8, 13];
let state = {
    version: 1,
    city: "臺北市",
    unit: "district",
    name: "我的台北選區方案",
    count: 6,
    assignments: { ...districtBaseline },
  },
  mode = "current",
  selected = 1,
  erase = false,
  highlight = null,
  history = [],
  future = [],
  geo,
  adj = {},
  zoom = 1;
const positions = {
  北投區: [121.501, 25.133],
  士林區: [121.554, 25.132],
  內湖區: [121.592, 25.084],
  南港區: [121.609, 25.037],
  松山區: [121.557, 25.059],
  信義區: [121.576, 25.026],
  中山區: [121.537, 25.075],
  大同區: [121.511, 25.064],
  中正區: [121.515, 25.027],
  萬華區: [121.492, 25.028],
  大安區: [121.542, 25.026],
  文山區: [121.576, 24.992],
};
let toastTimer;
function toast(t) {
  $("toast").textContent = t;
  $("toast").style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").style.display = "none"), 3500);
}
function clone(x) {
  return JSON.parse(JSON.stringify(x));
}
function change(fn) {
  history.push(clone(state));
  if (history.length > 100) history.shift();
  future = [];
  fn();
  render();
}
function validate(s) {
  const fail = () => {
    throw Error("方案格式或圖資版本不符，請匯入本工具的台北市方案。");
  };
  if (
    !s ||
    s.city !== "臺北市" ||
    typeof s.name !== "string" ||
    s.name.length > 60 ||
    !Number.isInteger(s.count) ||
    s.count < 1 ||
    s.count > 12 ||
    !s.assignments ||
    typeof s.assignments !== "object"
  )
    fail();
  if (s.version === 1 && s.unit === "district") {
    if (
      Object.keys(s.assignments).length !== 12 ||
      !names.every(
        (n) =>
          Number.isInteger(s.assignments[n]) &&
          s.assignments[n] >= 0 &&
          s.assignments[n] <= s.count,
      )
    )
      fail();
    return {
      version: 2,
      city: "臺北市",
      unit: "village",
      dataset_version: geo.dataset_version,
      name: s.name,
      count: s.count,
      assignments: Object.fromEntries(
        unitIds.map((id) => [id, s.assignments[units.get(id).town]]),
      ),
    };
  }
  if (
    s.version !== 2 ||
    s.unit !== "village" ||
    s.dataset_version !== geo.dataset_version ||
    Object.keys(s.assignments).length !== unitIds.length ||
    !unitIds.every(
      (id) =>
        Number.isInteger(s.assignments[id]) &&
        s.assignments[id] >= 0 &&
        s.assignments[id] <= s.count,
    )
  )
    fail();
  return {
    version: 2,
    city: "臺北市",
    unit: "village",
    dataset_version: geo.dataset_version,
    name: s.name,
    count: s.count,
    assignments: Object.fromEntries(
      unitIds.map((id) => [id, s.assignments[id]]),
    ),
  };
}
function shareHash(plan) {
  return (
    "#v2=" +
    [
      encodeURIComponent(plan.dataset_version),
      plan.count,
      encodeURIComponent(plan.name).replaceAll("~", "%7E"),
      unitIds.map((id) => plan.assignments[id].toString(16)).join(""),
    ].join("~")
  );
}
function readShare(hash) {
  if (hash.startsWith("#plan="))
    return validate(JSON.parse(decodeURIComponent(hash.slice(6))));
  const parts = hash.slice(4).split("~");
  if (
    parts.length !== 4 ||
    !/^[0-9a-c]+$/.test(parts[3]) ||
    parts[3].length !== unitIds.length
  )
    throw Error("分享連結格式不符");
  return validate({
    version: 2,
    city: "臺北市",
    unit: "village",
    dataset_version: decodeURIComponent(parts[0]),
    count: Number(parts[1]),
    name: decodeURIComponent(parts[2]),
    assignments: Object.fromEntries(
      unitIds.map((id, i) => [id, parseInt(parts[3][i], 16)]),
    ),
  });
}
function components(members) {
  if (!members.length) return 0;
  let unseen = new Set(members),
    count = 0;
  while (unseen.size) {
    count++;
    let queue = [unseen.values().next().value];
    unseen.delete(queue[0]);
    while (queue.length) {
      for (const n of adj[queue.pop()] || []) {
        if (unseen.delete(n)) queue.push(n);
      }
    }
  }
  return count;
}
function setMode(v) {
  mode = v;
  highlight = null;
  render();
}
function membersFor(i, a) {
  return unitIds.filter((n) => a[n] === i);
}
function render() {
  if (unitIds.length) searchVillages();
  let editing = mode === "edit",
    a = editing ? state.assignments : baseline,
    count = editing ? state.count : 6;
  $("current").classList.toggle("active", !editing);
  $("edit").classList.toggle("active", editing);
  $("current").setAttribute("aria-pressed", !editing);
  $("edit").setAttribute("aria-pressed", editing);
  $("editor-tools").hidden = !editing;
  $("edit-actions").hidden = !editing;
  $("current-note").hidden = editing;
  $("panel-eyebrow").textContent = editing
    ? "YOUR DISTRICT PLAN"
    : "THE CURRENT MAP";
  $("panel-title").textContent = editing ? "畫出你的選區" : "認識現行選區";
  $("panel-desc").textContent = editing
    ? "以 456 個里為單位，重新組合台北的選區。"
    : "六個區域選區，每個選區選出多位議員。";
  $("map-badge").textContent = editing
    ? "公民重劃草案 · 非官方方案"
    : "現行配置 · 第 14 屆";
  $("map-title").textContent = editing ? state.name : "臺北市議員區域選區";
  $("map-hint").textContent = editing
    ? erase
      ? "橡皮擦：點選或拖曳取消里的分配"
      : `點選或拖曳塗選，加入第 ${selected} 選區`
    : "點選里，認識所屬選區";
  if (moveTool)
    $("map-hint").textContent = "移動工具：拖曳平移地圖，不變更分配";
  $("plan-name").value = state.name;
  $("undo").disabled = !history.length;
  $("redo").disabled = !future.length;
  $("add").disabled = state.count >= 12;
  $("remove").disabled = state.count <= 1;
  $("erase").setAttribute("aria-pressed", erase);
  $("districts").replaceChildren();
  for (let i = 1; i <= count; i++) {
    let members = membersFor(i, a),
      b = document.createElement("button");
    b.className =
      "district-card" +
      ((editing && selected === i && !erase) || (!editing && highlight === i)
        ? " active"
        : "");
    b.setAttribute(
      "aria-pressed",
      editing ? selected === i && !erase : highlight === i,
    );
    let sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = colors[i - 1];
    sw.textContent = String(i).padStart(2, "0");
    let txt = document.createElement("span");
    txt.className = "card-text";
    let title = document.createElement("b");
    title.textContent = `第 ${i} 選區`;
    let sub = document.createElement("small");
    sub.textContent = members.length
      ? [
          ...new Set(members.map((id) => units.get(id).town.replace("區", ""))),
        ].join("・")
      : "尚未分配";
    txt.append(title, sub);
    let extra = document.createElement("span");
    extra.className = "seats";
    if (editing) {
      extra.textContent = `${members.length} 里`;
    } else {
      let num = document.createElement("b");
      num.textContent = seats[i - 1];
      extra.append(num, "席");
    }
    b.append(sw, txt, extra);
    b.onclick = () => {
      if (editing) {
        selected = i;
        erase = false;
      } else highlight = highlight === i ? null : i;
      render();
    };
    $("districts").append(b);
  }
  if (geo) {
    document.querySelectorAll("#map path[data-name]").forEach((p) => {
      const n = p.dataset.name,
        i = a[n];
      p.setAttribute("fill", i ? colors[i - 1] : "#d8ddd3");
      p.classList.toggle("highlight", !editing && a[n] === highlight);
      p.setAttribute(
        "aria-label",
        `${units.get(n).label}，${i ? `第 ${i} 選區` : "未分配"}${editing ? "，點選重新分配" : ""}`,
      );
      p.querySelector("title").textContent =
        `${units.get(n).label} · ${i ? `第 ${i} 選區` : "未分配"}`;
    });
  }
  const missing = unitIds.filter((n) => !a[n]),
    empty = [],
    disconnected = [];
  for (let i = 1; i <= count; i++) {
    let m = membersFor(i, a);
    if (!m.length) empty.push(i);
    if (components(m) > 1) disconnected.push(i);
  }
  $("checks").replaceChildren();
  for (const [text, warn] of [
    [
      `已分配 ${unitIds.length - missing.length} / ${unitIds.length} 里`,
      !!missing.length,
    ],
    [
      missing.length
        ? `未分配：${missing
            .slice(0, 4)
            .map((id) => units.get(id).label)
            .join("、")}${missing.length > 4 ? "…" : ""}`
        : "✓ 所有里皆已分配",
      !!missing.length,
    ],
    [
      disconnected.length
        ? `⚠ 第 ${disconnected.join("、")} 選區未相連`
        : "✓ 已分配區塊皆相連（圖資鄰接檢查）",
      !!disconnected.length,
    ],
    [empty.length ? `空選區：${empty.join("、")}` : "", !!empty.length],
    ["人口及席次試算尚未接入；不代表法定劃分審核。", false],
  ]) {
    if (!text) continue;
    let line = document.createElement("div");
    line.textContent = text;
    if (warn) line.className = "warn";
    $("checks").append(line);
  }
}
function activate(n) {
  selectElectionVillage(n);
  if (mode === "current") {
    highlight = baseline[n];
    render();
    toast(
      `${units.get(n).label}：第 ${baseline[n]} 選區 · ${seats[baseline[n] - 1]} 席`,
    );
  } else {
    let target = erase ? 0 : selected;
    if (state.assignments[n] === target) return;
    change(() => (state.assignments[n] = target));
  }
}
function polygons(f) {
  return f.geometry.type === "Polygon"
    ? [f.geometry.coordinates]
    : f.geometry.coordinates;
}
async function init() {
  try {
    if (API)
      $("save-status").textContent =
        "儲存於此瀏覽器；匯入方案會送後端驗證，不持久保留。";
    const response = await fetch(
      API ? `${API}/villages/geometry` : "./taipei-villages.json",
    );
    if (!response.ok) throw Error("圖資載入失敗");
    geo = await response.json();
    if (geo.features.length !== 456 || !geo.dataset_version)
      throw Error("里界資料不完整");
    units = new Map(
      geo.features.map((f) => [
        f.properties.id,
        {
          ...f.properties,
          village: f.properties.village.replace("糖蔀里", "糖廍里"),
          label: f.properties.label.replace("糖蔀里", "糖廍里"),
        },
      ]),
    );
    unitIds = [...units.keys()].sort();
    baseline = Object.fromEntries(
      unitIds.map((id) => [id, districtBaseline[units.get(id).town]]),
    );
    state = {
      version: 2,
      city: "臺北市",
      unit: "village",
      dataset_version: geo.dataset_version,
      name: state.name,
      count: 6,
      assignments: { ...baseline },
    };
    adj = Object.fromEntries(
      unitIds.map((id) => [id, new Set(units.get(id).neighbors)]),
    );
    const bounds = geo.features
      .flatMap((f) => polygons(f).flat(2))
      .reduce(
        (b, p) => [
          Math.min(b[0], p[0]),
          Math.min(b[1], p[1]),
          Math.max(b[2], p[0]),
          Math.max(b[3], p[1]),
        ],
        [Infinity, Infinity, -Infinity, -Infinity],
      );
    const [minX, minY, maxX, maxY] = bounds,
      cos = Math.cos((25 * Math.PI) / 180),
      scale = Math.min(580 / ((maxX - minX) * cos), 530 / (maxY - minY));
    projectPoint = (p) => [
      380 + (p[0] - (minX + maxX) / 2) * cos * scale,
      355 - (p[1] - (minY + maxY) / 2) * scale,
    ];
    $("map").replaceChildren();
    const layer = document.createElementNS(NS, "g");
    layer.id = "map-layer";
    $("map").append(layer);
    for (const f of geo.features) {
      const id = f.properties.id,
        path = document.createElementNS(NS, "path");
      path.dataset.name = id;
      path.setAttribute(
        "d",
        polygons(f)
          .map((poly) =>
            poly
              .map(
                (ring) =>
                  "M" +
                  ring
                    .map((p) =>
                      projectPoint(p)
                        .map((v) => v.toFixed(3))
                        .join(","),
                    )
                    .join("L") +
                  "Z",
              )
              .join(""),
          )
          .join(""),
      );
      path.setAttribute("fill-rule", "evenodd");
      path.setAttribute("tabindex", "0");
      path.setAttribute("role", "button");
      path.append(document.createElementNS(NS, "title"));
      path.onclick = (e) => {
        if (e.detail === 0) activate(id);
      };
      path.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate(id);
        }
      };
      path.onpointerdown = (e) => startStroke(e, id);
      path.onpointerenter = () => {
        $("hover-village").textContent = f.properties.label;
      };
      layer.append(path);
    }
    for (const town of names) {
      const [x, y] = projectPoint(positions[town]),
        text = document.createElementNS(NS, "text");
      text.setAttribute("x", x);
      text.setAttribute("y", y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "district-label");
      text.textContent = town;
      layer.append(text);
      const option = document.createElement("option");
      option.value = town;
      option.textContent = town;
      $("town-filter").append(option);
    }
    if (
      location.hash.startsWith("#plan=") ||
      location.hash.startsWith("#v2=")
    ) {
      try {
        state = readShare(location.hash);
        mode = "edit";
        toast("已載入方案；舊版行政區方案會自動轉為逐里配置");
      } catch (e) {
        toast(e.message);
      }
    }
    render();
    searchVillages();
    await initElections();
  } catch (e) {
    $("map-hint").textContent = "圖資載入失敗，請重新整理";
    toast(e.message);
  }
}
function applyView() {
  const layer = $("map-layer");
  if (layer)
    layer.setAttribute(
      "transform",
      `translate(${380 * (1 - zoom) + panX},${355 * (1 - zoom) + panY}) scale(${zoom})`,
    );
}
function paint(id) {
  if (!units.has(id)) return;
  const target = erase ? 0 : selected;
  if (state.assignments[id] === target) return;
  if (!stroke.changed) {
    history.push(clone(state));
    if (history.length > 100) history.shift();
    future = [];
    stroke.changed = true;
  }
  state.assignments[id] = target;
  render();
}
function startStroke(e, id) {
  if (e.button !== 0) return;
  e.preventDefault();
  stroke = {
    pointer: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    pan: moveTool,
    changed: false,
  };
  $("map").setPointerCapture(e.pointerId);
  if (moveTool) return;
  selectElectionVillage(id);
  if (mode === "current") {
    activate(id);
    stroke = null;
  } else paint(id);
}
$("map").onpointerdown = (e) => {
  if (e.target === $("map") && e.button === 0) {
    stroke = { pointer: e.pointerId, x: e.clientX, y: e.clientY, pan: true };
    $("map").setPointerCapture(e.pointerId);
  }
};
$("map").onpointermove = (e) => {
  if (!stroke || stroke.pointer !== e.pointerId) return;
  if (stroke.pan) {
    const box = $("map").getBoundingClientRect(),
      factor = 760 / box.width;
    panX += (e.clientX - stroke.x) * factor;
    panY += (e.clientY - stroke.y) * factor;
    stroke.x = e.clientX;
    stroke.y = e.clientY;
    applyView();
  } else {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target?.dataset?.name) paint(target.dataset.name);
  }
};
$("map").onpointerup = $("map").onpointercancel = () => {
  stroke = null;
};
$("move-tool").onclick = () => {
  moveTool = !moveTool;
  $("move-tool").setAttribute("aria-pressed", moveTool);
  $("map").classList.toggle("moving", moveTool);
  render();
};
function focusVillage(id) {
  selectElectionVillage(id);
  const [x, y] = projectPoint(units.get(id).center);
  zoom = 6;
  panX = (380 - x) * zoom;
  panY = (355 - y) * zoom;
  applyView();
  $("hover-village").textContent = units.get(id).label;
  document
    .querySelectorAll("#map path[data-name]")
    .forEach((p) => p.classList.toggle("located", p.dataset.name === id));
}
function searchVillages() {
  const term = $("village-search").value.trim(),
    town = $("town-filter").value;
  const matches = unitIds.filter((id) => {
    const p = units.get(id);
    return (!town || p.town === town) && (!term || p.label.includes(term));
  });
  $("search-results").replaceChildren();
  $("search-count").textContent =
    `${matches.length} 里${matches.length > 20 ? "，顯示前 20 筆，請縮小搜尋範圍" : ""}`;
  for (const id of matches.slice(0, 20)) {
    const row = document.createElement("div");
    row.className = "search-row";
    const locate = document.createElement("button");
    locate.textContent = units.get(id).label;
    locate.onclick = () => focusVillage(id);
    row.append(locate);
    if (mode === "edit") {
      const add = document.createElement("button");
      add.textContent = erase ? "取消分配" : "加入";
      add.setAttribute(
        "aria-label",
        `${units.get(id).label}加入第 ${selected} 選區`,
      );
      add.onclick = () => activate(id);
      row.append(add);
    }
    $("search-results").append(row);
  }
  $("assign-town").disabled = mode !== "edit" || !town;
}
$("village-search").oninput = searchVillages;
$("town-filter").onchange = searchVillages;
$("assign-town").onclick = () => {
  const town = $("town-filter").value;
  if (!town || mode !== "edit") return;
  change(() => {
    for (const id of unitIds)
      if (units.get(id).town === town)
        state.assignments[id] = erase ? 0 : selected;
  });
  toast(`${town}已整批分配，可復原`);
};
$("current").onclick = () => setMode("current");
$("edit").onclick = () => setMode("edit");
$("erase").onclick = () => {
  erase = !erase;
  render();
};
$("plan-name").onchange = (e) => {
  const name = e.target.value.trim() || "我的台北選區方案";
  change(() => (state.name = name));
};
$("undo").onclick = () => {
  if (history.length) {
    future.push(clone(state));
    state = history.pop();
    selected = Math.min(selected, state.count);
    render();
  }
};
$("redo").onclick = () => {
  if (future.length) {
    history.push(clone(state));
    state = future.pop();
    selected = Math.min(selected, state.count);
    render();
  }
};
$("add").onclick = () =>
  change(() => {
    state.count++;
    selected = state.count;
    erase = false;
  });
$("remove").onclick = () =>
  change(() => {
    for (const n of unitIds)
      if (state.assignments[n] === state.count) state.assignments[n] = 0;
    state.count--;
    selected = Math.min(selected, state.count);
  });
$("reset").onclick = () => {
  if (confirm("要將目前草案重設為現行配置嗎？可使用復原回到原方案。"))
    change(() => {
      state.count = 6;
      state.assignments = { ...baseline };
      selected = 1;
      erase = false;
    });
};
$("save").onclick = () => {
  try {
    localStorage.setItem("taipei-plan-v2", JSON.stringify(state));
    $("save-status").textContent =
      "已儲存在此瀏覽器 · " + new Date().toLocaleTimeString("zh-TW");
    toast("方案已儲存至此瀏覽器");
  } catch {
    toast("瀏覽器無法儲存，請改用匯出 JSON。");
  }
};
$("load").onclick = () => {
  try {
    let raw =
      localStorage.getItem("taipei-plan-v2") ||
      localStorage.getItem("taipei-plan-v1");
    if (!raw) return toast("此瀏覽器還沒有已存方案");
    let s = validate(JSON.parse(raw));
    change(() => {
      state = s;
      selected = 1;
    });
    toast("已載入儲存的方案");
  } catch {
    toast("無法讀取儲存方案，請改用匯入 JSON。");
  }
};
function download(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").onclick = () =>
  download(
    JSON.stringify(state, null, 2),
    "application/json",
    "taipei-district-plan.json",
  );
$("import").onclick = () => $("file").click();
$("file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 100000) throw Error("檔案過大，請選擇本工具匯出的方案。");
    let s = validate(JSON.parse(await f.text()));
    if (API) {
      const response = await fetch(`${API}/plans/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!response.ok) throw Error("後端無法驗證方案，請檢查資料與服務狀態。");
      s = validate((await response.json()).plan);
    }
    change(() => {
      state = s;
      selected = 1;
    });
    toast("已匯入方案");
  } catch (err) {
    toast(err instanceof SyntaxError ? "無法解析 JSON 檔案" : err.message);
  } finally {
    e.target.value = "";
  }
};
$("share").onclick = async () => {
  const url = location.origin + location.pathname + shareHash(state);
  try {
    await navigator.clipboard.writeText(url);
    toast("已複製方案連結，可分享給其他人");
  } catch {
    showDialog(
      "分享方案",
      "<p>複製以下連結即可分享此刻的方案；後續修改不會改變已分享版本。</p>",
    );
    let input = document.createElement("textarea");
    input.value = url;
    input.style.cssText = "width:100%;height:120px";
    $("dialog-body").append(input);
    input.select();
  }
};
function mapZoom(v) {
  zoom = Math.max(1, Math.min(12, v));
  applyView();
}
$("zoom-in").onclick = () => mapZoom(zoom * 1.4);
$("zoom-out").onclick = () => mapZoom(zoom / 1.4);
$("fit").onclick = () => {
  zoom = 1;
  panX = panY = 0;
  applyView();
};
$("map").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    mapZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  },
  { passive: false },
);
function showDialog(title, html) {
  $("dialog-body").innerHTML = "<h2>" + title + "</h2>" + html;
  $("dialog").showModal();
}
$("close-dialog").onclick = () => $("dialog").close();
$("dialog").onclick = (e) => {
  if (e.target === $("dialog")) $("dialog").close();
};
$("about").onclick = () =>
  showDialog(
    "以里畫出你的台北",
    "<p>切換自行重劃，選取選區色塊，再點選或拖曳塗選各里。一筆拖曳算一次操作，可整筆復原。手機也可拖曳塗選。</p><p>使用「移動地圖」切換平移工具；＋／− 或滑鼠滾輪縮放。搜尋里名可定位，按搜尋結果的「加入」分配到目前選區；選擇行政區後可整區批次分配。</p><p>舊版行政區 JSON／本機存檔及分享連結會依各里所屬行政區轉為逐里方案。新版分享連結使用精簡格式；方案不會上傳儲存。</p><p>目前沒有里人口或席次試算。原住民身分選區另列，不參與地理重劃。</p>",
  );
$("sources").onclick = () =>
  showDialog(
    "圖資與選舉資料版本",
    '<p>圖資來源：臺北市政府民政局「臺北市里界圖」，456 里。下載資源更新日期 2026-09-21，頁面標示收錄期間迄日 2025-06-17；更新日期不等於每條邊界的生效日。</p><p>原始 SHP 為 EPSG:3826，轉為 WGS84，未簡化邊界。里代碼採原始 CPTVID；鄰接以原始圖形共邊超過 0.1 公尺判斷，僅點接觸不計。河川／橋梁交通可達性不在此幾何檢查內。</p><p><a href="https://data.taipei/dataset/detail?id=6b17b31d-4e16-495e-95b1-9fd1f47c80d8" target="_blank" rel="noreferrer">官方里界來源 ↗</a> · <a href="https://data.gov.tw/dataset/121163" target="_blank" rel="noreferrer">政府資料目錄與開放授權 ↗</a></p><p>另提供 2022 區域議員選舉的里與投開票所結果，來源為中選會開放資料；所號對應場所及地址依 2022-08-29 公告。詳見地圖下方開票結果面板的來源連結與口徑。</p><p>六個區域選區配置與應選席次仍採第 14 屆（2022–2026）基準，未代表 2026 年第 15 屆選務公告；第 7、8 選區為全市平地、山地原住民，各 1 席。</p><p>圖資依政府資料開放授權條款第 1 版使用，已轉換座標與附加鄰接資料。人口、每席代表人口與法規合規審查尚未接入。</p>',
  );

let electionData = null,
  electionVillage = null,
  electionStation = "";
const numberText = (value) => value.toLocaleString("zh-TW");
async function initElections() {
  try {
    const response = await fetch(
      API
        ? `${API}/elections/2022-taipei-council-regional`
        : "./elections/2022-council.json",
    );
    if (!response.ok) throw Error("選舉資料載入失敗");
    const data = await response.json();
    if (
      data.map_dataset_version !== geo.dataset_version ||
      Object.keys(data.villages).length !== 456 ||
      Object.keys(data.stations).length !== 1755 ||
      !unitIds.every((id) => data.villages[id])
    )
      throw Error("選舉資料與地圖版本不符");
    electionData = data;
    $("election-village").replaceChildren();
    for (const id of unitIds) {
      const v = data.villages[id],
        option = document.createElement("option");
      option.value = id;
      option.textContent = v.town + v.village;
      $("election-village").append(option);
    }
    $("election-village").disabled = false;
    $("election-station").disabled = false;
    selectElectionVillage(electionVillage || unitIds[0]);
  } catch (error) {
    $("election-status").textContent =
      error.message + "，請重新整理後再試；地圖仍可重劃。";
    $("election-download").disabled = true;
  }
}
function selectElectionVillage(id) {
  electionVillage = id;
  electionStation = "";
  if (!electionData || !electionData.villages[id]) return;
  $("election-village").value = id;
  $("view-election").textContent = `查看${units.get(id).label}的 2022 得票 ↓`;
  $("election-station").replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "全里合計";
  $("election-station").append(all);
  for (const sid of electionData.villages[id].station_ids) {
    const option = document.createElement("option");
    option.value = sid;
    option.textContent = `第 ${sid} 所 · ${electionData.stations[sid].location.name}`;
    $("election-station").append(option);
  }
  $("election-station").value = "";
  renderElection();
}
function electionRecord() {
  if (!electionData || !electionVillage) return null;
  return electionStation
    ? electionData.stations[electionStation]
    : electionData.villages[electionVillage];
}
function renderElection() {
  const record = electionRecord();
  if (!record) return;
  const village = electionData.villages[electionVillage],
    label = village.town + village.village;
  $("election-status").textContent =
    `投票日 2022-11-26 · 原第 ${record.district} 選區 · ${electionStation ? "投開票所明細" : `全里 ${village.station_ids.length} 所合計`}`;
  $("election-location").textContent = electionStation
    ? `${label} · 第 ${electionStation} 投開票所`
    : `${label} · 全里合計`;
  $("station-address").textContent = electionStation
    ? `${record.location.name}｜${record.location.town}${record.location.address}`
    : "選擇投開票所可查看場所、地址及該所得票。";
  $("station-coverage").textContent = electionStation
    ? `公告所轄里鄰別：${record.location.coverage}（公告第 ${record.location.source_page} 頁）`
    : "";
  $("election-stats").replaceChildren();
  for (const [title, value] of [
    ["有效票", numberText(record.valid)],
    ["無效票", numberText(record.invalid)],
    ["投票數", numberText(record.ballots)],
    ["選舉人數", numberText(record.eligible)],
    ["投票率", record.turnout === null ? "—" : record.turnout.toFixed(2) + "%"],
  ]) {
    const card = document.createElement("div"),
      heading = document.createElement("span"),
      amount = document.createElement("strong");
    heading.textContent = title;
    amount.textContent = value;
    card.append(heading, amount);
    $("election-stats").append(card);
  }
  $("election-caption").textContent =
    `${label}${electionStation ? `第 ${electionStation} 所` : "全里"}候選人得票（依得票數排序）`;
  $("election-rows").replaceChildren();
  const rows = electionData.candidates[String(record.district)]
    .map((candidate, index) => ({ ...candidate, votes: record.votes[index] }))
    .sort((a, b) => b.votes - a.votes || a.number - b.number);
  for (const candidate of rows) {
    const row = document.createElement("tr");
    for (const value of [
      candidate.number,
      candidate.name,
      candidate.party,
      numberText(candidate.votes),
      record.valid
        ? ((candidate.votes / record.valid) * 100).toFixed(2) + "%"
        : "—",
      candidate.elected ? "原選區當選" : "—",
    ]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    $("election-rows").append(row);
  }
}
$("election-village").onchange = (e) => {
  selectElectionVillage(e.target.value);
  focusVillage(e.target.value);
};
$("election-station").onchange = (e) => {
  electionStation = e.target.value;
  renderElection();
};
function findStation() {
  const value = $("station-number").value.trim();
  if (!electionData) return toast("選舉資料尚未載入");
  if (!/^[0-9]{1,4}$/.test(value))
    return toast("請輸入 1 至 1755 的投開票所編號");
  const id = value.padStart(4, "0"),
    station = electionData.stations[id];
  if (!station) return toast("找不到這個 2022 投開票所編號");
  focusVillage(station.village_id);
  electionStation = id;
  $("election-station").value = id;
  renderElection();
}
$("find-station").onclick = findStation;
$("station-number").onkeydown = (e) => {
  if (e.key === "Enter") findStation();
};
$("election-download").onclick = () => {
  const record = electionRecord();
  if (!record) return toast("選舉資料尚未載入");
  const village = electionData.villages[electionVillage],
    headers = [
      "選舉",
      "行政區",
      "里",
      "投開票所",
      "號次",
      "候選人",
      "政黨",
      "得票數",
      "得票率",
      "原選區當選",
    ];
  const rows = electionData.candidates[String(record.district)].map((c, i) => [
    electionData.title,
    village.town,
    village.village,
    electionStation || "全里合計",
    c.number,
    c.name,
    c.party,
    record.votes[i],
    record.valid ? ((record.votes[i] / record.valid) * 100).toFixed(2) : "",
    c.elected ? "是" : "否",
  ]);
  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((value) => '"' + String(value).replaceAll('"', '""') + '"')
        .join(","),
    )
    .join("\r\n");
  download(
    "\uFEFF" + csv,
    "text/csv;charset=utf-8",
    `2022-council-${electionStation || electionVillage}.csv`,
  );
};
init();
