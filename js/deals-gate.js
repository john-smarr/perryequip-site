/*  Deals zip-code gate — Perry Brothers Equipment  */
(function () {
  var TERRITORY = [
    "304","310","313","314","315","316","317","398",
    "360","363","364","365","366",
    "323","324","325"
  ];
  var STORAGE_KEY = "pbe_deals_ok";

  /* If already verified this session, skip the gate */
  function isVerified() {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  }

  function checkZip(zip) {
    zip = zip.replace(/\s/g, "");
    if (!/^\d{5}$/.test(zip)) return null;        /* invalid */
    return TERRITORY.indexOf(zip.substring(0, 3)) !== -1;
  }

  /* ---- modal markup ---- */
  function buildModal() {
    var overlay = document.createElement("div");
    overlay.id = "deals-gate";
    overlay.innerHTML =
      '<div class="dg-box">' +
        '<button class="dg-close" aria-label="Close">&times;</button>' +
        '<div class="dg-icon">&#128205;</div>' +
        '<h2 class="dg-title">Check Availability</h2>' +
        '<p class="dg-sub">Enter your zip code to see if deals are available in your area.</p>' +
        '<input id="dg-zip" class="dg-input" type="text" inputmode="numeric" maxlength="5" placeholder="Zip code" autocomplete="postal-code">' +
        '<button id="dg-submit" class="dg-btn">View Deals</button>' +
        '<p id="dg-err" class="dg-err"></p>' +
      '</div>';
    document.body.appendChild(overlay);

    /* events */
    overlay.querySelector(".dg-close").onclick = closeModal;
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    document.getElementById("dg-submit").onclick = submit;
    document.getElementById("dg-zip").addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  function openModal() {
    var m = document.getElementById("deals-gate");
    if (!m) { buildModal(); m = document.getElementById("deals-gate"); }
    m.classList.add("dg-open");
    document.getElementById("dg-zip").value = "";
    document.getElementById("dg-err").textContent = "";
    document.getElementById("dg-zip").focus();
  }

  function closeModal() {
    var m = document.getElementById("deals-gate");
    if (m) m.classList.remove("dg-open");
  }

  function submit() {
    var zip = document.getElementById("dg-zip").value;
    var result = checkZip(zip);
    var err = document.getElementById("dg-err");
    if (result === null) { err.textContent = "Please enter a valid 5-digit zip code."; return; }
    if (result) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      window.location.href = "/deals/";
    } else {
      err.innerHTML = "Sorry, deals are not available in your area.<br>Give us a call — we may still be able to help!";
    }
  }

  /* ---- intercept clicks ---- */
  document.addEventListener("click", function (e) {
    var link = e.target.closest("a[href*='/deals']");
    if (!link) return;
    if (isVerified()) return;          /* let them through */
    e.preventDefault();
    openModal();
  });
})();
