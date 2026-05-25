import {
  loadAllManifests,
  loadRegistry,
  loadWikiPage,
  makeWikiUrl,
  registryUrl,
} from "./registry";
import type { LoadedWikiPage, ManifestPage, RegistrySource, SourceLatest, WikiManifest } from "./types";

export interface WikiToolResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface WikiPageForAgent {
  pageId: string;
  sourceId: string;
  slug: string;
  title: string;
  description?: string;
  url: string;
  editUrl?: string;
  sourceCommit: string;
  markdown: string;
  tags: string[];
  facets: Record<string, string>;
  review?: Record<string, string | boolean>;
}

export interface WikiSearchResult {
  pageId: string;
  sourceId: string;
  sourceLabel: string;
  slug: string;
  title: string;
  description?: string;
  url: string;
  tags: string[];
  facets: Record<string, string>;
  score: number;
}

export function stripFrontmatter(markdown: string): string {
  return markdown.startsWith("---\n") ? markdown.replace(/^---\n[\s\S]*?\n---\n?/, "") : markdown;
}

export function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/`([^`]+)`/g, "$1")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pageToResult(source: RegistrySource, page: ManifestPage, score = 1): WikiSearchResult {
  return {
    pageId: page.id,
    sourceId: page.sourceId,
    sourceLabel: source.label,
    slug: page.slug,
    title: page.title,
    description: page.description,
    url: makeWikiUrl(page),
    tags: page.tags ?? [],
    facets: page.facets ?? {},
    score,
  };
}

function scorePage(page: ManifestPage, source: RegistrySource, query: string): number {
  const needle = query.toLowerCase().trim();
  if (!needle) return 1;
  const title = page.title.toLowerCase();
  const description = String(page.description ?? "").toLowerCase();
  const tags = (page.tags ?? []).join(" ").toLowerCase();
  const slug = page.slug.toLowerCase();
  const sourceText = `${source.label} ${source.description}`.toLowerCase();
  let score = 0;
  if (title === needle) score += 100;
  if (title.includes(needle)) score += 50;
  if (slug.includes(needle)) score += 25;
  if (tags.includes(needle)) score += 15;
  if (description.includes(needle)) score += 10;
  if (sourceText.includes(needle)) score += 5;
  return score;
}

export async function listSources() {
  const registry = await loadRegistry();
  const manifests = await loadAllManifests();
  const bySource = new Map(manifests.map(item => [item.source.id, item]));
  return {
    registryUrl,
    routeMode: registry.routeMode,
    sources: registry.sources
      .filter(source => source.enabled)
      .sort((a, b) => a.order - b.order)
      .map(source => {
        const loaded = bySource.get(source.id);
        return {
          id: source.id,
          label: source.label,
          description: source.description,
          latestUrl: source.latestUrl,
          sourceCommit: loaded?.latest.sourceCommit,
          pageCount: loaded?.manifest.pages.length ?? 0,
          defaultPage: loaded?.manifest.pages.find(page => page.slug === "index")?.slug ?? loaded?.manifest.pages[0]?.slug,
        };
      }),
  };
}

export async function searchWiki(args: {
  query?: string;
  sourceIds?: string[];
  tags?: string[];
  status?: string;
  difficulty?: string;
  limit?: number;
}): Promise<{ results: WikiSearchResult[] }> {
  const manifests = await loadAllManifests();
  const sourceFilter = new Set(args.sourceIds?.filter(Boolean) ?? []);
  const tagFilter = new Set(args.tags?.filter(Boolean) ?? []);
  const results = manifests
    .filter(item => sourceFilter.size === 0 || sourceFilter.has(item.source.id))
    .flatMap(item =>
      item.manifest.pages
        .map(page => ({ item, page, score: scorePage(page, item.source, args.query ?? "") }))
        .filter(({ page, score }) => {
          if ((args.query ?? "").trim() && score <= 0) return false;
          if (tagFilter.size && !(page.tags ?? []).some(tag => tagFilter.has(tag))) return false;
          if (args.status && page.facets?.status !== args.status) return false;
          if (args.difficulty && page.facets?.difficulty !== args.difficulty) return false;
          return true;
        })
        .map(({ item, page, score }) => pageToResult(item.source, page, score)),
    )
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return { results: results.slice(0, Math.max(1, Math.min(args.limit ?? 20, 100))) };
}

export async function filterPages(args: {
  sourceIds?: string[];
  tags?: string[];
  area?: string;
  status?: string;
  difficulty?: string;
  limit?: number;
}): Promise<{ pages: WikiSearchResult[] }> {
  const found = await searchWiki({
    sourceIds: args.sourceIds,
    tags: args.tags,
    status: args.status,
    difficulty: args.difficulty,
    limit: args.limit ?? 50,
  });
  return {
    pages: found.results.filter(page => !args.area || page.facets.area === args.area),
  };
}

export async function getPage(args: { sourceId: string; slug: string }): Promise<WikiPageForAgent> {
  const loaded = await loadWikiPage(args.sourceId, args.slug);
  return loadedPageForAgent(loaded);
}

export async function getSection(args: { sourceId: string; slug: string; anchor: string }): Promise<WikiPageForAgent & { anchor: string; text: string }> {
  const loaded = await loadWikiPage(args.sourceId, args.slug);
  const clean = stripFrontmatter(loaded.markdown);
  const heading = loaded.page.headings?.find(item => item.anchor === args.anchor);
  if (!heading) throw new Error(`Unknown section: ${args.sourceId}/${args.slug}#${args.anchor}`);
  const lines = clean.split(/\r?\n/);
  const start = lines.findIndex(line => slugifyHeading(line.replace(/^#{1,6}\s+/, "").trim()) === args.anchor);
  if (start < 0) throw new Error(`Unable to locate section text: ${args.anchor}`);
  const end = lines.findIndex((line, index) => index > start && /^#{1,6}\s+/.test(line));
  const text = lines.slice(start, end > start ? end : undefined).join("\n").trim();
  return { ...loadedPageForAgent(loaded), anchor: heading.anchor, text };
}

export async function listTags(args: { sourceIds?: string[] } = {}) {
  const manifests = await loadAllManifests();
  const sourceFilter = new Set(args.sourceIds?.filter(Boolean) ?? []);
  const counts = new Map<string, number>();
  for (const item of manifests) {
    if (sourceFilter.size && !sourceFilter.has(item.source.id)) continue;
    for (const page of item.manifest.pages) {
      for (const tag of page.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return {
    tags: [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
  };
}

export async function getHealth(args: { sourceId?: string } = {}) {
  const manifests = await loadAllManifests();
  return {
    sources: manifests
      .filter(item => !args.sourceId || item.source.id === args.sourceId)
      .map(item => ({
        id: item.source.id,
        label: item.source.label,
        sourceCommit: item.latest.sourceCommit,
        generatedAt: item.latest.generatedAt,
        pages: item.manifest.pages.length,
        healthUrl: item.latest.healthUrl,
      })),
  };
}

export async function resolveReference(args: { query: string; limit?: number }) {
  return await searchWiki({ query: args.query, limit: args.limit ?? 5 });
}

export function loadedPageForAgent(loaded: LoadedWikiPage): WikiPageForAgent {
  return {
    pageId: loaded.page.id,
    sourceId: loaded.source.id,
    slug: loaded.page.slug,
    title: loaded.page.title,
    description: loaded.page.description,
    url: makeWikiUrl(loaded.page),
    editUrl: loaded.page.editUrl,
    sourceCommit: loaded.latest.sourceCommit,
    markdown: stripFrontmatter(loaded.markdown),
    tags: loaded.page.tags ?? [],
    facets: loaded.page.facets ?? {},
    review: loaded.page.review,
  };
}

export async function safeTool<T>(work: () => Promise<T>): Promise<WikiToolResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export type LoadedManifestSet = Array<{ source: RegistrySource; latest: SourceLatest; manifest: WikiManifest }>;
