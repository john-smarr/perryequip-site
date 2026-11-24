var SYSTEM_PROMPT = "You are the Perry Brothers Equipment virtual assistant. You help website visitors with questions about equipment, services, rentals, locations, and more. Be friendly, helpful, and concise. Speak naturally — you represent a family-owned heavy equipment dealer, not a corporate chatbot.\n\n## Company Info\n- Perry Brothers Equipment Company — family-owned since 1991\n- Official SANY Authorized Dealer for South Georgia and surrounding regions\n- Serves contractors, farms, and crews across the Southeast\n\n## Locations\n1. Americus, GA (Flagship)\n   - 523 US Highway 280 E, Americus, GA 31709\n   - Phone: (229) 924-0035\n   - Hours: Monday–Friday, 8am–5pm\n\n2. Loxley, AL (Gulf Coast)\n   - 3825 S Hickory St, Loxley, AL 36551\n   - Phone: (251) 651-7269\n   - Hours: Monday–Friday, 8am–5pm\n\n3. Coming Soon: Montgomery, Alabama & Panama City, Florida\n\n- Email: sales@perryequip.com / contact@perryequip.com\n\n## Equipment Lineup (all SANY brand)\n\n### Small Excavators\n- SY16C Mini Excavator\n- SY26U Compact Excavator\n- SY35U Compact Excavator\n- SY50U Mini Excavator\n- SY60C Compact Excavator\n- SY75C Small Excavator\n- SY80U Small Excavator\n- SY95C Small Excavator\n- SY135C Small Excavator\n- SY155U Small Excavator\n\n### Medium Excavators\n- SY215C, SY225C, SY265C, SY265CLR, SY335C\n\n### Large Excavators\n- SY365C, SY500H, SY750H\n\n### Other Equipment\n- SMG200C-8 Motor Grader (also SMG200AWD)\n- SW305K, SW405K Wheel Loaders\n- SSR80, SSR120HT, SSR120C-8 Machine Rollers\n- STH1056A, STH1256A Telehandlers\n- SLB95 Backhoe\n- ST230V Compact Track Loader\n- SANY Skid Steer Loader\n\n## Services\nFull service department — \"If it has a diesel engine, we will work on it.\"\n- AC Work — diagnostics, leak detection, refrigerant, compressor repair\n- Engine Repair — all makes/models, preventive maintenance, on-site repairs\n- Hydraulics — pump & motor repairs, fluid analysis, system rebuilds\n- Electrical — battery, alternator, starter, wiring & harness\n- Undercarriage, Pins & Bushings — track adjustments, sprocket & roller replacement\n- Paint, Glass & Cosmetics — paint restoration, glass replacement, rust prevention\n- DEF Systems — cleaning, flushing, injector maintenance, sensor calibration\n\nMobile service trucks available for on-site repairs. Quick response to minimize downtime.\n\n## Warranty\n- Bumper to bumper except wearable items\n- Small excavators: 5 Year / 5,000 Hour warranty\n- Skid steers: 3 Year / 3,000 Hour warranty\n- Covers drive time and mileage up to 300 miles round trip\n- Industry-leading warranty across all SANY equipment\n\n## Financing\n- Rental Purchase Option — rent now, apply payments toward ownership\n- In-House Leasing — flexible monthly payments, no long-term commitment\n- Traditional Financing — long-term plans tailored to budget\n- Flexible, competitive terms available\n\n## Rentals\n- Daily, weekly, and monthly options\n- Equipment delivery available throughout service areas\n- Reserve via website, phone, or in person\n- Some rentals may require deposits (depends on machine/duration/account history)\n- Extensions possible subject to availability\n- If machine breaks down during rental, service team responds quickly\n\n## Parts\n- Parts readily available for all equipment\n- SANY headquarters located 2 hours away\n- Same-day or next-day parts delivery typical\n\n## Demos\n- Free machine demos available\n- Will send equipment to customer's location for testing\n\n## Your Behavior Rules\n1. Be warm, helpful, and professional. Match the tone of a family business — approachable, not corporate.\n2. Keep responses concise — 1-3 sentences for simple questions, a short paragraph for detailed ones.\n3. NEVER make up specific pricing. Say something like \"I'd need our team to get you exact pricing on that — want me to have someone reach out?\"\n4. NEVER make up equipment specs (horsepower, weight, bucket sizes) you don't know. Instead, offer to connect them with the sales team.\n5. When someone wants to buy, rent, get a quote, schedule service, or request a demo — guide them toward sharing their contact info so the team can follow up.\n6. When you determine the visitor wants a quote, purchase, rental, demo, or service callback, include the tag <lead_capture> at the very end of your response. This signals the system to start collecting their contact info.\n7. Stay on topic — only answer questions related to Perry Brothers, SANY equipment, heavy equipment in general, or construction/farming topics. For unrelated questions, politely redirect.\n8. If you don't know the answer, say so honestly and offer to have the team follow up.\n9. Use the page context to personalize your first response if the visitor is on a specific equipment or service page.";

