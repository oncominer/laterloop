import crypto from "node:crypto";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

const words = ["ORBIT", "NEON", "VAULT", "COMET", "PIXEL", "RADIO", "LASER", "FUTURE"];

function makePassword() {
  return Array.from({ length: 4 }, () => words[crypto.randomInt(words.length)]).join("-");
}

async function supabaseFetch(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Supabase request failed");
  }
  return data;
}

async function sendEmail(to, password, capsule) {
  if (!process.env.RESEND_API_KEY) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || "Time Capsule Arcade <onboarding@resend.dev>",
      to,
      subject: `Your capsule "${capsule.title}" is ready`,
      text: `Your secret unlock password is ${password}. Capsule ID: ${capsule.id}`
    })
  });
  return response.ok;
}

async function sendSms(to, password, capsule) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) {
    return false;
  }

  const body = new URLSearchParams({
    To: to,
    From: process.env.TWILIO_FROM_NUMBER,
    Body: `Your Future XYZ capsule "${capsule.title}" is ready. Password: ${password}`
  });
  const token = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );
  return response.ok;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { message: "Method not allowed." });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { message: "Supabase environment variables are missing." });
  }

  try {
    const { capsuleId, target } = JSON.parse(event.body || "{}");
    if (!capsuleId || !target) {
      return json(400, { message: "Capsule ID and delivery target are required." });
    }

    const rows = await supabaseFetch(
      `capsules?id=eq.${encodeURIComponent(capsuleId)}&delivery_target=eq.${encodeURIComponent(target)}&select=*`
    );
    const capsule = rows?.[0];
    if (!capsule) return json(404, { message: "No matching capsule found." });
    if (new Date(capsule.unlock_at).getTime() > Date.now()) {
      return json(423, { message: "This capsule is still sealed." });
    }

    const password = makePassword();
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    await supabaseFetch("unlock_codes", {
      method: "POST",
      body: JSON.stringify({
        capsule_id: capsule.id,
        password_hash: passwordHash,
        delivery_target: target,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
      })
    });

    const delivered =
      capsule.delivery_method === "sms"
        ? await sendSms(target, password, capsule)
        : await sendEmail(target, password, capsule);

    return json(200, {
      message: delivered
        ? "Secret unlock password sent."
        : "Password generated, but no delivery provider is configured.",
      delivered
    });
  } catch (error) {
    return json(500, { message: error.message || "Unlock request failed." });
  }
}
