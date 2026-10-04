// Express backend: handles Spotify login, keeps tokens away from page JavaScript, and serves chart data.
// Runs locally through server/index.js and on Vercel through api/index.js.
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const { createPkcePair, buildLoginUrl, exchangeCode, spotifyGet } = require("./spotify");
const { TtlCache } = require("./cache");
const { countGenres, listensByHour } = require("./analytics");
const { seal, unseal } = require("./session");

const ON_VERCEL = process.env.VERCEL === "1";

// Locally the frontend (port 3000) and backend (port 5001) are separate.
// On Vercel both live on the same site, so the URLs come from the request's own address.
const frontendUrl = (req) => (ON_VERCEL ? `${req.protocol}://${req.get("host")}` : "http://127.0.0.1:3000");
const redirectUri = (req) =>
  ON_VERCEL ? `${req.protocol}://${req.get("host")}/auth/callback` : "http://127.0.0.1:5001/auth/callback";
const TIME_RANGES = new Set(["short_term", "medium_term", "long_term"]);

// httpOnly: page JavaScript can't read these cookies. secure: HTTPS only (on Vercel).
const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", secure: ON_VERCEL, path: "/" };

// Remembers Spotify responses for 5 minutes. On Vercel each running instance has its own copy,
// so this is best-effort there: it helps when requests land on a warm instance.
const cache = new TtlCache(5 * 60 * 1000);

const app = express();
app.set("trust proxy", true); // Vercel sits in front of us; trust its https and host headers
app.use(cookieParser());

// ---- Login ----

app.get("/auth/login", (req, res) => {
  const { verifier, challenge } = createPkcePair();
  const state = crypto.randomUUID();
  // Remember the verifier and state for 10 minutes while the user is on Spotify's login page
  res.cookie("pkce", seal({ verifier, state }), { ...COOKIE_OPTIONS, maxAge: 10 * 60 * 1000 });
  res.redirect(buildLoginUrl(challenge, state, redirectUri(req)));
});

app.get("/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const pending = unseal(req.cookies.pkce);
  res.clearCookie("pkce", COOKIE_OPTIONS);

  // state must match the one we made, or someone forged this login
  if (error || !code || !pending || pending.state !== state) {
    return res.redirect(`${frontendUrl(req)}/?error=login_failed`);
  }

  try {
    const tokens = await exchangeCode(code, pending.verifier, redirectUri(req));
    res.cookie("session", seal(tokens), { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect(frontendUrl(req));
  } catch (err) {
    console.error(err);
    res.redirect(`${frontendUrl(req)}/?error=login_failed`);
  }
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("session", COOKIE_OPTIONS);
  res.sendStatus(204);
});

// ---- API ----

function requireSession(req, res, next) {
  req.session = unseal(req.cookies.session);
  if (!req.session) return res.status(401).json({ error: "not_logged_in" });
  next();
}

function readRange(req) {
  return TIME_RANGES.has(req.query.range) ? req.query.range : "medium_term";
}

// Same user + same Spotify path within 5 minutes -> answer from the cache, no Spotify call.
// The key uses a hash of the refresh token, so users never share cached data.
async function cachedGet(req, path) {
  const user = crypto.createHash("sha256").update(req.session.refreshToken || "").digest("hex");
  const key = `${user}:${path}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await spotifyGet(req.session, path);
  cache.set(key, data);
  return data;
}

// Wraps a route: sends the result as JSON, turns errors into JSON errors,
// and re-saves the session cookie if the access token was refreshed.
const route = (handler) => async (req, res) => {
  const tokenBefore = req.session.accessToken;
  try {
    const result = await handler(req);
    if (req.session.accessToken !== tokenBefore) {
      res.cookie("session", seal(req.session), { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });
    }
    res.json(result);
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

module.exports = app;
