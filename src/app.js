const config = {
  supabaseUrl: window.SUPABASE_URL || "",
  supabaseAnonKey: window.SUPABASE_ANON_KEY || ""
};

const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
const client = hasSupabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const storageKey = "future_xyz_capsules_v1";

const state = {
  user: null,
  capsules: [],
  pixels: [],
  wallOffset: { x: 0, y: 0 },
  dragging: false,
  dragStart: null
};

const $ = (selector) => document.querySelector(selector);

const els = {
  authAction: $("#authAction"),
  loginPanel: $("#loginPanel"),
  loginForm: $("#loginForm"),
  phoneLogin: $("#phoneLogin"),
  loginEmail: $("#loginEmail"),
  loginPhone: $("#loginPhone"),
  sessionState: $("#sessionState"),
  capsuleForm: $("#capsuleForm"),
  displayName: $("#displayName"),
  recipientName: $("#recipientName"),
  unlockAt: $("#unlockAt"),
  deliveryMethod: $("#deliveryMethod"),
  deliveryTarget: $("#deliveryTarget"),
  capsuleTitle: $("#capsuleTitle"),
  capsuleBody: $("#capsuleBody"),
  pixelColor: $("#pixelColor"),
  lockedCount: $("#lockedCount"),
  pixelCount: $("#pixelCount"),
  pixelWall: $("#pixelWall"),
  randomPixel: $("#randomPixel"),
  centerWall: $("#centerWall"),
  wallPosition: $("#wallPosition"),
  capsuleList: $("#capsuleList"),
  unlockForm: $("#unlockForm"),
  unlockCapsuleId: $("#unlockCapsuleId"),
  unlockTarget: $("#unlockTarget"),
  revealForm: $("#revealForm"),
  revealCapsuleId: $("#revealCapsuleId"),
  secretPassword: $("#secretPassword"),
  revealBox: $("#revealBox"),
  toast: $("#toast"),
  heroGrid: $("#heroGrid")
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 3600);
}

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function saveLocal(capsules) {
  localStorage.setItem(storageKey, JSON.stringify(capsules));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `cap_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function setDefaultDate() {
  const date = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  date.setSeconds(0, 0);
  els.unlockAt.value = date.toISOString().slice(0, 16);
}

function sectorText() {
  const x = Math.round(state.wallOffset.x / 180);
  const y = Math.round(state.wallOffset.y / 180);
  els.wallPosition.textContent = `Sector ${x}, ${y}`;
}

function seededPosition(id) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return {
    x: (hash % 1900) - 950,
    y: ((hash >> 8) % 1200) - 600
  };
}

function renderHeroGrid() {
  const colors = ["#00f5ff", "#ff4fd8", "#ffe45c", "#6dff8d", "#ffffff"];
  els.heroGrid.innerHTML = "";
  for (let i = 0; i < 162; i += 1) {
    const pixel = document.createElement("div");
    pixel.className = "hero-pixel";
    if (i % 7 === 0 || i % 19 === 0) {
      pixel.style.background = colors[i % colors.length];
      pixel.style.boxShadow = `0 0 18px ${colors[i % colors.length]}`;
    }
    els.heroGrid.append(pixel);
  }
}

function renderWall() {
  els.pixelWall.innerHTML = "";
  els.pixelWall.style.backgroundPosition = `${state.wallOffset.x}px ${state.wallOffset.y}px`;

  state.pixels.forEach((pixel) => {
    const dot = document.createElement("button");
    dot.className = "reserved-pixel";
    dot.type = "button";
    dot.dataset.name = pixel.name;
    dot.title = `${pixel.name} reserved this pixel`;
    dot.style.color = pixel.color;
    dot.style.background = pixel.color;
    dot.style.left = `calc(50% + ${pixel.x + state.wallOffset.x}px)`;
    dot.style.top = `calc(50% + ${pixel.y + state.wallOffset.y}px)`;
    els.pixelWall.append(dot);
  });

  sectorText();
}

function renderCapsules() {
  els.lockedCount.textContent = state.capsules.length;
  els.pixelCount.textContent = state.pixels.length;
  els.sessionState.textContent = state.user?.email || state.user?.phone || (hasSupabase ? "Logged out" : "Demo");

  if (!state.capsules.length) {
    els.capsuleList.innerHTML = `<article class="capsule-card"><h3>No capsules yet</h3><p>Your locked letters will appear here.</p></article>`;
    return;
  }

  const now = Date.now();
  els.capsuleList.innerHTML = state.capsules
    .map((capsule) => {
      const openable = new Date(capsule.unlock_at).getTime() <= now;
      return `
        <article class="capsule-card">
          <span class="${openable ? "openable" : "locked"}">${openable ? "READY TO OPEN" : "SEALED"}</span>
          <h3>${escapeHtml(capsule.title)}</h3>
          <p>For ${escapeHtml(capsule.recipient_name)} - Opens ${new Date(capsule.unlock_at).toLocaleString()}</p>
          <p>ID: ${capsule.id}</p>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

async function refreshData() {
  if (client && state.user) {
    const [{ data: capsules, error: capsuleError }, { data: pixels, error: pixelError }] = await Promise.all([
      client.from("capsules").select("*").order("created_at", { ascending: false }),
      client.from("reserved_pixels").select("*").order("created_at", { ascending: false })
    ]);

    if (capsuleError || pixelError) {
      showToast(capsuleError?.message || pixelError?.message || "Could not load Supabase data.");
    } else {
      state.capsules = capsules || [];
      state.pixels = pixels || [];
    }
  } else {
    state.capsules = loadLocal();
    state.pixels = state.capsules.map((capsule) => capsule.pixel);
  }

  renderCapsules();
  renderWall();
}

async function lockCapsule(event) {
  event.preventDefault();
  const unlockAt = new Date(els.unlockAt.value);
  if (Number.isNaN(unlockAt.getTime()) || unlockAt.getTime() <= Date.now()) {
    showToast("Choose a future unlock time.");
    return;
  }

  const id = uid();
  const pos = seededPosition(id);
  const capsule = {
    id,
    owner_id: state.user?.id || null,
    display_name: els.displayName.value.trim(),
    recipient_name: els.recipientName.value.trim(),
    title: els.capsuleTitle.value.trim(),
    body: els.capsuleBody.value.trim(),
    unlock_at: unlockAt.toISOString(),
    delivery_method: els.deliveryMethod.value,
    delivery_target: els.deliveryTarget.value.trim(),
    created_at: new Date().toISOString()
  };
  const pixel = {
    id: uid(),
    capsule_id: id,
    owner_id: state.user?.id || null,
    name: capsule.display_name,
    color: els.pixelColor.value,
    x: pos.x,
    y: pos.y,
    created_at: capsule.created_at
  };

  if (client && state.user) {
    const { body, ...capsuleRecord } = capsule;
    const letter = { capsule_id: id, owner_id: state.user.id, body };
    const { error: capsuleError } = await client.from("capsules").insert(capsuleRecord);
    const { error: letterError } = capsuleError
      ? { error: capsuleError }
      : await client.from("capsule_letters").insert(letter);
    const { error: pixelError } = capsuleError || letterError
      ? { error: capsuleError || letterError }
      : await client.from("reserved_pixels").insert(pixel);
    if (capsuleError || letterError || pixelError) {
      showToast(capsuleError?.message || letterError?.message || pixelError?.message || "Could not lock capsule.");
      return;
    }
  } else {
    const localCapsule = { ...capsule, pixel };
    const capsules = [localCapsule, ...loadLocal()];
    saveLocal(capsules);
  }

  els.unlockCapsuleId.value = id;
  els.unlockTarget.value = capsule.delivery_target;
  els.revealCapsuleId.value = id;
  els.capsuleForm.reset();
  setDefaultDate();
  await refreshData();
  showToast("Capsule locked. Pixel reserved on the wall.");
  location.hash = "#wall";
}

async function loginWithEmail(event) {
  event.preventDefault();
  if (!client) {
    showToast("Add Supabase keys to enable hosted login.");
    return;
  }
  const email = els.loginEmail.value.trim();
  if (!email) {
    showToast("Enter an email address.");
    return;
  }
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin }
  });
  showToast(error ? error.message : "Magic link sent.");
}

