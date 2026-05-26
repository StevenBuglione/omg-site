import cytoscape, { type Core, type ElementDefinition, type StylesheetCSS } from "cytoscape";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Activity, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, FileText, ImageIcon, Library, Network, Search } from "lucide-react";
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
  studioIndexUrl?: string;
  researchManifestUrl?: string;
  decisionManifestUrl?: string;
  reviewManifestUrl?: string;
  runManifestUrl?: string;
  artManifestUrl?: string;
  qualityReportUrl?: string;
  contentBaseUrl?: string;
  assetsBaseUrl?: string;
};
type StudioIndex = {
  schemaVersion: string;
  generatedAt: string;
  series: { id: string; title: string; logline?: string; status?: string; bookCount?: number; chapterCount?: number; nodeCount?: number };
  counts: Record<string, number>;
  quality: { status: string; failedGates: string[]; gates: QualityGate[]; maturityGates?: QualityGate[]; maturityScore?: number; editorialAssessment?: EditorialAssessment | null };
  books: Array<{ id: string; title: string; status: string; chapters: Array<{ id: string; title: string; status: string; hasProse?: boolean; generatedArt?: boolean }> }>;
  recentRuns: StudioRun[];
  recentDecisions: StudioDecision[];
  recentReviews: StudioReview[];
  artAssets: ArtAsset[];
};
type QualityGate = { id: string; label: string; actual: number; minimum: number; passed: boolean; severity?: string };
type EditorialAssessment = {
  assessment_id?: string;
  decision?: string;
  confidence?: number;
  ready_for_drafting?: boolean;
  next_stage?: string;
  strengths?: string[];
  weak_spots?: string[];
  missing_questions?: string[];
  recommended_development?: string[];
  audit_scores?: Record<string, number>;
  blocking_development_questions?: string[];
  rationale?: string;
  generated_at?: string;
};
type QualityReport = { schemaVersion: string; generatedAt: string; status: string; gates: QualityGate[]; maturityGates?: QualityGate[]; maturityScore?: number; counts: Record<string, number>; editorialAssessment?: EditorialAssessment | null; recommendedNextActions: string[] };
type ResearchManifest = { schemaVersion: string; generatedAt: string; dossiers: ResearchDossier[] };
type ResearchDossier = {
  id: string;
  title: string;
  domain: string;
  summary: string;
  markdownUrl?: string | null;
  markdownPath?: string;
  citations?: Array<{ id: string; title: string; url: string; source_type?: string; reliability?: string; note?: string }>;
  claimMap?: Array<{ claim_id: string; claim: string; confidence?: number; story_use?: string; citation_ids?: string[] }>;
  sourceQuality?: Record<string, unknown>;
  fictionApplications?: string[];
  linkedNodes?: string[];
  reviewStatus?: string;
  sourceFamilies?: string[];
  bookIds?: string[];
  chapterIds?: string[];
  sourceFile: string;
  details?: Record<string, unknown>;
};
type StudioDecision = { id: string; type: string; bookId?: string | null; chapterId?: string | null; status: string; title: string; reason?: string; sourceFile: string; confidence?: number | null; conversationUrl?: string | null; packageId?: string | null; requestId?: string | null };
type StudioReview = StudioDecision & { reviewer?: string; approved?: boolean; verdict?: string; blockingFindings?: string[]; nonBlockingFindings?: string[] };
type DecisionManifest = { schemaVersion: string; generatedAt: string; decisions: StudioDecision[] };
type ReviewManifest = { schemaVersion: string; generatedAt: string; reviews: StudioReview[] };
type StudioRun = { id: string; action?: string | null; status: string; workerId?: string | null; packageId?: string | null; requestId?: string | null; conversationUrl?: string | null; sourceFile: string };
type RunManifest = { schemaVersion: string; generatedAt: string; runs: StudioRun[] };
type ArtAsset = { path: string; kind: string; alt: string; url: string; targetType?: string; targetNodeId?: string; bookId?: string | null; chapterId?: string | null };
type ArtManifest = { schemaVersion: string; generatedAt: string; decisions: StudioDecision[]; briefs: Array<Record<string, unknown> & { source_file: string }>; reviews?: Array<Record<string, unknown>>; assets: ArtAsset[] };
type BookRecord = { id: string; title: string; sequence: number; status: string; premise?: string; chapterIds?: string[] };
type ReaderChapter = {
  seriesId: string;
  bookId: string;
  chapterId: string;
  title: string;
  status: string;
  proseFile: string;
  hasProse?: boolean;
  markdownUrl: string | null;
  wordCount: number;
  frontmatter?: Record<string, unknown>;
  generatedArt?: boolean;
  artifacts?: Array<{ path: string; kind: string; alt: string; url: string }>;
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
  studio: StudioIndex;
  research: ResearchManifest;
  decisions: DecisionManifest;
  reviews: ReviewManifest;
  runs: RunManifest;
  art: ArtManifest;
  quality: QualityReport;
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
  const localUrl = localDevDataUrl(url);
  if (localUrl) return await loadText(localUrl);
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

function localDevDataUrl(url: string): string | null {
  if (!import.meta.env.DEV) return null;
  const match = url.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/StevenBuglione\/(omg-data-[^@]+)@main\/(.+)$/);
  if (!match) return null;
  const [, repo, filePath] = match;
  return `/local-data/${repo}/${filePath}`;
}