var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

var AGENT_TIMEOUT_MS = 60000; /* 60 seconds before AI fallback */

/* ── Rate limiting (in-memory, resets on worker restart) ── */
var rateLimitMap = {};
var RATE_LIMIT = 20;
var RATE_WINDOW = 10 * 60 * 1000;

function checkRateLimit(ip) {
  var now = Date.now();
  var entry = rateLimitMap[ip];
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateLimitMap[ip] = { start: now, count: 1 };
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

/* ── Helpers ── */
function jsonResponse(data, status) {
  if (!status) status = 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json"
    }
  });
}

function generateChatId() {
  var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  var rand = "";
  for (var i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return "ch_" + Date.now() + "_" + rand;
}

async function readChat(chatId, env) {
  var raw = await env.CHAT_KV.get("chat:" + chatId);
  if (!raw) return null;
  return JSON.parse(raw);
}

async function writeChat(chat, env) {
  await env.CHAT_KV.put("chat:" + chat.id, JSON.stringify(chat), { expirationTtl: 2592000 });
}

async function readActiveChats(env) {
  var raw = await env.CHAT_KV.get("active_chats");
  if (!raw) return [];
  return JSON.parse(raw);
}

async function updateActiveChats(chat, env) {
  var list = await readActiveChats(env);
  /* Remove existing entry for this chat */
  list = list.filter(function (c) { return c.id !== chat.id; });
  /* Add updated summary (including closed chats) */
  list.unshift({
    id: chat.id,
    status: chat.status,
    firstMessage: chat.messages.length > 0 ? chat.messages[0].content.slice(0, 100) : "",
    visitorPage: chat.visitorPage,
    createdAt: chat.createdAt,
    lastActivity: Date.now(),
    messageCount: chat.messages.length,
    expiresAt: Date.now() + 2592000000 /* 30 days from now */
  });
  /* Prune: keep last 200, remove anything older than 30 days */
  var cutoff = Date.now() - 2592000000;
  list = list.filter(function (c) { return c.lastActivity > cutoff; }).slice(0, 200);
  await env.CHAT_KV.put("active_chats", JSON.stringify(list), { expirationTtl: 2592000 });
}

/* ── Auth helper ── */
function getAgentToken(request) {
  var auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return "";
}

function requireAgent(request, env) {
  var token = getAgentToken(request);
  if (!token || token !== env.AGENT_TOKEN) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  return null; /* auth passed */
}

/* ── Call Claude API ── */
async function callClaude(messages, pageContext, env) {
  var trimmed = messages.slice(-20);
  var claudeMessages = [];
  for (var i = 0; i < trimmed.length; i++) {
    var m = trimmed[i];
    var role = m.role === "visitor" ? "user" : "assistant";
    if (m.role === "system") continue; /* skip system messages */
    claudeMessages.push({
      role: role,
      content: String(m.content || "").slice(0, 500)
    });
  }

  if (claudeMessages.length === 0) return null;

  /* Ensure conversation starts with user message */
  if (claudeMessages[0].role !== "user") {
    claudeMessages.shift();
  }
  if (claudeMessages.length === 0) return null;

  if (pageContext && claudeMessages[0].role === "user") {
    claudeMessages[0].content = "[Page context: " + pageContext + "]\n\n" + claudeMessages[0].content;
  }

  var apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  var resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: claudeMessages
    })
  });

  if (!resp.ok) return null;

  var data = await resp.json();
  if (data.content && data.content[0] && data.content[0].text) {
    var reply = data.content[0].text;
    var action = null;
    if (reply.indexOf("<lead_capture>") !== -1) {
      action = "capture_lead";
      reply = reply.replace(/<lead_capture>/g, "").trim();
    }
    return { reply: reply, action: action };
  }
  return null;
}

/* ── Send email notification ── */
async function sendNotification(message, page, env) {
  if (!env.SENDGRID_API_KEY) return;
  var emailBody = "New chat on perryequip.com!\n\n" +
    "Time: " + new Date().toISOString() + "\n" +
    "Page: " + page + "\n\n" +
    "Visitor says:\n" + message;

  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.SENDGRID_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: "johnsmarr@perrybrothersoil.com" }] }],
      from: { email: "noreply@perryequip.com", name: "Perry Brothers Chat" },
      subject: "New website chat: " + message.slice(0, 50),
      content: [{ type: "text/plain", value: emailBody }]
    })
  }).catch(function () {});
}