async function loginWithPhone() {
  if (!client) {
    showToast("Add Supabase keys to enable phone OTP.");
    return;
  }
  const phone = els.loginPhone.value.trim();
  if (!phone) {
    showToast("Enter a phone number.");
    return;
  }
  const { error } = await client.auth.signInWithOtp({ phone });
  showToast(error ? error.message : "Phone OTP sent.");
}

async function requestUnlock(event) {
  event.preventDefault();
  const capsuleId = els.unlockCapsuleId.value.trim();
  const target = els.unlockTarget.value.trim();
  if (!capsuleId || !target) {
    showToast("Enter the capsule ID and delivery address.");
    return;
  }

  if (!hasSupabase) {
    const capsule = loadLocal().find((item) => item.id === capsuleId);
    if (!capsule) {
      showToast("Capsule not found in local demo mode.");
      return;
    }
    if (new Date(capsule.unlock_at).getTime() > Date.now()) {
      showToast("This capsule is still sealed.");
      return;
    }
    showToast(`Demo unlock password: ${capsule.id.slice(0, 8).toUpperCase()}`);
    return;
  }

  const response = await fetch("/.netlify/functions/send-unlock-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capsuleId, target })
  });
  const payload = await response.json().catch(() => ({}));
  showToast(payload.message || (response.ok ? "Unlock password sent." : "Could not send unlock password."));
}

