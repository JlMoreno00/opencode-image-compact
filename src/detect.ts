import sharp from "sharp";
import type { ImageInfo, ParsedDataUri } from "./types";
import { MAX_BASE64_BYTES, SUPPORTED_MIMES } from "./config";

const DATA_URI_PREFIX = "data:";
const BASE64_MARKER = ";base64,";

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * Parses a data URI into its components.
 * Returns null if the URI does not start with "data:", lacks the ";base64,"
 * marker, has an empty data section, or contains an unsupported MIME type.
 */
export function parseDataUri(url: string): ParsedDataUri | null {
  if (!url.startsWith(DATA_URI_PREFIX)) return null;

  const markerIdx = url.indexOf(BASE64_MARKER);
  if (markerIdx === -1) return null;

  const mime = url.slice(DATA_URI_PREFIX.length, markerIdx);
  if (!isSupportedImage(mime)) return null;

  const base64 = url.slice(markerIdx + BASE64_MARKER.length);
  if (base64.length === 0) return null;

  const rawBuffer = Buffer.from(base64, "base64");
  return { mime, base64, rawBuffer };
}

/**
 * Returns true if the base64 string's character length exceeds maxBytes.
 * Uses string-length comparison (no decoding) because the Anthropic API
 * enforces a 5 MB limit on the raw base64 string, not on decoded bytes.
 */
export function isOversized(
  base64String: string,
  maxBytes: number = MAX_BASE64_BYTES,
): boolean {
  return base64String.length > maxBytes;
}

/**
 * Extracts image metadata from a raw buffer using sharp.
 * On any error (corrupt data, unsupported format, native sharp failure) the
 * function returns explicit zero/false defaults rather than throwing. This is
 * intentional: callers always receive a valid ImageInfo shape and can apply
 * conservative handling for unknown images.
 */
export async function detectImageInfo(buffer: Buffer): Promise<ImageInfo> {
  try {
    const meta = await sharp(buffer).metadata();
    const format = meta.format ?? "unknown";
    const mime = FORMAT_TO_MIME[format] ?? `image/${format}`;
    return {
      mime,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      hasAlpha: meta.hasAlpha ?? false,
      isAnimated: (meta.pages ?? 1) > 1,
      format,
      size: meta.size ?? buffer.length,
    };
  } catch {
    return {
      mime: "image/unknown",
      width: 0,
      height: 0,
      hasAlpha: false,
      isAnimated: false,
      format: "unknown",
      size: buffer.length,
    };
  }
}

export function isSupportedImage(mime: string): boolean {
  return SUPPORTED_MIMES.some((m) => m === mime);
}
