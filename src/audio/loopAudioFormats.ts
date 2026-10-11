/** Browser file-input filter: named audio types only, never `audio/*` (that opens Photos on iOS). */
export const LOOP_AUDIO_FILE_ACCEPT = [
  '.wav',
  '.wave',
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.aiff',
  '.aif',
  '.caf',
  '.ogg',
  '.oga',
  '.opus',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/ogg',
  'audio/opus',
  'audio/x-caf',
].join(',')

export function mimeTypeForLoopFileName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg'
    case 'm4a':
    case 'mp4':
      return 'audio/mp4'
    case 'aac':
      return 'audio/aac'
    case 'flac':
      return 'audio/flac'
    case 'wav':
    case 'wave':
      return 'audio/wav'
    case 'aiff':
    case 'aif':
      return 'audio/aiff'
    case 'ogg':
    case 'oga':
      return 'audio/ogg'
    case 'opus':
      return 'audio/opus'
    case 'caf':
      return 'audio/x-caf'
    default:
      return 'application/octet-stream'
  }
}
