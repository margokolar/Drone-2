import {
  SEMITONES_FROM_C,
  splitNoteId,
  type NoteClass,
  type NoteId,
  type TonalCenter,
} from "./notes";
// versioonibump 2

export const TUNING_SYSTEMS = [
  { id: "equal", label: "Equal" },
  { id: "just", label: "Natural" },
  { id: "pythagorean", label: "Pythagorean" },
  { id: "meantone-sixth", label: "Meantone 1/6" },
  { id: "bohlen-pierce", label: "Bohlen-Pierce" },
] as const;

export type TuningSystemId = (typeof TUNING_SYSTEMS)[number]["id"];

export const MIN_BASE_OCTAVE = 1;
export const MAX_BASE_OCTAVE = 5;

const NOTE_CLASS_BY_SEMITONE: Record<number, NoteClass> = {
  0: "c",
  1: "cis",
  2: "d",
  3: "dis",
  4: "e",
  5: "f",
  6: "fis",
  7: "g",
  8: "gis",
  9: "a",
  10: "b",
  11: "h",
};

/**
 * 5-limit just-intonation mapping by semitone distance from the tonal center.
 * This guarantees core intervals such as a pure fifth (7 semitones = 3/2)
 * regardless of which tonal center is selected.
 */
const JUST_RATIO_BY_SEMITONE_FROM_CENTER: Record<number, number> = {
  0: 1 / 1,
  1: 16 / 15,
  2: 9 / 8,
  3: 6 / 5,
  4: 5 / 4,
  5: 4 / 3,
  6: 45 / 32,
  7: 3 / 2,
  8: 8 / 5,
  9: 5 / 3,
  10: 9 / 5,
  11: 15 / 8,
};

/**
 * Pythagorean tuning ratios by semitone distance from tonal center.
 * This uses pure fifth stacking (3/2) reduced to one octave.
 */
const PYTHAGOREAN_RATIO_BY_SEMITONE_FROM_CENTER: Record<number, number> = {
  0: 1 / 1,
  1: 256 / 243,
  2: 9 / 8,
  3: 32 / 27,
  4: 81 / 64,
  5: 4 / 3,
  6: 729 / 512,
  7: 3 / 2,
  8: 128 / 81,
  9: 27 / 16,
  10: 16 / 9,
  11: 243 / 128,
};

const FIFTH_STEPS_BY_SEMITONE_FROM_CENTER: Record<number, number> = {
  0: 0,
  1: -5,
  2: 2,
  3: -3,
  4: 4,
  5: -1,
  6: 6,
  7: 1,
  8: -4,
  9: 3,
  10: -2,
  11: 5,
};

const SYNTONIC_COMMA = 81 / 80;
const MEANTONE_SIXTH_COMMA_FIFTH = (3 / 2) / SYNTONIC_COMMA ** (1 / 6);

function semitoneDistanceFromCenter(
  noteClass: NoteClass,
  center: TonalCenter
): number {
  const centerSemitone = SEMITONES_FROM_C[center];
  const noteSemitone = SEMITONES_FROM_C[noteClass];
  let semitoneDistance = (noteSemitone - centerSemitone) % 12;
  if (semitoneDistance < 0) {
    semitoneDistance += 12;
  }
  return semitoneDistance;
}

function normalizeToSingleOctave(ratio: number): number {
  let normalized = ratio;
  while (normalized < 1) {
    normalized *= 2;
  }
  while (normalized >= 2) {
    normalized /= 2;
  }
  return normalized;
}

function noteClassToMidiInReferenceOctave(
  noteClass: NoteClass,
  baseOctave: number
): number {
  const octave = Math.min(
    MAX_BASE_OCTAVE,
    Math.max(MIN_BASE_OCTAVE, baseOctave)
  );
  const semitoneFromC = SEMITONES_FROM_C[noteClass];
  return 12 * (octave + 1) + semitoneFromC;
}

function midiFromNoteId(noteId: NoteId, baseOctave: number): number {
  const { noteClass, octaveOffset } = splitNoteId(noteId);
  return (
    noteClassToMidiInReferenceOctave(noteClass, baseOctave) + octaveOffset * 12
  );
}

function frequencyFromMidi(midi: number, a4Hz: number): number {
  return a4Hz * 2 ** ((midi - 69) / 12);
}

function normalizeFrequencyNearReference(frequency: number, referenceFrequency: number): number {
  if (frequency <= 0 || referenceFrequency <= 0) {
    return frequency;
  }
  const octaveShift = Math.round(Math.log2(referenceFrequency / frequency));
  return frequency * 2 ** octaveShift;
}

