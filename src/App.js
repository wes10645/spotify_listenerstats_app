import { useState, useEffect } from "react"; // useState stores data, useEffect loads data
import { BACKEND_URL, NotLoggedInError, getJson, logout } from "./api";
import BarChart from "./components/BarChart";
import "./App.css";

// Spotify's three windows for "top" items
const RANGES = [
  { value: "short_term", label: "Last 4 weeks" },
  { value: "medium_term", label: "Last 6 months" },
  { value: "long_term", label: "Last year" },
];

function App() {
  const [user, setUser] = useState(null);
  const [loggedIn, setLoggedIn] = useState(null); // null = still checking
  const [range, setRange] = useState("medium_term");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // On page load, ask the backend whether we already have a session
  useEffect(() => {
    getJson("/api/me")
      .then((me) => {
        setUser(me);
        setLoggedIn(true);
      })
      .catch((err) => {
        setLoggedIn(false);
        if (!(err instanceof NotLoggedInError)) setError(err.message);
      });
  }, []);

  async function loadStats(selectedRange) {
    try {
      setLoading(true);
      setError(null);
      // fire all four requests at once instead of one after another
      const [artists, tracks, genres, hours] = await Promise.all([
        getJson(`/api/top-artists?range=${selectedRange}`),
        getJson(`/api/top-tracks?range=${selectedRange}`),
        getJson(`/api/genres?range=${selectedRange}`),
        getJson("/api/listening-hours"),
      ]);
      setStats({ artists, tracks, genres, hours });
    } catch (err) {
      if (err instanceof NotLoggedInError) setLoggedIn(false);
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // reload the charts whenever we log in or switch the time range
  useEffect(() => {
    if (loggedIn) loadStats(range);
  }, [loggedIn, range]);

  async function handleLogout() {
    await logout();
    setLoggedIn(false);
    setUser(null);
    setStats(null);
  }

  if (loggedIn === null) return <p className="page">checking login...</p>;

  if (!loggedIn) {
    return (
      <div className="page">
        <h1>Welcome To Wesley&apos;s Spotify Listening Stats!!!</h1>
        {error && <p className="error">{error}</p>}
        {/* full page redirect: the backend sends us to Spotify's login page */}
        <a className="button" href={`${BACKEND_URL}/auth/login`}>Log in with Spotify</a>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <h1>{user?.name ? `${user.name}'s` : "Your"} Listening Stats</h1>
        <button className="button" onClick={handleLogout}>Log out</button>
      </header>

      <div className="ranges">
        {RANGES.map((r) => (
          <button
            key={r.value}
            className={r.value === range ? "button active" : "button"}
            onClick={() => setRange(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading && <p>trying to load some stats...</p>}

      {error && (
        <div>
          <p className="error">{error}</p>
          <button className="button" onClick={() => loadStats(range)}>Retry</button>
        </div>
      )}

      {!loading && !error && stats && (
        <div className="charts">
          <BarChart title="Top genres" data={stats.genres} />
          <BarChart
            title="Top artists by popularity (0-100)"
            data={stats.artists.slice(0, 10).map((a) => ({ label: a.name, value: a.popularity }))}
          />
          <BarChart
            title="Top tracks by popularity (0-100)"
            data={stats.tracks.slice(0, 10).map((t) => ({ label: `${t.name} - ${t.artist}`, value: t.popularity }))}
          />
          <BarChart
            title="When you listen (last 50 plays, by hour)"
            data={stats.hours.map((h) => ({ label: `${h.label}:00`, value: h.value }))}
          />
        </div>
      )}
    </div>
  );
}

export default App;
