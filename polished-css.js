// The Polished look: only the video, the buttons under it, the playlist, the
// poll and the chat change; the rest of the page is left as the theme has
// it. They become rounded cards on one background instead of boxes with
// borders; chat gets quieter timestamps, even spacing, and long messages
// that wrap in their own column beside the time and name; the buttons under
// the video become one flat bar; the playing item is marked in the
// playlist; poll results show as bars (content.js sets each option's
// --cp-share). And, with nothing to see, the chat, private messages,
// playlist and search results become lighter for the browser to draw.
//
// It never outranks a channel's own CSS. content.js puts it straight after
// CyTube's theme stylesheet, and the channel's CSS comes after it, so on
// equal terms the channel wins. Every rule is written to be exactly as
// specific as the rule CyTube and all its themes (slate, cyborg, light,
// modern) share for the same thing, never more (:where() scopes a rule
// without adding to its weight), and anything they don't all set has no
// weight at all. So any channel rule that would beat the theme still beats
// this. (Where one theme goes further, e.g. modern's own panel colours,
// that theme's version stays.)
//
// Colours are light washes of white or black, so they sit on any dark theme.
globalThis.CP_POLISHED_CSS = String.raw`
/* ---- chat ---- */
#chatheader {
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px 10px 0 0;
}
:where(#chatheader) {
  padding: 6px 12px;
  min-height: 34px;
  background-color: rgba(255, 255, 255, 0.045);
}
#userlist, #messagebuffer {
  border: 0;
}
:where(#userlist, #messagebuffer) {
  background-color: rgba(255, 255, 255, 0.035);
}
#userlist {
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  padding: 6px 8px;
}
#messagebuffer {
  padding-left: 12px;
  padding-right: 12px;
}
:where(#messagebuffer) {
  padding-top: 8px;
  padding-bottom: 8px;
}
:where(#messagebuffer > div) {
  margin-bottom: 5px;
  line-height: 1.45;
}
/* A message's time and name stay together on the left, and the message
   wraps in its own column beside them, so a long one's second line starts
   under its first word, not under the time. Only on a chat wide enough for
   it (content.js sets .cytube-plus-wide-chat); a very long name wraps
   itself rather than squeeze the message. */
:where(.cytube-plus-wide-chat #messagebuffer > div:has(> .timestamp, > span > .username)) {
  display: flex;
  align-items: baseline;
}
:where(.cytube-plus-wide-chat #messagebuffer > div) > :where(*) {
  min-width: 0;
  overflow-wrap: anywhere;
}
:where(.cytube-plus-wide-chat #messagebuffer > div) > :where(.timestamp, span:has(> .username)) {
  flex: none;
}
:where(.cytube-plus-wide-chat #messagebuffer > div) > :where(.timestamp) {
  /* Its own space goes at the end of a flex item; the name keeps its. */
  margin-right: 0.3em;
  white-space: nowrap;
}
:where(.cytube-plus-wide-chat #messagebuffer > div) > :where(span:has(> .username)) {
  max-width: 40%;
}
.timestamp:where(#messagebuffer *) {
  font-size: 11px;
}
:where(#messagebuffer .timestamp) {
  opacity: 0.55;
}
.poll-notify:where(#messagebuffer *) {
  font-size: 13px;
}
:where(#messagebuffer .poll-notify) {
  padding: 2px 0;
}
.nick-highlight:where(#messagebuffer *) {
  background-color: rgba(90, 160, 230, 0.16);
}
:where(#messagebuffer .nick-highlight) {
  border-radius: 6px;
}
.form-control:where(#chatline, #guestlogin > input) {
  height: 38px;
  border: 0;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
  padding: 8px 12px;
  background-color: rgba(0, 0, 0, 0.28);
  box-shadow: none;
}
.form-control:focus:where(#chatline, #guestlogin > input) {
  box-shadow: inset 0 0 0 1px rgba(90, 160, 230, 0.6);
}
.input-group-addon:where(#guestlogin > *) {
  border: 0;
  border-bottom-left-radius: 10px;
  background-color: rgba(255, 255, 255, 0.06);
}

/* ---- video ---- */
#videowrap-header {
  border: 0;
  border-radius: 10px 10px 0 0;
}
:where(#videowrap-header) {
  padding: 8px 14px;
  background-color: rgba(255, 255, 255, 0.045);
}
:where(#currenttitle) {
  font-size: 14px;
}
:where(#videowrap .embed-responsive) {
  border-radius: 0 0 10px 10px;
  background-color: #000;
}
:where(#videowrap .embed-responsive:fullscreen) {
  border-radius: 0;
}

/* The buttons under the video: one flat bar of their own. CyTube's Layout
   menu moves this row about, so it isn't joined to the video. The bar is
   the row's background, kept inside the column's 15px side padding (with
   corners to match) so it lines up with the video. */
:where(#rightcontrols) {
  padding-top: 0;
  padding-bottom: 0;
  border-radius: 25px / 10px;
  background-color: rgba(255, 255, 255, 0.045);
  background-clip: content-box;
}
:where(#rightcontrols > .btn-group) {
  margin: 5px 8px;
}
:where(#rightcontrols) .btn-default {
  border: 0;
  background-color: transparent;
  background-image: none;
  box-shadow: none;
  text-shadow: none;
  color: #aab0b6;
}
:where(#rightcontrols) .btn-default:hover,
:where(#rightcontrols) .btn-default:focus,
:where(#rightcontrols) .btn-default.focus {
  background-color: rgba(255, 255, 255, 0.08);
  background-image: none;
  text-shadow: none;
  color: #fff;
}
:where(#rightcontrols) .btn-default:active,
:where(#rightcontrols) .btn-default.active,
:where(#rightcontrols) .btn-default:active:hover,
:where(#rightcontrols) .btn-default.active:hover,
:where(#rightcontrols) .btn-default:active:focus,
:where(#rightcontrols) .btn-default.active:focus {
  background-color: rgba(255, 255, 255, 0.14);
  background-image: none;
  box-shadow: none;
  color: #fff;
}
/* Bootstrap squares off the inside corners of grouped buttons and pulls
   them together; the same selectors round and space the grey ones again
   (coloured ones, like the playlist lock, stay joined to the group). */
:where(#rightcontrols) .btn:where(.btn-default) {
  margin-left: 1px;
  margin-right: 1px;
  border-radius: 6px;
}
:where(#rightcontrols) .btn-group > .btn:where(.btn-default):first-child,
:where(#rightcontrols) .btn-group .btn + .btn:where(.btn-default) {
  margin-left: 1px;
}
:where(#rightcontrols) .btn-group > .btn:where(.btn-default):not(:first-child):not(:last-child):not(.dropdown-toggle) {
  border-radius: 6px;
}
:where(#rightcontrols) .btn-group > .btn:where(.btn-default):first-child:not(:last-child):not(.dropdown-toggle) {
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
}
:where(#rightcontrols) .btn-group > .btn:where(.btn-default):last-child:not(:first-child),
:where(#rightcontrols) .btn-group > .dropdown-toggle:where(.btn-default):not(:first-child) {
  border-top-left-radius: 6px;
  border-bottom-left-radius: 6px;
}

/* ---- playlist ---- */
:where(#queue) {
  border-radius: 10px 10px 0 0;
  background-color: rgba(255, 255, 255, 0.035);
}
.queue_entry {
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding: 5px 12px;
  font-size: 12px;
  line-height: 22px;
  background-color: transparent;
}
.qe_time:where(.queue_entry *) {
  font-family: inherit;
}
:where(.queue_entry .qe_time) {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
:where(#queue .queue_active) {
  box-shadow: inset 3px 0 0 #5aa0e6;
}
.queue_active:where(:not(.queue_temp)) {
  background-image: none;
  background-color: rgba(90, 160, 230, 0.16);
}
#plmeta {
  border: 0;
  border-radius: 0 0 10px 10px;
}
:where(#plmeta) {
  padding: 6px 12px;
  background-color: rgba(255, 255, 255, 0.045);
}

/* ---- poll: results as bars ---- */
:where(#pollwrap) > .well {
  padding: 12px 14px;
  border: 0;
  border-radius: 10px;
  background-color: rgba(255, 255, 255, 0.035);
  box-shadow: none;
}
:where(#pollwrap > .well) {
  position: relative;
}
:where(#pollwrap > .well > .close) {
  position: absolute;
  top: 8px;
  right: 12px;
}
:where(#pollwrap > .well > .btn-danger) {
  position: absolute;
  top: 8px;
  right: 34px;
}
:where(#pollwrap) h3 {
  min-height: 14px;
  margin: 0 0 10px;
  padding-right: 110px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  opacity: 0.8;
}
:where(#pollwrap) .option {
  position: relative;
  z-index: 0;
  overflow: hidden;
  margin: 0 0 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.25);
}
:where(#pollwrap .option)::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  z-index: -1;
  width: var(--cp-share, 0%);
  background-color: rgba(90, 160, 230, 0.28);
  transition: width 0.4s ease;
}
:where(#pollwrap) .option > button {
  margin-right: 10px;
}
:where(#pollwrap .option > button).btn {
  min-width: 32px;
  border: 0;
  border-radius: 5px;
  background-image: none;
  box-shadow: none;
}
:where(#pollwrap .option > button).btn-default {
  background-color: rgba(255, 255, 255, 0.08);
  background-image: none;
  color: inherit;
}
/* The vote buttons look the same hovered, pressed or disabled (guests). */
:where(#pollwrap .option > button).btn-default:is(:hover, :focus, .focus, :active, .active),
:where(#pollwrap .option > button).btn-default:is(:active, .active):is(:hover, :focus, .focus) {
  background-color: rgba(255, 255, 255, 0.08);
  background-image: none;
  box-shadow: none;
  color: inherit;
}
:where(#pollwrap .option > button).btn-default[disabled] {
  background-color: rgba(255, 255, 255, 0.08);
}
:where(#pollwrap) .option-selected > button {
  border-width: 0 !important;
}
:where(#pollwrap .option-selected > button).btn-default,
:where(#pollwrap .option-selected > button).btn-default:is(:hover, :focus, .focus, :active, .active, [disabled]),
:where(#pollwrap .option-selected > button).btn-default:is(:active, .active):is(:hover, :focus, .focus) {
  background-color: rgba(90, 160, 230, 0.6);
}

/* ---- lighter to draw ----
   These change nothing you can see. The chat and private messages are
   drawn on their own, so a new message doesn't make the browser rework the
   rest of the page (they scroll, so nothing in them showed outside them
   anyway). A long playlist or list of search results only draws the rows
   in view. (Not the user list: its name menu and profile box have to show
   outside it.) */
:where(#messagebuffer, #pmbar .pm-buffer) {
  contain: layout paint;
}
:where(#queue > li, #library > li) {
  content-visibility: auto;
  contain-intrinsic-size: auto 32px;
}
`;
