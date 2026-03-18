import type { Plugin } from "@opencode-ai/plugin";
import { mergeConfig } from "./config";
import { createToolHook } from "./hooks/tool-hook";
import { createMessageHook } from "./hooks/message-hook";

/**
 * OpenCode Image Compact Plugin
 * Automatically compresses images exceeding Anthropic's 5MB base64 API limit
 */
export const ImageCompact: Plugin = async () => {
  const mergedOptions = mergeConfig();

  return {
    "tool.execute.after": createToolHook(mergedOptions),
    "experimental.chat.messages.transform": createMessageHook(mergedOptions),
  };
};

export default ImageCompact;