async function revealCapsule(event) {
  event.preventDefault();
  const capsuleId = els.revealCapsuleId.value.trim();
  const password = els.secretPassword.value.trim();
  if (!capsuleId || !password) {
    showToast("Enter the capsule ID and secret password.");
    return;
  }

  if (!hasSupabase) {
    const capsule = loadLocal().find((item) => item.id === capsuleId);
    if (!capsule) {
      showToast("Capsule not found in local demo mode.");
      return;
    }
    if (new Date(capsule.unlock_at).getTime() > Date.now()) {
      showToast("This capsule is still sealed.");
      return;
    }
    if (password !== capsule.id.slice(0, 8).toUpperCase()) {
      showToast("Secret password does not match.");
      return;
    }
    showReveal(capsule);
    return;
  }

  const response = await fetch("/.netlify/functions/reveal-capsule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capsuleId, password })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(payload.message || "Could not open capsule.");
    return;
  }
  showReveal(payload.capsule);
}

function showReveal(capsule) {
  els.revealBox.hidden = false;
  els.revealBox.innerHTML = `
    <span class="openable">OPENED</span>
    <h3>${escapeHtml(capsule.title)}</h3>
    <p>For ${escapeHtml(capsule.recipient_name || "future xyz")}</p>
    <div class="letter">${escapeHtml(capsule.body).replace(/\n/g, "<br>")}</div>
  `;
  showToast("Capsule opened.");
}

function bindWallControls() {
  els.pixelWall.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.dragStart = {
      x: event.clientX,
      y: event.clientY,
      ox: state.wallOffset.x,
      oy: state.wallOffset.y
    };
    els.pixelWall.setPointerCapture(event.pointerId);
  });

  els.pixelWall.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    state.wallOffset.x = state.dragStart.ox + event.clientX - state.dragStart.x;
    state.wallOffset.y = state.dragStart.oy + event.clientY - state.dragStart.y;
    renderWall();
  });

  els.pixelWall.addEventListener("pointerup", () => {
    state.dragging = false;
  });

  els.randomPixel.addEventListener("click", () => {
    state.wallOffset.x = Math.round((Math.random() - 0.5) * 1400);
    state.wallOffset.y = Math.round((Math.random() - 0.5) * 900);
    renderWall();
  });

  els.centerWall.addEventListener("click", () => {
    state.wallOffset = { x: 0, y: 0 };
    renderWall();
  });
}

async function initAuth() {
  if (!client) return;
  const { data } = await client.auth.getSession();
  state.user = data.session?.user || null;
  client.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user || null;
    els.authAction.textContent = state.user ? "Logout" : "Login";
    refreshData();
  });
  els.authAction.textContent = state.user ? "Logout" : "Login";
}

function bindEvents() {
  els.authAction.addEventListener("click", async () => {
    if (state.user && client) {
      await client.auth.signOut();
      showToast("Logged out.");
      return;
    }
    els.loginPanel.hidden = !els.loginPanel.hidden;
  });
  els.loginForm.addEventListener("submit", loginWithEmail);
  els.phoneLogin.addEventListener("click", loginWithPhone);
  els.capsuleForm.addEventListener("submit", lockCapsule);
  els.unlockForm.addEventListener("submit", requestUnlock);
  els.revealForm.addEventListener("submit", revealCapsule);
  bindWallControls();
}

async function boot() {
  renderHeroGrid();
  setDefaultDate();
  bindEvents();
  await initAuth();
  await refreshData();
}

boot();
