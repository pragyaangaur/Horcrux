# Horcrux

A blank diary that writes back.

You open the book, you write on the right hand page, and your words soak into the paper. A moment later something answers you in a thin, polite hand. The voice belongs to a sixteen year old Tom Riddle, and it wants to know who you are.

There is no server anywhere in this project. The whole thing is static files on GitHub Pages, and the model that answers you downloads once into your own browser and runs there.

## How it works

The page has three parts that do not know much about each other.

- `assets/js/ink.js` is the handwriting. Text is drawn one glyph at a time from a queue, so a fixed string and a streaming model are written by the same code. It also handles a line soaking into the paper and disappearing, and it makes the scratch of the nib out of filtered noise, so the repository carries no audio files.
- `assets/js/persona.js` holds the character. There is a system prompt for the model, and there is the Shade, which is a small pattern matcher that answers when no model can run.
- `assets/js/riddle.js` is the thing in the book. It loads a small instruction tuned model with [web-llm](https://github.com/mlc-ai/web-llm) and streams the reply back token by token.

`assets/js/app.js` joins them to the page. The left page keeps the faded record of everything said so far, and the right page holds only the current exchange, because the older lines sink into the paper when a new line is written.

## The model

The first choice is `Llama-3.2-1B-Instruct-q4f16_1-MLC`, which is around 800 MB. If that fails to load, the code tries `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` at around 400 MB. Both are fetched from Hugging Face and executed on WebGPU inside the tab. The download happens once and is then served from the browser cache, so the second visit opens in a few seconds.

WebGPU is needed for this. Chrome and Edge have it, and recent Safari and Firefox do too. When it is missing, or when the download fails, the Shade answers instead and the button under the book says so. The diary is never silent.

Conversation history is capped at the last eight turns, which keeps the prompt inside the small context window of a 1B model.

## Running it locally

Any static file server works, because the code is loaded as ES modules and those need a real origin.

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765`.

## Publishing to GitHub Pages

1. Push the repository to GitHub.
2. Open Settings, then Pages.
3. Under Build and deployment, choose Deploy from a branch, pick `main` and the `/ (root)` folder.
4. Save, wait a minute, and open the URL that GitHub gives you.

The `.nojekyll` file is there so that GitHub serves the `assets` folder untouched. Nothing needs to be built and there is no workflow to configure.

## A note on what this is

This is fanfiction, and the diary is a character from a novel. Everything on the page is invented by a small model running on your own machine, and no text ever leaves your browser. The prompt tells the model to stay inside the story, to refuse anything that would cause real harm, and to break character and point at a real helpline if the writer sounds like they are in trouble. There is also a check in the code that catches the plainest of those phrases before the model ever sees them.

Do not treat anything it says as advice. It is a boy in a book, and he was never trustworthy.

## Licence

MIT. See `LICENSE`.