async function loadLatest(source: RegistrySource): Promise<BookLatest> {
  const localUrl = localDevDataUrl(source.latestUrl);
  if (localUrl) return await loadJson<BookLatest>(localUrl);
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
  const localUrl = localDevDataUrl(url);
  if (localUrl) return await loadJson<T>(localUrl);
  const rawUrl = rawGitHubUrl(url);
  return await loadJson<T>(rawUrl ?? url);
}

async function loadOptionalFreshJson<T>(url: string | undefined, fallback: T): Promise<T> {
  if (!url) return fallback;
  try {
    return await loadFreshJson<T>(url);
  } catch {
    return fallback;
  }
}

async function loadSeriesBundles(): Promise<SeriesBundle[]> {
  const registry = await loadRegistry();
  const sources = registry.sources.filter(source => source.enabled && source.type === "book-series").sort((a, b) => a.order - b.order);
  return await Promise.all(
    sources.map(async source => {
      const latest = await loadLatest(source);
      if (!latest.readerManifestUrl) throw new Error(`${source.id} latest.json is missing readerManifestUrl`);
      const [graph, reader, studio, research, decisions, reviews, runs, art, quality] = await Promise.all([
        loadFreshJson<BookGraph>(latest.graphUrl),
        loadFreshJson<ReaderManifest>(latest.readerManifestUrl),
        loadOptionalFreshJson<StudioIndex>(latest.studioIndexUrl, {
          schemaVersion: "omg-book-studio-index/v1",
          generatedAt: "",
          series: { id: source.id, title: source.label },
          counts: {},
          quality: { status: "unknown", failedGates: [], gates: [], maturityGates: [], maturityScore: 0, editorialAssessment: null },
          books: [],
          recentRuns: [],
          recentDecisions: [],
          recentReviews: [],
          artAssets: [],
        }),
        loadOptionalFreshJson<ResearchManifest>(latest.researchManifestUrl, { schemaVersion: "omg-book-research-manifest/v1", generatedAt: "", dossiers: [] }),
        loadOptionalFreshJson<DecisionManifest>(latest.decisionManifestUrl, { schemaVersion: "omg-book-decision-manifest/v1", generatedAt: "", decisions: [] }),
        loadOptionalFreshJson<ReviewManifest>(latest.reviewManifestUrl, { schemaVersion: "omg-book-review-manifest/v1", generatedAt: "", reviews: [] }),
        loadOptionalFreshJson<RunManifest>(latest.runManifestUrl, { schemaVersion: "omg-book-run-manifest/v1", generatedAt: "", runs: [] }),
        loadOptionalFreshJson<ArtManifest>(latest.artManifestUrl, { schemaVersion: "omg-book-art-manifest/v1", generatedAt: "", decisions: [], briefs: [], assets: [] }),
        loadOptionalFreshJson<QualityReport>(latest.qualityReportUrl, { schemaVersion: "omg-book-quality-report/v1", generatedAt: "", status: "unknown", gates: [], maturityGates: [], maturityScore: 0, counts: {}, recommendedNextActions: [] }),
      ]);
      return { source, latest, graph, reader, studio, research, decisions, reviews, runs, art, quality };
    }),
  );
}

