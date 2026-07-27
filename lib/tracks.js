export const TRACKS = {
  computer: { id: "computer", label: "💻 Kompyuter savodxonligi", short: "Kompyuter savodxonligi" },
  html_css: { id: "html_css", label: "🌐 HTML & CSS", short: "HTML & CSS" },
  javascript: { id: "javascript", label: "🟨 JavaScript", short: "JavaScript" }
};

export const TRACK_IDS = Object.keys(TRACKS);

export function isTrack(value) {
  return TRACK_IDS.includes(String(value || ""));
}

export function trackLabel(value) {
  return TRACKS[value]?.label || String(value || "Noma’lum");
}

export function trackShort(value) {
  return TRACKS[value]?.short || String(value || "Noma’lum");
}

export function trackKeyboard(prefix) {
  return {
    inline_keyboard: [
      [{ text: TRACKS.computer.label, callback_data: `${prefix}:computer` }],
      [{ text: TRACKS.html_css.label, callback_data: `${prefix}:html_css` }],
      [{ text: TRACKS.javascript.label, callback_data: `${prefix}:javascript` }]
    ]
  };
}

export function trackKeyboardForOwner(prefix, ownerId) {
  return {
    inline_keyboard: [
      [{ text: TRACKS.computer.label, callback_data: `${prefix}:${ownerId}:computer` }],
      [{ text: TRACKS.html_css.label, callback_data: `${prefix}:${ownerId}:html_css` }],
      [{ text: TRACKS.javascript.label, callback_data: `${prefix}:${ownerId}:javascript` }]
    ]
  };
}
