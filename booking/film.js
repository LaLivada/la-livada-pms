/* Filmul de fundal al capului de pagină — port vanilla-JS al
 * components/FilmDeFundal.tsx, cuvânt cu cuvânt în ce privește logica, nu
 * doar aspectul.
 *
 * Comentariul de-acolo e explicit: „a doua pagină cu film ar fi primit
 * altfel o variantă mai simplă a aceleiaşi logici, iar «mai simplă»
 * înseamnă aici exact bug-ul de autoplay pe iPhone care a costat atâta
 * lucru să fie prins." Nu există un port simplificat aici — aceleaşi
 * praguri, aceleaşi plase de siguranţă, aceleaşi reîncercări. Ce diferă e
 * doar mecanismul de re-randare (React vs. un singur `<video>` static) și
 * faptul că nu există decât un singur film pe pagină, deci fără `id`
 * parametrizat.
 */
(function () {
  var PORTRAIT_QUERY = "(max-width: 700px), (orientation: portrait)";

  var video = document.getElementById("ldv-film");
  if (!video || video.dataset.still === "true") return;

  var lat = { video: video.dataset.videoLandscape, poster: video.dataset.posterLandscape };
  var portret = { video: video.dataset.videoPortrait || lat.video, poster: video.dataset.posterPortrait || lat.poster };

  var inEcran = true;
  var rejection = "—";
  var running = false;
  var pending = false;
  var pendingTimer = 0;

  function startPlayback() {
    if (!video || video.dataset.still === "true") return;
    if (!inEcran || document.hidden) return;
    if (pending) return;
    if (!video.paused && video.readyState >= 2) return;
    if (video.readyState === 0 && video.getAttribute("src")) video.load();

    video.muted = true;
    var started = video.play();
    if (!started || typeof started.catch !== "function") return;

    pending = true;
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(function () { pending = false; }, 1500);

    function done() {
      window.clearTimeout(pendingTimer);
      pending = false;
    }
    started.then(function () {
      done();
      running = true;
    }).catch(function (err) {
      done();
      rejection = err ? err.name + ": " + err.message : "necunoscut";
    });
  }

  function syncPlayback() {
    if (!video || video.dataset.still === "true") return;
    if (inEcran && !document.hidden) startPlayback();
    else if (!video.paused) video.pause();
  }

  // ── Sursa se reevaluează la rotirea telefonului ──
  var query = window.matchMedia(PORTRAIT_QUERY);
  function applySource(isPortrait) {
    var next = isPortrait ? portret : lat;
    if (!video.currentSrc || video.currentSrc.indexOf(next.video) !== -1) return;

    var resumeAt = video.currentTime;
    var wasPlaying = !video.paused;

    video.poster = next.poster;
    video.src = next.video;

    function onceLoaded() {
      video.removeEventListener("loadedmetadata", onceLoaded);
      if (resumeAt > 0 && resumeAt < video.duration) video.currentTime = resumeAt;
      if (wasPlaying || !running) startPlayback();
    }
    video.addEventListener("loadedmetadata", onceLoaded);
  }
  query.addEventListener("change", function (e) { applySource(e.matches); });

  // ── Pornire, oprire la ieșirea din ecran, reîncercări ──
  var cutie = video.parentElement || video;

  var praguri = ["loadedmetadata", "loadeddata", "canplay", "canplaythrough", "suspend"];
  praguri.forEach(function (evt) { video.addEventListener(evt, startPlayback); });

  video.addEventListener("pause", function () {
    if (inEcran && !document.hidden) startPlayback();
  });
  video.addEventListener("playing", function () { running = true; });

  document.addEventListener("visibilitychange", syncPlayback);

  var observer = new IntersectionObserver(function (entries) {
    inEcran = entries[0].isIntersecting;
    syncPlayback();
  }, { threshold: 0.15 });
  observer.observe(cutie);

  [200, 900, 2400, 5500].forEach(function (ms) {
    window.setTimeout(function () {
      if (!running) startPlayback();
    }, ms);
  });

  var gestures = ["pointerdown", "touchend", "keydown"];
  function rescue() {
    if (running) {
      gestures.forEach(function (evt) { document.removeEventListener(evt, rescue); });
      return;
    }
    startPlayback();
  }
  gestures.forEach(function (evt) { document.addEventListener(evt, rescue, { passive: true }); });

  // Panou de stare, pornit cu ?debug=1 la sfârșitul adresei — util fiindcă
  // autoplay-ul de pe iPhone nu se poate reproduce pe desktop.
  if (window.location.search.indexOf("debug=1") !== -1) {
    var pre = document.createElement("pre");
    pre.style.cssText = "position:fixed;left:0;top:0;z-index:99;margin:0;padding:8px;" +
      "font:11px/1.45 ui-monospace,monospace;color:#7CFF9B;background:rgba(0,0,0,.88);" +
      "max-width:100%;white-space:pre-wrap;pointer-events:none;";
    document.body.appendChild(pre);
    window.setInterval(function () {
      pre.textContent = [
        "sursă      " + (video.currentSrc || "—").split("/").pop(),
        "pornit     " + (video.paused ? "NU (pauză)" : "DA"),
        "mut        " + video.muted,
        "readyState " + video.readyState + "  network " + video.networkState,
        "timp       " + video.currentTime.toFixed(1) + "s / " + (video.duration || 0).toFixed(1) + "s",
        "refuz play " + rejection,
        "eroare     " + (video.error ? "cod " + video.error.code : "—"),
        "filă ascunsă " + document.hidden,
      ].join("\n");
    }, 400);
  }
})();
