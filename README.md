# Floating Notes

**English** · [简体中文](./README.zh-CN.md)

A floating memo pad for the DeepSeek Harness web interface. Click the round
button in the bottom-right corner to open a Notion-style editor with one tab
per page.

## Installation

```sh
git clone https://github.com/yuzu-dsh-plugins/floating-notes.git
```

Install the cloned directory as a local bundle in the DSH plugin manager. If
your session exposes the `plugin_manager` tool, run `install_bundle` with the
directory's absolute path. The bundle is registered as `dsh-floating-notes`.
The repository includes the built `client.js`, so you can install it directly.

## What it is

![icon](./icon.svg)

A TipTap (ProseMirror) editor inside a small floating panel. Every keystroke goes
into a real document model, so undo, cross-block selection, IME composition and
rich paste are handled by ProseMirror instead of hand-written contenteditable
code.

The pad holds a collection of pages: create one, switch between them, rename by
editing the title, and delete with an inline confirmation. Each page keeps its
own document, creation time, and last edit time.

## The button

- Drag it anywhere on screen; the position is remembered per browser, clamped to
  the viewport on load and on window resize.
- The position is stored as the distance from the two nearest screen edges, so a
  resized window keeps the button in the same quadrant at the same offset: drag
  it to the bottom-right and it stays that far from the right and bottom edges.
  The old absolute-coordinate value is migrated on load.
- The panel follows the button: it opens above or below and left or right of it,
  whichever keeps the whole panel on screen.
- Click the button to toggle the pad. Releasing it after a drag leaves the
  panel's open or closed state as it was.
- The panel opens toward whichever side has more room — above vs below, left vs
  right — so a button in the top half gets a panel below it and a button in the
  bottom half gets one above it. A 12px gap always separates the panel from the
  button, so the button can never cover the panel.
- The remembered size is an upper bound. When space is limited, the panel
  shrinks to fit. It grows back to the remembered size when space allows.
- Horizontally it shares the button's screen edge: its left edge sits on the
  button's left edge and it extends right, or its right edge sits on the button's
  right edge and it extends left — whichever side has more room.
- The panel resizes from two edges. Use the edge away from the button vertically (top when the
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

Inline Markdown also works. Try `**bold**`, `*italic*`, `~~strike~~`, or `` `code` ``.

- `Enter` splits a block or continues a list. At the start of a block,
  `Backspace` joins it with the one above. Use `Tab` and `Shift-Tab` to change
  the indentation of list items.
- Press `Enter`, `Backspace`, or `Delete` on an empty list item to turn it into
  a plain paragraph. An empty item in the middle splits the list around it.
  Items that contain only spaces or line breaks count as empty.
- Undo and redo use `Cmd/Ctrl-Z` and `Shift-Cmd/Ctrl-Z` while the editor is open.
  Switching pages or closing the panel resets the undo history.
- In the `/` menu, use the arrow keys to choose, `Enter` to apply, and `Esc` to
  close. `Esc` closes the panel when the menu is closed.
- The button badge counts open to-dos across every page. The footer shows
  the count for the current page.

## Pages

- Every page is a tab in the strip at the top of the panel, ordered by creation
  so tabs never jump while you type. The strip scrolls sideways and keeps the
  active tab in view.
- The `+` button opens a blank page with the caret already in the title.
- Click a tab's `×` and confirm to delete its page. Deleting the last page
  creates a fresh blank page.
- An untitled page is labelled by the first line of its content, falling back to
  “Untitled”; hovering a tab shows when it was last edited.

## Storage

The button position (`dsh-floating-notes/position`,
`{ xSide, x, ySide, y }` — distances from the nearest edges) and the panel size
(`dsh-floating-notes/size`, `{ width, height }`) live in their own keys, so moving
or resizing never rewrites the pages.

The collection is stored per origin under the `localStorage` key
`dsh-floating-notes/v1`, with the shape
`{ version: 5, activeId, pages: [{ id, title, doc, createdAt, updatedAt }],
deleted: { [id]: timestamp } }` where `doc` is the ProseMirror JSON. The editor
waits 400 ms after the latest change before saving. The footer shows
`Not saved locally` if a write fails, with the reason in its tooltip. On first
use the footer shows a `Saved on this device only` hint.

- Each save merges pages by ID with the stored collection. The newer
  `updatedAt` wins. If another tab saves during the 400 ms delay, its update can
  replace your pending edits.
- The collection keeps deletion records for seven days to filter out older
  copies of deleted pages.
- The editor attempts to save pending changes when the browser tab is hidden
  or closed. Unloading the plugin can cancel a pending save.
- If the entire collection is unreadable, the plugin attempts to copy the raw
  data to `dsh-floating-notes/v1.corrupt-<time>` and shows a recovery notice.

Older formats are migrated on load. A single page written by the previous TipTap build
(`{ title, doc }`) and the block array written by the hand-rolled editor
(`{ title, blocks }`) both become the first page of the collection.

Notes stay in the browser's local storage and are shared by DSH sessions on
the same origin.

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

`src/entry.js` registers the module with `window.__ModuleLoader__.load`. The
factory receives the page's `require` and hands `react` to the bundle through
`src/runtime.js`, so no second React copy is shipped.

## Development

```sh
npm ci           # TipTap, esbuild, jsdom for the smoke test
npm run build    # src/ -> client.js
npm run check    # jsdom walk-through: pages, migration, editor, undo
```

The build is committed as `client.js`. Reload the Harness page after rebuilding
to load the new file.

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

- Use Markdown shortcuts or `Cmd-B` and `Cmd-I` to format bold and italic text.
  The editor has no floating selection toolbar yet.
- Links, images, tables and code blocks are not part of the schema.
- No search across pages yet.
- The editor loads up to 200 pages. Pages created beyond that limit may
  disappear from the panel after reloading.
- Workspaces and sessions on the same browser origin share one collection.
