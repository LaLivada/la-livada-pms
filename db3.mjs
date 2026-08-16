import fs from "fs";
const p = "src/pms-app.jsx";
let s = fs.readFileSync(p, "utf8");
const orig = s;

// Incarcarea porneste doar dupa autentificare: pana atunci tabelele
// raspund cu 401, pentru ca cer sesiune activa.
const vechi = `    return () => { alive = false; };
  }, [reloadKey]);`;
if (!s.includes(vechi)) { console.error("Nu am gasit finalul useEffect"); process.exit(1); }
s = s.replace(vechi, `    return () => { alive = false; };
  }, [reloadKey, currentUser]);`);

const start = s.indexOf("  useEffect(() => {\n    let alive = true;");
if (start === -1) { console.error("Nu am gasit inceputul useEffect"); process.exit(1); }
const dupa = "    let alive = true;\n    (async () => {\n      try {\n";
const j = s.indexOf(dupa, start);
if (j === -1) { console.error("Nu am gasit corpul"); process.exit(1); }
s = s.slice(0, j + dupa.length)
  + "        if (!currentUser) { if (alive) setLoading(false); return; }\n"
  + s.slice(j + dupa.length);

fs.writeFileSync(p, s, "utf8");
console.log(s === orig ? "NIMIC schimbat" : "Gata.");
