import crypto from "node:crypto";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || "Supabase request failed");
  return data;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { message: "Method not allowed." });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { message: "Supabase environment variables are missing." });
  }

  try {
    const { capsuleId, password } = JSON.parse(event.body || "{}");
    if (!capsuleId || !password) return json(400, { message: "Capsule ID and password are required." });

    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    const codes = await supabaseFetch(
      `unlock_codes?capsule_id=eq.${encodeURIComponent(capsuleId)}&password_hash=eq.${passwordHash}&used_at=is.null&expires_at=gte.${encodeURIComponent(new Date().toISOString())}&select=*`
    );
    if (!codes?.[0]) return json(401, { message: "Secret password is invalid or expired." });

    const rows = await supabaseFetch(`capsules?id=eq.${encodeURIComponent(capsuleId)}&select=id,title,recipient_name,unlock_at`);
    const capsule = rows?.[0];
    if (!capsule) return json(404, { message: "Capsule not found." });
    if (new Date(capsule.unlock_at).getTime() > Date.now()) {
      return json(423, { message: "This capsule is still sealed." });
    }

    const letters = await supabaseFetch(`capsule_letters?capsule_id=eq.${encodeURIComponent(capsuleId)}&select=body`);
    const letter = letters?.[0];
    if (!letter) return json(404, { message: "Capsule letter not found." });

    await supabaseFetch(`unlock_codes?id=eq.${codes[0].id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ used_at: new Date().toISOString() })
    });

    return json(200, { capsule: { ...capsule, body: letter.body } });
  } catch (error) {
    return json(500, { message: error.message || "Reveal failed." });
  }
}
