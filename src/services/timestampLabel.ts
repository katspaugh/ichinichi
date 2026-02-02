/**
 * Format a timestamp label (time only).
 */
export function formatTimestampLabel(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "";

  const time = parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return time;
}

/**
 * Get a timestamp label.
 */
export function getTimestampLabel(timestamp: string): string {
  return formatTimestampLabel(timestamp);
}
