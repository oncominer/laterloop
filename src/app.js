const config = {
  supabaseUrl: window.SUPABASE_URL || "",
  supabaseAnonKey: window.SUPABASE_ANON_KEY || ""
};

const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
const client = hasSupabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

const state = {
  capsules: [],
  pixels: [],
  wallOffset: { x: 0, y: 0 },
  wallZoom: 1,
  wallTouched: false,
  dragging: false,
  dragStart: null
};

const $ = (selector) => document.querySelector(selector);

const els = {
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
  zoomOutWall: $("#zoomOutWall"),
  zoomInWall: $("#zoomInWall"),
  wallZoom: $("#wallZoom"),
  wallPosition: $("#wallPosition"),
  capsuleList: $("#capsuleList"),
  revealForm: $("#revealForm"),
  revealCapsuleId: $("#revealCapsuleId"),
  secretPassword: $("#secretPassword"),
  revealBox: $("#revealBox"),
  sealDialog: $("#sealDialog"),
  sealWarningText: $("#sealWarningText"),
  cancelSeal: $("#cancelSeal"),
  confirmSeal: $("#confirmSeal"),
  toast: $("#toast"),
  heroGrid: $("#heroGrid")
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 3600);
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
  els.wallZoom.textContent = `${Math.round(state.wallZoom * 100)}%`;
}

function nextPixelPosition(existingPixels) {
  const reserved = new Set(existingPixels.map((pixel) => `${pixel.x},${pixel.y}`));
  if (!reserved.has("0,0")) return { x: 0, y: 0 };

  const step = 22;
  for (let radius = 1; radius < 500; radius += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== radius) continue;
        const position = { x: x * step, y: y * step };
        if (!reserved.has(`${position.x},${position.y}`)) return position;
      }
    }
  }

  return { x: 0, y: 0 };
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
    const marker = document.createElement("button");
    marker.className = "reserved-marker";
    marker.type = "button";
    marker.dataset.name = pixel.name;
    marker.dataset.capsuleId = pixel.capsule_id;
    marker.title = `${pixel.name} reserved this pixel`;
    marker.style.color = pixel.color;
    const x = pixel.x * state.wallZoom + state.wallOffset.x;
    const y = pixel.y * state.wallZoom + state.wallOffset.y;
    marker.style.left = `calc(50% + ${x}px)`;
    marker.style.top = `calc(50% + ${y}px)`;
    marker.style.transform = `translate(-50%, -50%) scale(${state.wallZoom})`;
    marker.innerHTML = `<span class="reserved-pixel"></span><span class="pixel-name">${escapeHtml(pixel.name)}</span>`;
    els.pixelWall.append(marker);
  });

  sectorText();
}

function centerOnPixel(pixel) {
  if (!pixel) return;
  state.wallOffset = { x: -pixel.x * state.wallZoom, y: -pixel.y * state.wallZoom };
}

function focusCapsulePixel(capsuleId) {
  const pixel = state.pixels.find((item) => item.capsule_id === capsuleId);
  if (!pixel) {
    showToast("That capsule does not have a visible pixel yet.");
    return;
  }
  state.wallTouched = true;
  centerOnPixel(pixel);
  renderWall();
  location.hash = "#wall";
}

function setWallZoom(nextZoom) {
  const previousZoom = state.wallZoom;
  if (nextZoom === previousZoom) return;
  const scale = nextZoom / previousZoom;
  state.wallOffset = {
    x: Number((state.wallOffset.x * scale).toFixed(2)),
    y: Number((state.wallOffset.y * scale).toFixed(2))
  };
  state.wallZoom = nextZoom;
}

