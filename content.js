// CyTube Plus: a few extra features and a tidier look for cytu.be. Runs on
// every cytu.be channel page.
//
//  - Polished look: the video, its buttons, playlist, poll and chat as
//    rounded cards (see polished-css.js).
//  - Coloured names: each name in chat gets its own colour, over any
//    colour the channel's CSS gives names; staff get the colour the user
//    list shows them in.
//  - Niconico comments: new chat messages (or only their emotes) fly
//    across the video in lanes, with limits for when chat floods.
//  - Hybrid chat: in CyTube's fullscreen, the chat itself over the video,
//    down one side, and usable there (never with the Niconico comments).
//  - Lights down: dims everything around the video; a click outside it
//    lifts the dark a little for a few seconds. The chat can have a lighter
//    dark of its own, which stays as it is: then only a click outside both
//    the video and the chat lifts the rest, and typing lifts nothing.
//  - Click a name in chat to reply, or an emote to post the same one.
//  - Mentions and PMs highlighted (content.css); how PMs work is left to
//    CyTube.
//  - Shrink big emotes: inside a message, and less when a message is only
//    emotes; none ever gets bigger.
//  - Turn off sync (in the popup, off to start with): pause and skip the
//    video on your own, or click a title in the playlist or search results
//    to watch it; a bar under the video puts you back in sync, and has a
//    searchable list of the playlist when the channel hides it (sync-page.js
//    does the syncing part, in the page).
//
// It does nothing at all on blacklisted channels (the blacklist is edited
// in the toolbar popup, and starts out with the Kinoplex).
//
// Otherwise it stays out of the channel's way: it changes none of CyTube's
// own code (except, only while you're out of sync, the two handlers for the
// room's video: see sync-page.js), its look never outranks the channel's
// CSS (see polished-css.js), its buttons sit in a group of their own, and
// anything the channel's own scripts already do with a name or a click
// comes first.
(() => {
  "use strict";

  const api = globalThis.browser ?? globalThis.chrome;

  const DEFAULTS = { polished: true, colourNames: true, nico: false, lightsButton: true, syncOff: false, highlights: true,
    clickToInsert: true, emoteSizes: true, chatDimSeparate: false, nicoEmotesOnly: false, nicoTextOnly: false, nicoSpeed: 100,
    nicoEmoteOpacity: 100, dim: 90, peekSeconds: 4,
    chatDim: 40, hybrid: false, hybridLeft: true, hybridTextSize: 100, hybridOpacity: 100, hybridDims: false };
  const ALL_OFF = { polished: false, colourNames: false, nico: false, lightsButton: false, syncOff: false, highlights: false,
    clickToInsert: false, emoteSizes: false, hybrid: false };
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
    keepChatAtEnd(chatBuffer(), () => {
      applyPolished();
      document.documentElement.classList.toggle("cytube-plus-emotes", settings.emoteSizes);
      sizeAllMessages();
    });
    updateChatWidth();
    recolourAll();
    document.documentElement.classList.toggle("cytube-plus-click", settings.clickToInsert);
    document.documentElement.classList.toggle("cytube-plus-highlight", settings.highlights);
    updateButtons();
    toPage({ action: "syncOff", on: settings.syncOff });
    if (nicoLayer) nicoLayer.style.setProperty("--cp-nico-emote-opacity", nicoEmoteOpacity());
    if (settings.nico && !wasNico) nicoTurnedOn();
    if (!settings.nico) clearNico();
    if (!settings.lightsButton && lightsOn) setLights(false);
    else if (lightsOn) {
      clearTimeout(peekTimer);
      placeScrim();
      setDarkness(restingLevel(), 250, "ease-in-out");
    }
    updateHybrid();
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

  // Long messages wrap in their own column beside the time and name
  // (polished-css.js), but only on a chat wide enough for that. On a narrow
  // one (a phone, or a small window with the user list beside the chat) the
  // column would be a sliver, so the chat keeps CyTube's own flow.
  // (Once on, it stays on down to a little less, so a scrollbar coming and
  // going can't flip it back and forth.)
  const WIDE_CHAT = 320;
  const WIDE_CHAT_MARGIN = 24;

  function updateChatWidth() {
    const buffer = chatBuffer();
    const isWide = document.documentElement.classList.contains("cytube-plus-wide-chat");
    const wide = settings.polished && !!buffer && buffer.clientWidth >= (isWide ? WIDE_CHAT - WIDE_CHAT_MARGIN : WIDE_CHAT);
    if (isWide === wide) return;
    keepChatAtEnd(buffer, () => document.documentElement.classList.toggle("cytube-plus-wide-chat", wide));
  }

  function watchChatWidth() {
    const buffer = chatBuffer();
    if (buffer) new ResizeObserver(updateChatWidth).observe(buffer);
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
          if (node instanceof Element && node.tagName === "LINK") node.addEventListener("load", stylesChanged, { once: true });
        }
        if (m.target !== polishedStyle && (m.type === "characterData" || m.target.nodeName === "STYLE")) styles = true;
      }
      if (theme) placePolished();
      if (styles || theme) stylesChanged();
    }).observe(document.head, { childList: true, subtree: true, characterData: true });
  }

  // What the page's styles changing means for the add-on, done once a frame
  // however many styles change at once (before the frame is drawn, so
  // nothing shows in between).
  let stylesQueued = false;

  function stylesChanged() {
    if (stylesQueued) return;
    stylesQueued = true;
    requestAnimationFrame(() => {
      stylesQueued = false;
      // Name colours are made readable against the chat's background, so
      // they're redone if that changed; otherwise only staff colours (from
      // the user list, which the channel's CSS may colour) are checked.
      const background = findChatBackground();
      if (!chatBackground || ["r", "g", "b"].some((k) => background[k] !== chatBackground[k])) {
        recolourAll();
      } else {
        userIndex = null;
        refreshNameColours();
      }
      // The channel's CSS can change how big it shows emotes. It has
      // already moved the chat by now, so whether it was following the
      // newest message comes from how it was last scrolled.
      if (settings.emoteSizes) {
        const follow = chatFollowing;
        sizeAllMessages();
        const buffer = chatBuffer();
        if (follow && buffer) buffer.scrollTop = buffer.scrollHeight;
      }
    });
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
  const ourColour = new WeakMap();   // a name in chat -> { given, shown }: the colour this gave it
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

  // The chat's own background, looking up past see-through elements. (While
  // hybrid chat has it over the video, the one it had in the page.)
  function findChatBackground() {
    if (hybrid) return hybrid.chatBackground;
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

  // Staff show their rank colour in chat only while they have CyTube's "show
  // name colour" on, but always in the user list. So that their name looks
  // the same in both, it gets the colour the user list shows it in. Kept
  // after they leave, so their earlier messages don't change colour.
  const STAFF = ["userlist_op", "userlist_owner", "userlist_siteadmin"];
  const staffColours = new Map();   // lower-case name -> colour

  // Who's in the user list, by lower-case name: their name tag if they're
  // staff, null if not. Made once when needed, and thrown away whenever the
  // list (or the page's styles) change, rather than searching the whole list
  // for every message: a busy channel has hundreds of people in it.
  let userIndex = null;

  function usersByName() {
    if (!userIndex) {
      userIndex = new Map();
      for (const item of document.querySelectorAll("#userlist .userlist_item")) {
        const tag = item.children[1];
        if (!tag) continue;
        const lower = tag.textContent.trim().toLowerCase();
        if (!userIndex.has(lower)) userIndex.set(lower, STAFF.some((c) => tag.classList.contains(c)) ? { tag, colour: null } : null);
      }
    }
    return userIndex;
  }

  function nameColour(name) {
    const lower = name.toLowerCase();
    const users = usersByName();
    if (users.has(lower)) {
      const staff = users.get(lower);
      if (staff) staffColours.set(lower, staff.colour ??= getComputedStyle(staff.tag).color);
      else staffColours.delete(lower);
    }
    return staffColours.get(lower) ?? colourFor(name);
  }

  function nameOf(strong) {
    return strong.textContent.replace(/:\s*$/, "").trim();
  }

  // The colour goes over whatever the channel's CSS gives names (inline and
  // !important, so even a channel's !important rule gives way). Staff whose
  // messages carry their rank colour keep it, and site-admin flair is a
  // label of its own. A name a channel's script has coloured itself, on the
  // spot (a "pick your name colour" feature, say), keeps that colour.
  function colourName(div) {
    if (!(div instanceof HTMLElement) || fromServer(div)) return;
    const strong = div.querySelector(":scope > span:not(.timestamp) > strong.username");
    if (!strong || ourColour.has(strong)) return;
    const span = strong.parentElement;
    if ([...span.classList].some((c) => c.startsWith("userlist_") || c === "label")) return;
    if (strong.style.color || span.style.color) return;
    const name = nameOf(strong);
    if (!name) return;
    giveColour(strong, nameColour(name));
  }

  function giveColour(strong, colour) {
    strong.style.setProperty("color", colour, "important");
    ourColour.set(strong, { given: colour, shown: strong.style.getPropertyValue("color") });
  }

  // Ours still, unless a channel script has since coloured it itself.
  function stillOurs(strong) {
    return strong.style.getPropertyValue("color") === ourColour.get(strong)?.shown;
  }

  // Takes back every colour this gave (leaving any a channel script has
  // since put there), then colours again if the setting is on.
  function recolourAll() {
    const buffer = document.getElementById("messagebuffer");
    if (!buffer) return;
    for (const strong of buffer.querySelectorAll("strong.username")) {
      if (!ourColour.has(strong)) continue;
      if (stillOurs(strong)) strong.style.removeProperty("color");
      ourColour.delete(strong);
    }
    colourCache.clear();
    chatBackground = null;
    userIndex = null;
    if (settings.colourNames) for (const div of buffer.children) colourName(div);
  }

  // Names already in chat, after the user list (or the page's styles)
  // changed: only those whose colour has changed are touched.
  function refreshNameColours() {
    const buffer = document.getElementById("messagebuffer");
    if (!buffer || !settings.colourNames) return;
    for (const strong of buffer.querySelectorAll("strong.username")) {
      if (!ourColour.has(strong) || !stillOurs(strong)) continue;
      const colour = nameColour(nameOf(strong));
      if (colour !== ourColour.get(strong).given) giveColour(strong, colour);
    }
  }

  // Someone joining, leaving or changing rank: names already in chat follow
  // (chat history can also arrive before the user list does).
  function watchUserlist() {
    const list = document.getElementById("userlist");
    const buffer = document.getElementById("messagebuffer");
    if (!list || !buffer) return;
    let timer = 0;
    new MutationObserver(() => {
      userIndex = null;
      if (!timer) timer = setTimeout(() => { timer = 0; refreshNameColours(); }, 300);
    }).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
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
  // out to as much as 11.265 s. Lanes are 34 high, at most 12, and each
  // comment takes one at random (an empty lane if there is one, else any
  // lane where it won't run into the comment ahead of it, and not the lane
  // the last comment took while there's another); 75 ms between comments
  // setting off; 24 between comments in a lane; text 20 bold, emotes 28 (56
  // when a message is only emotes). Comments fly in the order they were
  // said, except that one which has to wait for room (a long one is fast,
  // and mustn't catch up with the comment ahead of it) lets the ones behind
  // it that fit go first.
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
  let lastLane = -1;               // the lane the last comment took
  // Waiting to fly: { div, content, ready, settled, solo, empty, el, width, scale, duration, speed }
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

  // How see-through the flying emotes are (10-100%, from the popup), for
  // content.css: 1 is solid.
  function nicoEmoteOpacity() {
    return String(clamp(settings.nicoEmoteOpacity ?? DEFAULTS.nicoEmoteOpacity, 10, 100) / 100);
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
    nicoLayer.style.setProperty("--cp-nico-emote-opacity", nicoEmoteOpacity());
    box.appendChild(nicoLayer);
    laneOccupants = new Map();
    layerObserver?.disconnect();
    layerObserver = new ResizeObserver(relayout);
    layerObserver.observe(nicoLayer);
    // Made while the lights are down: above the dark at once.
    if (lightsOn) placeScrim();
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
      c.el.style.top = laneTop(c.el, c.lane, g) + "px";
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
      // Not the chat's own sizing of the emote (nor the small size it's
      // held at while it loads): comments size their emotes themselves.
      else img.removeAttribute("style");
    }
    // Addresses the channel doesn't turn into links are plain text.
    const walker = clone.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      t.nodeValue = t.nodeValue.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "");
    }
    const emotes = pairs.filter(([, img]) => clone.contains(img));
    // Emotes only (an option in the popup): just the message's emotes fly,
    // a little apart and at the size of an all-emote message, and a message
    // without one doesn't fly at all.
    if (settings.nicoEmotesOnly) {
      if (!emotes.length) return null;
      const space = () => clone.ownerDocument.createTextNode(" ");
      clone.replaceChildren(...emotes.flatMap(([, img], i) => (i ? [space(), img] : [img])));
    }
    // Text only (also an option): the emotes are left out, and a message
    // that's nothing but emotes doesn't fly.
    else if (settings.nicoTextOnly) {
      for (const [, img] of emotes) img.remove();
      if (clone.textContent.trim() === "") return null;
      return { div, content: clone, ready: emotesReady([], clone) };
    }
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
      // It gains on [last] until [last] is off the video, by which time its
      // front must still be [gap] short of the video's left edge.
      const allowedRemain = (screenWidth - gap) / speed;
      overtakeWait = Math.max(0, Math.ceil(last.clearAt - now - allowedRemain));
    }
    return Math.max(entryWait, overtakeWait);
  }

  // How long until [lane] will take comment [c] (0: it would now).
  function laneWait(lane, now, c, g) {
    const list = laneOccupants.get(lane);
    return list ? laneWaitMs(list[list.length - 1], now, c.width, c.speed, g.gap, g.width) : 0;
  }

  // A lane for comment [c], picked at random so comments turn up all over
  // the video rather than working down it in order: an empty lane if there's
  // one, else any lane it can enter now without running into the comment
  // ahead of it, never [avoid]; or null if there's none. Not the lane the
  // last comment took, while there's another to pick, so one comment doesn't
  // follow another at the same height.
  function findBestLane(now, c, g, avoid = -1) {
    const emptyLanes = [];
    const safeLanes = [];
    for (let lane = 0; lane < g.laneCount; lane++) {
      if (lane === avoid) continue;
      if (!laneOccupants.has(lane)) emptyLanes.push(lane);
      else if (laneWait(lane, now, c, g) === 0) safeLanes.push(lane);
    }
    const lanes = emptyLanes.length ? emptyLanes : safeLanes;
    if (!lanes.length) return null;
    const others = lanes.filter((lane) => lane !== lastLane);
    const choices = others.length ? others : lanes;
    lastLane = choices[Math.floor(Math.random() * choices.length)];
    return lastLane;
  }

  // The lane that will take comment [c] soonest (never [avoid]), and how
  // long until it will.
  function soonestLane(now, c, g, avoid = -1) {
    let best = { lane: -1, wait: Infinity };
    for (let lane = 0; lane < g.laneCount; lane++) {
      if (lane === avoid) continue;
      const wait = laneWait(lane, now, c, g);
      if (wait < best.wait) best = { lane, wait };
    }
    return best;
  }

  // Which comment flies next, and in which lane: the oldest one that's ready
  // ([ready] is oldest first), if a lane will take it now. If none will yet
  // (a long comment is fast, so it may have to wait until it won't catch up
  // with the comment ahead), a later one that fits now goes first, so the
  // whole queue isn't held up behind it; but never in the lane the oldest
  // will get first, so the oldest isn't kept waiting any longer. If nothing
  // can go, how long until something can, so the loop sleeps that long
  // rather than checking every frame (a new message wakes it anyway).
  function pickComment(now, ready, g) {
    for (const [lane, list] of laneOccupants) {
      const kept = list.filter((o) => now < o.clearAt);
      if (kept.length) laneOccupants.set(lane, kept);
      else laneOccupants.delete(lane);
    }
    const [oldest, ...rest] = ready;
    const lane = findBestLane(now, oldest, g);
    if (lane !== null) return { item: oldest, lane };
    const held = soonestLane(now, oldest, g);
    let wait = held.wait;
    // (Not when the oldest is about to go: the stagger after one going
    // first would hold it up.)
    if (held.wait > NICO_SPAWN_STAGGER_MS) {
      for (const c of rest) {
        const lane = findBestLane(now, c, g, held.lane);
        if (lane !== null) return { item: c, lane };
        wait = Math.min(wait, soonestLane(now, c, g, held.lane).wait);
      }
    }
    return { item: null, wait: Math.min(1000, Math.max(16, wait)) };
  }

  // How far a comment has to go to be fully off the video: its exact width,
  // plus room for the glow round the text, so it's gone, glow and all,
  // before it's taken away.
  // Where a comment in [lane] goes: its lane. One taller than its lane (a
  // message that's only emotes) in the bottom lanes hangs below the video
  // (content.css lets it), except in fullscreen, where there's nothing below
  // and it would be cut off: there it sits on the video's bottom edge.
  function laneTop(el, lane, g) {
    const top = lane * g.laneHeight;
    if (!document.fullscreenElement?.contains(el)) return top;
    const height = el.getBoundingClientRect().height;
    return Math.max(0, Math.min(top, g.height - height));
  }

  function commentWidth(el, scale) {
    return Math.ceil(el.getBoundingClientRect().width) + Math.ceil(NICO_GLOW * scale * 2);
  }

  function sizeComment(el, solo, scale) {
    el.style.fontSize = NICO_TEXT_SIZE * scale + "px";
    el.style.textShadow = `0 0 ${NICO_GLOW * scale}px #000`;
    const h = (solo ? NICO_SOLO_EMOTE_HEIGHT : NICO_EMOTE_HEIGHT) * scale;
    for (const img of el.querySelectorAll("img")) {
      // A channel's limit on emotes in chat doesn't hold them down here.
      img.style.setProperty("max-height", "none", "important");
      img.style.setProperty("max-width", "none", "important");
      img.style.setProperty("height", h + "px", "important");
      const ratio = Number(img.dataset.cpRatio);
      if (ratio > 0) img.style.setProperty("width", h * ratio + "px", "important");
    }
  }

  // The comments, built and measured before they're placed (again if the
  // video changed size, or the layer was made anew, while they waited). All
  // are built before any is measured, so a burst of chat is laid out once
  // rather than once each.
  function prepare(items, layer, scale) {
    const fresh = items.filter((item) => !item.el || item.scale !== scale || item.el.parentElement !== layer);
    for (const item of fresh) {
      if (!item.el) {
        item.el = document.createElement("div");
        item.el.className = "cp-nico-comment";
        // Only emotes: it goes under comments with text (see content.css).
        if (item.solo) item.el.classList.add("cp-nico-solo");
        item.el.style.visibility = "hidden";
        item.el.appendChild(item.content);
      }
      if (item.el.parentElement !== layer) layer.appendChild(item.el);
      sizeComment(item.el, item.solo, scale);
      item.scale = scale;
    }
    for (const item of fresh) item.width = commentWidth(item.el, scale);
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

        // Only comments that are ready can fly: one still waiting for an
        // emote image doesn't hold up the ones behind it, and goes as soon
        // as the image is in. One left with nothing to show is dropped.
        for (let i = pending.length - 1; i >= 0; i--) {
          if (pending[i].settled && pending[i].empty) pending.splice(i, 1);
        }
        const ready = pending.filter((i) => i.settled);
        if (!ready.length) {
          if (pending.length) await sleep(1000, true);
          continue;
        }
        prepare(ready, layer, g.scale);
        const fast = nicoSpeed();
        for (const item of ready) {
          const distance = g.width + item.width;
          item.duration = Math.min(NICO_MAX_DURATION_MS / fast, Math.max(NICO_BASELINE_DURATION_MS / fast,
            Math.round(distance / (NICO_MAX_SPEED * g.scale * fast))));
          item.speed = distance / item.duration;
        }

        // The animations' own clock, so a comment is exactly where the lanes
        // think it is (it would otherwise start a frame late).
        const now = document.timeline.currentTime ?? performance.now();
        const { item, lane, wait } = pickComment(now, ready, g);
        if (!item) {
          await sleep(wait, true);
          continue;
        }
        pending.splice(pending.indexOf(item), 1);
        const { duration, speed } = item;
        const occupant = { spawnAt: now, speed, width: item.width, clearAt: now + duration };
        if (!laneOccupants.has(lane)) laneOccupants.set(lane, []);
        laneOccupants.get(lane).push(occupant);

        const c = { el: item.el, solo: item.solo, lane, width: item.width, duration, occupant };
        c.el.style.top = laneTop(c.el, lane, g) + "px";
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

  // ---- hybrid chat ----------------------------------------------------------
  //
  // In CyTube's fullscreen, the channel's chat over the video, and fully
  // usable there: down one side (the left, or the right: from the popup),
  // from the bottom up, with the message box in the middle of the bottom
  // edge. It's the chat itself, not a copy: its messages and its box are
  // moved into the fullscreen video while it's there, and put back where
  // they were the moment it isn't, so CyTube's own chat (sending, tab
  // completion, the box's history) and the add-on's clicks on names and
  // emotes work there as ever. While it's showing:
  //  - the video can't be clicked: a click, or moving the mouse, brings up
  //    the controls (leave fullscreen, mute, the title, Hide chat and the
  //    message box) for a few seconds, and a tap brings them up or puts them
  //    away. Nothing reaches the player, so the mute button is there instead
  //    of its volume (sync-page.js mutes it);
  //  - Niconico comments are off (turning either on turns the other off);
  //  - links in messages are plain text, so a stray click can't open one.
  // The smiley in the box opens the channel's emotes (CyTube's own list is a
  // dialog on the page, which can't show in fullscreen): pick one, or search.
  // Hide chat puts it away for the rest of that fullscreen visit (the player
  // can be used again), leaving Show chat in chat's corner, with how many
  // messages came in meanwhile. With "Dim when quiet" on (in the popup), it
  // fades right back after a while with nothing new. Private messages stay
  // in CyTube's own windows, outside fullscreen.
  //
  // Nothing runs while it just sits there: no timers but the controls' few
  // seconds and the quiet wait, and no animation but the fades and slides.

  const HYBRID_CONTROLS_MS = 2500;
  const HYBRID_REST_AFTER_MS = 15000;
  // How long the message box waits, in use but empty and untouched, before
  // it goes (see boxIdle).
  const HYBRID_BOX_IDLE_MS = 6000;
  // Using the chat (the mouse over it, scrolling it) wakes it, at most this
  // often.
  const HYBRID_WAKE_EVERY_MS = 500;
  // The emote picker puts this many emotes in at a time, and more as it's
  // scrolled down to them (a channel can have thousands).
  const EMOTES_PER_DRAW = 120;

  // While it's up: its elements, where the chat's own came from, and how
  // it's doing. See mountHybrid.
  let hybrid = null;

  // How see-through it is (20-100%, from the popup), for content.css: 1 is
  // solid.
  function hybridOpacity() {
    return String(clamp(settings.hybridOpacity ?? DEFAULTS.hybridOpacity, 20, 100) / 100);
  }

  // How big its messages are (80-200%, from the popup), for content.css: 1
  // is the usual size. The emotes in them grow and shrink with the text.
  function hybridTextScale() {
    return String(clamp(settings.hybridTextSize ?? DEFAULTS.hybridTextSize, 80, 200) / 100);
  }

  // Up while it's on and CyTube's fullscreen (the video box) is.
  function hybridWanted() {
    const box = videoBox();
    return !!settings.hybrid && !!box && document.fullscreenElement === box;
  }

  function updateHybrid() {
    if (!hybridWanted()) {
      if (hybrid) unmountHybrid();
      return;
    }
    if (!hybrid) mountHybrid();
    if (!hybrid) return;
    hybrid.root.classList.toggle("cp-hybrid-left", !!settings.hybridLeft);
    hybrid.root.style.setProperty("--cp-hybrid-opacity", hybridOpacity());
    hybrid.root.style.setProperty("--cp-hybrid-scale", hybridTextScale());
    for (const div of chatBuffer()?.children ?? []) markSender(div);
    wakeChat();
  }
  document.addEventListener("fullscreenchange", updateHybrid);

  function mountHybrid() {
    const box = videoBox();
    const buffer = chatBuffer();
    if (!box || !buffer) return;
    const make = (tag, className) => {
      const el = document.createElement(tag);
      el.className = className;
      return el;
    };
    const root = make("div", "cp-hybrid");
    // Over the whole video, under the chat: a click that isn't on the chat
    // is a click on the video (see tapVideo).
    const catcher = make("div", "cp-hybrid-catcher");
    const column = make("div", "cp-hybrid-column");
    const top = make("div", "cp-hybrid-top");
    const exit = make("button", "cp-hybrid-exit");
    exit.type = "button";
    exit.title = "Leave fullscreen";
    exit.setAttribute("aria-label", "Leave fullscreen");
    exit.appendChild(pathIcon(EXIT_FULLSCREEN));
    // Mute, beside leaving fullscreen: the video's two, in the far corner
    // from the chat.
    const mute = make("button", "cp-hybrid-mute");
    mute.type = "button";
    const title = make("span", "cp-hybrid-title");
    const toggle = make("button", "cp-hybrid-toggle");
    toggle.type = "button";
    const chatBox = make("div", "cp-hybrid-box");
    const emoteBtn = make("button", "cp-hybrid-emote-btn");
    emoteBtn.type = "button";
    emoteBtn.title = "Emotes";
    emoteBtn.setAttribute("aria-label", "Emotes");
    emoteBtn.appendChild(pathIcon(SMILEY));
    chatBox.appendChild(emoteBtn);
    const picker = make("div", "cp-hybrid-emotes");
    picker.hidden = true;
    const search = make("input", "cp-hybrid-emote-search");
    search.type = "search";
    search.placeholder = "Search emotes";
    search.setAttribute("aria-label", "Search emotes");
    search.autocomplete = "off";
    search.spellcheck = false;
    const grid = make("div", "cp-hybrid-emote-grid");
    picker.append(search, grid);
    top.append(exit, mute, title, toggle);
    root.append(catcher, column, top, picker, chatBox);
    box.appendChild(root);
    const ac = new AbortController();
    // Names are coloured to read against the chat's background in the page:
    // still that one while the chat's over the video (see findChatBackground).
    const chatBackground = findChatBackground();
    hybrid = { root, title, toggle, chatBox, ac, chatBackground, moved: [], hidden: false, unread: 0, placeholder: false,
      controlsTimer: 0, shownAt: 0, restTimer: 0, wokenAt: 0, pointer: "mouse", mute, muted: false, boxTimer: 0,
      emoteBtn, picker, search, grid, pickerOpen: false, emoteMatches: [], emotesShown: 0, emoteMore: null, emoteWatch: null };

    // The messages, and the form the box is in (with the guest login, and
    // CyTube's "New Messages Below", which it puts by the box).
    moveInto(buffer, column);
    const line = document.getElementById("chatline");
    const form = line?.closest("#chatwrap form") ?? (line?.closest("#chatwrap") ? line : null);
    if (form) moveInto(form, chatBox);
    // Its emotes sized for over the video (see emoteLimit).
    sizeAllMessages();
    // Something to say it's a box, which CyTube's hasn't (taken off after).
    if (line && !line.placeholder) {
      line.placeholder = "Message";
      hybrid.placeholder = true;
    }
    // Moved, the chat starts back at the top: down to the newest.
    buffer.scrollTop = buffer.scrollHeight;

    const on = (target, type, fn, options) => target.addEventListener(type, fn, { ...options, signal: ac.signal });
    on(root, "pointerdown", (e) => {
      hybrid.pointer = e.pointerType;
      wakeSoon();
    });
    on(root, "pointermove", (e) => { if (e.pointerType === "mouse") showControls(); });
    on(catcher, "click", tapVideo);
    on(buffer, "scroll", wakeSoon, { passive: true });
    on(exit, "click", () => { document.exitFullscreen().catch(() => {}); });
    on(mute, "click", () => toPage({ action: "mute", on: !hybrid.muted }));
    on(toggle, "click", () => setChatHidden(!hybrid.hidden));
    on(chatBox, "focusin", showControls);
    on(chatBox, "input", markTyped);
    on(chatBox, "keydown", sentFromBox);
    for (const type of ["focusin", "keydown", "input"]) on(chatBox, type, boxActive);
    on(document, "keydown", typeFromVideo);
    on(emoteBtn, "click", () => setPickerOpen(!hybrid.pickerOpen));
    on(search, "input", () => drawEmotes(true));
    // Enter takes the first emote found; Escape closes the picker.
    on(search, "keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        grid.querySelector(".cp-hybrid-emote")?.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setPickerOpen(false);
      }
    });
    // An emote picked goes into the box, as CyTube's own list puts it, and
    // the picker closes.
    on(grid, "click", (e) => {
      const item = e.target instanceof Element && e.target.closest(".cp-hybrid-emote");
      if (!item) return;
      setPickerOpen(false);
      insertIntoChat(item.dataset.name);
    });
    const viewport = window.visualViewport;
    if (viewport) {
      on(viewport, "resize", placeOverKeyboard);
      on(viewport, "scroll", placeOverKeyboard);
      placeOverKeyboard();
    }
    updateToggle();
    updateMute();
    // The controls come up with the chat for a moment, so its box and Hide
    // chat are seen.
    showControls();
  }

  function unmountHybrid() {
    const h = hybrid;
    hybrid = null;
    h.ac.abort();
    h.emoteWatch?.disconnect();
    clearTimeout(h.boxTimer);
    clearTimeout(h.controlsTimer);
    clearTimeout(h.restTimer);
    const focused = h.chatBox.contains(document.activeElement) ? document.activeElement : null;
    for (const moved of h.moved) putBack(moved);
    if (h.placeholder) document.getElementById("chatline")?.removeAttribute("placeholder");
    h.root.remove();
    // Back in the page: its emotes sized for the page again, the ones that
    // came in meanwhile too.
    sizeAllMessages();
    const buffer = chatBuffer();
    if (buffer) buffer.scrollTop = buffer.scrollHeight;
    // Leaving fullscreen resizes the window first, so CyTube sized the chat
    // for the page while its box was still in here: once more, now it's back.
    window.dispatchEvent(new Event("resize"));
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }

  // Each of the chat's own elements leaves a mark where it was, to go back
  // to exactly.
  function moveInto(el, parent) {
    const marker = document.createComment(" cytube-plus: hybrid chat ");
    el.before(marker);
    parent.appendChild(el);
    hybrid.moved.push({ el, marker });
  }

  function putBack({ el, marker }) {
    if (marker.isConnected) marker.replaceWith(el);
    // Its place gone (a channel's script redid the chat): in the chat, at least.
    else (document.getElementById("chatwrap") ?? document.body).appendChild(el);
  }

  // What's playing, as CyTube shows it above the video, without its
  // "Currently Playing:".
  function currentTitle() {
    const text = document.getElementById("currenttitle")?.textContent.trim() ?? "";
    return text.replace(/^currently playing:\s*/i, "");
  }

  // A click on the video (not on the chat): the keyboard goes, and the
  // controls come up; a tap brings them up or puts them away. Nothing
  // reaches the player.
  function tapVideo() {
    if (!hybrid) return;
    if (hybrid.pickerOpen) {
      setPickerOpen(false);
      return;
    }
    const typingHere = hybrid.chatBox.contains(document.activeElement);
    if (typingHere) document.activeElement.blur();
    if (hybrid.pointer !== "mouse" && !typingHere && hybrid.root.classList.contains("cp-controls")) hideControls();
    else showControls();
  }

  function showControls() {
    if (!hybrid) return;
    const now = performance.now();
    if (!hybrid.root.classList.contains("cp-controls")) {
      hybrid.root.classList.add("cp-controls");
      const title = currentTitle();
      if (hybrid.title.textContent !== title) hybrid.title.textContent = title;
      // Not logged in, there's the guest login instead of a message box, and
      // no emotes to put in it.
      hybrid.root.classList.toggle("cp-guest", !document.getElementById("chatline")?.offsetParent);
      // Muted or not, as the player is now (a new video, or its own volume
      // changed meanwhile), and whether it can be: answered at once.
      toPage({ action: "volume" });
    } else if (now - hybrid.shownAt < 250) {
      return;   // a mouse moving: once in a while is plenty
    }
    hybrid.shownAt = now;
    clearTimeout(hybrid.controlsTimer);
    hybrid.controlsTimer = setTimeout(hideControls, HYBRID_CONTROLS_MS);
    wakeChat();
  }

  function hideControls() {
    if (!hybrid) return;
    clearTimeout(hybrid.controlsTimer);
    hybrid.root.classList.remove("cp-controls");
  }

  // Hide chat, and Show chat. Put away, it leaves the video to the player,
  // and Show chat in its corner counts what's said meanwhile.
  function setChatHidden(hidden) {
    if (!hybrid) return;
    hybrid.hidden = hidden;
    hybrid.unread = 0;
    hybrid.root.classList.toggle("cp-chat-hidden", hidden);
    if (hidden) {
      setPickerOpen(false);
      if (hybrid.chatBox.contains(document.activeElement)) document.activeElement.blur();
      hideControls();
    } else {
      const buffer = chatBuffer();
      if (buffer) buffer.scrollTop = buffer.scrollHeight;
      showControls();
    }
    updateToggle();
    wakeChat();
  }

  // The player's volume, from the page (sync-page.js): muted or not, and
  // whether this kind of player can be muted from here at all (a custom
  // embed can't, and then there's no button).
  document.addEventListener("cytube-plus:volume", (e) => {
    if (!hybrid || typeof e.detail !== "string") return;
    let state;
    try { state = JSON.parse(e.detail); } catch (err) { return; }
    if (!state || typeof state !== "object") return;
    hybrid.muted = !!state.muted;
    hybrid.root.classList.toggle("cp-hybrid-no-mute", !state.can);
    updateMute();
  });

  function updateMute() {
    if (!hybrid) return;
    const label = hybrid.muted ? "Unmute" : "Mute";
    hybrid.mute.replaceChildren(pathIcon(hybrid.muted ? MUTED : SOUND));
    hybrid.mute.title = label;
    hybrid.mute.setAttribute("aria-label", label);
  }

  function updateToggle() {
    if (!hybrid) return;
    const n = hybrid.unread;
    hybrid.toggle.textContent = !hybrid.hidden ? "Hide chat" : n === 0 ? "Show chat" : `Show chat · ${n > 99 ? "99+" : n}`;
  }

  // The message box in use but empty, and untouched for a while (clicked
  // into, or a message sent, and nothing more): it goes, as a click beside
  // it would put it away, and with a finger the keyboard goes down with it.
  // (Esc can't do this: the browser keeps it for leaving fullscreen.)
  // Anything typed starts the wait again; something typed and not sent
  // keeps it, as the emote picker being open does.
  function boxActive() {
    if (!hybrid) return;
    clearTimeout(hybrid.boxTimer);
    hybrid.boxTimer = setTimeout(boxIdle, HYBRID_BOX_IDLE_MS);
  }

  function boxIdle() {
    if (!hybrid) return;
    const active = document.activeElement;
    if (!active || !hybrid.chatBox.contains(active) || hybrid.root.classList.contains("cp-has-text")) return;
    if (hybrid.pickerOpen) {
      boxActive();
      return;
    }
    active.blur();
  }

  // Something typed and not yet sent keeps the box up, as being in it does.
  function markTyped() {
    if (!hybrid) return;
    const typed = [...hybrid.chatBox.querySelectorAll("input")].some((input) => input.value !== "");
    hybrid.root.classList.toggle("cp-has-text", typed);
  }

  // Sent: CyTube empties the box as it sends (its own handler has run by
  // now). With a finger, the keyboard goes down with it, rather than the box
  // sitting there focused; with a mouse and keyboard, it stays for the next.
  function sentFromBox(e) {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
    markTyped();
    if (e.target.value === "" && hybrid.pointer !== "mouse") e.target.blur();
  }

  // Enter, with nothing being typed in, goes to the message box (a button
  // of its own still takes it). Not the Enter that sent a message from the
  // box, on its way up: with a finger, that one has just put the keyboard
  // away (see sentFromBox).
  function typeFromVideo(e) {
    if (e.key !== "Enter" || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!hybrid || hybrid.hidden || typing() || hybrid.chatBox.contains(e.target)) return;
    const active = document.activeElement;
    if (active && hybrid.root.contains(active) && active.matches("button")) return;
    const input = [...hybrid.chatBox.querySelectorAll("input")].find((i) => !i.disabled && i.offsetParent !== null);
    if (!input) return;
    e.preventDefault();
    input.focus();
  }

  // A phone's keyboard over the bottom of the screen: the box and the
  // messages move up above it.
  function placeOverKeyboard() {
    const viewport = window.visualViewport;
    if (!hybrid || !viewport) return;
    const covered = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    hybrid.root.style.setProperty("--cp-keyboard", covered + "px");
  }

  // The quiet wait (with "Dim when quiet" on) starts again with anything new
  // or anything done with the chat; once it's over, the chat fades right
  // back until either.
  function wakeChat() {
    if (!hybrid) return;
    hybrid.wokenAt = performance.now();
    hybrid.root.classList.remove("cp-resting");
    clearTimeout(hybrid.restTimer);
    hybrid.restTimer = settings.hybridDims ? setTimeout(restChat, HYBRID_REST_AFTER_MS) : 0;
  }

  function wakeSoon() {
    if (hybrid && performance.now() - hybrid.wokenAt >= HYBRID_WAKE_EVERY_MS) wakeChat();
  }

  function restChat() {
    if (!hybrid) return;
    // Not while it's in use: its controls up, or its box being written in.
    const root = hybrid.root;
    if (root.classList.contains("cp-controls") || root.classList.contains("cp-has-text") || hybrid.pickerOpen ||
        hybrid.chatBox.contains(document.activeElement)) {
      hybrid.restTimer = setTimeout(restChat, HYBRID_REST_AFTER_MS);
      return;
    }
    root.classList.add("cp-resting");
  }

  // A person's message, not the server's (nor CyTube's own lines).
  function isPersonsMessage(div) {
    return div.id !== "newmessages-indicator" && !fromServer(div) && !!senderOf(div);
  }

  // The bar down a message's outer edge is in its sender's colour (with
  // Coloured names on; otherwise one quiet colour for everyone, in
  // content.css).
  function markSender(div) {
    if (!(div instanceof HTMLElement) || !isPersonsMessage(div)) return;
    const sender = settings.colourNames ? senderOf(div) : "";
    if (sender) div.style.setProperty("--cp-sender", nameColour(sender));
    else div.style.removeProperty("--cp-sender");
  }

  // New messages while it's up: wake it, and while it's put away, count
  // what people say (not the history CyTube replays) for Show chat.
  function hybridHeard(said) {
    if (hybrid.hidden && said) {
      hybrid.unread += said;
      updateToggle();
    }
    wakeChat();
  }

  // ---- hybrid chat's emote picker

  // The channel's emotes, from the page (sync-page.js reads CyTube's list
  // there): asked for each time the picker opens, and answered at once.
  let channelEmotes = { key: "", list: [] };

  document.addEventListener("cytube-plus:emotes", (e) => {
    if (typeof e.detail !== "string" || e.detail === channelEmotes.key) return;
    let data;
    try { data = JSON.parse(e.detail); } catch (err) { return; }
    if (!data || !Array.isArray(data.emotes)) return;
    const list = data.emotes
      .filter((x) => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string")
      .map(([name, image]) => ({ name, image, lower: name.toLowerCase() }));
    // As CyTube's own list, when its options sort it.
    if (data.alphabetical) list.sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
    channelEmotes = { key: e.detail, list };
    if (hybrid?.pickerOpen) drawEmotes(true);
  });

  function setPickerOpen(open) {
    if (!hybrid || hybrid.pickerOpen === open) return;
    // The list as it is now (asked before it's open, so it's drawn once).
    if (open) toPage({ action: "emotes" });
    hybrid.pickerOpen = open;
    hybrid.picker.hidden = !open;
    hybrid.root.classList.toggle("cp-emotes-open", open);
    hybrid.emoteBtn.classList.toggle("cp-on", open);
    if (open) {
      drawEmotes(true);
      // With a mouse, straight into the search; a finger would bring a
      // keyboard up over the emotes.
      if (hybrid.pointer === "mouse") hybrid.search.focus({ preventScroll: true });
    } else {
      // Closed, its emotes go, pictures and all, and the search with them:
      // it opens on the whole list again.
      hybrid.emoteWatch?.disconnect();
      hybrid.emoteWatch = null;
      hybrid.emoteMore = null;
      hybrid.grid.replaceChildren();
      hybrid.search.value = "";
    }
    wakeChat();
  }

  // The emotes whose names have what's typed in the search in them: the
  // first lot, then more as the picker's scrolled near its end. Pictures
  // load as they come into sight.
  function drawEmotes(fresh) {
    if (!hybrid?.pickerOpen) return;
    const grid = hybrid.grid;
    if (fresh) {
      const query = hybrid.search.value.trim().toLowerCase();
      hybrid.emoteMatches = query ? channelEmotes.list.filter((x) => x.lower.includes(query)) : channelEmotes.list;
      hybrid.emotesShown = 0;
      grid.replaceChildren();
      grid.scrollTop = 0;
    }
    if (hybrid.emoteMore) {
      hybrid.emoteWatch?.unobserve(hybrid.emoteMore);
      hybrid.emoteMore.remove();
      hybrid.emoteMore = null;
    }
    const matches = hybrid.emoteMatches;
    if (!matches.length) {
      const none = document.createElement("p");
      none.className = "cp-hybrid-emote-none";
      none.textContent = channelEmotes.list.length ? "No emotes match." : "This channel has no emotes.";
      grid.appendChild(none);
      return;
    }
    const end = Math.min(matches.length, hybrid.emotesShown + EMOTES_PER_DRAW);
    const items = [];
    for (let i = hybrid.emotesShown; i < end; i++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cp-hybrid-emote";
      button.title = matches[i].name;
      button.dataset.name = matches[i].name;
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = matches[i].name;
      img.src = matches[i].image;
      button.appendChild(img);
      items.push(button);
    }
    hybrid.emotesShown = end;
    grid.append(...items);
    if (end < matches.length) {
      hybrid.emoteMore = document.createElement("div");
      hybrid.emoteMore.className = "cp-hybrid-emote-more";
      grid.appendChild(hybrid.emoteMore);
      hybrid.emoteWatch ??= new IntersectionObserver((entries) => {
        if (entries.some((x) => x.isIntersecting)) drawEmotes(false);
      }, { root: grid, rootMargin: "300px" });
      hybrid.emoteWatch.observe(hybrid.emoteMore);
    }
  }

  // ---- emote sizes ------------------------------------------------------------

  // Shrink big emotes: an emote taller than the limit shrinks to it, 36px
  // inside a message and 84px when the message is only emotes (up to 30).
  // In hybrid chat over the video, 32px and 56px, growing and shrinking
  // with its text size: the same shrinking, so the one switch does both,
  // and everything's sized again as the chat goes over the video and comes
  // back (see mountHybrid). The limit is checked against the size the emote
  // is shown at without this (CyTube's, or the channel's own), so nothing
  // ever gets bigger: a small emote, or one the channel already shows
  // small, stays as it is.
  const EMOTE_LIMIT = 36;
  const EMOTE_ONLY_LIMIT = 84;
  const HYBRID_EMOTE_LIMIT = 32;
  const HYBRID_EMOTE_ONLY_LIMIT = 56;
  const EMOTE_ONLY_MAX = 30;
  const EMOTES = "img.channel-emote, video.channel-emote";

  function isEmoteOnly(div) {
    if (div.id === "newmessages-indicator" || fromServer(div)) return false;
    const message = div.lastElementChild;
    if (!message || message.classList.contains("timestamp")) return false;
    const emotes = message.querySelectorAll(EMOTES);
    if (!emotes.length || emotes.length > EMOTE_ONLY_MAX || message.textContent.trim() !== "") return false;
    // Nothing else that shows: a posted picture, a link, a spoiler.
    return !message.querySelector("img:not(.channel-emote), video:not(.channel-emote), a, iframe, .spoiler");
  }

  // How tall [emote] may be: in a message, or on its own, in the page's
  // chat or in hybrid chat.
  function emoteLimit(emote) {
    const only = !!emote.closest(".cp-emote-only");
    if (!hybrid?.root.contains(emote)) return only ? EMOTE_ONLY_LIMIT : EMOTE_LIMIT;
    return Math.round((only ? HYBRID_EMOTE_ONLY_LIMIT : HYBRID_EMOTE_LIMIT) * Number(hybridTextScale()));
  }

  // Messages: each marked if it's only emotes, then all their emotes sized
  // together (see sizeEmotes).
  function sizeMessages(divs) {
    const emotes = [];
    for (const div of divs) {
      if (!(div instanceof HTMLElement)) continue;
      div.classList.toggle("cp-emote-only", settings.emoteSizes && isEmoteOnly(div));
      emotes.push(...div.querySelectorAll(EMOTES));
    }
    sizeEmotes(emotes);
  }

  function sizeAllMessages() {
    sizeMessages(document.querySelectorAll("#messagebuffer > div, #pmbar .pm-buffer > div"));
  }

  const waitingToLoad = new WeakSet();

  // All undone, then all measured, then the big ones shrunk: measuring
  // between changes would have the browser lay the page out again for each
  // emote (a joining chat brings a hundred messages at once).
  //
  // An emote that's still loading can't be measured yet, but a big one
  // starts showing while it downloads, so until it has loaded it gets the
  // limit as a maximum height (or the page's own, if that's smaller: a
  // maximum never makes anything bigger). Once loaded, it's measured
  // without that and sized as usual, before the next frame is drawn.
  function sizeEmotes(emotes) {
    for (const emote of emotes) {
      if (emote.dataset.cpShrunk) {
        emote.style.removeProperty("height");
        emote.style.removeProperty("width");
        emote.style.removeProperty("object-fit");
        delete emote.dataset.cpShrunk;
      }
      if (emote.dataset.cpLoading) {
        emote.style.removeProperty("max-height");
        emote.style.removeProperty("object-fit");
        delete emote.dataset.cpLoading;
      }
    }
    if (!settings.emoteSizes) return;
    const shrink = [];
    const loading = [];
    for (const emote of emotes) {
      const limit = emoteLimit(emote);
      const video = emote instanceof HTMLVideoElement;
      if (video ? emote.readyState < 1 : !emote.complete) {
        const own = parseFloat(getComputedStyle(emote).maxHeight);
        loading.push([emote, Number.isFinite(own) ? Math.min(own, limit) : limit]);
        if (waitingToLoad.has(emote)) continue;
        waitingToLoad.add(emote);
        emote.addEventListener(video ? "loadedmetadata" : "load", () => {
          waitingToLoad.delete(emote);
          keepChatAtEnd(emote.closest("#messagebuffer, .pm-buffer"), () => sizeEmotes([emote]));
        }, { once: true });
        continue;
      }
      if (shownHeight(emote) > limit) shrink.push([emote, limit]);
    }
    for (const [emote, limit] of shrink) {
      emote.style.setProperty("height", limit + "px", "important");
      emote.style.setProperty("width", "auto", "important");
      emote.style.setProperty("object-fit", "contain", "important");
      emote.dataset.cpShrunk = "1";
    }
    for (const [emote, max] of loading) {
      emote.style.setProperty("max-height", max + "px", "important");
      emote.style.setProperty("object-fit", "contain", "important");
      emote.dataset.cpLoading = "1";
    }
  }

  // How tall an emote is shown. In a window that isn't open (a PM window,
  // say) it has no size on screen: then the height the page gives it, or its
  // own, within any limit the page sets.
  function shownHeight(emote) {
    const height = emote.getBoundingClientRect().height;
    if (height) return height;
    const style = getComputedStyle(emote);
    const set = parseFloat(style.height);
    const own = Number.isFinite(set) ? set : emote.naturalHeight || emote.videoHeight || 0;
    const max = parseFloat(style.maxHeight);
    return Number.isFinite(max) ? Math.min(own, max) : own;
  }

  // A chat (or PM window) that was scrolled to its newest message stays
  // there when this changes the height of what's in it.
  function keepChatAtEnd(box, change) {
    const atEnd = !!box && box.scrollHeight - box.scrollTop - box.clientHeight <= 1;
    const height = box?.scrollHeight;
    change();
    if (atEnd && box.scrollHeight !== height) box.scrollTop = box.scrollHeight;
  }

  const chatBuffer = () => document.getElementById("messagebuffer");

  // Whether the chat was at its newest message when it was last scrolled
  // (by hand, or by CyTube following new messages). Things growing in it
  // don't scroll it, so this stays as it was then.
  let chatFollowing = true;

  function watchChatScroll() {
    const buffer = chatBuffer();
    if (!buffer) return;
    buffer.addEventListener("scroll", () => {
      chatFollowing = buffer.scrollHeight - buffer.scrollTop - buffer.clientHeight <= 1;
    }, { passive: true });
  }

  // Private messages: CyTube adds each one to that person's PM window.
  function watchPms() {
    const bar = document.getElementById("pmbar");
    if (!bar) return;
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (!m.target.classList?.contains("pm-buffer")) continue;
        keepChatAtEnd(m.target, () => sizeMessages(m.addedNodes));
      }
    }).observe(bar, { childList: true, subtree: true });
  }

  // ---- watching chat --------------------------------------------------------

  function onMessages(nodes) {
    sizeMessages(nodes);
    const fresh = [];
    let said = 0;      // new messages from people, for hybrid chat
    for (const div of nodes) {
      if (!(div instanceof HTMLElement)) continue;
      if (settings.colourNames) colourName(div);
      const live = isLive(div);
      if (hybrid) {
        markSender(div);
        if (live && isPersonsMessage(div)) said++;
      }
      if (!live || !settings.nico || document.hidden) continue;
      const item = nicoContent(div);
      if (item) fresh.push(item);
    }
    if (fresh.length) enqueue(fresh.slice(-NICO_MAX_BURST));
    if (hybrid) hybridHeard(said);
  }

  function watchChat() {
    const buffer = document.getElementById("messagebuffer");
    if (!buffer) return;
    if (settings.colourNames) for (const div of buffer.children) colourName(div);
    new MutationObserver((mutations) => {
      const added = [];
      for (const m of mutations) for (const node of m.addedNodes) added.push(node);
      keepChatAtEnd(buffer, () => onMessages(added));
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

  // ---- emote effects --------------------------------------------------------
  //
  // A channel's CSS can turn an emote into an effect for the emote after it:
  // "/reverse" hidden, and the next emote flipped; or an overlay that sets
  // the next two on top of each other ("/overlay pepe hat"). A click on an
  // emote drawn with one adds the whole thing as it was typed, so it comes
  // out the same in your message. Worked out from the channel's own CSS by
  // the same rules the CyTube app uses: an effect emote is one the CSS
  // hides, or one with a rule for the emote right after it; it stacks the
  // next two when that rule pulls the following one back over it (a
  // negative right margin).
  const FX_TITLE = String.raw`(?:img)?(?:\.channel-emote)?\[title="([^"]+)"\]`;
  const FX_EMOTE = String.raw`(?:img)?\.channel-emote`;
  const FX_SELF = new RegExp(String.raw`^(?:.+ )?${FX_TITLE}$`);
  const FX_NEXT = new RegExp(String.raw`^(?:.+ )?${FX_TITLE}\+${FX_EMOTE}$`);
  let fxCache = { css: null, effects: new Map() };

  function emoteEffects() {
    const style = document.getElementById("chancss");
    const css = style?.textContent || "";
    if (css === fxCache.css) return fxCache.effects;
    const hidden = new Set();
    const next = new Map();          // effect -> the rules for the emote after it
    const walk = (rules) => {
      for (const rule of rules) {
        if (!rule.selectorText) {
          if (rule.cssRules) walk(rule.cssRules);      // @media, @supports
          continue;
        }
        for (const part of rule.selectorText.split(/,(?![^()[\]]*[)\]])/)) {
          const selector = part.trim().replace(/'/g, '"').replace(/\s*([+>~])\s*/g, "$1").replace(/\s+/g, " ");
          let m = selector.match(FX_NEXT);
          if (m) {
            if (!next.has(m[1])) next.set(m[1], []);
            next.get(m[1]).push(rule.style);
          } else if ((m = selector.match(FX_SELF)) && rule.style.getPropertyValue("display").trim() === "none") {
            hidden.add(m[1]);
          }
        }
      }
    };
    try {
      walk(style?.sheet?.cssRules || []);
    } catch (e) {
      // Unreadable: emotes are added one at a time, as before.
    }
    const effects = new Map();
    for (const name of new Set([...hidden, ...next.keys()])) {
      const after = next.get(name) || [];
      const value = (prop) => after.map((s) => s.getPropertyValue(prop).trim()).filter(Boolean).pop() || "";
      // Moved out of the line altogether (a backdrop behind the chat): it
      // doesn't sit on the emote after it.
      const placed = ["absolute", "fixed"].includes(value("position")) || !!(value("z-index") || value("top") || value("bottom"));
      effects.set(name, { stacks: !placed && parseFloat(value("margin-right")) < 0 });
    }
    fxCache = { css, effects };
    return effects;
  }

  // The emote clicked, with any effect it's drawn with: the effect emotes
  // just before it (or after, if an effect emote was clicked) and, for one
  // that stacks, the other emote of the pair. Read the way the CSS reads
  // the message: element by element, ignoring the text between.
  function withEffects(emote) {
    const effects = emoteEffects();
    const parent = emote.parentElement;
    if (!parent || !effects.size) return [emote];
    const code = (el) => el.title || el.alt || "";
    const isEmote = (el) => el.matches("img.channel-emote") && !!code(el);
    const isEffect = (el) => isEmote(el) && effects.has(code(el));
    const kids = [...parent.children];
    for (let i = 0; i < kids.length;) {
      if (!isEffect(kids[i])) {
        if (kids[i] === emote) return [emote];
        i++;
        continue;
      }
      const group = [];
      while (i < kids.length && isEffect(kids[i])) group.push(kids[i++]);
      const takes = effects.get(code(group[group.length - 1])).stacks ? 2 : 1;
      for (let n = 0; n < takes && i < kids.length && isEmote(kids[i]) && !isEffect(kids[i]); n++) group.push(kids[i++]);
      if (group.includes(emote)) return group;
    }
    return [emote];
  }

  // What was clicked: a name (CyTube's, or a channel's own way of showing
  // the sender's name) or an emote. Null for anything else.
  function clickedOn(target) {
    if (!(target instanceof Element) || !target.closest("#messagebuffer") || target.closest("a")) return null;
    const emote = target.closest("img.channel-emote, img[class*='emote'], video[class*='emote']");
    if (emote) {
      const parts = emote.matches("img.channel-emote") ? withEffects(emote) : [emote];
      const code = parts.map((el) => el.title || el.alt || "").filter(Boolean).join(" ");
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
  // for how long (4 seconds unless changed; 0 means it never lifts, nor
  // while typing).
  //
  // With "Dim the chat separately", the chat has a dark of its own (40%
  // unless changed), light enough to read, which never lifts. A click
  // outside both the video and the chat lifts the rest; using the chat
  // (clicking in it, typing) lifts nothing.
  const dimLevel = () => clamp(settings.dim ?? DEFAULTS.dim, 30, 100) / 100;
  const peekLevel = () => dimLevel() * 0.5;
  const peekMs = () => clamp(settings.peekSeconds ?? DEFAULTS.peekSeconds, 0, 10) * 1000;
  const lifts = () => peekMs() > 0;
  const separateChat = () => !!settings.chatDimSeparate;
  const chatDimLevel = () => clamp(settings.chatDim ?? DEFAULTS.chatDim, 0, 100) / 100;
  // While writing a message, the lights stay partly up (see peek), unless
  // the chat has its own dark.
  const restingLevel = () => (typing() && !separateChat() && lifts() ? peekLevel() : dimLevel());
  let lightsOn = false;
  let peekTimer = 0;
  let scrim = null;
  let chatScrim = null;
  let followTimer = 0;

  function ensureScrim() {
    if (scrim) return scrim;
    scrim = document.createElement("div");
    scrim.className = "cp-scrim";
    chatScrim = document.createElement("div");
    chatScrim.className = "cp-chat-scrim";
    chatScrim.style.display = "none";
    document.body.append(scrim, chatScrim);
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
      chatScrim.style.display = "none";
      liftNico(null);
      return;
    }
    scrim.style.display = "";
    // Scrolled down, the video slides up under CyTube's top bar, which stays
    // put: the clear part stops at the bar, so the bar stays dimmed too.
    const top = Math.max(r.top, topBarBottom());
    liftNico(top - r.top);
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
    placeChatHole(r.left, top, r);
  }

  // While the lights are down, the Niconico comments go above the dark (the
  // scrim's 1035; Bootstrap's dialogs, at 1040 and up, stay above them), so
  // one hanging below the video isn't dimmed with the page. Cut off where
  // CyTube's top bar covers the video ([cut] px of it, scrolled down), or
  // they'd show over the bar. Null puts them back among the page's own.
  function liftNico(cut) {
    if (!nicoLayer) return;
    if (cut === null) {
      nicoLayer.style.removeProperty("z-index");
      nicoLayer.style.removeProperty("clip-path");
      return;
    }
    nicoLayer.style.setProperty("z-index", "1036", "important");
    if (cut > 0) {
      nicoLayer.style.setProperty("clip-path", `polygon(0 ${cut}px, 100% ${cut}px, 100% 300%, 0 300%)`, "important");
    } else {
      nicoLayer.style.removeProperty("clip-path");
    }
  }

  // Dimming the chat on its own: the chat is cut out of the dark around the
  // video (the box's shadow), and has a box of its own over it, with its own
  // darkness. Skipped if the chat sits over the video (a channel's layout),
  // where its box would dim the video too.
  function placeChatHole(scrimLeft, scrimTop, video) {
    const chat = separateChat() ? chatArea() : null;
    const top = chat ? Math.max(chat.top, topBarBottom()) : 0;
    const overVideo = chat && chat.left < video.right && chat.right > video.left && top < video.bottom && chat.bottom > video.top;
    if (!chat || overVideo || chat.bottom <= top) {
      scrim.style.clipPath = "";
      chatScrim.style.display = "none";
      return;
    }
    const w = chat.right - chat.left;
    const h = chat.bottom - top;
    // Its corners: square at the top, under the chat's header, and at the
    // bottom the chat's own (the Polished look rounds them; the header's
    // are the same).
    const header = document.getElementById("chatheader");
    const radius = Math.min(parseFloat(header ? getComputedStyle(header).borderTopLeftRadius : "") || 0, w / 2, h / 2);
    const far = 100000;
    scrim.style.clipPath = `path(evenodd, "M ${-far} ${-far} H ${far} V ${far} H ${-far} Z ` +
      roundedRect(chat.left - scrimLeft, top - scrimTop, w, h, 0, radius) + '")';
    Object.assign(chatScrim.style, {
      display: "",
      left: chat.left + "px",
      top: top + "px",
      width: w + "px",
      height: h + "px",
      borderRadius: `0 0 ${radius}px ${radius}px`,
    });
  }

  // The part of the chat that's read: the user list, messages and message
  // box. Its header ("36 connected users") is dimmed with the page.
  function chatArea() {
    const wrap = document.getElementById("chatwrap");
    if (!wrap) return null;
    let area = null;
    for (const el of wrap.children) {
      if (el.id === "chatheader") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      area = area
        ? { left: Math.min(area.left, r.left), top: Math.min(area.top, r.top), right: Math.max(area.right, r.right), bottom: Math.max(area.bottom, r.bottom) }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return area;
  }

  // A rectangle with round corners (rt at the top, rb at the bottom), as a
  // path for clip-path.
  function roundedRect(x, y, w, h, rt, rb) {
    const n = (v) => Math.round(v * 100) / 100;
    return `M ${n(x + rt)} ${n(y)} H ${n(x + w - rt)} A ${rt} ${rt} 0 0 1 ${n(x + w)} ${n(y + rt)} ` +
      `V ${n(y + h - rb)} A ${rb} ${rb} 0 0 1 ${n(x + w - rb)} ${n(y + h)} H ${n(x + rb)} ` +
      `A ${rb} ${rb} 0 0 1 ${n(x)} ${n(y + h - rb)} V ${n(y + rt)} A ${rt} ${rt} 0 0 1 ${n(x + rt)} ${n(y)} Z`;
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

  // The chat's own dark (when it has one) doesn't lift: it's either on or
  // off with the rest.
  function setDarkness(alpha, ms, easing) {
    ensureScrim();
    scrim.style.transition = `box-shadow ${ms}ms ${easing}`;
    scrim.style.boxShadow = `0 0 0 200vmax rgba(0, 0, 0, ${alpha})`;
    chatScrim.style.transition = `background-color ${ms}ms ${easing}`;
    chatScrim.style.backgroundColor = `rgba(0, 0, 0, ${alpha > 0 ? chatDimLevel() : 0})`;
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
      setDarkness(restingLevel(), 350, "ease-in-out");
    } else {
      clearInterval(followTimer);
      liftNico(null);
      if (scrim) {
        setDarkness(0, 220, "ease-out");
        const fading = scrim;
        setTimeout(() => {
          if (!lightsOn && scrim === fading) {
            scrim.remove();
            chatScrim.remove();
            scrim = null;
            chatScrim = null;
          }
        }, 260);
      }
    }
    updateButtons();
  }

  const PEEK_EASING = "cubic-bezier(0.37, 0, 0.63, 1)";

  function peek() {
    if (!lifts()) return;
    setDarkness(peekLevel(), 450, PEEK_EASING);
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      if (lightsOn) setDarkness(restingLevel(), 600, PEEK_EASING);
    }, peekMs());
  }

  document.addEventListener("pointerdown", (e) => {
    if (!lightsOn || (e.target instanceof Element && e.target.closest(".cp-btn"))) return;
    const inside = (r) => !!r && r.width > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside(videoBox()?.getBoundingClientRect())) return;
    // The chat's own dark doesn't lift, and using the chat (its header too)
    // lifts nothing.
    if (separateChat() && e.target instanceof Element && e.target.closest("#chatwrap")) return;
    peek();
  }, true);
  // Writing a message: the lights stay partly up until you're done (unless
  // the chat has its own dark).
  document.addEventListener("focusin", () => { if (lightsOn && !separateChat() && typing()) peek(); });
  document.addEventListener("focusout", () => {
    if (lightsOn && !separateChat()) setTimeout(() => { if (!typing()) peek(); }, 0);
  });
  // Scrolling and resizing fire many times a frame: placed once a frame.
  let placeQueued = false;
  function placeScrimSoon() {
    if (!lightsOn || placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(() => {
      placeQueued = false;
      if (lightsOn) placeScrim();
    });
  }
  window.addEventListener("resize", placeScrimSoon);
  window.addEventListener("scroll", placeScrimSoon, { passive: true });
  document.addEventListener("fullscreenchange", () => lightsOn && placeScrim());

  // ---- buttons --------------------------------------------------------------

  // A light bulb: filled while the lights are down, an outline otherwise.
  // Drawn to the height of CyTube's own button icons, with an outline about
  // as heavy as theirs.
  const BULB = "M9 21h6v-1.5H9zm3-19a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z";
  const BULB_OUTLINE = BULB + "M14.57 12.69 13.6 13.4v1.2h-3.2v-1.2l-.97-.71a4.5 4.5 0 1 1 5.14 0z";
  // Hybrid chat's triangle, the same: filled while it's on, otherwise an
  // outline as heavy as the Niconico square's.
  const TRIANGLE = "M12 2.04 23.5 21.96H.5z";
  const TRIANGLE_OUTLINE = TRIANGLE + "M12 8.44 17.96 18.76H6.04z";
  // Hybrid chat's emote picker: a smiling face.
  const SMILEY = "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z" +
    "M8.5 8.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3zM15.5 8.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3zM7.5 14h9a4.5 4.5 0 0 1-9 0z";
  // Hybrid chat's mute: a speaker, with its sound, or crossed out.
  const SPEAKER = "M4 9h4l5-4.5v15L8 15H4z";
  const SOUND = SPEAKER + "M16.82 8.18A5.4 5.4 0 0 1 16.82 15.82L15.4 14.4A3.4 3.4 0 0 0 15.4 9.6z" +
    "M18.94 6.06A8.4 8.4 0 0 1 18.94 17.94L17.53 16.53A6.4 6.4 0 0 0 17.53 7.47z";
  const MUTED = SPEAKER + "M15.2 9.6l1.4-1.4 2.4 2.4 2.4-2.4 1.4 1.4-2.4 2.4 2.4 2.4-1.4 1.4-2.4-2.4-2.4 2.4-1.4-1.4 2.4-2.4z";
  // Leaving fullscreen: four corners, pointing in.
  const EXIT_FULLSCREEN = "M8 3h2v7H3V8h5zm6 0h2v5h5v2h-7zM3 14h7v7H8v-5H3zm11 0h7v2h-5v5h-2z";
  const SVG_NS = "http://www.w3.org/2000/svg";

  // An icon drawn from [path], in the text's colour (with holes where its
  // shapes overlap, for an outline).
  function pathIcon(path) {
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
  let hybridBtn = null;

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
    // The Niconico comments and hybrid chat don't go together: turning
    // either on turns the other off.
    nicoBtn = makeButton("Niconico comments", () => {
      const wasNico = settings.nico;
      settings.nico = !settings.nico;
      if (settings.nico) settings.hybrid = false;
      saveSettings();
      applySettings(wasNico);
    });
    hybridBtn = makeButton("Hybrid chat", () => {
      const wasNico = settings.nico;
      settings.hybrid = !settings.hybrid;
      if (settings.hybrid) settings.nico = false;
      saveSettings();
      applySettings(wasNico);
    });
    lightsBtn = makeButton("Lights down", () => setLights(!lightsOn));
    group.append(nicoBtn, hybridBtn, lightsBtn);
    const videoControls = document.getElementById("videocontrols");
    if (videoControls && videoControls.parentElement === row) videoControls.after(group);
    else row.appendChild(group);
    updateButtons();
  }

  function removeButtons() {
    document.getElementById("cytube-plus-controls")?.remove();
    nicoBtn = null;
    hybridBtn = null;
    lightsBtn = null;
  }

  function updateButtons() {
    if (nicoBtn) {
      nicoBtn.replaceChildren(squareIcon(settings.nico));
      nicoBtn.classList.toggle("active", settings.nico);
      nicoBtn.title = settings.nico ? "Turn off Niconico comments" : "Turn on Niconico comments";
    }
    if (hybridBtn) {
      hybridBtn.replaceChildren(pathIcon(settings.hybrid ? TRIANGLE : TRIANGLE_OUTLINE));
      hybridBtn.classList.toggle("active", settings.hybrid);
      hybridBtn.title = settings.hybrid ? "Turn off hybrid chat" : "Turn on hybrid chat: the chat over the video in fullscreen";
    }
    if (lightsBtn) {
      lightsBtn.replaceChildren(pathIcon(lightsOn ? BULB : BULB_OUTLINE));
      lightsBtn.classList.toggle("active", lightsOn);
      lightsBtn.title = lightsOn ? "Lights up" : "Lights down";
      lightsBtn.style.display = settings.lightsButton ? "" : "none";
    }
  }

  // ---- turn off sync ---------------------------------------------------------

  // sync-page.js, in the page, does the syncing; this keeps the bar under
  // the video up to date with what it says.
  let syncState = { synced: true, ended: false, pickTitle: "", roomTitle: "", listHidden: false, list: null };
  let syncBar = null;
  let syncNotice = "";
  let noticeTimer = 0;
  // The bar's own list of the playlist, for channels that hide theirs.
  let listOpen = false;
  let listQuery = "";
  let listShown = "";      // what the list was last drawn from
  let listScrolled = false;

  const NOTICES = {
    leader: "You're the leader: the room follows your video, so you stay in sync.",
    unplayable: "That one can't play just for you from here. Add it to the playlist, then click it there.",
  };

  function toPage(message) {
    document.dispatchEvent(new CustomEvent("cytube-plus:sync", { detail: JSON.stringify(message) }));
  }

  document.addEventListener("cytube-plus:sync-state", (e) => {
    let state;
    try { state = JSON.parse(e.detail); } catch (err) { return; }
    if (!state || typeof state !== "object") return;
    syncState = { ...syncState, ...state };
    if (NOTICES[state.refused]) {
      syncNotice = NOTICES[state.refused];
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        syncNotice = "";
        updateSyncBar();
      }, 5000);
    } else if (state.synced === false) {
      clearTimeout(noticeTimer);
      syncNotice = "";
    }
    // Back in sync, or the channel's playlist showing again: the bar's own
    // list goes.
    if (listOpen && (syncState.synced || !syncState.listHidden)) setListOpen(false);
    updateSyncBar();
  });

  // Out of sync, a bar under the video says what's playing and has the way
  // back; in sync, it's only there for a moment to explain a click that
  // didn't play.
  function updateSyncBar() {
    if (syncState.synced && !syncNotice) {
      syncBar?.remove();
      syncBar = null;
      setListOpen(false);
      return;
    }
    if (!syncBar) syncBar = makeSyncBar();
    const wrap = document.getElementById("videowrap");
    const video = wrap?.querySelector(":scope > .embed-responsive");
    if (video && syncBar.previousElementSibling !== video) video.after(syncBar);
    else if (!video && wrap && !syncBar.isConnected) wrap.appendChild(syncBar);
    const text = syncBar.querySelector(".cp-sync-text");
    syncBar.querySelector(".cp-sync-back").style.display = syncState.synced ? "none" : "";
    const listBtn = syncBar.querySelector(".cp-sync-list-btn");
    listBtn.style.display = !syncState.synced && syncState.listHidden ? "" : "none";
    listBtn.classList.toggle("active", listOpen);
    listBtn.setAttribute("aria-expanded", String(listOpen));
    const parts = [];
    if (syncNotice) {
      parts.push(syncNotice);
    } else if (syncState.ended) {
      parts.push(bold("That was the last one."));
    } else if (syncState.pickTitle) {
      parts.push(bold("Watching on your own: "), syncState.pickTitle + ".");
    } else if (syncState.listHidden) {
      parts.push(bold("Sync is off."), " Pause and skip as you like, or pick a title from the playlist to watch it.");
    } else {
      parts.push(bold("Sync is off."), " Pause and skip as you like, or click a title in the playlist to watch it.");
    }
    if (!syncState.synced && (syncState.pickTitle || syncState.ended) && syncState.roomTitle) {
      parts.push(" The room is on " + syncState.roomTitle + ".");
    }
    text.replaceChildren(...parts);
    if (listOpen) drawList();
  }

  function makeSyncBar() {
    const bar = document.createElement("div");
    bar.id = "cytube-plus-sync-bar";
    const text = document.createElement("span");
    text.className = "cp-sync-text";
    text.setAttribute("role", "status");
    const listBtn = document.createElement("button");
    listBtn.type = "button";
    listBtn.className = "btn btn-xs btn-default cp-sync-list-btn";
    listBtn.textContent = "Playlist";
    listBtn.title = "This channel hides its playlist: pick from it here";
    listBtn.setAttribute("aria-controls", "cytube-plus-sync-list");
    listBtn.addEventListener("click", () => {
      setListOpen(!listOpen);
      updateSyncBar();
      if (listOpen) listPanel.querySelector(".cp-sync-search").focus();
    });
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn btn-xs btn-default cp-sync-back";
    back.textContent = "Back in sync";
    // Back in sync turns the setting off again, here and in the popup.
    back.addEventListener("click", () => {
      settings.syncOff = false;
      saveSettings();
      applySettings(settings.nico);
    });
    bar.append(text, listBtn, back);
    return bar;
  }

  // The list floats over the page next to the bar, rather than sitting in
  // the channel's layout: a channel that sizes the video to fit the window
  // would otherwise squash the video to make room for it.
  let listPanel = null;

  function makeListPanel() {
    const panel = document.createElement("div");
    panel.id = "cytube-plus-sync-list";
    panel.hidden = true;
    const search = document.createElement("input");
    search.type = "search";
    search.className = "cp-sync-search";
    search.placeholder = "Search the playlist";
    search.setAttribute("aria-label", "Search the playlist");
    search.autocomplete = "off";
    search.spellcheck = false;
    search.addEventListener("input", () => {
      listQuery = search.value;
      drawList(true);
    });
    // Enter plays the first match; Escape closes the list.
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        panel.querySelector(".cp-sync-item")?.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setListOpen(false);
        updateSyncBar();
        syncBar?.querySelector(".cp-sync-list-btn")?.focus();
      }
    });
    const list = document.createElement("div");
    list.className = "cp-sync-items";
    list.setAttribute("role", "list");
    list.addEventListener("click", (e) => {
      const item = e.target instanceof Element && e.target.closest(".cp-sync-item");
      if (!item) return;
      toPage({ action: "pick", uid: Number(item.dataset.uid) });
      setListOpen(false);
      updateSyncBar();
    });
    panel.append(search, list);
    document.body.appendChild(panel);
    return panel;
  }

  function setListOpen(open) {
    if (!open && !listOpen) return;
    listOpen = open;
    listShown = "";
    listScrolled = false;
    if (open && !listPanel) listPanel = makeListPanel();
    if (listPanel) {
      listPanel.hidden = !open;
      listPanel.querySelector(".cp-sync-search").value = listQuery;
    }
    lastPlace = "";
    if (open) {
      // Placed (and so sized) before the titles come in, so the one you're
      // on can be scrolled to.
      placeList();
      requestAnimationFrame(followBar);
    }
    toPage({ action: "list", open });
  }

  // It follows the bar wherever the page moves it, while it's open.
  let lastPlace = "";
  function followBar() {
    if (!listOpen) return;
    placeList();
    requestAnimationFrame(followBar);
  }

  // Under the bar, as wide as it, or above it when there's more room there.
  function placeList() {
    if (!listOpen || !listPanel || !syncBar?.isConnected) return;
    const bar = syncBar.getBoundingClientRect();
    if (!bar.width) {
      setListOpen(false);
      return;
    }
    const gap = 6;
    const below = innerHeight - bar.bottom - gap - 8;
    const above = bar.top - gap - 8;
    const width = Math.max(bar.width, 280);
    const left = Math.min(Math.max(8, bar.left), Math.max(8, innerWidth - width - 8));
    const down = below >= 240 || below >= above;
    const room = Math.max(120, Math.min(420, down ? below : above));
    const place = [left, width, room, down, bar.top, bar.bottom].join();
    if (place === lastPlace) return;
    lastPlace = place;
    Object.assign(listPanel.style, {
      left: left + "px",
      width: width + "px",
      maxHeight: room + "px",
      top: down ? bar.bottom + gap + "px" : "",
      bottom: down ? "" : innerHeight - bar.top + gap + "px",
    });
  }
  // A click anywhere else closes it.
  document.addEventListener("pointerdown", (e) => {
    if (!listOpen || !(e.target instanceof Node)) return;
    if (listPanel?.contains(e.target) || syncBar?.querySelector(".cp-sync-list-btn")?.contains(e.target)) return;
    setListOpen(false);
    updateSyncBar();
  }, true);

  // Every word typed has to be somewhere in the title, in any order, with
  // or without accents.
  const fold = (t) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function drawList(force = false) {
    const items = Array.isArray(syncState.list) ? syncState.list : null;
    const box = listPanel?.querySelector(".cp-sync-items");
    if (!box || !items) return;
    const key = JSON.stringify(items) + "\n" + listQuery;
    if (!force && key === listShown) return;
    listShown = key;
    const words = fold(listQuery).split(/\s+/).filter(Boolean);
    const rows = [];
    for (const item of items) {
      const title = String(item.title);
      if (words.length && !words.every((w) => fold(title).includes(w))) continue;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "cp-sync-item";
      row.setAttribute("role", "listitem");
      row.dataset.uid = String(item.uid);
      row.classList.toggle("cp-room", !!item.room);
      row.classList.toggle("cp-picked", !!item.picked);
      const name = document.createElement("span");
      name.className = "cp-sync-item-title";
      name.textContent = title;
      const time = document.createElement("span");
      time.className = "cp-sync-item-time";
      time.textContent = (item.room ? "Room · " : "") + String(item.duration);
      row.append(name, time);
      rows.push(row);
    }
    if (!rows.length) {
      const none = document.createElement("p");
      none.className = "cp-sync-none";
      none.textContent = items.length ? "No titles match." : "The playlist is empty.";
      rows.push(none);
    }
    const top = box.scrollTop;
    box.replaceChildren(...rows);
    box.scrollTop = top;
    // On opening, what you're watching (or the room's video) is in view.
    if (!listScrolled) {
      listScrolled = true;
      const at = box.querySelector(".cp-picked") || box.querySelector(".cp-room");
      if (at) box.scrollTop = at.offsetTop - box.clientHeight / 2 + at.offsetHeight / 2;
    }
  }

  function bold(t) {
    const b = document.createElement("strong");
    b.textContent = t;
    return b;
  }

  // ---- start ----------------------------------------------------------------

  // (The look and the buttons come once the settings are in: see refresh.)
  watchChat();
  watchChatScroll();
  watchChatWidth();
  watchPms();
  watchUserlist();
  watchPolls();
  watchStyles();
})();
