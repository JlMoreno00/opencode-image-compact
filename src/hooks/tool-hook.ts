import type { Hooks } from "@opencode-ai/plugin";
import type { CompressionOptions } from "../types";
import { parseDataUri, isOversized, isSupportedImage } from "../detect";
import { compressImage } from "../compress";
import { logCompression, logPassthrough, logError } from "../logger";

/**
 * Runtime attachment shape present in `tool.execute.after` output.
 * Not declared in @opencode-ai/plugin v1.2.27; confirmed by the Task 1 spike.
 * See .sisyphus/evidence/task-1-spike-results.md.
 */
interface RuntimeFilePart {
  type: string;
  mime: string;
  url: string;
}

type RuntimeToolOutput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[1] & {
  attachments?: RuntimeFilePart[];
};

/**
 * Returns the `tool.execute.after` hook handler.
 *
 * Compresses oversized image attachments on `read` tool results in-place.
 * On malformed URI, unsupported MIME, or compression failure: logs and
 * leaves the original attachment URL unmodified.
 */
export function createToolHook(
  options: CompressionOptions,
): NonNullable<Hooks["tool.execute.after"]> {
  return async (input, output) => {
    try {
      if (input.tool !== "read") return;

      const out = output as RuntimeToolOutput;
      const attachments = out.attachments;
      if (!attachments || attachments.length === 0) return;

      for (const attachment of attachments) {
        if (attachment.type !== "file" || !isSupportedImage(attachment.mime)) {
          continue;
        }

        const parsed = parseDataUri(attachment.url);
        if (parsed === null) {
          logPassthrough("malformed or unsupported data URI");
          continue;
        }

        if (!isOversized(parsed.base64)) {
          logPassthrough("under size limit");
          continue;
        }

        try {
          const result = await compressImage(parsed.rawBuffer, parsed.mime, options);
          if (result.wasCompressed) {
            const compressed64 = result.buffer.toString("base64");
            attachment.url = `data:${result.mime};base64,${compressed64}`;
            logCompression(result);
          } else {
            logPassthrough("could not reduce below size limit");
          }
        } catch (compressErr) {
          logError(
            compressErr instanceof Error ? compressErr : new Error(String(compressErr)),
          );
        }
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)));
    }
  };
}
