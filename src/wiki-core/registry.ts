import type {
  BookGraph,
  BookLatest,
  LoadedBookGraph,
  LoadedWikiPage,
  ManifestPage,
  RegistrySource,
  SourceLatest,
  WikiManifest,
  WikiRegistry,
} from "./types";
import { normalizeCitationMarkdown } from "./citations";

export const registryUrl = "https://cdn.jsdelivr.net/gh/StevenBuglione/omg-data-registry@main/sources.json";

const jsonCache = new Map<string, unknown>();
const textCache = new Map<string, string>();

async function loadJson<T>(url: string): Promise<T> {
  if (jsonCache.has(url)) return jsonCache.get(url) as T;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  const data = (await response.json()) as T;
  jsonCache.set(url, data);
  return data;
}

async function loadText(url: string): Promise<string> {
  if (textCache.has(url)) return textCache.get(url) as string;
  const response = await fetch(url, { headers: { Accept: "text/markdown,text/plain,*/*" } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  const data = await response.text();
  textCache.set(url, data);
  return data;
}

function rawGitHubUrl(url: string): string | undefined {
  const match = url.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return undefined;
  const [, owner, repo, ref, filePath] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;
}

export async function loadRegistry(): Promise<WikiRegistry> {
  const registry = await loadJson<WikiRegistry>(registryUrl);
  if (registry.routeMode !== "query") throw new Error("Registry routeMode must be query");
  return registry;
}

export async function loadLatest(source: RegistrySource): Promise<SourceLatest> {
  const latest = await loadJson<SourceLatest>(source.latestUrl);
  const rawUrl = rawGitHubUrl(source.latestUrl);
  if (!rawUrl) return latest;
  try {
    const rawLatest = await loadJson<SourceLatest>(rawUrl);
    return rawLatest.sourceCommit !== latest.sourceCommit ? rawLatest : latest;
  } catch {
    return latest;
  }
}

export async function loadManifest(latest: SourceLatest): Promise<WikiManifest> {
  return await loadJson<WikiManifest>(latest.manifestUrl);
}

export function makeWikiUrl(page: Pick<ManifestPage, "sourceId" | "slug">, anchor?: string): string {
  const params = new URLSearchParams({ s: page.sourceId, p: page.slug });
  const basePath =
    typeof window !== "undefined" && window.location.pathname.startsWith("/omg-site/")
      ? "/omg-site"
      : typeof window !== "undefined" && window.location.pathname.startsWith("/wiki-site/")
        ? "/wiki-site"
        : "";
  return `${basePath}/wiki/?${params.toString()}${anchor ? `#${anchor}` : ""}`;
}

export function makeGraphUrl(sourceId?: string): string {
  const params = sourceId ? `?s=${encodeURIComponent(sourceId)}` : "";
  const basePath = typeof window !== "undefined" && window.location.pathname.startsWith("/omg-site/") ? "/omg-site" : "";
  return `${basePath}/graph/${params}`;
}

export function resolveAssetUrl(latest: SourceLatest, currentFile: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return target;
  const base = currentFile.split("/").slice(0, -1).join("/");
  const normalized = new URL(target, `https://local.invalid/${base ? `${base}/` : ""}`).pathname.replace(/^\//, "");
  return `${latest.assetsBaseUrl}${normalized.replace(/^assets\//, "")}`;
}

export function resolveLinkUrl(manifest: WikiManifest, sourceId: string, currentFile: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return target;
  const [pathPart, hash] = target.split("#");
  if (!pathPart.endsWith(".md")) return target;
  const base = currentFile.split("/").slice(0, -1).join("/");
  const normalized = new URL(pathPart, `https://local.invalid/${base ? `${base}/` : ""}`).pathname
    .replace(/^\//, "")
    .replace(/\.md$/, "");
  const page = manifest.pages.find(item => item.slug === normalized);
  return page ? makeWikiUrl({ sourceId, slug: page.slug }, hash) : target;
}

export async function loadWikiPage(sourceId: string, slug: string): Promise<LoadedWikiPage> {
  const registry = await loadRegistry();
  const source = registry.sources.find(item => item.enabled && (item.type ?? "wiki") === "wiki" && item.id === sourceId);
  if (!source) throw new Error(`Unknown wiki source: ${sourceId}`);
  const latest = await loadLatest(source);
  const manifest = await loadManifest(latest);
  const page = manifest.pages.find(item => item.slug === slug);
  if (!page) throw new Error(`Unknown wiki page: ${sourceId}/${slug}`);
  const markdown = normalizeCitationMarkdown(await loadText(`${latest.contentBaseUrl}${page.file}`));
  return { source, latest, manifest, page, markdown };
}

export async function loadAllManifests(): Promise<Array<{ source: RegistrySource; latest: SourceLatest; manifest: WikiManifest }>> {
  const registry = await loadRegistry();
  const enabled = registry.sources.filter(source => source.enabled && (source.type ?? "wiki") === "wiki").sort((a, b) => a.order - b.order);
  return await Promise.all(
    enabled.map(async source => {
      const latest = await loadLatest(source);
      const manifest = await loadManifest(latest);
      return { source, latest, manifest };
    }),
  );
}

export async function loadBookGraphs(): Promise<LoadedBookGraph[]> {
  const registry = await loadRegistry();
  const enabled = registry.sources
    .filter(source => source.enabled && source.type === "book-series")
    .sort((a, b) => a.order - b.order);
  return await Promise.all(
    enabled.map(async source => {
      const latest = await loadJson<BookLatest>(source.latestUrl);
      const graph = await loadJson<BookGraph>(latest.graphUrl);
      return { source, latest, graph };
    }),
  );
}
