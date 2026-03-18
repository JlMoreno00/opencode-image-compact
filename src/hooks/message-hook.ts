import fs from "fs/promises";
import { fileURLToPath } from "url";
import type { CompressionOptions } from "../types.ts";
import { parseDataUri, isOversized, isSupportedImage } from "../detect.ts";
import { compressImage } from "../compress.ts";
import { MAX_BASE64_BYTES } from "../config.ts";
import {
  logCompression,
  logPassthrough,
  logError,
  logWarning,
} from "../logger.ts";

type Attachment = { mime: string; url: string };

type AnyPart = {
  type: string;
  mime?: string;
  url?: string;
  state?: {
    status: string;
    attachments?: Attachment[];
  };
};

/**
 * Resolve the raw image buffer and base64 string from any URL format.
 *
 * Supported formats:
 *  - data:image/...;base64,... — inline data URI (paste path)
 *  - file:///path/to/img.png  — file protocol URL (drag-drop path)
 *  - /absolute/path/to/img.png — bare absolute file path
 *
 * Returns null if the URL is not a recognised format or the MIME is
 * unsupported.
 */
async function resolveImageBuffer(
  url: string,
  mime: string,
): Promise<{ rawBuffer: Buffer; base64: string } | null> {
  // 1. Try data URI first (most common for paste)
  const parsed = parseDataUri(url);
  if (parsed) {
    return { rawBuffer: parsed.rawBuffer, base64: parsed.base64 };
  }

  // 2. file:// protocol (drag-drop from file manager)
  if (url.startsWith("file://")) {
    try {
      const filePath = fileURLToPath(url);
      const rawBuffer = await fs.readFile(filePath);
      const base64 = rawBuffer.toString("base64");
      return { rawBuffer, base64 };
    } catch {
      logWarning(`could not read file URL: ${url.slice(0, 80)}`);
      return null;
    }
  }

  // 3. Bare absolute path (unlikely but defensive)
  if (url.startsWith("/")) {
    try {
      const rawBuffer = await fs.readFile(url);
      const base64 = rawBuffer.toString("base64");
      return { rawBuffer, base64 };
    } catch {
      return null;
    }
  }

  return null;
}

async function processAttachment(
  attachment: Attachment,
  options: CompressionOptions,
): Promise<void> {
  if (!isSupportedImage(attachment.mime)) return;

  const resolved = await resolveImageBuffer(attachment.url, attachment.mime);
  if (!resolved) {
    logPassthrough("unresolvable URL format");
    return;
  }

  if (!isOversized(resolved.base64)) {
    logPassthrough("under size limit");
    return;
  }

  logWarning(
    `oversized image detected (${resolved.base64.length} base64 chars > ${MAX_BASE64_BYTES} limit), compressing...`,
  );

  const result = await compressImage(resolved.rawBuffer, attachment.mime, options);

  if (result.wasCompressed) {
    const compressed64 = result.buffer.toString("base64");
    attachment.url = `data:${result.mime};base64,${compressed64}`;
    attachment.mime = result.mime;
    logCompression(result);
  } else {
    logPassthrough("compression not effective");
  }
}

function isDirectImagePart(part: AnyPart): part is AnyPart & Attachment {
  return typeof part.mime === "string" && typeof part.url === "string";
}

/**
 * Creates a handler for the `experimental.chat.messages.transform` hook.
 *
 * Three image paths are handled:
 * 1. Nested tool attachments: `parts[j].state.attachments[k]` when
 *    `parts[j].type === "tool"` and `state.status === "completed"`.
 * 2. Direct FilePart: `parts[j].type === "file"` with `mime` + `url` — the
 *    paste and drag-drop path.
 * 3. Legacy direct: any part with `mime` + `url` fields (fallback).
 *
 * Unknown part shapes and individual attachment errors are silently
 * absorbed so the hook never makes the conversation worse than without it.
 */
export function createMessageHook(options: CompressionOptions) {
  return async (
    _input: {},
    output: { messages: { info: unknown; parts: AnyPart[] }[] },
  ): Promise<void> => {
    try {
      let processed = 0;
      let compressed = 0;

      for (const msg of output.messages) {
        for (const part of msg.parts) {
          // Path 1: Tool result attachments (read tool, MCP tools)
          if (part.type === "tool") {
            if (!part.state || part.state.status !== "completed") continue;

            const { attachments } = part.state;
            if (!attachments || attachments.length === 0) continue;

            for (const attachment of attachments) {
              try {
                processed++;
                const before = attachment.url.length;
                await processAttachment(attachment, options);
                if (attachment.url.length < before) compressed++;
              } catch (err) {
                logError(
                  err instanceof Error ? err : new Error(String(err)),
                );
              }
            }
            continue;
          }

          // Path 2 & 3: Direct image parts (paste, drag-drop, FilePart)
          if (isDirectImagePart(part)) {
            try {
              processed++;
              const before = part.url.length;
              await processAttachment(part, options);
              if (part.url.length < before) compressed++;
            } catch (err) {
              logError(
                err instanceof Error ? err : new Error(String(err)),
              );
            }
          }
        }
      }

      if (compressed > 0) {
        console.error(
          `[image-compact] Transform pass complete: ${compressed}/${processed} images compressed`,
        );
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)));
    }
  };
}
