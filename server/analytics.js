// Turns raw Spotify data into chart-ready numbers: [{ label, value }, ...]

// Counts how many of your top artists belong to each genre, most common first.
function countGenres(artists, limit = 10) {
  const counts = new Map();
  for (const artist of artists) {
    for (const genre of artist.genres || []) {
      counts.set(genre, (counts.get(genre) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

// Buckets recently played tracks by the hour of day they were played (0-23),
// in the listener's time zone (e.g. "America/New_York"). Servers usually run on UTC,
// so without this a 9pm play in Virginia would land in the 1am bucket.
function listensByHour(playedAtTimes, timeZone) {
  const hourOf = hourFormatter(timeZone);
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ label: String(hour), value: 0 }));
  for (const time of playedAtTimes) {
    buckets[Number(hourOf.format(new Date(time)))].value++;
  }
  return buckets;
}

// Formats a date as just its hour, 0-23. An unknown time zone falls back to UTC.
function hourFormatter(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "UTC" });
  }
}

module.exports = { countGenres, listensByHour };
