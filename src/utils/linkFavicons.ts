/**
 * Predefined favicons for popular services.
 * Uses inline SVG data URIs to avoid external requests (privacy).
 */

const DOMAIN_FAVICONS: Record<string, string> = {
  youtube: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#FF0000" d="M14.6 4.3a1.8 1.8 0 0 0-1.3-1.3C12.2 2.7 8 2.7 8 2.7s-4.2 0-5.3.3A1.8 1.8 0 0 0 1.4 4.3C1.1 5.4 1.1 8 1.1 8s0 2.6.3 3.7a1.8 1.8 0 0 0 1.3 1.3c1.1.3 5.3.3 5.3.3s4.2 0 5.3-.3a1.8 1.8 0 0 0 1.3-1.3c.3-1.1.3-3.7.3-3.7s0-2.6-.3-3.7zM6.5 10.3V5.7L10.4 8l-3.9 2.3z"/></svg>`,
  twitter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#1DA1F2" d="M14.4 4.7c0 .1 0 .3 0 .4 0 4.3-3.3 9.3-9.3 9.3A9.2 9.2 0 0 1 0 12.8a6.6 6.6 0 0 0 4.9-1.4 3.3 3.3 0 0 1-3.1-2.3c.5.1 1 .1 1.5-.1A3.3 3.3 0 0 1 .7 5.8v0c.5.2 1 .4 1.5.4A3.3 3.3 0 0 1 1.2 2a9.3 9.3 0 0 0 6.8 3.4 3.3 3.3 0 0 1 5.6-3 6.5 6.5 0 0 0 2.1-.8 3.3 3.3 0 0 1-1.4 1.8 6.6 6.6 0 0 0 1.9-.5 6.7 6.7 0 0 1-1.7 1.7z"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M9.3 7 14.2 1h-1.2L8.8 6.3 5.5 1H1.2l5.1 7.5L1.2 15h1.2l4.5-5.2 3.6 5.2h4.3L9.3 7zm-1.6 1.8-.5-.7L3 1.9h1.8l3.3 4.7.5.7 4.2 6h-1.8L7.7 8.8z"/></svg>`,
  github: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M8 .2A8 8 0 0 0 5.5 15.8c.4.1.5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.2-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.5 7.5 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.2 0 3.1-1.9 3.8-3.6 4 .3.3.6.8.6 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2z"/></svg>`,
  reddit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#FF4500" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm4 7.8a.9.9 0 0 1-.4.7 3.6 3.6 0 0 1-.2 1.1c-.4.8-1.4 1.5-3.4 1.5s-3-.7-3.4-1.5a3.6 3.6 0 0 1-.2-1.1.9.9 0 0 1 .3-1.6.9.9 0 0 1 .9.2A4.4 4.4 0 0 1 8 7.4a4.4 4.4 0 0 1 2.4.7.9.9 0 0 1 1.6.7zM9.5 5.4l1.2-2.7 2.3.5-.1.5-1.8-.4-1 2.3-.6-.2zm4 2.4a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4zM6.2 9a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4zm3.6 0a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4zm-.3 2.5c-.3.3-.8.5-1.5.5s-1.2-.2-1.5-.5l-.4.4c.4.4 1 .6 1.9.6.9 0 1.5-.2 1.9-.6l-.4-.4z"/></svg>`,
  wikipedia: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M14.8 2.5v.4l-.6.2c-.2 0-.4.2-.5.5L10.3 12h-.5L7.5 7.2 4.9 12h-.5L1 3.5c-.2-.4-.3-.6-.5-.7l-.5-.2v-.4h3.5v.4l-.7.2c-.2.1-.2.3-.1.5l2.7 6.8 1.9-3.5L5.1 3.5c-.2-.4-.3-.6-.5-.7l-.4-.2v-.4h3.4v.4l-.6.2c-.2.1-.2.3-.1.5l1.4 3 1.3-3c.1-.2.1-.4-.1-.5l-.6-.2v-.4h2.7v.4l-.5.2c-.2.1-.4.3-.5.6l-2 4.3 2 4.4L13.3 3.5c.1-.3 0-.5-.2-.6l-.6-.2v-.4h2.3z"/></svg>`,
  stackoverflow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#F48024" d="M11.3 14.5v-3.7h1.2v4.9H2V10.8h1.2v3.7h8.1z"/><path fill="#BCBBBB" d="M12.6 6l-1-.6 4-2.8 1 .6zm-1.2-2.2l.8-.8L16 6.2l-.8.8zM4.1 12.2l6-.5.1 1.2-6 .5zm.3-1.8l5.9-1.3.3 1.2-5.9 1.3zm.8-2l5.5-2.6.5 1.1-5.5 2.6zm1.4-2l4.7-3.8.8 1-4.7 3.8z"/></svg>`,
  google: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#4285F4" d="M15.5 8.2c0-.6-.1-1.1-.2-1.6H8v3.1h4.2A3.6 3.6 0 0 1 10.6 12v1.7h2.5c1.5-1.3 2.3-3.3 2.3-5.5z"/><path fill="#34A853" d="M8 16c2.2 0 4-.7 5.3-1.9l-2.5-1.7c-.7.5-1.6.8-2.8.8a4.9 4.9 0 0 1-4.6-3.4H.8v2.1A8 8 0 0 0 8 16z"/><path fill="#FBBC05" d="M3.4 9.5a4.8 4.8 0 0 1 0-3.1V4.3H.8a8 8 0 0 0 0 7.2l2.6-2z"/><path fill="#EA4335" d="M8 3.2c1.2 0 2.3.4 3.2 1.3l2.4-2.4A7.9 7.9 0 0 0 .8 4.3l2.6 2.1A4.8 4.8 0 0 1 8 3.2z"/></svg>`,
  linkedin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#0A66C2" d="M13.6 1H2.4C1.6 1 1 1.6 1 2.3v11.4c0 .7.6 1.3 1.4 1.3h11.2c.8 0 1.4-.6 1.4-1.3V2.3c0-.7-.6-1.3-1.4-1.3zM5.3 13H3.1V6.3h2.2V13zM4.2 5.4a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zM13 13h-2.2V9.7c0-.8 0-1.8-1.1-1.8-1.1 0-1.3.9-1.3 1.7V13H6.2V6.3h2.1v.9c.3-.6 1-1.1 2.1-1.1 2.2 0 2.6 1.5 2.6 3.4V13z"/></svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><defs><linearGradient id="ig" x1="0" y1="16" x2="16" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FD5"/><stop offset=".5" stop-color="#FF543E"/><stop offset="1" stop-color="#C837AB"/></linearGradient></defs><path fill="url(#ig)" d="M4.7 1h6.6C13.3 1 15 2.7 15 4.7v6.6c0 2-1.7 3.7-3.7 3.7H4.7C2.7 15 1 13.3 1 11.3V4.7C1 2.7 2.7 1 4.7 1zm-.1 1.4A2.3 2.3 0 0 0 2.4 4.6v6.8a2.3 2.3 0 0 0 2.2 2.2h6.8a2.3 2.3 0 0 0 2.2-2.2V4.6a2.3 2.3 0 0 0-2.2-2.2H4.6zM11.5 4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 1.4A1.6 1.6 0 1 0 8 10 1.6 1.6 0 0 0 8 6.4z"/></svg>`,
  facebook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#1877F2" d="M15 8a7 7 0 1 0-8.1 6.9v-4.9H5v-2h1.9V6.3c0-1.9 1.1-2.9 2.8-2.9.8 0 1.7.1 1.7.1V5.4h-.9c-.9 0-1.2.6-1.2 1.2V8h2.1l-.3 2h-1.8v4.9A7 7 0 0 0 15 8z"/></svg>`,
  hackernews: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="#FF6600" width="16" height="16" rx="1.5"/><path fill="#fff" d="M4 3.2h1.4l2.5 4.5 2.5-4.5H12L8.7 9.3V13H7.3V9.3L4 3.2z"/></svg>`,
  discord: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#5865F2" d="M13 3.3A12.2 12.2 0 0 0 10 2.3l-.2.4a11 11 0 0 0-3.6 0l-.2-.4A12 12 0 0 0 3 3.3 14.4 14.4 0 0 0 .8 12.7a12.6 12.6 0 0 0 3.8 2 9.5 9.5 0 0 0 .8-1.3 8 8 0 0 1-1.3-.6l.3-.3a8.6 8.6 0 0 0 7.6 0l.3.3c-.4.2-.8.4-1.3.6.2.5.5.9.8 1.3a12.5 12.5 0 0 0 3.8-2A14.3 14.3 0 0 0 13 3.3zM5.6 10.8c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6 1.5.7 1.4 1.6c0 .9-.6 1.6-1.4 1.6zm4.8 0c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6 1.5.7 1.4 1.6c0 .9-.6 1.6-1.4 1.6z"/></svg>`,
  slack: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#E01E5A" d="M3.4 10c0 .8-.7 1.5-1.5 1.5S.4 10.8.4 10s.7-1.5 1.5-1.5h1.5V10zm.7 0c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5v3.6c0 .8-.7 1.5-1.5 1.5s-1.5-.7-1.5-1.5V10z"/><path fill="#36C5F0" d="M5.6 3.4c-.8 0-1.5-.7-1.5-1.5S4.8.4 5.6.4s1.5.7 1.5 1.5v1.5H5.6zm0 .7c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5H2c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5h3.6z"/><path fill="#2EB67D" d="M12.2 5.6c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5-.7 1.5-1.5 1.5h-1.5V5.6zm-.7 0c0 .8-.7 1.5-1.5 1.5s-1.5-.7-1.5-1.5V2c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5v3.6z"/><path fill="#ECB22E" d="M10 12.2c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5v-1.5H10zm0-.7c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5h3.6c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5H10z"/></svg>`,
  notion: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" fill-rule="evenodd" d="M3.3 1.6c.5.4.7.5 1.3.5h6.2c.4 0 .8.1 1 .2l1.3.9c.3.2.4.4.4.7v9c0 .6-.3 1-.9 1.1l-6.8.7c-.5 0-.7 0-1-.4L2.6 11c-.3-.4-.4-.6-.4-1V2.7c0-.7.4-1.2 1.1-1.1zm1 1.6c-.3 0-.4.1-.4.4v7.6l2 2.6V5.6c0-.3.1-.5.3-.5l5-.3c.2 0 .2-.2 0-.3L9.6 3.5c-.2-.1-.3-.2-.6-.1l-4.7.8zm2.4 2.6c-.2 0-.3.2-.3.4v6.3l4.7-.4c.2 0 .3-.2.3-.4V5.4l-4.7.4z"/></svg>`,
  figma: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#F24E1E" d="M5.5 15A2.5 2.5 0 0 0 8 12.5V10H5.5a2.5 2.5 0 0 0 0 5z"/><path fill="#A259FF" d="M3 7.5A2.5 2.5 0 0 1 5.5 5H8v5H5.5A2.5 2.5 0 0 1 3 7.5z"/><path fill="#0ACF83" d="M3 2.5A2.5 2.5 0 0 1 5.5 0H8v5H5.5A2.5 2.5 0 0 1 3 2.5z"/><path fill="#FF7262" d="M8 0h2.5a2.5 2.5 0 0 1 0 5H8V0z"/><path fill="#1ABCFE" d="M13 7.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/></svg>`,
};

