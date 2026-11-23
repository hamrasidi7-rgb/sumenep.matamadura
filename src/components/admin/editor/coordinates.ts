// Coordinates for the map block, from what an editor is likely to paste.

/** "-7.0123, 113.8650", an OpenStreetMap link (mlat/mlon or #map=z/lat/lng) or a Google Maps "@lat,lng,zoom" link. */
export function parseCoordinates(raw: string): { latitude: number; longitude: number; zoom?: number } | null {
  const text = raw.trim();
  const pair = text.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  const at = text.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)(?:,(\d{1,2}(?:\.\d+)?)z)?/);
  const hash = text.match(/#map=(\d{1,2})\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/);
  const query = text.match(/[?&]mlat=(-?\d{1,2}\.\d+).*?[?&]mlon=(-?\d{1,3}\.\d+)/);
  const result = pair
    ? { latitude: Number(pair[1]), longitude: Number(pair[2]) }
    : at
      ? { latitude: Number(at[1]), longitude: Number(at[2]), ...(at[3] ? { zoom: Math.round(Number(at[3])) } : {}) }
      : hash
        ? { latitude: Number(hash[2]), longitude: Number(hash[3]), zoom: Number(hash[1]) }
        : query
          ? { latitude: Number(query[1]), longitude: Number(query[2]) }
          : null;
  if (!result || Math.abs(result.latitude) > 90 || Math.abs(result.longitude) > 180) return null;
  return result;
}
