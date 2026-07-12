import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "pyodide");
const destination = join(root, "dist", "client", "pyodide");
const runtimeFiles = [
  "pyodide.js",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip",
];

await mkdir(destination, { recursive: true });
await Promise.all(runtimeFiles.map((file) => copyFile(join(source, file), join(destination, file))));

const workerPath = join(root, "dist", "client", "python-worker.js");
const webRuntimeBlock = `const IS_NATIVE_APP = self.location.protocol === "capacitor:";
const PYODIDE_INDEX_URL = IS_NATIVE_APP
  ? new URL("./pyodide/", self.location.href).href
  : \`https://cdn.jsdelivr.net/pyodide/v\${PYODIDE_VERSION}/full/\`;`;
const nativeRuntimeBlock = `const IS_NATIVE_APP = true;
const PYODIDE_INDEX_URL = new URL("./pyodide/", self.location.href).href;`;
const workerSource = await readFile(workerPath, "utf8");
if (!workerSource.includes(webRuntimeBlock)) {
  throw new Error("Could not lock the Python worker to the app-bundled runtime.");
}
await writeFile(workerPath, workerSource.replace(webRuntimeBlock, nativeRuntimeBlock));

const pyodideLoaderPath = join(destination, "pyodide.js");
const pyodideLoader = await readFile(pyodideLoaderPath, "utf8");
await writeFile(
  pyodideLoaderPath,
  pyodideLoader.replace("https://cdn.jsdelivr.net/pyodide/v${L}/full/", "./"),
);

await Promise.all(
  ["sw.js", "manifest.webmanifest", "_headers", "og.png"].map((file) =>
    rm(join(root, "dist", "client", file), { force: true }),
  ),
);

console.log(`Bundled the offline Python runtime in ${destination}`);
