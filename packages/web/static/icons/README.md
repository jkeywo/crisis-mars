# PWA icons

These are auto-generated placeholders produced by `scripts/generate-icons.mjs`:
solid navy background (theme colour from the manifest) with a Mars-red disc
centred on the canvas. They satisfy the PWA install criteria but are not the
final brand artwork.

| File | Size | Purpose |
|---|---:|---|
| `icon-192.png` | 192x192 | any-purpose |
| `icon-512.png` | 512x512 | any-purpose |
| `icon-maskable-512.png` | 512x512 | maskable (disc sits in the 80% safe zone) |

## Regenerating

```
node scripts/generate-icons.mjs
```

No external dependencies; uses Node's built-in `zlib` plus a hand-rolled PNG
encoder. Re-run if the files go missing.

## Replacing with final art

Drop the new PNGs in place. The manifest's icon list at
`packages/web/static/manifest.webmanifest` references the filenames above; keep
the filenames or update the manifest to match.
