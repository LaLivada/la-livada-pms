import fs from "fs";
const p = "src/pms-app.jsx";
let s = fs.readFileSync(p, "utf8");

const start = s.indexOf("async function loadShared(key, fallback) {");
const marker = "/* ---------------------------------------------------------------\n   ERROR BOUNDARY";
const end = s.indexOf(marker);
if (start === -1 || end === -1 || end < start) {
  console.error("Nu am gasit blocul. Nicio modificare facuta.");
  process.exit(1);
}

const noi = `async function loadShared(key, fallback) {
  try {
    const { data, error } = await supabase
      .from("app_state").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    const parsed = data ? data.value : null;
    if (parsed == null) return fallback;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)
      && (typeof parsed !== "object" || Array.isArray(parsed))) return fallback;
    return parsed;
  } catch (e) {
    console.error("Storage read failed", key, e);
    return fallback;
  }
}
async function saveShared(key, value) {
  try {
    const { error } = await supabase
      .from("app_state")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Storage save failed", key, e);
    return false;
  }
}

`;

s = s.slice(0, start) + noi + s.slice(end);

if (!s.includes(`from "./supabase.js"`)) {
  s = `import { supabase } from "./supabase.js";\n` + s;
}

fs.writeFileSync(p, s, "utf8");
console.log("Gata. Blocul a fost inlocuit.");
