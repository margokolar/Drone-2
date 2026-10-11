import { registerPlugin } from '@capacitor/core'

type LoopFilePickerPlugin = {
  pickWav(): Promise<{ canceled: boolean; name?: string; data?: string }>
}

export const LoopFilePicker = registerPlugin<LoopFilePickerPlugin>('LoopFilePicker')

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  const step = 0x8000
  for (let offset = 0; offset < binary.length; offset += step) {
    const slice = binary.slice(offset, Math.min(offset + step, binary.length))
    bytes.set(
      Uint8Array.from(slice, (character) => character.charCodeAt(0)),
      offset,
    )
  }
  return bytes
}

/** Opens the iOS Files picker for a WAV. Returns null if the user cancels. */
export async function pickLoopWavFile(): Promise<File | null> {
  const result = await LoopFilePicker.pickWav()
  if (result.canceled || !result.data || !result.name) {
    return null
  }
  const bytes = base64ToBytes(result.data)
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new File([buffer], result.name, { type: 'audio/wav' })
}
