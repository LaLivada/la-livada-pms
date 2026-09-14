/* Insigna cu sursa rezervarii, pe coltul din stanga-sus al barei din
 * calendar (dupa modelul primit pe 14 septembrie 2026): de unde a venit
 * rezervarea se vede fara sa deschizi fisa. Pictograme pentru sursele
 * generice; litera pentru Booking.com si Airbnb, in culoarea lor, fara
 * sigle. O sursa necunoscuta nu are insigna, nu una goala.
 */
import React from "react";
import { Phone, Footprints, Globe, Building2, Briefcase } from "lucide-react";
import { sourceLabel } from "../../lib/constante.js";

const PICTOGRAME = { direct: Building2, phone: Phone, walkin: Footprints, site: Globe, other: Briefcase };
const LITERE = { booking: "B", airbnb: "A" };

export function InsignaSursa({ sursa }) {
  const litera = LITERE[sursa];
  const Pictograma = PICTOGRAME[sursa];
  if (!litera && !Pictograma) return null;
  return (
    <span className={"bar-sursa bar-sursa-" + sursa} role="img" aria-label={sourceLabel(sursa)} title={sourceLabel(sursa)}>
      {litera || <Pictograma size={9} strokeWidth={2.5} aria-hidden="true" />}
    </span>
  );
}
