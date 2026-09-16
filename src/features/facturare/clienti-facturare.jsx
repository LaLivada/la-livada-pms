/* FACTURARE / CLIENTII DE FACTURARE — persoana sau firma de pe factura:
 * eticheta, alegerea din lista si fereastra de creare / editare (cu CUI, ANAF).
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState, useRef } from "react";
import { Plus, X, Search, Check, Banknote, UserCheck } from "lucide-react";
import { uid } from "../../lib/uid.js";
import { validateCUIFormat, validatePhone, validateEmail } from "../../lib/validation.js";
import { initials } from "../../lib/format.js";
import { JUDETE, TARI } from "../../lib/constante.js";
import { Dialog, useModalLock, useAduInVizor } from "../../ui/primitive.jsx";

const emptyBillingCustomer = () => ({
  kind: "person", lastName: "", firstName: "", cnp: "",
  companyName: "", cui: "", regCom: "", contactName: "",
  address: "", city: "", county: "Cluj", country: "România",
  email: "", phone: "", guestId: "",
});

// Cauta un client de facturare dupa nume/CUI/CNP/oras (acelasi tipar ca
// selectorul de oaspete din ReservationModal) si cere confirmare pe un
// pop-up cu datele complete inainte de a-l retine — pot exista mai multi
// clienti cu acelasi nume, iar o factura emisa pe cine nu trebuie e greu
// de reparat (doar prin stornare), deci merita acest pas in plus.

const normCui = (v) => String(v || "").toUpperCase().replace(/^RO/, "").trim();

/* ACCES LA CAMERĂ — codul yalei electronice.
 *
 * Citește direct din access_codes: RLS lasă adminul și recepția să vadă
 * codurile, dar NU să le scrie. Orice generare trece prin funcția edge, ca
 * un cod să nu poată exista în PMS fără să existe și pe yală.
 *
 * Codul se generează la check-in. Butonul de aici acoperă cazurile în care
 * asta n-a mers: yala n-a răspuns atunci, rezervarea era deja făcută
 * check-in înainte de integrare, sau perioada s-a schimbat între timp. */

export function billingCustomerLabel(c) {
  if (!c) return "";
  if (c.kind === "company") return c.companyName || "";
  return [c.lastName, c.firstName].filter(Boolean).join(" ").trim();
}

/* href pentru apel direct — tel: vrea doar cifre si "+", fara spatii. */

