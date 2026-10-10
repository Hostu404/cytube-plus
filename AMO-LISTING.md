# Publishing CyTube Plus on addons.mozilla.org

Everything AMO asks for when submitting, ready to paste. This file isn't
part of the add-on package.

## Build the upload

From the repository's folder (needs Node.js):

    npx web-ext lint
    npx web-ext build --ignore-files AMO-LISTING.md

The zip lands in `web-ext-artifacts/`. Upload it at
https://addons.mozilla.org/developers/addon/submit/ and tick both Firefox
and Firefox for Android.

- **Listed** ("On this site"): public on AMO, reviewed, updates reach
  people automatically. When it asks for the **Add-on URL**, use
  `cytube-plus`, so the page is
  https://addons.mozilla.org/firefox/addon/cytube-plus/ (the README links
  there).
- **Unlisted** ("On your own"): Mozilla signs it and gives you an .xpi to
  share yourself; it isn't searchable on AMO.

## A GitHub release (for installing from GitHub)

Either way, once Mozilla has signed the version, download the signed
`.xpi` from the version's page in the Developer Hub. Then on GitHub:
**Releases → Draft a new release**, tag it `v` + the version (e.g.
`v0.6.2`), attach the `.xpi`, and publish. The README's install steps
point people there. (Only the signed `.xpi` from Mozilla installs in
normal Firefox; the zips don't.)

No source code upload is needed: there's no build step, minifying or
third-party library. The files in the zip are the source.

## Listing

**Name:** CyTube Plus

**Summary** (from the manifest):
A tidier look, coloured names, mention highlights, lights down and
Niconico-style comments for cytu.be. Unofficial.

**Description:**

Adds a few things to CyTube (cytu.be) channels, from the CyTube Android app:

- Polished look: the chat, playlist, poll and video player become rounded,
  tidier cards. The rest of the page is left alone, and a channel's own
  style always comes first.
- Coloured names: everyone in chat gets their own name colour.
- Highlights: messages that mention you, and private messages, stand out.
- Niconico comments: new chat messages scroll across the video, like on
  Niconico. Turn them on with the square button under the video.
- Lights down: the bulb button under the video dims the rest of the page;
  click outside the video to lift the dark for a moment.
- Click a name in chat to reply to that person, or an emote to add it to
  your message. Nothing is sent until you press Enter.

Everything can be switched off in the toolbar button's settings, and
channels can be blacklisted so the add-on stays off on them. It only runs on cytu.be
channel pages, and changes only how they look in your browser.

Unofficial: not made by or affiliated with CyTube.

**Categories:** Photos, Music & Videos; Social & Communication

**Tags:** cytube, niconico, chat, video, watch party

**Homepage:** https://github.com/Hostu404/cytube-plus

**Support site:** https://github.com/Hostu404/cytube-plus/issues

**License:** GNU General Public License v3.0 (see LICENSE)

**Privacy policy:** not needed: it collects and sends nothing (the manifest
declares `data_collection_permissions: none`). Its settings are kept in
Firefox's own storage on your computer.

## Notes to reviewer

No account is needed. Open any public channel, e.g. https://cytu.be/r/sneedtv.

- Two buttons appear in their own group under the video, left of CyTube's:
  the square turns on Niconico comments (new chat messages fly over the
  video), the bulb dims the page around the video.
- The toolbar button opens the settings, and a blacklist of channels the
  add-on stays off on (it starts with the-kinoplex, where it does nothing
  at all).
- Permissions: `storage` for the settings; `https://cytu.be/*` because the
  content scripts run on cytu.be channel pages (`/r/*`) only. The popup
  reads the current tab's address (through that host permission, no
  `tabs` permission) to offer a switch for the channel you're on, and
  opens the source repository in a new tab from its View source button.
- No remote code, no network requests, no innerHTML: page content shown in
  comments is copied as DOM nodes from the page's own chat.
