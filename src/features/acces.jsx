/* ACCES ELECTRONIC LA CAMERE — codurile de yala.
 *
 * Tot ce atinge yalele trece prin Edge Function-ul `access-provider`, niciodata
 * direct prin TTLock din browser: acolo ar trebui sa stea parola contului care
 * administreaza toate yalele.
 *
 * cheamaAcces nu arunca NICIODATA. Un check-in n-are voie sa cada fiindca o
 * yala n-a raspuns — oaspetele e la receptie, iar rezervarea conteaza mai mult
 * decat codul, care se poate regenera.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Mail, MessageCircle, RefreshCw } from "lucide-react";
import { supabase } from "../supabase.js";
import * as dateAcces from "../data/acces.js";
import { audit } from "../lib/audit.js";
import { mesajEroare } from "../lib/errors.js";
import { guestFullName } from "../lib/nume.js";
import { fmtDateTime } from "../lib/format.js";
import { decideActiuneAcces } from "../lib/acces.js";
import { toaster } from "../ui/primitive.jsx";

export async function cheamaAcces(action, payload = {}) {
  try {
    const { data, error } = await supabase.functions.invoke("access-provider", {
      body: { action, ...payload },
    });
    if (error) {
      /* invoke() marcheaza ca eroare orice status non-2xx, dar corpul are
         mesajul nostru — il preferam celui generic al bibliotecii. */
      let detaliu = null;
      try { detaliu = (await error.context?.json())?.error; } catch { /* ramane null */ }
      if (detaliu) return { ok: false, error: detaliu };

      /* Fara corp de raspuns inseamna ca cererea nu a ajuns deloc: retea
         cazuta, extensie de browser care blocheaza, sau functia in curs de
         redeploy. Mesajul bibliotecii ("Failed to send a request to the Edge
         Function") nu spune nimanui ce sa faca, asa ca il traducem. */
      const retea = /failed to send|fetch/i.test(error.message || "");
      return {
        ok: false,
        error: retea
          ? "Nu am putut contacta serviciul de acces. Verifică conexiunea și încearcă din nou; dacă persistă, reîncarcă pagina."
          : (error.message || "Serviciul de acces a răspuns cu eroare."),
      };
    }
    return data || { ok: false, error: "Raspuns gol de la serviciul de acces." };
  } catch (e) {
    return { ok: false, error: e?.message || "Serviciul de acces nu a raspuns." };
  }
}

/* Aduce codul de acces la zi după ce o rezervare s-a modificat.
 *
 * Trei situații în care codul vechi nu mai are voie să rămână valabil:
 *   · perioada s-a schimbat — altfel ar deschide ușa mai mult sau mai
 *     puțin decât ține rezervarea;
 *   · camera s-a schimbat — altfel oaspetele mutat ar putea intra în
 *     continuare în camera veche, unde între timp poate sta altcineva;
 *   · rezervarea a fost anulată sau marcată no-show.
 *
 * Nu decidem noi ce se întâmplă la furnizor: `issue` din funcția edge
 * recalculează perioada din rezervare, șterge codul vechi de pe yala lui
 * și creează unul nou. Aici doar recunoaștem CÂND trebuie chemat.
 *
 * Ca peste tot în integrarea asta, eșecul nu răstoarnă salvarea: rezervarea
 * e deja modificată, iar recepția primește un avertisment cu ce a rămas de
 * făcut. Un cod nesincronizat e o problemă; o rezervare pierdută e alta,
 * mai mare. */

