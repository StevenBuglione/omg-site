import cytoscape, { type Core, type ElementDefinition, type StylesheetCSS } from "cytoscape";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, Library, Network, Search } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import ReactMarkdown from "react-markdown";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import "./styles.css";

const registryUrl = "https://cdn.jsdelivr.net/gh/StevenBuglione/omg-data-registry@main/sources.json";

type RegistrySource = {
  id: string;
  type?: "wiki" | "book-series";
  label: string;
  description: string;
  enabled: boolean;
  order: number;
  latestUrl: string;
};

type Registry = { schemaVersion: string; routeMode: "query"; sources: RegistrySource[] };
type BookLatest = {
  schemaVersion: string;
  sourceId: string;
  graphUrl: string;
  catalogUrl: string;
  manifestUrl: string;
  readerManifestUrl?: string;
  libraryIndexUrl?: string;
  contentBaseUrl?: string;
  assetsBaseUrl?: string;
};
type BookRecord = { id: string; title: string; sequence: number; status: string; premise?: string; chapterIds?: string[] };
type ReaderChapter = {
  seriesId: string;
  bookId: string;
  chapterId: string;
  title: string;
  status: string;
  proseFile: string;
  markdownUrl: string;
  wordCount: number;
  frontmatter?: Record<string, unknown>;
  graphNodeId: string;
  previousChapterId: string | null;
  nextChapterId: string | null;
};
type ReaderManifest = {
  schemaVersion: string;
  series: { id: string; title: string; logline: string };
  books: BookRecord[];
  chapters: ReaderChapter[];
};
type BookGraphNode = {
  id: string;
  type: string;
  label: string;
  source_file: string;
  status?: string;
  data?: Record<string, unknown>;
};
type BookGraphEdge = { from: string; to: string; type: string; label?: string };
type BookGraph = { schemaVersion: string; seriesId: string; nodes: BookGraphNode[]; edges: BookGraphEdge[] };
type SeriesBundle = {
  source: RegistrySource;
  latest: BookLatest;
  graph: BookGraph;
  reader: ReaderManifest;
};

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL === "/" ? "" : import.meta.env.BASE_URL.replace(/\/$/, "");

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function loadText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: "text/markdown,text/plain,*/*" } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return await response.text();
}

async function loadFreshText(url: string): Promise<string> {
  return await loadText(rawGitHubUrl(url) ?? url);
}

async function loadRegistry(): Promise<Registry> {
  return await loadJson<Registry>(registryUrl);
}

function rawGitHubUrl(url: string): string | null {
  const match = url.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, owner, repo, ref, filePath] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;
}

async function loadLatest(source: RegistrySource): Promise<BookLatest> {
  const latest = await loadJson<BookLatest>(source.latestUrl);
  const rawUrl = rawGitHubUrl(source.latestUrl);
  if (!rawUrl) return latest;
  try {
    const rawLatest = await loadJson<BookLatest>(rawUrl);
    return rawLatest.readerManifestUrl ? rawLatest : latest;
  } catch {
    return latest;
  }
}

async function loadFreshJson<T>(url: string): Promise<T> {
  const rawUrl = rawGitHubUrl(url);
  return await loadJson<T>(rawUrl ?? url);
}

async function loadSeriesBundles(): Promise<SeriesBundle[]> {
  const registry = await loadRegistry();
  const sources = registry.sources.filter(source => source.enabled && source.type === "book-series").sort((a, b) => a.order - b.order);
  return await Promise.all(
    sources.map(async source => {
      const latest = await loadLatest(source);
      if (!latest.readerManifestUrl) throw new Error(`${source.id} latest.json is missing readerManifestUrl`);
      const [graph, reader] = await Promise.all([
        loadFreshJson<BookGraph>(latest.graphUrl),
        loadFreshJson<ReaderManifest>(latest.readerManifestUrl),
      ]);
      return { source, latest, graph, reader };
    }),
  );
}

function route(path: string) {
  return `${basePath}${path}`;
}

function useBundles() {
  return useQuery({ queryKey: ["series-bundles"], queryFn: loadSeriesBundles, staleTime: 60_000 });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/library">
          <span>OMG</span>
          <strong>Fiction Studio</strong>
        </Link>
        <nav>
          <Link to="/library"><Library size={17} /> Library</Link>
          <Link to="/graph"><Network size={17} /> Graph</Link>
          <a href="https://github.com/StevenBuglione/omg-data-registry">Registry</a>
        </nav>
      </header>
      {children}
    </div>
  );
}

