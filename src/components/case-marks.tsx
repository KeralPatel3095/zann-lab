const products: Record<string, { background: string; color: string; border: string }> = {
  nightguard: { background: "#e2f2f6", color: "#1f5563", border: "#8ec5d4" },
  crown: { background: "#ffe14a", color: "#5c4800", border: "#e0c200" },
  denture: { background: "#e5f4ea", color: "#1d6a3c", border: "#b5dcc3" },
  "repair/reline": { background: "#fff1d6", color: "#8a5a12", border: "#efd09a" },
  essix: { background: "#e7eefc", color: "#2d4f93", border: "#c3d2f4" },
  remake: { background: "#fde8ee", color: "#8d3050", border: "#f3c2d0" },
  implant: { background: "#e3f6f4", color: "#0f6b66", border: "#b7e4df" },
  bridge: { background: "#ece9ff", color: "#4338a0", border: "#cfc8f5" },
  models: { background: "#f3eee6", color: "#6b5344", border: "#e0d3c4" },
  ortho: { background: "#ffe8dc", color: "#9a4318", border: "#f4c7b0" },
  "post/core": { background: "#eef3d8", color: "#556312", border: "#d3df9f" },
  veneer: { background: "#fde7f6", color: "#8a2f78", border: "#f3c0e6" },
  "custom trays": { background: "#e5f4ff", color: "#1d5f86", border: "#b9def4" },
  "bleach trays": { background: "#e4fbff", color: "#0c6d7a", border: "#b6eaf2" },
  "wax up": { background: "#fff6cc", color: "#7a6410", border: "#ead98a" },
  nti: { background: "#f6e6ff", color: "#6d2d86", border: "#e2c2f2" },
  "dual leminate": { background: "#e8fff5", color: "#0f6b4a", border: "#b8ead4" },
  "gold crown": { background: "#fff0c9", color: "#7a5410", border: "#e6cc86" },
  flipper: { background: "#edfbe3", color: "#3d6b16", border: "#c8e6ae" },
  "sports mouthguards": { background: "#e6eaf6", color: "#24356e", border: "#c2cae6" },
  crown_bridge: { background: "#f7e9ff", color: "#5b2d86", border: "#e0c4f4" },
  "ng design only": { background: "#d9f3ea", color: "#145c4a", border: "#a9decc" },
  polishing: { background: "#eef1f4", color: "#3e4a57", border: "#d0d6de" },
  "try in case": { background: "#fff0e6", color: "#8a4520", border: "#f0d0ba" },
  "lingual wire": { background: "#f8e6ea", color: "#7a2438", border: "#e8c0c8" },
  "space maintainer": { background: "#e8f7e4", color: "#2f6a32", border: "#c4e4be" },
};

const fallback = [
  { background: "#f7efe4", color: "#6d4c2f", border: "#e6d3be" },
  { background: "#e8f0ff", color: "#27457a", border: "#c5d6f6" },
  { background: "#fdeee8", color: "#8a3d2a", border: "#f3cfc4" },
  { background: "#eaf8e8", color: "#2a6630", border: "#c5e6c0" },
  { background: "#f4e8ff", color: "#5a2f86", border: "#dfc6f4" },
  { background: "#e7fbf6", color: "#0e655c", border: "#bfe8df" },
  { background: "#fff4e0", color: "#7a5414", border: "#edd4a4" },
  { background: "#fde8f2", color: "#86284f", border: "#f3c4d8" },
];

export function productTone(name: string) {
  const key = name.trim().toLowerCase();
  if (products[key]) return products[key];
  let hash = 0;
  for (const char of key) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return fallback[hash % fallback.length];
}

export function ProductMark({ name }: { name: string }) {
  const tone = productTone(name);
  const label = name.trim() || "Unspecified";
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: tone.background, color: tone.color, borderColor: tone.border }}
    >
      {label}
    </span>
  );
}

export function PanMark({ value, status }: { value: string; status?: string }) {
  const text = value.trim();
  if (!text) return <span>—</span>;
  if (status !== "in_production") return <span>{text}</span>;
  return (
    <span className="pan-live" title="In production">
      <span>PAN</span>
      {text}
    </span>
  );
}
