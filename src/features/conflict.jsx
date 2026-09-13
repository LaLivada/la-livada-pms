/* Dialogul conflictului de concurenta (faza 3, C5): baza a refuzat
 * salvarea fiindca altcineva a scris aceeasi rezervare intre timp. Arata
 * campurile in care versiunea ta si a lor difera (lib/conflict.js) si lasa
 * alegerea: „pastreaza a mea" — campurile schimbate de tine raman ale
 * tale, restul cum le-au lasat ei — sau „ia pe a lor". Inchiderea (Esc, X)
 * inseamna „ia pe a lor": nimic nu se scrie fara o alegere explicita.
 */
import React from "react";
import { Dialog } from "../ui/primitive.jsx";
import { diferente, arataValoare } from "../lib/conflict.js";
import { guestFullName } from "../lib/nume.js";
import { fmtDate, fmtDateTime } from "../lib/format.js";

export function ConflictDialog({ randuri, core, groups, onAlege }) {
  const ctx = {
    numeCamera: (id) => core?.rooms?.find((r) => r.id === id)?.name || "",
    numeOaspete: (id) => guestFullName(core?.guests?.find((g) => g.id === id)),
    numeGrup: (id) => groups?.find((g) => g.id === id)?.name || "",
    numeFacturare: (id) => {
      const c = core?.billingCustomers?.find((x) => x.id === id);
      return c ? (c.companyName || [c.lastName, c.firstName].filter(Boolean).join(" ")) : "";
    },
  };
  const maiMulte = randuri.length > 1;
  return (
    <Dialog title="Modificată între timp" onClose={() => onAlege(null)} className="modal-conflict">
      <p className="note conflict-intro">
        Altcineva a salvat {maiMulte ? "aceleași rezervări" : "aceeași rezervare"} după ce ai
        deschis-o tu. Nimic nu s-a scris încă — alege ce rămâne.
      </p>
      {randuri.map(({ baza, aMea, aLor, cine }) => {
        const dif = diferente(baza, aMea, aLor);
        const titlu = ctx.numeOaspete(aLor.guestId) || aLor.occupantName || "Fără nume";
        return (
          <section key={aMea.id} className="conflict-rand" aria-label={titlu}>
            <h4 className="conflict-titlu">
              {titlu} · Camera {ctx.numeCamera(aLor.roomId) || "?"} · {fmtDate(aLor.checkin)} → {fmtDate(aLor.checkout)}
            </h4>
            {cine && (
              <div className="gmeta conflict-cine">
                Ultima modificare: {cine.userName}, {fmtDateTime(cine.at)} — {cine.action}
              </div>
            )}
            {dif.length ? (
              <table className="conflict-tabel">
                <thead>
                  <tr><th scope="col">Câmp</th><th scope="col">A ta</th><th scope="col">A lor</th></tr>
                </thead>
                <tbody>
                  {dif.map((d) => (
                    <tr key={d.cheie} className={d.amandoi ? "conflict-amandoi" : ""}>
                      <th scope="row">
                        {d.eticheta}
                        {d.amandoi && <span className="conflict-marcaj">amândoi</span>}
                      </th>
                      <td className={d.euAmSchimbat ? "conflict-schimbat" : ""}>{arataValoare(d, d.aMea, ctx)}</td>
                      <td className={d.eiAuSchimbat ? "conflict-schimbat" : ""}>{arataValoare(d, d.aLor, ctx)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="note">Aceleași valori — doar salvarea lor a fost mai nouă.</p>
            )}
          </section>
        );
      })}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onAlege("lor")}>Ia pe a lor</button>
        <button type="button" className="btn btn-primary" onClick={() => onAlege("mea")}>Păstrează a mea</button>
      </div>
      <p className="note conflict-nota">
        „Păstrează a mea" scrie doar câmpurile schimbate de tine; restul rămân cum le-au lăsat ei.
      </p>
    </Dialog>
  );
}