function getJustRatio(noteClass: NoteClass, center: TonalCenter): number {
  const semitoneDistance = semitoneDistanceFromCenter(noteClass, center);
  return (
    JUST_RATIO_BY_SEMITONE_FROM_CENTER[semitoneDistance] ??
    normalizeToSingleOctave(2 ** (semitoneDistance / 12))
  );
}

function getPythagoreanRatio(noteClass: NoteClass, center: TonalCenter): number {
  const semitoneDistance = semitoneDistanceFromCenter(noteClass, center);
  return (
    PYTHAGOREAN_RATIO_BY_SEMITONE_FROM_CENTER[semitoneDistance] ??
    normalizeToSingleOctave(2 ** (semitoneDistance / 12))
  );
}

function getMeantoneSixthRatio(noteClass: NoteClass, center: TonalCenter): number {
  const semitoneDistance = semitoneDistanceFromCenter(noteClass, center);
  const fifthSteps = FIFTH_STEPS_BY_SEMITONE_FROM_CENTER[semitoneDistance] ?? 0;
  return normalizeToSingleOctave(MEANTONE_SIXTH_COMMA_FIFTH ** fifthSteps);
}

function getBohlenPierceRatio(noteClass: NoteClass, center: TonalCenter): number {
  const semitoneDistance = semitoneDistanceFromCenter(noteClass, center);
  const bpStep = Math.round((semitoneDistance * 13) / 12);
  return 3 ** (bpStep / 13);
}

function getTonalCenterFrequency(
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const centerMidi = noteClassToMidiInReferenceOctave(center, baseOctave);
  return frequencyFromMidi(centerMidi, a4Hz);
}

function getNaturalFrequencyFromParts(
  noteClass: NoteClass,
  octaveOffset: number,
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const centerFrequency = getTonalCenterFrequency(center, a4Hz, baseOctave);
  return centerFrequency * getJustRatio(noteClass, center) * 2 ** octaveOffset;
}

function getPythagoreanFrequencyFromParts(
  noteClass: NoteClass,
  octaveOffset: number,
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const centerFrequency = getTonalCenterFrequency(center, a4Hz, baseOctave);
  return centerFrequency * getPythagoreanRatio(noteClass, center) * 2 ** octaveOffset;
}

function getMeantoneSixthFrequencyFromParts(
  noteClass: NoteClass,
  octaveOffset: number,
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const centerFrequency = getTonalCenterFrequency(center, a4Hz, baseOctave);
  return centerFrequency * getMeantoneSixthRatio(noteClass, center) * 2 ** octaveOffset;
}

function getBohlenPierceFrequencyFromParts(
  noteClass: NoteClass,
  octaveOffset: number,
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const centerFrequency = getTonalCenterFrequency(center, a4Hz, baseOctave);
  return centerFrequency * getBohlenPierceRatio(noteClass, center) * 3 ** octaveOffset;
}

function getA4ScaleFactor(
  tuningSystemId: Exclude<TuningSystemId, "equal">,
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const a4OctaveOffset = 4 - Math.min(MAX_BASE_OCTAVE, Math.max(MIN_BASE_OCTAVE, baseOctave));
  let rawA4 = getNaturalFrequencyFromParts("a", a4OctaveOffset, center, a4Hz, baseOctave);
  if (tuningSystemId === "pythagorean") {
    rawA4 = getPythagoreanFrequencyFromParts("a", a4OctaveOffset, center, a4Hz, baseOctave);
  }
  if (tuningSystemId === "meantone-sixth") {
    rawA4 = getMeantoneSixthFrequencyFromParts("a", a4OctaveOffset, center, a4Hz, baseOctave);
  }
  if (tuningSystemId === "bohlen-pierce") {
    rawA4 = getBohlenPierceFrequencyFromParts("a", a4OctaveOffset, center, a4Hz, baseOctave);
  }
  return a4Hz / rawA4;
}

export function getEqualTemperamentFrequency(
  noteId: NoteId,
  a4Hz: number,
  baseOctave: number
): number {
  return frequencyFromMidi(midiFromNoteId(noteId, baseOctave), a4Hz);
}

export function getNaturalFrequency(
  noteId: NoteId,
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const { noteClass, octaveOffset } = splitNoteId(noteId);
  const tunedFrequency =
    getNaturalFrequencyFromParts(noteClass, octaveOffset, center, a4Hz, baseOctave) *
    getA4ScaleFactor("just", center, a4Hz, baseOctave);
  return normalizeFrequencyNearReference(
    tunedFrequency,
    getEqualTemperamentFrequency(noteId, a4Hz, baseOctave)
  );
}

