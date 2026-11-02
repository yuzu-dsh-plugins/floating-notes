/**
 * The page collection lives in one small JSON document in `localStorage`:
 * a list of pages (`title` + ProseMirror doc), the active page id, and the
 * tombstones of deleted pages so two open tabs cannot resurrect them.
 *
 * Two tabs write the same key. Every write therefore merges with what is stored
 * first (newest `updatedAt` wins per page, tombstones win over older edits),
 * instead of overwriting the other tab's work.
 *
 * Older shapes still load: a single page written by the previous TipTap build
 * (`{ title, doc }`) and the block array written by the hand-rolled editor
 * (`{ title, blocks }`).
 */

export const STORAGE_KEY = 'dsh-floating-notes/v1'
export const VERSION = 5
export const MAX_PAGES = 200
const MAX_TITLE = 200
const TOMBSTONE_TTL = 7 * 24 * 60 * 60 * 1000

let pageSeq = 0

function createPageId() {
  pageSeq += 1
  return 'p' + Date.now().toString(36) + pageSeq.toString(36) + Math.random().toString(36).slice(2, 6)
}

/** @returns a one-paragraph document. */
export function emptyDoc() {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/** @returns a fresh, empty page. */
export function newPage(title, doc) {
  const now = Date.now()
  return {
    id: createPageId(),
    title: typeof title === 'string' ? title.slice(0, MAX_TITLE) : '',
    doc: doc && doc.type === 'doc' ? doc : emptyDoc(),
    createdAt: now,
    updatedAt: now,
  }
}

/** @returns a one-page collection. */
export function emptyState() {
  const page = newPage()
  return { activeId: page.id, pages: [page], deleted: {} }
}

function isDoc(value) {
  return Boolean(value)
    && typeof value === 'object'
    && value.type === 'doc'
    && Array.isArray(value.content)
    && value.content.length > 0
    && value.content.every((node) => node && typeof node === 'object' && typeof node.type === 'string')
}

function textContent(text) {
  return typeof text === 'string' && text.length ? [{ type: 'text', text }] : []
}

function paragraph(text) {
  return { type: 'paragraph', content: textContent(text) }
}

/**
 * Convert the pre-TipTap block array into a ProseMirror document, merging
 * consecutive list blocks into one list.
 * @param blocks - the legacy `{ type, text, done }` array.
 * @returns a valid document.
 */
export function blocksToDoc(blocks) {
  const content = []
  let list = null

  const flush = () => {
    if (!list) return
    content.push({ type: list.type, content: list.items })
    list = null
  }

  for (const block of blocks) {
    const text = typeof block.text === 'string' ? block.text : ''
    switch (block.type) {
      case 'bulleted':
      case 'numbered': {
        const type = block.type === 'bulleted' ? 'bulletList' : 'orderedList'
        if (!list || list.type !== type) {
          flush()
          list = { type, items: [] }
        }
        list.items.push({ type: 'listItem', content: [paragraph(text)] })
        break
      }
      case 'todo': {
        if (!list || list.type !== 'taskList') {
          flush()
          list = { type: 'taskList', items: [] }
        }
        list.items.push({
          type: 'taskItem',
          attrs: { checked: block.done === true },
          content: [paragraph(text)],
        })
        break
      }
      case 'heading1':
      case 'heading2':
      case 'heading3': {
        flush()
        content.push({
          type: 'heading',
          attrs: { level: Number(block.type.slice(-1)) },
          content: textContent(text),
        })
        break
      }
      case 'quote': {
        flush()
        content.push({ type: 'blockquote', content: [paragraph(text)] })
        break
      }
      case 'divider': {
        flush()
        content.push({ type: 'horizontalRule' })
        break
      }
      default: {
        flush()
        content.push(paragraph(text))
      }
    }
  }

  flush()
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

function normalizePage(value) {
  if (!value || typeof value !== 'object' || !isDoc(value.doc)) return undefined
  const fallback = Date.now()
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createPageId(),
    title: typeof value.title === 'string' ? value.title.slice(0, MAX_TITLE) : '',
    doc: { type: 'doc', content: value.doc.content },
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : fallback,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : fallback,
  }
}

/** Stable id for a pre-collection payload, so repeated reads do not duplicate it. */
function legacyPageId(title, doc) {
  const source = JSON.stringify([title || '', doc])
  let hash = 5381
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash * 33) ^ source.charCodeAt(index)) >>> 0
  }
  return 'legacy-' + hash.toString(36)
}