function route(path: string) {
  return `${basePath}${path}`;
}

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trimStart();
}

function useBundles() {
  return useQuery({ queryKey: ["series-bundles"], queryFn: loadSeriesBundles, staleTime: 60_000 });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="brand" to="/library">
          <span>O</span>
          <strong>OMG Studio</strong>
        </Link>
        <nav>
          <Link to="/library"><Library size={17} /> Library</Link>
          <Link to="/studio"><Activity size={17} /> Studio</Link>
          <Link to="/graph"><Network size={17} /> Graph</Link>
          <Link to="/studio/research"><ClipboardList size={17} /> Research</Link>
          <a href="https://github.com/StevenBuglione/omg-data-registry"><FileText size={17} /> Registry</a>
        </nav>
        <div className="sidebar-section">
          <p>Notebooks</p>
          <Link to="/series/lantern-archive">The Lantern Archive</Link>
          <Link to="/series/lantern-archive/book/ember-gate">The Ember Gate</Link>
          <Link to="/read/lantern-archive/ember-gate/chapter-001">Chapter 001</Link>
        </div>
        <div className="sidebar-section">
          <p>Tags</p>
          <Link to="/graph?tag=published">published</Link>
          <Link to="/graph?tag=reviewed">reviewed</Link>
          <Link to="/graph?tag=story-graph">story graph</Link>
        </div>
        <div className="sync-status">Static sync: GitHub Pages</div>
      </aside>
      <section className="workspace">{children}</section>
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
          <div className="series-list">
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
          </div>
          <article className="note-preview">
            <p>Selected notebook</p>
            <h2>{items[0]?.reader.series.title ?? "No series loaded"}</h2>
            <span>{items[0]?.reader.series.logline ?? "Connect an omg-data series to populate the fiction studio."}</span>
            <div className="preview-metadata">
              <strong>{items.reduce((sum, item) => sum + item.reader.books.length, 0)}</strong><span>Books</span>
              <strong>{items.reduce((sum, item) => sum + item.reader.chapters.length, 0)}</strong><span>Published chapters</span>
              <strong>{items.reduce((sum, item) => sum + item.graph.nodes.length, 0)}</strong><span>Graph nodes</span>
            </div>
          </article>
        </section>
      </main>
    </Shell>
  );
}

function findBundle(bundles: SeriesBundle[] | undefined, seriesId?: string) {
  return bundles?.find(item => item.source.id === seriesId || item.reader.series.id === seriesId) ?? bundles?.[0] ?? null;
}

function StudioTabs({ bundle, bookId }: { bundle: SeriesBundle; bookId?: string }) {
  const base = bookId ? `/series/${bundle.source.id}/book/${bookId}` : `/series/${bundle.source.id}`;
  return (
    <nav className="studio-tabs" aria-label="Studio tabs">
      <Link to={bookId ? `${base}` : base}>Reader</Link>
      <Link to={bookId ? `/graph/${bundle.source.id}/${bookId}` : `/graph/${bundle.source.id}`}>Graph</Link>
      <Link to={bookId ? `${base}/studio` : `${base}/studio`}>Studio</Link>
      <Link to="/studio/research">Research</Link>
      <Link to="/studio/reviews">Reviews</Link>
      <Link to="/studio/decisions">Decisions</Link>
      <Link to="/studio/art">Art</Link>
    </nav>
  );
}

