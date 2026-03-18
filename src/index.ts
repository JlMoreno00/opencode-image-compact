import type { Plugin } from "@opencode-ai/plugin"

/**
 * OpenCode Image Compact Plugin
 * Automatically compresses images exceeding Anthropic's 5MB base64 API limit
 */
export const ImageCompact: Plugin = async () => {
  return {
    // Hooks will be registered here in subsequent tasks
  }
}

export default ImageCompact
