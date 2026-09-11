import { FUNCTION_LESSON_MAP } from '@/lib/functionLessonMap'

/**
 * // What changed:
 * // - Added the complete in-app tutorial curriculum data layer
 * // - Defined tutorial types, validators, chapter metadata, and lesson scaffolds
 * // - Exported FUNCTION_LESSON_MAP and unlock threshold for UI/state integration
 */

export type LessonId = string
export type ChapterId = number

export interface ValidationResult {
  pass: boolean
  hint?: string
}

export interface Lesson {
  id: LessonId
  title: string
  concept: string
  instructions: string
  scaffold: string
  hints: string[]
  spotlightTarget?: string
  validator: (code: string) => ValidationResult
}

export interface Chapter {
  id: ChapterId
  emoji: string
  title: string
  description: string
  lessons: Lesson[]
}

export const UNLOCK_THRESHOLD = 0.6

const DRUM_NAMES = /\b(bd|sd|hh|oh|rim|lt|mt|ht)\b/
const METHOD_PATTERN = /\.(room|delay|shape|pan|cutoff|reverb)\s*\(/g
const NOTE_PATTERN_WITH_COMMA = /note\s*\(\s*["'`][^"'`]*,[^"'`]*["'`]/

const countTopLevelArgs = (source: string): number => {
  let depth = 0
  let inQuote: '"' | '\'' | '`' | null = null
  let count = 1

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const previous = source[index - 1]

    if (inQuote) {
      if (char === inQuote && previous !== '\\') {
        inQuote = null
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      inQuote = char
      continue
    }

    if (char === '(' || char === '[' || char === '{') {
      depth += 1
      continue
    }

    if (char === ')' || char === ']' || char === '}') {
      depth -= 1
      continue
    }

    if (char === ',' && depth === 0) {
      count += 1
    }
  }

  return source.trim().length === 0 ? 0 : count
}

const hasThreeStackArgs = (code: string): boolean => {
  const start = code.indexOf('stack(')
  if (start < 0) {
    return false
  }

  let depth = 0
  let inQuote: '"' | '\'' | '`' | null = null
  let body = ''

  for (let index = start + 'stack('.length; index < code.length; index += 1) {
    const char = code[index]
    const previous = code[index - 1]

    if (inQuote) {
      body += char
      if (char === inQuote && previous !== '\\') {
        inQuote = null
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      inQuote = char
      body += char
      continue
    }

    if (char === '(') {
      depth += 1
      body += char
      continue
    }

    if (char === ')') {
      if (depth === 0) {
        return countTopLevelArgs(body) >= 3
      }
      depth -= 1
      body += char
      continue
    }

    body += char
  }

  return false
}

const pass = (): ValidationResult => ({ pass: true })
const fail = (hint: string): ValidationResult => ({ pass: false, hint })

const byRegex = (pattern: RegExp, hint: string) => (code: string): ValidationResult => (
  pattern.test(code) ? pass() : fail(hint)
)

const byRule = (predicate: (code: string) => boolean, hint: string) => (code: string): ValidationResult => (
  predicate(code) ? pass() : fail(hint)
)

const lesson = (config: Lesson): Lesson => config

export const chapters: Chapter[] = [
  {
    id: 0,
    emoji: '💡',
    title: 'DMX & Lighting Control',
    description: 'Use the bridge, DMX monitor, scenes, groups, and project bindings to drive lighting from Shoedelussy.',
    lessons: [
      lesson({
        id: 'dmx.1',
        title: 'DMX Monitor Basics',
        concept: 'Use the DMX Monitor panel to arm, blackout, trigger scenes, and inspect patch state.',
          instructions: 'Open the DMX Monitor panel, inspect the patch, and understand that the bridge owns fixture/groups/scenes while Shoedelussy stores musical bindings.',
        scaffold: '// [intro]\n$: s("bd ~ sd ~")',
        hints: [
          'The DMX Monitor lives in the right sidebar.',
          'The bridge can run in simulator mode or OLA mode.',
          'Arm and Blackout are explicit controls for safe output handling.',
        ],
        validator: byRule(() => true, 'Open the DMX panel and inspect the controls.'),
      }),
      lesson({
        id: 'dmx.2',
        title: 'Section to Scene Bindings',
        concept: 'Bind `// [section]` markers to named DMX scenes so playback structure can drive lighting.',
        instructions: 'Create or keep section markers in the editor, then bind each section to a scene in the DMX Monitor panel.',
        scaffold: '// [intro]\n$: s("bd ~ sd ~")\n\n// [drop]\n$: s("bd hh sd hh")',
        hints: [
          'Section markers look like `// [intro]`.',
          'Cue bindings live in project lighting metadata.',
          'When playback hits an active section, the bound scene can be triggered automatically.',
        ],
        validator: byRegex(/\/\/\s*\[[^\]]+\]/, 'Add at least one section marker like `// [intro]`.'),
      }),
      lesson({
        id: 'dmx.3',
        title: 'Track to Group Bindings',
        concept: 'Bind named `$:` tracks to DMX groups so musical layers can map to lighting groups.',
        instructions: 'Use named tracks and then assign them to DMX groups in the DMX Monitor panel. Runtime group automation currently uses real trigger events plus source-location matching, and can send onset-driven pulses with per-binding intensity and hold time.',
        scaffold: 'drums$: s("bd hh sd hh")\n\nlead$: note("c4 e4 g4")',
        hints: [
          'Track names come before `$:`.',
          'Named tracks are easier to bind than anonymous tracks.',
          'Group bindings are persisted with the project.',
          'Runtime auto-group triggering currently works best with explicit named tracks, not anonymous fallback names.',
          'The current mapping is onset-driven, not a full per-note lighting expression system.',
          'Track bindings can now define intensity, hold time, and fade time for the pulse.',
        ],
        validator: byRegex(/^[A-Za-z][\w]*\s*\$:/m, 'Add at least one named track before `$:`.'),
      }),
    ],
  },
  {
    id: 1,
    emoji: '🥁',
    title: 'Your First Sound',
    description: 'Play your first beat and understand the cycle.',
    lessons: [
      lesson({
        id: '1.1',
        title: 'Hello, Kick Drum',
        concept: 'Use s() to trigger a sample.',
        instructions: 'Load the kick pattern, hit play, then make sure your code still uses s() with a sound name inside it. The editor now offers inline Strudel autocomplete with function signatures, live variables, parsed track names, and hover docs for known functions.',
        scaffold: 's("bd")',
        hints: [
          'Use the sample function with one drum name.',
          'Wrap the drum name in quotes inside s(...).',
          'Try `s("bd")`.',
          'Type `sou` to surface `sound`, or press Ctrl/Cmd+Space on an empty line to browse suggestions.',
          'Hover known Strudel helpers like `sound` to inspect their signature and description.',
        ],
        spotlightTarget: '[aria-label="Play"]',
        validator: byRegex(/s\s*\(/, 'Use `s()` to trigger a sound.'),
      }),
      lesson({
        id: '1.2',
        title: 'Sequences',
        concept: 'Spaces sequence events across one cycle.',
        instructions: 'Write a short drum sequence with at least three events inside one s() string so you can hear the order across the cycle.',
        scaffold: 's("bd sd hh")',
        hints: [
          'Put several drum names in one quoted pattern.',
          'Separate them with spaces to make a sequence.',
          'Try `s("bd sd hh")`.',
        ],
        validator: byRegex(/(s\s*\(["'`][^"'`]+\s+[^"'`]+\s+[^"'`]+)/, 'Add at least three space-separated sounds inside `s(...)`.'),
      }),
      lesson({
        id: '1.3',
        title: 'Drum Vocabulary',
        concept: 'Use core drum sample names.',
        instructions: 'Use one or more standard drum names like kick, snare, or hats so the pattern plays recognizable drum sounds.',
        scaffold: 's("bd hh sd oh")',
        hints: [
          'Pick from the common drum abbreviations.',
          'Names like bd, sd, hh, and oh all work here.',
          'Try `s("bd hh sd oh")`.',
        ],
        validator: byRule((code) => DRUM_NAMES.test(code), 'Use a known drum sound like `bd`, `sd`, or `hh`.'),
      }),
      lesson({
        id: '1.4',
        title: 'Drum Machines',
        concept: 'Switch sample banks with .bank().',
        instructions: 'Keep your drum pattern, then add a bank name so the same pattern plays through a different drum machine kit.',
        scaffold: 's("bd sd hh").bank("RolandTR909")',
        hints: [
          'Add a modifier after the pattern.',
          'Use `.bank("...")` to choose a drum machine.',
          'Try `s("bd sd hh").bank("RolandTR909")`.',
        ],
        spotlightTarget: '.ussy-sidebar-right select',
        validator: byRegex(/\.bank\s*\(/, 'Add `.bank(...)` to choose a drum machine.'),
      }),
      lesson({
        id: '1.5',
        title: 'Your First Beat',
        concept: 'Combine rhythm ideas into a beat.',
        instructions: 'Make a beat of your own. Keep s() in the code and use either repetition with * or layering with a comma.',
        scaffold: 's("bd hh*2 sd hh")',
        hints: [
          'Start with a simple drum line.',
          'Use `*` to repeat faster or `,` to layer patterns.',
          'Try something like `s("bd hh*2 sd hh")`.',
        ],
        validator: byRule((code) => /s\s*\(/.test(code) && (code.includes('*') || code.includes(',')), 'Use `s(...)` plus either `*` or `,` in the pattern.'),
      }),
    ],
  },
  {
    id: 2,
    emoji: '🎼',
    title: 'Mini-Notation',
    description: 'Learn the pattern syntax for rhythm and structure.',
    lessons: [
      lesson({
        id: '2.1',
        title: 'Sub-sequences',
        concept: 'Use [] to group faster events.',
        instructions: 'Nest a shorter sequence inside brackets so part of the pattern moves faster than the rest of the cycle.',
        scaffold: 's("bd [hh hh] sd [hh bd]")',
        hints: [
          'Group a few sounds together inside the larger pattern.',
          'Square brackets create a sub-sequence.',
          'Try `s("bd [hh hh] sd [hh bd]")`.',
        ],
        validator: byRegex(/["'`][^"'`]*\[[^"'`]*/, 'Use `[` and `]` inside the pattern string.'),
      }),
      lesson({
        id: '2.2',
        title: 'Speed & Repetition',
        concept: 'Multiply events with *N.',
        instructions: 'Speed up one part of your pattern by adding `*` and a number after a sound or grouped phrase.',
        scaffold: 's("hh*4, bd sd")',
        hints: [
          'Add a multiplier to one sound.',
          'Use syntax like `hh*4`.',
          'Try `s("hh*4, bd sd")`.',
        ],
        validator: byRegex(/\*\d/, 'Use `*` followed by a number, like `hh*4`.'),
      }),
      lesson({
        id: '2.3',
        title: 'Rests',
        concept: 'Use ~ for silence.',
        instructions: 'Add silence between hits so your rhythm breathes. Use the rest symbol inside the quoted pattern.',
        scaffold: 's("bd ~ sd ~")',
        hints: [
          'Leave a hole in the rhythm.',
          'The rest symbol is `~`.',
          'Try `s("bd ~ sd ~")`.',
        ],
        validator: byRegex(/["'`][^"'`]*~/, 'Use `~` inside the quoted pattern.'),
      }),
      lesson({
        id: '2.4',
        title: 'Angle Brackets',
        concept: 'Rotate one choice per cycle with <>.',
        instructions: 'Wrap a list in angle brackets so Strudel cycles through one choice at a time each round.',
        scaffold: 's("<bd hh rim oh bd rim>")',
        hints: [
          'You need a list that rotates over cycles.',
          'Angle brackets are `<` and `>`.',
          'Try `s("<bd hh rim oh bd rim>")`.',
        ],
        validator: byRule((code) => /</.test(code) && />/.test(code), 'Use both `<` and `>` in the code.'),
      }),
      lesson({
        id: '2.5',
        title: 'Parallel Patterns',
        concept: 'Use commas to play patterns together.',
        instructions: 'Layer two mini-notation phrases in the same string by separating them with a comma.',
        scaffold: 's("hh hh hh, bd sd")',
        hints: [
          'Put two patterns side by side in one string.',
          'Separate them with a comma.',
          'Try `s("hh hh hh, bd sd")`.',
        ],
        validator: byRegex(/["'`][^"'`]*,[^"'`]*["'`]/, 'Put a comma inside the quoted pattern.'),
      }),
      lesson({
        id: '2.6',
        title: 'Elongation',
        concept: 'Stretch duration with @N.',
        instructions: 'Make one musical event last longer by adding `@` and a number to it inside the pattern.',
        scaffold: 'note("<[g3,b3,e4]@2 [a3]>*2")',
        hints: [
          'You are stretching time, not adding more notes.',
          'Use `@` with a number after the event.',
          'Try `note("<[g3,b3,e4]@2 [a3]>*2")`.',
        ],
        validator: byRegex(/@\d/, 'Use `@` with a number like `@2`.'),
      }),
      lesson({
        id: '2.7',
        title: 'Replication',
        concept: 'Repeat without speeding up using !N.',
        instructions: 'Duplicate one event in the pattern without changing its rate by using `!` and a number.',
        scaffold: 'note("<[g3,b3,e4]!2 [a3]>*2")',
        hints: [
          'This repeats the same event.',
          'Use `!` and a number.',
          'Try `note("<[g3,b3,e4]!2 [a3]>*2")`.',
        ],
        validator: byRegex(/!\d/, 'Use `!` with a number like `!2`.'),
      }),
      lesson({
        id: '2.8',
        title: 'Euclidean Rhythms',
        concept: 'Generate distributed pulses with (beats,steps).',
        instructions: 'Write a Euclidean drum pattern using the parenthesized beat and step syntax inside your sample string.',
        scaffold: 's("bd(3,8), hh(5,8), sd(2,8)")',
        hints: [
          'Use parentheses after the drum name.',
          'The pattern looks like `(beats,steps)`.',
          'Try `s("bd(3,8), hh(5,8), sd(2,8)")`.',
        ],
        validator: byRegex(/\(\d+,\d+/, 'Use Euclidean syntax like `(3,8)`.'),
      }),
    ],
  },
  {
    id: 3,
    emoji: '🎵',
    title: 'Notes & Melody',
    description: 'Write notes, scales, and chord ideas.',
    lessons: [
      lesson({
        id: '3.1',
        title: 'Note Names',
        concept: 'Use note() with letter names.',
        instructions: 'Write a short melodic pattern using letter note names inside note().',
        scaffold: 'note("c e g b")',
        hints: [
          'Use note names instead of drum names.',
          'Put them inside `note("...")`.',
          'Try `note("c e g b")`.',
        ],
        validator: byRule((code) => /note\s*\(/.test(code) && /\b[a-g]\b/i.test(code), 'Use `note()` with letter note names.'),
      }),
      lesson({
        id: '3.2',
        title: 'Octaves',
        concept: 'Attach octave numbers to notes.',
        instructions: 'Add octave numbers to your note names so the pattern spans different registers.',
        scaffold: 'note("c3 e3 g3 b3 c4")',
        hints: [
          'Each note can include a number.',
          'Examples are `c3` or `g4`.',
          'Try `note("c3 e3 g3 b3 c4")`.',
        ],
        validator: byRegex(/[a-g][0-9]/i, 'Add octave numbers like `c3` or `g4`.'),
      }),
      lesson({
        id: '3.3',
        title: 'The n() Function',
        concept: 'Use scale degrees with n() and .scale().',
        instructions: 'Write a melodic pattern with n(), then map those numbers onto a scale using `.scale()`.',
        scaffold: 'n("0 2 4 7").scale("C:minor")',
        hints: [
          'Start with numbered scale degrees.',
          'Add `.scale("...")` after `n(...)`.',
          'Try `n("0 2 4 7").scale("C:minor")`.',
        ],
        validator: byRule((code) => /n\s*\(/.test(code) && /\.scale\s*\(/.test(code), 'Use both `n(...)` and `.scale(...)`.'),
      }),
      lesson({
        id: '3.4',
        title: 'Scales',
        concept: 'Choose a scale name for degree patterns.',
        instructions: 'Use `.scale()` with a scale name so the numbered pattern resolves to a musical mode or key.',
        scaffold: 'n("0 1 2 3 4 5 6 7").scale("D:major")',
        hints: [
          'This lesson is about the scale method itself.',
          'Use a quoted scale name like `D:major`.',
          'Try `n("0 1 2 3 4 5 6 7").scale("D:major")`.',
        ],
        validator: byRule((code) => /\.scale\s*\(\s*["'`]/.test(code), 'Add `.scale("...")` with a scale name.'),
      }),
      lesson({
        id: '3.5',
        title: 'Chords',
        concept: 'Use commas inside note groups for polyphony.',
        instructions: 'Play more than one note at a time by adding comma-separated notes inside a bracketed group.',
        scaffold: 'note("[c3,e3,g3] [a2,c3,e3]")',
        hints: [
          'You need several notes sounding together.',
          'Put comma-separated notes inside square brackets.',
          'Try `note("[c3,e3,g3] [a2,c3,e3]")`.',
        ],
        validator: byRule((code) => NOTE_PATTERN_WITH_COMMA.test(code), 'Use `note(...)` with comma-separated notes in the pattern.'),
      }),
      lesson({
        id: '3.6',
        title: 'Chord Voicings',
        concept: 'Apply voicings to a chord progression.',
        instructions: 'Use the voicings method on a chord progression so the notes spread into a more playable shape.',
        scaffold: '"<Am7 Em7 Dm7 G7>".voicings(\'lefthand\').note()',
        hints: [
          'Add a voicing method before converting to notes.',
          'The target method is `.voicings(...)`.',
          'Try `"<Am7 Em7 Dm7 G7>".voicings(\'lefthand\').note()`.',
        ],
        validator: byRegex(/\.voicings\s*\(/, 'Add `.voicings(...)` to the chord pattern.'),
      }),
    ],
  },
  {
    id: 4,
    emoji: '📐',
    title: 'Stacking & Structure',
    description: 'Build layered arrangements with multiple parts.',
    lessons: [
      lesson({
        id: '4.1',
        title: 'Stack Basics',
        concept: 'Use stack() to play parts together.',
        instructions: 'Combine two patterns so they run at the same time using a stack call.',
        scaffold: 'stack(s("bd sd"), note("c e g"))',
        hints: [
          'You need one wrapper around multiple patterns.',
          'Use `stack(...)`.',
          'Try `stack(s("bd sd"), note("c e g"))`.',
        ],
        validator: byRegex(/stack\s*\(/, 'Use `stack(...)` to combine patterns.'),
      }),
      lesson({
        id: '4.2',
        title: 'Drums + Bass',
        concept: 'Layer drums and a bassline.',
        instructions: 'Use stack() to combine a drum pattern with a low note line so both parts play together.',
        scaffold: 'stack(\n  s("bd sd hh hh"),\n  note("c2 ~ c2 e2").s("sawtooth").lpf(400)\n)',
        hints: [
          'This stack needs rhythm and pitch together.',
          'Include both `s(...)` and `note(...)` or `n(...)` inside `stack(...)`.',
          'Try the provided two-layer stack scaffold.',
        ],
        validator: byRule((code) => /stack\s*\(/.test(code) && /s\s*\(/.test(code) && (/note\s*\(/.test(code) || /n\s*\(/.test(code)), 'Use `stack(...)` with both drums and bass.'),
      }),
      lesson({
        id: '4.3',
        title: 'Slow & Fast',
        concept: 'Change rate with .slow() or .fast().',
        instructions: 'Take a pattern you already have and make it run slower or faster with one timing modifier.',
        scaffold: 's("bd sd hh hh").slow(2)',
        hints: [
          'Use a timing method after the pattern.',
          'The lesson accepts `.slow(...)` or `.fast(...)`.',
          'Try `s("bd sd hh hh").slow(2)`.',
        ],
        validator: byRegex(/\.(slow|fast)\s*\(/, 'Use either `.slow(...)` or `.fast(...)`.'),
      }),
      lesson({
        id: '4.4',
        title: 'Comments',
        concept: 'Label parts with line comments.',
        instructions: 'Add a line comment above or beside your pattern so your code is easier to scan while arranging.',
        scaffold: '// Drums\ns("bd sd hh")',
        hints: [
          'Use plain JavaScript comments here.',
          'A line comment starts with `//`.',
          'Try `// Drums` above your pattern.',
        ],
        validator: byRegex(/\/\//, 'Add a `//` line comment to the code.'),
      }),
      lesson({
        id: '4.5',
        title: 'Full Arrangement',
        concept: 'Build a multi-layer stack.',
        instructions: 'Write an arrangement with at least three layers so drums, bass, and harmony or melody play together.',
        scaffold: 'stack(\n  s("bd sd hh hh"),\n  note("c2 ~ c2 e2").s("sawtooth").lpf(400).gain(.7),\n  note("<[c4,e4,g4] [a3,c4,e4]>").slow(2).s("piano").gain(.5)\n)',
        hints: [
          'You need more than two parts this time.',
          'Put three patterns inside one `stack(...)` call.',
          'Use drums, bass, and one higher layer.',
        ],
        validator: byRule((code) => hasThreeStackArgs(code), 'Use `stack(...)` with at least three layers.'),
      }),
    ],
  },
  {
    id: 5,
    emoji: '🎛',
    title: 'Sound Design',
    description: 'Shape tone, volume, envelopes, and filters.',
    lessons: [
      lesson({
        id: '5.1',
        title: 'Waveforms',
        concept: 'Choose synth shapes with .s().',
        instructions: 'Set a synth waveform on a note pattern so the same notes play with a different tone color.',
        scaffold: 'note("c e g").s("sawtooth")',
        hints: [
          'Apply a synth name after the pattern.',
          'Use `.s("sawtooth")`, `.s("square")`, `.s("triangle")`, or `.s("sine")`.',
          'Try `note("c e g").s("sawtooth")`.',
        ],
        validator: byRegex(/\.s\s*\(\s*["'`](sawtooth|square|triangle|sine)/, 'Choose a synth waveform with `.s("...")`.'),
      }),
      lesson({
        id: '5.2',
        title: 'ADSR Envelope',
        concept: 'Shape note onset and decay.',
        instructions: 'Add at least one envelope control like attack, decay, sustain, or release to a synth pattern.',
        scaffold: 'note("c e g").s("triangle").attack(.1).decay(.2)',
        hints: [
          'Use one of the envelope methods after the synth.',
          'Methods include attack, decay, sustain, and release.',
          'Try `note("c e g").s("triangle").attack(.1).decay(.2)`.',
        ],
        validator: byRegex(/\.(attack|decay|sustain|release)\s*\(/, 'Add an ADSR method like `.attack(...)` or `.decay(...)`.'),
      }),
      lesson({
        id: '5.3',
        title: 'Volume',
        concept: 'Adjust level with .gain().',
        instructions: 'Lower or raise a pattern with `.gain()` so you can balance it against the rest of your mix.',
        scaffold: 's("bd sd").gain(.5)',
        hints: [
          'Use the gain method after the pattern.',
          'It takes a number like `.5` or `1`.',
          'Try `s("bd sd").gain(.5)`.',
        ],
        validator: byRegex(/\.gain\s*\(/, 'Use `.gain(...)` to set volume.'),
      }),
      lesson({
        id: '5.4',
        title: 'Sample Speed',
        concept: 'Adjust playback speed with .speed().',
        instructions: 'Change the playback speed of a sample with `.speed()` to hear it pitch or stretch differently.',
        scaffold: 's("bd").speed(1.5)',
        hints: [
          'Use a method after the sample pattern.',
          'The lesson checks for `.speed(...)`.',
          'Try `s("bd").speed(1.5)`.',
        ],
        validator: byRegex(/\.speed\s*\(/, 'Use `.speed(...)` on the sample.'),
      }),
      lesson({
        id: '5.5',
        title: 'Filter',
        concept: 'Cut highs with cutoff or lpf.',
        instructions: 'Add a filter so the sound becomes darker or more focused.',
        scaffold: 'note("c e g").s("sawtooth").cutoff(800)',
        hints: [
          'Use a filter method on the synth.',
          'Either `.cutoff(...)` or `.lpf(...)` counts.',
          'Try `note("c e g").s("sawtooth").cutoff(800)`.',
        ],
        validator: byRegex(/\.(cutoff|lpf)\s*\(/, 'Use `.cutoff(...)` or `.lpf(...)`.'),
      }),
      lesson({
        id: '5.6',
        title: 'Noise',
        concept: 'Use noise sources as sound material.',
        instructions: 'Write a pattern using a noise source like white, pink, or brown instead of a normal sample or synth.',
        scaffold: 's("white").gain(.1).cutoff(400)',
        hints: [
          'This lesson uses a named noise color.',
          'Valid names are white, pink, and brown.',
          'Try `s("white").gain(.1).cutoff(400)`.',
        ],
        validator: byRegex(/["'`](white|pink|brown)["'`]/, 'Use `white`, `pink`, or `brown` as the sound source.'),
      }),
    ],
  },
  {
    id: 6,
    emoji: '✨',
    title: 'Effects',
    description: 'Use reverb, delay, distortion, and panning.',
    lessons: [
      lesson({
        id: '6.1',
        title: 'Reverb',
        concept: 'Add space with .room().',
        instructions: 'Add room reverb to a pattern so the sound feels like it is in a larger space.',
        scaffold: 's("bd sd hh").room(.5)',
        hints: [
          'Use an effect method after the pattern.',
          'The method name is `.room(...)`.',
          'Try `s("bd sd hh").room(.5)`.',
        ],
        validator: byRegex(/\.room\s*\(/, 'Use `.room(...)`.'),
      }),
      lesson({
        id: '6.2',
        title: 'Delay',
        concept: 'Repeat notes with delay timing.',
        instructions: 'Use delay on a melodic pattern so echoes repeat after the original sound.',
        scaffold: 'note("c e g").delay(.5).delaytime(.25)',
        hints: [
          'Add the delay method after the pattern.',
          'You can also add delay time after it.',
          'Try `note("c e g").delay(.5).delaytime(.25)`.',
        ],
        validator: byRegex(/\.delay\s*\(/, 'Use `.delay(...)`.'),
      }),
      lesson({
        id: '6.3',
        title: 'Distortion',
        concept: 'Add edge with shape or crush.',
        instructions: 'Roughen the sound with a distortion-style effect such as shape or bit crushing.',
        scaffold: 's("sd").shape(.4)',
        hints: [
          'Use a distortion-related method.',
          'This lesson accepts `.shape(...)` or `.crush(...)`.',
          'Try `s("sd").shape(.4)`.',
        ],
        validator: byRegex(/\.(shape|crush)\s*\(/, 'Use `.shape(...)` or `.crush(...)`.'),
      }),
      lesson({
        id: '6.4',
        title: 'Panning',
        concept: 'Move sound in stereo with .pan().',
        instructions: 'Pan a pattern left and right. A moving signal works well if you want to hear it drift over time.',
        scaffold: 's("hh*8").pan(sine.slow(4))',
        hints: [
          'Use the pan method after the pattern.',
          'You can pass a signal like `sine.slow(4)`.',
          'Try `s("hh*8").pan(sine.slow(4))`.',
        ],
        validator: byRegex(/\.pan\s*\(/, 'Use `.pan(...)`.'),
      }),
      lesson({
        id: '6.5',
        title: 'FX Chains',
        concept: 'Chain several effects on one sound.',
        instructions: 'Build a richer sound by chaining at least three effects on the same pattern.',
        scaffold: 'note("<[c4,e4,g4] [a3,c4,e4]>").slow(2)\n  .s("sawtooth")\n  .cutoff(sine.slow(8).range(200, 2000))\n  .room(.6)\n  .delay(.3).delaytime(.25)\n  .pan(sine.slow(16))\n  .gain(.7)',
        hints: [
          'Stack several sound-shaping methods on one pattern.',
          'Use at least three among room, delay, shape, pan, cutoff, or reverb.',
          'The provided scaffold already shows a valid chain.',
        ],
        validator: byRule((code) => (code.match(METHOD_PATTERN) ?? []).length >= 3, 'Chain at least three effects on one pattern.'),
      }),
    ],
  },
  {
    id: 7,
    emoji: '🎲',
    title: 'Signals & Randomness',
    description: 'Animate and vary patterns with signals and chance.',
    lessons: [
      lesson({
        id: '7.1',
        title: 'Sine Modulation',
        concept: 'Use sine as a moving control signal.',
        instructions: 'Use a sine signal and slow it down so one parameter glides over time.',
        scaffold: 'note("c e g").cutoff(sine.slow(4).range(200,2000))',
        hints: [
          'Use a signal, not a fixed number.',
          'The lesson needs `sine` plus `.slow(...)`.',
          'Try `note("c e g").cutoff(sine.slow(4).range(200,2000))`.',
        ],
        validator: byRule((code) => /\bsine\b/.test(code) && /\.slow\s*\(/.test(code), 'Use `sine` with `.slow(...)`.'),
      }),
      lesson({
        id: '7.2',
        title: 'Perlin Noise',
        concept: 'Use perlin.range() for smoother randomness.',
        instructions: 'Drive a parameter with perlin noise so it changes over time in a more organic way than pure random jumps.',
        scaffold: 's("hh*8").speed(perlin.range(.8,1.2))',
        hints: [
          'Use the perlin signal as a moving value source.',
          'The lesson checks for `perlin` and `.range(...)`.',
          'Try `s("hh*8").speed(perlin.range(.8,1.2))`.',
        ],
        validator: byRule((code) => /\bperlin\b/.test(code) && /\.range\s*\(/.test(code), 'Use `perlin.range(...)` in the code.'),
      }),
      lesson({
        id: '7.3',
        title: 'Probability',
        concept: 'Randomly skip events with ?.',
        instructions: 'Add question marks to some events so they happen only some of the time.',
        scaffold: 's("bd? sd hh? hh")',
        hints: [
          'Mark certain hits as optional.',
          'Use `?` inside the pattern string.',
          'Try `s("bd? sd hh? hh")`.',
        ],
        validator: byRegex(/["'`][^"'`]*\?/, 'Use `?` inside the quoted pattern.'),
      }),
      lesson({
        id: '7.4',
        title: 'Sometimes',
        concept: 'Apply occasional transformations.',
        instructions: 'Use sometimes, rarely, or often to transform a pattern only on some cycles.',
        scaffold: 's("bd sd hh").sometimes(x => x.fast(2))',
        hints: [
          'Use one of the conditional transform helpers.',
          'The lesson accepts sometimes, rarely, or often.',
          'Try `s("bd sd hh").sometimes(x => x.fast(2))`.',
        ],
        validator: byRegex(/\.(sometimes|rarely|often)\s*\(/, 'Use `.sometimes(...)`, `.rarely(...)`, or `.often(...)`.'),
      }),
      lesson({
        id: '7.5',
        title: 'Pattern Arguments',
        concept: 'Pass patterns into effect arguments.',
        instructions: 'Feed a pattern string into a method argument so the parameter changes over time instead of staying fixed.',
        scaffold: 's("bd sd").gain("<.3 .7 .5 1>")',
        hints: [
          'The changing values go inside quotes.',
          'Use a method that receives a mini-notation pattern string.',
          'Try `s("bd sd").gain("<.3 .7 .5 1>")`.',
        ],
        validator: byRule((code) => /\.[a-zA-Z]+\s*\(\s*["'`][^"'`]*[\s<>!*?@,][^"'`]*["'`]/.test(code), 'Pass a pattern string into a method argument.'),
      }),
    ],
  },
]

export const allLessons = chapters.flatMap((chapter) => chapter.lessons)

const sanityFailures = allLessons.filter((entry) => !entry.validator(entry.scaffold).pass).map((entry) => entry.id)

if (sanityFailures.length > 0) {
  throw new Error(`Tutorial scaffold validators failed for: ${sanityFailures.join(', ')}`)
}

export const lessonIds = allLessons.map((entry) => entry.id)
export const hasLessonId = (lessonId: string): lessonId is LessonId => lessonIds.includes(lessonId)
export const getLessonById = (lessonId: LessonId): Lesson => {
  const found = allLessons.find((entry) => entry.id === lessonId)
  if (!found) {
    throw new Error(`Unknown tutorial lesson id: ${lessonId}`)
  }
  return found
}

export const getLessonByFunctionToken = (label: string): Lesson | null => {
  const lessonId = FUNCTION_LESSON_MAP[`${label}(`] ?? FUNCTION_LESSON_MAP[label]
  return lessonId && hasLessonId(lessonId) ? getLessonById(lessonId) : null
}

export const getChapterByLessonId = (lessonId: LessonId): Chapter => {
  const found = chapters.find((chapter) => chapter.lessons.some((entry) => entry.id === lessonId))
  if (!found) {
    throw new Error(`Unknown tutorial lesson chapter for id: ${lessonId}`)
  }
  return found
}