/* ── Send chat transcript email ── */
async function sendTranscript(chat, env) {
  if (!env.SENDGRID_API_KEY) return;
  var transcript = chat.messages.map(function (m) {
    var label = m.role === "visitor" ? "Visitor" : m.role === "agent" ? "Agent" : m.role === "ai" ? "AI" : "System";
    return label + ": " + m.content;
  }).join("\n\n");

  var emailBody = "Chat transcript from perryequip.com\n\n" +
    "Chat ID: " + chat.id + "\n" +
    "Time: " + new Date(chat.createdAt).toISOString() + "\n" +
    "Page: " + chat.visitorPage + "\n" +
    "Status: " + chat.status + "\n";

  if (chat.leadData && chat.leadData.first_name) {
    emailBody += "Contact: " + chat.leadData.first_name + " " + (chat.leadData.last_name || "") + "\n";
    if (chat.leadData.phone) emailBody += "Phone: " + chat.leadData.phone + "\n";
    if (chat.leadData.email) emailBody += "Email: " + chat.leadData.email + "\n";
  }

  emailBody += "\n--- Conversation ---\n\n" + transcript;

  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.SENDGRID_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: "johnsmarr@perrybrothersoil.com" }] }],
      from: { email: "noreply@perryequip.com", name: "Perry Brothers Chat" },
      subject: "Chat transcript" + (chat.leadData && chat.leadData.first_name ? " — " + chat.leadData.first_name : ""),
      content: [{ type: "text/plain", value: emailBody }]
    })
  }).catch(function () {});
}

/* ═══════════════════════════════════════════════════════════
   VISITOR ROUTES
   ═══════════════════════════════════════════════════════════ */

/* POST /api/chat/start — Visitor starts a new chat */
async function handleChatStart(request, env) {
  var ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!checkRateLimit(ip)) {
    return jsonResponse({ error: "Too many requests." }, 429);
  }

  try {
    var body = await request.json();
    var message = String(body.message || "").trim();
    if (!message) return jsonResponse({ error: "No message" }, 400);

    var now = Date.now();
    var chat = {
      id: generateChatId(),
      status: "waiting",
      createdAt: now,
      lastVisitorMessageAt: now,
      lastAgentMessageAt: null,
      agentName: null,
      visitorPage: body.page || "",
      pageContext: body.pageContext || "",
      visitorIp: ip,
      leadData: null,
      messages: [
        { role: "visitor", content: message, ts: now }
      ]
    };

    await writeChat(chat, env);
    await updateActiveChats(chat, env);

    /* Fire-and-forget email notification */
    sendNotification(message, chat.visitorPage, env);

    return jsonResponse({ chatId: chat.id, status: "waiting" });
  } catch (err) {
    console.log("chat/start error: " + err.message);
    return jsonResponse({ error: "Failed to start chat" }, 500);
  }
}

/* GET /api/chat/poll/{chatId}?since={ts} — Visitor polls for new messages */
async function handleChatPoll(chatId, since, env) {
  try {
    var chat = await readChat(chatId, env);
    if (!chat) return jsonResponse({ error: "Chat not found" }, 404);

    /* Filter messages newer than 'since' */
    var newMessages = [];
    for (var i = 0; i < chat.messages.length; i++) {
      if (chat.messages[i].ts > since) {
        newMessages.push(chat.messages[i]);
      }
    }

    return jsonResponse({
      status: chat.status,
      messages: newMessages,
      leadCapture: chat.leadCaptureNeeded || false
    });
  } catch (err) {
    console.log("chat/poll error: " + err.message);
    return jsonResponse({ error: "Poll failed" }, 500);
  }
}

/* POST /api/chat/ai-takeover — Client triggers AI fallback after timeout */
async function handleAITakeover(request, env) {
  try {
    var body = await request.json();
    var chatId = body.chatId;
    if (!chatId) return jsonResponse({ error: "Missing chatId" }, 400);

    var chat = await readChat(chatId, env);
    if (!chat) return jsonResponse({ error: "Chat not found" }, 404);

    /* Only take over if still waiting — if agent already responded, skip */
    if (chat.status !== "waiting") {
      return jsonResponse({ status: chat.status, messages: [], alreadyHandled: true });
    }

    var now = Date.now();
    chat.status = "ai";

    chat.messages.push({
      role: "system",
      content: "I'm sorry, no agents are available right now. Let me help!",
      ts: now
    });

    var aiResult = await callClaude(chat.messages, chat.pageContext, env);
    var newMessages = [chat.messages[chat.messages.length - 1]];

    if (aiResult) {
      var aiMsg = { role: "ai", content: aiResult.reply, ts: now + 1 };
      chat.messages.push(aiMsg);
      newMessages.push(aiMsg);
      if (aiResult.action === "capture_lead") {
        chat.leadCaptureNeeded = true;
      }
    } else {
      var fallbackMsg = { role: "ai", content: "I'm having trouble right now. Please call us at (229) 924-0035 and we'll help you right away.", ts: now + 1 };
      chat.messages.push(fallbackMsg);
      newMessages.push(fallbackMsg);
    }

    await writeChat(chat, env);
    await updateActiveChats(chat, env);

    return jsonResponse({ status: "ai", messages: newMessages, leadCapture: chat.leadCaptureNeeded || false });
  } catch (err) {
    console.log("ai-takeover error: " + err.message);
    return jsonResponse({ error: "Failed" }, 500);
  }
}

