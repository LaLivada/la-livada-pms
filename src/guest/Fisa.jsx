/* Fisa de cazare, completata de oaspete.
 *
 * NU E UN PANOU CARE ACOPERA PAGINA, si asta a fost o corectie, nu o alegere
 * din prima. Prima varianta era `position:fixed; inset:0` peste tot — arata
 * exact ca o fereastra modala si parea sa respecte cerinta, fiindca butonul
 * usii ramanea vizibil prin fundalul translucid. Verificat cu
 * `elementFromPoint` in centrul butonului: raspundea o eticheta din
 * formular. Butonul se VEDEA, dar nu se putea apasa — adica exact ce s-a
 * hotarat sa nu se intample (docs/fisa-cazare.md 0).
 *
 * Asa, cardul sta IN CURGEREA paginii, sub cel cu codul si usa. Deasupra lui
 * ramane tot ce trebuie unui om in fata usii; sub el, sectiunile se ascund
 * pana la semnare. Wi-fi-ul si numarul asistentei intra chiar in card: fara
 * internet nu se completeaza niciun formular, iar cine nu se descurca
 * trebuie sa poata suna fara sa caute.
 *
 * Campurile marcate `sensibil` in lib/fisa.js pornesc GOALE chiar daca
 * oaspetele a mai stat la noi. Nu e o scapare a precompletarii: sunt exact
 * campurile pe care am hotarat sa nu le citim inapoi.
 */
import { useEffect, useState } from "react";
import { CAMPURI, ACT_TIPURI, valideazaFisa, SABLON_VERSIUNE } from "../lib/fisa.js";
import { traseuSvg, esteGoala } from "../lib/semnatura.js";
import { citesteFisa, trimiteFisa } from "./api.js";
import { ASISTENTA, WIFI } from "./continut.js";
import Semnatura from "./Semnatura.jsx";

export default function Fisa({ cod, onGata }) {
  const [date, setDate] = useState({});
  const [linii, setLinii] = useState([]);
  const [erori, setErori] = useState({});
  const [stare, setStare] = useState("incarca");
  const [mesaj, setMesaj] = useState("");

  useEffect(() => {
    let viu = true;
    citesteFisa(cod)
      .then((r) => {
        if (!viu) return;
        if (r?.gata) { onGata(); return; }
        /* Precompletarea aduce doar campurile nesensibile — vezi
           guest_fisa_precompletare. Restul raman goale, deliberat. */
        setDate(r?.date || {});
        setStare("gata");
      })
      /* Fisa nu se poate incarca: aratam formularul gol, nu un ecran de
         eroare. Oaspetele poate completa tot de mana, iar scrierea are
         propriul drum de esec. Un refuz aici l-ar fi lasat blocat. */
      .catch(() => { if (viu) setStare("gata"); });
    return () => { viu = false; };
  }, [cod, onGata]);

  const pune = (cheie, v) => setDate((d) => ({ ...d, [cheie]: v }));

  async function trimite() {
    const v = valideazaFisa(date);
    const toate = { ...v.erori };
    if (esteGoala(linii)) toate.semnatura = "Semnează în chenarul de mai sus.";
    setErori(toate);
    if (Object.keys(toate).length > 0) return;

    setStare("trimit");
    const r = await trimiteFisa(cod, {
      ...date,
      semnaturaSvg: traseuSvg(linii),
      sablonVersiune: SABLON_VERSIUNE,
    });
    if (r?.ok) { onGata(); return; }
    setStare("gata");
    setMesaj(r?.motiv === "deja-completata"
      ? "Fișa e deja completată."
      : "Nu am putut trimite fișa. Mai încearcă o dată.");
  }

  if (stare === "incarca") return null;

  return (
    <section className="g-card g-fisa" aria-labelledby="fisa-titlu">
      <h2 id="fisa-titlu">Fișa de cazare</h2>
      <p className="g-fisa-intro">
        E obligatorie la cazare. O completezi o dată, aici — restul paginii
        se deschide după.
      </p>

      {/* Wi-fi-ul si asistenta stau AICI, nu in panoul „Bun venit": acela e
          ascuns pana la semnare, iar fara internet nu se completeaza niciun
          formular. */}
      <p className="g-fisa-ajutor">
        Rețeaua <strong>{WIFI.retea}</strong>, fără parolă. Dacă te
        împotmolești, sună-l pe {ASISTENTA.nume} la{" "}
        <a href={`tel:${ASISTENTA.telefon}`}>{ASISTENTA.scris}</a>.
      </p>

      {CAMPURI.map((c) => (
        <label key={c.cheie} className="g-camp">
          <span className="g-camp-eticheta">
            {c.eticheta}{!c.obligatoriu && <em> (dacă are)</em>}
          </span>
          {c.tip === "alegere" ? (
            <select value={date[c.cheie] || ""}
              onChange={(e) => pune(c.cheie, e.target.value)}>
              <option value="">Alege…</option>
              {ACT_TIPURI.map((t) => (
                <option key={t.cheie} value={t.cheie}>{t.eticheta}</option>
              ))}
            </select>
          ) : (
            <input type={c.tip === "date" ? "date" : "text"}
              value={date[c.cheie] || ""}
              onChange={(e) => pune(c.cheie, e.target.value)} />
          )}
          {erori[c.cheie] && <span className="g-camp-eroare">{erori[c.cheie]}</span>}
        </label>
      ))}

      <Semnatura valoare={linii} onSchimbare={setLinii} />
      {erori.semnatura && <span className="g-camp-eroare">{erori.semnatura}</span>}

      {mesaj && <p className="g-fisa-mesaj" role="alert">{mesaj}</p>}

      <button type="button" className="g-fisa-trimit" disabled={stare === "trimit"}
        onClick={trimite}>
        {stare === "trimit" ? "Trimit…" : "Semnez și trimit"}
      </button>
    </section>
  );
}