function LoadingState({ label = "Loading studio..." }: { label?: string }) {
  return <Shell><main className="state-shell">{label}</main></Shell>;
}

function ErrorState({ error }: { error: unknown }) {
  return <Shell><main className="state-shell error">{error instanceof Error ? error.message : String(error)}</main></Shell>;
}

function LibraryPage() {
  const bundles = useBundles();
  if (bundles.isLoading) return <LoadingState />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  const items = bundles.data ?? [];
  return (
    <Shell>
      <main className="library-page">
        <section className="hero">
          <div>
            <p>Static multi-book engine</p>
            <h1>Read, plan, and inspect original fiction as connected story systems.</h1>
          </div>
          <Link className="primary-action" to="/graph"><Network size={18} /> Open Graph</Link>
        </section>
        <section className="series-grid">
          {items.map(item => (
            <article className="series-card" key={item.source.id}>
              <div className="card-kicker">{item.reader.books.length} books / {item.reader.chapters.length} chapters</div>
              <h2>{item.reader.series.title}</h2>
              <p>{item.reader.series.logline || item.source.description}</p>
              <div className="card-actions">
                <Link to={`/series/${item.source.id}`}>Series</Link>
                <Link to={`/graph/${item.source.id}`}>Graph</Link>
                {item.reader.chapters[0] ? <Link to={`/read/${item.source.id}/${item.reader.chapters[0].bookId}/${item.reader.chapters[0].chapterId}`}>Read</Link> : null}
              </div>
            </article>
          ))}
        </section>
      </main>
    </Shell>
  );
}

function findBundle(bundles: SeriesBundle[] | undefined, seriesId?: string) {
  return bundles?.find(item => item.source.id === seriesId || item.reader.series.id === seriesId) ?? bundles?.[0] ?? null;
}

function SeriesPage() {
  const { seriesId } = useParams();
  const bundles = useBundles();
  if (bundles.isLoading) return <LoadingState />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  const bundle = findBundle(bundles.data, seriesId);
  if (!bundle) return <ErrorState error="Unknown series" />;
  const counts = countTypes(bundle.graph.nodes);
  return (
    <Shell>
      <main className="dashboard">
        <section className="dashboard-hero">
          <p>Series dashboard</p>
          <h1>{bundle.reader.series.title}</h1>
          <span>{bundle.reader.series.logline}</span>
        </section>
        <section className="metric-row">
          {Object.entries(counts).slice(0, 8).map(([key, value]) => <div className="metric" key={key}><strong>{value}</strong><span>{key}</span></div>)}
        </section>
        <section className="book-list">
          {bundle.reader.books.map(book => (
            <article className="book-row" key={book.id}>
              <div>
                <span>Book {book.sequence} / {book.status}</span>
                <h2>{book.title}</h2>
                <p>{book.premise}</p>
              </div>
              <Link to={`/series/${bundle.source.id}/book/${book.id}`}>Open</Link>
            </article>
          ))}
        </section>
      </main>
    </Shell>
  );
}

