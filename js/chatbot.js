/* Perry Brothers Equipment — Sales Lead Chatbot */
(function () {
  var steps = [
    { msg: "Hey there! I'm here to help you get a quote on equipment. What's your first name?", field: "first_name" },
    { msg: "Nice to meet you, {first_name}! What's your last name?", field: "last_name" },
    { msg: "What's the best phone number to reach you at?", field: "phone", type: "tel" },
    { msg: "And your email address?", field: "email", type: "email" },
    { msg: "What machine are you interested in?", field: "machine", type: "select", options: [
      "SY16C Mini Excavator",
      "SY26U Compact Excavator",
      "SY35U Compact Excavator",
      "SY50U Mini Excavator",
      "SY60C Compact Excavator",
      "SY75C Small Excavator",
      "SY80U Small Excavator",
      "SY95C Small Excavator",
      "SY135C Small Excavator",
      "SY155U Small Excavator",
      "SY215C Medium Excavator",
      "SY265C Medium Excavator",
      "SY335C Medium Excavator",
      "SY365C Large Excavator",
      "SY500H Large Excavator",
      "SY750H Large Excavator",
      "SMG200C-8 Motor Grader",
      "SW305K Wheel Loader",
      "SW405K Wheel Loader",
      "SSR80 Roller",
      "STH1056A Telehandler",
      "STH1256A Telehandler",
      "SLB95 Backhoe",
      "ST230V Compact Track Loader",
      "Not sure yet"
    ]},
    { msg: "Are you looking to buy or rent?", field: "intent", type: "select", options: ["Purchase", "Rental", "Not sure yet"] },
    { msg: "What's your timeline?", field: "timeline", type: "select", options: ["Ready now", "Within 30 days", "1-3 months", "Just researching"] },
    { msg: "Any additional details or questions you'd like to include?", field: "message", optional: true }
  ];

  var current = 0;
  var data = {};
  var container, messages, inputArea, widget, bubble;

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
          '<input type="text" placeholder="Type your answer..." autocomplete="off">' +
          '<button class="pbe-chat-send" aria-label="Send">&#10148;</button>' +
        '</div>' +
      '</div>' +
      '<button class="pbe-chat-bubble" aria-label="Chat with us">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '</button>';
    document.body.appendChild(widget);

    container = widget.querySelector(".pbe-chat-box");
    messages = widget.querySelector(".pbe-chat-messages");
    inputArea = widget.querySelector(".pbe-chat-input");
    bubble = widget.querySelector(".pbe-chat-bubble");

    var opened = false;
    bubble.onclick = function () {
      container.style.display = "flex";
      bubble.style.display = "none";
      if (!opened) { showStep(); opened = true; }
    };
    widget.querySelector(".pbe-chat-close").onclick = function () {
      container.style.display = "none";
      bubble.style.display = "flex";
    };

    var input = inputArea.querySelector("input");
    var sendBtn = widget.querySelector(".pbe-chat-send");
    sendBtn.onclick = function () { submitAnswer(); };
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submitAnswer();
    });
  }

  function addMessage(text, from) {
    var div = document.createElement("div");
    div.className = "pbe-chat-msg pbe-chat-" + from;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function fillTemplate(str) {
    return str.replace(/\{(\w+)\}/g, function (_, key) { return data[key] || ""; });
  }

  function showStep() {
    var step = steps[current];
    addMessage(fillTemplate(step.msg), "bot");

    if (step.type === "select") {
      showOptions(step.options, step.optional);
    } else {
      showTextInput(step.type || "text", step.optional);
    }
  }

  function showOptions(options, optional) {
    inputArea.style.display = "none";
    var wrap = document.createElement("div");
    wrap.className = "pbe-chat-options";
    for (var i = 0; i < options.length; i++) {
      var btn = document.createElement("button");
      btn.className = "pbe-chat-option";
      btn.textContent = options[i];
      btn.onclick = (function (val) {
        return function () {
          addMessage(val, "user");
          data[steps[current].field] = val;
          wrap.remove();
          inputArea.style.display = "flex";
          current++;
          next();
        };
      })(options[i]);
      wrap.appendChild(btn);
    }
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTextInput(type, optional) {
    var input = inputArea.querySelector("input");
    input.type = type;
    input.value = "";
    input.placeholder = optional ? "Type here or press Enter to skip..." : "Type your answer...";
    inputArea.style.display = "flex";
    input.focus();
  }

  function submitAnswer() {
    var input = inputArea.querySelector("input");
    var val = input.value.trim();
    var step = steps[current];

    if (!val && !step.optional) return;

    if (val) {
      if (step.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        addMessage("Please enter a valid email address.", "bot");
        return;
      }
      if (step.type === "tel" && val.replace(/\D/g, "").length < 7) {
        addMessage("Please enter a valid phone number.", "bot");
        return;
      }
    }

    addMessage(val || "(skipped)", "user");
    data[step.field] = val || "";
    input.value = "";
    current++;
    next();
  }

  function next() {
    if (current < steps.length) {
      setTimeout(showStep, 400);
    } else {
      sendLead();
    }
  }

  function sendLead() {
    addMessage("Thanks, " + data.first_name + "! Let me send this to our team. One moment...", "bot");
    inputArea.style.display = "none";

    var form = new FormData();
    for (var key in data) {
      form.append(key, data[key]);
    }
    form.append("interest", data.intent === "Rental" ? "Equipment Rental" : "New Equipment Purchase");
    form.append("source", "chatbot");

    /* Get reCAPTCHA token if available */
    if (typeof grecaptcha !== "undefined") {
      grecaptcha.ready(function () {
        grecaptcha.execute("6LcLRRguAAAAAH6s6xE1CYlkVv6KsYYeyVbR8bgX", { action: "chatbot" }).then(function (token) {
          form.append("g-recaptcha-response", token);
          doSend(form);
        });
      });
    } else {
      doSend(form);
    }
  }

  function doSend(form) {
    fetch("https://raspy-cell-4751.lance-74b.workers.dev", {
      method: "POST",
      body: form
    }).then(function (res) {
      if (res.ok) {
        addMessage("All set! Our team will reach out to you shortly. You can also call us anytime at (229) 924-0035.", "bot");
      } else {
        addMessage("Something went wrong. Please call us at (229) 924-0035 and we'll help you right away.", "bot");
      }
    }).catch(function () {
      addMessage("Something went wrong. Please call us at (229) 924-0035 and we'll help you right away.", "bot");
    });
  }

  /* Auto-fill machine from URL */
  function init() {
    build();
    var params = new URLSearchParams(window.location.search);
    var machine = params.get("machine");
    if (machine) data.machine_prefill = machine;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