function renderCapsules() {
  els.lockedCount.textContent = state.capsules.length;
  els.pixelCount.textContent = state.pixels.length;

  if (!state.capsules.length) {
    els.capsuleList.innerHTML = `<article class="capsule-card"><h3>No capsules yet</h3><p>Lock a capsule to reserve a pixel and receive a capsule ID.</p></article>`;
    return;
  }

  const now = Date.now();
  els.capsuleList.innerHTML = state.capsules
    .map((capsule) => {
      const openable = new Date(capsule.unlock_at).getTime() <= now;
      const pixel = state.pixels.find((item) => item.capsule_id === capsule.id);
      return `
        <article class="capsule-card capsule-log" data-capsule-id="${capsule.id}">
          <span class="${openable ? "openable" : "locked"}">${openable ? "READY TO OPEN" : "SEALED"}</span>
          <h3>${escapeHtml(capsule.title)}</h3>
          <p>Written by ${escapeHtml(capsule.display_name || pixel?.name || "Anonymous")}</p>
          <p>For ${escapeHtml(capsule.recipient_name)} - Opens ${new Date(capsule.unlock_at).toLocaleString()}</p>
          <p>ID: ${capsule.id}</p>
          <button class="ghost-button locate-pixel" type="button" data-capsule-id="${capsule.id}">View Pixel</button>
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
  if (client) {
    const [{ data: capsules, error: capsuleError }, { data: pixels, error: pixelError }] = await Promise.all([
      client.from("capsules").select("id,display_name,recipient_name,title,unlock_at,created_at,unlock_password_sent_at").order("created_at", { ascending: false }).limit(10),
      client.from("reserved_pixels").select("*").order("created_at", { ascending: false })
    ]);

    if (capsuleError || pixelError) {
      showToast(capsuleError?.message || pixelError?.message || "Could not load Supabase data.");
    } else {
      state.capsules = capsules || [];
      state.pixels = pixels || [];
      if (state.pixels.length && !state.wallTouched) {
        centerOnPixel(state.pixels[0]);
      }
    }
  } else {
    state.capsules = [];
    state.pixels = [];
  }

  renderCapsules();
  renderWall();
}

async function lockCapsule(event) {
  event.preventDefault();
  const confirmed = await confirmSealWarning();
  if (!confirmed) return;
  if (!client) {
    showToast("Supabase is not configured yet.");
    return;
  }
  const unlockAt = new Date(els.unlockAt.value);
  if (Number.isNaN(unlockAt.getTime()) || unlockAt.getTime() <= Date.now()) {
    showToast("Choose a future unlock time.");
    return;
  }

  const id = uid();
  const { data: existingPixels, error: existingPixelError } = await client
    .from("reserved_pixels")
    .select("x,y");
  if (existingPixelError) {
    showToast(existingPixelError.message || "Could not inspect the pixel wall.");
    return;
  }
  const pos = nextPixelPosition(existingPixels || []);
  const capsule = {
    id,
    owner_id: null,
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
    owner_id: null,
    name: capsule.display_name,
    color: els.pixelColor.value,
    x: pos.x,
    y: pos.y,
    created_at: capsule.created_at
  };

  const { body, ...capsuleRecord } = capsule;
  const letter = { capsule_id: id, owner_id: null, body };
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

  els.revealCapsuleId.value = id;
  els.capsuleForm.reset();
  setDefaultDate();
  centerOnPixel(pixel);
  state.wallTouched = false;
  await refreshData();
  showToast("Capsule locked. Pixel reserved on the wall.");
  location.hash = "#wall";
}

function confirmSealWarning() {
  const unlockAt = new Date(els.unlockAt.value);
  const unlockLabel = Number.isNaN(unlockAt.getTime())
    ? "the selected release date"
    : unlockAt.toLocaleString();

  els.sealWarningText.textContent =
    `Once sealed, this capsule cannot be opened until ${unlockLabel}. ` +
    "The secret password will only be sent after that time arrives.";

  if (!els.sealDialog?.showModal) {
    return Promise.resolve(window.confirm(els.sealWarningText.textContent));
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      els.confirmSeal.removeEventListener("click", onConfirm);
      els.cancelSeal.removeEventListener("click", onCancel);
      els.sealDialog.removeEventListener("cancel", onCancel);
    };
    const onConfirm = () => {
      cleanup();
      els.sealDialog.close();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      els.sealDialog.close();
      resolve(false);
    };

    els.confirmSeal.addEventListener("click", onConfirm);
    els.cancelSeal.addEventListener("click", onCancel);
    els.sealDialog.addEventListener("cancel", onCancel);
    els.sealDialog.showModal();
  });
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
    showToast("Supabase is not configured yet.");
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
    state.wallTouched = true;
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
    state.wallTouched = true;
    if (!state.pixels.length) {
      showToast("No pixels are reserved yet.");
      return;
    }
    const pixel = state.pixels[Math.floor(Math.random() * state.pixels.length)];
    centerOnPixel(pixel);
    renderWall();
  });

  els.centerWall.addEventListener("click", () => {
    state.wallTouched = true;
    state.wallOffset = { x: 0, y: 0 };
    renderWall();
  });

  els.zoomOutWall.addEventListener("click", () => {
    state.wallTouched = true;
    setWallZoom(Math.max(0.35, Number((state.wallZoom - 0.15).toFixed(2))));
    renderWall();
  });

  els.zoomInWall.addEventListener("click", () => {
    state.wallTouched = true;
    setWallZoom(Math.min(2, Number((state.wallZoom + 0.15).toFixed(2))));
    renderWall();
  });
}

function bindEvents() {
  els.capsuleForm.addEventListener("submit", lockCapsule);
  els.revealForm.addEventListener("submit", revealCapsule);
  els.capsuleList.addEventListener("click", (event) => {
    const target = event.target.closest(".capsule-log");
    if (!target) return;
    focusCapsulePixel(target.dataset.capsuleId);
  });
  bindWallControls();
}

async function boot() {
  renderHeroGrid();
  setDefaultDate();
  bindEvents();
  await refreshData();
}

boot();
