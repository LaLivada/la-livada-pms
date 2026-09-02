/* Comportamentul panoului de meniu, portat din SiteHeader.tsx.
 *
 * Aici nu există React și nici rute — pagina e una singură — deci ce s-a
 * mutat e doar partea mecanică: deschide/închide panoul, o singură grupă
 * desfăcută odată, Escape închide, iar cât panoul e deschis pagina de
 * dedesubt nu se mai derulează cu el.
 *
 * Deasupra breakpoint-ului de 1080px butonul și panoul sunt `display:none`
 * din CSS, deci scriptul nu are ce bloca acolo — n-a mai fost nevoie de o
 * verificare explicită de lățime, ca în original.
 */
(function () {
  var header = document.querySelector(".ldv-hdr");
  var toggle = document.querySelector(".ldv-hdr-toggle");
  var panel = document.querySelector(".ldv-hdr-panel");
  if (!header || !toggle || !panel) return;

  var groups = Array.prototype.slice.call(panel.querySelectorAll(".ldv-hdr-group[data-open]"));

  function setOpen(open) {
    header.dataset.open = open ? "true" : "false";
    panel.dataset.open = open ? "true" : "false";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) groups.forEach(function (g) { g.dataset.open = "false"; });
  }

  toggle.addEventListener("click", function () {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") setOpen(false);
  });

  // O singură grupă desfăcută odată: două deodată împing restul cuprinsului
  // sub marginea ecranului.
  groups.forEach(function (group) {
    var head = group.querySelector(".ldv-hdr-group-head");
    if (!head) return;
    head.addEventListener("click", function () {
      var willOpen = group.dataset.open !== "true";
      groups.forEach(function (g) { g.dataset.open = "false"; });
      head.setAttribute("aria-expanded", willOpen ? "true" : "false");
      group.dataset.open = willOpen ? "true" : "false";
    });
  });

  // Orice link din panou închide meniul — inclusiv CTA-ul spre `#rezervari`,
  // care rămâne pe pagină în loc să navigheze și n-ar închide panoul singur.
  panel.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () { setOpen(false); });
  });

  // Bara peste fotografie: transparentă cât capul de pagină (cât tot
  // ecranul) e sub ea, solidă după — pragul e înălțimea fotografiei minus
  // înălțimea barei, ca în SiteHeader.tsx. Fără capul de pagină pe ecran
  // (n-ar trebui să se întâmple aici), rămâne mereu solidă.
  var phead = document.querySelector(".ldv-phead");
  if (phead) {
    var gate = Math.max(0, phead.offsetHeight - header.offsetHeight);
    var onScroll = function () {
      header.dataset.film = window.scrollY <= gate ? "true" : "false";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
