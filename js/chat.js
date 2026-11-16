/* Perry Brothers Equipment — Chat Orchestrator
   Loads Tawk.to for live chat; falls back to AI chatbot when agents are offline.
   Tawk.to widget is HIDDEN by default and only shown when agents are online. */
(function () {
  /* ── Configuration ── */
  var TAWKTO_PROPERTY_ID = "6af5ff0bd30fa33c3df15025";
  var TAWKTO_WIDGET_ID = "1k78eohsm";

  var AGENT_TIMEOUT_MS = 60000; /* 1 minute for an agent to join */

  var aiChatLoaded = false;
  var tawkReady = false;
  var currentMode = null; /* "tawk" or "ai" */
  var agentJoined = false;
  var waitTimer = null;

  /* ── Load Tawk.to ── */
  function loadTawk() {
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    /* IMPORTANT: Start with Tawk.to widget hidden so its offline form never shows.
       We only reveal it if agents are actually online. */
    window.Tawk_API.onBeforeLoad = function () {
      window.Tawk_API.hideWidget();
    };

    /* When Tawk.to is fully loaded, check agent status */
    window.Tawk_API.onLoad = function () {
      tawkReady = true;
      checkStatus();
    };

    /* When agent status changes (online/away/offline) */
    window.Tawk_API.onStatusChange = function (status) {
      if (status === "online") {
        showTawk();
      } else {
        showAIChat();
      }
    };

    /* Visitor sent first message — start the 1-minute countdown */
    window.Tawk_API.onChatStarted = function () {
      if (!agentJoined && !waitTimer) {
        waitTimer = setTimeout(function () {
          if (!agentJoined) {
            try { window.Tawk_API.endChat(); } catch (e) {}
            showAIChat();
          }
        }, AGENT_TIMEOUT_MS);
      }
    };

    /* An agent joined — cancel the timeout */
    window.Tawk_API.onAgentJoinChat = function () {
      agentJoined = true;
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
    };

    /* When a live chat ends, reset state and re-check status */
    window.Tawk_API.onChatEnded = function () {
      agentJoined = false;
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
      checkStatus();
    };

    /* Inject Tawk.to script */
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://embed.tawk.to/" + TAWKTO_PROPERTY_ID + "/" + TAWKTO_WIDGET_ID;
    s.charset = "UTF-8";
    s.setAttribute("crossorigin", "*");
    document.head.appendChild(s);
  }

  /* ── Status check ── */
  function checkStatus() {
    if (!tawkReady) return;
    try {
      var status = window.Tawk_API.getStatus();
      if (status === "online") {
        showTawk();
      } else {
        showAIChat();
      }
    } catch (e) {
      showAIChat();
    }
  }

  /* ── Show Tawk.to, hide AI chatbot ── */
  function showTawk() {
    if (currentMode === "tawk") return;
    currentMode = "tawk";
    try { window.Tawk_API.showWidget(); } catch (e) {}
    var aiWidget = document.getElementById("pbe-chat");
    if (aiWidget) aiWidget.style.display = "none";
  }

  /* ── Show AI chatbot, hide Tawk.to ── */
  function showAIChat() {
    if (currentMode === "ai") return;
    currentMode = "ai";
    try { window.Tawk_API.hideWidget(); } catch (e) {}
    if (!aiChatLoaded) {
      loadAIChatbot();
      aiChatLoaded = true;
    }
    var aiWidget = document.getElementById("pbe-chat");
    if (aiWidget) aiWidget.style.display = "block";
  }

  /* ── Dynamically load the AI chatbot script ── */
  function loadAIChatbot() {
    var s = document.createElement("script");
    s.src = "/js/chatbot.js";
    document.body.appendChild(s);
  }

  /* ── Init ── */
  function init() {
    if (TAWKTO_PROPERTY_ID === "REPLACE_WITH_YOUR_TAWKTO_PROPERTY_ID") {
      loadAIChatbot();
      aiChatLoaded = true;
      return;
    }
    loadTawk();
    /* If Tawk.to takes too long, fall back to AI chatbot */
    setTimeout(function () {
      if (!tawkReady) {
        showAIChat();
      }
    }, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
