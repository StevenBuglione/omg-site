import { readFile } from "node:fs/promises";

const registry = "https://cdn.jsdelivr.net/gh/StevenBuglione/omg-data-registry@main/sources.json";
const response = await fetch(registry);
if (!response.ok) throw new Error(`registry smoke failed: HTTP ${response.status}`);
const data = await response.json();
if (data.routeMode !== "query") throw new Error("registry routeMode must be query");
if (!data.sources.some(source => source.type === "book-series")) throw new Error("registry must expose book-series sources");
const runtime = await readFile("src/main.tsx", "utf8");
const styles = await readFile("src/styles.css", "utf8");
if (!runtime.includes("cytoscape")) throw new Error("graph must use Cytoscape");
if (!runtime.includes("readerManifestUrl")) throw new Error("reader must load reader manifests");
if (!runtime.includes("/read/:seriesId/:bookId/:chapterId")) throw new Error("reader route is missing");
if (!runtime.includes("GraphStudio")) throw new Error("graph studio component is missing");
if (!runtime.includes("LegacyWikiPage")) throw new Error("legacy wiki compatibility route is missing");
if (!styles.includes(".reader-shell")) throw new Error("reader layout styles are missing");
if (!styles.includes(".graph-canvas")) throw new Error("graph canvas styles are missing");
console.log("omg-site smoke ok");
