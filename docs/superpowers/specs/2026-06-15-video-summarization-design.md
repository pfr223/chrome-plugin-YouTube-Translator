# Current Video Summarization Design

## Goal

Add a manual "summarize current video" feature to the YouTube page UI, built on top of the existing caption timeline and provider request pipeline. The feature should generate a Simplified Chinese summary for the current video, with highlights and timestamped chapter points that can jump back into the video.

## Confirmed Product Decisions

- The summary UI appears inside the YouTube watch page as a right-side or player-adjacent floating panel.
- The user manually starts generation by clicking a "summarize current video" button, so API cost is explicit.
- The output structure is `summary`, `highlights`, and timestamped `chapters`.
- Generated summaries are cached per video/model/input in memory and can be regenerated manually.
- Chapter timestamps are clickable and seek the YouTube video to the relevant point.

## User Experience

The content script injects a summary panel on YouTube watch pages. Desktop layout should place it near the right side of the page, visually separate from the subtitle overlay. On narrow screens it should collapse into a bottom drawer or compact floating panel so it does not cover the player controls or active subtitles.

The panel has these states:

- Initial: shows a primary action to summarize the current video.
- Loading captions: disables generation and explains that the subtitle timeline is still loading.
- No full timeline: explains that complete captions are required before summarization.
- Missing API key: explains that the user must configure an API key in extension settings.
- Generating: shows an in-panel loading state and keeps the panel usable enough to cancel/close visually.
- Ready: shows the generated summary, highlights, chapters, and a regenerate action.
- Error: shows the provider or parsing error plus a retry action.

The ready content uses this layout:

- `摘要`: one concise Chinese paragraph, roughly 150-250 Chinese characters.
- `亮点`: 3-6 bullets with the video's most useful points.
- `章节要点`: 5-10 timestamped sections when the source is long enough. Each section contains a start timestamp, a short title, and 1-2 concise points.

Clicking a chapter timestamp sets the current `<video>` element's `currentTime` to the chapter `start`. The seek action should preserve the current play/pause state where practical, rather than unexpectedly forcing playback.

## Architecture

Keep the existing responsibility split:

- `src/content_script.js`: owns YouTube page state, existing `state.timeline`, summary panel DOM, button interactions, and chapter seeking.
- `src/background.js`: owns settings lookup, API key checks, provider request execution, summary cache, and the `YTCT_SUMMARIZE_VIDEO` message handler.
- `src/core.js`: owns pure functions for prompt construction, timeline compaction, response parsing, and cache key creation.
- `src/content_script.css`: owns the summary panel layout, responsive behavior, loading/error/ready states, and accessible controls.
- `tests/core.test.js`: covers core summary prompt, compaction, parsing, cache key stability, and light static checks for UI/message integration.

This avoids duplicating caption fetching. Summarization should use the existing `state.timeline` produced by transcript/timed-text loading. If the page only has fallback visible-caption mode and no complete timeline, the summary feature should not call the provider.

## Data Flow

1. The content script injects or ensures the summary panel on YouTube watch pages.
2. The content script watches the existing timeline state:
   - `loading`: generation disabled.
   - `track` with cues: generation enabled.
   - `fallback`: generation disabled unless a transcript retry later produces a full timeline.
3. On click, the content script sends `YTCT_SUMMARIZE_VIDEO` to the background script with:
   - `videoId`
   - `metadata` from `readMetadata()`
   - timeline cues containing only `id`, `start`, `end`, and `source`
   - optional `force: true` for regeneration
4. The background script reads normalized settings, checks the active provider API key, builds a cache key, and returns a cached result unless `force` is true.
5. On cache miss, the background script builds a summary prompt through `core.buildVideoSummaryPrompt`, sends it via the existing provider request builder, parses the result through `core.parseVideoSummaryResponse`, caches it, and returns it.
6. The content script renders the structured result in the summary panel.

## Prompt And JSON Contract

The provider prompt requires Simplified Chinese and a strict JSON object:

```json
{
  "summary": "150-250字中文整体摘要",
  "highlights": [
    "关键亮点"
  ],
  "chapters": [
    {
      "start": 0,
      "title": "章节标题",
      "points": [
        "章节要点"
      ]
    }
  ]
}
```

Prompt constraints:

- Use only information supported by the captions.
- Preserve technical terms, code, formulas, variable names, product names, and model names when translation would reduce clarity.
- Prefer concise course-note style Chinese.
- Chapters should use start times close to real cue start times.
- Short videos may return fewer chapters and highlights, but must keep the same JSON shape.

Parsing should accept:

- raw JSON
- fenced JSON
- JSON embedded in surrounding provider prose

Parsing should normalize empty strings away, clamp negative/non-finite chapter starts to `0`, keep only non-empty highlights, keep only chapters with a title or points, and return an empty object shape only when no useful content exists.

## Long Video Handling

Use a single-request compaction strategy for the first version.

`core.compactTimelineForSummary` should merge nearby short cues into timestamped text segments and enforce a character budget. For over-budget videos, it should sample across the full video instead of preserving only the beginning. This keeps the first implementation simple while avoiding summaries that ignore later sections.

Initial budget target:

- Prompt input from captions: approximately 40k-60k characters before model-specific request serialization.
- Output tokens: up to 2048 or 3072, enough for summary, highlights, and chapters.

If real usage shows frequent truncation or weak summaries on multi-hour videos, a later iteration can add map-reduce summarization. That is intentionally out of scope for the first version.

## Cache Design

Use an in-memory `summaryCache` in `src/background.js`, matching the current translation cache style. Do not persist summaries to `chrome.storage` in the first version.

Cache key inputs:

- `videoId`
- active provider
- active model
- normalized custom instructions
- stable hash or stable string derived from compacted summary input

The regenerate action sends `force: true`, bypasses the cache, and stores the new result.

## Error Handling

User-facing failures should stay inside the summary panel and not affect live subtitle translation.

- Missing API key: show the existing settings guidance.
- Disabled extension: show that summarization follows the extension enabled state.
- Timeline loading: disable the action until captions are ready.
- No full timeline: explain that the current video has no complete usable captions.
- Provider timeout or non-OK response: show the background error text and a retry action.
- Empty or malformed model response: show an "summary parsing failed" error and allow retry.

Summary API failures must not clear current subtitle translations or reset the caption timeline.

## Testing Plan

Add focused tests in `tests/core.test.js`:

- `buildVideoSummaryPrompt` includes metadata, compacted timestamped captions, custom instructions, and the JSON contract.
- `compactTimelineForSummary` preserves timestamps, merges short cues, removes empty cues, and respects a character budget while sampling across the video.
- `parseVideoSummaryResponse` parses raw JSON, fenced JSON, and embedded JSON; removes empty highlights and invalid chapters.
- `createVideoSummaryCacheKey` is stable across whitespace-only caption changes and changes when the caption content changes.
- Static checks verify `src/content_script.js` contains the summary panel class, `YTCT_SUMMARIZE_VIDEO` message use, regenerate path, and a chapter seek helper.

Run the fastest checks after implementation:

```bash
npm test
npm run check
```

## Out Of Scope For First Version

- Persistent summary storage in `chrome.storage`.
- Automatic summary generation on page load.
- Multi-stage map-reduce summarization for very long videos.
- Summarizing videos without any complete caption timeline.
- Separate provider/model settings only for summary.
