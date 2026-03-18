import type { CompressionOptions } from "./types";

export const MAX_BASE64_BYTES = 5_242_880;
export const MAX_RAW_BYTES = 3_500_000;
export const MAX_DIMENSION = 1568;
export const JPEG_QUALITY = 80;
export const PNG_COMPRESSION = 9;
export const WEBP_QUALITY = 80;

export const SUPPORTED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: MAX_DIMENSION,
  maxHeight: MAX_DIMENSION,
  jpegQuality: JPEG_QUALITY,
  pngCompressionLevel: PNG_COMPRESSION,
  webpQuality: WEBP_QUALITY,
  maxRawBytes: MAX_RAW_BYTES,
  formatConversion: "never",
};

export function mergeConfig(
  userConfig?: Partial<CompressionOptions>
): CompressionOptions {
  if (!userConfig) {
    return { ...DEFAULT_OPTIONS };
  }
  return {
    ...DEFAULT_OPTIONS,
    ...userConfig,
  };
}
