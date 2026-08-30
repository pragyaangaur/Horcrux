/* What the book has learned about the person writing in it.
   There is no second model here. Lines that look like the writer saying something about
   themselves are kept as they were written, and pasted back into the prompt later, which
   gives the diary a memory that outlives the handful of turns the model can hold. */

import { readName } from "./persona.js";

/* Openings that usually mean the writer is telling you about themselves. */
const FACT = /\b(i am|i'm|im|i live|i study|i work|i have|i like|i love|i hate|i want|i need|i miss|i failed|i passed|my \w+ is)\b/i;

const LIMIT = 8;
const LENGTH = 110;

export class Ledger {
  constructor() {
    this.name = null;
    this.facts = [];
  }

  /* Read one line from the writer and keep the parts that say something about them. */
  learn(text) {
    const line = String(text || "").trim();
    if (!line) return;

    this.name = this.name || readName(line);

    for (const raw of line.split(/[.!?\n]+/)) {
      const sentence = raw.trim();
      if (sentence.length < 6 || !FACT.test(sentence)) continue;
      const kept = sentence.length > LENGTH ? `${sentence.slice(0, LENGTH).trim()}...` : sentence;
      if (this.facts.some((fact) => fact.toLowerCase() === kept.toLowerCase())) continue;
      this.facts.push(kept);
    }

    while (this.facts.length > LIMIT) this.facts.shift();
  }

  /* The block that goes into the prompt. An empty string when there is nothing to say. */
  note() {
    if (!this.facts.length) return "";
    return this.facts.map((fact) => `- ${fact}`).join("\n");
  }

  forget() {
    this.name = null;
    this.facts = [];
  }
}
