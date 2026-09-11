# shoedelussy UI

Frontend for the shoedelussy DAW MVP.

Upstream credit: the editor/runtime foundation comes from [VoloBuilds/toaster](https://github.com/VoloBuilds/toaster), with shoedelussy extending it through wrapper components and orchestration rather than replacing the core editor internals.

## What Is In This UI

- DAW-style three-column project page at `/` with two switchable modes:
  - **Ussy mode** — CSS Grid layout with resizable, collapsible panels, ussy design tokens, focus mode
  - **Legacy mode** — preserved original fixed three-column layout (toggle with `Cmd+Shift+L`)
- projects gallery at `/projects`
- diff-aware AI chat review flow
- streaming assistant responses with a live typing bubble
- Strudel editor + playback using the existing upstream editor/runtime
- parsed BPM, key, section, and per-track gain/pan metadata from current code
- guest-mode local project persistence
- version history refresh + restore panel
- preview/apply/reject AI patch flow with multiple pending diffs keyed per assistant message
- slim single-row topbar with settings drawer (4 tabs: AI Settings, Prompts, API, Export & Share), master volume slider, token usage pill, and optional custom chat provider override
- collapsible accordion DAW sidebar with localStorage-persisted section state (Mixer, Rhythm Generator, Arrange, FX Rack, Version History) and Collapse All / Expand All toggle
- rhythm generator with per-voice gain, arrange panel, FX rack with explicit on/off filter states, mutate toolbar, shortcut overlay
- focus mode (`Cmd+Shift+F`) hides topbar and both sidebars; floating toggle always visible
- panel toggle shortcuts (`[` for chat, `]` for DAW) with contenteditable/CodeMirror guard
- slim 44px transport bar with phase progress indicator, play pulse animation, and error status alerts
- resize handles on both chat and DAW panels with min/max width constraints and collapse-to-icon-rail
- lazy-loaded HAL visualization (code-split chunk) rendered inside the editor panel as a background layer
- ussy design system with `--ussy-*` CSS custom properties (electric teal accent, alpha-blended dividers, motion contract)
- full ARIA accessibility: tablist/tab/tabpanel in settings drawer, aria-labels on icon-only buttons, role=progressbar on phase bar, aria-expanded on accordion headers and settings toggle
- `ArrangePanel`, `FxRack`, `RhythmGenerator` wrapped in `React.memo` for render optimization
- stable `useCallback` references in DawPanel to prevent unnecessary child re-renders

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

## Environment

Optional `ui/.env`:

```bash
VITE_API_URL=http://localhost:8788
```

## Important Files

- `src/pages/HomePage.tsx` - DAW composition shell with `uiMode` state (`'ussy' | 'legacy'`), `Cmd+Shift+L` toggle, shared shellProps, and floating mode toggle button
- `src/hooks/useChatOrchestrator.ts` - chat, preview, autosave, version, and editor orchestration
- `src/pages/ProjectsPage.tsx` - gallery page
- `src/stores/projectStore.ts` - Zustand project/session state
- `src/lib/api.ts` - API client
- `src/lib/codeParser.ts` - BPM/key/section/track parsing plus FX, arrange, and mutation helpers
- `src/components/DAWShell.tsx` - Ussy mode layout shell: CSS Grid with `--chat-width`/`--daw-width` CSS vars, pointer-event resize handles with `setPointerCapture`, collapse-to-icon-rail, focus mode (`Cmd+Shift+F`), `[`/`]` panel toggle, panel widths and collapse states persisted to localStorage (widths debounced 300ms), `React.cloneElement` injection of `onCollapse` into ChatPanel
- `src/components/LegacyDAWShell.tsx` - preserved copy of original fixed three-column DAWShell layout
- `src/components/StrudelEditor.tsx` - existing editor extended with line jumping and imperative evaluate hook
- `src/components/VersionHistoryPanel.tsx` - snapshot refresh/restore UI
- `src/components/ProjectTopbar.tsx` - slim 40px single-row topbar with settings drawer (4 tabs: AI Settings, Prompts, API, Export & Share), editable BPM number input and Key text input, token usage pill with `≈` prefix format and red pulse warning at high usage, model selector with 160px max-width and overflow tooltip, master volume, viz toggle, `Cmd+,` to open / Escape to close, active tab badge on gear button, ARIA tab roles
- `src/components/TransportBar.tsx` - slim 44px transport dock with play/stop, undo/redo (aria-labeled), save, error status (role=alert), phase progress bar (role=progressbar), and expanding ring pulse animation
- `src/components/EditorPanel.tsx` - Strudel editor wrapper with lazy-loaded HAL background (React.lazy + Suspense), analyser passthrough, section strip, and mutate toolbar
- `src/components/ChatPanel.tsx` - session chat with header bar (message count badge, clear button, collapse chevron), `onCollapse` and `onClear` callback props, all colors migrated to `--ussy-*` tokens, teal accent on send button and YOLO checkbox
- `src/components/DawPanel.tsx` - accordion sidebar with 5 collapsible sections (Mixer, Rhythm Generator, Arrange, FX Rack, Version History), SectionHeader with badges (track count, section count, FX count, version count), ResizeObserver-based AnimatedSection with dynamic duration proportional to content height, floating slider value popover on gain/pan drag, localStorage persistence, Collapse All/Expand All, stable useCallback references, ussy design tokens, `prefers-reduced-motion` support
- `src/components/HalVisualization.tsx` - HAL background layer driven by the live Strudel analyser (lazy-loaded, code-split), also rendered in the viz panel slot via Suspense in HomePage
- `src/components/RhythmGenerator.tsx` - Euclidean drum pattern helper with per-voice gain control (React.memo wrapped)
- `src/components/ArrangePanel.tsx` - per-track mask scheduling helper with a fixed 16-step grid (React.memo wrapped)
- `src/components/FxRack.tsx` - global track FX application helper with explicit filter enable/disable toggles (React.memo wrapped)
- `src/components/ShortcutsOverlay.tsx` - keyboard shortcut reference modal with 10 shortcuts grouped into 4 sections
- `src/index.css` - ussy design system: `--ussy-*` CSS custom properties (surface palette, accent color, text hierarchy, alpha-blended dividers, motion contract, panel transitions, resize handles, focus mode classes, expanding ring pulse animation, token pill colors with red pulse warning, accordion chevron rotation, `prefers-reduced-motion` support for all animations)

## Notes

- The live UI should always expose a prominent `Source` link and `License` link because the deployed app includes AGPL-licensed Strudel-derived components.
- The repo-level disclosure note lives at `../docs/STRUDEL_SOURCE_DISCLOSURE.md`.
- Track mixer sliders patch per-track `gain()` and `pan()` calls live in the code and trigger a debounced re-evaluation while playback is active.
- Slider commits create version snapshots on pointer/key release when the code actually changed.
- AI previews can audition a proposed patch in the editor before Apply; Reject or Stop Preview restores the pre-preview snapshot.
- Empty or truncated streamed chat responses are retried once automatically before an error message is shown.
- The chat footer includes `Retry last` plus a `YOLO: auto-apply patches` toggle for immediate AI patch application.
- Older chat turns are summarized while recent ones stay verbatim, and the topbar shows an approximate token count for the current context window.
- The Ussy mode shell uses a CSS Grid three-column layout with resizable, collapsible sidebars. Both chat and DAW panels can be collapsed to 40px icon rails via chevron buttons or keyboard shortcuts (`[`/`]`).
- The Legacy mode shell preserves the original fixed three-column layout for comparison. Toggle between modes with `Cmd+Shift+L`.
- Focus mode (`Cmd+Shift+F`) hides the topbar and both sidebars, leaving only the editor and transport bar. A floating button is always visible to exit.
- HAL now renders inside the editor panel as a lazy-loaded background layer beneath the code, code-split into its own chunk (~8 KB).
- The topbar viz toggle can hide that background layer entirely without affecting editor or transport behavior.
- The DAW sidebar uses collapsible accordion sections with animated expand/collapse and localStorage-persisted open/close state.
- `ArrangePanel`, `FxRack`, and `RhythmGenerator` are wrapped in `React.memo`; DawPanel uses stable `useCallback` references to prevent unnecessary child re-renders.
- The `[` and `]` shortcuts are guarded against firing in text inputs, textareas, selects, and contenteditable elements (including CodeMirror's editor).
- The editor remains the upstream toaster Strudel editor; it was extended rather than replaced.
- `pnpm preview` is only the local Vite production preview, not the production hosting path.
- Public `strudel.ussyco.de` hosting should use a production build, not the Vite dev server. `shoe.ussyco.de` can be served as an alias, but copied share links should remain canonical on `strudel.ussyco.de`.
- The DAW shell is intentionally designed around panel-local scrolling rather than document-level page scrolling.
- Chat requests default to `google/gemini-2.5-flash`, but users can provide a custom endpoint + API key override in the settings drawer.
- When a custom provider is configured, clicking `Load Models` populates the model selector from that provider's `/models` API.
- The settings drawer switches between a legacy toaster prompt and a stricter Shoedelussy prompt tuned for full-code JSON responses and safer Strudel edits.
- Users can also append their own custom system prompt instructions from the Prompts tab without replacing the selected base prompt entirely.
- The custom prompt area starts with the baseline prompt template loaded, can swap to the improved template, and lets users save named prompt presets to localStorage for repeatable testing.
- The settings drawer is organized as a tabbed panel (AI Settings, Prompts, API, Export & Share) with full ARIA tab roles.
- The topbar master volume slider controls a shared gain stage in the Strudel audio output, so it affects live playback immediately without rewriting code.
- The editor now passes its live `AnalyserNode` through the orchestrator into `HalVisualization`, restoring audio-reactive HAL motion closer to toaster's feel.
- Share success now shows the generated URL in the right-side DAW panel and offers a `Copy link` action; failures show a warning instead of the old `Share failed` placeholder.
- Streaming chat updates are throttled/buffered and repeated identical Strudel warnings are suppressed so long responses put less pressure on the audio thread.
