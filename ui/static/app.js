const $ = (id) => document.getElementById(id);

async function api(method, url, body) {
  const resp = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid_json_response", raw: text };
  }
}

function setStatus(el, msg, kind) {
  el.textContent = msg || "";
  el.classList.remove("good", "bad");
  if (kind) el.classList.add(kind);
}

function selectTab(name) {
  for (const t of ["setup", "run", "logs"]) {
    $(`tab-${t}`).classList.toggle("active", t === name);
    $(`panel-${t}`).classList.toggle("active", t === name);
  }
}

function ruleRow(rule, onRemove) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="input rid" placeholder="rule_id" /></td>
    <td><input class="input decks" placeholder="Deck::Subdeck, Deck2::Subdeck" /></td>
    <td><input class="input field" placeholder="Field name (e.g. Expression)" /></td>
    <td><input class="input notetypes" placeholder="(optional) Note type A, Note type B" /></td>
    <td><label class="check"><input class="subdecks" type="checkbox" /> include</label></td>
    <td><input class="input mature" placeholder="21" /></td>
    <td><button class="btn remove">Remove</button></td>
  `;
  tr.querySelector(".rid").value = rule?.rule_id || "default";
  tr.querySelector(".decks").value = (rule?.deck_paths || []).join(", ");
  tr.querySelector(".field").value = rule?.target_field || "";
  tr.querySelector(".notetypes").value = (rule?.note_types || []).join(", ");
  tr.querySelector(".subdecks").checked = rule?.include_subdecks !== false;
  tr.querySelector(".mature").value = String(rule?.mature_interval_days ?? 21);
  tr.querySelector(".remove").addEventListener("click", () => onRemove(tr));
  return tr;
}

function readRulesFromTable() {
  const rules = [];
  for (const tr of $("rules-body").querySelectorAll("tr")) {
    const rid = tr.querySelector(".rid").value.trim() || "default";
    const deckPaths = tr
      .querySelector(".decks")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const targetField = tr.querySelector(".field").value.trim();
    const noteTypes = tr
      .querySelector(".notetypes")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const includeSubdecks = tr.querySelector(".subdecks").checked;
    const mature = Number(tr.querySelector(".mature").value || "21");
    if (!deckPaths.length || !targetField) continue;
    rules.push({
      rule_id: rid,
      deck_paths: deckPaths,
      include_subdecks: includeSubdecks,
      note_types: noteTypes,
      target_field: targetField,
      mature_interval_days: Number.isFinite(mature) ? Math.max(1, Math.trunc(mature)) : 21,
    });
  }
  return rules;
}

function populateRulesTable(rules) {
  const body = $("rules-body");
  body.innerHTML = "";
  const onRemove = (tr) => tr.remove();
  const list = Array.isArray(rules) && rules.length ? rules : [{ rule_id: "default", deck_paths: [], include_subdecks: true, note_types: [], target_field: "", mature_interval_days: 21 }];
  for (const r of list) body.appendChild(ruleRow(r, onRemove));
}

async function loadEnv() {
  const env = await api("GET", "/api/env");
  if (!env.ok) return;
  $("env-appRoot").textContent = env.appRoot;
  $("env-userRoot").textContent = env.userRoot;
  $("env-platform").textContent = env.platform;
  $("env-node").textContent = env.node;
}

async function loadToken() {
  const r = await api("GET", "/api/toggl-token");
  if (!r.ok) return;
  $("toggl-token").value = r.token || "";
}

async function saveToken() {
  setStatus($("toggl-status"), "Saving...", null);
  const token = $("toggl-token").value;
  const r = await api("POST", "/api/toggl-token", { token });
  if (r.ok) setStatus($("toggl-status"), "Saved.", "good");
  else setStatus($("toggl-status"), r.error || "Failed.", "bad");
}

async function loadConfig() {
  const r = await api("GET", "/api/config");
  if (!r.ok) {
    setStatus($("config-status"), r.error || "Failed to load config.", "bad");
    return null;
  }
  const cfg = r.config || {};
  const snap = cfg.anki_snapshot && typeof cfg.anki_snapshot === "object" ? cfg.anki_snapshot : {};
  $("anki-enabled").checked = snap.enabled === true;
  $("anki-output-dir").value = typeof snap.output_dir === "string" ? snap.output_dir : "hashi_exports";
  populateRulesTable(Array.isArray(snap.rules) ? snap.rules : []);
  return cfg;
}

async function saveConfig(currentCfg) {
  const cfg = currentCfg && typeof currentCfg === "object" ? currentCfg : {};
  cfg.anki_snapshot = cfg.anki_snapshot && typeof cfg.anki_snapshot === "object" ? cfg.anki_snapshot : {};
  cfg.anki_snapshot.enabled = $("anki-enabled").checked;
  const od = $("anki-output-dir").value.trim();
  cfg.anki_snapshot.output_dir = od || "hashi_exports";
  cfg.anki_snapshot.rules = readRulesFromTable();

  setStatus($("config-status"), "Saving...", null);
  const r = await api("POST", "/api/config", cfg);
  if (r.ok) setStatus($("config-status"), "Saved config.json.", "good");
  else setStatus($("config-status"), r.error || "Failed.", "bad");
}

async function ankiDiscover() {
  setStatus($("anki-status"), "Discovering...", null);
  const r = await api("POST", "/api/anki/discover", {});
  if (r.ok) {
    const nDecks = r.payload?.decks?.length ?? 0;
    setStatus($("anki-status"), `OK (${nDecks} decks discovered).`, "good");
  } else {
    setStatus($("anki-status"), r.stderr || "Discover failed.", "bad");
  }
}

async function ankiTestExport() {
  setStatus($("anki-status"), "Exporting...", null);
  const r = await api("POST", "/api/anki/test-export", {});
  if (r.ok) {
    const msg = `Export OK. exported_at=${r.exported_at || "?"}`;
    setStatus($("anki-status"), msg, "good");
  } else {
    setStatus($("anki-status"), r.stderr || "Export failed.", "bad");
  }
}

async function puppeteerTest() {
  setStatus($("puppeteer-status"), "Running...", null);
  const r = await api("POST", "/api/puppeteer/test", {});
  if (r.ok) {
    setStatus($("puppeteer-status"), `OK: ${r.pngPath}`, "good");
  } else {
    setStatus($("puppeteer-status"), r.error || "Failed.", "bad");
  }
}

async function pythonTest() {
  setStatus($("python-status"), "Checking...", null);
  const r = await api("POST", "/api/python/check", {});
  if (r.ok) setStatus($("python-status"), r.version || "OK", "good");
  else setStatus($("python-status"), r.version || "Python not found.", "bad");
}

async function gsmCopySnippet() {
  setStatus($("gsm-status"), "Loading snippet...", null);
  const r = await api("GET", "/api/gsm/plugin-snippet");
  if (!r.ok) return setStatus($("gsm-status"), r.error || "Could not load snippet.", "bad");
  const snippet = r.snippet || "";

  try {
    await navigator.clipboard.writeText(snippet);
    return setStatus($("gsm-status"), "Copied plugin snippet to clipboard.", "good");
  } catch {
    // Fallback: textarea copy.
    try {
      const ta = document.createElement("textarea");
      ta.value = snippet;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return setStatus($("gsm-status"), "Copied plugin snippet to clipboard.", "good");
    } catch (e) {
      return setStatus($("gsm-status"), String(e?.message || e || "Copy failed."), "bad");
    }
  }
}

async function gsmOpenFolder() {
  setStatus($("gsm-status"), "Opening folder...", null);
  const r = await api("POST", "/api/gsm/open-folder", {});
  if (r.ok) setStatus($("gsm-status"), `Opened: ${r.folder}`, "good");
  else setStatus($("gsm-status"), r.error || "Failed.", "bad");
}

async function gsmOpenPlugin() {
  setStatus($("gsm-status"), "Opening plugins.py...", null);
  const r = await api("POST", "/api/gsm/open-plugin-file", {});
  if (!r.ok) return setStatus($("gsm-status"), r.error || "Failed.", "bad");
  const msg = r.exists ? `Opened: ${r.pluginFile}` : `Opened (missing): ${r.pluginFile}`;
  setStatus($("gsm-status"), msg, r.exists ? "good" : "bad");
}

async function refreshLogs() {
  const r = await api("GET", "/api/runtime-log?lines=600");
  if (r.ok) $("runtime-log").textContent = (r.lines || []).join("\n");
}

async function refreshLatestStats() {
  const r = await api("GET", "/api/latest-stats");
  if (r.ok && r.stats) $("latest-stats").textContent = JSON.stringify(r.stats, null, 2);
  else $("latest-stats").textContent = "";
}

async function runNow() {
  setStatus($("run-status"), "Running...", null);
  $("run-output").textContent = "";
  const mode = $("run-mode").value;
  const r = await api("POST", "/api/run", { mode });
  if (r.ok) {
    setStatus($("run-status"), `OK (Anki exported_at=${r.anki_exported_at || "?"})`, "good");
  } else {
    setStatus($("run-status"), r.stderr || `Failed (code ${r.code})`, "bad");
  }
  $("run-output").textContent = [r.stdout, r.stderr].filter(Boolean).join("\n\n");
  await refreshLatestStats();
  await refreshLogs();
}

async function openTarget(target) {
  await api("POST", "/api/open", { target });
}

let currentConfig = null;

function wireUi() {
  $("tab-setup").addEventListener("click", () => selectTab("setup"));
  $("tab-run").addEventListener("click", () => selectTab("run"));
  $("tab-logs").addEventListener("click", () => selectTab("logs"));

  $("toggl-save").addEventListener("click", saveToken);
  $("anki-discover").addEventListener("click", ankiDiscover);
  $("anki-test-export").addEventListener("click", ankiTestExport);
  $("puppeteer-test").addEventListener("click", puppeteerTest);
  $("python-test").addEventListener("click", pythonTest);
  $("gsm-copy").addEventListener("click", gsmCopySnippet);
  $("gsm-open-folder").addEventListener("click", gsmOpenFolder);
  $("gsm-open-plugin").addEventListener("click", gsmOpenPlugin);
  $("logs-refresh").addEventListener("click", refreshLogs);
  $("run-now").addEventListener("click", runNow);

  $("rule-add").addEventListener("click", () => {
    $("rules-body").appendChild(
      ruleRow({ rule_id: `rule_${$("rules-body").children.length + 1}`, deck_paths: [], include_subdecks: true, note_types: [], target_field: "", mature_interval_days: 21 }, (tr) => tr.remove())
    );
  });

  $("config-save").addEventListener("click", async () => {
    await saveConfig(currentConfig);
    currentConfig = (await loadConfig()) || currentConfig;
  });

  $("open-output").addEventListener("click", async () => {
    await api("POST", "/api/open-output", {});
  });

  $("open-html").addEventListener("click", async () => {
    await api("POST", "/api/open-latest-html", {});
  });
}

async function init() {
  wireUi();
  await loadEnv();
  await loadToken();
  currentConfig = await loadConfig();
  await refreshLatestStats();
  await refreshLogs();
}

init();
