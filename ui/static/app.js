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

let activeRuleRow = null;
let discoveredAnki = null;

function selectTab(name) {
  for (const t of ["setup", "run", "logs"]) {
    $(`tab-${t}`).classList.toggle("active", t === name);
    $(`panel-${t}`).classList.toggle("active", t === name);
  }
}

async function copyText(text) {
  const value = String(text ?? "");
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
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

  tr.addEventListener("click", (e) => {
    if (e.target && e.target.closest && e.target.closest("button.remove")) return;
    setActiveRuleRow(tr);
  });

  return tr;
}

function setActiveRuleRow(tr) {
  activeRuleRow = tr;
  for (const row of $("rules-body").querySelectorAll("tr")) row.classList.toggle("active-row", row === tr);
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
  const first = body.querySelector("tr");
  if (first) setActiveRuleRow(first);
}

function setVisible(el, visible) {
  el.hidden = !visible;
}

function toggleVisible(el) {
  el.hidden = !el.hidden;
}

function normalizeList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return [];
}

function makeChip(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function parseCommaList(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function setCommaListInput(input, values) {
  const unique = [];
  const seen = new Set();
  for (const v of values) {
    const k = v.trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(k);
  }
  input.value = unique.join(", ");
}

function ensureActiveRow() {
  if (activeRuleRow && activeRuleRow.isConnected) return activeRuleRow;
  const first = $("rules-body").querySelector("tr");
  if (first) setActiveRuleRow(first);
  return activeRuleRow;
}

function renderDiscoveredAnki(payload) {
  discoveredAnki = payload && payload.ok ? payload : null;
  const box = $("anki-discovered");
  if (!discoveredAnki) {
    box.hidden = true;
    $("anki-decks").innerHTML = "";
    $("anki-notetypes").innerHTML = "";
    $("anki-fields").innerHTML = "";
    return;
  }

  const decks = normalizeList(discoveredAnki.decks).map((d) => String(d?.name || "")).filter(Boolean);
  const noteTypes = normalizeList(discoveredAnki.note_types).map((nt) => String(nt?.name || "")).filter(Boolean);
  const fields = [];
  for (const nt of normalizeList(discoveredAnki.note_types)) {
    for (const f of normalizeList(nt?.fields)) fields.push(String(f || ""));
  }
  const uniqueFields = [...new Set(fields.map((x) => x.trim()).filter(Boolean).map((x) => x))].sort((a, b) => a.localeCompare(b));

  $("anki-decks").innerHTML = "";
  $("anki-notetypes").innerHTML = "";
  $("anki-fields").innerHTML = "";

  for (const d of decks) {
    $("anki-decks").appendChild(
      makeChip(d, async (e) => {
        if (e.shiftKey) {
          const ok = await copyText(d);
          setStatus($("anki-status"), ok ? `Copied deck: ${d}` : "Copy failed.", ok ? "good" : "bad");
          return;
        }
        const row = ensureActiveRow();
        if (!row) return;
        const input = row.querySelector(".decks");
        const curr = parseCommaList(input.value);
        curr.push(d);
        setCommaListInput(input, curr);
        setStatus($("anki-status"), `Added deck to rule: ${d}`, "good");
      })
    );
  }

  for (const nt of noteTypes) {
    $("anki-notetypes").appendChild(
      makeChip(nt, async (e) => {
        if (e.shiftKey) {
          const ok = await copyText(nt);
          setStatus($("anki-status"), ok ? `Copied note type: ${nt}` : "Copy failed.", ok ? "good" : "bad");
          return;
        }
        const row = ensureActiveRow();
        if (!row) return;
        const input = row.querySelector(".notetypes");
        const curr = parseCommaList(input.value);
        curr.push(nt);
        setCommaListInput(input, curr);
        setStatus($("anki-status"), `Added note type to rule: ${nt}`, "good");
      })
    );
  }

  for (const f of uniqueFields) {
    $("anki-fields").appendChild(
      makeChip(f, async (e) => {
        if (e.shiftKey) {
          const ok = await copyText(f);
          setStatus($("anki-status"), ok ? `Copied field: ${f}` : "Copy failed.", ok ? "good" : "bad");
          return;
        }
        const row = ensureActiveRow();
        if (!row) return;
        row.querySelector(".field").value = f;
        setStatus($("anki-status"), `Set target field: ${f}`, "good");
      })
    );
  }

  box.hidden = false;
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

function toggleTogglReveal() {
  const input = $("toggl-token");
  const btn = $("toggl-reveal");
  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  btn.textContent = reveal ? "Hide" : "Show";
}

function discardConfigChanges() {
  const ok = confirm("Discard unsaved changes and reload config.json from disk?");
  if (!ok) return;
  setStatus($("config-status"), "Reloading...", null);
  loadConfig()
    .then((cfg) => {
      if (cfg) currentConfig = cfg;
      setStatus($("config-status"), "Reloaded.", "good");
    })
    .catch((e) => setStatus($("config-status"), String(e?.message || e), "bad"));
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
  setVisible($("anki-advanced"), false);
  populateRulesTable(Array.isArray(snap.rules) ? snap.rules : []);
  renderDiscoveredAnki(null);
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
    const ok = r.payload?.ok === true;
    if (!ok) {
      setStatus($("anki-status"), r.payload?.error || "Discover failed.", "bad");
      renderDiscoveredAnki(null);
      return;
    }
    const nDecks = r.payload?.decks?.length ?? 0;
    const nNts = r.payload?.note_types?.length ?? 0;
    setStatus($("anki-status"), `OK (${nDecks} decks, ${nNts} note types). Click a rule row then click items to add.`, "good");
    renderDiscoveredAnki(r.payload);
  } else {
    setStatus($("anki-status"), r.stderr || "Discover failed.", "bad");
    renderDiscoveredAnki(null);
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
    return setStatus($("gsm-status"), "Copied plugins.py shim to clipboard.", "good");
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
      return setStatus($("gsm-status"), "Copied plugins.py shim to clipboard.", "good");
    } catch (e) {
      return setStatus($("gsm-status"), String(e?.message || e || "Copy failed."), "bad");
    }
  }
}

async function gsmCopyHelper() {
  setStatus($("gsm-status"), "Loading helper...", null);
  const r = await api("GET", "/api/gsm/plugin-snippet");
  if (!r.ok) return setStatus($("gsm-status"), r.error || "Could not load helper.", "bad");
  const snippet = r.helper_snippet || "";
  if (!snippet) return setStatus($("gsm-status"), "Helper snippet missing.", "bad");

  try {
    await navigator.clipboard.writeText(snippet);
    return setStatus($("gsm-status"), "Copied tokei_live_sync.py to clipboard (create this file in your GSM folder).", "good");
  } catch {
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
      return setStatus($("gsm-status"), "Copied tokei_live_sync.py to clipboard (create this file in your GSM folder).", "good");
    } catch (e) {
      return setStatus($("gsm-status"), String(e?.message || e || "Copy failed."), "bad");
    }
  }
}

