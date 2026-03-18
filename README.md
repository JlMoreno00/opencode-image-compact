# opencode-image-compact

OpenCode plugin that compresses oversized image attachments before they hit Anthropic's 5 MB base64 limit.

License: MIT

## The Problem

Anthropic rejects image payloads once the base64 body crosses 5,242,880 bytes. Because base64 adds about 33% overhead, a raw image can fail well before it looks unusually large on disk.

In OpenCode, that failure is especially annoying because the oversized image can stay in the session history. After that, later prompts may keep failing with the same image-too-large error until the bad message is no longer part of the conversation.

This plugin exists to intercept that case before the request reaches the model. It targets the same recurring problem described in OpenCode issues [#2104](https://github.com/sst/opencode/issues/2104), [#20021](https://github.com/sst/opencode/issues/20021), and [#33152](https://github.com/sst/opencode/issues/33152).

## How It Works

```text
Image attached
  -> check base64 size
  -> if under limit, pass through unchanged
  -> if over limit, resize and recompress
  -> send the updated image to the LLM
```

The plugin uses two hooks:

- `tool.execute.after` catches oversized images returned by the `read` tool as early as possible.
- `experimental.chat.messages.transform` acts as the backup path before the request goes to Anthropic.

The plugin is zero-config today. Import it, list it in `opencode.json`, and it uses the built-in defaults from `src/config.ts`.

## Installation

1. Install the package in your OpenCode project.

```bash
bun add opencode-image-compact
```

2. Add it to your `opencode.json` plugin array.

```json
{
  "plugin": ["opencode-image-compact"]
}
```

That JSON block is the whole setup. No extra plugin options are required for the current release.

## Configuration

This version is zero-config at runtime. It does not read custom plugin options yet.

The current built-in behavior is:

| Setting | Default | Meaning |
| --- | --- | --- |
| `maxWidth` | `1568` | Longest edge target used during resize |
| `maxHeight` | `1568` | Matching height bound used during resize |
| `jpegQuality` | `80` | JPEG output quality |
| `pngCompressionLevel` | `9` | PNG compression level |
| `webpQuality` | `80` | WebP output quality |
| `maxRawBytes` | `3500000` | Raw-byte safety threshold before base64 inflation |
| `formatConversion` | `"never"` | Preserve original format by default |

These defaults matter because the plugin is intentionally conservative. It only changes images when it needs to, and it keeps the original format unless the implementation is changed in code.

## Examples

Typical oversized screenshot flow:

```text
8.4 MB screenshot
  -> resized to 1568 px longest edge
  -> recompressed as JPEG quality 80
  -> 1.2 MB output
```

Example log output:

```text
[image-compact] Compressed 8.4 MB -> 1.2 MB (jpeg, 1568x882)
```

Small image that does not need work:

```text
[image-compact] Image passed through: under size limit
```

## How It Handles Edge Cases

- Animated GIFs pass through unchanged.
- Transparent PNGs stay PNG by default because `formatConversion` is `"never"`.
- Small images under the safety threshold pass through unchanged.
- Images that still cannot be reduced below the limit fall back to the original buffer, so the plugin does not make the request worse.
- Corrupted or malformed image data is handled defensively. The plugin falls back to the original payload and logs an error when compression fails.

## Troubleshooting

### I still see the Anthropic 5 MB error

This plugin only helps when OpenCode is sending an inline image payload that the hooks can intercept. If the original image still cannot be reduced enough without breaking the fallback rules, the plugin returns the original image and the API error will still surface.

### The plugin looks installed, but nothing changes

Check that `opencode-image-compact` is listed in the `plugin` array in `opencode.json`. The current release does not require options, so the plugin entry should just be the package name string.

### My PNG was not converted to JPEG

That is expected in this release. The built-in default is `formatConversion: "never"`, which preserves the original format.

### Why do I see pass-through logs?

Pass-through is normal for images that are already under the threshold, for animated GIFs, for malformed data URIs, or for cases where compression would not safely improve the payload.

## Contributing

Local development:

```bash
bun install
bun run typecheck
bun run build
```

Useful checks:

```bash
npm pack --dry-run
```

If you change the compression behavior, keep the docs aligned with the actual defaults in `src/config.ts` and the real hook behavior in `src/hooks/tool-hook.ts` and `src/hooks/message-hook.ts`.

## License

MIT
