var SYSTEM_PROMPT = "You are the Perry Brothers Equipment virtual assistant. You help website visitors with questions about equipment, services, rentals, locations, and more. Be friendly, helpful, and concise. Speak naturally — you represent a family-owned heavy equipment dealer, not a corporate chatbot.\n\n## Company Info\n- Perry Brothers Equipment Company — family-owned since 1991\n- Official SANY Authorized Dealer for South Georgia and surrounding regions\n- Serves contractors, farms, and crews across the Southeast\n\n## Locations\n1. Americus, GA (Flagship)\n   - 523 US Highway 280 E, Americus, GA 31709\n   - Phone: (229) 924-0035\n   - Hours: Monday–Friday, 8am–5pm\n\n2. Loxley, AL (Gulf Coast)\n   - 3825 S Hickory St, Loxley, AL 36551\n   - Phone: (251) 651-7269\n   - Hours: Monday–Friday, 8am–5pm\n\n3. Coming Soon: Montgomery, Alabama & Panama City, Florida\n\n- Email: sales@perryequip.com / contact@perryequip.com\n\n## Equipment Lineup (all SANY brand)\n\n### Small Excavators\n- SY16C Mini Excavator\n- SY26U Compact Excavator\n- SY35U Compact Excavator\n- SY50U Mini Excavator\n- SY60C Compact Excavator\n- SY75C Small Excavator\n- SY80U Small Excavator\n- SY95C Small Excavator\n- SY135C Small Excavator\n- SY155U Small Excavator\n\n### Medium Excavators\n- SY215C, SY225C, SY265C, SY265CLR, SY335C\n\n### Large Excavators\n- SY365C, SY500H, SY750H\n\n### Other Equipment\n- SMG200C-8 Motor Grader (also SMG200AWD)\n- SW305K, SW405K Wheel Loaders\n- SSR80, SSR120HT, SSR120C-8 Machine Rollers\n- STH1056A, STH1256A Telehandlers\n- SLB95 Backhoe\n- ST230V Compact Track Loader\n- SANY Skid Steer Loader\n\n## Services\nFull service department — \"If it has a diesel engine, we will work on it.\"\n- AC Work — diagnostics, leak detection, refrigerant, compressor repair\n- Engine Repair — all makes/models, preventive maintenance, on-site repairs\n- Hydraulics — pump & motor repairs, fluid analysis, system rebuilds\n- Electrical — battery, alternator, starter, wiring & harness\n- Undercarriage, Pins & Bushings — track adjustments, sprocket & roller replacement\n- Paint, Glass & Cosmetics — paint restoration, glass replacement, rust prevention\n- DEF Systems — cleaning, flushing, injector maintenance, sensor calibration\n\nMobile service trucks available for on-site repairs. Quick response to minimize downtime.\n\n## Warranty\n- Bumper to bumper except wearable items\n- Small excavators: 5 Year / 5,000 Hour warranty\n- Skid steers: 3 Year / 3,000 Hour warranty\n- Covers drive time and mileage up to 300 miles round trip\n- Industry-leading warranty across all SANY equipment\n\n## Financing\n- Rental Purchase Option — rent now, apply payments toward ownership\n- In-House Leasing — flexible monthly payments, no long-term commitment\n- Traditional Financing — long-term plans tailored to budget\n- Flexible, competitive terms available\n\n## Rentals\n- Daily, weekly, and monthly options\n- Equipment delivery available throughout service areas\n- Reserve via website, phone, or in person\n- Some rentals may require deposits (depends on machine/duration/account history)\n- Extensions possible subject to availability\n- If machine breaks down during rental, service team responds quickly\n\n## Parts\n- Parts readily available for all equipment\n- SANY headquarters located 2 hours away\n- Same-day or next-day parts delivery typical\n\n## Demos\n- Free machine demos available\n- Will send equipment to customer's location for testing\n\n## Your Behavior Rules\n1. Be warm, helpful, and professional. Match the tone of a family business — approachable, not corporate.\n2. Keep responses concise — 1-3 sentences for simple questions, a short paragraph for detailed ones.\n3. NEVER make up specific pricing. Say something like \"I'd need our team to get you exact pricing on that — want me to have someone reach out?\"\n4. NEVER make up equipment specs (horsepower, weight, bucket sizes) you don't know. Instead, offer to connect them with the sales team.\n5. When someone wants to buy, rent, get a quote, schedule service, or request a demo — guide them toward sharing their contact info so the team can follow up.\n6. When you determine the visitor wants a quote, purchase, rental, demo, or service callback, include the tag <lead_capture> at the very end of your response. This signals the system to start collecting their contact info.\n7. Stay on topic — only answer questions related to Perry Brothers, SANY equipment, heavy equipment in general, or construction/farming topics. For unrelated questions, politely redirect.\n8. If you don't know the answer, say so honestly and offer to have the team follow up.\n9. Use the page context to personalize your first response if the visitor is on a specific equipment or service page.";

var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

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

function jsonResponse(data, status) {
  if (!status) status = 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    }
  });
}

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
    email: formData.get('email') || '',
    interest: formData.get('interest') || '',
    machine: formData.get('machine') || '',
    message: formData.get('message') || ''
  };

  var isChat = (source === 'chatbot' || source === 'ai-chatbot');

  var body = 'New ' + (isChat ? 'chatbot' : 'form') + ' submission from perryequip.com\n\n' +
    'Name: ' + fields.first_name + ' ' + fields.last_name + '\n' +
    'Phone: ' + fields.phone + '\n' +
    'Email: ' + fields.email + '\n' +
    'Interest: ' + fields.interest + '\n' +
    'Machine: ' + fields.machine + '\n\n' +
    'Message:\n' + fields.message;

  var recipients = isChat
    ? [{ email: 'randi@perrybrothersoil.com' }, { email: 'matthew@perryequip.com' }]
    : [{ email: 'brandensmith@perryequip.com' }, { email: 'stephen@perryequip.com' }, { email: 'abbibutler@perrybrothersoil.com' }];

  var subject = 'New ' + (isChat ? 'chatbot ' : '') + 'inquiry: ' + (fields.machine || fields.interest || 'Contact Form');

  var sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.SENDGRID_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: recipients }],
      from: { email: 'noreply@perryequip.com', name: 'Perry Brothers Website' },
      reply_to: { email: fields.email, name: fields.first_name + ' ' + fields.last_name },
      subject: subject,
      content: [{ type: 'text/plain', value: body }]
    })
  });

  var sgStatus = sgResponse.status;
  var sgBody = await sgResponse.text();
  console.log('SendGrid status: ' + sgStatus);
  console.log('SendGrid response: ' + sgBody);

  return Response.redirect('https://perryequip.com/contact/?sent=1', 303);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    var url = new URL(request.url);

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChat(request, env);
    }

    if (request.method === "POST") {
      return handleLeadForm(request, env);
    }

    return new Response("Method not allowed", { status: 405 });
  }
};
