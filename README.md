# CyTube Plus

A Firefox and Chrome add-on for cytu.be: a tidier look, coloured names, mention highlights, lights down, Niconico-style comments over the video, click a name to reply or an emote to post it, and a switch to turn off sync and watch on your own. Unofficial.

**Get it:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/cytube-plus/) (Firefox and Firefox for Android) · [Chrome Web Store](https://chromewebstore.google.com/detail/cytube-plus/fedbnoemkdbdefpinnboennimglmicim) (Chrome, Edge, Brave, Opera)

## Screenshots
<img width="1280" height="800" alt="image" src="https://github.com/user-attachments/assets/bd15c16f-b0cb-4929-8381-2b5e8406d415" />



## Features

- **Polished look**: the video, the buttons under it, the playlist, the
  poll and the chat become rounded, tidier cards, with quieter timestamps,
  the playing item marked in the playlist and poll results shown as bars.
  A long chat message wraps in its own column beside the time and name,
  so its second line starts under its first word, not under the time
  (on a chat wide enough for it). The rest of the page is left alone.
  It also makes the chat, private messages and long playlists
  less work for the browser to draw, which you can't see but helps busy
  channels run smoothly.
- **Coloured names**: each name in chat gets its own colour.
- **Highlights**: messages that mention you, and private messages, stand
  out. CyTube's own PM windows work as usual.
- **Lights down**: the bulb button under the video dims the rest of the
  page (90% by default). Click outside the video to lift the dark for a
  few seconds. How dark it goes and how long it lifts for (or whether it
  lifts at all) can be changed in the toolbar popup. With **Dim the chat separately** on, the chat gets
  a lighter dark of its own (40% by default, adjustable) that stays put,
  so it's always readable. The rest of the page then lifts only for a
  click outside both the video and the chat, not while you type. The
  chat's header is dimmed with the page.
- **Niconico comments**: the square button under the video makes new chat
  messages fly across it, emotes included, and coloured text like
  greentext keeps its colour. They show in fullscreen too, and their speed
  can be changed in the toolbar popup (half to double). Nothing is saved
  up while the tab is hidden: only what's said while you're watching
  flies.
- **Click names and emotes**: click a name in chat to reply to that person,
  or an emote to add it to your message. Nothing is sent until you press
  Enter.
- **Shrink big emotes**: big emotes in chat are made smaller so the chat
  reads more easily: at most 36px tall inside a message, and 84px when a
  message is only emotes. Emotes smaller than that stay as CyTube (or the
  channel) shows them: none ever gets bigger.
- **Turn off sync** (in the toolbar popup, off to start with): the video
  is yours to pause and skip around as you like. Click a title in the
  playlist, or in search results, and it plays just for you, from the
  start; when it ends, the next one down plays, until the end of that
  list. The room carries on without you, and a bar under the video says
  what you're watching and what the room's on. If the channel hides its
  playlist, a **Playlist** button on the bar opens a searchable list of it
  to pick from instead. **Back in sync** on the bar
  takes you straight back to the room's video, where the room is, and
  turns the setting off again. Ctrl+click or a middle click still opens a
  title's link in a new tab. The playlist leader stays in sync, as the
  room follows their video.
- **Blacklist**: the add-on does nothing at all on blacklisted channels.
  The Kinoplex is blacklisted to start with. Channels can be added or
  removed in the toolbar popup, which also has a switch for the channel
  you're on.

All the settings are in the toolbar button's popup.

What's changed in each version is on the
[Releases page](https://github.com/Hostu404/cytube-plus/releases).

## Why is CyTube Plus?
https://youtube.com/watch?v=9QhUFeJgWtg

## Staying out of the channel's way

- A channel's own CSS always wins over the Polished look. (Coloured names
  go over the channel's on purpose, and emote sizes can make a channel's
  big emotes smaller, never bigger; both can be switched off.)
- None of CyTube's code is changed, and the add-on's buttons sit in a group
  of their own, so a channel's scripts find the page as they expect. The
  one exception is while sync is off: the two handlers
  that move the video along with the room are wrapped, and they're put
  back as soon as you're in sync again.
- If a channel's script already does something when a name is clicked, or
  colours a name itself, the add-on leaves that alone.

## Installing on Firefox

**From Firefox Add-ons** (recommended: it updates itself)

Open the [CyTube Plus page on Firefox Add-ons](https://addons.mozilla.org/firefox/addon/cytube-plus/) in Firefox and
click **Add to Firefox**. On Android, open the same page in Firefox for
Android and tap **Add to Firefox**.

**From GitHub**

1. Download the `.xpi` file from the latest release on the
   [Releases page](https://github.com/Hostu404/cytube-plus/releases).
2. In Firefox, open `about:addons`, click the gear button and choose
   **Install Add-on From File…**, then pick the `.xpi`. (Or drag the file
   onto a Firefox window.)
3. Click **Add** when Firefox asks.

To get updates automatically, install it from
[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/cytube-plus/) instead.

Needs Firefox 140 or newer (desktop) or 142 (Android).

## Installing on Chrome, Edge, Brave or Opera

**From the Chrome Web Store** (it updates itself)

Open the [CyTube Plus page on the Chrome Web Store](https://chromewebstore.google.com/detail/cytube-plus/fedbnoemkdbdefpinnboennimglmicim) and click
**Add to Chrome**. Edge, Brave and Opera install it from the same page
(Edge and Opera may ask you to allow extensions from other stores first).

Loaded it from a GitHub zip before it was on the store? Remove that copy
on the extensions page (`chrome://extensions`) so you don't have two.

Needs Chrome 120 or newer, or a browser built on it.

## Once it's installed

Open any cytu.be channel. If the buttons don't appear, open the add-on's
menu in the toolbar's extensions panel and check it's allowed on cytu.be.

## Installing from the source code

This loads the add-on straight from this repository, without Mozilla's
signing. Firefox removes it again when it closes, so it has to be loaded
again each time Firefox starts.

1. On this repository's page, click **Code → Download ZIP**, and extract
   the zip.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `manifest.json` in the
   extracted folder.

On Chrome, install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/cytube-plus/fedbnoemkdbdefpinnboennimglmicim).
To load the source code there instead: the repository's `manifest.json`
is Firefox's, so rename `manifest.chrome.json` to `manifest.json`
(replacing it), turn on **Developer mode** on `chrome://extensions`, click
**Load unpacked** and pick the folder.