function normalizeDeleted(value) {
  const result = {}
  if (value && typeof value === 'object') {
    for (const [id, at] of Object.entries(value)) {
      if (typeof id === 'string' && id && Number.isFinite(at)) result[id] = at
    }
  }
  return result
}

/** @returns the collection, or undefined when the value is not a known shape. */
function fromStored(value) {
  if (!value || typeof value !== 'object') return undefined

  if (Array.isArray(value.pages)) {
    const pages = value.pages.map(normalizePage).filter(Boolean).slice(0, MAX_PAGES)
    if (!pages.length) return undefined
    const activeId = pages.some((page) => page.id === value.activeId) ? value.activeId : pages[0].id
    return { activeId, pages, deleted: normalizeDeleted(value.deleted) }
  }

  if (isDoc(value.doc)) {
    const page = normalizePage({
      id: legacyPageId(value.title, value.doc),
      title: value.title,
      doc: value.doc,
    })
    return { activeId: page.id, pages: [page], deleted: {} }
  }

  if (Array.isArray(value.blocks)) {
    const doc = blocksToDoc(value.blocks)
    const page = normalizePage({
      id: legacyPageId(value.title, doc),
      title: value.title,
      doc,
    })
    return { activeId: page.id, pages: [page], deleted: {} }
  }

  return undefined
}

/** Keep a copy of an unreadable value before a fresh collection replaces it. */
function backupCorrupt(raw) {
  const key = STORAGE_KEY + '.corrupt-' + Date.now()
  try {
    window.localStorage.setItem(key, raw)
  } catch (error) {
    /* nothing to do: the original is still under the main key */
  }
  return key
}

/**
 * Read the collection.
 * @returns `{ activeId, pages, deleted }`, plus `recovered` with the backup key
 *   when the stored value could not be read (a backup was written).
 */
export function loadState() {
  let raw
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch (error) {
    return emptyState()
  }
  if (!raw) return emptyState()
  try {
    const collection = fromStored(JSON.parse(raw))
    if (collection) return collection
  } catch (error) {
    /* fall through to the backup path */
  }
  return { ...emptyState(), recovered: backupCorrupt(raw) }
}

/**
 * Read what another tab last wrote, without any recovery side effect.
 * @returns the stored collection, or undefined when absent or unreadable.
 */
export function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    return fromStored(JSON.parse(raw))
  } catch (error) {
    return undefined
  }
}

function writeCollection(collection) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: VERSION,
      activeId: collection.activeId,
      pages: collection.pages,
      deleted: collection.deleted,
    }))
    return { ok: true }
  } catch (error) {
    const quota = error && (
      error.name === 'QuotaExceededError'
      || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || error.code === 22
      || error.code === 1014
    )
    return { ok: false, reason: quota ? 'quota' : 'blocked' }
  }
}

/**
 * Merge this tab's collection into the stored one.
 * Pages are keyed by id and the newer `updatedAt` wins; a tombstone removes the
 * page unless that page was edited after the deletion.
 */
export function mergeCollections(local, remote) {
  const base = remote || { activeId: '', pages: [], deleted: {} }
  const pages = new Map()
  for (const page of base.pages) pages.set(page.id, page)
  for (const page of local.pages) {
    const existing = pages.get(page.id)
    if (!existing || page.updatedAt >= existing.updatedAt) pages.set(page.id, page)
  }

  const deleted = { ...base.deleted }
  for (const [id, at] of Object.entries(local.deleted || {})) {
    deleted[id] = Math.max(deleted[id] || 0, at)
  }

  const cutoff = Date.now() - TOMBSTONE_TTL
  for (const [id, at] of Object.entries(deleted)) {
    if (at < cutoff) {
      delete deleted[id]
      continue
    }
    const page = pages.get(id)
    if (!page) continue
    if (page.updatedAt <= at) pages.delete(id)
    else delete deleted[id]
  }

  if (!pages.size) {
    const page = newPage()
    pages.set(page.id, page)
  }

  const activeId = pages.has(local.activeId) ? local.activeId : pages.keys().next().value
  return { activeId, pages: [...pages.values()], deleted }
}

/** Persist the collection as-is; callers merge first. */
export function saveState(collection) {
  return writeCollection(collection)
}
