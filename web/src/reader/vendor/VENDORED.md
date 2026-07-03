# Vendored: foliate-js

Source: https://github.com/johnfactotum/foliate-js
Commit: `78914aef4466eb960965702401634c2cb348e9b1` (2026-05-01)
License: MIT (see `LICENSE` in this directory)

Why vendored instead of an npm dependency: foliate-js is not published to npm
and its README states the API may change at any time — pinning to a specific
commit's source is the intended consumption model. It has zero runtime
dependencies of its own (zip/inflate are vendored here too), which was the
deciding factor over `epubjs` (unmaintained, carries a vulnerable
`@xmldom/xmldom` transitive dependency with open high-severity CVEs).

## Files taken (EPUB reading path only)

`view.js` (the `<foliate-view>` custom element and entry point), `epub.js`,
`epubcfi.js`, `progress.js`, `overlayer.js`, `text-walker.js`, `paginator.js`,
`fixed-layout.js`, `search.js`, `vendor/zip.js`, `vendor/fflate.js`.

Omitted on purpose (not needed for EPUB-only reading, and `view.js` only
`import()`s them lazily if it detects that file type): `comic-book.js`,
`fb2.js`, `mobi.js`, `pdf.js`, `dict.js`, `opds.js`, `tts.js`,
`quote-image.js`, `reader.js`/`reader.html`/`ui/` (foliate's own demo shell —
we build our own overlay per doc/07-interaction-reader.md), build tooling
(`rollup*`, `eslint.config.js`, `tests/`).

## Upgrading

Re-clone the upstream repo, diff the files listed above against this
directory, and update the commit hash here.
