// Talks to our own backend (never to Spotify directly).
// In development, package.json's "proxy" forwards /api/... to the backend on port 5001.
export const BACKEND_URL = "http://127.0.0.1:5001";

export class NotLoggedInError extends Error {}

export async function getJson(path) {
  const response = await fetch(path, { credentials: "include" });
  if (response.status === 401) throw new NotLoggedInError("not logged in");
  if (!response.ok) throw new Error("failed to fetch your stats :(");
  return response.json();
}

export async function logout() {
  await fetch("/auth/logout", { method: "POST", credentials: "include" });
}
