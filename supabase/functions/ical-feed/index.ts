// Feed iCal public per cameră — Booking.com/Airbnb il pot adăuga ca sursă
// externă de calendar, ca să vadă automat ce zile sunt ocupate în PMS.
//
// URL: https://<project>.supabase.co/functions/v1/ical-feed/<ical_token>.ics
//
// Trebuie deployată cu --no-verify-jwt: Booking/Airbnb fac un GET simplu,
// fără niciun header de autentificare Supabase.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function icsEscape(text: string): string {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toICSDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function extractToken(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const fromPath = last.replace(/\.ics$/i, "");
  return fromPath && fromPath !== "ical-feed" ? fromPath : (url.searchParams.get("token") || "");
}

Deno.serve(async (req) => {
  const token = extractToken(req);
  if (!token) return new Response("Missing token", { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("id, name")
    .eq("ical_token", token)
    .maybeSingle();
  if (roomErr || !room) return new Response("Not found", { status: 404 });

  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // "cancelled" si "noshow" elibereaza camera in restul aplicatiei (vezi
  // DEAD_STATUSES/isLive in pms-app.jsx) — feedul trebuie sa fie consistent,
  // altfel Booking/Airbnb tin camera blocata dupa un no-show.
  const { data: rows, error: resErr } = await supabase
    .from("reservations")
    .select("id, checkin, checkout, status, source, external_uid")
    .eq("room_id", room.id)
    .not("status", "in", "(cancelled,noshow)")
    .gte("checkout", oneDayAgo);
  if (resErr) return new Response("Server error", { status: 500 });

  const now = toICSDate(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//La Livada PMS//RO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape("La Livada " + room.name)}`,
  ];

  for (const r of (rows as any[]) ?? []) {
    const uid = r.external_uid || `${r.id}@lalivada-pms`;
    const label = r.source === "blocaj" ? "Indisponibil" : "Ocupat";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(uid)}`,
      `DTSTAMP:${now}`,
      `DTSTART:${toICSDate(r.checkin)}`,
      `DTEND:${toICSDate(r.checkout)}`,
      `SUMMARY:${icsEscape(label)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
});