function BookPage() {
  const { seriesId, bookId } = useParams();
  const bundles = useBundles();
  if (bundles.isLoading) return <LoadingState />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  const bundle = findBundle(bundles.data, seriesId);
  const book = bundle?.reader.books.find(item => item.id === bookId);
  if (!bundle || !book) return <ErrorState error="Unknown book" />;
  const chapters = bundle.reader.chapters.filter(item => item.bookId === book.id);
  return (
    <Shell>
      <main className="book-page">
        <section className="dashboard-hero">
          <p>Book dashboard</p>
          <h1>{book.title}</h1>
          <span>{book.premise}</span>
        </section>
        <section className="chapter-list">
          {chapters.map(chapter => (
            <Link className="chapter-row" to={`/read/${bundle.source.id}/${book.id}/${chapter.chapterId}`} key={chapter.chapterId}>
              <BookOpen size={18} />
              <div>
                <strong>{chapter.title}</strong>
                <span>{chapter.status} / {chapter.wordCount} words</span>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </Shell>
  );
}

function ReaderPage() {
  const { seriesId, bookId, chapterId } = useParams();
  const bundles = useBundles();
  const [markdown, setMarkdown] = useState("");
  const bundle = findBundle(bundles.data, seriesId);
  const chapter = bundle?.reader.chapters.find(item => item.bookId === bookId && item.chapterId === chapterId);
  useEffect(() => {
    let cancelled = false;
    if (!chapter) return;
    loadFreshText(chapter.markdownUrl).then(text => {
      if (!cancelled) setMarkdown(text);
    });
    return () => {
      cancelled = true;
    };
  }, [chapter]);
  if (bundles.isLoading) return <LoadingState />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  if (!bundle || !chapter) return <ErrorState error="Unknown chapter" />;
  const bookChapters = bundle.reader.chapters.filter(item => item.bookId === bookId);
  const node = bundle.graph.nodes.find(item => item.id === chapter.graphNodeId);
  const edges = bundle.graph.edges.filter(edge => edge.from === chapter.graphNodeId || edge.to === chapter.graphNodeId);
  return (
    <Shell>
      <main className="reader-shell">
        <aside className="chapter-rail">
          <Link to={`/series/${bundle.source.id}/book/${bookId}`}>Book</Link>
          {bookChapters.map(item => <Link className={item.chapterId === chapter.chapterId ? "active" : ""} to={`/read/${bundle.source.id}/${item.bookId}/${item.chapterId}`} key={item.chapterId}>{item.title}</Link>)}
        </aside>
        <article className="prose-panel">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          <div className="reader-nav">
            {chapter.previousChapterId ? <Link to={`/read/${bundle.source.id}/${bookId}/${chapter.previousChapterId}`}><ChevronLeft size={18} /> Previous</Link> : <span />}
            {chapter.nextChapterId ? <Link to={`/read/${bundle.source.id}/${bookId}/${chapter.nextChapterId}`}>Next <ChevronRight size={18} /></Link> : <span />}
          </div>
        </article>
        <aside className="context-panel">
          <p>Chapter context</p>
          <h2>{chapter.title}</h2>
          <dl>
            <dt>Status</dt><dd>{chapter.status}</dd>
            <dt>Words</dt><dd>{chapter.wordCount}</dd>
            <dt>POV</dt><dd>{String(node?.data?.pov_character_id ?? "")}</dd>
            <dt>Graph backlinks</dt><dd>{edges.length}</dd>
          </dl>
          <Link className="primary-action" to={`/graph/${bundle.source.id}/${bookId}?node=${encodeURIComponent(chapter.graphNodeId)}`}>Open in graph</Link>
          <div className="backlink-list">
            {edges.map(edge => <span key={`${edge.from}-${edge.to}-${edge.type}`}>{edge.type}: {edge.from === chapter.graphNodeId ? edge.to : edge.from}</span>)}
          </div>
        </aside>
      </main>
    </Shell>
  );
}

function countTypes(nodes: BookGraphNode[]) {
  return nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] ?? 0) + 1;
    return acc;
  }, {});
}

function nodeColor(type: string) {
  const colors: Record<string, string> = {
    series: "#5b7cfa",
    book: "#24a148",
    chapter: "#8b5cf6",
    scene: "#a855f7",
    character: "#ef4444",
    relationship: "#f43f5e",
    timeline_event: "#f97316",
    review: "#64748b",
    art_decision: "#db2777",
    llm_decision: "#0891b2",
    story_bible: "#0ea5e9",
    world_bible: "#14b8a6",
    institution: "#475569",
    world_rule: "#ca8a04",
    object: "#d97706",
    place_object: "#b45309",
    outline: "#16a34a",
  };
  return colors[type] ?? "#334155";
}

