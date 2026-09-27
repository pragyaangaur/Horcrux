# Horcrux

Context for anyone, human or AI, picking this up cold. Written 4 September 2026.

The folder on disk is "Tom Riddle's Diary"; the project and repo are Horcrux.

## What it is

A blank diary web page that writes back. You write on the right hand page, the words soak into the paper, and a memory answers in ink. A small language model runs inside the reader's own browser, so nothing anyone writes ever leaves their machine.

- Repo: https://github.com/pragyaangaur/Horcrux
- Live: https://pragyaangaur.github.io/Horcrux/
- Language: plain HTML, CSS and vanilla JavaScript, plus an in-browser LLM runtime.

## Status

**Update, 23 September 2026.** Checked. Nothing has changed since the 6 September commit that ignores the local `.claude` folder, and the live page still loads.

Finished and shipped. 38 commits, all on 30 August 2026, ending at `a4a7fd1 fix(persona): say plainly that Pragyaan is a boy`. Nothing is in progress.

## Layout

| File | Job |
| --- | --- |
| `index.html` | The book. |
| `assets/css/diary.css` | Parchment grain, candlelight, ink. |
| `assets/js/ink.js` | Draws and dissolves handwriting one glyph at a time. |
| `assets/js/persona.js` | The voice and the offline shade that stands in before the model loads. |
| `assets/js/voice.js` | Model loading, streaming, size selection. |
| `assets/js/ledger.js` | The short memory kept between visits. |
| `assets/js/app.js` | Joins the page, the ink and the model together. |

## The persona, and why it is written the way it is

The memory in the book is Pragyaan Gaur, twenty years old, from Delhi. It is polite, calm, and far too interested in who you are. Several commits exist purely to hold that line, so treat them as constraints rather than trivia.

- The memory treats the writer as a stranger, never as Pragyaan. Two commits fixed the model answering as the writer or stealing their name.
- The first words are held back until the repair pass has run, so a stolen name never reaches the page.
- The persona is primed with two example exchanges. Removing them makes the voice drift.
- The memory is a boy, from Delhi, and twenty. These were each corrected in their own commit.

## How the build progressed

Roughly in order: scaffold, page styling, glyph-by-glyph ink, the persona and its offline shade, the in-browser model with streaming, then a long tail of performance and accessibility work. The performance passes are the interesting ones. The model download starts when the reader reaches for the cover rather than on page load, the book opens on the offline shade and swaps to the model behind it, the page preconnects to the hosts the download needs, and the ink stops measuring the page on every letter. Accessibility work added a visible focus ring, announced finished lines, and made reduced-motion write the whole line at once rather than animating.

## Things to know before changing it

- Three model sizes are offered, the deep voice is the default, and the choice is remembered in the address bar and in local storage.
- Ten exchanges of history are sent back to the model, raised from four.
- The note kept between visits persists across sessions, and the book asks before forgetting.
- If the tab is hidden or motion is reduced, the line finishes at once instead of animating.

## Working on it

No build step. Serve the folder statically and reload.
