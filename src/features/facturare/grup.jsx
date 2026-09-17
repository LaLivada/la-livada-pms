/* FACTURARE / GRUP — o singură factură pentru toate camerele unui grup.
 *
 * Până acum factura se putea face doar cameră cu cameră: un grup de zece
 * camere însemna zece facturi, iar firma care plătea primea zece documente
 * pentru același sejur. Aici se alege ce camere intră și cum arată liniile.
 *
 * CUM STĂ ÎN BAZĂ, fiindcă nu e evident: `invoices.folio_id` e NOT NULL și
 * `folios.reservation_id` e NOT NULL UNIQUE, deci în schema de azi o factură
 * numește exact un folio, adică o cameră. Factura de grup se ancorează pe
 * folio-ul primei camere alese, iar apartenența ei reală la toate camerele
 * stă în `invoice_item_links`, care leagă fiecare linie de pozițiile de folio
 * din care vine — și care nu are nicio restricție de folio. Două câștiguri
 * din asta: trigger-ul `guard_invoice_item_link` din schema.sql refuză deja
 * o poziție facturată pe altă factură activă, deci o cameră nu poate ajunge
 * și pe factura de grup, și pe una proprie; iar Oblio își ia unitatea și
 * tipul liniei tot pe drumul `invoice_item_links → folio_items → products`,
 * deci facturile de grup pleacă în Oblio la fel de corect ca celelalte.
 * Panoul folio al fiecărei camere caută facturile și pe legături, nu doar pe
 * `folio_id`, ca factura de grup să se vadă din toate camerele ei.
 */

import { useState, useEffect, useCallback } from "react";
import { Check, Receipt } from "lucide-react";
import * as dateFacturare from "../../data/facturare.js";
import * as dateFolio from "../../data/folio.js";
import { camelBillingCustomer } from "../../data/mapari.js";
import { uid } from "../../lib/uid.js";
import { mesajEroare } from "../../lib/errors.js";
import { fmtMoney, fmtDate } from "../../lib/format.js";
import { isLive } from "../../lib/availability.js";
import { liniiDinCamere } from "../../lib/factura-grup.js";
import { guestFullName, numeDelegat } from "../../lib/nume.js";
import { Dialog, useModalLock } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";
import { ensureCazareLine, delegatPentruFactura } from "./emitere.jsx";
import { BillingCustomerPicker } from "./clienti-facturare.jsx";

/* Camerele grupului, cu folio-ul și pozițiile nefacturate ale fiecăreia.
   Rezervările moarte (anulate, no-show) sunt lăsate afară: aceeași regulă ca
   la lista de cazare a grupului. */
async function incarcaCamerele(group, reservations, core) {
  const ale = reservations
    .filter((r) => r.groupId === group.id && isLive(r))
    .sort((a, b) => {
      const na = core.rooms.find((c) => c.id === a.roomId)?.name || "";
      const nb = core.rooms.find((c) => c.id === b.roomId)?.name || "";
      return String(na).localeCompare(String(nb), "ro", { numeric: true });
    });

  const camere = [];
  for (const rez of ale) {
    const folio = await dateFolio.folioPentruRezervare(rez.id);
    const pozitii = await dateFolio.pozitiiFolio(folio.id);
    /* Aceeași linie de cazare ca în panoul camerei: dacă lipsește sau s-a
       schimbat perioada ori prețul, se scrie acum, ca totalul grupului să fie
       cel adevărat. */
    const cazare = await ensureCazareLine(folio, pozitii, rez, core);
    const restul = pozitii.filter((p) => p.category !== "cazare");
    const toate = cazare ? [cazare, ...restul] : restul;
    const nefacturate = toate.filter((p) => p.invoiced_status !== "invoiced");
    camere.push({
      rezervare: rez,
      camera: core.rooms.find((c) => c.id === rez.roomId) || null,
      folio,
      pozitii: nefacturate,
      facturateDeja: toate.length - nefacturate.length,
      total: nefacturate.reduce((s, p) => s + Number(p.total_amount), 0),
    });
  }
  return camere;
}

