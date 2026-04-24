import { FormEvent, startTransition, useEffect, useState } from "react";
import type { DashboardSnapshot, ScoredResult } from "./types";

const apiBase = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const dashboardEndpoint = `${apiBase}/api/dashboard`;
const triggerEndpoint = `${apiBase}/api/trigger`;

function formatDate(value: string | null): string {
  if (!value) {
    return "Pending";
  }
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPrice(value: number | null): string {
  if (value == null) {
    return "Unpriced";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

function scoreTone(score: number): string {
  if (score >= 8) return "score-hot";
  if (score >= 6.5) return "score-warm";
  return "score-cool";
}

function tripLength(result: ScoredResult): number {
  const start = new Date(`${result.flight.travel_window_start}T00:00:00Z`).getTime();
  const end = new Date(`${result.flight.travel_window_end}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
}

export default function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryDraft, setQueryDraft] = useState("");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(dashboardEndpoint);
      if (!response.ok) {
        throw new Error(`Dashboard request failed with ${response.status}`);
      }

      const data = (await response.json()) as DashboardSnapshot;
      startTransition(() => {
        setSnapshot(data);
        if (!queryDraft && data.active_query) {
          setQueryDraft(data.active_query);
        }
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!queryDraft.trim()) {
      setSubmitMessage("Enter a query before dispatching a run.");
      return;
    }

    setSubmitting(true);
    setSubmitMessage(null);

    try {
      const response = await fetch(triggerEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: queryDraft.trim() })
      });

      if (!response.ok) {
        throw new Error(`Trigger request failed with ${response.status}`);
      }

      setSubmitMessage("Query forwarded to the routine fire endpoint. Refresh after the pipeline writes new artifacts.");
    } catch (submitError) {
      setSubmitMessage(submitError instanceof Error ? submitError.message : "Unable to submit query.");
    } finally {
      setSubmitting(false);
    }
  }

  const metrics = snapshot?.metrics;
  const executionContext = snapshot?.execution_context;

  return (
    <main className="shell">
      <section className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">Atlas control deck</p>
          <h1>Flight scouting, scoring, and itinerary delivery in one view.</h1>
          <p className="lede">
            This frontend sits on top of the current Atlas backend artifacts. It reads pipeline state from
            <code> tmp/</code>, recent committed scans from <code>data/</code>, and uses the existing trigger route to
            queue new query-mode runs.
          </p>
        </div>

        <div className="hero-rail">
          <div className="metric-stack">
            <div className="metric-card accent-card">
              <span>Booking-ready</span>
              <strong>{metrics?.booking_ready_results ?? 0}</strong>
              <small>out of {metrics?.total_results ?? 0} scored candidates</small>
            </div>
            <div className="metric-card">
              <span>Cheapest viable fare</span>
              <strong>{formatPrice(metrics?.cheapest_price_eur ?? null)}</strong>
              <small>{metrics?.origin ? `origin ${metrics.origin}` : "origin unresolved"}</small>
            </div>
            <div className="metric-card">
              <span>Average score</span>
              <strong>{metrics?.average_score?.toFixed(2) ?? "0.00"}</strong>
              <small>{metrics?.opportunity_results ?? 0} opportunities flagged</small>
            </div>
          </div>
        </div>
      </section>

      <section className="grid">
        <article className="panel composer">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Dispatch</p>
              <h2>Send a new travel brief</h2>
            </div>
            <button className="ghost-button" type="button" onClick={() => void loadDashboard()}>
              Refresh board
            </button>
          </div>

          <form className="query-form" onSubmit={(event) => void handleSubmit(event)}>
            <label htmlFor="query">Query text</label>
            <textarea
              id="query"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="Example: 10-14 day surf trip in June from AGP, quiet beaches, under EUR 900"
              rows={5}
            />
            <div className="form-footer">
              <p>
                Current mode: <strong>{snapshot?.mode ?? "idle"}</strong>
              </p>
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Dispatching..." : "Dispatch query"}
              </button>
            </div>
          </form>

          <div className="status-strip">
            <div>
              <span className="strip-label">Last refresh</span>
              <strong>{formatDate(snapshot?.generated_at ?? null)}</strong>
            </div>
            <div>
              <span className="strip-label">Active request</span>
              <strong>{snapshot?.active_query ?? "No query staged"}</strong>
            </div>
          </div>

          {submitMessage ? <p className="inline-message">{submitMessage}</p> : null}
          {error ? <p className="inline-message error">{error}</p> : null}
          {loading ? <p className="inline-message">Loading dashboard snapshot...</p> : null}
        </article>

        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h2>Artifact status</h2>
            </div>
          </div>
          <div className="artifact-list">
            {snapshot?.pipeline.map((artifact) => (
              <div className={`artifact ${artifact.exists ? "artifact-live" : "artifact-empty"}`} key={artifact.key}>
                <div>
                  <p>{artifact.label}</p>
                  <strong>{artifact.relative_path}</strong>
                </div>
                <div className="artifact-meta">
                  <span>{artifact.exists ? "Ready" : "Waiting"}</span>
                  <span>{artifact.item_count == null ? "n/a" : `${artifact.item_count} items`}</span>
                  <span>{formatDate(artifact.updated_at)}</span>
                </div>
              </div>
            )) ?? <p className="muted">No pipeline artifacts detected yet.</p>}
          </div>
        </article>
      </section>

      <section className="grid results-grid">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ranking</p>
              <h2>Top scored trips</h2>
            </div>
          </div>
          <div className="results-list">
            {snapshot?.top_results.length ? (
              snapshot.top_results.map((result) => (
                <article className="result-card" key={result.flight.flight_id}>
                  <div className="route-row">
                    <div>
                      <p className="result-route">
                        {result.flight.origin} to {result.flight.destination_name}
                      </p>
                      <span className="result-window">
                        {result.flight.travel_window_start} to {result.flight.travel_window_end} | {tripLength(result)} days
                      </span>
                    </div>
                    <div className={`score-pill ${scoreTone(result.composite_score)}`}>
                      {result.composite_score.toFixed(1)}
                    </div>
                  </div>

                  <div className="result-facts">
                    <span>{formatPrice(result.flight.price_economy_eur)}</span>
                    <span>{result.flight.stops} stop(s)</span>
                    <span>{result.flight.travel_time_hours.toFixed(1)}h total</span>
                    <span>{result.annotation.crowd_level} crowds</span>
                  </div>

                  <p className="result-note">{result.annotation.personal_flag}</p>

                  <div className="tag-row">
                    {result.opportunity_flag ? <span className="tag hot">Opportunity</span> : null}
                    {result.annotation.distortion_flag ? <span className="tag muted">Distorted</span> : null}
                    <span className="tag">Weather {result.annotation.weather_score}/5</span>
                    <span className="tag">
                      Layover {result.flight.best_layover ?? "direct"}
                    </span>
                    {result.price_vs_baseline_pct != null ? (
                      <span className="tag">vs baseline {result.price_vs_baseline_pct}%</span>
                    ) : null}
                  </div>

                  <div className="result-footer">
                    <span>{result.flight.source}</span>
                    {result.flight.booking_url ? (
                      <a href={result.flight.booking_url} target="_blank" rel="noreferrer">
                        Open booking
                      </a>
                    ) : (
                      <span>No booking URL</span>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <p>No scored trips yet.</p>
                <span>Run `normalize`, `annotate`, and `format`, or dispatch a query once the routine is configured.</span>
              </div>
            )}
          </div>
        </article>

        <article className="panel dark-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Output</p>
              <h2>Telegram-ready itinerary</h2>
            </div>
          </div>
          <pre className="itinerary-block">{snapshot?.itinerary_text ?? "No itinerary has been formatted yet."}</pre>
        </article>
      </section>

      <section className="grid secondary-grid">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Context</p>
              <h2>Execution profile</h2>
            </div>
          </div>
          <div className="context-grid">
            <div className="context-card">
              <span>Trigger</span>
              <strong>{executionContext?.trigger_source ?? "unset"}</strong>
            </div>
            <div className="context-card">
              <span>Origin interface</span>
              <strong>{executionContext?.origin_interface ?? "unset"}</strong>
            </div>
            <div className="context-card">
              <span>Preferred origins</span>
              <strong>{executionContext?.user_context.preferred_origins.join(", ") || "None"}</strong>
            </div>
            <div className="context-card">
              <span>Budget cap</span>
              <strong>
                {executionContext?.user_context.max_budget_eur != null
                  ? formatPrice(executionContext.user_context.max_budget_eur)
                  : "Open"}
              </strong>
            </div>
          </div>

          <div className="tag-row spacious">
            {executionContext?.context_summary.map((item) => <span className="tag" key={item}>{item}</span>)}
            {executionContext?.user_context.preference_tags.map((item) => <span className="tag" key={item}>{item}</span>)}
            {executionContext?.user_context.destination_focus.map((item) => <span className="tag" key={item}>{item}</span>)}
          </div>

          <div className="filters-panel">
            <p className="filters-title">Hard filters</p>
            {snapshot?.hard_filters ? (
              <div className="filters-grid">
                <span>Stops &lt;= {snapshot.hard_filters.max_stops}</span>
                <span>Travel time &lt;= {snapshot.hard_filters.max_travel_time_hours}h</span>
                <span>Layover &lt;= {snapshot.hard_filters.max_layover_wait_hours}h</span>
                <span>Budget {formatPrice(snapshot.hard_filters.budget_economy_eur.min)} to {formatPrice(snapshot.hard_filters.budget_economy_eur.max)}</span>
                <span>Fallback origins {snapshot.hard_filters.fallback_origins.join(", ")}</span>
                <span>Lastminute window {snapshot.hard_filters.lastminute_window_days} days</span>
              </div>
            ) : (
              <p className="muted">No `config/hard_filters.json` found.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">History</p>
              <h2>Recent committed scans</h2>
            </div>
          </div>
          <div className="scan-list">
            {snapshot?.recent_scans.length ? (
              snapshot.recent_scans.map((scan) => (
                <div className="scan-row" key={scan.file_name}>
                  <div>
                    <p>{scan.scan_date} | {scan.run_mode}</p>
                    <strong>{scan.top_destination ?? "No top destination"}</strong>
                  </div>
                  <div className="scan-meta">
                    <span>{scan.origin_resolved}</span>
                    <span>{scan.booking_ready_count}/{scan.result_count} ready</span>
                    <span>{scan.itinerary_delivered ? "Delivered" : "Pending"}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No committed scan history yet.</p>
                <span>`annotate` will create `data/*.json` once the pipeline has input.</span>
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
