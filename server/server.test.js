// Run with: npm run test:server
const test = require("node:test");
const assert = require("node:assert");
const { TtlCache } = require("./cache");
const { countGenres, listensByHour } = require("./analytics");
const { toTokens } = require("./spotify");

test("cache returns a stored value and counts hits and misses", () => {
  const cache = new TtlCache(1000);
  assert.strictEqual(cache.get("a"), undefined);
  cache.set("a", 42);
  assert.strictEqual(cache.get("a"), 42);
  assert.deepStrictEqual(cache.stats(), { hits: 1, misses: 1, hitRate: 0.5 });
});

test("cache forgets values after they expire", () => {
  const cache = new TtlCache(-1); // already expired the moment it's set
  cache.set("a", 42);
  assert.strictEqual(cache.get("a"), undefined);
});

test("countGenres counts and sorts genres across artists", () => {
  const artists = [
    { genres: ["indie", "rock"] },
    { genres: ["rock"] },
    { genres: [] },
  ];
  assert.deepStrictEqual(countGenres(artists), [
    { label: "rock", value: 2 },
    { label: "indie", value: 1 },
  ]);
});

test("listensByHour puts each play in its hour bucket", () => {
  const at = (hour) => new Date(2026, 0, 1, hour, 30).toISOString();
  const buckets = listensByHour([at(9), at(9), at(22)]);
  assert.strictEqual(buckets.length, 24);
  assert.strictEqual(buckets[9].value, 2);
  assert.strictEqual(buckets[22].value, 1);
});

test("toTokens keeps the old refresh token when Spotify doesn't send a new one", () => {
  const tokens = toTokens({ access_token: "new", expires_in: 3600 }, "old-refresh");
  assert.strictEqual(tokens.accessToken, "new");
  assert.strictEqual(tokens.refreshToken, "old-refresh");
  assert.ok(tokens.expiresAt > Date.now());
});
