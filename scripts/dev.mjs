import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const backendEnvPath = path.join(rootDir, "Backend", ".env");

function readEnvValue(content, key) {
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim() : "";
}

if (!existsSync(backendEnvPath)) {
  console.error("[Schichtplaner] Datenbank ist noch nicht eingerichtet. Bitte zuerst `npm run setup` ausfuehren.");
  process.exit(1);
}

const backendEnv = readFileSync(backendEnvPath, "utf8");
const applicationKey = readEnvValue(backendEnv, "SHIFTPLANNER_API_KEY");
if (
  readEnvValue(backendEnv, "DB_NAME") !== "shiftplanner" ||
  readEnvValue(backendEnv, "DB_USER") !== "shiftplanner_app" ||
  !applicationKey
) {
  console.error("[Schichtplaner] Der Datenbankzugang ist noch nicht unabhaengig. Bitte zuerst `npm run setup` ausfuehren.");
  process.exit(1);
}

const services = [
  {
    name: "Backend",
    directory: path.join(rootDir, "Backend"),
    env: {
      APP_MODE: "shiftplanner",
      NODE_ENV: "development",
      PORT: "5055",
      DB_NAME: "shiftplanner",
      DB_USER: "shiftplanner_app",
      SHIFTPLANNER_API_KEY: applicationKey,
    },
  },
  {
    name: "Frontend",
    directory: path.join(rootDir, "Frontend"),
    devArgs: ["run", "dev", "--", "--host", "127.0.0.1"],
    env: {
      VITE_APP_MODE: "shiftplanner",
      BACKEND_URL: "http://127.0.0.1:5055",
      SHIFTPLANNER_API_KEY: applicationKey,
    },
  },
];

function runNpm(args, options) {
  return spawn(npmCommand, args, {
    cwd: options.directory,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32",
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function installMissingDependencies(service) {
  if (existsSync(path.join(service.directory, "node_modules"))) {
    return;
  }

  console.log(`[Schichtplaner] Installiere Pakete fuer ${service.name} ...`);
  const exitCode = await waitForExit(runNpm(["install"], service));
  if (exitCode !== 0) {
    throw new Error(`Paketinstallation fuer ${service.name} fehlgeschlagen.`);
  }
}

for (const service of services) {
  await installMissingDependencies(service);
}

console.log("[Schichtplaner] Starte Backend auf Port 5055 und Frontend auf Port 5173 ...");
const children = services.map((service) =>
  runNpm(service.devArgs ?? ["run", "dev"], service),
);
let stopping = false;

function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.once("SIGINT", stopAll);
process.once("SIGTERM", stopAll);

const exits = children.map((child, index) =>
  waitForExit(child).then((code) => ({ code, name: services[index].name })),
);
const firstExit = await Promise.race(exits);
stopAll();

if (firstExit.code !== 0) {
  console.error(`[Schichtplaner] ${firstExit.name} wurde mit Fehlercode ${firstExit.code} beendet.`);
  process.exitCode = firstExit.code;
}
