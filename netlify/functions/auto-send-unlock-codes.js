import crypto from "node:crypto";

export const config = {
  schedule: "*/15 * * * *"
};

const words = ["ORBIT", "NEON", "VAULT", "COMET", "PIXEL", "RADIO", "LASER", "FUTURE"];

function makePassword() {
  return Array.from({ length: 4 }, () => words[crypto.randomInt(words.length)]).join("-");
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
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
  if (!response.ok) throw new Error(data?.message || data?.error || "Supabase request failed");
  return data;
}

async function sendEmail(to, password, capsule) {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || "LaterLoop <onboarding@resend.dev>",
      to,
      subject: `Your LaterLoop capsule "${capsule.title}" is ready`,
      text: [
        `Your LaterLoop capsule is ready.`,
        `Capsule: ${capsule.title}`,
        `Capsule ID: ${capsule.id}`,
        `Secret password: ${password}`,
        `Open it on your LaterLoop site with the capsule ID and password.`
      ].join("\n")
    })
  });
  if (!response.ok) throw new Error(`Email delivery failed with status ${response.status}`);
}

async function markCapsule(capsuleId, updates) {
  return supabaseFetch(`capsules?id=eq.${encodeURIComponent(capsuleId)}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
}

export async function handler() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      statusCode: 500,
      body: "Supabase environment variables are missing."
    };
  }

  const now = new Date().toISOString();
  const capsules = await supabaseFetch(
    `capsules?unlock_at=lte.${encodeURIComponent(now)}&unlock_password_sent_at=is.null&select=id,title,delivery_target&limit=25`
  );

  const results = [];
  for (const capsule of capsules || []) {
    try {
      const password = makePassword();
      const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
      await supabaseFetch("unlock_codes", {
        method: "POST",
        body: JSON.stringify({
          capsule_id: capsule.id,
          password_hash: passwordHash,
          delivery_target: capsule.delivery_target,
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
        })
      });

      await sendEmail(capsule.delivery_target, password, capsule);

      await markCapsule(capsule.id, {
        unlock_password_sent_at: new Date().toISOString(),
        unlock_delivery_error: null
      });
      results.push({ id: capsule.id, sent: true });
    } catch (error) {
      await markCapsule(capsule.id, {
        unlock_delivery_error: error.message || "Delivery failed"
      });
      results.push({ id: capsule.id, sent: false, error: error.message });
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ processed: results.length, results })
  };
}
