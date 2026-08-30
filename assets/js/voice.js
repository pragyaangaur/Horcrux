/* The thing in the book.
   The book opens on the Shade, which is a small pattern matcher that can answer at once.
   A language model downloads in the background and takes over when it arrives. If it never
   arrives, because there is no WebGPU or the fetch fails, the Shade keeps the diary going. */

import { SYSTEM_PROMPT, PRIMER, Shade } from "./persona.js";

const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";

/* The first load is the slow part, so the default is the smallest model that still holds
   a character. The deeper one writes better and costs twice the download, and it is only
   used when the reader asks for it. */
export const MODELS = [
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", size: "about 400 MB" },
  { id: "SmolLM2-360M-Instruct-q4f16_1-MLC", size: "about 250 MB" }
];

export const DEEP_MODEL = { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", size: "about 800 MB" };

const TURNS = 8;

/* A short list of phrases that should never be answered in character. */
const CRISIS = /\b(kill myself|killing myself|end my life|suicide|suicidal|want to die|hurt myself|self harm|cut myself|no reason to live)\b/i;

export function looksLikeCrisis(text) {
  return CRISIS.test(String(text || ""));
}

export const CRISIS_REPLY = "I am stopping the game here. I am only a page in a book, and this part is real. Please talk to someone you trust tonight, or call a local crisis line, and stay near people who know your name.";

export class Voice {
  constructor({ onProgress, onReady, deep = false } = {}) {
    this.onProgress = onProgress || (() => {});
    this.onReady = onReady || (() => {});
    this.candidates = deep ? [DEEP_MODEL, ...MODELS] : MODELS;
    this.engine = null;
    this.mode = "asleep";
    this.model = null;
    this.shade = new Shade();
    this.history = [];
  }

  get ready() {
    return this.mode === "model" || this.mode === "shade";
  }

  /* Fetch the loader while the reader is still looking at the closed book. The library and
     its wasm are a few megabytes on their own, and this takes them off the critical path.
     The promise is kept so that awaken reuses it instead of importing a second time. */
  warm() {
    if (!this.library && navigator.gpu) {
      this.library = import(/* @vite-ignore */ WEBLLM_URL).catch(() => null);
    }
    return this.library;
  }

  /* Open the book without waiting for anything. The Shade answers from the first line and
     the model is fetched behind it, because nobody should watch a download to say hello. */
  open() {
    if (this.mode === "asleep") this.mode = "shade";
    this.loading = this.loading || this.load();
    return this.mode;
  }

  /* Fetch the model and switch to it when it is there. Returns the mode that ended up in use. */
  async load() {
    if (this.mode === "model") return this.mode;

    if (!navigator.gpu) {
      this.onProgress({ text: "No WebGPU here. The shade will answer instead.", ratio: 1, done: true });
      this.mode = "shade";
      return this.mode;
    }

    const webllm = await this.warm();
    if (!webllm) {
      this.onProgress({ text: "The loader did not arrive. The shade will answer.", ratio: 1, done: true });
      this.mode = "shade";
      return this.mode;
    }

    for (const candidate of this.candidates) {
      try {
        this.onProgress({ text: `Waking ${candidate.size}`, ratio: 0 });
        this.engine = await webllm.CreateMLCEngine(candidate.id, {
          initProgressCallback: (report) => {
            this.onProgress({ text: report.text, ratio: report.progress ?? 0 });
          }
        });
        this.model = candidate.id;
        this.mode = "model";
        this.onProgress({ text: "", ratio: 1, done: true });
        this.onReady(candidate);
        return this.mode;
      } catch (error) {
        console.warn(`could not load ${candidate.id}`, error);
      }
    }

    this.onProgress({ text: "The model would not load. The shade will answer.", ratio: 1, done: true });
    this.mode = "shade";
    return this.mode;
  }

  /* Yields pieces of the reply as they are produced. */
  async *stream(input) {
    const text = String(input || "").trim();
    if (!text) return;

    if (looksLikeCrisis(text)) {
      this.remember(text, CRISIS_REPLY);
      yield CRISIS_REPLY;
      return;
    }

    if (this.mode !== "model") {
      const reply = this.shade.reply(text);
      this.remember(text, reply);
      for (const piece of reply.split(/(?<=\s)/)) yield piece;
      return;
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...PRIMER,
      ...this.history.slice(-TURNS),
      { role: "user", content: text }
    ];

    let reply = "";
    try {
      const chunks = await this.engine.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.3,
        max_tokens: 110
      });
      for await (const chunk of chunks) {
        const piece = chunk.choices?.[0]?.delta?.content || "";
        if (!piece) continue;
        reply += piece;
        yield piece;
      }
    } catch (error) {
      console.warn("generation failed, falling back to the shade", error);
      const fallback = this.shade.reply(text);
      reply = fallback;
      yield fallback;
    }

    this.remember(text, clean(reply));
  }

  remember(user, assistant) {
    this.history.push({ role: "user", content: user });
    this.history.push({ role: "assistant", content: assistant });
    if (this.history.length > TURNS * 2) this.history = this.history.slice(-TURNS * 2);
  }

  forget() {
    this.history = [];
    this.shade.forget();
  }
}

/* Small models like to add narration and quotation marks. Strip the obvious ones. */
function clean(text) {
  return String(text)
    .replace(/\*[^*]*\*/g, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
}