function GraphStudio() {
  const { seriesId, bookId } = useParams();
  const [params] = useSearchParams();
  const bundles = useBundles();
  const [selectedId, setSelectedId] = useState(params.get("node") ?? "");
  const [query, setQuery] = useState("");
  const [hopMode, setHopMode] = useState<"all" | "one" | "two">("all");
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const bundle = findBundle(bundles.data, seriesId ?? params.get("s") ?? undefined);
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const graph = bundle?.graph;
  const typeList = useMemo(() => [...new Set(graph?.nodes.map(node => node.type) ?? [])].sort(), [graph]);
  const visibleNodes = useMemo(() => {
    if (!graph) return [];
    const lower = query.trim().toLowerCase();
    const base = graph.nodes.filter(node => {
      if (bookId && node.data?.book_id && node.data.book_id !== bookId) return false;
      if (enabledTypes.size && !enabledTypes.has(node.type)) return false;
      if (lower && !`${node.label} ${node.type} ${node.id}`.toLowerCase().includes(lower)) return false;
      return true;
    });
    if (hopMode === "all" || !selectedId) return base;
    const allowed = new Set([selectedId]);
    const steps = hopMode === "one" ? 1 : 2;
    for (let i = 0; i < steps; i += 1) {
      for (const edge of graph.edges) {
        if (allowed.has(edge.from)) allowed.add(edge.to);
        if (allowed.has(edge.to)) allowed.add(edge.from);
      }
    }
    return base.filter(node => allowed.has(node.id));
  }, [graph, query, enabledTypes, selectedId, hopMode, bookId]);
  const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
  const visibleEdges = graph?.edges.filter(edge => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)) ?? [];
  const selectedNode = graph?.nodes.find(node => node.id === selectedId) ?? visibleNodes[0] ?? null;

  useEffect(() => {
    if (!container.current || !graph) return;
    const elements: ElementDefinition[] = [
      ...visibleNodes.map(node => ({ data: { id: node.id, label: node.label, type: node.type, color: nodeColor(node.type) } })),
      ...visibleEdges.map(edge => ({ data: { id: `${edge.from}-${edge.to}-${edge.type}`, source: edge.from, target: edge.to, label: edge.type } })),
    ];
    cyRef.current?.destroy();
    const graphStyle = [
      { selector: "node", style: { "background-color": "data(color)", label: "data(label)", color: "#172033", "font-size": "10px", "text-wrap": "wrap", "text-max-width": "120px", "text-valign": "bottom", "text-margin-y": "8px", width: "18px", height: "18px", "border-width": "3px", "border-color": "#ffffff" } },
      { selector: "edge", style: { width: 1.4, "line-color": "#9aa8bd", "target-arrow-color": "#9aa8bd", "target-arrow-shape": "triangle", "curve-style": "bezier", opacity: 0.58 } },
      { selector: `node[id = "${selectedId}"]`, style: { width: "31px", height: "31px", "border-color": "#111827", "border-width": "5px" } },
    ] as unknown as StylesheetCSS[];
    const cy = cytoscape({
      container: container.current,
      elements,
      wheelSensitivity: 0.18,
      style: graphStyle,
      layout: { name: "cose", animate: false, fit: true, padding: 50, nodeRepulsion: 9000, idealEdgeLength: 110 },
    });
    let lastTap = { id: "", time: 0 };
    cy.on("tap", "node", event => {
      const id = event.target.id();
      const now = Date.now();
      setSelectedId(id);
      if (lastTap.id === id && now - lastTap.time < 350) {
        const node = graph.nodes.find(item => item.id === id);
        if (node?.type === "chapter") navigate(`/read/${bundle?.source.id}/${node.data?.book_id}/${node.data?.chapter_id}`);
        else navigate(`/node/${encodeURIComponent(id)}?s=${bundle?.source.id}`);
      }
      lastTap = { id, time: now };
    });
    cyRef.current = cy;
    return () => cy.destroy();
  }, [bundle?.source.id, graph, navigate, selectedId, visibleEdges, visibleNodes]);

  if (bundles.isLoading) return <LoadingState />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  if (!bundle || !graph) return <ErrorState error="No graph source found" />;
  function toggleType(type: string) {
    const next = new Set(enabledTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setEnabledTypes(next);
  }
  return (
    <Shell>
      <main className="graph-studio">
        <section className="graph-toolbar">
          <div>
            <p>Story graph</p>
            <h1>{bundle.reader.series.title}</h1>
          </div>
          <label className="search-box"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search graph" /></label>
          <select value={hopMode} onChange={event => setHopMode(event.target.value as "all" | "one" | "two")}>
            <option value="all">All</option>
            <option value="one">1-hop</option>
            <option value="two">2-hop</option>
          </select>
        </section>
        <section className="type-strip">
          {typeList.map(type => <button type="button" className={!enabledTypes.size || enabledTypes.has(type) ? "active" : ""} onClick={() => toggleType(type)} key={type}><span style={{ background: nodeColor(type) }} />{type}</button>)}
        </section>
        <section className="graph-layout">
          <div className="graph-canvas" ref={container} aria-label="Interactive story graph" />
          <NodeDrawer bundle={bundle} node={selectedNode} edges={visibleEdges.filter(edge => edge.from === selectedNode?.id || edge.to === selectedNode?.id)} />
        </section>
      </main>
    </Shell>
  );
}

