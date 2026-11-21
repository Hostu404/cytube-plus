# CyTube Plus

A Firefox and Chrome add-on for cytu.be: a tidier look, coloured names, mention highlights, lights down, Niconico-style comments, hybrid chat in fullscreen, and a switch to turn off sync and watch on your own. Unofficial.

**Get it:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/cytube-plus/) (desktop and Android) · [Chrome Web Store](https://chromewebstore.google.com/detail/cytube-plus/fedbnoemkdbdefpinnboennimglmicim) (Chrome, Edge, Brave, Opera)

<img width="1280" height="800" alt="CyTube Plus screenshot" src="https://github.com/user-attachments/assets/e868af0a-1489-4b5d-9e74-75ce1aa7e55b" />

## Features

All settings are in the toolbar button's popup.

- **Polished look:** the video, its buttons, the playlist, the poll and the chat become rounded cards. Chat gets quieter timestamps, and long messages wrap in their own column (unless the channel lays out its chat its own way, for example with avatars). The playing item is marked in the playlist, and poll results show as bars. The chat and private messages are also made lighter for the browser to draw.
- **Coloured names:** each name in chat gets its own colour.
- **Highlights:** messages that mention you, and private messages, stand out.
- **Lights down** (bulb button): dims everything but the video (90% by default). Click outside the video to lift the dark for a few seconds. **Dim the chat separately** gives the chat a lighter dark of its own that stays put, so it's always readable.
- **Niconico comments** (square button): new chat messages fly across the video, in fullscreen too. You can change their speed and the emotes' opacity, or choose **Emotes only** or **Text only**.
- **Hybrid chat** (triangle button): in CyTube's fullscreen, the chat sits over the video on the left or right and works as usual. You can scroll, type, click names and emotes, use an emote picker, and use your PM windows. You can change the text size and opacity, and optionally fade old messages. Hybrid chat and Niconico comments turn each other off.
- **Click names and emotes:** click a name to reply to that person, or an emote to add it to your message (with any effect it was shown with). Nothing is sent until you press Enter.
- **Shrink big emotes:** in chat, emotes are capped at 36px inside a message and 84px when a message is only emotes. They're never made bigger.
- **Turn off sync** (off by default): pause and skip the video yourself, or click a title in the playlist or search results to watch it just for you. Your pick is marked in amber, and the next item plays when it ends. A bar under the video shows what the room is on. **Back in sync** returns you to the room. If the channel hides its playlist, the bar has a searchable **Playlist** button.
- **Blacklist:** the add-on does nothing on blacklisted channels. The Kinoplex is on the list to start with, and you can edit the list in the popup.

Changes in each version are on the [Releases page](https://github.com/Hostu404/cytube-plus/releases).

## Staying out of the channel's way

- A channel's own CSS always wins over the Polished look. Coloured names and emote shrinking override the channel's styling on purpose, and both can be turned off.
- CyTube's own code is never changed, except for two things:
  - **Turn off sync** wraps the two handlers that keep the video in step with the room, and puts them back when you're in sync again.
  - **Hybrid chat** moves the chat and PM windows into the video while fullscreen is up, and puts them back when you leave fullscreen.
- If a channel's script already does something when a name is clicked, or colours names itself, the add-on leaves that alone.

## Installing

**Firefox** (140+, or 142+ on Android): install from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/cytube-plus/), which keeps it updated. You can also download the `.xpi` from the [Releases page](https://github.com/Hostu404/cytube-plus/releases) and drag it onto Firefox (or use `about:addons` → gear → **Install Add-on From File…**).

**Chrome, Edge, Brave, Opera** (Chrome 120+): install from the [Chrome Web Store](https://chromewebstore.google.com/detail/cytube-plus/fedbnoemkdbdefpinnboennimglmicim). If you installed an older copy from a GitHub zip, remove it on `chrome://extensions` so you don't have two.

If the buttons don't appear on a channel, check in your browser's extensions menu that the add-on is allowed on cytu.be.

### From source

1. Click **Code → Download ZIP** and extract it.
2. **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and pick `manifest.json`. It's removed again when Firefox closes.
3. **Chrome:** rename `manifest.chrome.json` to `manifest.json`, replacing the Firefox one. Then turn on **Developer mode** on `chrome://extensions`, click **Load unpacked**, and pick the folder.
