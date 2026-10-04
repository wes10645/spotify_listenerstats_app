// Everything that talks to Spotify: login URLs, token exchange, token refresh, API calls.
const crypto = require("crypto");

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "f7ad09fd2de94e8cb33658dd53dafd3d";
const REDIRECT_URI = process.env.REDIRECT_URI || "http://127.0.0.1:5001/auth/callback";
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
const SCOPES = ["user-top-read", "user-read-recently-played"];

// PKCE: a random secret (verifier) and its SHA-256 hash (challenge).
// crypto.randomBytes is cryptographically secure, unlike Math.random.
function createPkcePair() {
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function buildLoginUrl(challenge, state) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state, // random value we check on the way back, to block forged logins
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

// Spotify returns { access_token, refresh_token?, expires_in } -> our session shape.
// A refresh response may omit refresh_token, in which case we keep the old one.
function toTokens(data, previousRefreshToken) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previousRefreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function postToken(body) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  if (!response.ok) {
    throw new Error(`Spotify token request failed (${response.status})`);
  }
  return response.json();
}

async function exchangeCode(code, verifier) {
  const data = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  return toTokens(data);
}

// Access tokens last one hour. Refresh a minute early so a request never uses a dead token.
async function ensureFreshToken(session) {
  if (session.expiresAt - 60_000 > Date.now()) return;
  const data = await postToken({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });
  Object.assign(session, toTokens(data, session.refreshToken));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET a Spotify API path for this user. If Spotify says "slow down" (429),
// wait as long as its Retry-After header asks, then try once more.
async function spotifyGet(session, path) {
  await ensureFreshToken(session);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (response.status === 429 && attempt === 0) {
      const waitSeconds = Number(response.headers.get("Retry-After")) || 1;
      await sleep(waitSeconds * 1000);
      continue;
    }
    if (!response.ok) {
      const error = new Error(`Spotify API error (${response.status}) on ${path}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
}

module.exports = { createPkcePair, buildLoginUrl, exchangeCode, ensureFreshToken, spotifyGet, toTokens };
