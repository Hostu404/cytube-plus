# CyTube Plus

A Firefox add-on that brings some features to cytu.be. Unofficial.

## Features

- **Polished look**: the video, the buttons under it, the playlist, the
  poll and the chat become rounded, tidier cards, with quieter timestamps,
  the playing item marked in the playlist and poll results shown as bars.
  The rest of the page is left alone.
- **Coloured names**: each name in chat gets its own colour.
- **Highlights**: messages that mention you, and private messages, stand
  out. CyTube's own PM windows work as usual.
- **Lights down**: the bulb button under the video dims the rest of the
  page to 90%. Click outside the video to lift the dark for a few seconds.
- **Niconico comments**: the square button under the video makes new chat
  messages fly across it.
  They show in fullscreen too. Nothing is saved up while the tab is
  hidden: only what's said while you're watching flies.
- **Click names and emotes**: click a name in chat to reply to that person,
  or an emote to add it to your message. Nothing is sent until you press
  Enter.
- **Blacklist**: the add-on does nothing at all on blacklisted channels.
  The Kinoplex is blacklisted to start with. Channels can be added or
  removed in the toolbar popup, which also has a switch for the channel
  you're on.

All the settings are in the toolbar button's popup.

## Staying out of the channel's way

- A channel's own CSS always wins over the Polished look.
- None of CyTube's code is changed, and the add-on's buttons sit in a group
  of their own, so a channel's scripts find the page as they expect.
- If a channel's script already does something when a name is clicked, or
  colours a name itself, the add-on leaves that alone.

## Installing

**From Firefox Add-ons** (recommended: it updates itself)

Open https://addons.mozilla.org/firefox/addon/cytube-plus/ in Firefox and
click **Add to Firefox**. On Android, open the same page in Firefox for
Android and tap **Add to Firefox**.

**From GitHub**

1. Download the `.xpi` file from the latest release on the
   [Releases page](https://github.com/Hostu404/cytube-plus/releases).
2. In Firefox, open `about:addons`, click the gear button and choose
   **Install Add-on From File…**, then pick the `.xpi`. (Or drag the file
   onto a Firefox window.)
3. Click **Add** when Firefox asks.

Installed this way it doesn't update itself: install a newer release the
same way to update.

Once it's installed, open any cytu.be channel. If the buttons don't
appear, open the add-on's menu in the toolbar's extensions panel and check
it's allowed on cytu.be.

Needs Firefox 140 or newer (desktop) or 142 (Android).

## Working on it

To try changes without installing, open `about:debugging#/runtime/this-firefox`
in Firefox, click **Load Temporary Add-on…** and pick `manifest.json` in
this folder. It's removed when Firefox closes. Publishing a new version:
see `AMO-LISTING.md`.
