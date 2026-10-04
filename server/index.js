// Express backend: handles Spotify login, keeps tokens off the browser, and serves chart data.
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const { createPkcePair, buildLoginUrl, exchangeCode, spotifyGet } = require("./spotify");
const { TtlCache } = require("./cache");
const { countGenres, listensByHour } = require("./analytics");

const PORT = process.env.PORT || 5001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://127.0.0.1:3000";
const TIME_RANGES = new Set(["short_term", "medium_term", "long_term"]);

// In-memory stores. Restarting the server logs everyone out, which is fine for a personal project.
const pendingLogins = new Map(); // state -> PKCE verifier, while the user is on Spotify's login page
const sessions = new Map(); // session id (cookie) -> { accessToken, refreshToken, expiresAt }
const cache = new TtlCache(5 * 60 * 1000); // remember Spotify responses for 5 minutes

const app = express();
app.use(cookieParser());

// ---- Login ----

app.get("/auth/login", (req, res) => {
  const { verifier, challenge } = createPkcePair();
  const state = crypto.randomUUID();
  pendingLogins.set(state, verifier);
  res.redirect(buildLoginUrl(challenge, state));
});

app.get("/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const verifier = pendingLogins.get(state);
  pendingLogins.delete(state);

  if (error || !code || !verifier) {
    return res.redirect(`${FRONTEND_URL}/?error=login_failed`);
  }

  try {
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, await exchangeCode(code, verifier));
    // httpOnly: JavaScript in the page can't read this cookie, so tokens can't be stolen by a script.
    res.cookie("sid", sessionId, { httpOnly: true, sameSite: "lax" });
    res.redirect(FRONTEND_URL);
  } catch (err) {
    console.error(err);
    res.redirect(`${FRONTEND_URL}/?error=login_failed`);
  }
});

app.post("/auth/logout", (req, res) => {
  sessions.delete(req.cookies.sid);
  res.clearCookie("sid");
  res.sendStatus(204);
});

// ---- API ----

function requireSession(req, res, next) {
  req.session = sessions.get(req.cookies.sid);
  if (!req.session) return res.status(401).json({ error: "not_logged_in" });
  next();
}

function readRange(req) {
  return TIME_RANGES.has(req.query.range) ? req.query.range : "medium_term";
}

// Same user + same Spotify path within 5 minutes -> answer from the cache, no Spotify call.
async function cachedGet(req, path) {
  const key = `${req.cookies.sid}:${path}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await spotifyGet(req.session, path);
  cache.set(key, data);
  return data;
}

// Wraps a route so any thrown error becomes a JSON error response.
const route = (handler) => async (req, res) => {
  try {
    res.json(await handler(req));
  } catch (err) {
    console.error(err);
    res.status(err.status === 401 ? 401 : 502).json({ error: err.message });
  }
};

app.get("/api/me", requireSession, route(async (req) => {
  const me = await cachedGet(req, "/me");
  return { name: me.display_name, image: me.images?.[0]?.url };
}));

app.get("/api/top-artists", requireSession, route(async (req) => {
  const data = await cachedGet(req, `/me/top/artists?limit=20&time_range=${readRange(req)}`);
  return data.items.map((a) => ({ name: a.name, popularity: a.popularity, genres: a.genres }));
}));

app.get("/api/top-tracks", requireSession, route(async (req) => {
  const data = await cachedGet(req, `/me/top/tracks?limit=20&time_range=${readRange(req)}`);
  return data.items.map((t) => ({ name: t.name, artist: t.artists[0]?.name, popularity: t.popularity }));
}));

// Reuses the top-artists request (same cache key), so this chart costs no extra Spotify call.
app.get("/api/genres", requireSession, route(async (req) => {
  const data = await cachedGet(req, `/me/top/artists?limit=20&time_range=${readRange(req)}`);
  return countGenres(data.items);
}));

app.get("/api/listening-hours", requireSession, route(async (req) => {
  const data = await cachedGet(req, "/me/player/recently-played?limit=50");
  return listensByHour(data.items.map((item) => item.played_at));
}));

app.get("/api/cache-stats", (req, res) => res.json(cache.stats()));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Backend running on http://127.0.0.1:${PORT}`));
}

module.exports = { app };
