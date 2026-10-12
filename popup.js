// The toolbar popup: the settings, and the blacklist of channels the add-on is off on.
const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { polished: true, colourNames: true, nico: false, lightsButton: true, highlights: true, clickToInsert: true,
  emoteSizes: true, chatDimSeparate: false, nicoSpeed: 100, dim: 90, peekSeconds: 4, chatDim: 40 };
// How the sliders' values read.
const SHOW = {
  nicoSpeed: (v) => (v === 100 ? "Normal" : v / 100 + "×"),
  dim: (v) => v + "%",
  peekSeconds: (v) => (v === 0 ? "Off" : v + (v === 1 ? " second" : " seconds")),
  chatDim: (v) => v + "%",
};
const DEFAULT_OFF_CHANNELS = ["the-kinoplex"];
const SOURCE = "https://github.com/Hostu404/cytube-plus";

let offChannels = DEFAULT_OFF_CHANNELS;
let currentChannel = "";

document.getElementById("version").textContent = "Version " + api.runtime.getManifest().version;

// A channel's name from what someone typed: the name itself, or any link
// to it (cytu.be/r/<name>). CyTube's channel names are letters, digits,
// _ and -, up to 30 long.
function channelName(text) {
  const m = text.trim().match(/\/r\/([^/?#\s]+)/);
  let name = m ? m[1] : text.trim();
  try { name = decodeURIComponent(name); } catch (e) { /* keep as typed */ }
  name = name.toLowerCase();
  return /^[\w-]{1,30}$/.test(name) ? name : "";
}

function showSettings(settings) {
  const s = { ...DEFAULTS, ...settings };
  for (const key of Object.keys(DEFAULTS)) {
    const input = document.getElementById(key);
    if (input.type === "checkbox") input.checked = s[key];
    else showSlider(input, s[key]);
  }
  document.getElementById("nico-sliders").classList.toggle("off", !s.nico);
  document.getElementById("lights-sliders").classList.toggle("off", !s.lightsButton);
  document.getElementById("chat-dim-row").classList.toggle("off", !s.lightsButton);
  document.getElementById("chat-dim-sliders").classList.toggle("off", !s.lightsButton || !s.chatDimSeparate);
}

function showSlider(input, value) {
  input.value = value;
  document.getElementById(input.id + "-value").textContent = SHOW[input.id](Number(value));
}

function showChannels() {
  const list = document.getElementById("off-list");
  list.replaceChildren();
  for (const name of [...offChannels].sort()) {
    const li = document.createElement("li");
    li.className = "row";
    const label = document.createElement("span");
    label.className = "title channel";
    label.textContent = name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Turn it back on for " + name);
    remove.addEventListener("click", () => saveChannels(offChannels.filter((c) => c !== name)));
    li.append(label, remove);
    list.appendChild(li);
  }
  document.getElementById("off-empty").hidden = offChannels.length > 0;
  if (currentChannel) document.getElementById("here-toggle").checked = !offChannels.includes(currentChannel);
}

function saveChannels(next) {
  offChannels = next;
  showChannels();
  api.storage.local.set({ offChannels: next });
}

api.storage.local.get({ settings: DEFAULTS, offChannels: DEFAULT_OFF_CHANNELS }).then((stored) => {
  showSettings(stored.settings);
  offChannels = stored.offChannels;
  showChannels();
});
// The Niconico button under the video changes the same setting.
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings) showSettings(changes.settings.newValue);
  if (changes.offChannels) {
    offChannels = changes.offChannels.newValue ?? DEFAULT_OFF_CHANNELS;
    showChannels();
  }
});

for (const key of Object.keys(DEFAULTS)) {
  const input = document.getElementById(key);
  const valueOf = () => (input.type === "checkbox" ? input.checked : Number(input.value));
  // A slider's number updates as it moves; it's saved when let go.
  if (input.type === "range") input.addEventListener("input", () => showSlider(input, input.value));
  input.addEventListener("change", async () => {
    const { settings } = await api.storage.local.get({ settings: DEFAULTS });
    await api.storage.local.set({ settings: { ...DEFAULTS, ...settings, [key]: valueOf() } });
  });
}

// The channel in the current tab, if it's one: a switch for it at the top.
api.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  const m = tab && tab.url && tab.url.match(/^https:\/\/cytu\.be\/r\/([^/?#]+)/);
  currentChannel = m ? channelName("/r/" + m[1]) : "";
  if (!currentChannel) return;
  document.getElementById("here").hidden = false;
  document.getElementById("here-name").textContent = currentChannel;
  document.getElementById("here-toggle").checked = !offChannels.includes(currentChannel);
});

document.getElementById("here-toggle").addEventListener("change", (e) => {
  const others = offChannels.filter((c) => c !== currentChannel);
  saveChannels(e.target.checked ? others : [...others, currentChannel]);
});

document.getElementById("off-add").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("off-input");
  const error = document.getElementById("off-error");
  const name = channelName(input.value);
  if (!name) {
    error.textContent = "That isn't a channel name or a cytu.be/r/ link.";
    error.hidden = false;
    return;
  }
  error.hidden = true;
  input.value = "";
  if (!offChannels.includes(name)) saveChannels([...offChannels, name]);
});
document.getElementById("off-input").addEventListener("input", () => {
  document.getElementById("off-error").hidden = true;
});

document.getElementById("source").addEventListener("click", (e) => {
  e.preventDefault();
  api.tabs.create({ url: SOURCE });
  window.close();
});
