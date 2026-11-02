# dsh-floating-notes

A floating memo pad for the DeepSeek Harness Web GUI: one round button in the
bottom-right corner opens a Notion-style page above it, with one tab per page.

## What it is

![icon](./icon.svg)

A TipTap (ProseMirror) editor inside a small floating panel. Every keystroke goes
into a real document model, so undo, cross-block selection, IME composition and
rich paste are handled by ProseMirror instead of hand-written contenteditable
code.

The pad holds a collection of pages: create one, switch between them, rename by
editing the title, and delete with an inline confirmation. Each page keeps its own
document, its own created/updated time and its own undo history.

## The button

- Drag it anywhere on screen; the position is remembered per browser, clamped to
  the viewport on load and on window resize.
- The position is stored as the distance from the two nearest screen edges, so a
  resized window keeps the button in the same quadrant at the same offset: drag
  it to the bottom-right and it stays that far from the right and bottom edges.
  The old absolute-coordinate value is migrated on load.
- The panel follows the button: it opens above or below and left or right of it,
  whichever keeps the whole panel on screen.
- Clicking still opens the pad; the click that ends a drag is swallowed, so
  moving the button never toggles the panel by accident.
- The panel opens toward whichever side has more room — above vs below, left vs
  right — so a button in the top half gets a panel below it and a button in the
  bottom half gets one above it. A 12px gap always separates the panel from the
  button, so the button can never cover the panel.
- The remembered size is an upper bound: if the chosen side has less room than
  the panel, the panel shrinks to that space (down to whatever fits) instead of
  overlapping the button or running off screen. It grows back to the remembered
  size when the room is there again.
- Horizontally it shares the button's screen edge: its left edge sits on the
  button's left edge and it extends right, or its right edge sits on the button's
  right edge and it extends left — whichever side has more room.
- Only two edges resize: the edge away from the button vertically (top when the
  panel is above, bottom when it is below) and the side away from it
  horizontally. The edge facing the button and the aligned side stay put, so the
  panel grows away from the button instead of sliding over it.
- The corner where those two free edges meet is a third handle and moves both
  dimensions at once — the panel above a bottom-right button resizes from its
  top-left corner. None of the three draws anything: the cursor changes to a
  resize arrow when you point at them. Minimum 320×240, clamped to the viewport; the size is
  remembered and the panel re-anchors when it is reopened or the button moves.
- The padlock in the tab bar keeps the panel open: while it is on, clicking
  elsewhere in the app no longer dismisses it. `Esc`, the close button and the
  floating button still close it, and the lock resets when the panel closes.

## Writing

| Type a line start | It becomes |
|---|---|
| `# `, `## `, `### ` | Heading 1 / 2 / 3 |
| `- ` or `* ` | Bulleted list |
| `1. ` | Numbered list |
| `[] ` or `[ ] ` | To-do with a checkbox |
| `> ` | Quote |
| `---` | Divider |
| `/` | Block menu, filtered as you type |

Inline markdown works too: `**bold**`, `*italic*`, `~~strike~~` and `` `code` ``.

- `Enter` splits a block and continues a list; `Backspace` at the start of a block
  joins it with the one above, `Tab` / `Shift-Tab` nest list items.
- **Leaving a list**: `Enter` on an empty to-do (or bullet / numbered) line turns
  that line into a plain paragraph, splitting the list around it when it sits in
  the middle; `Backspace` or `Delete` on an empty item does the same. A line that
  only holds spaces or line breaks counts as empty, and the first, middle and last
  item all behave alike.
- Undo / redo: `Cmd/Ctrl-Z` and `Shift-Cmd/Ctrl-Z` (TipTap history, per page).
- The `/` menu is keyboard driven: arrows to choose, `Enter` to apply, `Esc` to
  close. `Esc` also closes the panel when no menu is open.
- The button badge counts open to-dos across every page; the footer counts the
  page you are in.

## Pages

- Every page is a tab in the strip at the top of the panel, ordered by creation
  so tabs never jump while you type. The strip scrolls sideways and keeps the
  active tab in view.
