/* Perry Brothers Equipment — Chat Widget
   Real-time chat with live agents + AI fallback via Cloudflare Worker + KV.
   Polls for new messages every 3 seconds. */
(function () {
  /* ── Configuration ── */
  var API_BASE = "https://raspy-cell-4751.lance-74b.workers.dev";
  var RECAPTCHA_KEY = "6LcLRRguAAAAAH6s6xE1CYlkVv6KsYYeyVbR8bgX";
  var SESSION_KEY = "pbe_chat_session";
  var POLL_MS = 1000;

  var container, messages, inputArea, widget, bubble, input, sendBtn;
  var chatId = null;
  var chatMode = null; /* "waiting", "agent", "ai" */
  var pollInterval = null;
  var lastPollTs = 0;
  var agentTimer = null; /* client-side timeout for AI fallback */
  var conversation = []; /* local copy for display */
  var leadData = {};
  var leadMode = false;
  var leadStep = 0;
  var opened = false;
  var logSent = false;

  var leadSteps = [
    { msg: "Great! What's your first name?", field: "first_name", type: "text" },
    { msg: "And your last name?", field: "last_name", type: "text" },
    { msg: "What's the best phone number to reach you?", field: "phone", type: "tel" },
    { msg: "And your email address?", field: "email", type: "email" }
  ];

  /* ── Offline knowledge base (used when API is unreachable) ── */
  var kb = {
    hours: "We're open Monday through Friday, 8am to 5pm at both locations.",
    locations: "We have two locations:\n• Americus, GA — 523 US Highway 280 E — (229) 924-0035\n• Loxley, AL — 3825 S Hickory St — (251) 651-7269\nMontgomery, AL and Panama City, FL coming soon!",
    phone: "You can reach us at (229) 924-0035 (Americus) or (251) 651-7269 (Loxley). Email: sales@perryequip.com",
    contact: "You can reach us at (229) 924-0035 (Americus) or (251) 651-7269 (Loxley). Email: sales@perryequip.com",
    service: "We service anything with a diesel engine! Our services include AC work, engine repair, hydraulics, electrical, undercarriage, paint & glass, and DEF systems. We also have mobile service trucks for on-site repairs.",
    warranty: "SANY equipment comes with an industry-leading bumper-to-bumper warranty (except wearable items). Small excavators get 5 years / 5,000 hours, and skid steers get 3 years / 3,000 hours. Warranty covers drive time up to 300 miles round trip.",
    financing: "We offer several financing options: Rental Purchase (rent now, apply payments toward ownership), In-House Leasing (flexible monthly, no long-term commitment), and traditional Financing with competitive terms.",
    rental: "We offer daily, weekly, and monthly rentals with delivery available throughout our service areas. You can reserve by phone, website, or in person. If a machine breaks down during your rental, our service team responds quickly.",
    parts: "Parts are readily available for all our equipment. SANY headquarters is just 2 hours away, so we typically get same-day or next-day delivery.",
    demo: "We offer free machine demos! We can bring the equipment right to your location so you can try it out on your actual job site.",
    equipment: "We carry the full SANY lineup: mini & compact excavators, small/medium/large excavators, motor graders, wheel loaders, machine rollers, telehandlers, backhoes, and compact track loaders. Want details on a specific machine?",
    excavator: "Our excavator lineup includes:\n• Mini/Compact: SY16C, SY26U, SY35U, SY50U, SY60C\n• Small: SY75C, SY80U, SY95C, SY135C, SY155U\n• Medium: SY215C, SY225C, SY265C, SY335C\n• Large: SY365C, SY500H, SY750H",
    about: "Perry Brothers Equipment is a family-owned business serving since 1991. We're an authorized SANY dealer serving contractors, farms, and crews across South Georgia, Alabama, and the Southeast."
  };

  var kbPatterns = [
    { pattern: /hour|open|close|when/i, key: "hours" },
    { pattern: /where|location|address|direction|find you|americus|loxley/i, key: "locations" },
    { pattern: /phone|call|number|email|reach/i, key: "contact" },
    { pattern: /service|repair|fix|broke|maintenance|mechanic/i, key: "service" },
    { pattern: /warrant/i, key: "warranty" },
    { pattern: /financ|lease|payment|afford|credit|loan/i, key: "financing" },
    { pattern: /rent/i, key: "rental" },
    { pattern: /part|order/i, key: "parts" },
    { pattern: /demo|try|test drive/i, key: "demo" },
    { pattern: /excavat|digger|mini ex/i, key: "excavator" },
    { pattern: /what.*carry|what.*sell|equipment|machine|inventory|lineup/i, key: "equipment" },
    { pattern: /who|about|history|family|company/i, key: "about" }
  ];

  function offlineReply(userMsg) {
    for (var i = 0; i < kbPatterns.length; i++) {
      if (kbPatterns[i].pattern.test(userMsg)) {
        return kb[kbPatterns[i].key];
      }
    }
    return "I can help with questions about our equipment, services, rentals, locations, hours, warranty, financing, and more. Or call us at (229) 924-0035!";
  }

  /* ── Page context detection ── */
  function getPageContext() {
    var path = window.location.pathname.replace(/\/+$/, "") || "/";
    var parts = path.split("/").filter(Boolean);

    if (path === "/" || path === "") return "Visitor is on the homepage.";
    if (path === "/contact") return "Visitor is on the Contact page.";
    if (path === "/locations") return "Visitor is on the Locations page.";
    if (path === "/service") return "Visitor is on the Service page.";
    if (path === "/rentals") return "Visitor is on the Rentals page.";
    if (path === "/about") return "Visitor is on the About page.";
    if (path === "/media") return "Visitor is on the Media/Gallery page.";
    if (path === "/deals") return "Visitor is on the Deals & Pricing page.";

    if (parts[0] === "sales" && parts.length === 2) {
      var category = parts[1].replace(/-/g, " ");
      return "Visitor is browsing the " + category + " category page.";
    }
    if (parts[0] === "sales" && parts.length === 3) {
      var model = parts[2].toUpperCase();
      var cat = parts[1].replace(/-/g, " ");
      return "Visitor is viewing the SANY " + model + " product page (" + cat + ").";
    }
    return "Visitor is browsing the website.";
  }

  function getMachineFromPage() {
    var parts = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts[0] === "sales" && parts.length === 3) {
      return parts[2].toUpperCase();
    }
    return null;
  }

  /* ── Session persistence ── */
  function saveSession() {
    try {
      var data = {
        chatId: chatId,
        chatMode: chatMode,
        conversation: conversation,
        leadData: leadData,
        leadMode: leadMode,
        leadStep: leadStep,
        lastPollTs: lastPollTs,
        ts: Date.now()
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (Date.now() - data.ts > 30 * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY);
        return false;
      }
      chatId = data.chatId || null;
      chatMode = data.chatMode || null;
      conversation = data.conversation || [];
      leadData = data.leadData || {};
      leadMode = data.leadMode || false;
      leadStep = data.leadStep || 0;
      lastPollTs = data.lastPollTs || 0;
      return chatId !== null;
    } catch (e) { return false; }
  }

  function restoreMessages() {
    addMessage("Hey there! How can we help you today?", "bot", true);
    for (var i = 0; i < conversation.length; i++) {
      var m = conversation[i];
      var from = m.role === "visitor" ? "user" : "bot";
      addMessage(m.content, from, true);
    }
    if (leadMode && leadStep < leadSteps.length) {
      addMessage(leadSteps[leadStep].msg, "bot", true);
      input.type = leadSteps[leadStep].type;
    }
  }

  /* ── Build UI ── */
  function build() {
    widget = document.createElement("div");
    widget.id = "pbe-chat";
    widget.innerHTML =
      '<div class="pbe-chat-box" style="display:none;">' +
        '<div class="pbe-chat-header">' +
          '<span>Perry Brothers Equipment</span>' +
          '<button class="pbe-chat-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="pbe-chat-messages"></div>' +
        '<div class="pbe-chat-input">' +
          '<input type="text" placeholder="Type your message..." autocomplete="off">' +
          '<button class="pbe-chat-send" aria-label="Send">&#10148;</button>' +
        '</div>' +
      '</div>' +
      '<div class="pbe-chat-launcher">' +
        '<img class="pbe-chat-avatar" src="/images/chat-avatar.png" alt="Chat with us">' +
        '<button class="pbe-chat-bubble" aria-label="Chat with us">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
          '<span class="pbe-chat-badge"></span>' +
        '</button>' +
      '</div>';
    document.body.appendChild(widget);

    container = widget.querySelector(".pbe-chat-box");
    messages = widget.querySelector(".pbe-chat-messages");
    inputArea = widget.querySelector(".pbe-chat-input");
    bubble = widget.querySelector(".pbe-chat-bubble");
    var launcher = widget.querySelector(".pbe-chat-launcher");
    input = inputArea.querySelector("input");
    sendBtn = widget.querySelector(".pbe-chat-send");

    var hasSession = loadSession();

    launcher.onclick = function () {
      container.style.display = "flex";
      launcher.style.display = "none";
      if (!opened) {
        opened = true;
        if (hasSession) {
          restoreMessages();
          /* Resume polling if we have an active chat */
          if (chatId && chatMode !== "closed") {
            startPolling();
          }
        } else {
          addMessage("Hey there! How can we help you today?", "bot");
        }
      }
      input.focus();
    };

    widget.querySelector(".pbe-chat-close").onclick = function () {
      container.style.display = "none";
      launcher.style.display = "flex";
      sendChatClose();
    };

    sendBtn.onclick = function () { handleSend(); };
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleSend();
    });

    /* Show attention badge after 3 seconds if first visit */
    if (!hasSession) {
      setTimeout(function () {
        var badge = widget.querySelector(".pbe-chat-badge");
        if (badge) badge.classList.add("pbe-chat-badge-show");
      }, 3000);
    }
  }

  /* ── Dedup: add server messages to conversation + display, skipping duplicates ── */
  function addServerMessages(msgs) {
    var added = false;
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (m.role === "visitor") { lastPollTs = Math.max(lastPollTs, m.ts); continue; }
      var isDupe = false;
      for (var j = 0; j < conversation.length; j++) {
        if (conversation[j].ts === m.ts && conversation[j].role === m.role) {
          isDupe = true;
          break;
        }
      }
      if (!isDupe) {
        if (!added) { removeTyping(); added = true; }
        conversation.push(m);
        addMessage(m.content, "bot");
      }
      lastPollTs = Math.max(lastPollTs, m.ts);
    }
    if (added) saveSession();
    return added;
  }

  /* ── Message display ── */
  function formatMessage(text) {
    /* Simple markdown: **bold**, *italic*, newlines */
    var escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/\*(.+?)\*/g, "<em>$1</em>");
    escaped = escaped.replace(/\n/g, "<br>");
    return escaped;
  }

  function addMessage(text, from, silent) {
    var div = document.createElement("div");
    div.className = "pbe-chat-msg pbe-chat-" + from;
    if (silent) div.style.animation = "none";
    div.innerHTML = formatMessage(text);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function showTyping() {
    var div = document.createElement("div");
    div.className = "pbe-chat-msg pbe-chat-bot pbe-chat-typing";
    div.innerHTML = '<span class="pbe-dot"></span><span class="pbe-dot"></span><span class="pbe-dot"></span>';
    div.id = "pbe-typing";
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function removeTyping() {
    var el = document.getElementById("pbe-typing");
    if (el) el.remove();
  }

  /* ── Handle user input ── */
  function handleSend() {
    var val = input.value.trim();
    if (!val) return;

    addMessage(val, "user");
    input.value = "";

    if (leadMode) {
      handleLeadInput(val);
      return;
    }

    if (!chatId) {
      /* First message — start a new chat */
      startChat(val);
    } else if (chatMode === "agent") {
      /* Live chat with agent — send and wait for poll */
      sendMessage(val);
    } else if (chatMode === "ai") {
      /* AI mode — send and get response */
      sendMessage(val);
    } else {
      /* Still waiting — queue the message */
      sendMessage(val);
    }
  }

  /* ── Start a new chat ── */
  function startChat(msg) {
    showTyping();
    sendBtn.disabled = true;
    input.disabled = true;

    fetch(API_BASE + "/api/chat/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        page: window.location.href,
        pageContext: getPageContext()
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        removeTyping();
        sendBtn.disabled = false;
        input.disabled = false;

        if (data.error) {
          addMessage("Something went wrong. Please call us at (229) 924-0035.", "bot");
          return;
        }

        chatId = data.chatId;
        chatMode = "waiting";
        conversation.push({ role: "visitor", content: msg, ts: Date.now() });
        lastPollTs = Date.now() - 1000; /* catch any messages from creation */
        saveSession();

        addMessage("Connecting you with our team — one moment!", "bot");
        showTyping(); /* show typing dots while waiting for agent */
        startPolling();
        /* Start client-side timeout — if no agent responds in 60s, trigger AI */
        agentTimer = setTimeout(triggerAITakeover, 60000);
        input.focus();
      })
      .catch(function () {
        removeTyping();
        sendBtn.disabled = false;
        input.disabled = false;
        /* Offline fallback */
        var reply = offlineReply(msg);
        addMessage(reply, "bot");
        input.focus();
      });
  }

  /* ── Send a follow-up message ── */
  function sendMessage(msg) {
    conversation.push({ role: "visitor", content: msg, ts: Date.now() });
    saveSession();

    if (chatMode === "ai") {
      showTyping();
      sendBtn.disabled = true;
      input.disabled = true;
    }

    fetch(API_BASE + "/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chatId, message: msg })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (chatMode === "ai") {
          removeTyping();
          sendBtn.disabled = false;
          input.disabled = false;
        }

        if (data.messages) addServerMessages(data.messages);
        saveSession();
        input.focus();
      })
      .catch(function () {
        if (chatMode === "ai") {
          removeTyping();
          sendBtn.disabled = false;
          input.disabled = false;
        }
        input.focus();
      });
  }

  /* ── AI takeover — triggered by client-side timer ── */
  function triggerAITakeover() {
    agentTimer = null;
    if (chatMode !== "waiting") return; /* agent already joined */

    removeTyping();

    fetch(API_BASE + "/api/chat/ai-takeover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chatId })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.alreadyHandled) return; /* agent responded between timer and request */

        chatMode = data.status || "ai";

        if (data.messages) addServerMessages(data.messages);

        if (data.leadCapture && !leadMode) {
          setTimeout(function () {
            startLeadCapture("Can I get your contact info so our team can follow up with you?");
          }, 1000);
        }

        saveSession();
      })
      .catch(function () {
        /* Offline fallback */
        addMessage("I'm sorry, no agents are available right now. Please call us at (229) 924-0035.", "bot");
      });
  }

  /* ── Polling for new messages ── */
  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(poll, POLL_MS);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function poll() {
    if (!chatId) return;

    fetch(API_BASE + "/api/chat/poll/" + chatId + "?since=" + lastPollTs)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) return;

        /* Status change — cancel AI timer if agent joined */
        if (data.status && data.status !== chatMode) {
          if (data.status === "agent" && agentTimer) {
            clearTimeout(agentTimer);
            agentTimer = null;
          }
          chatMode = data.status;
          saveSession();
        }

        /* New messages — deduped via shared helper */
        if (data.messages && data.messages.length > 0) {
          addServerMessages(data.messages);
        }

        /* Stop polling if chat is closed */
        if (data.status === "closed") {
          stopPolling();
        }
      })
      .catch(function () { /* silent fail on poll */ });
  }

  /* ── Lead capture ── */
  function startLeadCapture(intro) {
    leadMode = true;
    leadStep = 0;
    leadData = {};

    var pageMachine = getMachineFromPage();
    if (pageMachine) leadData.machine = pageMachine;

    if (intro) {
      addMessage(intro + " " + leadSteps[0].msg, "bot");
    } else {
      addMessage(leadSteps[0].msg, "bot");
    }
    input.type = leadSteps[0].type;
    input.placeholder = "Type your answer...";
    saveSession();
    input.focus();
  }

  function handleLeadInput(val) {
    var step = leadSteps[leadStep];

    if (step.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      addMessage("Please enter a valid email address.", "bot");
      return;
    }
    if (step.type === "tel" && val.replace(/\D/g, "").length < 7) {
      addMessage("Please enter a valid phone number.", "bot");
      return;
    }

    leadData[step.field] = val;
    leadStep++;
    saveSession();

    if (leadStep < leadSteps.length) {
      var nextStep = leadSteps[leadStep];
      setTimeout(function () {
        addMessage(nextStep.msg, "bot");
        input.type = nextStep.type;
        input.focus();
      }, 300);
    } else {
      submitLead();
    }
  }

  function submitLead() {
    input.type = "text";
    input.placeholder = "Type your message...";
    addMessage("Thanks, " + leadData.first_name + "! Sending this to our team...", "bot");

    /* Submit lead data to worker */
    fetch(API_BASE + "/api/chat/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: chatId,
        first_name: leadData.first_name || "",
        last_name: leadData.last_name || "",
        phone: leadData.phone || "",
        email: leadData.email || ""
      })
    })
      .then(function (res) { return res.json(); })
      .then(function () {
        addMessage("All set! Our team will reach out to you shortly. You can also call us anytime at (229) 924-0035. Feel free to keep chatting if you have more questions!", "bot");
        leadMode = false;
        saveSession();
        input.focus();
      })
      .catch(function () {
        addMessage("Something went wrong, but don't worry — call us at (229) 924-0035 and we'll help you right away.", "bot");
        leadMode = false;
        saveSession();
        input.focus();
      });
  }

  /* ── Chat close / transcript ── */
  function sendChatClose() {
    if (logSent || !chatId) return;
    logSent = true;
    fetch(API_BASE + "/api/chat/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chatId })
    }).catch(function () {});
    stopPolling();
  }

  /* ── Init ── */
  function init() {
    build();
    window.addEventListener("beforeunload", sendChatClose);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
