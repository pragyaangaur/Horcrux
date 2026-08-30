/* Ink. Everything here is about how words arrive on the page and how they leave it.
   Text is drawn one glyph at a time from a queue, so a streaming model and a fixed
   string can both be written with the same code. */

const SPEED = { you: 16, riddle: 34, note: 22 };

export class Scribe {
  constructor(stage) {
    this.stage = stage;
    this.audio = null;
  }

  /* Start a new line on the page. The returned writer accepts text at any time. */
  open(kind = "riddle") {
    const el = document.createElement("p");
    el.className = `line line--${kind}`;
    const nib = document.createElement("span");
    nib.className = "nib";
    el.appendChild(nib);
    this.stage.appendChild(el);
    this.stage.scrollTop = this.stage.scrollHeight;
    return new Writer(this, el, nib, SPEED[kind] ?? 30);
  }

  /* Write a whole string and wait for the last glyph to dry. */
  async say(kind, text) {
    const writer = this.open(kind);
    writer.push(text);
    writer.close();
    await writer.finished;
    return writer;
  }

  /* Let a line soak into the paper and disappear. */
  sink(el, delay = 900) {
    return new Promise((resolve) => {
      setTimeout(() => {
        el.classList.add("is-sinking");
        setTimeout(() => {
          el.remove();
          resolve();
        }, 2600);
      }, delay);
    });
  }

  /* A dry scratch of the nib, built from noise so the repository carries no audio files. */
  enableSound(on) {
    if (!on) {
      this.audio = null;
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.audio = this.audio || new Ctx();
    if (this.audio.state === "suspended") this.audio.resume();
  }

  scratch() {
    const ctx = this.audio;
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2100 + Math.random() * 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }
}

class Writer {
  constructor(scribe, el, nib, speed) {
    this.scribe = scribe;
    this.el = el;
    this.nib = nib;
    this.speed = speed;
    this.queue = [];
    this.closed = false;
    this.timer = null;
    this.text = "";
    this.drawn = "";
    this.finished = new Promise((resolve) => { this.resolve = resolve; });
  }

  push(chunk) {
    if (!chunk) return;
    this.text += chunk;
    for (const ch of chunk) this.queue.push(ch);
    if (!this.timer) this.tick();
  }

  close() {
    this.closed = true;
    if (!this.timer && this.queue.length === 0) this.end();
  }

  tick() {
    this.timer = setTimeout(() => {
      this.timer = null;
      const ch = this.queue.shift();
      if (ch === undefined) {
        if (this.closed) this.end();
        else this.timer = setTimeout(() => { this.timer = null; this.tick(); }, 40);
        return;
      }
      this.draw(ch);
      this.tick();
    }, this.pause());
  }

  /* Handwriting is uneven. Punctuation gets a longer rest than a letter does.
     The rest depends on the last glyph already on the page, not on the text still queued. */
  pause() {
    const base = this.speed;
    const last = this.drawn.slice(-1);
    if (".!?".includes(last)) return base * 9;
    if (",;:".includes(last)) return base * 4;
    return base * (0.7 + Math.random() * 0.8);
  }

  draw(ch) {
    this.drawn += ch;
    if (ch === "\n") {
      this.el.insertBefore(document.createElement("br"), this.nib);
      return;
    }
    if (ch === " ") {
      this.el.insertBefore(document.createTextNode(" "), this.nib);
      return;
    }
    const span = document.createElement("span");
    span.className = "glyph";
    span.textContent = ch;
    span.style.animationDelay = `${Math.random() * 40}ms`;
    this.el.insertBefore(span, this.nib);
    if (Math.random() < 0.34) this.scribe.scratch();
    this.scribe.stage.scrollTop = this.scribe.stage.scrollHeight;
  }

  end() {
    this.nib.remove();
    this.resolve(this.text);
  }
}

/* The writing line grows with what is written on it. */
export function growWithText(textarea) {
  const resize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 104)}px`;
  };
  textarea.addEventListener("input", resize);
  resize();
}
