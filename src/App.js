import { useState, useEffect, useCallback, useRef } from "react"; // importing useState, which stores data and useEffect which loads data
import LandingPage from "./LandingPage";




// Spotify public client id: set REACT_APP_SPOTIFY_CLIENT_ID on Vercel (Production/Preview). Dev falls back below.
const CLIENT_ID =
  (process.env.REACT_APP_SPOTIFY_CLIENT_ID || "").trim() ||
  (process.env.NODE_ENV === "production"
    ? ""
    : "f7ad09fd2de94e8cb33658dd53dafd3d");
const REDIRECT_URI = window.location.origin;
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
// changing this for the new spotify authorization
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SCOPES = ["user-top-read", "user-read-recently-played"];

function formatMinutes(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function generateRandom(length) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await window.crypto.subtle.digest("SHA-256", data);
}

function base64urlencode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier) {
  return base64urlencode(await sha256(verifier));
}


function App() {
  // sets empty arrays for artist,
  const [artists, setArtists] = useState([]); // [{ id, name }]
  const [artistExtras, setArtistExtras] = useState({}); // { [artistId]: { topTracks: [], mood: { tempo, energy, valence } } }
  const [recentMinutes, setRecentMinutes] = useState(null); // minutes listened in selected window
  const [recentMinutesByArtist, setRecentMinutesByArtist] = useState({}); // { [artistId]: minutes } in selected window
  const [windowDays, setWindowDays] = useState(28); // 1..90 days, for recently-played pagination
  const [historyStats, setHistoryStats] = useState({ playsCount: 0, hitCap: false });
  const [loading, setLoading] = useState(false); // sets state for waiting for data
  const [error, setError] = useState(null);
  const [accessToken, setAccessToken] = useState("");
  const hasExchangedCodeRef = useRef(false);

  const hasSavedAuth =
    Boolean(accessToken) ||
    Boolean(localStorage.getItem("token")) ||
    Boolean(localStorage.getItem("refresh_token")) ||
    Boolean(localStorage.getItem("pkce_verifier"));

  async function exchangeCodeForToken(code) {
    const verifier = localStorage.getItem("pkce_verifier");

    if (!verifier) {
      setError("PKCE verifier missing — please log in again.");
      return;
    }

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          code_verifier: verifier,
        }).toString(),
      });

      if (!response.ok) {
        let details = "";
        try {
          const data = await response.json();
          details = data?.error
            ? `${data.error}${data.error_description ? `: ${data.error_description}` : ""}`
            : JSON.stringify(data);
        } catch {
          try {
            details = await response.text();
          } catch {
            details = "";
          }
        }

        throw new Error(
          `Token exchange failed (${response.status})${
            details ? ` — ${details}` : " — please log in again."
          }`
        );
      }

      const data = await response.json();

      localStorage.setItem("token", data.access_token);
      localStorage.removeItem("pkce_verifier");
      if (data.refresh_token) {
        localStorage.setItem("refresh_token", data.refresh_token);
      }

      // remove the code from the URL so a page refresh doesn't try to reuse it
      window.history.replaceState({}, "", "/");

      setAccessToken(data.access_token);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    // PKCE storage is origin-scoped. Force a single origin so the verifier survives redirects.
    // If you start on localhost but redirect_uri is 127.0.0.1, localStorage won't match.
    if (window.location.hostname === "localhost") {
      const { port, pathname, search, hash } = window.location;
      window.location.replace(`http://127.0.0.1:${port}${pathname}${search}${hash}`);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const storedToken = window.localStorage.getItem("token");

    // If we got redirected back with a code, ALWAYS exchange it (switch-account flow).
    if (code) {
      // In React dev (StrictMode) effects may run twice; auth codes are single-use.
      if (hasExchangedCodeRef.current) return;
      hasExchangedCodeRef.current = true;

      // Remove the code immediately to avoid reuse on refresh/back/forward.
      window.history.replaceState({}, "", "/");

      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      setAccessToken("");
      exchangeCodeForToken(code);
      return;
    }

    if (storedToken) {
      setAccessToken(storedToken);
    }
  }, []);

  const fetchWindowStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setArtistExtras({});
      setRecentMinutes(null);
      setRecentMinutesByArtist({});
      setHistoryStats({ playsCount: 0, hitCap: false });
      setArtists([]);

      const maxDays = 90;
      const days = Math.max(1, Math.min(maxDays, Number(windowDays) || 28));
      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

      // Paginate recently-played backwards until cutoff or no more data.
      const collected = [];
      let before = Date.now();
      let pages = 0;
      // If you listen a lot, 2000 plays might not cover longer windows. Raise the cap but keep it bounded.
      const maxPages = 200; // 200 * 50 = 10,000 plays max

      while (pages < maxPages) {
        const url = `https://api.spotify.com/v1/me/player/recently-played?limit=50&before=${before}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          let details = "";
          try {
            const data = await res.json();
            details = data?.error?.message
              ? data.error.message
              : JSON.stringify(data);
          } catch {
            try {
              details = await res.text();
            } catch {
              details = "";
            }
          }

          if (res.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("pkce_verifier");
            setAccessToken("");
          }

          throw new Error(
            `failed to fetch listening history (${res.status})${
              details ? ` — ${details}` : ""
            }`
          );
        }

        const data = await res.json();
        const items = data.items ?? [];
        if (items.length === 0) break;

        pages += 1;

        for (const item of items) {
          const playedAtMs = item?.played_at ? Date.parse(item.played_at) : null;
          if (!playedAtMs) continue;
          if (playedAtMs < cutoffMs) continue;
          collected.push(item);
        }

        const oldestPlayedAtMs = items
          .map((it) => (it?.played_at ? Date.parse(it.played_at) : Infinity))
          .reduce((min, v) => Math.min(min, v), Infinity);

        if (!Number.isFinite(oldestPlayedAtMs)) break;
        if (oldestPlayedAtMs < cutoffMs) break;
        before = oldestPlayedAtMs - 1;
      }

      setHistoryStats({ playsCount: collected.length, hitCap: pages >= maxPages });

      if (collected.length === 0) {
        setRecentMinutes(0);
        setArtists([]);
        return;
      }

      const artistMap = new Map();
      let totalMs = 0;

      for (const item of collected) {
        const track = item?.track;
        const dur = track?.duration_ms ?? 0;
        const primaryArtist = track?.artists?.[0];
        const artistId = primaryArtist?.id;
        const artistName = primaryArtist?.name;
        const trackId = track?.id;
        const trackName = track?.name;

        if (!artistId || !artistName || !trackId || !trackName) continue;

        totalMs += dur;

        if (!artistMap.has(artistId)) {
          artistMap.set(artistId, {
            id: artistId,
            name: artistName,
            ms: 0,
            tracks: new Map(), // trackId -> { id, name, ms, plays }
          });
        }
        const a = artistMap.get(artistId);
        a.ms += dur;
        if (!a.tracks.has(trackId)) {
          a.tracks.set(trackId, { id: trackId, name: trackName, ms: 0, plays: 0 });
        }
        const t = a.tracks.get(trackId);
        t.ms += dur;
        t.plays += 1;
      }

      setRecentMinutes(formatMinutes(totalMs));

      const minutesByArtistId = Object.fromEntries(
        Array.from(artistMap.values()).map((a) => [a.id, formatMinutes(a.ms)])
      );
      setRecentMinutesByArtist(minutesByArtistId);

      const rankedArtists = Array.from(artistMap.values())
        .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name))
        .slice(0, 10)
        .map((a) => ({ id: a.id, name: a.name }));
      setArtists(rankedArtists);

      const extrasEntries = await Promise.all(
        rankedArtists.map(async (artist) => {
          const a = artistMap.get(artist.id);
          const topTracks = Array.from(a?.tracks?.values?.() ?? [])
            .sort((x, y) => y.ms - x.ms || y.plays - x.plays)
            .slice(0, 5)
            .map((t) => ({ id: t.id, name: t.name }));

          const ids = topTracks.map((t) => t.id).filter(Boolean);
          if (ids.length === 0) return [artist.id, { topTracks: [], mood: null }];

          const featuresRes = await fetch(
            `https://api.spotify.com/v1/audio-features?ids=${encodeURIComponent(
              ids.join(",")
            )}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!featuresRes.ok) return [artist.id, { topTracks, mood: null }];

          const featuresData = await featuresRes.json();
          const feats = (featuresData.audio_features ?? []).filter(Boolean);
          if (feats.length === 0) return [artist.id, { topTracks, mood: null }];

          const avg = (arr, key) =>
            arr.reduce((s, x) => s + (Number(x[key]) || 0), 0) / arr.length;

          const tempo = Math.round(avg(feats, "tempo"));
          const energy = clamp01(avg(feats, "energy"));
          const valence = clamp01(avg(feats, "valence"));

          return [artist.id, { topTracks, mood: { tempo, energy, valence } }];
        })
      );

      setArtistExtras(Object.fromEntries(extrasEntries));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, windowDays]);

  useEffect(() => {
    if (accessToken) fetchWindowStats();
  }, [accessToken, fetchWindowStats]);

  async function handleLogin() {
    if (!CLIENT_ID) {
      window.alert(
        "Missing REACT_APP_SPOTIFY_CLIENT_ID. In Vercel: Project → Settings → Environment Variables → add it for Production (and Preview), then redeploy."
      );
      return;
    }
    const verifier = generateRandom(128);
    const challenge = await generateCodeChallenge(verifier);
    localStorage.setItem("pkce_verifier", verifier);

    const loginUrl =
      `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(SCOPES.join(" "))}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${challenge}` +
      `&show_dialog=true`;

    window.location.href = loginUrl;
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("pkce_verifier");
    setAccessToken("");
    setArtists([]);
    setError(null);
    window.history.replaceState({}, "", "/");
  }

  const styles = {
    page: {
      minHeight: "100vh",
      background: "black",
      color: "white",
      fontFamily: "sans-serif",
      padding: "2rem 1.25rem",
    },
    title: {
      fontSize: "2.25rem",
      margin: "0 0 1.25rem",
      textShadow: "0 0 30px #1DB954",
    },
    panel: {
      maxWidth: 900,
      margin: "0 auto",
    },
    row: {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.75rem",
      alignItems: "center",
      marginBottom: "1rem",
    },
    button: {
      backgroundColor: "#1DB954",
      color: "black",
      border: "none",
      padding: "10px 18px",
      borderRadius: "999px",
      fontSize: "0.95rem",
      fontWeight: 700,
      cursor: "pointer",
    },
    buttonSecondary: {
      backgroundColor: "transparent",
      color: "white",
      border: "1px solid rgba(29,185,84,0.8)",
      padding: "10px 18px",
      borderRadius: "999px",
      fontSize: "0.95rem",
      fontWeight: 700,
      cursor: "pointer",
    },
    select: {
      background: "rgba(255,255,255,0.06)",
      color: "white",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 12,
      padding: "8px 10px",
      outline: "none",
    },
    hint: {
      color: "rgba(255,255,255,0.75)",
      margin: 0,
    },
    error: {
      color: "#ff5a5a",
      margin: 0,
      fontWeight: 600,
    },
    list: {
      listStyle: "none",
      padding: 0,
      margin: "1rem 0 0",
      display: "grid",
      gap: "0.75rem",
    },
    card: {
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      borderRadius: 16,
      padding: "1rem",
    },
    artistName: {
      color: "white",
      fontSize: "1.1rem",
      textShadow: "0 0 16px rgba(29,185,84,0.75)",
    },
    sectionLabel: {
      color: "rgba(255,255,255,0.85)",
      marginTop: "0.5rem",
      marginBottom: "0.25rem",
      fontWeight: 700,
    },
    subList: {
      margin: "0.25rem 0 0 1.25rem",
    },
  };

  return (
    !accessToken ? (
      <LandingPage onLogin={handleLogin} />
    ) : (
    <div style={styles.page}>
      <div style={styles.panel}>
      <h1 style={styles.title}>Wesley&apos;s Spotify Listening Stats</h1>

      {hasSavedAuth && (
        <div style={styles.row}>
          <button onClick={handleLogout} style={styles.buttonSecondary}>
            Log out / Switch account
          </button>
        </div>
      )}

      <div style={styles.row}>
        <label>
          Time window:{" "}
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            disabled={!accessToken || loading}
            style={styles.select}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={28}>Last 28 days</option>
            <option value={56}>Last 8 weeks</option>
            <option value={90}>Last 90 days (max)</option>
          </select>
        </label>{" "}
        <button
          onClick={fetchWindowStats}
          disabled={!accessToken || loading}
          style={styles.button}
        >
          Refresh
        </button>
      </div>

      {!accessToken && (
        <button onClick={handleLogin} style={styles.button}>
          Log in with Spotify
        </button>
      )}

      {loading && <p style={styles.hint}>trying to load some stats...</p>}

      {recentMinutes !== null && !loading && !error && accessToken && (
        <div>
          <p>
            Time listened (last {windowDays} days): {recentMinutes}
          </p>
          <p style={styles.hint}>
            Plays counted: {historyStats.playsCount}
            {historyStats.hitCap ? " (hit history cap — may be undercounted)" : ""}
          </p>
        </div>
      )}

      {error && (
        <div style={{ marginTop: "1rem" }}>
          <p style={styles.error}>{error}</p>
          {error === "PKCE verifier missing — please log in again." ? (
            <button onClick={handleLogin} style={styles.button}>
              Log in again
            </button>
          ) : (
            <button onClick={fetchWindowStats} style={styles.button}>
              Retry
            </button>
          )}
        </div>
      )}

      {!loading && !error && accessToken && (
        <ul style={styles.list}>
          {artists.map((artist) => {
            const extras = artistExtras[artist.id];
            const mood = extras?.mood;
            const minutes = recentMinutesByArtist[artist.id];
            return (
              <li key={artist.id} style={styles.card}>
                <div style={styles.artistName}>{artist.name}</div>
                {minutes ? <div style={styles.hint}>Time listened: {minutes}</div> : null}
                {extras?.topTracks?.length ? (
                  <div>
                    <div style={styles.sectionLabel}>Top tracks</div>
                    <ol style={styles.subList}>
                      {extras.topTracks.map((t) => (
                        <li key={t.id}>{t.name}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {mood ? (
                  <div>
                    <div style={styles.sectionLabel}>Audio vibe</div>
                    <div style={styles.hint}>
                      Mood: valence {Math.round(mood.valence * 100)}% · energy{" "}
                      {Math.round(mood.energy * 100)}%
                    </div>
                    <div style={styles.hint}>Speed: {mood.tempo} BPM</div>
                    <div style={styles.hint}>
                      Intensity: {Math.round(mood.energy * 100)} (from energy)
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
    )
  );
}

export default App;