/* The thing in the book.
   The first choice is a small language model that downloads once and then runs inside
   the browser tab on WebGPU. If that is not possible, the Shade answers instead, so the
   diary is never silent. */

import { SYSTEM_PROMPT, PRIMER, Shade } from "./persona.js";

const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";

/* Ordered by preference. The second one is small enough for a phone or a weak GPU. */
export const MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", size: "about 800 MB" },
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", size: "about 400 MB" }
];

const TURNS = 8;

/* A short list of phrases that should never be answered in character. */
const CRISIS = /\b(kill myself|killing myself|end my life|suicide|suicidal|want to die|hurt myself|self harm|cut myself|no reason to live)\b/i;

export function looksLikeCrisis(text) {
  return CRISIS.test(String(text || ""));
}

export const CRISIS_REPLY = "I am stopping the game here. I am only a page in a book, and this part is real. Please talk to someone you trust tonight, or call a local crisis line, and stay near people who know your name.";

export class Voice {
  constructor({ onProgress } = {}) {
    this.onProgress = onProgress || (() => {});
    this.engine = null;
    this.mode = "asleep";
    this.model = null;
    this.shade = new Shade();
    this.history = [];
  }

  get ready() {
    return this.mode === "model" || this.mode === "shade";
  }

  /* Load the model. Returns the mode that ended up being used. */
  async awaken() {
    if (this.ready) return this.mode;

    if (!navigator.gpu) {
      this.onProgress({ text: "No WebGPU here. The shade will answer instead.", ratio: 1 });
      this.mode = "shade";
      return this.mode;
    }

    let webllm;
    try {
      webllm = await import(/* @vite-ignore */ WEBLLM_URL);
    } catch (error) {
      console.warn("web-llm failed to load", error);
      this.mode = "shade";
      return this.mode;
    }

    for (const candidate of MODELS) {
      try {
        this.onProgress({ text: `Waking ${candidate.size}`, ratio: 0 });
        this.engine = await webllm.CreateMLCEngine(candidate.id, {
          initProgressCallback: (report) => {
            this.onProgress({ text: report.text, ratio: report.progress ?? 0 });
          }
        });
        this.model = candidate.id;
        this.mode = "model";
        return this.mode;
      } catch (error) {
        console.warn(`could not load ${candidate.id}`, error);
      }
    }

    this.onProgress({ text: "The model would not load. The shade will answer.", ratio: 1 });
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
