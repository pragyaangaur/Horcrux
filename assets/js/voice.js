/* The thing in the book.
   The book opens on the Shade, which is a small pattern matcher that can answer at once.
   A language model downloads in the background and takes over when it arrives. If it never
   arrives, because there is no WebGPU or the fetch fails, the Shade keeps the diary going. */

import { SYSTEM_PROMPT, PRIMER, Shade, readName, reminder } from "./persona.js";
import { Ledger } from "./ledger.js";

const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";

/* Three sizes of the same character. Bigger models write better and take longer to arrive,
   and the reader picks which trade they want. Sizes are the rough download in megabytes. */
export const VOICES = [
  { name: "light", id: "SmolLM2-360M-Instruct-q4f16_1-MLC", megabytes: 250 },
  { name: "normal", id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", megabytes: 400 },
  { name: "deep", id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", megabytes: 800 }
];

export const DEFAULT_VOICE = "normal";

/* The chosen size first, then the smaller ones, so a failed load falls back to a cheaper try. */
function order(name) {
  const chosen = VOICES.find((voice) => voice.name === name) || VOICES.find((voice) => voice.name === DEFAULT_VOICE);
  const rest = VOICES.filter((voice) => voice !== chosen && voice.megabytes < chosen.megabytes);
  return [chosen, ...rest.reverse()];
}

/* How much of the conversation goes back to the model on every question. Twenty messages is
   ten exchanges, which these models have room for, and the ledger carries anything older. */
const MESSAGES = 20;

/* The first few words of a reply are held back before they reach the page. It is the only
   place a small model steals the writer's name, and once ink is on the page it stays. */
const HOLD = 60;

/* A short list of phrases that should never be answered in character. */
const CRISIS = /\b(kill myself|killing myself|end my life|suicide|suicidal|want to die|hurt myself|self harm|cut myself|no reason to live)\b/i;

export function looksLikeCrisis(text) {
  return CRISIS.test(String(text || ""));
}

export const CRISIS_REPLY = "I am stopping the game here. I am only a page in a book, and this part is real. Please talk to someone you trust tonight, or call a local crisis line, and stay near people who know your name.";

export class Voice {
  constructor({ onProgress, onReady, size = DEFAULT_VOICE } = {}) {
    this.onProgress = onProgress || (() => {});
    this.onReady = onReady || (() => {});
    this.candidates = order(size);
    this.engine = null;
    this.mode = "asleep";
    this.model = null;
    this.shade = new Shade();
    this.ledger = new Ledger();
    this.history = [];
    this.writer = null;
  }

  /* The name the book already has for this reader, if it has met them before. */
  get knows() {
    return this.ledger.name;
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
    this.start();
    return this.mode;
  }

  /* Begin the download without opening the book. Safe to call as often as you like. */
  start() {
    this.loading = this.loading || this.load();
    return this.loading;
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
        this.onProgress({ text: `Waking about ${candidate.megabytes} MB`, ratio: 0 });
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

    /* The book learns from every line, including the ones the shade answers, so nothing is
       lost if the model arrives in the middle of a conversation. */
    this.ledger.learn(text);
    this.writer = this.ledger.name || this.writer || readName(text);

    if (this.mode !== "model") {
      const reply = this.shade.reply(text);
      this.remember(text, reply);
      for (const piece of reply.split(/(?<=\s)/)) yield piece;
      return;
    }

    /* web-llm only accepts a system message as the first one, so the reminder is folded
       into the prompt and the writer's name goes with it. */
    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${reminder(this.writer, this.ledger.note())}` },
      ...PRIMER,
      ...this.history.slice(-MESSAGES),
      { role: "user", content: text }
    ];

    let out = "";
    let head = "";
    let holding = true;
    try {
      const chunks = await this.engine.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.3,
        presence_penalty: 0,
        max_tokens: 110
      });
      for await (const chunk of chunks) {
        const piece = chunk.choices?.[0]?.delta?.content || "";
        if (!piece) continue;
        if (holding) {
          head += piece;
          if (head.length < HOLD) continue;
          holding = false;
          const fixed = ownName(head, this.writer);
          out += fixed;
          yield fixed;
          continue;
        }
        out += piece;
        yield piece;
      }
      if (holding) {
        const fixed = ownName(head, this.writer);
        out += fixed;
        yield fixed;
      }
    } catch (error) {
      console.warn("generation failed, falling back to the shade", error);
      const fallback = this.shade.reply(text);
      out = fallback;
      yield fallback;
    }

    this.remember(text, clean(out));
  }

  remember(user, assistant) {
    this.history.push({ role: "user", content: user });
    this.history.push({ role: "assistant", content: assistant });
    if (this.history.length > MESSAGES) this.history = this.history.slice(-MESSAGES);
  }

  forget() {
    this.history = [];
    this.writer = null;
    this.ledger.forget();
    this.shade.forget();
  }
}

/* Give the voice its own name back when the model has borrowed the writer's. */
function ownName(text, writer) {
  if (!writer) return text;
  const name = writer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text)
    .replace(new RegExp(`\\bI(?:'m| am) ${name}\\b`, "gi"), "I am Pragyaan")
    .replace(new RegExp(`\\bmy name is ${name}\\b`, "gi"), "my name is Pragyaan");
}

/* Small models like to add narration and quotation marks. Strip the obvious ones. */
function clean(text) {
  return String(text)
    .replace(/\*[^*]*\*/g, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
}
