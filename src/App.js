import { useState, useEffect } from "react"; // importing useState, which stores data and useEffect which loads data




// im starting to implement the authorization for spotify
const CLIENT_ID = "f7ad09fd2de94e8cb33658dd53dafd3d"; //pasted the client id
const REDIRECT_URI = "http://127.0.0.1:3000";
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
// changing this for the new spotify authorization
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SCOPES = ["user-top-read"];

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
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(false); // sets state for of waiting for data
  const [error, setError] = useState(null);
  const [accessToken, setAccessToken] = useState("");
  //access token created and added

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const storedToken = window.localStorage.getItem("token");

    if (storedToken) {
      setAccessToken(storedToken);
      return;
    }

    if (code) {
      exchangeCodeForToken(code);
    }
  }, []);

  async function fetchArtists() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("https://api.spotify.com/v1/me/top/artists", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("failed to fetch your stats :(");
      }

      const data = await response.json();
      setArtists(data.items.map((artist) => artist.name)); // fixing data.map to data.items, as spotify returns {items:...}
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (accessToken) {
      fetchArtists(); // now only fetches artist after access token is validated
    }
  }, [accessToken]);

  async function handleLogin() {
    const verifier = generateRandom(128);
    const challenge = await generateCodeChallenge(verifier);
    sessionStorage.setItem("pkce_verifier", verifier);

    const loginUrl =
      `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(SCOPES.join(" "))}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${challenge}`;

    window.location.href = loginUrl;
  }

  async function exchangeCodeForToken(code) {
    const verifier = sessionStorage.getItem("pkce_verifier");

    if (!verifier) {
      setError("PKCE verifier missing — please log in again.");
      return;
    }

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          code_verifier: verifier,
        }),
      });

      if (!response.ok) {
        throw new Error("Token exchange failed — please log in again.");
      }

      const data = await response.json();

      localStorage.setItem("token", data.access_token);
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

  return (
    <div>
      <h1>Welcome To Wesley&apos;s Spotify Listening Stats!!!</h1>

      {/* checks if already logged in and shows log in button for spotify */}
      {!accessToken && (
        <button onClick={handleLogin}>Log in with Spotify</button>
      )}

      {loading && <p>trying to load some stats...</p>}

      {error && (
        <div>
          <p style={{ color: "red" }}>{error}</p>
          {error === "PKCE verifier missing — please log in again." ? (
            <button onClick={handleLogin}>Log in again</button>
          ) : (
            <button onClick={fetchArtists}>Retry</button>
          )}
        </div>
      )}

      {!loading && !error && accessToken && (
        <ul>
          {artists.map((artist) => (
            <li key={artist}>{artist}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;