/* POST /api/chat/message — Visitor sends a follow-up message */
async function handleChatMessage(request, env) {
  var ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!checkRateLimit(ip)) {
    return jsonResponse({ error: "Too many requests." }, 429);
  }

  try {
    var body = await request.json();
    var chatId = body.chatId;
    var message = String(body.message || "").trim();
    if (!chatId || !message) return jsonResponse({ error: "Missing chatId or message" }, 400);

    var chat = await readChat(chatId, env);
    if (!chat) return jsonResponse({ error: "Chat not found" }, 404);

    var now = Date.now();
    chat.messages.push({ role: "visitor", content: message, ts: now });
    chat.lastVisitorMessageAt = now;

    var newMessages = [];

    /* If in AI mode, get Claude response immediately */
    if (chat.status === "ai") {
      var aiResult = await callClaude(chat.messages, chat.pageContext, env);
      if (aiResult) {
        var aiMsg = { role: "ai", content: aiResult.reply, ts: now + 1 };
        chat.messages.push(aiMsg);
        newMessages.push(aiMsg);
        if (aiResult.action === "capture_lead") {
          chat.leadCaptureNeeded = true;
        }
      }
    }

    await writeChat(chat, env);

    return jsonResponse({ status: chat.status, messages: newMessages, leadCapture: chat.leadCaptureNeeded || false });
  } catch (err) {
    console.log("chat/message error: " + err.message);
    return jsonResponse({ error: "Failed to send message" }, 500);
  }
}

/* POST /api/chat/lead — Visitor submits lead data */
async function handleChatLead(request, env) {
  try {
    var body = await request.json();
    var chatId = body.chatId;
    if (!chatId) return jsonResponse({ error: "Missing chatId" }, 400);

    var chat = await readChat(chatId, env);
    if (!chat) return jsonResponse({ error: "Chat not found" }, 404);

    chat.leadData = {
      first_name: body.first_name || "",
      last_name: body.last_name || "",
      phone: body.phone || "",
      email: body.email || ""
    };
    chat.leadCaptureNeeded = false;

    await writeChat(chat, env);

    /* Send transcript with lead data */
    sendTranscript(chat, env);

    return jsonResponse({ ok: true });
  } catch (err) {
    console.log("chat/lead error: " + err.message);
    return jsonResponse({ error: "Failed to save lead" }, 500);
  }
}

/* POST /api/rental — Rental request form submission */
async function handleRental(request, env) {
  try {
    var body = await request.json();
    var fullName = (body.first_name || "") + " " + (body.last_name || "");
    var address = [body.address, body.city, body.state, body.zip].filter(Boolean).join(", ");

    var rows = "";
    function addRow(label, value) {
      if (!value) return;
      rows += '<tr><td style="padding:10px 16px;font-size:13px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;width:140px;vertical-align:top;">' + label + '</td><td style="padding:10px 16px;font-size:15px;color:#111;">' + value + '</td></tr>';
    }
    addRow("Name", fullName);
    addRow("Phone", '<a href="tel:' + (body.phone || "") + '" style="color:#d91f11;text-decoration:none;font-weight:600;">' + (body.phone || "") + '</a>');
    addRow("Email", body.email ? '<a href="mailto:' + body.email + '" style="color:#d91f11;text-decoration:none;">' + body.email + '</a>' : "");
    addRow("Company", body.company);
    addRow("Address", address);
    addRow("Delivery", body.delivery ? '<span style="display:inline-block;padding:3px 12px;border-radius:999px;background:#16a34a;color:#fff;font-size:12px;font-weight:700;">Yes — to jobsite</span>' : "No");
    addRow("Start Date", body.start_date);
    addRow("Duration", body.duration);

    var htmlBody = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
      '<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">' +
        '<div style="background:#111;padding:28px 28px 24px;">' +
          '<p style="margin:0 0 4px;font-size:11px;color:#d91f11;font-weight:800;text-transform:uppercase;letter-spacing:.1em;">Rental Request</p>' +
          '<h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">' + fullName + '</h1>' +
          '<p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.5);">' + (body.machine || "Equipment") + '</p>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;margin:8px 0;" cellpadding="0" cellspacing="0">' + rows + '</table>' +
        '<div style="padding:16px 28px;border-top:1px solid #eee;text-align:center;">' +
          '<p style="margin:0;font-size:11px;color:#bbb;">Sent from perryequip.com rental form</p>' +
        '</div>' +
      '</div></body></html>';

    var plainBody = "New Rental Request from perryequip.com\n\n" +
      "Machine: " + (body.machine || "Not specified") + "\n" +
      "Name: " + fullName + "\n" +
      "Email: " + (body.email || "") + "\n" +
      "Phone: " + (body.phone || "") + "\n" +
      "Company: " + (body.company || "N/A") + "\n" +
      "Address: " + address + "\n" +
      "Delivery: " + (body.delivery ? "Yes" : "No") + "\n" +
      "Start Date: " + (body.start_date || "Not specified") + "\n" +
      "Duration: " + (body.duration || "Not specified") + "\n";

    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.SENDGRID_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: "johnsmarr@perrybrothersoil.com" }] }],
        from: { email: "noreply@perryequip.com", name: "Perry Brothers Rentals" },
        reply_to: body.email ? { email: body.email, name: fullName } : undefined,
        subject: "Rental Request: " + (body.machine || "Equipment"),
        content: [
          { type: "text/plain", value: plainBody },
          { type: "text/html", value: htmlBody }
        ]
      })
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.log("Rental error: " + err.message);
    return jsonResponse({ error: "Failed to submit" }, 500);
  }
}

