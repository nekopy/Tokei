const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");
const { pathToFileURL } = require("url");

let uiServer = null;
let uiUrl = null;

const tokeiUserRoot =
  (process.env.TOKEI_USER_ROOT && String(process.env.TOKEI_USER_ROOT).trim()) ||
  path.join(app.getPath("appData"), "Tokei");

process.env.TOKEI_USER_ROOT = tokeiUserRoot;
const devAppRoot = path.resolve(__dirname, "..");
process.env.TOKEI_APP_ROOT = process.env.TOKEI_APP_ROOT || (app.isPackaged ? app.getAppPath() : devAppRoot);

try {
  const cacheDir = path.join(process.env.TOKEI_APP_ROOT, "puppeteer-cache");
  if (!process.env.PUPPETEER_CACHE_DIR && fs.existsSync(cacheDir)) process.env.PUPPETEER_CACHE_DIR = cacheDir;
} catch {
  // ignore
}

try {
  app.setPath("userData", path.join(tokeiUserRoot, "electron-ui"));
} catch {
  // ignore
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    backgroundColor: "#0b0f14",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.removeMenu();
  win.loadURL(uiUrl);
}

async function start() {
  const uiModulePath = path.join(__dirname, "..", "ui", "tokei_ui.mjs");
  const mod = await import(pathToFileURL(uiModulePath).href);
  const started = await mod.startTokeiUiServer({ open: false });
  uiServer = started.server;
  uiUrl = started.url;
  // eslint-disable-next-line no-console
  console.log(`Tokei Desktop UI at ${uiUrl}`);

  await app.whenReady();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try {
    if (uiServer) uiServer.close();
  } catch {
    // ignore
  }
});

start().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e && e.stack ? e.stack : String(e));
  app.exit(1);
});
