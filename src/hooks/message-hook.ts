import type { CompressionOptions } from "../types.ts";
import { parseDataUri, isOversized, isSupportedImage } from "../detect.ts";
import { compressImage } from "../compress.ts";
import {
  logCompression,
  logPassthrough,
  logError,
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

async function processAttachment(
  attachment: Attachment,
  options: CompressionOptions,
): Promise<void> {
  if (!isSupportedImage(attachment.mime)) return;

  const parsed = parseDataUri(attachment.url);
  if (!parsed) return;

  if (!isOversized(parsed.base64)) {
    logPassthrough("under size limit");
    return;
  }

  const result = await compressImage(parsed.rawBuffer, parsed.mime, options);

  if (result.wasCompressed) {
    const compressed64 = result.buffer.toString("base64");
    attachment.url = `data:${result.mime};base64,${compressed64}`;
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
 * Two image paths are handled:
 * 1. Nested: `parts[j].state.attachments[k].url` when `parts[j].type ===
 *    "tool"` and `state.status === "completed"` — the read-tool path.
 * 2. Direct: `parts[j].mime` + `parts[j].url` when both fields are present
 *    on the part itself — the paste and drag-drop path.
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
      for (const msg of output.messages) {
        for (const part of msg.parts) {
          if (part.type === "tool") {
            if (!part.state || part.state.status !== "completed") continue;

            const { attachments } = part.state;
            if (!attachments || attachments.length === 0) continue;

            for (const attachment of attachments) {
              try {
                await processAttachment(attachment, options);
              } catch (err) {
                // One bad attachment must not abort the rest of the pass.
                logError(
                  err instanceof Error ? err : new Error(String(err)),
                );
              }
            }
          } else if (isDirectImagePart(part)) {
            try {
              await processAttachment(part, options);
            } catch (err) {
              logError(
                err instanceof Error ? err : new Error(String(err)),
              );
            }
          }
        }
      }
    } catch (err) {
      // Top-level guard: structural errors are absorbed so the plugin
      // never makes things worse than without it.
      logError(err instanceof Error ? err : new Error(String(err)));
    }
  };
}