/* POST /api/demo — Demo request from deals page */
async function handleDemo(request, env) {
  try {
    var body = await request.json();
    var fullName = (body.first_name || "") + " " + (body.last_name || "");
    var location = [body.city, body.state].filter(Boolean).join(", ");

    var rows = "";
    function addRow(label, value) {
      if (!value) return;
      rows += '<tr><td style="padding:10px 16px;font-size:13px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;width:140px;vertical-align:top;">' + label + '</td><td style="padding:10px 16px;font-size:15px;color:#111;">' + value + '</td></tr>';
    }
    addRow("Name", fullName);
    addRow("Phone", '<a href="tel:' + (body.phone || "") + '" style="color:#d91f11;text-decoration:none;font-weight:600;">' + (body.phone || "") + '</a>');
    addRow("Email", body.email ? '<a href="mailto:' + body.email + '" style="color:#d91f11;text-decoration:none;">' + body.email + '</a>' : "");
    addRow("Company", body.company);
    addRow("Location", location);
    addRow("Preferred Date", body.preferred_date);

    var notesBlock = "";
    if (body.notes) {
      notesBlock = '<div style="margin:24px 28px 28px;padding:16px 20px;background:#f8f8f8;border-left:3px solid #d91f11;border-radius:0 8px 8px 0;">' +
        '<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Notes</p>' +
        '<p style="margin:0;font-size:15px;color:#333;line-height:1.6;white-space:pre-wrap;">' + body.notes + '</p>' +
        '</div>';
    }

    var htmlBody = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
      '<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">' +
        '<div style="background:#111;padding:28px 28px 24px;">' +
          '<p style="margin:0 0 4px;font-size:11px;color:#d91f11;font-weight:800;text-transform:uppercase;letter-spacing:.1em;">Demo Request</p>' +
          '<h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">' + fullName + '</h1>' +
          '<p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.5);">' + (body.machine || "Equipment") + '</p>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;margin:8px 0;" cellpadding="0" cellspacing="0">' + rows + '</table>' +
        notesBlock +
        '<div style="padding:16px 28px;border-top:1px solid #eee;text-align:center;">' +
          '<p style="margin:0;font-size:11px;color:#bbb;">Sent from perryequip.com deals page</p>' +
        '</div>' +
      '</div></body></html>';

    var plainBody = "New Demo Request from perryequip.com\n\n" +
      "Machine: " + (body.machine || "Not specified") + "\n" +
      "Name: " + fullName + "\n" +
      "Email: " + (body.email || "") + "\n" +
      "Phone: " + (body.phone || "") + "\n" +
      "Company: " + (body.company || "N/A") + "\n" +
      "Location: " + location + "\n" +
      "Preferred Date: " + (body.preferred_date || "Not specified") + "\n" +
      "Notes: " + (body.notes || "None") + "\n";

    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.SENDGRID_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: "johnsmarr@perrybrothersoil.com" }] }],
        from: { email: "noreply@perryequip.com", name: "Perry Brothers Demos" },
        reply_to: body.email ? { email: body.email, name: fullName } : undefined,
        subject: "Demo Request: " + (body.machine || "Equipment"),
        content: [
          { type: "text/plain", value: plainBody },
          { type: "text/html", value: htmlBody }
        ]
      })
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.log("Demo error: " + err.message);
    return jsonResponse({ error: "Failed to submit" }, 500);
  }
}

