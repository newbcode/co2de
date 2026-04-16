/**
 * Self-hosted SVG badge generator — shields.io-style without external API.
 *
 * Reasons to self-host:
 *   - Privacy: shields.io requests leak {repo, value} to a third party.
 *   - Determinism: no network dependency during README regeneration.
 *   - Offline: works in airgapped CI.
 *
 * Output matches the shields.io visual contract closely enough that
 * GitHub renders them indistinguishably. We skip cache-busting and
 * logo support — not needed for co2de.
 */

const FONT_FAMILY = 'Verdana,"DejaVu Sans",Geneva,sans-serif';
const FONT_SIZE = 11;
const BADGE_HEIGHT = 20;
const TEXT_PAD_X = 6;

/**
 * Rough per-character width at Verdana 11px.
 * Verdana is wider than most sans-serif fonts — shields.io uses it
 * for predictable width. Empirical average: ~6.2px per char; upper
 * bound needed to avoid clipping: ~7.1 for uppercase / digits.
 */
const CHAR_WIDTHS: Record<string, number> = {
  " ": 3.6, ".": 3.3, ",": 3.3, ":": 3.3, ";": 3.3,
  "i": 3.3, "l": 3.3, "I": 3.3, "|": 3.3, "!": 3.3,
  "·": 4.0,
};
function charWidth(c: string): number {
  if (CHAR_WIDTHS[c] !== undefined) return CHAR_WIDTHS[c];
  const code = c.charCodeAt(0);
  // Uppercase / wide digits
  if (code >= 0x41 && code <= 0x5a) return 7.2;
  if (code >= 0x30 && code <= 0x39) return 6.9;
  // Lowercase
  if (code >= 0x61 && code <= 0x7a) return 6.3;
  // Fallback (non-ASCII / symbol)
  return 6.6;
}

function textWidth(s: string): number {
  let w = 0;
  for (const c of s) w += charWidth(c);
  return w;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Standard shields.io label colors */
export const BADGE_COLORS = {
  labelBg:   "#555",       // always dark charcoal for label side
  lightgrey: "#9f9f9f",
  yellow:    "#dfb317",
  orange:    "#fe7d37",
  red:       "#e05d44",
  rust:      "#8b4a2b",    // co2de signature for "disclosed"
  charcoal:  "#3a332c",    // practice badge neutral
};

/**
 * Generate a shields.io-style two-part badge as a self-contained SVG string.
 */
export function svgBadge(label: string, value: string, valueColor: string): string {
  const labelW = Math.ceil(textWidth(label)) + TEXT_PAD_X * 2;
  const valueW = Math.ceil(textWidth(value)) + TEXT_PAD_X * 2;
  const totalW = labelW + valueW;
  const h = BADGE_HEIGHT;

  // Text is painted twice — once as a black shadow beneath for contrast,
  // then white on top. Matches the shields.io look for kerning stability.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${h}" viewBox="0 0 ${totalW} ${h}" role="img" aria-label="${escapeXml(label)}: ${escapeXml(value)}">
  <title>${escapeXml(label)}: ${escapeXml(value)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalW}" height="${h}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="${h}" fill="${BADGE_COLORS.labelBg}"/>
    <rect x="${labelW}" width="${valueW}" height="${h}" fill="${valueColor}"/>
    <rect width="${totalW}" height="${h}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="${FONT_FAMILY}" text-rendering="geometricPrecision" font-size="${FONT_SIZE * 10}" transform="scale(0.1)">
    <text aria-hidden="true" x="${(labelW / 2) * 10}" y="150" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>
    <text x="${(labelW / 2) * 10}" y="140" fill="#fff">${escapeXml(label)}</text>
    <text aria-hidden="true" x="${(labelW + valueW / 2) * 10}" y="150" fill="#010101" fill-opacity=".3">${escapeXml(value)}</text>
    <text x="${(labelW + valueW / 2) * 10}" y="140" fill="#fff">${escapeXml(value)}</text>
  </g>
</svg>`;
}

/** Pick pace badge color by annualized emissions. */
export function paceColor(annualGrams: number): string {
  if (annualGrams < 50_000)    return BADGE_COLORS.lightgrey;  // < 50 kg/yr
  if (annualGrams < 200_000)   return BADGE_COLORS.yellow;     // < 200 kg/yr
  if (annualGrams < 1_000_000) return BADGE_COLORS.orange;     // < 1 t/yr
  return BADGE_COLORS.red;                                      // 1 t/yr+
}

/** Format an annualized pace for display on a badge. */
export function fmtBadgePace(annualGrams: number): string {
  if (annualGrams >= 1_000_000) return `~${(annualGrams / 1_000_000).toFixed(1)} t/yr`;
  if (annualGrams >= 1_000)     return `~${Math.round(annualGrams / 1000)} kg/yr`;
  return `~${Math.round(annualGrams)} g/yr`;
}
