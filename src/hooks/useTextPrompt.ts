import { useCallback, useRef, useState } from 'react'
import { TextPromptModal } from '../components/TextPromptModal'
import { isIosDevice } from '../utils/platform'

type PendingPrompt = {
  title: string
  defaultValue: string
  resolve: (value: string | null) => void
}

export function useTextPrompt() {
  const [pending, setPending] = useState<PendingPrompt | null>(null)
  const pendingRef = useRef<PendingPrompt | null>(null)

  const requestText = useCallback((title: string, defaultValue = '') => {
    if (!isIosDevice()) {
      const result = window.prompt(title, defaultValue)
      return Promise.resolve(result)
    }

    return new Promise<string | null>((resolve) => {
      const next: PendingPrompt = { title, defaultValue, resolve }
      pendingRef.current = next
      setPending(next)
    })
  }, [])

  const closePrompt = useCallback((value: string | null) => {
    const current = pendingRef.current
    if (!current) {
      return
    }
    pendingRef.current = null
    setPending(null)
    current.resolve(value)
  }, [])

  const modal =
    pending === null ? null : (
      <TextPromptModal
        open
        title={pending.title}
        defaultValue={pending.defaultValue}
        onConfirm={(value) => closePrompt(value)}
        onCancel={() => closePrompt(null)}
      />
    )

  return { requestText, modal }
}