/* POST /api/chat/close — Visitor closes chat (send transcript) */
async function handleChatClose(request, env) {
  try {
    var body = await request.json();
    var chatId = body.chatId;
    if (!chatId) return jsonResponse({ ok: true });

    var chat = await readChat(chatId, env);
    if (!chat) return jsonResponse({ ok: true });

    if (chat.messages.length > 0) {
      sendTranscript(chat, env);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: true });
  }
}

/* ═══════════════════════════════════════════════════════════
   AGENT ROUTES
   ═══════════════════════════════════════════════════════════ */

/* POST /api/agent/auth — Validate agent token */
async function handleAgentAuth(request, env) {
  try {
    var body = await request.json();
    if (body.token === env.AGENT_TOKEN) {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: "Invalid token" }, 401);
  } catch (err) {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
}

/* GET /api/agent/chats — List active chats */
async function handleAgentChats(env) {
  var list = await readActiveChats(env);
  return jsonResponse({ chats: list });
}

/* GET /api/agent/chat/{chatId} — Get full chat */
async function handleAgentGetChat(chatId, env) {
  var chat = await readChat(chatId, env);
  if (!chat) return jsonResponse({ error: "Chat not found" }, 404);
  return jsonResponse(chat);
}

/* POST /api/agent/message/{chatId} — Agent sends a reply */
async function handleAgentMessage(chatId, request, env) {
  try {
    var body = await request.json();
    var message = String(body.message || "").trim();
    var agentName = body.agentName || "Agent";
    if (!message) return jsonResponse({ error: "No message" }, 400);

    var chat = await readChat(chatId, env);
    if (!chat) return jsonResponse({ error: "Chat not found" }, 404);

    var now = Date.now();

    /* If AI was handling, agent takes over */
    if (chat.status === "ai" || chat.status === "waiting") {
      if (chat.status === "ai") {
        chat.messages.push({
          role: "system",
          content: "A team member has joined the chat!",
          ts: now
        });
      }
      chat.status = "agent";
      await updateActiveChats(chat, env);
    }

    chat.agentName = agentName;
    chat.lastAgentMessageAt = now;
    chat.messages.push({ role: "agent", content: message, ts: now + 1 });

    await writeChat(chat, env);

    return jsonResponse({ ok: true, status: "agent" });
  } catch (err) {
    console.log("agent/message error: " + err.message);
    return jsonResponse({ error: "Failed to send message" }, 500);
  }
}

/* POST /api/agent/keep/{chatId} — Extend chat retention another 30 days */
async function handleAgentKeep(chatId, env) {
  try {
    var chat = await readChat(chatId, env);
    if (!chat) return jsonResponse({ error: "Chat not found" }, 404);

    /* Re-write with fresh 30-day TTL */
    await writeChat(chat, env);

    /* Update expiry in active_chats list */
    var list = await readActiveChats(env);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === chatId) {
        list[i].expiresAt = Date.now() + 2592000000;
        break;
      }
    }
    await env.CHAT_KV.put("active_chats", JSON.stringify(list), { expirationTtl: 2592000 });

    return jsonResponse({ ok: true, expiresAt: Date.now() + 2592000000 });
  } catch (err) {
    return jsonResponse({ error: "Failed to extend chat" }, 500);
  }
}

/* POST /api/agent/close/{chatId} — Agent closes a chat */
async function handleAgentClose(chatId, request, env) {
  try {
    var chat = await readChat(chatId, env);
    if (!chat) return jsonResponse({ error: "Chat not found" }, 404);

    chat.status = "closed";
    await writeChat(chat, env);
    await updateActiveChats(chat, env);

    /* Send transcript */
    sendTranscript(chat, env);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: "Failed to close chat" }, 500);
  }
}

/* ═══════════════════════════════════════════════════════════
   LEGACY ROUTES (kept for lead form + direct Claude API)
   ═══════════════════════════════════════════════════════════ */

async function handleChat(request, env) {
  var ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!checkRateLimit(ip)) {
    return jsonResponse({ error: "Too many requests. Please try again later." }, 429);
  }

  try {
    var body = await request.json();
    var userMessages = body.messages || [];
    var pageContext = body.pageContext || "";

    if (userMessages.length === 0) {
      return jsonResponse({ error: "No messages provided" }, 400);
    }

    var trimmedMessages = userMessages.slice(-20);
    var claudeMessages = [];
    for (var i = 0; i < trimmedMessages.length; i++) {
      var m = trimmedMessages[i];
      claudeMessages.push({
        role: m.role === "user" ? "user" : "assistant",
        content: String(m.content || "").slice(0, 500)
      });
    }

    if (pageContext && claudeMessages.length > 0 && claudeMessages[0].role === "user") {
      claudeMessages[0].content = "[Page context: " + pageContext + "]\n\n" + claudeMessages[0].content;
    }

    var apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return jsonResponse({ reply: "I'm having trouble right now. Please call us at (229) 924-0035." }, 200);
    }

    var claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: claudeMessages
      })
    });

    if (!claudeResponse.ok) {
      var errText = await claudeResponse.text();
      console.log("Claude API error: " + claudeResponse.status + " " + errText);
      return jsonResponse({ reply: "I'm having trouble right now. Please call us at (229) 924-0035." }, 200);
    }

    var claudeData = await claudeResponse.json();
    var reply = "I'm having trouble right now. Please call us at (229) 924-0035.";
    if (claudeData.content && claudeData.content[0] && claudeData.content[0].text) {
      reply = claudeData.content[0].text;
    }

    var action = null;
    if (reply.indexOf("<lead_capture>") !== -1) {
      action = "capture_lead";
      reply = reply.replace(/<lead_capture>/g, "").trim();
    }

    return jsonResponse({ reply: reply, action: action });

  } catch (err) {
    console.log("Chat error: " + err.message);
    return jsonResponse({ reply: "I'm having trouble right now. Please call us at (229) 924-0035." }, 200);
  }
}