- The `+` button opens a blank page with the caret already in the title.
- A tab's `×` asks once inside the tab (`Delete? ✓ / ×`); the last remaining page
  is never removed — a fresh blank page takes its place.
- An untitled page is labelled by the first line of its content, falling back to
  “Untitled”; hovering a tab shows when it was last edited.

## Storage

The button position (`dsh-floating-notes/position`,
`{ xSide, x, ySide, y }` — distances from the nearest edges) and the panel size
(`dsh-floating-notes/size`, `{ width, height }`) live in their own keys, so moving
or resizing never rewrites the pages.

The collection itself, one origin: `localStorage` key `dsh-floating-notes/v1`,
holding `{ version: 5, activeId, pages: [{ id, title, doc, createdAt, updatedAt }],
deleted: { [id]: timestamp } }` where `doc` is the ProseMirror JSON. Writes are
debounced and the footer stays quiet while they succeed: a `Saved` badge shown
all the time is noise users stop reading. The footer only speaks up on failure —
`Not saved locally`, with the reason (quota exhausted, storage blocked) in its
tooltip — and that failure stays visible for the rest of the page, even after the
panel is closed and reopened. On first use the footer shows a one-time
`Saved on this device only` hint, then never again.

What keeps the data safe:

- **Merge on write** — every save first reads what another tab wrote and merges
  by page id (newer `updatedAt` wins), so two open tabs cannot drop each other's
  edits.
- **Tombstones** — deleting a page records its id for seven days, so a stale tab
  cannot bring it back.
- **Flush on hide** — `visibilitychange`/`pagehide` writes the pending debounce
  immediately; closing the tab does not lose the last keystroke.
- **Corrupt data is kept** — an unreadable value is copied to
  `dsh-floating-notes/v1.corrupt-<time>` before a blank collection replaces it,
  and the panel shows a notice instead of silently starting over.

Older shapes still load: a single page written by the previous TipTap build
(`{ title, doc }`) and the block array written by the hand-rolled editor
(`{ title, blocks }`) both become the first page of the collection.

Nothing leaves this machine, nothing enters a session log, and the model never
sees the pages.

## Architecture

| Piece | Choice |
|---|---|
| Slot | `shell.overlay` (frame-wide, above every column, click-through by default) |
| Entry id | `dsh-floating-notes`, order 40 |
| Shell | React from the Host page; no UI component library |
| Editor | TipTap 2 + StarterKit, Placeholder, TaskList/TaskItem |
| Bundle | esbuild, IIFE, React kept external and injected through the loader |
| Host half | `apply()` only — no services, no configuration |
| Styling | `--dsw-alias-*` theme tokens; glyphs, brand fill and shadow alpha are artwork |
| Locale | own namespace `dsh-floating-notes`, English and Chinese dictionaries |

`src/entry.js` registers the module with `window.__ModuleLoader__.load`; the
factory receives the page's `require` and hands `react` to the bundle through
`src/runtime.js`, so no second React copy is shipped.

## Development

```sh
npm install      # TipTap, esbuild, jsdom for the smoke test
npm run build    # src/ -> client.js
npm run check    # jsdom walk-through: pages, migration, editor, undo
```

The build is committed as `client.js`; the Harness serves that file, so a rebuilt
bundle needs a page reload.

## Files

| File | Role |
|---|---|
| `index.js` | Host half: an empty `apply`, so the Loader row activates |
| `client.js` | Built browser bundle (do not edit by hand) |
| `src/` | Editor, views (page + list), store, dictionaries, styles |
| `checks/render.mjs` | Headless page-flow, migration, editor and undo test |
| `cordis.patch.yml` | Inserts the `floating-notes` row into the Loader |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title and description |
| `icon.svg` | Original artwork shown in the plugin inventory |

## Known limits

- No floating selection toolbar yet: bold/italic are markdown shortcuts and the
  usual `Cmd-B` / `Cmd-I`.
- Links, images, tables and code blocks are not part of the schema.
- No search across pages yet; the list sorts by last edit.
- The collection is per browser origin, not per workspace: every session edits
  the same pages by design.
