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
3. `epubUrl` resolution: server-relative → same-origin fetch (always works); absolute external → fetched by epub.js directly; **CORS failures surface as load errors** (below). This constraint is documented for catalog authors in the README: prefer locally hosted EPUBs.

## Reader overlay (epub.js)

Component `web/src/reader/` — plain DOM/CSS over the canvas (no framework; the app has exactly two UI surfaces, HUD and reader, not worth React).

```ts
const book = ePub(epubUrl);
const rendition = book.renderTo(containerEl, {
  flow: 'paginated', width: '100%', height: '100%', spread: 'auto',
});
await rendition.display();
```

- **Layout**: centered "page" panel (max-width ~70ch, warm paper background), dark scrim over the 3D scene behind. Header: title — author, close ×. Footer: prev/next buttons + `page x of y` when epub.js locations are generated (generate lazily: `book.locations.generate(1000)` in the background; show chapter label until ready).
- **Paging**: `rendition.next()/prev()` on →/← keys and buttons; stop at ends (spec). Keydown listener scoped to READER mode.
- **TOC**: `book.loaded.navigation` → sidebar list; click → `rendition.display(href)`.
- **Fonts/theming**: register a default theme (line-height 1.6, 18px serif); respect the EPUB's own styles otherwise.
- **Cleanup on close**: `rendition.destroy(); book.destroy();` — epub.js leaks iframes otherwise.

## Closing

`Esc` or × → destroy rendition → unmount overlay → restore pose (it never changed; camera/controls were frozen) → show a minimal "click to continue" catcher (browser requires a gesture to re-lock the pointer) → click → WALKING. Total flow must feel like one action: Esc, click, walking.

## Failure handling (spec: a bad EPUB never breaks the session)

Error paths, all rendering the same error state inside the overlay (book title, human message, close button):

| Failure | Detection |
|---|---|
| HTTP 404/5xx on EPUB | fetch/epub.js `openFailed` |
| CORS-blocked external URL | fetch TypeError → message explains external-host restriction |
| Unparseable/corrupt EPUB | epub.js open promise rejection |
| Timeout | 20 s watchdog around `rendition.display()` |

Implementation: wrap the whole open sequence in one `try/catch` + watchdog; on error `destroy()` whatever partially initialized, keep the overlay with the error card. Closing follows the normal path. The seed script's `--with-broken` row (doc 03) exercises this end-to-end.

## Lazy-loading guarantee (spec)

No EPUB bytes move until a click: targeting uses only in-memory metadata. Verified in tests by asserting no `/epubs/` or external requests occur during a scripted walk (doc 09).