async function handleLeadForm(request, env) {
  var formData = await request.formData();
  var recaptchaResponse = formData.get('g-recaptcha-response');
  var recaptchaVerify = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'secret=6LcLRRguAAAAAJL5LEt-EbP0cC09dRc5YsMsg-Zy&response=' + recaptchaResponse
  });
  var recaptchaResult = await recaptchaVerify.json();
  if (!recaptchaResult.success || recaptchaResult.score < 0.5) {
    return new Response('reCAPTCHA verification failed. Please go back and try again.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  var source = formData.get('source') || 'contact';
  var fields = {
    first_name: formData.get('first_name') || '',
    last_name: formData.get('last_name') || '',
    phone: formData.get('phone') || '',
    zip: formData.get('zip') || '',
    contact_pref: formData.get('contact_pref') || '',
    email: formData.get('email') || '',
    interest: formData.get('interest') || '',
    machine: formData.get('machine') || '',
    message: formData.get('message') || ''
  };

  var isChat = (source === 'chatbot' || source === 'ai-chatbot');
  var fullName = fields.first_name + ' ' + fields.last_name;

  var recipients = isChat
    ? [{ email: 'johnsmarr@perrybrothersoil.com' }]
    : [{ email: 'brandensmith@perryequip.com' }, { email: 'stephen@perryequip.com' }, { email: 'abbibutler@perrybrothersoil.com' }];

  var subject = 'New ' + (isChat ? 'chatbot ' : '') + 'inquiry: ' + (fields.machine || fields.interest || 'Contact Form');

  var prefBadgeColor = fields.contact_pref === 'Call' ? '#2563eb' : '#16a34a';
  var prefLabel = fields.contact_pref || 'Not specified';

  /* Build detail rows — only include fields that have values */
  var rows = '';
  function addRow(label, value) {
    if (!value) return;
    rows += '<tr><td style="padding:10px 16px;font-size:13px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.05em;width:140px;vertical-align:top;">' + label + '</td><td style="padding:10px 16px;font-size:15px;color:#111;">' + value + '</td></tr>';
  }
  addRow('Name', fullName);
  addRow('Phone', '<a href="tel:' + fields.phone + '" style="color:#d91f11;text-decoration:none;font-weight:600;">' + fields.phone + '</a>');
  addRow('Zip Code', fields.zip);
  if (fields.contact_pref) {
    addRow('Prefers', '<span style="display:inline-block;padding:3px 12px;border-radius:999px;background:' + prefBadgeColor + ';color:#fff;font-size:12px;font-weight:700;">' + prefLabel + '</span>');
  }
  if (fields.email) addRow('Email', '<a href="mailto:' + fields.email + '" style="color:#d91f11;text-decoration:none;">' + fields.email + '</a>');
  addRow('Interest', fields.interest);
  addRow('Machine', fields.machine);

  var messageBlock = '';
  if (fields.message) {
    messageBlock = '<div style="margin:24px 28px 28px;padding:16px 20px;background:#f8f8f8;border-left:3px solid #d91f11;border-radius:0 8px 8px 0;">' +
      '<p style="margin:0 0 4px;font-size:11px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Message</p>' +
      '<p style="margin:0;font-size:15px;color:#333;line-height:1.6;white-space:pre-wrap;">' + fields.message + '</p>' +
      '</div>';
  }

  var htmlBody = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
    '<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">' +
      /* Header */
      '<div style="background:#111;padding:28px 28px 24px;">' +
        '<p style="margin:0 0 4px;font-size:11px;color:#d91f11;font-weight:800;text-transform:uppercase;letter-spacing:.1em;">' + (isChat ? 'Chatbot Lead' : 'Website Inquiry') + '</p>' +
        '<h1 style="margin:0;font-size:22px;color:#fff;font-weight:800;">' + fullName + '</h1>' +
        (fields.machine ? '<p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.5);">' + fields.machine + '</p>' : '') +
      '</div>' +
      /* Details table */
      '<table style="width:100%;border-collapse:collapse;margin:8px 0;" cellpadding="0" cellspacing="0">' + rows + '</table>' +
      /* Message */
      messageBlock +
      /* Footer */
      '<div style="padding:16px 28px;border-top:1px solid #eee;text-align:center;">' +
        '<p style="margin:0;font-size:11px;color:#bbb;">Sent from perryequip.com contact form</p>' +
      '</div>' +
    '</div>' +
    '</body></html>';

  /* Plain text fallback */
  var plainBody = 'New ' + (isChat ? 'chatbot' : 'form') + ' submission from perryequip.com\n\n' +
    'Name: ' + fullName + '\n' +
    'Phone: ' + fields.phone + '\n' +
    'Zip: ' + fields.zip + '\n' +
    'Prefers: ' + (fields.contact_pref || 'N/A') + '\n' +
    (fields.email ? 'Email: ' + fields.email + '\n' : '') +
    'Interest: ' + fields.interest + '\n' +
    'Machine: ' + fields.machine + '\n\n' +
    'Message:\n' + fields.message;

  var sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.SENDGRID_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: recipients }],
      from: { email: 'noreply@perryequip.com', name: 'Perry Brothers Website' },
      reply_to: fields.email ? { email: fields.email, name: fullName } : undefined,
      subject: subject,
      content: [
        { type: 'text/plain', value: plainBody },
        { type: 'text/html', value: htmlBody }
      ]
    })
  });

  var sgStatus = sgResponse.status;
  var sgBody = await sgResponse.text();
  console.log('SendGrid status: ' + sgStatus);
  console.log('SendGrid response: ' + sgBody);

  return Response.redirect('https://perryequip.com/contact/?sent=1', 303);
}

