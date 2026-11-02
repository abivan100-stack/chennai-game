/**
 * Sun position over Chennai from a timestamp. Pure math, no imports (checked by scripts/check.ts).
 * Accurate to a degree or two (ignores equation of time); plenty for lighting.
 *
 * World axes: +x = east, -z = north, +y = up.
 */

const DEG = Math.PI / 180;
const LAT = 13.08 * DEG; // Chennai
const LON = 80.27; // degrees east
const IST_MERIDIAN = 82.5; // IST is defined on 82.5°E
/** Asia/Kolkata is a fixed UTC+5:30; India has no daylight saving. */
const IST_OFFSET_MS = 5.5 * 3600_000;

/** Fractional day-of-year (Jan 1 00:00 IST = 1.0) and hours (0-24) in IST. */
export function istTime(ms: number) {
  const ist = new Date(ms + IST_OFFSET_MS); // read with getUTC* to get IST fields
  const day = (ist.getTime() - Date.UTC(ist.getUTCFullYear(), 0, 0)) / 86400_000;
  return { day, hours: (day % 1) * 24 };
}

/** "HH:MM" in IST. */
export function istClock(ms: number) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/** Unit vector pointing from the ground towards the sun. y < 0 means night. */
export function sunDirection(ms: number) {
  const { day, hours } = istTime(ms);
  const decl = 23.44 * DEG * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const solarHours = hours + (LON - IST_MERIDIAN) / 15; // Chennai is ~9 min behind IST clock time
  const hourAngle = (solarHours - 12) * 15 * DEG;

  const elevation = Math.asin(
    Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(hourAngle),
  );
  // Azimuth clockwise from north.
  const azimuth =
    Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(LAT) - Math.tan(decl) * Math.cos(LAT)) + Math.PI;

  const c = Math.cos(elevation);
  return { x: Math.sin(azimuth) * c, y: Math.sin(elevation), z: -Math.cos(azimuth) * c };
}