export function BillingCustomerPicker({ value, customers, defaultLabel, onChange, onNewBillingCustomer }) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(null);
  /* Ca la cautarea de oaspete: cu tastatura deschisa, rezultatele cadeau
     sub marginea de jos a modalului. */
  const refRezultate = useAduInVizor(Boolean(query.trim()));
  const selected = customers.find((c) => c.id === value) || null;

  const matches = (() => {
    const t = query.trim().toLowerCase();
    if (!t) return [];
    const tDigits = t.replace(/\s/g, "");
    return customers.filter((c) =>
      billingCustomerLabel(c).toLowerCase().includes(t) ||
      (c.contactName || "").toLowerCase().includes(t) ||
      (c.cui || "").toLowerCase().includes(t) ||
      (c.cnp || "").includes(tDigits) ||
      (c.phone || "").replace(/\s/g, "").includes(tDigits) ||
      (c.city || "").toLowerCase().includes(t)
    );
  })();

  const custMeta = (c) => [
    c.kind === "company" ? (c.cui && `CUI ${c.cui}`) : (c.cnp && `CNP ${c.cnp}`),
    c.city,
  ].filter(Boolean).join(" · ") || "Fără date suplimentare";

  return (
    <div className="guest-search">
      {selected ? (
        <div className="guest-chip">
          <div className="guest-chip-av">{initials(billingCustomerLabel(selected))}</div>
          <div className="guest-chip-body">
            <div className="gname">{billingCustomerLabel(selected)}{selected.kind === "company" ? " · firmă" : ""}</div>
            <div className="gmeta">{custMeta(selected)}</div>
          </div>
          <button type="button" className="icon-btn" onClick={() => { onChange(""); setQuery(""); }} aria-label="Schimbă clientul de facturare">
            <X size={15} />
          </button>
        </div>
      ) : (
        <>
          <div className="search-box clfact-cautare">
            <Search size={15} color="var(--text-muted)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Caută după nume, CUI, CNP sau oraș…"
            />
          </div>
          {query.trim() ? (
            matches.length > 0 ? (
              <div className="guest-results" ref={refRezultate}>
                {matches.slice(0, 8).map((c) => (
                  <button type="button" key={c.id} className="guest-result" onClick={() => setPending(c)}>
                    <div className="guest-chip-av">{initials(billingCustomerLabel(c))}</div>
                    <div>
                      <div className="gname">{billingCustomerLabel(c)}{c.kind === "company" ? " · firmă" : ""}</div>
                      <div className="gmeta">{custMeta(c)}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="guest-none" ref={refRezultate}>
                <div>Niciun client cu „{query.trim()}”.</div>
                {onNewBillingCustomer && (
                  <button type="button" className="btn btn-primary btn-lat mt-10" onClick={onNewBillingCustomer}>
                    <Plus size={15} /> Adaugă client nou
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="note m-0">Implicit: {defaultLabel}</div>
          )}
        </>
      )}

      {pending && (
        <Dialog onClose={() => setPending(null)} title="Confirmă clientul de facturare">
          <div className="guest-chip mb-14">
            <div className="guest-chip-av">{initials(billingCustomerLabel(pending))}</div>
            <div className="guest-chip-body">
              <div className="gname">{billingCustomerLabel(pending)}</div>
              <div className="gmeta">{pending.kind === "company" ? "Firmă" : "Persoană fizică"}</div>
            </div>
          </div>
          <div className="guest-contact-info">
            {pending.kind === "company" ? (
              <>
                {pending.cui && <div>CUI: {pending.cui}</div>}
                {pending.regCom && <div>Reg. Com.: {pending.regCom}</div>}
                {pending.contactName && <div>Persoană de contact: {pending.contactName}</div>}
              </>
            ) : (
              pending.cnp && <div>CNP: {pending.cnp}</div>
            )}
            <div>{[pending.address, pending.city, pending.county, pending.country].filter(Boolean).join(", ") || "Fără adresă"}</div>
            {pending.phone && <div>Telefon: {pending.phone}</div>}
            {pending.email && <div>Email: {pending.email}</div>}
          </div>
          <div className="note">
            Pot exista mai mulți clienți cu nume asemănător — verifică datele de mai sus înainte să confirmi.
          </div>
          <div className="modal-actions">
            <div className="grow" />
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>Renunță</button>
            <button type="button" className="btn btn-primary btn-lat"
              onClick={() => { onChange(pending.id); setPending(null); setQuery(""); }}>
              <Check size={15} /> Da, facturează pe acest client
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function BillingCustomerModal({ customer, seedFromGuest, existingCustomers, onSave, onClose }) {
  useModalLock();
  const [c, setC] = useState(() => ({
    ...emptyBillingCustomer(),
    ...(seedFromGuest ? {
      kind: "person", lastName: seedFromGuest.lastName || "", firstName: seedFromGuest.firstName || "",
      address: seedFromGuest.address || "", city: seedFromGuest.city || "", county: seedFromGuest.county || "Cluj",
      country: seedFromGuest.country || "România", email: seedFromGuest.email || "", phone: seedFromGuest.phone || "",
      guestId: seedFromGuest.id || "",
    } : {}),
    ...(customer || {}),
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // La primul submit cu un nume care se potriveste cu un client existent
  // (dar CUI/CNP diferit sau lipsa), cerem confirmare explicita in loc sa
  // salvam direct — abia la al doilea click, cu acelasi nume neschimbat,
  // se salveaza efectiv. Orice modificare a formularului reseteaza asta.
  const [nameWarning, setNameWarning] = useState(null);
  // Generat o singura data — nu la fiecare submit, ca un dublu-tap pe
  // "Salveaza" (cat timp raspunsul serverului intarzie) sa nu produca doi
  // clienti locali cu id-uri diferite inainte ca salvarea sa se termine.
  const idRef = useRef(customer?.id || uid());
  const set = (k) => (e) => { setC({ ...c, [k]: e.target.value }); setError(""); setNameWarning(null); };

  const cuiCheck = c.kind === "company" ? validateCUIFormat(c.cui) : { ok: true, warn: false };
  // Fara selector de prefix aici (spre deosebire de fisa de client) — un
  // "0" la inceput e un numar local romanesc normal, nu o greseala.
  const phoneCheck = validatePhone(c.phone);
  const emailCheck = validateEmail(c.email);

  const submit = async () => {
    if (saving) return;
    const REQUIRED = c.kind === "person"
      ? [["lastName", "nume"], ["firstName", "prenume"]]
      : [["companyName", "denumire firmă"], ["cui", "CUI"]];
    const missingCommon = [["address", "adresă"], ["city", "oraș"], ["county", "județ"], ["country", "țară"]]
      .filter(([k]) => !String(c[k] ?? "").trim());
    const missing = REQUIRED.filter(([k]) => !String(c[k] ?? "").trim()).concat(missingCommon);
    if (missing.length) {
      setError(`Completează: ${missing.map(([, label]) => label).join(", ")}.`);
      return;
    }
    if (c.kind === "company" && !cuiCheck.ok) {
      setError(cuiCheck.message);
      return;
    }
    if (!phoneCheck.ok) {
      setError(phoneCheck.message);
      return;
    }
    if (!emailCheck.ok) {
      setError(emailCheck.message);
      return;
    }

    // Verificarile de duplicat conteaza doar la crearea unui client nou —
    // editarea unuia existent isi pastreaza propriul id, nu poate "coliza"
    // cu sine insusi.
    if (!customer?.id) {
      const others = (existingCustomers || []).filter((e) => e.id !== idRef.current);

      if (c.kind === "company") {
        // La firma, CUI-ul identic e suficient — e un identificator legal
        // unic, nu mai e nevoie sa comparam alte campuri.
        if (c.cui.trim()) {
          const dupCui = others.find((e) => e.kind === "company" && normCui(e.cui) === normCui(c.cui));
          if (dupCui) {
            setError(`Există deja o firmă cu acest CUI: ${billingCustomerLabel(dupCui)}${dupCui.city ? ` (${dupCui.city})` : ""}. Caut-o în listă în loc să creezi una nouă.`);
            return;
          }
        }
        const nameKey = c.companyName.trim().toLowerCase();
        const dupName = others.find((e) => e.kind === "company" && (e.companyName || "").trim().toLowerCase() === nameKey);
        if (dupName && !nameWarning) {
          setNameWarning(dupName);
          setError(`Există deja o firmă cu acest nume: ${billingCustomerLabel(dupName)}${dupName.city ? ` (${dupName.city})` : ""}. Dacă e alta firmă, apasă din nou „Salvează” ca să continui.`);
          return;
        }
      } else {
        // La persoana fizica, CNP-ul e optional — nu ne putem baza doar pe
        // el. Comparam nume+prenume impreuna cu telefon si adresa, ca sa nu
        // tratam drept "sigur acelasi om" doua persoane care doar au acelasi
        // nume, dar nici sa nu ratam un duplicat cand CNP-ul lipseste.
        const normVal = (v) => String(v || "").trim().toLowerCase();
        const normPhone = (v) => String(v || "").replace(/\s/g, "");
        const nameKey = `${normVal(c.lastName)} ${normVal(c.firstName)}`.trim();
        const phoneKey = normPhone(c.phone);
        const addrKey = c.address.trim() ? `${normVal(c.address)}|${normVal(c.city)}` : "";
        const cnpKey = c.cnp.trim();

        const persons = others.filter((e) => e.kind === "person");
        if (cnpKey) {
          const dupCnp = persons.find((e) => (e.cnp || "").trim() === cnpKey);
          if (dupCnp) {
            setError(`Există deja o persoană cu acest CNP: ${billingCustomerLabel(dupCnp)}${dupCnp.city ? ` (${dupCnp.city})` : ""}. Caut-o în listă în loc să creezi una nouă.`);
            return;
          }
        }
        const sameName = persons.filter((e) => `${normVal(e.lastName)} ${normVal(e.firstName)}`.trim() === nameKey);
        const corroborated = sameName.find((e) =>
          (phoneKey && normPhone(e.phone) === phoneKey) ||
          (addrKey && e.address.trim() && `${normVal(e.address)}|${normVal(e.city)}` === addrKey)
        );
        const dup = corroborated || sameName[0];
        if (dup && !nameWarning) {
          setNameWarning(dup);
          const reason = corroborated ? "acest nume și aceleași date de contact" : "acest nume";
          setError(`Există deja o persoană cu ${reason}: ${billingCustomerLabel(dup)}${dup.city ? ` (${dup.city})` : ""}. Dacă e altcineva, apasă din nou „Salvează” ca să continui.`);
          return;
        }
      }
    }

    setError("");
    setSaving(true);
    try {
      await onSave({ ...c, id: idRef.current });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onClose={onClose} title={customer?.id ? "Editează client de facturare" : "Client de facturare nou"}>
      <div className="mode-switch mb-14">
        <button className={c.kind === "person" ? "on" : ""} onClick={() => { setC({ ...c, kind: "person" }); setError(""); setNameWarning(null); }}>
          <UserCheck size={14} /> Persoană fizică
        </button>
        <button className={c.kind === "company" ? "on" : ""} onClick={() => { setC({ ...c, kind: "company" }); setError(""); setNameWarning(null); }}>
          <Banknote size={14} /> Firmă
        </button>
      </div>

      {c.kind === "person" ? (
        <>
          <div className="field-row field-row-2col">
            <label className="field"><span className="fl">Nume *</span><input value={c.lastName} onChange={set("lastName")} placeholder="Popescu" /></label>
            <label className="field"><span className="fl">Prenume *</span><input value={c.firstName} onChange={set("firstName")} placeholder="Andrei" /></label>
          </div>
          <label className="field"><span className="fl">CNP (opțional)</span><input value={c.cnp} onChange={set("cnp")} placeholder="1234567890123" /></label>
        </>
      ) : (
        <>
          <label className="field"><span className="fl">Denumire firmă *</span><input value={c.companyName} onChange={set("companyName")} placeholder="ABC Impex SRL" /></label>
          <div className="field-row field-row-2col">
            <label className="field">
              <span className="fl">CUI/CIF *</span>
              <input className={!cuiCheck.ok ? "input-error" : ""} value={c.cui} onChange={set("cui")} placeholder="RO12345678" />
            </label>
            <label className="field"><span className="fl">Nr. Reg. Comerțului</span><input value={c.regCom} onChange={set("regCom")} placeholder="J12/345/2020" /></label>
          </div>
          {c.kind === "company" && c.cui && cuiCheck.warn && (
            <div className="note mt-neg6 mb-14">{cuiCheck.message}</div>
          )}
          <label className="field"><span className="fl">Persoană de contact</span><input value={c.contactName} onChange={set("contactName")} placeholder="Nume persoană contact" /></label>
        </>
      )}

      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Adresă *</span><input value={c.address} onChange={set("address")} placeholder="Str. Exemplu nr. 10" /></label>
        <label className="field"><span className="fl">Oraș *</span><input value={c.city} onChange={set("city")} /></label>
      </div>
      <div className="field-row field-row-2col">
        <div className="field">
          <label>Județ *</label>
          {c.country === "România" ? (
            <select value={c.county} onChange={set("county")}>
              {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          ) : (
            <input value={c.county} onChange={set("county")} placeholder="Regiune" />
          )}
        </div>
        <label className="field">
          <span className="fl">Țară *</span>
          <select value={c.country} onChange={set("country")}>
            {TARI.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span className="fl">Cod poștal</span><input value={c.postalCode || ""} onChange={set("postalCode")} /></label>
      <div className="field-row field-row-2col">
        <label className="field">
          <span className="fl">Email</span>
          <input type="email" className={c.email && !emailCheck.ok ? "input-error" : ""} value={c.email} onChange={set("email")} />
        </label>
        <label className="field">
          <span className="fl">Telefon</span>
          <input className={c.phone && !phoneCheck.ok ? "input-error" : ""} value={c.phone} onChange={set("phone")} />
        </label>
      </div>

      {error && <div className="error-text mb-10" role="alert">{error}</div>}
      <div className="modal-actions">
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Anulează</button>
        <button className="btn btn-primary btn-lat" onClick={submit} disabled={saving}>
          <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
        </button>
      </div>
    </Dialog>
  );
}
