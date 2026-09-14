/* FACTURARE / DREPTURILE DE FACTURARE — cine are voie sa emita, sa storneze,
 * sa incaseze; ce arata ecranul, autoritatea e in Postgres.
 *
 * Desprins din features/facturare.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState, useEffect, useCallback } from "react";
import * as datePersonal from "../../data/personal.js";
import { mesajEroare } from "../../lib/errors.js";
import { BILLING_PERMISSION_LABEL, BILLING_PERMISSION_KEYS, ROLE_LABEL } from "../../lib/constante.js";
import { toaster } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";

export function BillingPermissionsView() {
  const [staffList, setStaffList] = useState(null);
  const [perms, setPerms] = useState({});
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const { personal, permisiuniDupaUtilizator } = await datePersonal.personalCuPermisiuni();
      /* Adminii nu apar in ecran: au oricum tot, prin has_billing_permission. */
      setStaffList(personal.filter((u) => u.role !== "admin"));
      setPerms(permisiuniDupaUtilizator);
      setLoadError("");
    } catch (e) { setLoadError(mesajEroare(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (userId, perm, has) => {
    try {
      if (has) await datePersonal.retragePermisiune(userId, perm);
      else await datePersonal.acordaPermisiune(userId, perm);
    } catch (e) {
      toaster.show(mesajEroare(e, has ? "Nu am putut retrage permisiunea" : "Nu am putut acorda permisiunea"), { tone: "danger" });
      return;
    }
    setPerms((prev) => {
      const next = { ...prev, [userId]: new Set(prev[userId] || []) };
      if (has) next[userId].delete(perm); else next[userId].add(perm);
      return next;
    });
    const staffMember = (staffList || []).find((u) => u.user_id === userId);
    await audit.push(has ? "Permisiune facturare retrasă" : "Permisiune facturare acordată",
      `${staffMember?.name || userId} · ${BILLING_PERMISSION_LABEL[perm]}`);
  };

  if (loadError) return <div className="note" style={{ color: "var(--danger)" }}>{loadError}</div>;
  if (staffList === null) return <div className="note">Se încarcă…</div>;

  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>
        Adminii au automat toate drepturile de facturare. Restul userilor primesc doar ce e bifat aici.
      </div>
      {staffList.length === 0 ? (
        <div className="section-empty">Niciun user non-admin.</div>
      ) : (
        <div className="panel" style={{ overflowX: "auto" }}>
          {staffList.map((u) => (
            <div className="list-row" key={u.user_id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div className="primary">{u.name} <span className={"role-tag role-" + u.role} style={{ marginLeft: 8 }}>{ROLE_LABEL[u.role]}</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                {BILLING_PERMISSION_KEYS.map((perm) => {
                  const has = perms[u.user_id]?.has(perm) || false;
                  return (
                    <label key={perm} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                      <input type="checkbox" checked={has} onChange={() => toggle(u.user_id, perm, has)} />
                      {BILLING_PERMISSION_LABEL[perm]}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
