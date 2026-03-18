import type { Plugin } from "@opencode-ai/plugin";
import { mergeConfig } from "./config";
import { createToolHook } from "./hooks/tool-hook";
import { createMessageHook } from "./hooks/message-hook";

export const ImageCompact: Plugin = async () => {
  const mergedOptions = mergeConfig();
  console.error("[image-compact] Plugin loaded, hooks registered");

  return {
    "tool.execute.after": createToolHook(mergedOptions),
    "experimental.chat.messages.transform": createMessageHook(mergedOptions),
  };
};

export default ImageCompact;
