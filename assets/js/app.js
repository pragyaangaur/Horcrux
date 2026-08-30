/* Wiring. The page, the ink and the thing in the book are joined together here. */

import { Scribe, growWithText } from "./ink.js";
import { Voice, VOICES, DEFAULT_VOICE } from "./voice.js";
import { OPENING, WAKING, anyOf } from "./persona.js";

const el = (id) => document.getElementById(id);

const dom = {
  diary: el("diary"),
  stage: el("stage"),
  memories: el("memories"),
  memoriesEmpty: el("memoriesEmpty"),
  lamp: el("lamp"),
  pen: el("pen"),
  send: el("send"),
  quill: el("quill"),
  awaken: el("awaken"),
  forget: el("forget"),
  sound: el("soundBtn"),
  meter: el("meter"),
  meterFill: el("meterFill"),
  meterLabel: el("meterLabel"),
  crier: el("crier"),
  deep: el("deep")
};

const PLACEHOLDERS = {
  shut: "The book is shut.",
  busy: "The ink is busy.",
  ready: "Write something. Anything."
};

const scribe = new Scribe(dom.stage);
const size = chosenSize();
const voice = new Voice({ onProgress: showProgress, onReady: takeOver, size });

let busy = false;
let opened = false;
let sound = false;
let pending = [];
let handover = false;

setLamp("dormant");
lock(true);
growWithText(dom.pen);
dom.deep.textContent = `Voice: ${size}`;
warmLater();
scribe.say("note", "The page is blank. It has been blank for a very long time.");

dom.awaken.addEventListener("click", open);
dom.forget.addEventListener("click", burn);
dom.sound.addEventListener("click", toggleSound);
dom.deep.addEventListener("click", switchVoice);
dom.quill.addEventListener("submit", submit);

dom.pen.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    dom.quill.requestSubmit();
  }
});

async function open() {
  if (opened) return;
  opened = true;
  dom.awaken.disabled = true;
  dom.deep.disabled = true;
  dom.awaken.textContent = "Opening";
  dom.diary.classList.remove("is-shut");
  setLamp("stirring");

  dom.stage.replaceChildren();
  await scribe.say("note", anyOf(WAKING));

  /* The book is open from here. Whatever the model is doing happens behind the page. */
  voice.open();
  setLamp("awake");
  dom.awaken.textContent = "The diary is open";

  const first = dom.stage.querySelector(".line--note");
  if (first) scribe.sink(first, 200);

  const hello = await scribe.say("voice", anyOf(OPENING));
  cry(hello.text);
  pending.push({ el: hello.el, kind: "voice", text: hello.text });
  lock(false);
  dom.pen.focus();
}

async function submit(event) {
  event.preventDefault();
  const text = dom.pen.value.trim();
  if (!text || busy || !voice.ready) return;

  busy = true;
  lock(true);
  dom.pen.value = "";
  dom.pen.dispatchEvent(new Event("input"));

  /* The previous exchange soaks away as the new one begins. */
  sinkPending();

  const yours = await scribe.say("you", text);
  pending.push({ el: yours.el, kind: "you", text });

  setLamp("thinking");
  const writer = scribe.open("voice");
  let said = "";
  try {
    for await (const piece of voice.stream(text)) {
      said += piece;
      writer.push(piece);
    }
  } finally {
    writer.close();
    await writer.finished;
  }

  pending.push({ el: writer.el, kind: "voice", text: said.trim() });
  cry(said.trim());
  setLamp("awake");
  busy = false;
  lock(false);
  dom.pen.focus();
  flushHandover();
}

/* The model can finish downloading at any moment, including in the middle of a reply.
   The page says so once, quietly, and never while a line is being written. */
function takeOver(model) {
  handover = true;
  dom.awaken.title = model?.id || "";
  if (!busy && opened) flushHandover();
}

async function flushHandover() {
  if (!handover || busy) return;
  handover = false;
  const note = await scribe.say("note", "The ink darkens. Something older is writing now.");
  scribe.sink(note.el, 2200);
}

function sinkPending() {
  const going = pending;
  pending = [];
  for (const item of going) {
    remember(item.kind, item.text);
    scribe.sink(item.el, 0);
  }
}

function remember(kind, text) {
  if (!text) return;
  dom.memoriesEmpty?.remove();
  const p = document.createElement("p");
  p.className = `memory memory--${kind}`;
  p.textContent = text;
  dom.memories.appendChild(p);
  dom.memories.scrollTop = dom.memories.scrollHeight;
}

function burn() {
  voice.forget();
  pending = [];
  dom.memories.replaceChildren();
  dom.stage.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "memories__empty";
  empty.textContent = "Nothing has been written here in a long time.";
  dom.memories.appendChild(empty);
  dom.memoriesEmpty = empty;
  scribe.say(opened ? "voice" : "note", opened
    ? "You burned the page. I do not mind. I am the book, and the page was only paper."
    : "The page is blank. It has been blank for a very long time.");
}

/* The book is shut for at least a few seconds, so the loader can be fetched in that gap. */
function warmLater() {
  const start = () => voice.warm();
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2500 });
  else setTimeout(start, 1200);
}

/* The size lives in the address, so a link can carry it and a reload keeps it. */
function chosenSize() {
  const asked = new URLSearchParams(location.search).get("voice");
  return VOICES.some((entry) => entry.name === asked) ? asked : DEFAULT_VOICE;
}

/* The sizes are a page reload apart, because the model is chosen before it loads. */
function switchVoice() {
  const names = VOICES.map((entry) => entry.name);
  const next = names[(names.indexOf(size) + 1) % names.length];
  const url = new URL(location.href);
  url.searchParams.set("voice", next);
  location.href = url.toString();
}

function toggleSound() {
  sound = !sound;
  scribe.enableSound(sound);
  dom.sound.textContent = `Sound: ${sound ? "on" : "off"}`;
  dom.sound.setAttribute("aria-pressed", String(sound));
}

function showProgress({ text, ratio, done }) {
  if (done) {
    dom.meter.hidden = true;
    return;
  }
  dom.meter.hidden = false;
  dom.meterFill.style.width = `${Math.round((ratio || 0) * 100)}%`;
  dom.meterLabel.textContent = shorten(text);
}

/* The loader is chatty. Keep the label to something that fits on the bar. */
function shorten(text) {
  const line = String(text || "").replace(/\s+/g, " ").trim();
  if (/fetch|cache|download/i.test(line)) {
    const found = line.match(/\[(\d+)\/(\d+)\]/);
    return found ? `Drawing the ink ${found[1]} of ${found[2]}` : "Drawing the ink";
  }
  if (/gpu|shader|load/i.test(line)) return "Settling into the paper";
  return line.slice(0, 46) || "Waking";
}

function lock(state) {
  dom.pen.disabled = state;
  dom.send.disabled = state;
  if (!opened) setPlaceholder("shut");
  else setPlaceholder(state ? "busy" : "ready");
}

function setPlaceholder(state) {
  dom.pen.placeholder = PLACEHOLDERS[state] || PLACEHOLDERS.ready;
}

/* Handwriting arrives one glyph at a time, which is unusable for a screen reader.
   Finished lines are repeated once here instead. */
function cry(text) {
  if (!text) return;
  const p = document.createElement("p");
  p.textContent = `The diary wrote: ${text}`;
  dom.crier.appendChild(p);
  while (dom.crier.childElementCount > 6) dom.crier.firstElementChild.remove();
}

function setLamp(state) {
  dom.lamp.dataset.state = state;
  dom.lamp.querySelector(".lamp__text").textContent = state;
}
