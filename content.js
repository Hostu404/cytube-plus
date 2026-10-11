// CyTube Plus: a few extra features and a tidier look for cytu.be. Runs on
// every cytu.be channel page.
//
//  - Polished look: the video, its buttons, playlist, poll and chat as
//    rounded cards (see polished-css.js).
//  - Coloured names: each name in chat gets its own colour, over any
//    colour the channel's CSS gives names; staff keep their rank colours.
//  - Niconico comments: new chat messages fly across the video in lanes,
//    with limits for when chat floods.
//  - Lights down: dims everything around the video; a click outside it
//    lifts the dark a little for a few seconds.
//  - Click a name in chat to reply, or an emote to post the same one.
//  - Mentions and PMs highlighted (content.css); how PMs work is left to
//    CyTube.
//
// It does nothing at all on blacklisted channels (the blacklist is edited
// in the toolbar popup, and starts out with the Kinoplex).
//
// Otherwise it stays out of the channel's way: it changes none of CyTube's
// own code, its look never outranks the channel's CSS (see
// polished-css.js), its buttons sit in a group of their own, and anything
// the channel's own scripts already do with a name or a click comes first.
(() => {
  "use strict";

  const api = globalThis.browser ?? globalThis.chrome;

  const DEFAULTS = { polished: true, colourNames: true, nico: false, lightsButton: true, highlights: true, clickToInsert: true,
    nicoSpeed: 100, dim: 90, peekSeconds: 4 };
  const ALL_OFF = { polished: false, colourNames: false, nico: false, lightsButton: false, highlights: false, clickToInsert: false };
  // The blacklist: channels it stays off on, until someone takes them off.
  const DEFAULT_OFF_CHANNELS = ["the-kinoplex"];

  // A number setting, kept within its range.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));

  // This channel's name, as in cytu.be/r/<name>.
  const channel = (() => {
    const m = location.pathname.match(/^\/r\/([^/?#]+)/);
    try { return m ? decodeURIComponent(m[1]).toLowerCase() : ""; } catch (e) { return ""; }
  })();

  // Nothing happens until the saved settings and list are in.
  let saved = { ...DEFAULTS };
  let offChannels = DEFAULT_OFF_CHANNELS;
  let settings = { ...ALL_OFF };

  // ---- settings -----------------------------------------------------------

  api.storage.local.get({ settings: DEFAULTS, offChannels: DEFAULT_OFF_CHANNELS }).then((stored) => {
    saved = stored.settings;
    offChannels = stored.offChannels;
    refresh();
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || (!changes.settings && !changes.offChannels)) return;
    if (changes.settings) saved = changes.settings.newValue ?? DEFAULTS;
    if (changes.offChannels) offChannels = changes.offChannels.newValue ?? DEFAULT_OFF_CHANNELS;
    refresh();
  });

  // On a blacklisted channel everything is off and the buttons go; taking
  // it off the blacklist brings it all back, without reloading the page.
  function refresh() {
    const wasNico = settings.nico;
    const offHere = offChannels.includes(channel);
    settings = offHere ? { ...ALL_OFF } : { ...DEFAULTS, ...saved };
    if (offHere) removeButtons();
    else addButtons();
    applySettings(wasNico);
  }

  function saveSettings() {
    api.storage.local.set({ settings });
  }

  function applySettings(wasNico) {
    applyPolished();
    recolourAll();
    document.documentElement.classList.toggle("cytube-plus-click", settings.clickToInsert);
    document.documentElement.classList.toggle("cytube-plus-highlight", settings.highlights);
    updateButtons();
    if (settings.nico && !wasNico) nicoTurnedOn();
    if (!settings.nico) clearNico();
    if (!settings.lightsButton && lightsOn) setLights(false);
    else if (lightsOn) setDarkness(typing() ? peekLevel() : dimLevel(), 250, "ease-in-out");
  }

  // ---- polished look --------------------------------------------------------

  // Straight after CyTube's theme stylesheet: later than the theme, so it
  // wins over it; earlier than the channel's own CSS, which still wins.
  let polishedStyle = null;

  function applyPolished() {
    if (!settings.polished) {
      if (polishedStyle) polishedStyle.remove();
      polishedStyle = null;
      updatePollBars();
      return;
    }
    if (typeof globalThis.CP_POLISHED_CSS !== "string") return;
    if (!polishedStyle) {
      polishedStyle = document.createElement("style");
      polishedStyle.id = "cytube-plus-polished";
      polishedStyle.textContent = globalThis.CP_POLISHED_CSS;
    }
    placePolished();
    updatePollBars();
  }

  // Changing theme in CyTube's options adds a new theme stylesheet at the
  // end of the page's styles; this moves along to sit just after it again.
  function placePolished() {
    if (!polishedStyle) return;
    const theme = document.getElementById("usertheme");
    if (theme) {
      if (theme.nextElementSibling !== polishedStyle) theme.after(polishedStyle);
    } else if (!polishedStyle.isConnected) {
      document.head.prepend(polishedStyle);
    }
  }

  // Each poll option's share of the votes, for its bar (only while the
  // Polished look, which draws the bars, is on).
  function updatePollBars() {
    for (const poll of document.querySelectorAll("#pollwrap .well")) {
      const options = [...poll.querySelectorAll(".option")];
      const counts = options.map((o) => parseInt(o.querySelector("button")?.textContent, 10) || 0);
      const total = counts.reduce((a, b) => a + b, 0);
      options.forEach((o, i) => {
        if (settings.polished) o.style.setProperty("--cp-share", total ? (counts[i] * 100 / total).toFixed(1) + "%" : "0%");
        else if (o.style.getPropertyValue("--cp-share")) o.style.removeProperty("--cp-share");
      });
    }
  }

  // The page's stylesheets: the theme changing (see placePolished), and the
  // channel's own CSS arriving or changing, which can change the chat's
  // background (the name colours are made readable against it).
  function watchStyles() {
    new MutationObserver((mutations) => {
      let theme = false, styles = false;
      for (const m of mutations) {
        for (const node of [...m.addedNodes, ...m.removedNodes]) {
          if (!(node instanceof Element) || node === polishedStyle) continue;
          if (node.id === "usertheme") theme = true;
          if (node.tagName === "STYLE" || node.tagName === "LINK") styles = true;
        }
        for (const node of m.addedNodes) {
          if (node instanceof Element && node.tagName === "LINK") node.addEventListener("load", recolourAll, { once: true });
        }
        if (m.target !== polishedStyle && (m.type === "characterData" || m.target.nodeName === "STYLE")) styles = true;
      }
      if (theme) placePolished();
      if (styles || theme) recolourAll();
    }).observe(document.head, { childList: true, subtree: true, characterData: true });
  }

  function watchPolls() {
    const wrap = document.getElementById("pollwrap");
    if (!wrap) return;
    new MutationObserver(updatePollBars).observe(wrap, { childList: true, subtree: true, characterData: true });
  }

  // ---- coloured names -------------------------------------------------------

  // The palette: soft colours that read on a dark background.
  const PALETTE = ["#8ab4f8", "#f28b82", "#fdd663", "#81c995", "#fcad70", "#c58af9", "#78d9ec", "#ff8bcb"];
  const colourCache = new Map();
  const ourColour = new WeakMap();   // a name in chat -> the colour this gave it
  let chatBackground = null;

  // A simple string hash (Java's String.hashCode), so a name always gets the
  // same colour.
  function javaHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
  }

  function parseColour(css) {
    const m = css && css.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function luminance({ r, g, b }) {
    const lin = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // The chat's own background, looking up past see-through elements.
  function findChatBackground() {
    let el = document.getElementById("messagebuffer");
    while (el) {
      const c = parseColour(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.5) return c;
      el = el.parentElement;
    }
    return { r: 39, g: 43, b: 48 };
  }

  // Lightened (on a dark chat) or darkened (on a light one) just enough to
  // read: 3:1 contrast.
  function readable(hex, bg) {
    return readableRgb(hexToRgb(hex), bg);
  }

  function readableRgb(c, bg) {
    const toward = luminance(bg) < 0.4 ? 255 : 0;
    for (let i = 0; i < 10 && contrast(c, bg) < 3; i++) {
      c = {
        r: Math.round(c.r + (toward - c.r) * 0.15),
        g: Math.round(c.g + (toward - c.g) * 0.15),
        b: Math.round(c.b + (toward - c.b) * 0.15),
      };
    }
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
  }

  function colourFor(name) {
    let colour = colourCache.get(name);
    if (!colour) {
      if (!chatBackground) chatBackground = findChatBackground();
      const pick = PALETTE[((javaHash(name.toLowerCase()) % PALETTE.length) + PALETTE.length) % PALETTE.length];
      colour = readable(pick, chatBackground);
      colourCache.set(name, colour);
    }
    return colour;
  }

  // [server] and the like: CyTube marks each message with its sender, and
  // only these pseudo-users have a name that starts with a bracket.
  function fromServer(div) {
    return [...div.classList].some((c) => c.startsWith("chat-msg-\\$") || c.startsWith("server-msg"));
  }

  // The colour goes over whatever the channel's CSS gives names (inline and
  // !important, so even a channel's !important rule gives way). Staff and
  // guests keep their rank colour, and site-admin flair is a label of its
  // own. A name a channel's script has coloured itself, on the spot (a "pick
  // your name colour" feature, say), keeps that colour.
  function colourName(div) {
    if (!(div instanceof HTMLElement) || fromServer(div)) return;
    const strong = div.querySelector(":scope > span:not(.timestamp) > strong.username");
    if (!strong || ourColour.has(strong)) return;
    const span = strong.parentElement;
    if ([...span.classList].some((c) => c.startsWith("userlist_") || c === "label")) return;
    if (strong.style.color || span.style.color) return;
    const name = strong.textContent.replace(/:\s*$/, "").trim();
    if (!name) return;
    strong.style.setProperty("color", colourFor(name), "important");
    ourColour.set(strong, strong.style.getPropertyValue("color"));
  }

  // Takes back every colour this gave (leaving any a channel script has
  // since put there), then colours again if the setting is on.
  function recolourAll() {
    const buffer = document.getElementById("messagebuffer");
    if (!buffer) return;
    for (const strong of buffer.querySelectorAll("strong.username")) {
      if (!ourColour.has(strong)) continue;
      if (strong.style.getPropertyValue("color") === ourColour.get(strong)) strong.style.removeProperty("color");
      ourColour.delete(strong);
    }
    colourCache.clear();
    chatBackground = null;
    if (settings.colourNames) for (const div of buffer.children) colourName(div);
  }

  // ---- the video ------------------------------------------------------------

  // CyTube's player sits in this box, and its own fullscreen button makes
  // this box fullscreen, so anything inside it shows there too.
  function videoBox() {
    return document.querySelector("#videowrap .embed-responsive");
  }

  // ---- Niconico comments ----------------------------------------------------
  //
  // Every comment crosses in the same 3.755 s (so a long one moves faster),
  // unless that would pass the speed limit, which stretches a very long one
  // out to as much as 11.265 s. Lanes are 34 high, at most 12, picked so
  // comments spread out (an empty lane round-robin, else the lane whose last
  // comment is furthest along, never one where the new comment would run
  // into it); 75 ms between comments setting off; 24 between comments in a
  // lane; text 20 bold, emotes 28 (56 when a message is only emotes).
  //
  // Those sizes are for a small video, which 12 lanes of 34 fill. A bigger
  // video makes every size (and the speed limit) grow with it, by the same
  // factor, until the 12 lanes fill it the same way.
  //
  // The speed setting (50-200%, from the popup) scales all of that: at 200%
  // a comment crosses in half the time, and the speed limit doubles.
  //
  // Flood limits: turning it on replays the last 5 messages; at most 20 at a
  // time from a burst of chat, and at most 30 waiting to fly (the oldest are
  // dropped first, so it stays close to the chat).
  //
  // Nothing waits while the tab is hidden (another tab in front, or the
  // window minimised): what was said meanwhile is in the chat, and only
  // what's said once you're back flies. (A window that's only not in focus,
  // say on another screen, isn't hidden: comments keep flying there.)

  const NICO_BASELINE_DURATION_MS = 3755;
  const NICO_MAX_DURATION_MS = 11265;
  // The speed limit at the base size, in pixels a millisecond.
  const NICO_MAX_SPEED = 0.36432;
  const NICO_MIN_GAP = 24;
  const NICO_SPAWN_STAGGER_MS = 75;
  const NICO_LANE_HEIGHT = 34;
  const NICO_MAX_LANES = 12;
  const NICO_TEXT_SIZE = 20;
  // The black glow round the text: a 3 pixel blur at the base size.
  const NICO_GLOW = 3;
  const NICO_EMOTE_HEIGHT = 28;
  const NICO_SOLO_EMOTE_HEIGHT = 56;
  // How long a comment waits for an emote image the chat is still loading.
  const NICO_IMAGE_WAIT_MS = 5000;
  const NICO_CATCHUP_COUNT = 5;
  const NICO_MAX_BURST = 20;
  const NICO_MAX_QUEUE = 30;

  let nicoLayer = null;
  let layerObserver = null;
  let fontsWatched = false;
  let laneOccupants = new Map();   // lane -> [{ spawnAt, speed, width, clearAt }]
  let nextLaneIndex = 0;
  // Waiting to fly: { div, content, ready, settled, solo, empty, el, width, scale }
  const pending = [];
  // Flying: { el, solo, lane, width, duration, animation, occupant }
  const active = new Set();
  let queued = new WeakSet();      // chat messages already sent to fly
  let draining = false;
  let wakeDrain = null;

  // The speed setting as a factor: 1 is normal.
  function nicoSpeed() {
    return clamp(settings.nicoSpeed ?? DEFAULTS.nicoSpeed, 50, 200) / 100;
  }

  function geometry(layer) {
    const width = layer.clientWidth, height = layer.clientHeight;
    const scale = Math.max(1, height / (NICO_MAX_LANES * NICO_LANE_HEIGHT));
    const laneHeight = NICO_LANE_HEIGHT * scale;
    // (The small nudge keeps rounding from losing the twelfth lane.)
    const laneCount = Math.min(NICO_MAX_LANES, Math.max(1, Math.floor(height / laneHeight + 1e-6)));
    return { width, height, scale, laneHeight, laneCount, gap: NICO_MIN_GAP * scale };
  }

  function ensureNicoLayer() {
    const box = videoBox();
    if (!box) return null;
    if (nicoLayer && nicoLayer.parentElement === box) return nicoLayer;
    nicoLayer = document.createElement("div");
    nicoLayer.className = "cp-nico";
    box.appendChild(nicoLayer);
    laneOccupants = new Map();
    layerObserver?.disconnect();
    layerObserver = new ResizeObserver(relayout);
    layerObserver.observe(nicoLayer);
    if (!fontsWatched && document.fonts) {
      fontsWatched = true;
      document.fonts.addEventListener("loadingdone", relayout);
    }
    return nicoLayer;
  }

  // Fullscreen and resizing: each comment carries on from the same point of
  // its journey, at the new size, across the new width.
  function relayout() {
    if (!nicoLayer) return;
    const g = geometry(nicoLayer);
    if (g.width < 50 || g.height < 50) return;
    for (const c of active) {
      const progress = (c.animation.currentTime || 0) / c.duration;
      sizeComment(c.el, c.solo, g.scale);
      c.el.style.top = c.lane * g.laneHeight + "px";
      c.width = commentWidth(c.el, g.scale);
      c.animation.cancel();
      startFlight(c, g.width);
      c.animation.currentTime = progress * c.duration;
      c.occupant.width = c.width;
      c.occupant.speed = (g.width + c.width) / c.duration;
    }
    drain();
  }

  function startFlight(c, layerWidth) {
    c.animation = c.el.animate(
      [{ transform: `translateX(${layerWidth}px)` }, { transform: `translateX(${-c.width}px)` }],
      { duration: c.duration, easing: "linear" }
    );
    c.animation.onfinish = () => { c.el.remove(); active.delete(c); };
  }

  function clearNico() {
    for (const item of pending) if (item.el) item.el.remove();
    pending.length = 0;
    queued = new WeakSet();
    for (const c of active) c.animation.cancel();
    active.clear();
    layerObserver?.disconnect();
    layerObserver = null;
    if (nicoLayer) nicoLayer.remove();
    nicoLayer = null;
    laneOccupants = new Map();
    wake();
  }

  // What flies: the message with its emotes, but no links (an address flying
  // past is just noise, and nobody can click one), no hidden spoilers and
  // no posted pictures. Not the server's own messages, nor shadow-muted
  // ones, nor one that's nothing but a link. (Private messages never reach
  // the main chat here.)
  function nicoContent(div) {
    if (!(div instanceof HTMLElement) || div.id === "newmessages-indicator") return null;
    if (div.classList.contains("chat-shadow") || fromServer(div)) return null;
    const message = div.lastElementChild;
    if (!message || message.classList.contains("server-whisper") || message.classList.contains("timestamp")) return null;
    // The copy is made in a detached document, where images don't load: an
    // emote only loads once, for the chat, and the copy joins the page (and
    // shows that same image) once the chat's has loaded. See emotesReady.
    const clone = inertDocument().importNode(message, true);
    keepChatColours(div, message, clone);
    clone.removeAttribute("class");
    const originals = [...message.querySelectorAll("img")];
    const pairs = [...clone.querySelectorAll("img")].map((img, i) => [originals[i], img]);
    for (const s of clone.querySelectorAll(".spoiler")) s.remove();
    for (const a of clone.querySelectorAll("a")) {
      if (/^\s*(https?:\/\/|www\.)/i.test(a.textContent)) a.remove();
      else a.replaceWith(clone.ownerDocument.createTextNode(a.textContent));
    }
    for (const img of clone.querySelectorAll("img")) {
      if (!img.classList.contains("channel-emote")) img.remove();
    }
    // Addresses the channel doesn't turn into links are plain text.
    const walker = clone.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      t.nodeValue = t.nodeValue.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "");
    }
    const emotes = pairs.filter(([, img]) => clone.contains(img));
    const hasText = clone.textContent.trim() !== "";
    if (!hasText && !emotes.length) return null;
    return { div, content: clone, ready: emotesReady(emotes, clone) };
  }

  let inert = null;
  function inertDocument() {
    if (!inert) inert = document.implementation.createHTMLDocument("");
    return inert;
  }

  // Each emote's shape comes from the chat's own image, once it has loaded
  // (it's usually loaded already), so the comment's width is known before
  // it flies: measured any earlier, an emote would count as no width at all
  // and leave the video too soon. One that fails to load, or takes too
  // long, is left out of the comment.
  function emotesReady(pairs, clone) {
    return Promise.all(pairs.map(([original, img]) => new Promise((resolve) => {
      let timer = 0;
      const done = () => {
        clearTimeout(timer);
        const ratio = emoteRatio(original);
        if (ratio) img.dataset.cpRatio = String(ratio);
        else img.remove();
        resolve();
      };
      if (!original || original.complete) { done(); return; }
      timer = setTimeout(done, NICO_IMAGE_WAIT_MS);
      original.addEventListener("load", done, { once: true });
      original.addEventListener("error", done, { once: true });
    }))).then(() => {
      const emotes = clone.querySelectorAll("img").length;
      const text = clone.textContent.trim() !== "";
      return { solo: emotes > 0 && !text, empty: emotes === 0 && !text };
    });
  }

  // An emote's shape (width over height), or 0 if it didn't load. An SVG can
  // have no size of its own, so it takes the shape it's shown at in chat.
  function emoteRatio(original) {
    if (!original) return 0;
    if (original.naturalWidth && original.naturalHeight) return original.naturalWidth / original.naturalHeight;
    if (/\.svg([?#]|$)|^data:image\/svg/i.test(original.currentSrc || original.src)) {
      const r = original.getBoundingClientRect();
      return r.width && r.height ? r.width / r.height : 1;
    }
    return 0;
  }

  // Coloured text in chat (greentext, or a channel's own colours) keeps its
  // colour when it flies, lightened if it's too dark to read over a video.
  // Everything else is the comments' white.
  function keepChatColours(div, message, clone) {
    const base = getComputedStyle(div).color;
    const copies = clone.querySelectorAll("*");
    const pairs = [[message, clone], ...[...message.querySelectorAll("*")].map((el, i) => [el, copies[i]])];
    for (const [el, copy] of pairs) {
      if (!copy || el.tagName === "IMG") continue;
      const colour = getComputedStyle(el).color;
      const around = el === message ? base : getComputedStyle(el.parentElement).color;
      if (colour === around) continue;                       // no change of colour here
      if (colour === base) { copy.style.color = "#fff"; continue; }   // back to plain text
      const c = parseColour(colour);
      if (c) copy.style.color = readableRgb(c, { r: 0, g: 0, b: 0 });
    }
  }

  function enqueue(items) {
    if (document.hidden) return;      // nothing waits for the tab to come back
    for (const item of items) {
      queued.add(item.div);
      pending.push(item);
      // Once its emotes are in, it can fly (see drain).
      item.ready.then(({ solo, empty }) => {
        item.solo = solo;
        item.empty = empty;
        item.settled = true;
        wake();
      });
    }
    // At most NICO_MAX_QUEUE waiting: the oldest go, so it stays near live.
    while (pending.length > NICO_MAX_QUEUE) {
      const dropped = pending.shift();
      if (dropped.el) dropped.el.remove();
    }
    wake();
  }

  function wake() {
    if (wakeDrain) wakeDrain();
    drain();
  }

  // A wait the loop can be woken from early (by a new message or a change),
  // or not (the stagger between comments).
  function sleep(ms, wakeable) {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        if (wakeDrain === done) wakeDrain = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      if (wakeable) wakeDrain = done;
    });
  }

  // The lane rule: how long until a comment [width] wide moving at [speed]
  // may enter a lane whose newest comment is [last]. That one must have moved
  // [gap] clear of the edge, and if the new one is faster, be gone before the
  // new one could reach it.
  function laneWaitMs(last, now, width, speed, gap, screenWidth) {
    if (last.speed <= 0) return Math.max(0, Math.ceil(last.clearAt - now));
    const travelled = (now - last.spawnAt) * last.speed;
    const entryWait = Math.max(0, Math.ceil((last.width + gap - travelled) / last.speed));
    let overtakeWait = 0;
    if (speed > last.speed) {
      const limit = screenWidth + width - gap;
      const allowedRemain = limit / speed;
      overtakeWait = Math.max(0, Math.ceil(last.clearAt - now - allowedRemain));
    }
    return Math.max(entryWait, overtakeWait);
  }

  function findBestLane(now, width, speed, g) {
    for (const [lane, list] of laneOccupants) {
      const kept = list.filter((o) => now < o.clearAt);
      if (kept.length) laneOccupants.set(lane, kept);
      else laneOccupants.delete(lane);
    }
    const emptyLanes = [];
    const safeLanes = [];
    for (let lane = 0; lane < g.laneCount; lane++) {
      const list = laneOccupants.get(lane);
      if (!list) { emptyLanes.push(lane); continue; }
      const last = list[list.length - 1];
      if (laneWaitMs(last, now, width, speed, g.gap, g.width) > 0) continue;
      safeLanes.push([lane, (now - last.spawnAt) * last.speed]);
    }
    const n = g.laneCount;
    let chosen = null;
    if (emptyLanes.length) {
      const order = (lane) => (lane - nextLaneIndex + n) % n;
      chosen = emptyLanes.reduce((a, b) => (order(b) < order(a) ? b : a));
    } else if (safeLanes.length) {
      chosen = safeLanes.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    }
    if (chosen !== null) nextLaneIndex = (chosen + 1) % n;
    return chosen;
  }

  // How long until some lane will take this comment, so the loop sleeps that
  // long rather than checking every frame (a new message wakes it anyway).
  function nextSafeWaitMs(now, width, speed, g) {
    let min = Infinity;
    for (let lane = 0; lane < g.laneCount; lane++) {
      const list = laneOccupants.get(lane);
      if (!list || !list.length) return 16;
      min = Math.min(min, laneWaitMs(list[list.length - 1], now, width, speed, g.gap, g.width));
    }
    return Math.min(1000, Math.max(16, min));
  }

  // How far a comment has to go to be fully off the video: its exact width,
  // plus room for the glow round the text, so it's gone, glow and all,
  // before it's taken away.
  function commentWidth(el, scale) {
    return Math.ceil(el.getBoundingClientRect().width) + Math.ceil(NICO_GLOW * scale * 2);
  }

  function sizeComment(el, solo, scale) {
    el.style.fontSize = NICO_TEXT_SIZE * scale + "px";
    el.style.textShadow = `0 0 ${NICO_GLOW * scale}px #000`;
    const h = (solo ? NICO_SOLO_EMOTE_HEIGHT : NICO_EMOTE_HEIGHT) * scale;
    for (const img of el.querySelectorAll("img")) {
      img.style.setProperty("height", h + "px", "important");
      const ratio = Number(img.dataset.cpRatio);
      if (ratio > 0) img.style.setProperty("width", h * ratio + "px", "important");
    }
  }

  // The comment, built and measured before it's placed (again if the video
  // changed size while it waited).
  function prepare(item, layer, scale) {
    if (item.el && item.scale === scale) return;
    if (!item.el) {
      item.el = document.createElement("div");
      item.el.className = "cp-nico-comment";
      item.el.style.visibility = "hidden";
      item.el.appendChild(item.content);
    }
    if (item.el.parentElement !== layer) layer.appendChild(item.el);
    sizeComment(item.el, item.solo, scale);
    item.scale = scale;
    item.width = commentWidth(item.el, scale);
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (pending.length && settings.nico && !document.hidden) {
        const layer = ensureNicoLayer();
        if (!layer) break;
        const g = geometry(layer);
        if (g.width < 50 || g.height < 50) break;

        // The oldest comment that's ready flies next. One still waiting for
        // an emote image doesn't hold up the ones behind it; it goes as soon
        // as the image is in.
        const index = pending.findIndex((i) => i.settled);
        if (index === -1) {
          await sleep(1000, true);
          continue;
        }
        const item = pending[index];
        if (item.empty) {
          pending.splice(index, 1);
          continue;
        }
        prepare(item, layer, g.scale);
        const distance = g.width + item.width;
        const fast = nicoSpeed();
        const duration = Math.min(NICO_MAX_DURATION_MS / fast, Math.max(NICO_BASELINE_DURATION_MS / fast,
          Math.round(distance / (NICO_MAX_SPEED * g.scale * fast))));
        const speed = distance / duration;

        // The animations' own clock, so a comment is exactly where the lanes
        // think it is (it would otherwise start a frame late).
        const now = document.timeline.currentTime ?? performance.now();
        const lane = findBestLane(now, item.width, speed, g);
        if (lane === null) {
          await sleep(nextSafeWaitMs(now, item.width, speed, g), true);
          continue;
        }
        pending.splice(index, 1);
        const occupant = { spawnAt: now, speed, width: item.width, clearAt: now + duration };
        if (!laneOccupants.has(lane)) laneOccupants.set(lane, []);
        laneOccupants.get(lane).push(occupant);

        const c = { el: item.el, solo: item.solo, lane, width: item.width, duration, occupant };
        c.el.style.top = lane * g.laneHeight + "px";
        c.el.style.visibility = "";
        startFlight(c, g.width);
        c.animation.startTime = now;
        active.add(c);
        // A short stagger, so comments stream in rather than as a wall.
        await sleep(NICO_SPAWN_STAGGER_MS, false);
      }
    } finally {
      draining = false;
    }
  }

  // Turned on: the last few messages fly straight away, so a quiet channel
  // shows something at once instead of looking like it does nothing.
  function nicoTurnedOn() {
    const buffer = document.getElementById("messagebuffer");
    if (buffer) catchUp([...buffer.children]);
  }

  function catchUp(divs) {
    const recent = [];
    for (let i = divs.length - 1; i >= 0 && recent.length < NICO_CATCHUP_COUNT; i--) {
      if (queued.has(divs[i]) || !divs[i].isConnected) continue;
      const item = nicoContent(divs[i]);
      if (item) recent.unshift(item);
    }
    enqueue(recent);
  }

  // Hidden: anything still waiting to fly is dropped rather than kept for
  // later (comments already flying just finish their crossing).
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    for (const item of pending) if (item.el) item.el.remove();
    pending.length = 0;
    wake();
  });

  // History CyTube replays on joining (and again after a reconnect) isn't
  // new. Each message's own timestamp says when it was sent: a message is
  // new if it was sent about as long ago as the last new one was when it
  // arrived (that allows for this computer's clock being off). With no
  // timestamps to go on (they can be turned off in CyTube's options),
  // anything in the first couple of seconds after joining is history.
  // Once the join is over, if the comments are on, the last few of the
  // history fly, the same as turning them on.
  let firstMessageAt = 0;
  let joinHistory = [];
  let liveAge = null;          // seconds between a new message's timestamp and its arrival
  let lastArrival = 0;
  let slowHistory = 0;

  // How many seconds ago a message's timestamp ([HH:MM:SS], this computer's
  // time of day) was, or null if it hasn't one.
  function timestampAge(div) {
    const ts = div.querySelector(":scope > .timestamp");
    const m = ts && ts.textContent.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const now = new Date();
    let age = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() - (+m[1] * 3600 + +m[2] * 60 + +m[3]);
    age = ((age % 86400) + 86400) % 86400;
    return age > 43200 ? age - 86400 : age;
  }

  function isLive(div) {
    const now = Date.now();
    if (!firstMessageAt) {
      firstMessageAt = now;
      setTimeout(() => {
        if (settings.nico) catchUp(joinHistory);
        joinHistory = [];
      }, 2100);
    }
    const joining = now - firstMessageAt <= 2000;
    const burst = now - lastArrival < 1000;
    lastArrival = now;
    const age = timestampAge(div);
    let live;
    if (age === null) live = !joining;
    else if (liveAge === null) live = !joining || Math.abs(age) < 5;
    else live = Math.abs(age - liveAge) < 30;
    // History arrives in a burst; old-looking messages arriving one by one
    // mean this computer's clock has changed. Start again from them.
    if (!live && age !== null && !burst && !joining && ++slowHistory >= 3) live = true;
    if (live) {
      if (age !== null) liveAge = age;
      slowHistory = 0;
    } else if (joining) {
      joinHistory.push(div);
    }
    return live;
  }

  // ---- watching chat --------------------------------------------------------

  function onMessages(nodes) {
    const fresh = [];
    for (const div of nodes) {
      if (!(div instanceof HTMLElement)) continue;
      if (settings.colourNames) colourName(div);
      if (!isLive(div) || !settings.nico || document.hidden) continue;
      const item = nicoContent(div);
      if (item) fresh.push(item);
    }
    if (fresh.length) enqueue(fresh.slice(-NICO_MAX_BURST));
  }

  function watchChat() {
    const buffer = document.getElementById("messagebuffer");
    if (!buffer) return;
    if (settings.colourNames) for (const div of buffer.children) colourName(div);
    new MutationObserver((mutations) => {
      const added = [];
      for (const m of mutations) for (const node of m.addedNodes) added.push(node);
      onMessages(added);
    }).observe(buffer, { childList: true });
  }

  // ---- click to reply, click an emote --------------------------------------

  // The box messages are typed in: CyTube's own, or, on a channel that puts
  // its own box in the chat instead, that one.
  function chatBox() {
    const line = document.getElementById("chatline");
    if (line && !line.disabled && line.offsetParent !== null) return line;
    const wrap = document.getElementById("chatwrap");
    if (!wrap) return null;
    for (const el of wrap.querySelectorAll("input[type='text'], input:not([type]), textarea")) {
      if (!el.disabled && el.offsetParent !== null && !el.closest("#guestlogin")) return el;
    }
    return null;
  }

  // A name drops "name: " into the message box, an emote drops its code, at
  // the cursor (or the end, if the box wasn't in use), with a space before
  // it when it would otherwise run into the word before. Nothing is sent.
  function insertIntoChat(fragment) {
    const box = chatBox();
    if (!box) return;
    const value = box.value;
    const focused = document.activeElement === box;
    const start = focused ? box.selectionStart : value.length;
    const end = focused ? box.selectionEnd : value.length;
    const needsSpace = start > 0 && !/\s/.test(value[start - 1]);
    const insert = (needsSpace ? " " : "") + fragment;
    box.focus();
    box.setRangeText(insert, start, end, "end");
    // As if typed, for any script of the channel's that watches the box.
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Who sent a message: CyTube marks each one with its sender, whatever the
  // channel does to how the name looks.
  function senderOf(div) {
    const mark = [...div.classList].find((c) => c.startsWith("chat-msg-"));
    return mark ? mark.slice("chat-msg-".length) : "";
  }

  // What was clicked: a name (CyTube's, or a channel's own way of showing
  // the sender's name) or an emote. Null for anything else.
  function clickedOn(target) {
    if (!(target instanceof Element) || !target.closest("#messagebuffer") || target.closest("a")) return null;
    const emote = target.closest("img.channel-emote, img[class*='emote'], video[class*='emote']");
    if (emote) {
      const code = emote.title || emote.alt || "";
      return code ? { fragment: code } : null;
    }
    const div = target.closest("#messagebuffer > div");
    if (!div || fromServer(div)) return null;
    const strong = target.closest("strong.username");
    if (strong) {
      const who = strong.textContent.replace(/:\s*$/, "").trim();
      return who ? { fragment: who + ": " } : null;
    }
    // Otherwise, the sender's name wherever the channel shows it, ahead of the
    // message itself (which is the last part of the line).
    if (div.lastElementChild?.contains(target)) return null;
    const sender = senderOf(div);
    const text = target.textContent.replace(/:\s*$/, "").trim();
    if (sender && text.toLowerCase() === sender.toLowerCase()) return { fragment: sender + ": " };
    return null;
  }

  // Seen first, acted on last: the click is noted before any of the page's
  // own handlers (so a channel script that stops it going any further can't
  // hide it), and acted on once they've all run, unless one of them did
  // something with it: put something in the message box, changed the
  // message (one channel swaps some emotes when they're clicked), or opened
  // something (a card, a menu, a dialog). A handler that only cancels the
  // click, with nothing to show for it, doesn't count.
  window.addEventListener("click", (e) => {
    if (!settings.clickToInsert) return;
    const what = clickedOn(e.target);
    if (!what) return;
    const before = chatBox()?.value ?? null;
    const message = e.target.closest("#messagebuffer > div");
    let reacted = false;
    const notice = (records) => {
      for (const r of records) {
        if (r.target === document.body || r.target === document.documentElement || message?.contains(r.target)) reacted = true;
      }
    };
    const watcher = new MutationObserver(notice);
    watcher.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => {
      notice(watcher.takeRecords());
      watcher.disconnect();
      if (reacted || (chatBox()?.value ?? null) !== before) return;
      insertIntoChat(what.fragment);
    }, 0);
  }, true);

  // ---- lights down ----------------------------------------------------------

  // How dark the page around the video goes (90% unless changed in the
  // popup), how much of that a click outside the video lifts (half), and
  // for how long (4 seconds unless changed).
  const dimLevel = () => clamp(settings.dim ?? DEFAULTS.dim, 30, 100) / 100;
  const peekLevel = () => dimLevel() * 0.5;
  const peekMs = () => clamp(settings.peekSeconds ?? DEFAULTS.peekSeconds, 1, 10) * 1000;
  let lightsOn = false;
  let peekTimer = 0;
  let scrim = null;
  let followTimer = 0;

  function ensureScrim() {
    if (scrim) return scrim;
    scrim = document.createElement("div");
    scrim.className = "cp-scrim";
    document.body.appendChild(scrim);
    return scrim;
  }

  // The dark is one box over the video with a huge shadow around it: the
  // video shows through the box, everything else is under the shadow. It
  // never takes clicks, so the whole page still works while dimmed.
  function placeScrim() {
    if (!scrim) return;
    const box = videoBox();
    const r = box && box.getBoundingClientRect();
    if (!r || r.width === 0 || document.fullscreenElement) {
      scrim.style.display = "none";
      return;
    }
    scrim.style.display = "";
    // Scrolled down, the video slides up under CyTube's top bar, which stays
    // put: the clear part stops at the bar, so the bar stays dimmed too.
    const top = Math.max(r.top, topBarBottom());
    scrim.style.left = r.left + "px";
    scrim.style.top = top + "px";
    scrim.style.width = r.width + "px";
    scrim.style.height = Math.max(0, r.bottom - top) + "px";
    // The same corners as the video (the Polished look rounds them), but
    // square at the top where the bar cuts it off.
    const cs = getComputedStyle(box);
    scrim.style.borderRadius = top > r.top
      ? `0 0 ${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius}`
      : cs.borderRadius;
  }

  // The bottom edge of CyTube's top bar while it's fixed to the top of the
  // window (0 if it isn't: a channel or layout can make it scroll away).
  function topBarBottom() {
    const bar = document.querySelector(".navbar-fixed-top");
    if (!bar) return 0;
    const position = getComputedStyle(bar).position;
    if (position !== "fixed" && position !== "sticky") return 0;
    const b = bar.getBoundingClientRect();
    return b.height > 0 && b.top <= 1 ? b.bottom : 0;
  }

  function setDarkness(alpha, ms, easing) {
    ensureScrim();
    scrim.style.transition = `box-shadow ${ms}ms ${easing}`;
    scrim.style.boxShadow = `0 0 0 200vmax rgba(0, 0, 0, ${alpha})`;
  }

  function typing() {
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  function setLights(on) {
    lightsOn = on;
    clearTimeout(peekTimer);
    if (on) {
      ensureScrim();
      placeScrim();
      clearInterval(followTimer);
      // The video moves when things above it open or close; a cheap check
      // twice a second keeps the hole on it.
      followTimer = setInterval(placeScrim, 500);
      setDarkness(typing() ? peekLevel() : dimLevel(), 350, "ease-in-out");
    } else {
      clearInterval(followTimer);
      if (scrim) {
        setDarkness(0, 220, "ease-out");
        const fading = scrim;
        setTimeout(() => {
          if (!lightsOn && scrim === fading) { scrim.remove(); scrim = null; }
        }, 260);
      }
    }
    updateButtons();
  }

  const PEEK_EASING = "cubic-bezier(0.37, 0, 0.63, 1)";

  function peek() {
    setDarkness(peekLevel(), 450, PEEK_EASING);
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      if (lightsOn && !typing()) setDarkness(dimLevel(), 600, PEEK_EASING);
    }, peekMs());
  }

  document.addEventListener("pointerdown", (e) => {
    if (!lightsOn || (e.target instanceof Element && e.target.closest(".cp-btn"))) return;
    const box = videoBox();
    const r = box && box.getBoundingClientRect();
    if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    peek();
  }, true);
  // Writing a message: the lights stay partly up until you're done.
  document.addEventListener("focusin", () => { if (lightsOn && typing()) peek(); });
  document.addEventListener("focusout", () => { if (lightsOn) setTimeout(() => { if (!typing()) peek(); }, 0); });
  window.addEventListener("resize", () => lightsOn && placeScrim());
  window.addEventListener("scroll", () => lightsOn && placeScrim(), { passive: true });
  document.addEventListener("fullscreenchange", () => lightsOn && placeScrim());

  // ---- buttons --------------------------------------------------------------

  // A light bulb: filled while the lights are down, an outline otherwise.
  // Drawn to the height of CyTube's own button icons, with an outline about
  // as heavy as theirs.
  const BULB = "M9 21h6v-1.5H9zm3-19a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z";
  const BULB_OUTLINE = BULB + "M14.57 12.69 13.6 13.4v1.2h-3.2v-1.2l-.97-.71a4.5 4.5 0 1 1 5.14 0z";
  const SVG_NS = "http://www.w3.org/2000/svg";

  function bulbIcon(path) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "cp-icon");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("fill", "currentColor");
    p.setAttribute("fill-rule", "evenodd");
    p.setAttribute("d", path);
    svg.appendChild(p);
    return svg;
  }

  function squareIcon(on) {
    const span = document.createElement("span");
    span.className = on ? "cp-square cp-on" : "cp-square";
    return span;
  }

  let lightsBtn = null;
  let nicoBtn = null;

  function makeButton(title, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-sm btn-default cp-btn";
    b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  // In a group of their own just left of CyTube's video buttons, rather than
  // inside CyTube's group, so a channel script that works with those
  // buttons finds them as CyTube left them.
  function addButtons() {
    const row = document.getElementById("rightcontrols");
    if (!row || document.getElementById("cytube-plus-controls")) return;
    const group = document.createElement("div");
    group.id = "cytube-plus-controls";
    group.className = "btn-group pull-right";
    nicoBtn = makeButton("Niconico comments", () => {
      const wasNico = settings.nico;
      settings.nico = !settings.nico;
      saveSettings();
      applySettings(wasNico);
    });
    lightsBtn = makeButton("Lights down", () => setLights(!lightsOn));
    group.append(nicoBtn, lightsBtn);
    const videoControls = document.getElementById("videocontrols");
    if (videoControls && videoControls.parentElement === row) videoControls.after(group);
    else row.appendChild(group);
    updateButtons();
  }

  function removeButtons() {
    document.getElementById("cytube-plus-controls")?.remove();
    nicoBtn = null;
    lightsBtn = null;
  }

  function updateButtons() {
    if (nicoBtn) {
      nicoBtn.replaceChildren(squareIcon(settings.nico));
      nicoBtn.classList.toggle("active", settings.nico);
      nicoBtn.title = settings.nico ? "Turn off Niconico comments" : "Turn on Niconico comments";
    }
    if (lightsBtn) {
      lightsBtn.replaceChildren(bulbIcon(lightsOn ? BULB : BULB_OUTLINE));
      lightsBtn.classList.toggle("active", lightsOn);
      lightsBtn.title = lightsOn ? "Lights up" : "Lights down";
      lightsBtn.style.display = settings.lightsButton ? "" : "none";
    }
  }

  // ---- start ----------------------------------------------------------------

  // (The look and the buttons come once the settings are in: see refresh.)
  watchChat();
  watchPolls();
  watchStyles();
})();