function NodeDrawer({ bundle, node, edges }: { bundle: SeriesBundle; node: BookGraphNode | null; edges: BookGraphEdge[] }) {
  if (!node) return <aside className="node-drawer">Select a node</aside>;
  const chapterId = String(node.data?.chapter_id ?? "");
  const bookId = String(node.data?.book_id ?? "");
  return (
    <aside className="node-drawer">
      <span className="node-type">{node.type}</span>
      <h2>{node.label}</h2>
      <p>{String(node.data?.summary ?? node.data?.premise ?? node.data?.objective ?? node.data?.reason ?? node.data?.purpose ?? "")}</p>
      <dl>
        <dt>Status</dt><dd>{node.status ?? "unknown"}</dd>
        <dt>File</dt><dd>{node.source_file}</dd>
        <dt>Edges</dt><dd>{edges.length}</dd>
      </dl>
      {node.type === "chapter" ? <Link className="primary-action" to={`/read/${bundle.source.id}/${bookId}/${chapterId}`}>Read chapter</Link> : null}
      <div className="backlink-list">
        {edges.map(edge => <span key={`${edge.from}-${edge.to}-${edge.type}`}>{edge.type}: {edge.from === node.id ? edge.to : edge.from}</span>)}
      </div>
    </aside>
  );
}

async function loadLegacyWiki(sourceId: string, slug: string) {
  const registry = await loadRegistry();
  const source = registry.sources.find(item => item.enabled && (item.type ?? "wiki") === "wiki" && item.id === sourceId);
  if (!source) throw new Error(`Unknown wiki source: ${sourceId}`);
  const latest = await loadJson<{ manifestUrl: string; contentBaseUrl: string }>(source.latestUrl);
  const manifest = await loadJson<{ pages: Array<{ slug: string; title: string; file: string }> }>(latest.manifestUrl);
  const page = manifest.pages.find(item => item.slug === slug) ?? manifest.pages[0];
  if (!page) throw new Error(`No page in ${sourceId}`);
  const markdown = await loadText(`${latest.contentBaseUrl}${page.file}`);
  return { source, page, markdown };
}

function LegacyWikiPage() {
  const [params] = useSearchParams();
  const sourceId = params.get("s") ?? "homelab";
  const slug = params.get("p") ?? "";
  const wiki = useQuery({ queryKey: ["wiki", sourceId, slug], queryFn: () => loadLegacyWiki(sourceId, slug), staleTime: 60_000 });
  if (wiki.isLoading) return <LoadingState label="Loading legacy wiki..." />;
  if (wiki.error) return <ErrorState error={wiki.error} />;
  return (
    <Shell>
      <main className="wiki-page">
        <p>{wiki.data?.source.label} legacy wiki</p>
        <h1>{wiki.data?.page.title}</h1>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{wiki.data?.markdown ?? ""}</ReactMarkdown>
      </main>
    </Shell>
  );
}

function NodeRoute() {
  const { nodeId } = useParams();
  const [params] = useSearchParams();
  return <GraphStudio key={`${nodeId}-${params.get("s")}`} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basePath}>
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/series/:seriesId" element={<SeriesPage />} />
          <Route path="/series/:seriesId/book/:bookId" element={<BookPage />} />
          <Route path="/read/:seriesId/:bookId/:chapterId" element={<ReaderPage />} />
          <Route path="/graph" element={<GraphStudio />} />
          <Route path="/graph/:seriesId" element={<GraphStudio />} />
          <Route path="/graph/:seriesId/:bookId" element={<GraphStudio />} />
          <Route path="/node/:nodeId" element={<NodeRoute />} />
          <Route path="/wiki" element={<LegacyWikiPage />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
