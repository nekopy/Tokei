import { spawn } from "child_process";
import path from "path";
import electronPath from "electron";

const appEntry = path.join("electron", "main.cjs");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [appEntry], { stdio: "inherit", env, windowsHide: false });
child.on("close", (code) => process.exit(typeof code === "number" ? code : 1));

