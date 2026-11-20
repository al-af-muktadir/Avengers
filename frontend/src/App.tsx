import { useEffect, useMemo, useState } from "react";
import { api } from "./services/api";
import "./App.css";

type Movie = {
  id: string;
  title: string;
  releaseYear: number;
  runtimeMinutes: number;
  watched: boolean;
  prerequisiteIds?: string[];
};

type Cinema = {
  id: string;
  name: string;
  bundleSizes: number[];
};

type BookingQuote = {
  possible: boolean;
  groupSize: number;
  totalBundles?: number;
  bundles?: { bundleSize: number; count: number }[];
  message?: string;
};

type Tab = "movies" | "rewatch" | "booking";

function normalizeMovie(movie: any): Movie {
  return {
    id: movie.id,
    title: movie.title,
    releaseYear: Number(movie.releaseYear ?? movie.release_year),
    runtimeMinutes: Number(movie.runtimeMinutes ?? movie.runtime_minutes),
    watched: Boolean(movie.watched),
    prerequisiteIds: movie.prerequisiteIds ?? movie.prerequisite_ids ?? [],
  };
}

function App() {
  const [tab, setTab] = useState<Tab>("movies");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [title, setTitle] = useState("");
  const [releaseYear, setReleaseYear] = useState(2026);
  const [runtime, setRuntime] = useState(120);
  const [prerequisites, setPrerequisites] = useState<string[]>([]);

  const [targetId, setTargetId] = useState("");
  const [rewatchMovies, setRewatchMovies] = useState<Movie[]>([]);
  const [rewatchLoading, setRewatchLoading] = useState(false);

  const [cinemaId, setCinemaId] = useState("");
  const [groupSize, setGroupSize] = useState(6);
  const [quote, setQuote] = useState<BookingQuote | null>(null);

  const [cinemaName, setCinemaName] = useState("");
  const [bundleSizes, setBundleSizes] = useState("1, 2, 3, 4");

  const [editingPrerequisites, setEditingPrerequisites] = useState<
    Record<string, string[]>
  >({});

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [movieData, cinemaData] = await Promise.all([
        api.get<any[]>("/movies"),
        api.get<Cinema[]>("/cinemas"),
      ]);

      const normalizedMovies = movieData.map(normalizeMovie);
      setMovies(normalizedMovies);
      setCinemas(cinemaData);

      if (!targetId && normalizedMovies.length) {
        setTargetId(normalizedMovies[normalizedMovies.length - 1].id);
      }

      if (!cinemaId && cinemaData.length) {
        setCinemaId(cinemaData[0].id);
      }

      setEditingPrerequisites(
        Object.fromEntries(
          normalizedMovies.map((movie) => [
            movie.id,
            movie.prerequisiteIds ?? [],
          ]),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load application data",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const watchedCount = movies.filter((movie) => movie.watched).length;
  const progress = movies.length
    ? Math.round((watchedCount / movies.length) * 100)
    : 0;

  const totalRuntime = useMemo(
    () => movies.reduce((total, movie) => total + movie.runtimeMinutes, 0),
    [movies],
  );

  async function addMovie(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      await api.post("/movies", {
        title,
        releaseYear,
        runtimeMinutes: runtime,
        prerequisiteIds: prerequisites,
      });

      setTitle("");
      setPrerequisites([]);
      setSuccess("Movie added to your universe.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add movie");
    }
  }

  async function toggleWatched(movie: Movie) {
    setError("");

    try {
      await api.patch(`/movies/${movie.id}`, {
        watched: !movie.watched,
      });

      await loadData();
      setSuccess(`${movie.title} updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update movie");
    }
  }

  async function savePrerequisites(movie: Movie) {
    setError("");

    try {
      await api.patch(`/movies/${movie.id}`, {
        prerequisiteIds: editingPrerequisites[movie.id] ?? [],
      });

      await loadData();
      setSuccess(`Prerequisites updated for ${movie.title}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update prerequisites",
      );
    }
  }

  async function loadRewatchPlan(id: string) {
    if (!id) return;

    setTargetId(id);
    setRewatchLoading(true);
    setRewatchMovies([]);
    setError("");

    try {
      const result = await api.get<any>(`/movies/${id}/rewatch-order`);

      const list = Array.isArray(result)
        ? result
        : (result.movies ??
          result.order ??
          result.rewatchOrder ??
          result.prerequisites ??
          []);

      setRewatchMovies(list.map(normalizeMovie));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load rewatch plan",
      );
    } finally {
      setRewatchLoading(false);
    }
  }

  async function getBookingQuote(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setQuote(null);

    try {
      const result = await api.get<BookingQuote>(
        `/cinemas/${cinemaId}/booking?groupSize=${groupSize}`,
      );
      setQuote(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not calculate booking",
      );
    }
  }

  async function addCinema(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    try {
      await api.post("/cinemas", {
        name: cinemaName,
        bundleSizes: bundleSizes
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isInteger(value) && value > 0),
      });

      setCinemaName("");
      setSuccess("Cinema added successfully.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add cinema");
    }
  }

  const targetMovie = movies.find((movie) => movie.id === targetId);
  const planWatched = rewatchMovies.filter((movie) => movie.watched).length;
  const planProgress = rewatchMovies.length
    ? Math.round((planWatched / rewatchMovies.length) * 100)
    : 0;
  const remainingMinutes = rewatchMovies
    .filter((movie) => !movie.watched)
    .reduce((total, movie) => total + movie.runtimeMinutes, 0);

  function formatRuntime(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours ? `${hours}h ${mins}m` : `${mins}m`;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={() => setTab("movies")}>
          <span className="brand-mark">D</span>
          <span>
            DOOMSDAY<span className="brand-light"> READY</span>
          </span>
        </a>
        <div className="topbar-status">
          <span className="status-dot" /> UNIVERSE DATABASE ONLINE
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-content">
            <div className="eyebrow">THE COUNTDOWN BEGINS</div>
            <h1>
              PREPARE FOR
              <br />
              <span>DOOMSDAY.</span>
            </h1>
            <p>
              Every story. Every connection. Every moment. Build your ultimate
              rewatch mission before the next big event.
            </p>
            <button
              className="primary-button"
              onClick={() => setTab("rewatch")}
            >
              BUILD YOUR REWATCH PLAN <span>→</span>
            </button>
          </div>
          <div className="hero-art">
            <div className="hero-ring ring-one" />
            <div className="hero-ring ring-two" />
            <div className="hero-core">D</div>
            <div className="hero-caption">
              ONE UNIVERSE
              <br />
              ONE FINAL MISSION
            </div>
          </div>
          <div className="hero-index">01 / 03</div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">MOVIES IN YOUR UNIVERSE</span>
            <strong>{movies.length.toString().padStart(2, "0")}</strong>
            <span className="stat-foot">TOTAL TITLES</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">MISSIONS COMPLETED</span>
            <strong>{watchedCount.toString().padStart(2, "0")}</strong>
            <span className="stat-foot">MOVIES WATCHED</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">UNIVERSE PROGRESS</span>
            <strong>{progress}%</strong>
            <div className="mini-progress">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">TOTAL SCREEN TIME</span>
            <strong>{formatRuntime(totalRuntime)}</strong>
            <span className="stat-foot">FULL COLLECTION</span>
          </div>
        </section>

        <nav className="main-nav">
          <button
            className={tab === "movies" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("movies")}
          >
            <span>01</span> MOVIE ARCHIVE
          </button>
          <button
            className={tab === "rewatch" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("rewatch")}
          >
            <span>02</span> REWATCH MISSION
          </button>
          <button
            className={tab === "booking" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("booking")}
          >
            <span>03</span> WATCH PARTY
          </button>
        </nav>

        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        {loading ? (
          <div className="loading">LOADING UNIVERSE DATA...</div>
        ) : (
          <>
            {tab === "movies" && (
              <section className="section-content">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">THE COMPLETE COLLECTION</div>
                    <h2>MOVIE ARCHIVE</h2>
                  </div>
                  <span className="section-count">{movies.length} TITLES</span>
                </div>

                <div className="content-grid">
                  <div className="panel add-panel">
                    <div className="panel-kicker">ADD TO THE TIMELINE</div>
                    <h3>New Movie</h3>
                    <form onSubmit={addMovie} className="form-stack">
                      <label>
                        Movie title
                        <input
                          required
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Enter movie title"
                        />
                      </label>
                      <div className="two-fields">
                        <label>
                          Release year
                          <input
                            type="number"
                            min="1888"
                            max="2100"
                            value={releaseYear}
                            onChange={(e) =>
                              setReleaseYear(Number(e.target.value))
                            }
                            required
                          />
                        </label>
                        <label>
                          Runtime (min)
                          <input
                            type="number"
                            min="1"
                            max="300"
                            value={runtime}
                            onChange={(e) => setRuntime(Number(e.target.value))}
                            required
                          />
                        </label>
                      </div>
                      <label>
                        Prerequisite movies
                        <select
                          multiple
                          value={prerequisites}
                          onChange={(e) =>
                            setPrerequisites(
                              Array.from(
                                e.target.selectedOptions,
                                (option) => option.value,
                              ),
                            )
                          }
                        >
                          {movies.map((movie) => (
                            <option key={movie.id} value={movie.id}>
                              {movie.title}
                            </option>
                          ))}
                        </select>
                        <small>
                          Hold Ctrl (Windows) to select multiple movies.
                        </small>
                      </label>
                      <button
                        className="primary-button full-button"
                        type="submit"
                      >
                        + ADD MOVIE
                      </button>
                    </form>
                  </div>

                  <div className="movie-list">
                    {movies.map((movie, index) => (
                      <article className="movie-card" key={movie.id}>
                        <div className="movie-number">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="movie-info">
                          <h3>{movie.title}</h3>
                          <p>
                            {movie.releaseYear} <span>•</span>{" "}
                            {movie.runtimeMinutes} MIN
                          </p>
                          <label className="prereq-editor">
                            <span>PREREQUISITES</span>
                            <select
                              multiple
                              value={editingPrerequisites[movie.id] ?? []}
                              onChange={(e) =>
                                setEditingPrerequisites((current) => ({
                                  ...current,
                                  [movie.id]: Array.from(
                                    e.target.selectedOptions,
                                    (option) => option.value,
                                  ),
                                }))
                              }
                            >
                              {movies
                                .filter(
                                  (candidate) => candidate.id !== movie.id,
                                )
                                .map((candidate) => (
                                  <option
                                    key={candidate.id}
                                    value={candidate.id}
                                  >
                                    {candidate.title}
                                  </option>
                                ))}
                            </select>
                            <button
                              className="text-button"
                              onClick={() => savePrerequisites(movie)}
                            >
                              SAVE PREREQUISITES
                            </button>
                          </label>
                        </div>
                        <button
                          className={
                            movie.watched
                              ? "watched-button done"
                              : "watched-button"
                          }
                          onClick={() => toggleWatched(movie)}
                        >
                          {movie.watched ? "✓ WATCHED" : "MARK WATCHED"}
                        </button>
                      </article>
                    ))}
                    {!movies.length && (
                      <div className="empty-state">
                        Your movie archive is empty. Add your first movie.
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {tab === "rewatch" && (
              <section className="section-content">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">YOUR NEXT MISSION</div>
                    <h2>REWATCH PROTOCOL</h2>
                  </div>
                  <span className="section-count">CHRONOLOGY ENGINE</span>
                </div>

                <div className="panel target-panel">
                  <label>
                    SELECT YOUR TARGET MOVIE
                    <select
                      value={targetId}
                      onChange={(e) => void loadRewatchPlan(e.target.value)}
                    >
                      <option value="">Choose a target movie</option>
                      {movies.map((movie) => (
                        <option key={movie.id} value={movie.id}>
                          {movie.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {targetMovie && (
                    <div className="target-name">
                      MISSION TARGET: <strong>{targetMovie.title}</strong>
                    </div>
                  )}
                </div>

                {rewatchLoading ? (
                  <div className="loading">CALCULATING TIMELINE...</div>
                ) : (
                  <>
                    <div className="plan-summary">
                      <div className="summary-card">
                        <span>PREREQUISITE MOVIES</span>
                        <strong>{rewatchMovies.length}</strong>
                      </div>
                      <div className="summary-card">
                        <span>COMPLETED</span>
                        <strong>
                          {planWatched} / {rewatchMovies.length}
                        </strong>
                      </div>
                      <div className="summary-card">
                        <span>TIME REMAINING</span>
                        <strong>{formatRuntime(remainingMinutes)}</strong>
                      </div>
                    </div>

                    <div className="panel progress-panel">
                      <div className="progress-top">
                        <span>MISSION PROGRESS</span>
                        <strong>{planProgress}%</strong>
                      </div>
                      <div className="large-progress">
                        <span style={{ width: `${planProgress}%` }} />
                      </div>
                    </div>

                    <div className="timeline">
                      {rewatchMovies.map((movie, index) => (
                        <div className="timeline-item" key={movie.id}>
                          <div
                            className={
                              movie.watched
                                ? "timeline-marker complete"
                                : "timeline-marker"
                            }
                          >
                            {movie.watched
                              ? "✓"
                              : String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="timeline-card">
                            <div>
                              <span className="timeline-step">
                                WATCH ORDER {String(index + 1).padStart(2, "0")}
                              </span>
                              <h3>{movie.title}</h3>
                              <p>
                                {movie.releaseYear} ·{" "}
                                {formatRuntime(movie.runtimeMinutes)}
                              </p>
                            </div>
                            <span
                              className={
                                movie.watched
                                  ? "movie-status complete-text"
                                  : "movie-status"
                              }
                            >
                              {movie.watched ? "COMPLETED" : "PENDING"}
                            </span>
                          </div>
                        </div>
                      ))}
                      {targetId && !rewatchMovies.length && (
                        <div className="empty-state">
                          No prerequisite movies found. This target may be the
                          beginning of your timeline.
                        </div>
                      )}
                      {!targetId && (
                        <div className="empty-state">
                          Choose a target movie to generate your rewatch order.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}

            {tab === "booking" && (
              <section className="section-content">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">ASSEMBLE YOUR SQUAD</div>
                    <h2>WATCH PARTY HQ</h2>
                  </div>
                  <span className="section-count">OPENING NIGHT PLANNER</span>
                </div>

                <div className="content-grid booking-grid">
                  <div className="panel">
                    <div className="panel-kicker">PLAN YOUR SCREENING</div>
                    <h3>Find Your Bundle Plan</h3>
                    <form onSubmit={getBookingQuote} className="form-stack">
                      <label>
                        Select cinema
                        <select
                          required
                          value={cinemaId}
                          onChange={(e) => setCinemaId(e.target.value)}
                        >
                          <option value="">Choose a cinema</option>
                          {cinemas.map((cinema) => (
                            <option key={cinema.id} value={cinema.id}>
                              {cinema.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Number of guests
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          required
                          value={groupSize}
                          onChange={(e) => setGroupSize(Number(e.target.value))}
                        />
                      </label>
                      <button
                        className="primary-button full-button"
                        type="submit"
                        disabled={!cinemaId}
                      >
                        CALCULATE BUNDLES →
                      </button>
                    </form>

                    {quote && (
                      <div className="quote-result">
                        {quote.possible ? (
                          <>
                            <div className="quote-success">
                              EXACT COMBINATION FOUND
                            </div>
                            <div className="quote-total">
                              {quote.totalBundles}
                              <small> TOTAL BUNDLES</small>
                            </div>
                            {quote.bundles?.map((bundle) => (
                              <div
                                className="bundle-row"
                                key={bundle.bundleSize}
                              >
                                <span>{bundle.bundleSize}-SEAT BUNDLE</span>
                                <strong>× {bundle.count}</strong>
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="quote-impossible">
                            <strong>NO EXACT COMBINATION</strong>
                            <p>
                              {quote.message ??
                                "This cinema cannot accommodate this group size exactly."}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="panel cinema-panel">
                    <div className="panel-kicker">EXPAND YOUR OPTIONS</div>
                    <h3>Register a Cinema</h3>
                    <form onSubmit={addCinema} className="form-stack">
                      <label>
                        Cinema name
                        <input
                          required
                          value={cinemaName}
                          onChange={(e) => setCinemaName(e.target.value)}
                          placeholder="e.g. Stark Cinemas"
                        />
                      </label>
                      <label>
                        Bundle sizes
                        <input
                          required
                          value={bundleSizes}
                          onChange={(e) => setBundleSizes(e.target.value)}
                          placeholder="1, 2, 3, 4"
                        />
                        <small>
                          Enter 1–10 distinct bundle sizes, separated by commas.
                        </small>
                      </label>
                      <button
                        className="secondary-button full-button"
                        type="submit"
                      >
                        + REGISTER CINEMA
                      </button>
                    </form>
                    <div className="cinema-directory">
                      <div className="directory-title">CINEMA DIRECTORY</div>
                      {cinemas.map((cinema) => (
                        <div className="cinema-row" key={cinema.id}>
                          <strong>{cinema.name}</strong>
                          <span>
                            {cinema.bundleSizes?.join(" / ") ?? "Bundle sizes"}
                          </span>
                        </div>
                      ))}
                      {!cinemas.length && (
                        <small>No cinemas registered yet.</small>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer>
        <span>DOOMSDAY READY</span>
        <span>THE UNIVERSE IS IN YOUR HANDS.</span>
        <span>FULL STACK ASSESSMENT · 2027</span>
      </footer>
    </div>
  );
}

export default App;
