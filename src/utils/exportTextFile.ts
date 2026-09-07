import { isCapacitorNative, isIosApp } from './platform'

export type ExportTextResult = 'shared' | 'clipboard' | 'downloaded'

/** Save or share a text file — blob download fails in iOS WKWebView. */
export async function exportTextFile(text: string, fileName: string): Promise<ExportTextResult> {
  if (typeof navigator.share === 'function') {
    try {
      const file = new File([text], fileName, { type: 'text/plain;charset=utf-8' })
      const canShareFiles =
        typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })
      if (canShareFiles) {
        await navigator.share({ files: [file], title: fileName })
        return 'shared'
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'shared'
      }
    }
  }

  if ((isIosApp() || isCapacitorNative()) && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return 'clipboard'
  }

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return 'downloaded'
}

export function exportTextResultMessage(result: ExportTextResult): string {
  switch (result) {
    case 'shared':
      return 'Jagamise aken avanes — salvesta Failidesse või saada Macile.'
    case 'clipboard':
      return 'Kopeeritud lõikelauale — kleebi Macis või Notesis.'
    case 'downloaded':
      return 'Fail alla laaditud.'
  }
}
