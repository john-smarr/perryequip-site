/* Perry Brothers Equipment — Chat Orchestrator
   Loads Tawk.to in background for agent monitoring.
   Custom chat widget handles all visitor interactions. */
(function () {
  var TAWKTO_PROPERTY_ID = "6af5ff0bd30fa33c3df15025";
  var TAWKTO_WIDGET_ID = "1k78eohsm";

  /* Load Tawk.to hidden — agents can still see visitors on their dashboard */
  function loadTawk() {
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_API.onBeforeLoad = function () {
      window.Tawk_API.hideWidget();
    };
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://embed.tawk.to/" + TAWKTO_PROPERTY_ID + "/" + TAWKTO_WIDGET_ID;
    s.charset = "UTF-8";
    s.setAttribute("crossorigin", "*");
    document.head.appendChild(s);
  }

  function init() {
    loadTawk();
    var s = document.createElement("script");
    s.src = "/js/chatbot.js";
    document.body.appendChild(s);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
