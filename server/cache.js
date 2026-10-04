// A tiny in-memory cache: it remembers a value for `ttlMs` milliseconds, then forgets it.
// It also counts hits and misses so we can measure how many Spotify calls it saves.
class TtlCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      this.hits++;
      return entry.value;
    }
    this.store.delete(key); // expired or missing
    this.misses++;
    return undefined;
  }

  set(key, value) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? this.hits / total : 0,
    };
  }
}

module.exports = { TtlCache };
