/**
 * Compression configuration options
 */
export interface CompressionOptions {
  maxWidth: number;
  maxHeight: number;
  jpegQuality: number;
  pngCompressionLevel: number;
  webpQuality: number;
  maxRawBytes: number;
  formatConversion: "never" | "auto" | "always";
}

/**
 * Result of image compression operation
 */
export interface CompressionResult {
  buffer: Buffer;
  mime: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
  format: string;
}

/**
 * Image metadata extracted from buffer
 */
export interface ImageInfo {
  mime: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  isAnimated: boolean;
  format: string;
  size: number;
}

/**
 * Parsed data URI components
 */
export interface ParsedDataUri {
  mime: string;
  base64: string;
  rawBuffer: Buffer;
}