function statusClass(status?: string) {
  const value = String(status ?? "recorded").toLowerCase();
  if (value.includes("ready") || value.includes("pass") || value.includes("approved") || value.includes("good")) return "good";
  if (value.includes("fail") || value.includes("block") || value.includes("needs")) return "bad";
  return "neutral";
}

function StudioHome() {
  const { seriesId, bookId } = useParams();
  const bundles = useBundles();
  if (bundles.isLoading) return <LoadingState label="Loading Studio..." />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  const bundle = findBundle(bundles.data, seriesId);
  if (!bundle) return <ErrorState error="Unknown series" />;
  const book = bundle.reader.books.find(item => item.id === bookId);
  const gates = bundle.quality.gates.length ? bundle.quality.gates : bundle.studio.quality.gates;
  const maturityGates = bundle.quality.maturityGates?.length ? bundle.quality.maturityGates : (bundle.studio.quality.maturityGates ?? []);
  const maturityScore = bundle.quality.maturityScore ?? bundle.studio.quality.maturityScore ?? 0;
  const editorialAssessment = bundle.quality.editorialAssessment ?? bundle.studio.quality.editorialAssessment;
  const visibleBooks = book ? bundle.studio.books.filter(item => item.id === book.id) : bundle.studio.books;
  return (
    <Shell>
      <main className="studio-shell">
        <section className="dashboard-hero">
          <div>
            <p>Studio observability</p>
            <h1>{book ? book.title : bundle.reader.series.title}</h1>
            <span>Research, reviews, decisions, runs, art, and quality gates are published as curated manifests.</span>
          </div>
          <span className={`status-pill ${statusClass(bundle.quality.status)}`}>{bundle.quality.status}</span>
        </section>
        <StudioTabs bundle={bundle} bookId={book?.id} />
        {editorialAssessment ? (
          <section className="editorial-callout">
            <div>
              <p>Autonomous editor decision</p>
              <h2>{editorialAssessment.decision ?? "recorded"}</h2>
              <span>{editorialAssessment.rationale ?? "The editor has recorded an assessment for the next story-development step."}</span>
            </div>
            <div>
              <strong>{editorialAssessment.next_stage ?? "next-stage"}</strong>
              <span>{Math.round((editorialAssessment.confidence ?? 0) * 100)}% confidence</span>
            </div>
            {editorialAssessment.blocking_development_questions?.length ? (
              <ul>
                {editorialAssessment.blocking_development_questions.slice(0, 3).map(question => <li key={question}>{question}</li>)}
              </ul>
            ) : null}
          </section>
        ) : (
          <section className="editorial-callout pending">
            <div>
              <p>Autonomous editor decision</p>
              <h2>not yet assessed</h2>
              <span>Run `omg-book studio-assess --researcher chatgpt` so ChatGPT can decide whether this world is actually ready or needs more development.</span>
            </div>
          </section>
        )}
        <section className="metric-row">
          {["researchDossiers", "places", "characters", "relationships", "timeline", "nodes"].map(key => (
            <div className="metric" key={key}><strong>{bundle.studio.counts[key] ?? bundle.quality.counts[key] ?? 0}</strong><span>{key}</span></div>
          ))}
        </section>
        <section className="studio-grid">
          <article className="studio-card wide">
            <div className="card-heading"><Search size={18} /><h2>Story Maturity Audit</h2></div>
            <p>This is the aggressive development target, separate from hard validation. A low score means the system should keep developing world, research, character, timeline, and plot before treating the story as production-depth.</p>
            <div className="maturity-score"><strong>{maturityScore}%</strong><span>production-depth target</span></div>
            <div className="quality-list">
              {maturityGates.map(gate => (
                <div className="quality-gate" key={gate.id}>
                  <span className={`status-dot ${gate.passed ? "good" : "bad"}`} />
                  <strong>{gate.label}</strong>
                  <em>{gate.actual} / {gate.minimum}</em>
                </div>
              ))}
            </div>
          </article>
          <article className="studio-card wide">
            <div className="card-heading"><CheckCircle2 size={18} /><h2>Quality Gates</h2></div>
            <div className="quality-list">
              {gates.map(gate => (
                <div className="quality-gate" key={gate.id}>
                  <span className={`status-dot ${gate.passed ? "good" : "bad"}`} />
                  <strong>{gate.label}</strong>
                  <em>{gate.actual} / {gate.minimum}</em>
                </div>
              ))}
            </div>
          </article>
          <article className="studio-card">
            <div className="card-heading"><Activity size={18} /><h2>Recent Runs</h2></div>
            <ManifestList items={bundle.runs.runs.slice(-8)} primary="action" secondary="sourceFile" />
          </article>
          <article className="studio-card">
            <div className="card-heading"><ClipboardList size={18} /><h2>Recent Decisions</h2></div>
            <ManifestList items={bundle.decisions.decisions.slice(-8)} primary="title" secondary="reason" />
          </article>
          <article className="studio-card wide">
            <div className="card-heading"><BookOpen size={18} /><h2>Books And Chapters</h2></div>
            <div className="studio-table">
              {visibleBooks.map(item => (
                <div className="studio-row" key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.chapters.length} chapters</span>
                  <Link to={`/series/${bundle.source.id}/book/${item.id}/studio`}>Open studio</Link>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </Shell>
  );
}

function ManifestList({ items, primary, secondary }: { items: Array<Record<string, unknown>>; primary: string; secondary: string }) {
  if (!items.length) return <p className="empty-note">No records published yet.</p>;
  return (
    <div className="manifest-list">
      {items.map((item, index) => (
        <div className="manifest-item" key={String(item.id ?? item.sourceFile ?? index)}>
          <strong>{String(item[primary] ?? item.id ?? "record")}</strong>
          <span>{String(item[secondary] ?? item.status ?? "")}</span>
        </div>
      ))}
    </div>
  );
}

function StudioResearchPage() {
  const bundles = useBundles();
  if (bundles.isLoading) return <LoadingState label="Loading research..." />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  const dossiers = (bundles.data ?? []).flatMap(bundle => bundle.research.dossiers.map(item => ({ ...item, seriesId: bundle.source.id })));
  return (
    <Shell>
      <main className="studio-shell">
        <section className="dashboard-hero"><div><p>Research</p><h1>Curated Dossiers</h1><span>Readable craft, plausibility, visual, and worldbuilding source notes used by the engine.</span></div></section>
        <div className="studio-grid">
          {dossiers.map(item => (
            <article className="studio-card" key={`${item.seriesId}-${item.id}`}>
              <span className="card-kicker">{item.domain} / {item.reviewStatus ?? "unreviewed"}</span>
              <h2>{item.title}</h2>
              <p>{item.summary}</p>
              <small>{item.markdownPath ?? item.sourceFile}</small>
              <div className="tag-row">
                {(item.sourceFamilies ?? []).slice(0, 4).map(source => <span key={source}>{source}</span>)}
              </div>
              <Link className="inline-action" to={`/studio/research/${item.seriesId}/${encodeURIComponent(item.id)}`}>Read dossier</Link>
            </article>
          ))}
        </div>
      </main>
    </Shell>
  );
}

function StudioResearchDetailPage() {
  const { seriesId, dossierId } = useParams();
  const bundles = useBundles();
  const [markdown, setMarkdown] = useState("");
  const bundle = findBundle(bundles.data, seriesId);
  const decodedId = decodeURIComponent(dossierId ?? "");
  const dossier = bundle?.research.dossiers.find(item => item.id === decodedId);
  useEffect(() => {
    let cancelled = false;
    setMarkdown("");
    if (!dossier?.markdownUrl) return;
    loadFreshText(dossier.markdownUrl).then(text => {
      if (!cancelled) setMarkdown(text);
    });
    return () => {
      cancelled = true;
    };
  }, [dossier?.markdownUrl]);
  if (bundles.isLoading) return <LoadingState label="Loading research dossier..." />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  if (!bundle || !dossier) return <ErrorState error="Unknown research dossier" />;
  return (
    <Shell>
      <main className="studio-shell">
        <section className="dashboard-hero">
          <div>
            <p>{dossier.domain} research dossier</p>
            <h1>{dossier.title}</h1>
            <span>{dossier.summary}</span>
          </div>
          <span className="status-pill neutral">{dossier.sourceFile}</span>
        </section>
        <section className="research-detail">
          <article className="studio-card research-sidebar">
            <h2>Source Families</h2>
            <div className="tag-row">
              {(dossier.sourceFamilies ?? []).map(item => <span key={item}>{item}</span>)}
            </div>
            <h2>Citations</h2>
            <div className="manifest-list">
              {(dossier.citations ?? []).map(citation => (
                <a className="manifest-item" href={citation.url} key={citation.id}>
                  <strong>{citation.title}</strong>
                  <span>{citation.source_type ?? "source"} / {citation.reliability ?? "unrated"}</span>
                </a>
              ))}
            </div>
            <h2>Linked Nodes</h2>
            <div className="tag-row">
              {(dossier.linkedNodes ?? []).map(node => <Link to={`/node/${encodeURIComponent(node)}?s=${bundle.source.id}`} key={node}>{node}</Link>)}
            </div>
          </article>
          <article className="studio-card wide">
            <h2>Research Notes</h2>
            {markdown ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown> : <p className="empty-note">No readable Markdown dossier was published.</p>}
            <h2>Claim Map</h2>
            <div className="claim-list">
              {(dossier.claimMap ?? []).map(claim => (
                <div className="claim-card" key={claim.claim_id}>
                  <strong>{claim.claim}</strong>
                  <span>{Math.round((claim.confidence ?? 0) * 100)}% confidence</span>
                  <p>{claim.story_use}</p>
                </div>
              ))}
            </div>
            <details className="record-details">
              <summary>Structured JSON</summary>
              <pre>{JSON.stringify(dossier.details ?? dossier, null, 2)}</pre>
            </details>
          </article>
        </section>
      </main>
    </Shell>
  );
}

function StudioRunsPage() {
  const bundles = useBundles();
  if (bundles.isLoading) return <LoadingState label="Loading runs..." />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  const runs = (bundles.data ?? []).flatMap(bundle => bundle.runs.runs.map(item => ({ ...item, seriesId: bundle.source.id }))).reverse();
  return <StudioRecordPage title="Runs" subtitle="Worker request ids, package ids, conversation URLs, and compact run metadata." records={runs} />;
}

function StudioDecisionsPage() {
  const bundles = useBundles();
  if (bundles.isLoading) return <LoadingState label="Loading decisions..." />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  const records = (bundles.data ?? []).flatMap(bundle => bundle.decisions.decisions.map(item => ({ ...item, seriesId: bundle.source.id }))).reverse();
  return <StudioRecordPage title="Decisions" subtitle="LLM, art, and repair decisions that shaped published artifacts." records={records} />;
}

function StudioReviewsPage() {
  const bundles = useBundles();
  if (bundles.isLoading) return <LoadingState label="Loading reviews..." />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  const records = (bundles.data ?? []).flatMap(bundle => bundle.reviews.reviews.map(item => ({ ...item, seriesId: bundle.source.id }))).reverse();
  return <StudioRecordPage title="Reviews" subtitle="Reviewer verdicts and blocking findings before planning, prose, and art are accepted." records={records} />;
}

function StudioArtPage() {
  const bundles = useBundles();
  if (bundles.isLoading) return <LoadingState label="Loading art..." />;
  if (bundles.error) return <ErrorState error={bundles.error} />;
  const assets = (bundles.data ?? []).flatMap(bundle => bundle.art.assets.map(item => ({ ...item, seriesId: bundle.source.id })));
  const groups = assets.reduce<Record<string, typeof assets>>((acc, item) => {
    const key = item.targetType ?? "chapter";
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});
  return (
    <Shell>
      <main className="studio-shell">
        <section className="dashboard-hero"><div><p>Art</p><h1><ImageIcon size={25} /> Canon Image Assets</h1><span>Images are grouped by character, location, item, and chapter, and only appear when approved art decisions point at existing safe paths.</span></div></section>
        {Object.entries(groups).map(([group, items]) => (
          <section className="art-group" key={group}>
            <h2>{group}</h2>
            <div className="artifact-grid">
              {items.map(item => (
                <figure className="artifact-card" key={`${item.seriesId}-${item.path}`}>
                  <img src={item.url} alt={item.alt} />
                  <figcaption><strong>{item.alt}</strong><span>{item.kind} / {item.targetNodeId ?? item.chapterId}</span></figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </main>
    </Shell>
  );
}

function StudioRecordPage({ title, subtitle, records }: { title: string; subtitle: string; records: Array<Record<string, unknown>> }) {
  return (
    <Shell>
      <main className="studio-shell">
        <section className="dashboard-hero"><div><p>Studio</p><h1>{title}</h1><span>{subtitle}</span></div></section>
        <section className="studio-table record-table">
          {records.map((item, index) => (
            <article className="studio-row" key={String(item.id ?? item.sourceFile ?? index)}>
              <div>
                <strong>{String(item.title ?? item.action ?? item.id ?? "record")}</strong>
                <span>{String(item.reason ?? item.sourceFile ?? "")}</span>
              </div>
              <span className={`status-pill ${statusClass(String(item.status ?? item.verdict ?? ""))}`}>{String(item.status ?? item.verdict ?? "recorded")}</span>
              {item.conversationUrl ? <a href={String(item.conversationUrl)}>Conversation</a> : <small>{String(item.packageId ?? item.requestId ?? "")}</small>}
            </article>
          ))}
        </section>
      </main>
    </Shell>
  );
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
        <StudioTabs bundle={bundle} />
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
        <StudioTabs bundle={bundle} bookId={book.id} />
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
    if (!chapter.markdownUrl) {
      setMarkdown("");
      return;
    }
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
          <Link to={`/series/${bundle.source.id}/book/${bookId}/studio`}>Studio</Link>
          {bookChapters.map(item => <Link className={item.chapterId === chapter.chapterId ? "active" : ""} to={`/read/${bundle.source.id}/${item.bookId}/${item.chapterId}`} key={item.chapterId}>{item.title}</Link>)}
        </aside>
        <article className="prose-panel">
          {chapter.artifacts?.[0] ? (
            <figure className="chapter-art">
              <img src={chapter.artifacts[0].url} alt={chapter.artifacts[0].alt} />
            </figure>
          ) : null}
          {chapter.markdownUrl ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(markdown)}</ReactMarkdown>
          ) : (
            <div className="planned-placeholder">
              <p>Planned chapter</p>
              <h1>{chapter.title}</h1>
              <span>This chapter has an approved packet, but prose has not been drafted yet.</span>
            </div>
          )}
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
            <dt>Art</dt><dd>{chapter.generatedArt ? "generated" : "none"}</dd>
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
  const { seriesId, bookId, nodeId } = useParams();
  const [params] = useSearchParams();
  const bundles = useBundles();
  const routeNodeId = nodeId ? decodeURIComponent(nodeId) : "";
  const [selectedId, setSelectedId] = useState(routeNodeId || params.get("node") || "");
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
    const next = routeNodeId || params.get("node") || "";
    if (next && next !== selectedId) setSelectedId(next);
  }, [params, routeNodeId, selectedId]);

  useEffect(() => {
    if (!container.current || !graph) return;
    const elements: ElementDefinition[] = [
      ...visibleNodes.map(node => ({ data: { id: node.id, label: node.label, type: node.type, color: nodeColor(node.type) } })),
      ...visibleEdges.map(edge => ({ data: { id: `${edge.from}-${edge.to}-${edge.type}`, source: edge.from, target: edge.to, label: edge.type } })),
    ];
    cyRef.current?.destroy();
    const graphStyle = [
      { selector: "node", style: { "background-color": "data(color)", label: "data(label)", color: "#172033", "font-size": "9px", "text-wrap": "wrap", "text-max-width": "110px", "text-valign": "bottom", "text-margin-y": "11px", "text-outline-width": "2px", "text-outline-color": "#fbfcfd", width: "19px", height: "19px", "border-width": "3px", "border-color": "#ffffff" } },
      { selector: "edge", style: { width: 1.2, "line-color": "#9aa8bd", "target-arrow-color": "#9aa8bd", "target-arrow-shape": "triangle", "curve-style": "bezier", opacity: 0.46 } },
      { selector: `node[id = "${selectedId}"]`, style: { width: "33px", height: "33px", "font-size": "11px", "font-weight": "700", "border-color": "#111827", "border-width": "5px" } },
    ] as unknown as StylesheetCSS[];
    const cy = cytoscape({
      container: container.current,
      elements,
      wheelSensitivity: 0.18,
      style: graphStyle,
      layout: { name: "cose", animate: false, fit: true, padding: 78, nodeRepulsion: 21000, idealEdgeLength: 150, componentSpacing: 120, nodeOverlap: 16 },
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
  const artAssets = bundle.art.assets.filter(asset => asset.targetNodeId === node.id || (node.type === "chapter" && asset.chapterId === chapterId));
  const linkedResearch = bundle.research.dossiers.filter(dossier => (dossier.linkedNodes ?? []).includes(node.id) || (chapterId && (dossier.chapterIds ?? []).includes(chapterId)));
  const artReviews = (bundle.art.reviews ?? []).filter(review => String(review.target_node_id ?? "") === node.id);
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
      {artAssets.length ? (
        <section className="node-data-section">
          <h3>Approved Art</h3>
          {artAssets.map(asset => (
            <figure className="node-art-card" key={asset.path}>
              <img src={asset.url} alt={asset.alt} />
              <figcaption>{asset.kind}</figcaption>
            </figure>
          ))}
        </section>
      ) : null}
      {linkedResearch.length ? (
        <section className="node-data-section">
          <h3>Linked Research</h3>
          <div className="manifest-list">
            {linkedResearch.map(dossier => (
              <Link className="manifest-item" to={`/studio/research/${bundle.source.id}/${encodeURIComponent(dossier.id)}`} key={dossier.id}>
                <strong>{dossier.title}</strong>
                <span>{dossier.domain} / {dossier.reviewStatus ?? "unreviewed"}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {artReviews.length ? (
        <section className="node-data-section">
          <h3>Art Review</h3>
          <pre>{JSON.stringify(artReviews, null, 2)}</pre>
        </section>
      ) : null}
      <section className="node-data-section">
        <h3>Record Details</h3>
        <pre>{JSON.stringify(node.data ?? {}, null, 2)}</pre>
      </section>
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
          <Route path="/studio" element={<StudioHome />} />
          <Route path="/studio/research" element={<StudioResearchPage />} />
          <Route path="/studio/research/:seriesId/:dossierId" element={<StudioResearchDetailPage />} />
          <Route path="/studio/runs" element={<StudioRunsPage />} />
          <Route path="/studio/decisions" element={<StudioDecisionsPage />} />
          <Route path="/studio/reviews" element={<StudioReviewsPage />} />
          <Route path="/studio/art" element={<StudioArtPage />} />
          <Route path="/series/:seriesId" element={<SeriesPage />} />
          <Route path="/series/:seriesId/studio" element={<StudioHome />} />
          <Route path="/series/:seriesId/book/:bookId" element={<BookPage />} />
          <Route path="/series/:seriesId/book/:bookId/studio" element={<StudioHome />} />
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
