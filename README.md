# Future XYZ Time Capsules

A retro 80s pixel-themed web app for sealing one letter into a time capsule, reserving a named pixel on a shared wall, and sending a secret unlock password after the chosen unlock time.

## Run locally

This project is intentionally simple for Netlify: static files plus Netlify Functions.

```bash
npm install
npm run dev
```

If you only want to preview the static frontend:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Add your Supabase URL and anon key to `src/config.js`.
4. Copy `src/config.js` values:

```js
window.SUPABASE_URL = "https://your-project.supabase.co";
window.SUPABASE_ANON_KEY = "your-public-anon-key";
```

5. Add these Netlify environment variables:

```bash
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

For automatic email unlock delivery, add `RESEND_API_KEY` and `FROM_EMAIL`.
For SMS unlock delivery, add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.

## Flow

- A user writes a single capsule letter, chooses an unlock date/time, and picks email or SMS delivery.
- Locking the capsule saves the sealed letter and reserves a colored pixel on the wall.
- Hovering a reserved pixel shows the creator's display name.
- A Netlify scheduled function checks every 15 minutes for capsules that are ready.
- After the unlock time, the scheduled function stores a hashed password and sends the secret password to the registered email or phone.
- The reveal function verifies the password before returning the capsule letter.