export function getPythagoreanFrequency(
  noteId: NoteId,
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const { noteClass, octaveOffset } = splitNoteId(noteId);
  const tunedFrequency =
    getPythagoreanFrequencyFromParts(noteClass, octaveOffset, center, a4Hz, baseOctave) *
    getA4ScaleFactor("pythagorean", center, a4Hz, baseOctave);
  return normalizeFrequencyNearReference(
    tunedFrequency,
    getEqualTemperamentFrequency(noteId, a4Hz, baseOctave)
  );
}

export function getMeantoneSixthFrequency(
  noteId: NoteId,
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const { noteClass, octaveOffset } = splitNoteId(noteId);
  const tunedFrequency =
    getMeantoneSixthFrequencyFromParts(noteClass, octaveOffset, center, a4Hz, baseOctave) *
    getA4ScaleFactor("meantone-sixth", center, a4Hz, baseOctave);
  return normalizeFrequencyNearReference(
    tunedFrequency,
    getEqualTemperamentFrequency(noteId, a4Hz, baseOctave)
  );
}

export function getBohlenPierceFrequency(
  noteId: NoteId,
  center: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  const { noteClass, octaveOffset } = splitNoteId(noteId);
  const tunedFrequency =
    getBohlenPierceFrequencyFromParts(noteClass, octaveOffset, center, a4Hz, baseOctave) *
    getA4ScaleFactor("bohlen-pierce", center, a4Hz, baseOctave);
  return normalizeFrequencyNearReference(
    tunedFrequency,
    getEqualTemperamentFrequency(noteId, a4Hz, baseOctave)
  );
}

export function getFrequency(
  noteId: NoteId,
  tuningSystemId: TuningSystemId,
  tonalCenter: TonalCenter,
  a4Hz: number,
  baseOctave: number
): number {
  if (tuningSystemId === "equal") {
    return getEqualTemperamentFrequency(noteId, a4Hz, baseOctave);
  }
  if (tuningSystemId === "pythagorean") {
    return getPythagoreanFrequency(noteId, tonalCenter, a4Hz, baseOctave);
  }
  if (tuningSystemId === "meantone-sixth") {
    return getMeantoneSixthFrequency(noteId, tonalCenter, a4Hz, baseOctave);
  }
  if (tuningSystemId === "bohlen-pierce") {
    return getBohlenPierceFrequency(noteId, tonalCenter, a4Hz, baseOctave);
  }
  return getNaturalFrequency(noteId, tonalCenter, a4Hz, baseOctave);
}

export function findLowestEnabledToneNoteId(
  tones: ReadonlyArray<{ noteId: NoteId; enabled: boolean }>,
  tuningSystemId: TuningSystemId,
  tonalCenter: TonalCenter,
  a4Hz: number,
  baseOctave: number,
): NoteId | null {
  let lowestNoteId: NoteId | null = null
  let lowestFrequency = Number.POSITIVE_INFINITY

  for (const tone of tones) {
    if (!tone.enabled) {
      continue
    }
    const frequency = getFrequency(
      tone.noteId,
      tuningSystemId,
      tonalCenter,
      a4Hz,
      baseOctave,
    )
    if (frequency < lowestFrequency) {
      lowestFrequency = frequency
      lowestNoteId = tone.noteId
    }
  }

  return lowestNoteId
}

export function findHighestEnabledToneNoteId(
  tones: ReadonlyArray<{ noteId: NoteId; enabled: boolean }>,
  tuningSystemId: TuningSystemId,
  tonalCenter: TonalCenter,
  a4Hz: number,
  baseOctave: number,
): NoteId | null {
  let highestNoteId: NoteId | null = null
  let highestFrequency = Number.NEGATIVE_INFINITY

  for (const tone of tones) {
    if (!tone.enabled) {
      continue
    }
    const frequency = getFrequency(
      tone.noteId,
      tuningSystemId,
      tonalCenter,
      a4Hz,
      baseOctave,
    )
    if (frequency > highestFrequency) {
      highestFrequency = frequency
      highestNoteId = tone.noteId
    }
  }

  return highestNoteId
}

export function transposeNoteClass(
  noteClass: NoteClass,
  semitoneDelta: number
): NoteClass {
  const source = SEMITONES_FROM_C[noteClass];
  let next = (source + semitoneDelta) % 12;
  if (next < 0) {
    next += 12;
  }
  const translated = NOTE_CLASS_BY_SEMITONE[next];
  if (!translated) {
    return noteClass;
  }
  return translated;
}