export async function reconciliazaAcces(inainte, dupa, core) {
  if (!inainte || !dupa) return;

  const camera = core.rooms.find((r) => r.id === dupa.roomId);
  const actiune = decideActiuneAcces(inainte, dupa);
  if (!actiune) return;
  const anulata = actiune === "revoke";

  /* Un cod există doar după check-in. Fără el nu e nimic de sincronizat —
     iar la anulare nu vrem să chemăm furnizorul degeaba. */
  let areCod = false;
  try { areCod = await dateAcces.existaCodActiv(dupa.id); }
  catch (e) { console.error("verificare cod acces", e); return; }
  if (!areCod) return;

  if (anulata) {
    const r = await cheamaAcces("revoke", { reservationId: dupa.id });
    await audit.push(r?.ok ? "Cod acces revocat" : "Revocare cod eșuată",
      `${camera?.name || dupa.roomId}`);
    if (!r?.ok) {
      toaster.show(
        "Rezervarea e anulată, dar codul de acces NU a putut fi șters de pe yală. Verifică în TTHOTEL.",
        { tone: "danger" });
    }
    return;
  }

  const r = await cheamaAcces("issue", { reservationId: dupa.id });
  await audit.push(r?.ok ? "Cod acces actualizat" : "Actualizare cod eșuată",
    `${camera?.name || dupa.roomId}${inainte.roomId !== dupa.roomId ? " · cameră schimbată" : " · perioadă schimbată"}`);
  if (r?.ok) {
    toaster.show("Codul de acces a fost actualizat — oaspetele are alt cod.", { tone: "ok" });
  } else {
    toaster.show(
      "Rezervarea e salvată, dar codul de acces nu a putut fi actualizat. Regenerează-l din rezervare.",
      { tone: "danger" });
  }
}

