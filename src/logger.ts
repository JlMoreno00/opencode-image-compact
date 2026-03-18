import type { CompressionResult } from "./types";

/**
 * Format bytes to human-readable string (B, KB, MB, GB)
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["B", "KB", "MB", "GB"];
  const k = 1000;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

/**
 * Log compression result to stderr
 */
export function logCompression(result: CompressionResult): void {
  const originalFormatted = formatBytes(result.originalSize);
  const compressedFormatted = formatBytes(result.compressedSize);
  const dimensions = `${result.width}x${result.height}`;

  console.error(
    `[image-compact] Compressed ${originalFormatted} -> ${compressedFormatted} (${result.format}, ${dimensions})`
  );
}

/**
 * Log passthrough reason to stderr
 */
export function logPassthrough(reason: string): void {
  console.error(`[image-compact] Image passed through: ${reason}`);
}

/**
 * Log warning to stderr
 */
export function logWarning(message: string): void {
  console.error(`[image-compact] Warning: ${message}`);
}

/**
 * Log error to stderr
 */
export function logError(error: Error): void {
  console.error(
    `[image-compact] Error (falling back to original): ${error.message}`
  );
}
