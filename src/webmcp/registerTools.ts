import {
  filterPages,
  getHealth,
  getPage,
  getSection,
  listSources,
  listTags,
  resolveReference,
  safeTool,
  searchWiki,
} from "../wiki-core/agentTools";

const registered = new Set<string>();

const toolSchemas = {
  list_sources: {
    type: "object",
    properties: {},
  },
  search: {
    type: "object",
    properties: {
      query: { type: "string" },
      sourceIds: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      status: { type: "string" },
      difficulty: { type: "string" },
      limit: { type: "number" },
    },
  },
  get_page: {
    type: "object",
    properties: {
      sourceId: { type: "string" },
      slug: { type: "string" },
    },
    required: ["sourceId", "slug"],
  },
  get_section: {
    type: "object",
    properties: {
      sourceId: { type: "string" },
      slug: { type: "string" },
      anchor: { type: "string" },
    },
    required: ["sourceId", "slug", "anchor"],
  },
  filter_pages: {
    type: "object",
    properties: {
      sourceIds: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      area: { type: "string" },
      status: { type: "string" },
      difficulty: { type: "string" },
      limit: { type: "number" },
    },
  },
  list_tags: {
    type: "object",
    properties: {
      sourceIds: { type: "array", items: { type: "string" } },
    },
  },
  resolve_reference: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["query"],
  },
  health: {
    type: "object",
    properties: {
      sourceId: { type: "string" },
    },
  },
} as const;

export const wikiWebMcpToolNames = [
  "wiki.list_sources",
  "wiki.search",
  "wiki.get_page",
  "wiki.get_section",
  "wiki.filter_pages",
  "wiki.list_tags",
  "wiki.resolve_reference",
  "wiki.health",
] as const;

function modelContext() {
  if (typeof navigator === "undefined") return undefined;
  return navigator.modelContext;
}

async function registerTool(name: string, description: string, inputSchema: object, execute: (args: any) => Promise<unknown>) {
  const context = modelContext();
  if (!context?.registerTool || registered.has(name)) return false;
  const definition = {
    name,
    description,
    inputSchema,
    schema: inputSchema,
    execute,
    handler: execute,
  };
  await context.registerTool(definition);
  registered.add(name);
  return true;
}

export function installWikiToolFallback() {
  if (typeof window === "undefined") return;
  window.__wikiTools = {
    listSources: () => safeTool(() => listSources()),
    search: (args = {}) => safeTool(() => searchWiki(args)),
    getPage: (args: { sourceId: string; slug: string }) => safeTool(() => getPage(args)),
    getSection: (args: { sourceId: string; slug: string; anchor: string }) => safeTool(() => getSection(args)),
    filterPages: (args = {}) => safeTool(() => filterPages(args)),
    listTags: (args = {}) => safeTool(() => listTags(args)),
    resolveReference: (args: { query: string; limit?: number }) => safeTool(() => resolveReference(args)),
    health: (args = {}) => safeTool(() => getHealth(args)),
  };
}

export async function registerWikiWebMcpTools() {
  installWikiToolFallback();
  const context = modelContext();
  const support = Boolean(context?.registerTool);
  if (!support) {
    return { supported: false, registered: [], fallback: true };
  }
  const tools = [
    registerTool("wiki.list_sources", "List enabled wiki data sources and page counts.", toolSchemas.list_sources, () =>
      safeTool(() => listSources()),
    ),
    registerTool("wiki.search", "Search wiki pages across enabled sources with optional filters.", toolSchemas.search, args =>
      safeTool(() => searchWiki(args ?? {})),
    ),
    registerTool("wiki.get_page", "Fetch one wiki page as Markdown with metadata and citation-friendly URLs.", toolSchemas.get_page, args =>
      safeTool(() => getPage(args)),
    ),
    registerTool("wiki.get_section", "Fetch one heading section from a wiki page.", toolSchemas.get_section, args =>
      safeTool(() => getSection(args)),
    ),
    registerTool("wiki.filter_pages", "Browse pages by source, tag, area, status, or difficulty.", toolSchemas.filter_pages, args =>
      safeTool(() => filterPages(args ?? {})),
    ),
    registerTool("wiki.list_tags", "List tags and counts across enabled sources.", toolSchemas.list_tags, args =>
      safeTool(() => listTags(args ?? {})),
    ),
    registerTool("wiki.resolve_reference", "Resolve a fuzzy page reference to likely wiki pages.", toolSchemas.resolve_reference, args =>
      safeTool(() => resolveReference(args)),
    ),
    registerTool("wiki.health", "Return source freshness and quality artifact locations.", toolSchemas.health, args =>
      safeTool(() => getHealth(args ?? {})),
    ),
  ];
  await Promise.all(tools);
  return { supported: true, registered: [...registered], fallback: true };
}