export function SectiuneAcces({ res, core }) {
  const camera = core.rooms.find((r) => r.id === res.roomId);
  /* undefined = încă se încarcă, null = nu există cod. Distincția
     contează: altfel s-ar vedea „fără cod" o clipă la fiecare deschidere. */
  const [cod, setCod] = useState(undefined);
  const [trimiteri, setTrimiteri] = useState([]);
  const [lucrez, setLucrez] = useState(false);
  const [eroare, setEroare] = useState("");

  const incarca = useCallback(async () => {
    try {
      const { cod: c, trimiteri: t } = await dateAcces.codActivCuTrimiteri(res.id);
      setCod(c); setTrimiteri(t);
    } catch (e) {
      /* Inainte, esecul se pierdea tacit prin destructurare si sectiunea
         ramanea la nesfarsit pe "Se incarca...". */
      console.error("citire cod acces", e);
      setCod(null); setTrimiteri([]);
    }
  }, [res.id]);

  useEffect(() => { incarca(); }, [incarca]);

  const genereaza = async () => {
    setEroare("");
    setLucrez(true);
    /* Dacă există deja un cod, butonul zice "Regenerează" — și chiar
       trebuie să dea unul nou, nu să întoarcă tot codul vechi doar fiindcă
       perioada n-a fost atinsă. */
    const r = await cheamaAcces("issue", { reservationId: res.id, force: Boolean(cod) });
    setLucrez(false);
    if (r?.ok) {
      await incarca();
      await audit.push(r.reused ? "Cod acces refolosit" : "Cod acces generat",
        `${camera?.name || res.roomId}`);
      toaster.show(r.reused ? "Codul exista deja." : "Cod de acces generat.", { tone: "ok" });
    } else {
      setEroare(r?.error || "Codul nu a putut fi generat.");
    }
  };

  if (!camera?.accessLockId) {
    return (
      <div className="field">
        <label>Acces cameră</label>
        <div className="ldv-mic" style={{ color: "var(--muted)" }}>
          Camera {camera?.name || res.roomId} nu are o yală asociată.
          Se configurează în Setări → Camere.
        </div>
      </div>
    );
  }

  const facutCheckIn = res.status === "checkedin" || res.status === "checkedout";

  return (
    <div className="field">
      <label>Acces cameră · {camera.name}</label>

      {cod === undefined && <div className="ldv-mic">Se încarcă…</div>}

      {cod === null && (
        <div className="ldv-mic" style={{ color: "var(--muted)" }}>
          {facutCheckIn
            ? "Codul de acces nu a fost generat."
            : "Codul de acces se generează automat la check-in."}
        </div>
      )}

      {cod && cod.provider === "simulare" && (
        <div className="error-text" role="alert" style={{ marginBottom: 6 }}>
          COD SIMULAT — nu deschide nicio ușă. Serviciul de acces e în modul de
          probă. Nu-l trimite oaspetelui.
        </div>
      )}

      {cod && (
        <div className="sumar-acces">
          <div className="mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: ".12em" }}>
            {cod.code}
          </div>
          <div className="ldv-mic" style={{ color: "var(--muted)" }}>
            Valabil de la {fmtDateTime(cod.valid_from)}<br />
            până la {fmtDateTime(cod.valid_until)}
          </div>
        </div>
      )}

      {eroare && (
        <div className="error-text" role="alert" style={{ marginTop: 8 }}>
          {eroare}
        </div>
      )}

      {cod && trimiteri.length > 0 && (
        <div className="ldv-mic" style={{ marginTop: 8 }}>
          {trimiteri.slice(0, 4).map((t) => (
            <div key={t.id}>
              {t.channel === "email" ? "Email" : "WhatsApp"}:{" "}
              {t.status === "sent" ? "✓ trimis" : "✗ eșuat"}
              {t.sent_at ? ` · ${fmtDateTime(t.sent_at)}` : ""}
              {t.error_message ? ` · ${t.error_message}` : ""}
            </div>
          ))}
        </div>
      )}

      {(facutCheckIn || cod) && (
        <div className="quick-actions acces-actions" style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={genereaza} disabled={lucrez}>
            <RefreshCw size={14} color="var(--accent)" />
            {lucrez ? "Lucrez…" : cod ? "Regenerează" : "Generează"}
          </button>

          {cod && cod.provider !== "simulare" && (
            <button className="btn btn-ghost" disabled={lucrez} onClick={async () => {
              setEroare("");
              setLucrez(true);
              const r = await cheamaAcces("send-email", { reservationId: res.id });
              setLucrez(false);
              await incarca();
              if (r?.ok) toaster.show(`Cod trimis pe email · ${r.recipient}`, { tone: "ok" });
              else setEroare(r?.error || "Emailul nu a putut fi trimis.");
            }}>
              <Mail size={14} color="#2563eb" />
              Email
            </button>
          )}

          {cod && cod.provider !== "simulare" && (() => {
            /* WhatsApp merge prin linkul wa.me: nu avem API oficial, iar o
               automatizare pe WhatsApp Web ar fi fragilă și împotriva
               regulilor lor. Recepționerul apasă trimite în aplicație.
               Consemnăm doar că mesajul a fost pregătit — nu putem confirma
               livrarea, și nu pretindem că o facem. */
            const oaspete = core.guests.find((g) => g.id === res.guestId);
            const cifre = String(oaspete?.phone || "").replace(/[^\d]/g, "");
            if (!cifre) {
              return <span className="ldv-mic" style={{ alignSelf: "center" }}>
                Numărul de WhatsApp nu este disponibil.
              </span>;
            }
            const text = `Bună ${guestFullName(oaspete) || ""},

Camera ta este ${camera.name}.
Codul de acces este: ${cod.code}

Valabil de la ${fmtDateTime(cod.valid_from)} până la ${fmtDateTime(cod.valid_until)}.

Introdu codul pe tastatura yalei și apasă tasta de confirmare #.`;
            return (
              <a className="btn btn-ghost" href={`https://wa.me/${cifre}?text=${encodeURIComponent(text)}`}
                target="_blank" rel="noopener noreferrer"
                onClick={() => {
                  cheamaAcces("log-whatsapp", { reservationId: res.id, recipient: cifre })
                    .then(() => incarca());
                }}>
                <MessageCircle size={14} color="#25D366" />
                WhatsApp
              </a>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* Doar-vizualizare pentru o rezervare existentă: detalii, acces yală și
   facturare — fără câmpurile de editare (cameră, date, client, status).
   `SectiuneAcces`/`FolioPanel` sunt aceleași componente folosite și în
   ReservationModal, nemodificate — doar reasamblate aici. */
