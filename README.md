# Horcrux

A blank diary that writes back.

The book on the screen belongs to Pragyaan Gaur, kept at sixteen inside a horcrux, in the way Tom Riddle kept himself inside one in the story. You write on the right hand page, your words soak into the paper, and a moment later the memory answers you in a thin, careful hand. It is polite, it is calm, and it is far too interested in who you are.

There is no server in this project. Everything is static files on GitHub Pages, and the model that answers you downloads once into your own browser and runs there. No text you write ever leaves your machine.

## How it works

The page has three parts, and each one can be read on its own.

- `assets/js/ink.js` is the handwriting. Text is drawn one glyph at a time out of a queue, so a fixed string and a streaming model are written by the same code. It also handles a line soaking into the paper and vanishing, and it builds the scratch of the nib from filtered noise, so the repository carries no audio files.
- `assets/js/persona.js` holds the character. There is the system prompt, two example exchanges that show the model how short an answer should be, and the Shade, which is a small pattern matcher that answers when no model can run.
- `assets/js/voice.js` is the thing in the book. It loads a small instruction tuned model with [web-llm](https://github.com/mlc-ai/web-llm) and streams the reply back token by token.

`assets/js/app.js` joins them to the page. The left page keeps a faded record of everything said so far. The right page holds only the current exchange, because the older lines sink into the paper when a new line is written.

## Speed, and the two model sizes

The first visit has to download the model, and that is the only slow part of the whole project.

By default the diary loads `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`, which is about 400 MB. If that fails it falls back to `SmolLM2-360M-Instruct-q4f16_1-MLC` at about 250 MB. The web-llm library and its wasm are fetched while the book is still shut, so the click on the cover only pays for the weights.

The Deeper voice button under the book reloads the page with `?voice=deep` and uses `Llama-3.2-1B-Instruct-q4f16_1-MLC` instead, which is about 800 MB. It writes noticeably better and takes about twice as long to arrive. The choice is made before the model loads, which is why the button reloads the page.

Either way the download happens once and is then served from the browser cache, so a second visit opens in a few seconds. Clearing site data for the page is what makes it download again.

## When there is no WebGPU

The model runs on WebGPU, which Chrome and Edge have, and which recent Safari and Firefox have too. When it is missing, or when the download fails, the Shade answers instead and the button under the book says so. The diary is never silent.

Conversation history is capped at the last eight turns, which keeps the prompt inside the small context window of these models.

## Running it locally

Any static file server works, because the code is loaded as ES modules and those need a real origin.

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765`.

## Publishing to GitHub Pages

1. Push the repository to GitHub.
2. Open Settings, then Pages.
3. Under Build and deployment, choose Deploy from a branch, then pick `main` and the `/ (root)` folder.
4. Save, wait a minute, and open the URL that GitHub gives you.

The `.nojekyll` file is there so that GitHub serves the `assets` folder untouched. Nothing needs to be built, and there is no workflow to configure.

## A note on what this is

This is fanfiction built on the world of the Harry Potter books, and the diary is a character. Everything on the page is invented by a small model running on your own machine. The prompt tells it to stay inside the story, to refuse anything that would cause real harm, and to drop the character and point at a real helpline if the writer sounds like they are in trouble. There is also a check in `voice.js` that catches the plainest of those phrases before the model ever sees them.

Do not treat anything it says as advice. It is a memory in a book, and memories in books are not to be trusted.

## Licence

MIT. See `LICENSE`.
