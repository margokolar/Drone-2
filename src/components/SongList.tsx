import clsx from 'clsx'
import { ArrowDown, ArrowUp, Check, Copy, Pencil, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

type SongEntry = {
  id: string
  name: string
}

type SongListProps = {
  songName: string
  songLibrary: SongEntry[]
  onLoadSong: (songId: string) => void
  onRenameSong: (songId: string, name: string) => void
  onDuplicateSong: (songId: string) => void
  onDeleteSong: (songId: string) => void
  onMoveSong: (songId: string, direction: 'up' | 'down') => void
}

export function SongList({
  songName,
  songLibrary,
  onLoadSong,
  onRenameSong,
  onDuplicateSong,
  onDeleteSong,
  onMoveSong,
}: SongListProps) {
  const [editingSongId, setEditingSongId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const renameBlurTimeoutRef = useRef<number | null>(null)
  const renameIgnoreBlurRef = useRef(false)

  const clearRenameBlurTimeout = () => {
    if (renameBlurTimeoutRef.current !== null) {
      window.clearTimeout(renameBlurTimeoutRef.current)
      renameBlurTimeoutRef.current = null
    }
  }

  const commitRename = (songId: string) => {
    clearRenameBlurTimeout()
    const trimmed = editingName.replace(/\s+/g, ' ').trim()
    if (trimmed) {
      onRenameSong(songId, trimmed)
    }
    setEditingSongId(null)
  }

  const scheduleRenameBlur = (songId: string) => {
    if (renameIgnoreBlurRef.current) {
      return
    }
    clearRenameBlurTimeout()
    renameBlurTimeoutRef.current = window.setTimeout(() => {
      renameBlurTimeoutRef.current = null
      if (document.activeElement === renameInputRef.current) {
        return
      }
      commitRename(songId)
    }, 120)
  }

  const startEditing = (song: SongEntry) => {
    clearRenameBlurTimeout()
    renameIgnoreBlurRef.current = true
    flushSync(() => {
      setEditingSongId(song.id)
      setEditingName(song.name)
    })
    const input = renameInputRef.current
    if (input) {
      input.focus({ preventScroll: true })
      input.select()
    }
    window.setTimeout(() => {
      renameIgnoreBlurRef.current = false
    }, 400)
  }

  return (
    <div className="space-y-1.5">
      {songLibrary.map((song) => {
        const isActive = song.name === songName
        const isEditing = editingSongId === song.id
        const toolButtonClass = clsx(
          'flex min-h-9 min-w-9 items-center justify-center rounded-lg border p-1.5 transition',
          isActive
            ? 'border-white/20 bg-[#2a2238] text-white/90 hover:bg-[#352a48]'
            : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
        )
        const deleteButtonClass = clsx(
          'flex min-h-9 min-w-9 items-center justify-center rounded-lg border p-1.5 transition',
          isActive
            ? 'border-red-300/55 bg-[#2a2238] text-red-200 hover:bg-red-300/20'
            : 'border-red-300/40 bg-red-300/10 text-red-100 hover:bg-red-300/20',
        )

        return (
          <article
            key={song.id}
            className={`rounded-xl border px-3 py-2 transition ${
              isActive
                ? 'border-cyan-300/70 bg-cyan-300/20 shadow-[0_0_18px_rgba(103,232,249,0.14)]'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            } ${!isEditing ? 'cursor-pointer' : ''}`}
            onClick={!isEditing ? () => onLoadSong(song.id) : undefined}
          >
            <div className="mb-1.5 flex min-h-8 items-center">
              <div className="flex min-w-0 flex-1 items-center">
                {isEditing ? (
                  <form
                    className="relative w-full min-w-0"
                    autoComplete="off"
                    onSubmit={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      commitRename(song.id)
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="text"
                      name="ios-autofill-name-trap"
                      tabIndex={-1}
                      aria-hidden
                      autoComplete="name"
                      defaultValue=""
                      className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
                      readOnly
                    />
                    <input
                      type="email"
                      name="ios-autofill-email-trap"
                      tabIndex={-1}
                      aria-hidden
                      autoComplete="email"
                      defaultValue=""
                      className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
                      readOnly
                    />
                    <input
                      ref={renameInputRef}
                      id={`song-title-${song.id}`}
                      type="search"
                      inputMode="text"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onBlur={() => scheduleRenameBlur(song.id)}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitRename(song.id)
                        }
                      }}
                      className="min-h-8 w-full appearance-none rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm font-semibold leading-tight text-white outline-none focus:border-cyan-300/50 [user-select:text] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
                      aria-label="Song title"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      data-form-type="other"
                      data-lpignore="true"
                      data-1p-ignore="true"
                    />
                  </form>
                ) : (
                  <div className="text-safe min-w-0 truncate text-sm font-semibold text-white">{song.name}</div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {isEditing ? (
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    commitRename(song.id)
                  }}
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-cyan-300/50 bg-cyan-300/20 p-1.5 text-cyan-100 transition hover:bg-cyan-300/30"
                  aria-label="Save song title"
                >
                  <Check size={16} />
                </button>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        startEditing(song)
                      }}
                      className={toolButtonClass}
                      aria-label="Edit song title"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onMoveSong(song.id, 'up')
                      }}
                      className={toolButtonClass}
                      aria-label="Move song up"
                    >
                      <ArrowUp size={16} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDuplicateSong(song.id)
                      }}
                      className={toolButtonClass}
                      aria-label="Duplicate song"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onMoveSong(song.id, 'down')
                      }}
                      className={toolButtonClass}
                      aria-label="Move song down"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteSong(song.id)
                      }}
                      className={deleteButtonClass}
                      aria-label="Delete song"
                      disabled={songLibrary.length <= 1}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