async function gsmInstallHelper() {
  setStatus($("gsm-status"), "Installing tokei_live_sync.py...", null);
  const r = await api("POST", "/api/gsm/install-helper", {});
  if (!r.ok) return setStatus($("gsm-status"), r.error || "Install failed.", "bad");
  if (r.changed) {
    const msg = r.backupPath ? `Installed. Backup: ${r.backupPath}` : "Installed.";
    return setStatus($("gsm-status"), msg, "good");
  }
  return setStatus($("gsm-status"), "Already installed (no changes).", "good");
}

async function gsmRefreshStatus() {
  const r = await api("GET", "/api/gsm/status");
  if (!r.ok) {
    $("gsm-status-detail").textContent = "";
    return;
  }

  const parts = [];
  parts.push(`Helper: ${r.helperExists ? "installed" : "missing"}`);
  parts.push(`plugins.py: ${r.pluginExists ? (r.shimPresent ? "shim ok" : "needs shim") : "missing"}`);
  parts.push(`gsm_live.sqlite: ${r.dbExists ? `found (${r.dbMtime || "mtime unknown"})` : "missing"}`);
  $("gsm-status-detail").textContent = parts.join(" • ");
}

async function gsmInstall() {
  setStatus($("gsm-status"), "Installing...", null);
  const r = await api("POST", "/api/gsm/install-helper", {});
  if (!r.ok) {
    setStatus($("gsm-status"), r.error || "Install failed.", "bad");
    await gsmRefreshStatus();
    return;
  }
  const msg = r.changed ? "Installed tokei_live_sync.py. Next: add the plugins.py shim (Advanced)." : "Already installed.";
  setStatus($("gsm-status"), msg, "good");
  await gsmRefreshStatus();
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

async function gsmOpenHelper() {
  setStatus($("gsm-status"), "Opening tokei_live_sync.py...", null);
  const r = await api("POST", "/api/gsm/open-helper-file", {});
  if (!r.ok) return setStatus($("gsm-status"), r.error || "Failed.", "bad");
  const msg = r.exists ? `Opened: ${r.helperFile}` : `Opened (missing): ${r.helperFile}`;
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

  $("toggl-reveal").addEventListener("click", toggleTogglReveal);
  $("toggl-save").addEventListener("click", saveToken);
  $("anki-discover").addEventListener("click", ankiDiscover);
  $("anki-test-export").addEventListener("click", ankiTestExport);
  $("anki-advanced-toggle").addEventListener("click", () => toggleVisible($("anki-advanced")));
  $("anki-advanced-close").addEventListener("click", () => setVisible($("anki-advanced"), false));
  $("anki-discovered-close").addEventListener("click", () => setVisible($("anki-discovered"), false));
  $("puppeteer-test").addEventListener("click", puppeteerTest);
  $("python-test").addEventListener("click", pythonTest);
  $("gsm-install").addEventListener("click", gsmInstall);
  $("gsm-open-folder").addEventListener("click", gsmOpenFolder);
  $("gsm-copy").addEventListener("click", gsmCopySnippet);
  $("gsm-copy-helper").addEventListener("click", gsmCopyHelper);
  $("gsm-open-plugin").addEventListener("click", gsmOpenPlugin);
  $("gsm-open-helper").addEventListener("click", gsmOpenHelper);
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

  $("config-discard").addEventListener("click", discardConfigChanges);

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
  await gsmRefreshStatus();
  await refreshLatestStats();
  await refreshLogs();
}

init();
