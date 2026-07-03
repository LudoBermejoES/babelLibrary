# book-interaction

> Implementation details: [doc/07-interaction-reader.md](../../../../../doc/07-interaction-reader.md) (raycast targeting, highlight technique, foliate-js integration, failure paths).

## ADDED Requirements

### Requirement: Book targeting via raycast
While in pointer lock, the app SHALL raycast from the screen center each frame and, when a book is within interaction range (≤ 2.5 m), highlight it and show its catalog metadata: title and author, with the synopsis shown after the crosshair rests on the same book for ~0.5 s.

#### Scenario: Looking at a nearby book
- **WHEN** the crosshair rests on a book within 2.5 m
- **THEN** that book (and only that book) is visually highlighted and its catalog title and author are shown

#### Scenario: Dwelling on a book
- **WHEN** the crosshair stays on the same book for 0.5 s
- **THEN** the book's synopsis from the catalog is also displayed

#### Scenario: Looking at a distant book
- **WHEN** the crosshair rests on a book farther than 2.5 m
- **THEN** no highlight or metadata is shown

### Requirement: Raycast hit resolves to catalog entry
A raycast hit on an instanced book mesh SHALL resolve, via the instance→book-id mapping from the generator, to the catalog book id, so the displayed metadata and the opened EPUB always correspond to the targeted spine.

#### Scenario: Correct book identity
- **WHEN** the user targets a specific book spine and opens it
- **THEN** the reader loads the EPUB whose catalog row was assigned to that exact slot

### Requirement: EPUB reading view
Clicking a highlighted book SHALL open an in-browser EPUB reader overlay that loads the book's EPUB from the URL in the catalog and renders it page-by-page with next/previous controls (keyboard and on-screen) and a chapter/table-of-contents menu. Opening the overlay suspends movement input; closing it (`Esc` or close button) returns to first-person control at the same position.

#### Scenario: Opening a book
- **WHEN** the user clicks a highlighted book
- **THEN** the reader overlay opens, shows a loading state while the EPUB downloads, then renders the book's first pages, and WASD movement is suspended

#### Scenario: Paging and chapters
- **WHEN** the reader is open and the user presses the right arrow (or clicks "next")
- **THEN** the next page is displayed; selecting a chapter from the table of contents jumps to that chapter

#### Scenario: Closing a book
- **WHEN** the user presses `Esc` in the reader
- **THEN** the overlay closes and the player is back in first-person control at their previous position

### Requirement: EPUB loading failures are handled
If an EPUB fails to load (network error, bad URL, CORS-blocked external host, unparseable file, or a 20 s load timeout), the reader SHALL show a human-readable error with the book's title and a close action, and MUST NOT break the 3D session.

#### Scenario: Broken EPUB URL
- **WHEN** the user opens a book whose EPUB URL returns 404
- **THEN** the overlay shows an error message naming the book, and closing it returns the user to the walkable scene
