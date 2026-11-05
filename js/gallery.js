/*  Photo gallery lightbox — Perry Brothers Equipment  */
(function () {
  var current = 0;
  var images = [];
  var overlay, mainImg, counter, thumbStrip;

  function build() {
    overlay = document.createElement("div");
    overlay.id = "gallery-lb";
    overlay.innerHTML =
      '<div class="gl-wrap">' +
        '<button class="gl-close" aria-label="Close">&times;</button>' +
        '<button class="gl-arrow gl-prev" aria-label="Previous">&#10094;</button>' +
        '<img class="gl-img" alt="">' +
        '<button class="gl-arrow gl-next" aria-label="Next">&#10095;</button>' +
        '<div class="gl-counter"></div>' +
        '<div class="gl-thumbs"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    mainImg = overlay.querySelector(".gl-img");
    counter = overlay.querySelector(".gl-counter");
    thumbStrip = overlay.querySelector(".gl-thumbs");

    overlay.querySelector(".gl-close").onclick = close;
    overlay.querySelector(".gl-prev").onclick = function () { go(current - 1); };
    overlay.querySelector(".gl-next").onclick = function () { go(current + 1); };
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function (e) {
      if (!overlay.classList.contains("gl-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") go(current - 1);
      if (e.key === "ArrowRight") go(current + 1);
    });

    /* swipe support for mobile */
    var touchStartX = 0;
    mainImg.addEventListener("touchstart", function (e) { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    mainImg.addEventListener("touchend", function (e) {
      var diff = e.changedTouches[0].screenX - touchStartX;
      if (Math.abs(diff) > 50) { diff > 0 ? go(current - 1) : go(current + 1); }
    }, { passive: true });
  }

  function go(idx) {
    if (idx < 0) idx = images.length - 1;
    if (idx >= images.length) idx = 0;
    current = idx;
    mainImg.src = images[idx];
    counter.textContent = (idx + 1) + " / " + images.length;
    var thumbs = thumbStrip.querySelectorAll(".gl-thumb");
    for (var i = 0; i < thumbs.length; i++) {
      thumbs[i].classList.toggle("gl-thumb-active", i === idx);
    }
    /* scroll active thumb into view */
    if (thumbs[idx]) thumbs[idx].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function open(srcs, startIdx) {
    if (!overlay) build();
    images = srcs;
    current = startIdx || 0;

    /* build thumb strip */
    thumbStrip.innerHTML = "";
    for (var i = 0; i < images.length; i++) {
      var t = document.createElement("img");
      t.className = "gl-thumb";
      t.src = images[i].replace(/\/(\d+\.jpg)$/, "/thumb/$1");
      t.dataset.idx = i;
      t.onclick = function () { go(parseInt(this.dataset.idx)); };
      thumbStrip.appendChild(t);
    }

    go(current);
    overlay.classList.add("gl-open");
    document.body.style.overflow = "hidden";
  }

  function close() {
    overlay.classList.remove("gl-open");
    document.body.style.overflow = "";
  }

  /* expose globally */
  window.PBEGallery = { open: open };

  /* auto-wire: clicking any .eq-gallery-img or .eq-thumb opens lightbox */
  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-gallery]");
    if (!trigger) return;
    var card = trigger.closest(".eq-card") || trigger.closest(".pbe-top-seller-card");
    if (!card) return;
    var allSrcs = [];
    var imgs = card.querySelectorAll("[data-gallery]");
    for (var i = 0; i < imgs.length; i++) {
      allSrcs.push(imgs[i].dataset.gallery);
    }
    var idx = parseInt(trigger.dataset.galleryIdx || "0");
    open(allSrcs, idx);
  });
})();
