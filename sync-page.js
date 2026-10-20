// CyTube Plus: turning off sync. With "Turn off sync" on (in the popup),
// the video is yours to pause and skip around, and a click on a title in
// the playlist (or in search results) plays it just for you; a bar under
// the video (content.js) puts you back in sync.
//
// This part runs in the page itself (the "main world"), because CyTube's
// player, playlist and handlers live there. content.js draws the bar and
// tells this whether sync is meant to be off; they talk through two events
// on the document, with JSON strings as their detail.
//
// With sync on (the default) this changes nothing at all. With it off,
// CyTube's two handlers for the room's video (Callbacks.changeMedia and
// Callbacks.mediaUpdate) are wrapped: the room's position isn't applied,
// and its next video still plays, until you click a title; from then on the
// room's videos are only noted (for the bar), and your picks play one after
// another down the list they came from, until its end. Back in sync, the
// wrappers come off and CyTube asks the server for the room's video
// ("playerReady", as it does when it first loads), so it's back where the
// room is at once.
(() => {
  "use strict";

  if (window.__cytubePlusSync) return;
  window.__cytubePlusSync = true;

  const FROM_ADDON = "cytube-plus:sync";
  const TO_ADDON = "cytube-plus:sync-state";
  // The two lists a title can be picked from: the playlist, and search
  // results (the channel's library, or YouTube).
  const LISTS = "#queue, #library";
  // Kinds of video whose player can't do without a detail the server fills
  // in (custom manifests and embeds, and a few sites). Search results that
  // came without it can still play from the playlist.
  const NEEDS = { cm: "direct", bc: "direct", bn: "direct", cu: "embed", pt: "embed", od: "embed" };

  let wantOff = false;     // "Turn off sync" is on, and the add-on is on here
  let synced = true;
  let originals = null;    // CyTube's own handlers while ours are in
  let ours = null;
  let room = null;         // the room's latest video while out of sync
  let pick = null;         // { list, uid, id, media } of what's playing
  let ended = false;       // the picks ran off the end of their list
  let timer = 0;
  let listWatch = null;
  let lastTime = -1;
  let stuck = 0;
  let listOpen = false;    // the bar's own list of the playlist is open
  let lastHidden = false;

  const $ = () => window.jQuery;
  const hasVideo = () => !!document.getElementById("videowrap") && !document.body.classList.contains("chatOnly");
  const isLeader = () => !!(window.CLIENT && window.CLIENT.leader);

  function tell(refused = "") {
    lastHidden = !synced && listHidden();
    document.dispatchEvent(new CustomEvent(TO_ADDON, {
      detail: JSON.stringify({
        refused,
        synced,
        ended,
        pickTitle: pick ? String(pick.media.title || "") : "",
        roomTitle: roomTitle(),
        listHidden: lastHidden,
        list: !synced && listOpen ? listItems() : null,
      }),
    }));
  }

  // What the room is playing: CyTube still marks it in the playlist while
  // out of sync (only the video handlers are wrapped).
  function roomTitle() {
    const active = document.querySelector("#queue > li.queue_active");
    const media = active && $()?.(active).data("media");
    return String((media && media.title) || (room && room.title) || "");
  }

  // ---- out of sync, and back -------------------------------------------------

  // Out of sync whenever it's wanted, except for the leader: the room
  // follows the leader's video, so the leader stays in sync, and goes out
  // again on handing the lead over. Checked every second while it's wanted.
  function settle() {
    const off = wantOff && !isLeader() && hasVideo() && !!window.Callbacks;
    if (off && synced) goOutOfSync();
    else if (!off && !synced) goBackInSync();
  }

  function setWanted(on) {
    wantOff = on;
    clearInterval(timer);
    if (on) timer = setInterval(everySecond, 1000);
    settle();
    tell();
  }

  function goOutOfSync() {
    synced = false;
    room = null;
    pick = null;
    ended = false;
    wrapHandlers();
    document.documentElement.classList.add("cytube-plus-unsynced");
    watchLists();
    tell();
  }

  function goBackInSync() {
    synced = true;
    pick = null;
    ended = false;
    unwrapHandlers();
    document.documentElement.classList.remove("cytube-plus-unsynced");
    listOpen = false;
    markPick();
    listWatch?.disconnect();
    listWatch = null;
    // The room's video, where it is now, the way CyTube gets it on load.
    const socket = window.socket;
    if (socket && socket.connected) socket.emit("playerReady");
    else if (room && originals) originals.changeMedia.call(window.Callbacks, room);
    room = null;
    tell();
  }

  function wrapHandlers() {
    const C = window.Callbacks;
    if (originals || !C) return;
    originals = { changeMedia: C.changeMedia, mediaUpdate: C.mediaUpdate };
    ours = {
      changeMedia(data) {
        if (synced) return originals.changeMedia.call(this, data);
        room = data;
        // Until a title's clicked, the room's videos still play here.
        if (!pick) originals.changeMedia.call(this, data);
        tell();
      },
      mediaUpdate(data) {
        if (synced) return originals.mediaUpdate.call(this, data);
      },
    };
    C.changeMedia = ours.changeMedia;
    C.mediaUpdate = ours.mediaUpdate;
  }

  // Put CyTube's handlers back, unless a channel script has wrapped ours
  // since: then ours stay under its, passing everything straight through.
  function unwrapHandlers() {
    const C = window.Callbacks;
    if (!originals || !C) return;
    if (C.changeMedia === ours.changeMedia) C.changeMedia = originals.changeMedia;
    if (C.mediaUpdate === ours.mediaUpdate) C.mediaUpdate = originals.mediaUpdate;
    if (C.changeMedia === originals.changeMedia && C.mediaUpdate === originals.mediaUpdate) {
      originals = null;
      ours = null;
    }
  }

  // ---- a playlist the channel hides --------------------------------------------

  // Some channels' scripts or CSS hide the playlist (or move it somewhere it
  // can't be seen). CyTube still keeps it in the page, so then the bar under
  // the video offers a list of its own to pick from (content.js draws it),
  // and the channel's layout is left as it is.
  function listHidden() {
    const queue = document.getElementById("queue");
    if (!queue) return false;
    if (!queue.children.length) return false;  // nothing to pick anyway
    if (!queue.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return true;
    const r = queue.getBoundingClientRect();
    if (r.width < 40 || r.height < 8) return true;
    // Off the page altogether.
    const page = document.documentElement;
    const left = r.left + scrollX;
    const top = r.top + scrollY;
    if (left + r.width <= 0 || top + r.height <= 0 || left >= page.scrollWidth || top >= page.scrollHeight) return true;
    // Inside a box that's been squashed to nothing, with the rest cut off.
    for (let el = queue.parentElement; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const b = el.getBoundingClientRect();
      if (b.width < 40 || b.height < 8) return true;
    }
    return false;
  }

  function listItems() {
    return [...document.querySelectorAll("#queue > li")].map((li) => {
      const media = mediaOf(li) || {};
      return {
        uid: $()?.(li).data("uid"),
        title: String(media.title || ""),
        duration: String(media.duration || ""),
        room: li.classList.contains("queue_active"),
        picked: isPick(li),
      };
    }).filter((item) => item.uid !== undefined);
  }

  // ---- picks ------------------------------------------------------------------

  const listOf = (li) => li.parentElement && li.parentElement.id;
  const mediaOf = (li) => $()?.(li).data("media");

  // What the player needs for a row, or null if it can't play here.
  function playable(li) {
    let media = mediaOf(li);
    if (!media || !media.type || !media.id) return null;
    if (listOf(li) !== "queue") {
      // A search result that's also in the playlist: the playlist's copy
      // has everything.
      for (const row of document.querySelectorAll("#queue > li")) {
        const m = mediaOf(row);
        if (m && m.type === media.type && m.id === media.id) return m;
      }
      // The library sends a video's details as JSON text.
      let meta = media.meta;
      if (typeof meta === "string") {
        try { meta = JSON.parse(meta); } catch (e) { meta = null; }
      }
      media = Object.assign({}, media, { meta: Object.assign({}, meta && typeof meta === "object" ? meta : {}) });
      // A file's type is worked out by the server when it's added; if it
      // isn't there, it's guessed from the file's name.
      if (media.type === "fi" && !media.meta.codec) media.meta.codec = codecFromName(media.id);
    }
    const need = NEEDS[media.type];
    if (need && !(media.meta && media.meta[need])) return null;
    return media;
  }

  function codecFromName(url) {
    let path = String(url);
    try { path = new URL(url).pathname; } catch (e) { /* not a full address */ }
    const ext = (path.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
    switch (ext) {
      case "webm": case "mkv": return "matroska/vp9";
      case "ogv": case "ogg": return "ogg/theora";
      case "flv": return "flv/h264";
      case "mp3": return "mp3";
      case "m4a": case "aac": return "aac";
      case "oga": return "vorbis";
      case "opus": return "opus";
      default: return "mov/h264";
    }
  }

  function pickItem(li) {
    const media = playable(li);
    if (!media) {
      tell("unplayable");
      return;
    }
    pick = { list: listOf(li), uid: $()(li).data("uid"), id: media.id, media };
    ended = false;
    lastTime = -1;
    stuck = 0;
    play(media);
    markPick();
    tell();
  }

  // The same way CyTube itself moves to the next video: a new player for a
  // different kind of video, the same player otherwise.
  function play(media) {
    const data = Object.assign({}, media, { currentTime: 0, paused: false, meta: Object.assign({}, media.meta) });
    const player = window.PLAYER;
    try {
      if (!player || player.mediaType !== data.type) {
        window.loadMediaPlayer(data);
      } else if (player.mediaId !== data.id) {
        player.load(data);
        player.play();
      } else {
        player.seekTo(0);
        player.play();
      }
    } catch (e) {
      console.error("CyTube Plus: couldn't play that one", e);
    }
    const title = document.getElementById("currenttitle");
    if (title) title.textContent = "Watching on your own: " + (media.title || "");
  }

  // Which row is the pick: playlist rows by their playlist id (CyTube
  // rebuilds them), search results by their video.
  function isPick(li) {
    if (!pick || listOf(li) !== pick.list) return false;
    if (pick.list === "queue") return $()?.(li).data("uid") === pick.uid;
    return (mediaOf(li) || {}).id === pick.id;
  }

  // When a pick ends, the next one down its list plays (skipping any that
  // can't play here); after the last one, or if the list has changed under
  // it, it just stops.
  function playNext() {
    const items = [...document.querySelectorAll(`#${pick.list} > li`)];
    const at = items.findIndex(isPick);
    if (at >= 0) {
      // If the pick was in sight in its list as it finished, the list
      // follows the mark down to the next one. If you'd scrolled away,
      // it's left where you put it.
      const box = scrollerOf(items[at]);
      const follow = !!box && inView(items[at], box);
      for (const next of items.slice(at + 1)) {
        if (playable(next)) {
          pickItem(next);
          if (follow) bringIntoView(next, box);
          return;
        }
      }
    }
    ended = true;
    try { window.PLAYER?.pause(); } catch (e) { /* already stopped */ }
    tell();
  }

  // Players don't share an "ended" event CyTube passes on, so each second
  // the position is checked against the length: at the end (or stuck just
  // short of it, as some players stop), the next pick plays.
  function everySecond() {
    settle();
    // A channel's script can hide or show its playlist at any time.
    if (!synced && listHidden() !== lastHidden) tell();
    const player = window.PLAYER;
    if (synced || !pick || ended || !player || typeof player.getTime !== "function") return;
    const length = Number(player.mediaLength) || Number(pick.media.seconds) || 0;
    if (!(length > 0)) return;
    const watching = pick;
    player.getTime((t) => {
      if (pick !== watching || ended) return;
      t = Number(t) || 0;
      if (t >= length - 0.6) {
        playNext();
      } else if (t >= length - 3 && t === lastTime && !player.paused) {
        if (++stuck >= 2) playNext();
      } else {
        stuck = 0;
      }
      lastTime = t;
    });
  }

  // The box a list scrolls in (CyTube's playlist has its own scrollbar),
  // or null when it's the page that scrolls: the page is never moved.
  function scrollerOf(el) {
    for (let box = el.parentElement; box && box !== document.body && box !== document.documentElement; box = box.parentElement) {
      const y = getComputedStyle(box).overflowY;
      if ((y === "auto" || y === "scroll") && box.scrollHeight > box.clientHeight + 1) return box;
    }
    return null;
  }

  function inView(el, box) {
    const a = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return a.bottom > b.top + 2 && a.top < b.bottom - 2;
  }

  function bringIntoView(el, box) {
    const a = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (a.top >= b.top && a.bottom <= b.bottom) return;
    box.scrollBy({ top: a.top - b.top - (b.height - a.height) / 2, behavior: "smooth" });
  }

  function markPick() {
    for (const li of document.querySelectorAll(".cp-picked")) li.classList.remove("cp-picked");
    if (!pick) return;
    for (const li of document.querySelectorAll(`#${pick.list} > li`)) {
      if (isPick(li)) li.classList.add("cp-picked");
    }
  }

  // CyTube rebuilds rows when the playlist or the results change: the mark
  // goes back on, and the bar keeps up with the room's mark moving.
  function watchLists() {
    if (listWatch) return;
    listWatch = new MutationObserver((records) => {
      if (pick && records.some((r) => r.type === "childList")) markPick();
      tell();
    });
    for (const list of document.querySelectorAll(LISTS)) {
      listWatch.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
  }

  // With sync off, a plain click on a title plays it here, instead of
  // opening the video's page (or file) in a new tab; Ctrl/Cmd/Shift-click
  // and the middle button still open it. Caught before the page's own
  // handlers, so the link isn't followed. With sync on, titles are links as
  // usual.
  document.addEventListener("click", (e) => {
    if (!wantOff || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (!(e.target instanceof Element)) return;
    const link = e.target.closest("a.qe_title");
    const li = link && link.parentElement;
    if (!li || li.tagName !== "LI" || !li.parentElement?.matches(LISTS) || !hasVideo()) return;
    e.preventDefault();
    settle();
    if (synced) {
      if (isLeader()) tell("leader");
      return;
    }
    pickItem(li);
  }, true);

  // ---- talking to content.js -------------------------------------------------

  document.addEventListener(FROM_ADDON, (e) => {
    let msg;
    try { msg = JSON.parse(e.detail); } catch (err) { return; }
    if (!msg || typeof msg.action !== "string") return;
    if (msg.action === "syncOff") {
      setWanted(!!msg.on);
    } else if (msg.action === "state") {
      tell();
    } else if (msg.action === "list") {
      listOpen = !!msg.open;
      tell();
    } else if (msg.action === "pick" && !synced) {
      // A title picked from the bar's own list.
      const li = [...document.querySelectorAll("#queue > li")].find((row) => $()?.(row).data("uid") === msg.uid);
      if (li) pickItem(li);
    }
  });

  tell();
})();