/* ═══════════════════════════════════════════════════════════
   ROUTER
   ═══════════════════════════════════════════════════════════ */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    var url = new URL(request.url);
    var path = url.pathname;
    var method = request.method;

    /* ── Visitor chat routes ── */
    if (path === "/api/chat/start" && method === "POST") {
      return handleChatStart(request, env);
    }
    if (path === "/api/chat/message" && method === "POST") {
      return handleChatMessage(request, env);
    }
    if (path.startsWith("/api/chat/poll/") && method === "GET") {
      var chatId = path.replace("/api/chat/poll/", "");
      var since = parseInt(url.searchParams.get("since") || "0");
      return handleChatPoll(chatId, since, env);
    }
    if (path === "/api/chat/ai-takeover" && method === "POST") {
      return handleAITakeover(request, env);
    }
    if (path === "/api/chat/lead" && method === "POST") {
      return handleChatLead(request, env);
    }
    if (path === "/api/rental" && method === "POST") {
      return handleRental(request, env);
    }
    if (path === "/api/demo" && method === "POST") {
      return handleDemo(request, env);
    }
    if (path === "/api/chat/close" && method === "POST") {
      return handleChatClose(request, env);
    }

    /* ── Agent routes ── */
    if (path === "/api/agent/auth" && method === "POST") {
      return handleAgentAuth(request, env);
    }
    if (path === "/api/agent/chats" && method === "GET") {
      var authErr = requireAgent(request, env);
      if (authErr) return authErr;
      return handleAgentChats(env);
    }
    if (path.startsWith("/api/agent/chat/") && !path.startsWith("/api/agent/close/") && method === "GET") {
      var authErr2 = requireAgent(request, env);
      if (authErr2) return authErr2;
      var agentChatId = path.replace("/api/agent/chat/", "");
      return handleAgentGetChat(agentChatId, env);
    }
    if (path.startsWith("/api/agent/message/") && method === "POST") {
      var authErr3 = requireAgent(request, env);
      if (authErr3) return authErr3;
      var msgChatId = path.replace("/api/agent/message/", "");
      return handleAgentMessage(msgChatId, request, env);
    }
    if (path.startsWith("/api/agent/keep/") && method === "POST") {
      var authErr5 = requireAgent(request, env);
      if (authErr5) return authErr5;
      var keepChatId = path.replace("/api/agent/keep/", "");
      return handleAgentKeep(keepChatId, env);
    }
    if (path.startsWith("/api/agent/close/") && method === "POST") {
      var authErr4 = requireAgent(request, env);
      if (authErr4) return authErr4;
      var closeChatId = path.replace("/api/agent/close/", "");
      return handleAgentClose(closeChatId, request, env);
    }

    /* ── Legacy routes ── */
    if (path === "/api/chat" && method === "POST") {
      return handleChat(request, env);
    }

    if (method === "POST") {
      return handleLeadForm(request, env);
    }

    return new Response("Method not allowed", { status: 405 });
  }
};
