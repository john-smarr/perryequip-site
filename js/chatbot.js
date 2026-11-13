/* Perry Brothers Equipment — AI Chatbot (offline fallback)
   Free-form conversation powered by Claude API via Cloudflare Worker.
   Falls back to keyword-based responses when API is unavailable.
   Includes lead capture when visitor wants a quote/demo/rental. */
(function () {
  /* ── Configuration ── */
  var AI_ENDPOINT = "https://raspy-cell-4751.lance-74b.workers.dev/api/chat";
  var LEAD_ENDPOINT = "https://raspy-cell-4751.lance-74b.workers.dev";
  var RECAPTCHA_KEY = "6LcLRRguAAAAAH6s6xE1CYlkVv6KsYYeyVbR8bgX";
  var SESSION_KEY = "pbe_chat_session";

  var container, messages, inputArea, widget, bubble, input, sendBtn;
  var conversation = [];
  var leadData = {};
  var leadMode = false;
  var leadStep = 0;
  var opened = false;
  var aiAvailable = true; /* will flip to false if API fails */

  var leadSteps = [
    { msg: "Great! What's your first name?", field: "first_name", type: "text" },
    { msg: "And your last name?", field: "last_name", type: "text" },
    { msg: "What's the best phone number to reach you?", field: "phone", type: "tel" },
    { msg: "And your email address?", field: "email", type: "email" }
  ];

  /* ── Offline knowledge base (used when API is unavailable) ── */
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
    { pattern: /who|about|history|family|company/i, key: "about" },
    { pattern: /price|cost|how much|quote|pricing/i, key: "_quote" },
    { pattern: /buy|purchase|interested|looking for/i, key: "_quote" }
  ];

  function offlineReply(userMsg) {
    for (var i = 0; i < kbPatterns.length; i++) {
      if (kbPatterns[i].pattern.test(userMsg)) {
        if (kbPatterns[i].key === "_quote") {
          return { reply: "I'd need our team to get you exact pricing on that. Want me to have someone reach out to you?", action: "capture_lead" };
        }
        return { reply: kb[kbPatterns[i].key] };
      }
    }
    return { reply: "I can help with questions about our equipment, services, rentals, locations, hours, warranty, financing, and more. Or if you'd like our team to reach out, just say \"get a quote\" and I'll grab your info!" };
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

    if (parts.length === 1 && parts[0].includes("-")) {
      return "Visitor is reading a blog article.";
    }

    return "Visitor is browsing the website.";
  }

  /* Get machine model from URL if on a product page */
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
      var data = { conversation: conversation, leadData: leadData, leadMode: leadMode, leadStep: leadStep, ts: Date.now() };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      /* Expire after 30 minutes */
      if (Date.now() - data.ts > 30 * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY);
        return false;
      }
      conversation = data.conversation || [];
      leadData = data.leadData || {};
      leadMode = data.leadMode || false;
      leadStep = data.leadStep || 0;
      return conversation.length > 0;
    } catch (e) { return false; }
  }

  function restoreMessages() {
    /* Replay the greeting */
    addMessage("Hey there! Our team is away right now, but I can answer questions about our equipment, services, rentals, locations, and more. How can I help?", "bot", true);
    /* Replay conversation */
    for (var i = 0; i < conversation.length; i++) {
      addMessage(conversation[i].content, conversation[i].role === "user" ? "user" : "bot", true);
    }
    if (leadMode && leadStep < leadSteps.length) {
      addMessage(leadSteps[leadStep].msg, "bot", true);
      input.type = leadSteps[leadStep].type;
    }
    if (!leadMode) {
      addQuoteButton();
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
      '<button class="pbe-chat-bubble" aria-label="Chat with us">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        '<span class="pbe-chat-badge"></span>' +
      '</button>';
    document.body.appendChild(widget);

    container = widget.querySelector(".pbe-chat-box");
    messages = widget.querySelector(".pbe-chat-messages");
    inputArea = widget.querySelector(".pbe-chat-input");
    bubble = widget.querySelector(".pbe-chat-bubble");
    input = inputArea.querySelector("input");
    sendBtn = widget.querySelector(".pbe-chat-send");

    var hasSession = loadSession();

    bubble.onclick = function () {
      container.style.display = "flex";
      bubble.style.display = "none";
      if (!opened) {
        opened = true;
        if (hasSession) {
          restoreMessages();
        } else {
          addMessage("Hey there! Our team is away right now, but I can answer questions about our equipment, services, rentals, locations, and more. How can I help?", "bot");
          /* TODO: re-enable on Monday — addQuoteButton(); */
        }
      }
      input.focus();
    };

    widget.querySelector(".pbe-chat-close").onclick = function () {
      container.style.display = "none";
      bubble.style.display = "flex";
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

  /* ── Message display ── */
  function addMessage(text, from, silent) {
    var div = document.createElement("div");
    div.className = "pbe-chat-msg pbe-chat-" + from;
    if (silent) div.style.animation = "none";
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function addQuoteButton() {
    var wrap = document.createElement("div");
    wrap.className = "pbe-chat-actions";
    var btn = document.createElement("button");
    btn.className = "pbe-chat-quote-btn";
    btn.textContent = "Get a Quote";
    btn.onclick = function () {
      wrap.remove();
      addMessage("Get a Quote", "user");
      startLeadCapture("I'd love to help get you a quote!");
    };
    wrap.appendChild(btn);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
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
    } else {
      sendToAI(val);
    }
  }

  /* ── AI conversation ── */
  function sendToAI(userMsg) {
    conversation.push({ role: "user", content: userMsg });
    saveSession();

    /* If API has already failed, use offline mode directly */
    if (!aiAvailable) {
      handleOfflineReply(userMsg);
      return;
    }

    var typing = showTyping();
    sendBtn.disabled = true;
    input.disabled = true;

    var body = JSON.stringify({
      messages: conversation,
      pageContext: getPageContext()
    });

    fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        removeTyping();
        sendBtn.disabled = false;
        input.disabled = false;

        var reply = data.reply || "Sorry, I had trouble with that. You can always call us at (229) 924-0035.";
        addMessage(reply, "bot");
        conversation.push({ role: "assistant", content: reply });
        saveSession();

        /* TODO: re-enable lead capture on Monday
        if (data.action === "capture_lead") {
          startLeadCapture();
        }
        */

        input.focus();
      })
      .catch(function () {
        removeTyping();
        sendBtn.disabled = false;
        input.disabled = false;
        aiAvailable = false;
        /* Fall back to offline keyword matching */
        handleOfflineReply(userMsg);
      });
  }

  function handleOfflineReply(userMsg) {
    showTyping();
    setTimeout(function () {
      removeTyping();
      var result = offlineReply(userMsg);
      addMessage(result.reply, "bot");
      conversation.push({ role: "assistant", content: result.reply });
      saveSession();
      /* TODO: re-enable lead capture on Monday
      if (result.action === "capture_lead") {
        startLeadCapture();
      }
      */
      input.focus();
    }, 600);
  }

  /* ── Lead capture mode ── */
  function startLeadCapture(intro) {
    leadMode = true;
    leadStep = 0;
    leadData = {};

    /* Auto-populate machine from page URL */
    var pageMachine = getMachineFromPage();
    if (pageMachine) leadData.machine = pageMachine;

    /* Try to extract machine from conversation context */
    if (!leadData.machine) {
      var pageCtx = getPageContext();
      if (pageCtx.indexOf("SANY") !== -1) {
        var match = pageCtx.match(/SANY (\S+)/);
        if (match) leadData.machine = match[1];
      }
    }

    /* Extract intent from conversation context */
    var lastMsgs = conversation.slice(-4).map(function (m) { return m.content.toLowerCase(); }).join(" ");
    if (lastMsgs.indexOf("rent") !== -1) {
      leadData.intent = "Rental";
    } else if (lastMsgs.indexOf("buy") !== -1 || lastMsgs.indexOf("purchas") !== -1 || lastMsgs.indexOf("quote") !== -1) {
      leadData.intent = "Purchase";
    }

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
    addMessage("Thanks, " + leadData.first_name + "! Let me send this to our team...", "bot");
    inputArea.style.display = "none";

    var form = new FormData();
    form.append("first_name", leadData.first_name || "");
    form.append("last_name", leadData.last_name || "");
    form.append("phone", leadData.phone || "");
    form.append("email", leadData.email || "");
    form.append("machine", leadData.machine || "Not specified");
    form.append("intent", leadData.intent || "Not sure yet");
    form.append("timeline", "");
    form.append("message", summarizeConversation());
    form.append("interest", leadData.intent === "Rental" ? "Equipment Rental" : "New Equipment Purchase");
    form.append("source", "ai-chatbot");

    function doSubmit(formData) {
      fetch(LEAD_ENDPOINT, { method: "POST", body: formData })
        .then(function (res) {
          if (res.ok) {
            addMessage("All set! Our team will reach out to you shortly. You can also call us anytime at (229) 924-0035.", "bot");
          } else {
            addMessage("Something went wrong. Please call us at (229) 924-0035 and we'll help you right away.", "bot");
          }
          leadMode = false;
          inputArea.style.display = "flex";
          saveSession();
          input.focus();
        })
        .catch(function () {
          addMessage("Something went wrong. Please call us at (229) 924-0035 and we'll help you right away.", "bot");
          leadMode = false;
          inputArea.style.display = "flex";
          saveSession();
          input.focus();
        });
    }

    if (typeof grecaptcha !== "undefined") {
      grecaptcha.ready(function () {
        grecaptcha.execute(RECAPTCHA_KEY, { action: "chatbot" }).then(function (token) {
          form.append("g-recaptcha-response", token);
          doSubmit(form);
        });
      });
    } else {
      doSubmit(form);
    }
  }

  function summarizeConversation() {
    if (conversation.length === 0) return "";
    return conversation.map(function (m) {
      return (m.role === "user" ? "Visitor" : "Bot") + ": " + m.content;
    }).join("\n");
  }

  /* ── Init ── */
  function init() {
    build();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
