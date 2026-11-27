# Manifest-Locked Fighter Portrait Pipeline

## Status
accepted

We preserve single-file Base64 embedding in `game/portraits.js` (so `exceed_poc.html` remains a zero-dependency deliverable), while backing every fighter with immutable **Source Art** in `assets/portraits/raw/<key>.<ext>` and a checked-in **Portrait Manifest** at `assets/portraits/manifest.json` that enforces per-fighter approval locks (`locked: true` + SHA-256 `fullHash`/`headshotHash`) and explicit per-fighter `backdrop` controls.

## Considered Options

- **Load Fighter Portraits from external image files at runtime**: Eliminates Base64 bundle weight, but breaks the single-file `exceed_poc.html` deliverable constraint and duplicates asset-serving paths.
- **Keep stateless, ephemeral manifests in `scripts/import-portraits.mjs`**: Allows tweaking global `removeBackdrop` heuristics for one fighter to silently corrupt already-clean portraits across the rest of the 41-fighter roster without detection.
- **Check in a Portrait Manifest with immutable Source Art, per-fighter backdrop overrides, and fail-closed hash locks**: Keeps the single-file deliverable intact while isolating each fighter's processing recipe and preventing unapproved drift.

## Consequences

- All 41 canonical **Source Art** files live at `assets/portraits/raw/<key>.<ext>`, cleanly separated from runtime standees and UI assets in `public/assets/aistudio/`.
- `assets/portraits/manifest.json` tracks each fighter's `sourcePath`, `status` (`unaudited` | `approved` | `needs-source`), `locked` boolean, `backdrop` controls (`mode`, `removeInteriorPockets`, `edgeDecontam`, `protectRects`), `fullCrop`/`crop` boxes, and SHA-256 `fullHash`/`headshotHash`.
- `scripts/import-portraits.mjs` skips `locked: true` fighters by default during `--stage`, hard-fails `--apply` on locked fighters unless explicitly `--unlock`ed, and requires explicit `--lock` after visual inspection of the `Raw | Previous | New` diff sheet.
- `tests/portraits.test.ts` enforces the automated Portrait QA Gate in `npm test`: valid JPEG headers and dimensions (`480w` Full Portraits, `480×600` Headshots), zero `NaN`/`undefined` substrings, valid `status`/`locked` invariants, and zero hash drift on all locked `approved` fighters.