export function GroupInvoiceModal({ group, reservations, core, updateCore, onClose, onCreated }) {
  useModalLock();
  const [camere, setCamere] = useState(null);
  const [alese, setAlese] = useState(() => new Set());
  const [mod, setMod] = useState("camere");
  const [billingCustomerId, setBillingCustomerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const incarca = useCallback(async () => {
    try {
      const c = await incarcaCamerele(group, reservations, core);
      setCamere(c);
      setAlese(new Set(c.filter((x) => x.pozitii.length).map((x) => x.rezervare.id)));
      /* Clientul de facturare propus: cel al camerei principale, dacă are
         unul; altfel primul pe care îl poartă vreo cameră din grup. */
      const principal = c.find((x) => x.rezervare.guestId === group.mainGuestId);
      setBillingCustomerId(principal?.rezervare.billingCustomerId
        || c.map((x) => x.rezervare.billingCustomerId).find(Boolean) || "");
    } catch (e) {
      setError(mesajEroare(e, "Nu am putut încărca folio-urile grupului"));
      setCamere([]);
    }
  }, [group, reservations, core]);

  useEffect(() => { incarca(); }, [incarca]);

  const comuta = (id) => setAlese((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const camereAlese = (camere || []).filter((c) => alese.has(c.rezervare.id) && c.pozitii.length);
  const total = camereAlese.reduce((s, c) => s + c.total, 0);
  const linii = camere ? liniiDinCamere(camereAlese, mod, group.name, core.products) : [];
  const guestPrincipal = core.guests.find((g) => g.id === group.mainGuestId) || null;

  const salveaza = async () => {
    if (!camereAlese.length) { setError("Alege cel puțin o cameră cu poziții nefacturate."); return; }
    setSaving(true);
    setError("");
    try {
      let idClient = billingCustomerId;
      if (!idClient) {
        /* Ca la factura pe o cameră: fără client ales, se face unul din
           oaspetele principal al grupului. */
        if (!guestPrincipal) { setError("Grupul n-are oaspete principal — alege un client de facturare."); setSaving(false); return; }
        const nou = {
          id: uid(), kind: "person", lastName: guestPrincipal.lastName, firstName: guestPrincipal.firstName,
          address: guestPrincipal.address || "—", city: guestPrincipal.city || "—", county: guestPrincipal.county || "—",
          country: guestPrincipal.country || "România", email: guestPrincipal.email || "", phone: guestPrincipal.phone || "",
          guestId: guestPrincipal.id,
        };
        const creat = await dateFacturare.creeazaClientFacturare(nou);
        idClient = creat.id;
        await updateCore({ ...core, billingCustomers: [...(core.billingCustomers || []), camelBillingCustomer(creat)] });
      }

      /* Ancora: folio-ul primei camere alese. Vezi antetul fișierului —
         schema cere un folio, apartenența reală stă în legături. */
      const ancora = camereAlese[0];
      const deLa = camereAlese.map((c) => c.rezervare.checkin).sort()[0];
      const panaLa = camereAlese.map((c) => c.rezervare.checkout).sort().slice(-1)[0];

      /* Delegatul grupului: ocupantul camerei oaspetelui principal, daca e
         printre camerele alese; altfel al primei camere. La un grup, camera
         are aproape mereu un ocupant scris — el e cel care primeste factura,
         nu firma care a rezervat. */
      const camPrincipal = camereAlese.find((c) => c.rezervare.guestId === group.mainGuestId) || ancora;
      const { factura, total: totalFactura, nrLinii } = await dateFacturare.creeazaFacturaDinFolio({
        idFolio: ancora.folio.id, idClient, deLa, panaLa,
        linii, creatDe: audit.user?.id || null,
        delegat: await delegatPentruFactura(camPrincipal.rezervare.id, numeDelegat(camPrincipal.rezervare, core) || guestFullName(guestPrincipal)),
      });

      await audit.push("Factură de grup creată (draft)",
        `${group.name} · ${camereAlese.length} camere · ${fmtMoney(totalFactura)} · ${nrLinii} linii`);
      onCreated?.(factura);
    } catch (e) {
      setError(mesajEroare(e, "Factura grupului nu a putut fi creată"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onClose={onClose} title={`Factură pentru grupul ${group.name}`}>
      {camere === null ? (
        <div className="note">Se încarcă folio-urile camerelor…</div>
      ) : !camere.length ? (
        <div className="note">Grupul n-are camere active.</div>
      ) : (
        <>
          <div className="field">
            <span className="fl">Facturare către</span>
            <BillingCustomerPicker
              value={billingCustomerId}
              customers={core.billingCustomers || []}
              defaultLabel={guestFullName(guestPrincipal) || "Oaspetele principal al grupului"}
              onChange={setBillingCustomerId}
            />
          </div>

          <div className="field">
            <span className="fl">Cum arată factura</span>
            <div className="mode-switch">
              <button type="button" className={mod === "camere" ? "on" : ""} onClick={() => setMod("camere")}>
                Detaliat pe camere
              </button>
              <button type="button" className={mod === "total" ? "on" : ""} onClick={() => setMod("total")}>
                Doar totalul
              </button>
            </div>
            <div className="text-secundar mt-6">
              {mod === "camere"
                ? "Fiecare poziție rămâne o linie, cu numărul camerei lângă ea."
                : "Tot grupul într-o singură linie. Dacă în grup sunt cote de TVA diferite, iese câte o linie de fiecare cotă — o linie nu poate purta două cote."}
            </div>
          </div>

          <div className="panel mb-14">
            {camere.map((c) => {
              const fara = !c.pozitii.length;
              return (
                <label className="list-row folio-selectie-rand" key={c.rezervare.id}>
                  <input type="checkbox" className="no-shrink" disabled={fara}
                    checked={alese.has(c.rezervare.id) && !fara}
                    onChange={() => comuta(c.rezervare.id)} />
                  <div className="min-w-0 grow">
                    <div><strong>{c.camera?.name || "?"}</strong> · {fmtDate(c.rezervare.checkin)} → {fmtDate(c.rezervare.checkout)}</div>
                    <div className="text-secundar folio-selectie-meta">
                      {fara
                        ? (c.facturateDeja ? "Totul e deja facturat" : "Nicio poziție de facturat")
                        : `${c.pozitii.length} ${c.pozitii.length === 1 ? "poziție" : "poziții"}${c.facturateDeja ? ` · ${c.facturateDeja} deja facturate` : ""}`}
                    </div>
                  </div>
                  <div className="folio-suma no-shrink">{fmtMoney(c.total)}</div>
                </label>
              );
            })}
          </div>

          <div className="folio-total-rand">
            <span>{camereAlese.length} {camereAlese.length === 1 ? "cameră" : "camere"} · {linii.length} {linii.length === 1 ? "linie" : "linii"}</span>
            <span className="folio-total-suma">{fmtMoney(total)}</span>
          </div>

          {error && <div className="error-text">{error}</div>}

          <div className="modal-actions">
            <div className="grow" />
            <button type="button" className="btn btn-ghost" onClick={onClose}>Renunță</button>
            <button type="button" className="btn btn-primary btn-lat" onClick={salveaza}
              disabled={saving || !camereAlese.length}>
              <Check size={15} /> {saving ? "Se creează…" : "Creează factura"}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/* Butonul din editorul de grup. Stă aici, nu în grupuri.jsx, ca tot ce ține
   de facturare să rămână într-un singur loc. Pe tot rândul, ca „Adaugă cameră
   în grup", sub care stă. */
export function GroupInvoiceButton({ onClick, disabled }) {
  return (
    <button type="button" className="btn btn-ghost w-full mt-4" onClick={onClick} disabled={disabled}>
      <Receipt size={15} /> Facturează grupul
    </button>
  );
}
