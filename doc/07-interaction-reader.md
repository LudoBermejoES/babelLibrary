# 07 — Book interaction & EPUB reader

## Targeting (every frame while WALKING)

- `Raycaster` from camera center (`setFromCamera({x:0, y:0})`), `far = 2.5` (interaction range doubles as ray cutoff — cheap).
- Test **only book `InstancedMesh`es of the current gallery** (books in neighbor galleries are >2.5 m away through a doorway in practice; correctness beats micro-precision here). Hit → `(mesh, instanceId)` → `bookId = mesh.userData.bookIds[instanceId]` → `BookMeta` from the in-memory map (built once from `/api/books`; no network at look time).
- Raycasting 5 instanced meshes × ~2k instances is fast (three does instance-level sphere pre-tests), but guard anyway: run the raycast every other frame (interaction at 30 Hz is imperceptible; render stays at 60).

## Highlight & HUD

- **Highlight**: on target change, write a brightened color into `instanceColor` for that instance (store original, restore on untarget). One-instance attribute update per change — no per-frame cost, no extra draw. (Emissive overlay mesh rejected: extra draw + sync complexity.)
- **HUD** (DOM, not WebGL): fixed crosshair dot; below it a metadata line `Title — Author` fading in ≤ 100 ms after targeting; after **0.5 s dwell** on the same book, the synopsis paragraph fades in beneath (max ~4 lines, ellipsized). All hidden when nothing targeted or beyond 2.5 m (spec scenarios).
- Dwell timer resets when `bookId` changes, not when `instanceId` flickers between frames on the same book.

## Opening a book

Click in WALKING with a live target →

1. `InputMode → READER`; exit pointer lock; store player pose (position + yaw/pitch).
2. Reader overlay mounts with **loading state** (title + author shown immediately from metadata, spinner for content).
3. `epubUrl` resolution: server-relative → same-origin fetch (always works); absolute external → fetched by foliate-js directly; **CORS failures surface as load errors** (below). This constraint is documented for catalog authors in the README: prefer locally hosted EPUBs.

## Reader overlay (foliate-js, vendored)

Component `web/src/reader/` — plain DOM/CSS over the canvas (no framework; the app has exactly two UI surfaces, HUD and reader, not worth React), built on the vendored `<foliate-view>` custom element (`web/src/reader/vendor/view.js`; provenance and file list in `VENDORED.md`). `epubjs` was the original plan but was replaced during scaffolding — it is unmaintained and depends on a vulnerable, unmaintained `@xmldom/xmldom`; foliate-js has zero runtime dependencies and is actively maintained (see design.md D4).

```ts
import './vendor/view.js'; // registers <foliate-view>

const view = document.createElement('foliate-view') as FoliateView;
containerEl.append(view);
const response = await fetch(epubUrl);
const file = new File([await response.blob()], 'book.epub');
await view.open(file);
view.renderer.setAttribute('flow', 'paginated');
```

- **Layout**: centered "page" panel (max-width ~70ch, warm paper background), dark scrim over the 3D scene behind. Header: title — author, close ×. Footer: prev/next buttons + a page/progress indicator driven by the view's `relocate` event (fires with section/page progress as the reader paginates — no separate locations-generation pass needed, unlike epub.js).
- **Paging**: `view.goLeft()` / `view.goRight()` (foliate-js resolves reading direction) on ←/→ keys and buttons; stop at ends (the view's `relocate` event reports `atStart`/`atEnd`). Keydown listener scoped to READER mode.
- **TOC**: `view.book.toc` → sidebar list; click a `href` → `view.goTo(href)`.
- **Fonts/theming**: `view.renderer.setStyles(css)` for a default theme (line-height 1.6, 18px serif); respect the EPUB's own styles otherwise.
- **Cleanup on close**: `view.close()` then remove the element from the DOM — foliate-js tears down its internal iframes/blobs on `close()`.

## Closing

`Esc` or × → `view.close()` → unmount overlay → restore pose (it never changed; camera/controls were frozen) → show a minimal "click to continue" catcher (browser requires a gesture to re-lock the pointer) → click → WALKING. Total flow must feel like one action: Esc, click, walking.

## Failure handling (spec: a bad EPUB never breaks the session)

Error paths, all rendering the same error state inside the overlay (book title, human message, close button):

| Failure | Detection |
|---|---|
| HTTP 404/5xx on EPUB | `fetch` response `!ok` before `view.open()` is ever called |
| CORS-blocked external URL | `fetch` `TypeError` → message explains external-host restriction |
| Unparseable/corrupt EPUB | `view.open()` promise rejection |
| Timeout | 20 s watchdog around the `fetch` + `view.open()` sequence |

Implementation: wrap the whole open sequence (fetch + `view.open()`) in one `try/catch` + watchdog; on error `view.close()` whatever partially initialized, keep the overlay with the error card. Closing follows the normal path. The seed script's `--with-broken` row (doc 03) exercises this end-to-end.

## Lazy-loading guarantee (spec)

No EPUB bytes move until a click: targeting uses only in-memory metadata. Verified in tests by asserting no `/epubs/` or external requests occur during a scripted walk (doc 09).
