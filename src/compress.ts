import sharp from "sharp";
import type { CompressionOptions, CompressionResult } from "./types";

const LIMIT_INPUT_PIXELS = 16383 * 16383;
const FALLBACK_DIMENSION = 1024;
const MIN_QUALITY = 50;
const QUALITY_STEP = 10;
const MAX_RETRIES = 3;

interface ImageMeta {
  width: number;
  height: number;
  hasAlpha: boolean;
  isAnimated: boolean;
  format: string;
}

async function readMeta(buffer: Buffer): Promise<ImageMeta> {
  const m = await sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
  return {
    width: m.width ?? 0,
    height: m.height ?? 0,
    hasAlpha: m.hasAlpha ?? false,
    isAnimated: (m.pages ?? 1) > 1,
    format: m.format ?? "unknown",
  };
}

function resolveOutputMime(
  mime: string,
  hasAlpha: boolean,
  conversion: CompressionOptions["formatConversion"]
): string {
  if (mime === "image/gif") return "image/gif";
  switch (conversion) {
    case "never":
      return mime;
    case "auto":
      return mime === "image/png" && !hasAlpha ? "image/jpeg" : mime;
    case "always":
      return "image/jpeg";
  }
}

function formatFromMime(mime: string): string {
  const known: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return known[mime] ?? mime.split("/")[1] ?? "unknown";
}

async function encode(
  buffer: Buffer,
  maxWidth: number,
  maxHeight: number,
  outputMime: string,
  jpegQuality: number,
  webpQuality: number,
  pngLevel: number,
  flatten: boolean
): Promise<{ data: Buffer; width: number; height: number }> {
  let p = sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS }).resize({
    width: maxWidth,
    height: maxHeight,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (flatten) {
    p = p.flatten({ background: { r: 255, g: 255, b: 255 } });
  }

  if (outputMime === "image/jpeg") {
    p = p.jpeg({ quality: jpegQuality, mozjpeg: true });
  } else if (outputMime === "image/png") {
    p = p.png({ compressionLevel: pngLevel });
  } else if (outputMime === "image/webp") {
    p = p.webp({ quality: webpQuality });
  } else if (outputMime === "image/gif") {
    p = p.gif();
  }

  const { data, info } = await p.toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function passthroughResult(
  buffer: Buffer,
  mime: string,
  meta: ImageMeta
): CompressionResult {
  return {
    buffer,
    mime,
    width: meta.width,
    height: meta.height,
    originalSize: buffer.length,
    compressedSize: buffer.length,
    wasCompressed: false,
    format: meta.format,
  };
}

/**
 * Pure compression pipeline.
 *
 * Pipeline sequence:
 *  1. Read Sharp metadata
 *  2. Early exit — animated GIF (returned untouched)
 *  3. Early exit — already under maxRawBytes (returned untouched)
 *  4. Resolve output format per formatConversion + hasAlpha
 *  5. Retry loop — encode at maxWidth/maxHeight, step quality down by 10 (min 50), up to MAX_RETRIES
 *  6. Last-resort downscale to FALLBACK_DIMENSION
 *  7. Safe fallback — return original buffer with wasCompressed: false
 *
 * Any Sharp error at any stage returns the original buffer unmodified.
 */
export async function compressImage(
  buffer: Buffer,
  mime: string,
  options: CompressionOptions
): Promise<CompressionResult> {
  const originalSize = buffer.length;

  try {
    const meta = await readMeta(buffer);

    if (meta.isAnimated) {
      return passthroughResult(buffer, mime, meta);
    }

    if (originalSize <= options.maxRawBytes) {
      return passthroughResult(buffer, mime, meta);
    }

    const outputMime = resolveOutputMime(mime, meta.hasAlpha, options.formatConversion);
    const shouldFlatten = outputMime === "image/jpeg" && meta.hasAlpha;

    let jpegQuality = options.jpegQuality;
    let webpQuality = options.webpQuality;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { data, width, height } = await encode(
        buffer,
        options.maxWidth,
        options.maxHeight,
        outputMime,
        jpegQuality,
        webpQuality,
        options.pngCompressionLevel,
        shouldFlatten
      );

      if (data.length <= options.maxRawBytes) {
        return {
          buffer: data,
          mime: outputMime,
          width,
          height,
          originalSize,
          compressedSize: data.length,
          wasCompressed: true,
          format: formatFromMime(outputMime),
        };
      }

      jpegQuality = Math.max(MIN_QUALITY, jpegQuality - QUALITY_STEP);
      webpQuality = Math.max(MIN_QUALITY, webpQuality - QUALITY_STEP);
    }

    const fallback = await encode(
      buffer,
      FALLBACK_DIMENSION,
      FALLBACK_DIMENSION,
      outputMime,
      MIN_QUALITY,
      MIN_QUALITY,
      options.pngCompressionLevel,
      shouldFlatten
    );

    if (fallback.data.length <= options.maxRawBytes) {
      return {
        buffer: fallback.data,
        mime: outputMime,
        width: fallback.width,
        height: fallback.height,
        originalSize,
        compressedSize: fallback.data.length,
        wasCompressed: true,
        format: formatFromMime(outputMime),
      };
    }

    // Image cannot be compressed under the limit — return original so the
    // API error surfaces naturally rather than silently breaking things.
    return passthroughResult(buffer, mime, meta);
  } catch {
    // Sharp failure (unsupported format, corrupted data, pixel limit exceeded, etc.)
    // Return original buffer unmodified so the pipeline never makes things worse.
    return {
      buffer,
      mime,
      width: 0,
      height: 0,
      originalSize,
      compressedSize: originalSize,
      wasCompressed: false,
      format: formatFromMime(mime),
    };
  }
}
