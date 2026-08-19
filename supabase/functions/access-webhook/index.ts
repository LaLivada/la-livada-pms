// Webhook pentru evenimentele yalelor (Callback URL din aplicația TTLock).
//
// Norul TTLock trimite aici ce se întâmplă la uși: deschideri cu cod, cu
// amprentă, din aplicație. NU e necesar pentru generarea codurilor — acelea
// merg fără el. Există ca să existe o urmă reală a accesului, complementară
// jurnalului nostru: PMS-ul știe ce coduri a emis, webhook-ul știe care au
// fost chiar folosite.
//
// AUTENTIFICARE. TTLock nu trimite niciun JWT, deci funcția e publică
// (verify_jwt=false). Un endpoint public care scrie în baza noastră ar fi
// invitație la gunoi, așa că cerem un token secret în adresă:
//
//   https://<proiect>.supabase.co/functions/v1/access-webhook?t=<token>
//
// Tokenul stă în TTLOCK_WEBHOOK_TOKEN. Fără el configurat, funcția refuză
// tot — mai bine nimic decât un jgheab deschis către tabelul de audit.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN        = Deno.env.get("TTLOCK_WEBHOOK_TOKEN") || "";

/* Comparație în timp constant. Un `===` pe secrete scurge, prin durată,
   câte caractere s-au potrivit — puțin, dar gratuit de evitat. */
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req) => {
  /* Webhook-urile se reîncearcă la eroare. Răspundem 200 la orice cerere
     validă, chiar dacă nu înțelegem conținutul: altfel TTLock ar relua la
     nesfârșit un mesaj pe care oricum nu-l putem procesa. */
  const ok = () => new Response("ok", { status: 200 });

  if (!TOKEN) {
    console.warn("TTLOCK_WEBHOOK_TOKEN nu e setat — webhook-ul refuză tot.");
    return new Response("nu", { status: 503 });
  }

  const primit = new URL(req.url).searchParams.get("t") || "";
  if (!egalConstant(primit, TOKEN)) {
    /* Fără detalii în răspuns: cine nimerește adresa nu are de ce să afle
       dacă tokenul e greșit sau lipsește. */
    return new Response("nu", { status: 401 });
  }

  let continut: any = null;
  try {
    const tip = req.headers.get("content-type") || "";
    if (tip.includes("application/json")) {
      continut = await req.json();
    } else {
      continut = Object.fromEntries(new URLSearchParams(await req.text()));
    }
  } catch { /* rămâne null; oricum consemnăm evenimentul */ }

  /* Nu inventăm structura mesajului: documentația nu descrie exact ce
     trimite TTLock, așa că păstrăm conținutul brut și extragem defensiv
     doar ce recunoaștem. Când vom vedea mesaje reale, extragerea se poate
     rafina fără să pierdem ce a fost deja înregistrat. */
  const lockId = continut?.lockId ?? continut?.lockid ?? null;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    await admin.from("access_audit").insert({
      actor: "ttlock (webhook)",
      action: "eveniment yală",
      provider: "ttlock",
      lock_id: lockId ? String(lockId) : null,
      detail: JSON.stringify(continut ?? {}).slice(0, 900),
    });
  } catch (e) {
    // Nu întoarcem eroare: TTLock ar relua mesajul, iar problema e la noi.
    console.error("access-webhook: nu am putut scrie evenimentul", e);
  }

  return ok();
});