/**
 * Domain patterns mapped to favicon keys.
 * Order matters — first match wins.
 */
const DOMAIN_PATTERNS: [RegExp, string][] = [
  [/(?:youtube\.com|youtu\.be)$/i, "youtube"],
  [/(?:twitter\.com)$/i, "twitter"],
  [/(?:x\.com)$/i, "x"],
  [/(?:github\.com)$/i, "github"],
  [/(?:reddit\.com)$/i, "reddit"],
  [/(?:wikipedia\.org)$/i, "wikipedia"],
  [/(?:stackoverflow\.com|stackexchange\.com)$/i, "stackoverflow"],
  [/(?:google\.com|docs\.google\.com|drive\.google\.com)$/i, "google"],
  [/(?:linkedin\.com)$/i, "linkedin"],
  [/(?:instagram\.com)$/i, "instagram"],
  [/(?:facebook\.com|fb\.com)$/i, "facebook"],
  [/(?:news\.ycombinator\.com)$/i, "hackernews"],
  [/(?:discord\.com|discord\.gg)$/i, "discord"],
  [/(?:slack\.com)$/i, "slack"],
  [/(?:notion\.so|notion\.site)$/i, "notion"],
  [/(?:figma\.com)$/i, "figma"],
];

function extractDomain(url: string): string {
  try {
    const hostname = new URL(
      url.startsWith("www.") ? `https://${url}` : url,
    ).hostname;
    // Strip leading "www."
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Returns the favicon key for a URL, or null if no match.
 */
export function getFaviconKey(url: string): string | null {
  const domain = extractDomain(url);
  if (!domain) return null;

  for (const [pattern, key] of DOMAIN_PATTERNS) {
    if (pattern.test(domain)) return key;
  }
  return null;
}

/**
 * Returns a data URI for the favicon SVG, or null if no match.
 */
export function getFaviconDataUri(key: string): string | null {
  const svg = DOMAIN_FAVICONS[key];
  if (!svg) return null;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Apply favicon attribute to an anchor element if it matches a known service.
 */
export function applyFavicon(anchor: HTMLAnchorElement): void {
  const key = getFaviconKey(anchor.href);
  if (key) {
    anchor.setAttribute("data-favicon", key);
  }
}
