/**
 * Aplicación de gestión para secretaría de iglesia (solo cliente).
 * - Sin frameworks (HTML/CSS/JS)
 * - Persistencia con localStorage
 * - Sesión con sessionStorage
 *
 * Estructura de datos (claves localStorage):
 * - church_events:          Array<Event>
 * - church_birthdays:       Array<Birthday>
 * - church_weekly_plan:     Object<weekStartIso, { days: Array<Array<Activity>> }>
 * - church_members:         Array<Member>
 * - church_special_dates:   Array<SpecialDate>
 * - church_notes:           Array<Note>
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // PWA: Service Worker
  // ---------------------------------------------------------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((err) => {
        console.warn("Service Worker no se pudo registrar:", err);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Claves de almacenamiento
  // ---------------------------------------------------------------------------
  // Seguridad: guardamos hash SHA-256 en vez de contraseña en texto plano
  const LS_PASSWORD = "church_secretary_password"; // legado (texto plano) para migración automática
  const LS_PASSWORD_HASH = "church_secretary_password_hash";
  const LS_RECOVERY = "church_secretary_recovery_v1";
  const SS_AUTH = "church_secretary_authenticated";
  const LS_CHURCH_NAME = "church_name";

  const LS_EVENTS = "church_events";
  const LS_BIRTHDAYS = "church_birthdays";
  const LS_WEEKLY = "church_weekly_plan";
  const LS_MEMBERS = "church_members";
  const LS_SPECIAL = "church_special_dates";
  const LS_NOTES = "church_notes";

  // ---------------------------------------------------------------------------
  // Catálogos (etiquetas / iconos / colores)
  // ---------------------------------------------------------------------------
  const EVENT_TYPES = {
    service: { label: "Culto / Servicio", icon: "fa-solid fa-hands-praying" },
    meeting: { label: "Reunión", icon: "fa-solid fa-users" },
    youth: { label: "Jóvenes", icon: "fa-solid fa-child-reaching" },
    special: { label: "Evento especial", icon: "fa-solid fa-star" },
  };

  const SPECIAL_TYPES = {
    baptism: { label: "Bautismo", icon: "fa-solid fa-water", labelClass: "label--baptism" },
    presentation: { label: "Presentación", icon: "fa-solid fa-baby", labelClass: "label--presentation" },
    wedding: { label: "Boda", icon: "fa-solid fa-ring", labelClass: "label--wedding" },
    election: { label: "Elecciones", icon: "fa-solid fa-check-to-slot", labelClass: "label--election" },
  };

  const WEEKDAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  // ---------------------------------------------------------------------------
  // DOM: autenticación
  // ---------------------------------------------------------------------------
  const authScreen = document.getElementById("auth-screen");
  const nameForm = document.getElementById("name-form");
  const setupForm = document.getElementById("setup-form");
  const loginForm = document.getElementById("login-form");
  const churchNameInput = document.getElementById("church-name-input");
  const nameError = document.getElementById("name-error");
  const setupPass = document.getElementById("setup-pass");
  const setupPass2 = document.getElementById("setup-pass2");
  const setupError = document.getElementById("setup-error");
  const loginPass = document.getElementById("login-pass");
  const loginError = document.getElementById("login-error");
  const btnForgotPass = document.getElementById("btn-forgot-pass");

  // DOM: recuperación / reset
  const setupRecoveryType = document.getElementById("recovery-type");
  const setupRecoveryQuestionFields = document.getElementById("recovery-question-fields");
  const setupRecoveryPhraseFields = document.getElementById("recovery-phrase-fields");
  const setupRecoveryQuestion = document.getElementById("recovery-question");
  const setupRecoveryAnswer = document.getElementById("recovery-answer");
  const setupRecoveryPhrase = document.getElementById("recovery-phrase");

  const recoveryForm = document.getElementById("recovery-form");
  const recoveryPromptQuestion = document.getElementById("recovery-prompt-question");
  const recoveryPromptPhrase = document.getElementById("recovery-prompt-phrase");
  const recoveryQuestionLabel = document.getElementById("recovery-question-label");
  const recoveryAnswerCheck = document.getElementById("recovery-answer-check");
  const recoveryPhraseCheck = document.getElementById("recovery-phrase-check");
  const resetPass = document.getElementById("reset-pass");
  const resetPass2 = document.getElementById("reset-pass2");
  const recoveryError = document.getElementById("recovery-error");
  const btnRecoveryCancel = document.getElementById("btn-recovery-cancel");

  // DOM: nombre visible
  const uiChurchNameAuth = document.getElementById("ui-church-name-auth");
  const uiChurchNameHeader = document.getElementById("ui-church-name-header");

  // DOM: shell / navegación
  const appEl = document.getElementById("app");
  const btnSettings = document.getElementById("btn-settings");
  const btnLogout = document.getElementById("btn-logout");
  const sidebar = document.getElementById("sidebar");
  const btnNavToggle = document.getElementById("btn-nav-toggle");
  const navItems = Array.from(document.querySelectorAll(".nav-item"));

  // DOM: backup
  const btnExport = document.getElementById("btn-export");
  const importFile = document.getElementById("import-file");

  // Recordatorios de respaldo
  const LS_LAST_EXPORT_AT = "church_last_export_at";
  const LS_LAST_BACKUP_NAG_AT = "church_last_backup_nag_at";

  // DOM: vistas
  const views = {
    events: document.getElementById("view-events"),
    calendar: document.getElementById("view-calendar"),
    weekly: document.getElementById("view-weekly"),
    members: document.getElementById("view-members"),
    special: document.getElementById("view-special"),
    notes: document.getElementById("view-notes"),
  };

  // DOM: eventos
  const btnNewEvent = document.getElementById("btn-new-event");
  const searchInput = document.getElementById("search-input");
  const emptyMessage = document.getElementById("empty-message");
  const eventsList = document.getElementById("events-list");

  // DOM: calendario (eventos + cumpleaños)
  const btnNewBirthday = document.getElementById("btn-new-birthday");
  const btnAddBirthdayToDay = document.getElementById("btn-add-birthday-to-day");
  const dayPanelEmpty = document.getElementById("day-panel-empty");
  const dayPanelContent = document.getElementById("day-panel-content");
  const dayEventsTitle = document.getElementById("day-events-title");
  const dayEventsList = document.getElementById("day-events-list");
  const dayBirthdaysList = document.getElementById("day-birthdays-list");
  const dayEventsClose = document.getElementById("day-events-close");
  const calMonthLabel = document.getElementById("cal-month-label");
  const calendarGrid = document.getElementById("calendar-grid");
  const calPrev = document.getElementById("cal-prev");
  const calNext = document.getElementById("cal-next");

  // DOM: plan semanal
  const weeklyGrid = document.getElementById("weekly-grid");
  const weekPrev = document.getElementById("week-prev");
  const weekNext = document.getElementById("week-next");
  const weekRange = document.getElementById("week-range");

  // DOM: miembros
  const btnNewMember = document.getElementById("btn-new-member");
  const membersSearch = document.getElementById("members-search");
  const membersEmpty = document.getElementById("members-empty");
  const membersList = document.getElementById("members-list");

  // DOM: fechas especiales
  const btnNewSpecial = document.getElementById("btn-new-special");
  const specialEmpty = document.getElementById("special-empty");
  const specialList = document.getElementById("special-list");

  // DOM: notas
  const btnNewNote = document.getElementById("btn-new-note");
  const notesSearch = document.getElementById("notes-search");
  const notesEmpty = document.getElementById("notes-empty");
  const notesList = document.getElementById("notes-list");

  // DOM: modal evento (ya existente)
  const eventModalOverlay = document.getElementById("modal-overlay");
  const eventModalTitle = document.getElementById("modal-title");
  const eventForm = document.getElementById("event-form");
  const eventIdInput = document.getElementById("event-id");
  const eventTitle = document.getElementById("event-title");
  const eventDate = document.getElementById("event-date");
  const eventTime = document.getElementById("event-time");
  const eventType = document.getElementById("event-type");
  const eventDescription = document.getElementById("event-description");
  const eventFormError = document.getElementById("form-error");
  const eventModalClose = document.getElementById("modal-close");
  const eventFormCancel = document.getElementById("form-cancel");

  // DOM: modal cumpleaños
  const birthdayOverlay = document.getElementById("birthday-modal-overlay");
  const birthdayModalTitle = document.getElementById("birthday-modal-title");
  const birthdayClose = document.getElementById("birthday-modal-close");
  const birthdayForm = document.getElementById("birthday-form");
  const birthdayId = document.getElementById("birthday-id");
  const birthdayName = document.getElementById("birthday-name");
  const birthdayDate = document.getElementById("birthday-date");
  const birthdayError = document.getElementById("birthday-error");
  const birthdayCancel = document.getElementById("birthday-cancel");

  // DOM: modal semanal
  const weeklyOverlay = document.getElementById("weekly-modal-overlay");
  const weeklyModalTitle = document.getElementById("weekly-modal-title");
  const weeklyClose = document.getElementById("weekly-modal-close");
  const weeklyForm = document.getElementById("weekly-form");
  const weeklyWeekStart = document.getElementById("weekly-weekstart");
  const weeklyDayIndex = document.getElementById("weekly-dayindex");
  const weeklyActivityId = document.getElementById("weekly-activity-id");
  const weeklyActivityTitle = document.getElementById("weekly-activity-title");
  const weeklyActivityTime = document.getElementById("weekly-activity-time");
  const weeklyActivityTag = document.getElementById("weekly-activity-tag");
  const weeklyActivityNotes = document.getElementById("weekly-activity-notes");
  const weeklyError = document.getElementById("weekly-error");
  const weeklyCancel = document.getElementById("weekly-cancel");

  // DOM: modal miembro
  const memberOverlay = document.getElementById("member-modal-overlay");
  const memberModalTitle = document.getElementById("member-modal-title");
  const memberClose = document.getElementById("member-modal-close");
  const memberForm = document.getElementById("member-form");
  const memberId = document.getElementById("member-id");
  const memberName = document.getElementById("member-name");
  const memberPhone = document.getElementById("member-phone");
  const memberRole = document.getElementById("member-role");
  const memberError = document.getElementById("member-error");
  const memberCancel = document.getElementById("member-cancel");

  // DOM: modal fecha especial
  const specialOverlay = document.getElementById("special-modal-overlay");
  const specialModalTitle = document.getElementById("special-modal-title");
  const specialClose = document.getElementById("special-modal-close");
  const specialForm = document.getElementById("special-form");
  const specialId = document.getElementById("special-id");
  const specialType = document.getElementById("special-type");
  const specialDate = document.getElementById("special-date");
  const specialDescription = document.getElementById("special-description");
  const specialError = document.getElementById("special-error");
  const specialCancel = document.getElementById("special-cancel");

  // DOM: modal nota
  const noteOverlay = document.getElementById("note-modal-overlay");
  const noteModalTitle = document.getElementById("note-modal-title");
  const noteClose = document.getElementById("note-modal-close");
  const noteForm = document.getElementById("note-form");
  const noteId = document.getElementById("note-id");
  const noteTitle = document.getElementById("note-title");
  const noteDate = document.getElementById("note-date");
  const noteContent = document.getElementById("note-content");
  const noteError = document.getElementById("note-error");
  const noteCancel = document.getElementById("note-cancel");

  // DOM: modal ajustes
  const settingsOverlay = document.getElementById("settings-modal-overlay");
  const settingsClose = document.getElementById("settings-modal-close");
  const settingsForm = document.getElementById("settings-form");
  const settingsChurchName = document.getElementById("settings-church-name");
  const settingsError = document.getElementById("settings-error");
  const settingsCancel = document.getElementById("settings-cancel");

  // DOM: inyectaremos un botón de "Restablecer contraseña" en Ajustes
  let btnResetPassword = null;

  function applySetupRecoveryUi() {
    const type = String(setupRecoveryType.value || "");
    setupRecoveryQuestionFields.classList.toggle("hidden", type !== "question");
    setupRecoveryPhraseFields.classList.toggle("hidden", type !== "phrase");
  }

  setupRecoveryType.addEventListener("change", applySetupRecoveryUi);

  // ---------------------------------------------------------------------------
  // Estado de UI
  // ---------------------------------------------------------------------------
  let activeView = "events";
  let calendarView = new Date();
  let selectedDayIso = null;
  let weeklyWeekStartIso = getWeekStartIso(new Date());

  // ---------------------------------------------------------------------------
  // Utilidades generales
  // ---------------------------------------------------------------------------
  function normalizeChurchName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  }

  function getChurchName() {
    return normalizeChurchName(localStorage.getItem(LS_CHURCH_NAME) || "");
  }

  function setChurchName(name) {
    const normalized = normalizeChurchName(name);
    if (!normalized) return false;
    localStorage.setItem(LS_CHURCH_NAME, normalized);
    applyChurchNameToUi();
    return true;
  }

  function applyChurchNameToUi() {
    const name = getChurchName() || "Sistema Iglesia";
    if (uiChurchNameAuth) uiChurchNameAuth.textContent = name;
    if (uiChurchNameHeader) uiChurchNameHeader.textContent = name;
    document.title = name + " — Secretaría";
  }

  function generateId(prefix) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function safeJsonParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function loadArray(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = safeJsonParse(raw, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function saveArray(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr));
  }

  function loadObject(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = safeJsonParse(raw, fallback);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  }

  function saveObject(key, obj) {
    localStorage.setItem(key, JSON.stringify(obj));
  }

  function parseLocalDateTime(dateStr, timeStr) {
    const [y, m, d] = String(dateStr || "").split("-").map(Number);
    const [hh, mm] = String(timeStr || "00:00").split(":").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  }

  function sortByDateTimeAsc(arr, dateKey, timeKey) {
    return [...arr].sort((a, b) => {
      const da = parseLocalDateTime(a[dateKey], a[timeKey]).getTime();
      const db = parseLocalDateTime(b[dateKey], b[timeKey]).getTime();
      return da - db;
    });
  }

  function formatDateDisplay(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  function todayIso() {
    const t = new Date();
    return (
      t.getFullYear() +
      "-" +
      String(t.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(t.getDate()).padStart(2, "0")
    );
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text ?? "");
    return div.innerHTML;
  }

  function isUpcomingEvent(ev) {
    return parseLocalDateTime(ev.date, ev.time).getTime() >= Date.now();
  }

  function filterByQuery(arr, query, getter) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return arr;
    return arr.filter((x) => getter(x).toLowerCase().includes(q));
  }

  // ---------------------------------------------------------------------------
  // Autenticación
  // ---------------------------------------------------------------------------
  /**
   * Calcula SHA-256 (hex) usando WebCrypto (disponible en navegadores modernos).
   * Esto NO hace la app “invulnerable”, pero evita guardar la contraseña en claro.
   */
  async function sha256Hex(text) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function normalizeRecoverySecret(raw) {
    return String(raw || "").trim().replace(/\s+/g, " ");
  }

  function getRecoveryConfig() {
    const parsed = safeJsonParse(localStorage.getItem(LS_RECOVERY), null);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.v !== 1) return null;
    if (parsed.type !== "question" && parsed.type !== "phrase") return null;
    if (typeof parsed.answerHash !== "string" || parsed.answerHash.length < 10) return null;
    if (parsed.type === "question" && typeof parsed.question !== "string") return null;
    return parsed;
  }

  function setRecoveryConfig(cfg) {
    localStorage.setItem(LS_RECOVERY, JSON.stringify(cfg));
  }

  function clearStoredPasswordOnly() {
    localStorage.removeItem(LS_PASSWORD_HASH);
    localStorage.removeItem(LS_PASSWORD);
    clearSession();
  }

  function getStoredPasswordHash() {
    return localStorage.getItem(LS_PASSWORD_HASH);
  }

  function setStoredPasswordHash(hashHex) {
    localStorage.setItem(LS_PASSWORD_HASH, hashHex);
  }

  /**
   * Migración automática:
   * - Si existe contraseña en claro (LS_PASSWORD) y no existe hash, la convertimos a hash y borramos el valor en claro.
   */
  async function migratePlainPasswordIfNeeded() {
    const hash = getStoredPasswordHash();
    if (hash) return;
    const plain = localStorage.getItem(LS_PASSWORD);
    if (!plain) return;
    try {
      const newHash = await sha256Hex(plain);
      setStoredPasswordHash(newHash);
      localStorage.removeItem(LS_PASSWORD);
    } catch (e) {
      console.warn("No se pudo migrar contraseña a hash:", e);
    }
  }

  function isSessionAuthenticated() {
    return sessionStorage.getItem(SS_AUTH) === "1";
  }

  function setSessionAuthenticated() {
    sessionStorage.setItem(SS_AUTH, "1");
  }

  function clearSession() {
    sessionStorage.removeItem(SS_AUTH);
  }

  function showAuthForms() {
    const hasPassword = !!getStoredPasswordHash() || !!localStorage.getItem(LS_PASSWORD);
    const hasName = !!getChurchName();

    // Si falta el nombre, forzamos configuración inicial de nombre (una vez por instalación).
    nameForm.classList.toggle("hidden", hasName);
    setupForm.classList.toggle("hidden", !hasName || hasPassword);
    loginForm.classList.toggle("hidden", !hasName || !hasPassword);
    recoveryForm.classList.add("hidden");

    authScreen.classList.remove("hidden");
    authScreen.setAttribute("aria-hidden", "false");
    appEl.classList.add("hidden");
    appEl.setAttribute("aria-hidden", "true");

    nameError.textContent = "";
    setupError.textContent = "";
    loginError.textContent = "";

    if (!hasName) {
      churchNameInput.value = "";
      churchNameInput.focus();
    } else if (!hasPassword) {
      setupPass.value = "";
      setupPass2.value = "";
      setupRecoveryType.value = "";
      setupRecoveryQuestion.value = "";
      setupRecoveryAnswer.value = "";
      setupRecoveryPhrase.value = "";
      setupRecoveryQuestionFields.classList.add("hidden");
      setupRecoveryPhraseFields.classList.add("hidden");
      setupPass.focus();
    } else {
      loginPass.value = "";
      loginPass.focus();
    }
  }

  function showApp() {
    authScreen.classList.add("hidden");
    authScreen.setAttribute("aria-hidden", "true");
    appEl.classList.remove("hidden");
    appEl.setAttribute("aria-hidden", "false");
    showView("events");
    refreshAll();
  }

  async function initAuth() {
    applyChurchNameToUi();
    // Asegura que si la app venía de una versión antigua, se migre la contraseña.
    await migratePlainPasswordIfNeeded();
    if (isSessionAuthenticated()) showApp();
    else showAuthForms();
  }

  nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    nameError.textContent = "";
    const ok = setChurchName(churchNameInput.value);
    if (!ok) return void (nameError.textContent = "Escriba un nombre válido.");
    // Tras guardar nombre, volvemos a mostrar el flujo normal (setup de contraseña o login).
    showAuthForms();
  });

  setupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setupError.textContent = "";
    const p1 = setupPass.value;
    const p2 = setupPass2.value;
    if (p1.length < 4) return void (setupError.textContent = "La contraseña debe tener al menos 4 caracteres.");
    if (p1 !== p2) return void (setupError.textContent = "Las contraseñas no coinciden.");

    const recoveryType = String(setupRecoveryType.value || "");
    if (recoveryType !== "question" && recoveryType !== "phrase") {
      return void (setupError.textContent = "Seleccione una opción de recuperación (pregunta o frase).");
    }

    let recoveryCfg = null;
    if (recoveryType === "question") {
      const q = normalizeRecoverySecret(setupRecoveryQuestion.value);
      const a = normalizeRecoverySecret(setupRecoveryAnswer.value);
      if (q.length < 6) return void (setupError.textContent = "Escriba una pregunta de seguridad (mín. 6 caracteres).");
      if (a.length < 3) return void (setupError.textContent = "Escriba una respuesta (mín. 3 caracteres).");
      try {
        const answerHash = await sha256Hex(a.toLowerCase());
        recoveryCfg = { v: 1, type: "question", question: q, answerHash };
      } catch {
        return void (setupError.textContent = "No se pudo guardar la recuperación en este navegador.");
      }
    } else {
      const phrase = normalizeRecoverySecret(setupRecoveryPhrase.value);
      if (phrase.length < 6) return void (setupError.textContent = "La frase debe tener al menos 6 caracteres.");
      try {
        const answerHash = await sha256Hex(phrase.toLowerCase());
        recoveryCfg = { v: 1, type: "phrase", answerHash };
      } catch {
        return void (setupError.textContent = "No se pudo guardar la recuperación en este navegador.");
      }
    }
    try {
      const hash = await sha256Hex(p1);
      setStoredPasswordHash(hash);
      localStorage.removeItem(LS_PASSWORD); // por si existía algo viejo
      if (recoveryCfg) setRecoveryConfig(recoveryCfg);
    } catch {
      setupError.textContent = "No se pudo guardar la contraseña en este navegador.";
      return;
    }
    setSessionAuthenticated();
    showApp();
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    await migratePlainPasswordIfNeeded();
    const storedHash = getStoredPasswordHash();
    if (!storedHash) return void (loginError.textContent = "No hay contraseña configurada. Cierre y abra la app.");
    try {
      const inputHash = await sha256Hex(loginPass.value);
      if (inputHash !== storedHash) return void (loginError.textContent = "Contraseña incorrecta.");
    } catch {
      return void (loginError.textContent = "No se pudo verificar la contraseña en este navegador.");
    }
    setSessionAuthenticated();
    showApp();
  });

  function showRecoveryReset() {
    loginError.textContent = "";
    recoveryError.textContent = "";
    const cfg = getRecoveryConfig();
    if (!cfg) {
      return void alert(
        "No hay recuperación configurada en este navegador.\n\nSi usted ya está dentro de la app, vaya a Ajustes y restablezca la contraseña desde allí."
      );
    }

    nameForm.classList.add("hidden");
    setupForm.classList.add("hidden");
    loginForm.classList.add("hidden");
    recoveryForm.classList.remove("hidden");

    recoveryPromptQuestion.classList.toggle("hidden", cfg.type !== "question");
    recoveryPromptPhrase.classList.toggle("hidden", cfg.type !== "phrase");

    recoveryAnswerCheck.value = "";
    recoveryPhraseCheck.value = "";
    resetPass.value = "";
    resetPass2.value = "";

    if (cfg.type === "question") {
      recoveryQuestionLabel.textContent = cfg.question || "Pregunta de seguridad";
      recoveryAnswerCheck.focus();
    } else {
      recoveryPhraseCheck.focus();
    }
  }

  btnForgotPass.addEventListener("click", showRecoveryReset);
  btnRecoveryCancel.addEventListener("click", () => {
    recoveryForm.classList.add("hidden");
    showAuthForms();
  });

  recoveryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    recoveryError.textContent = "";
    await migratePlainPasswordIfNeeded();

    const cfg = getRecoveryConfig();
    if (!cfg) return void (recoveryError.textContent = "No hay recuperación configurada en este navegador.");

    const p1 = resetPass.value;
    const p2 = resetPass2.value;
    if (p1.length < 4) return void (recoveryError.textContent = "La contraseña debe tener al menos 4 caracteres.");
    if (p1 !== p2) return void (recoveryError.textContent = "Las contraseñas no coinciden.");

    const provided =
      cfg.type === "question" ? normalizeRecoverySecret(recoveryAnswerCheck.value) : normalizeRecoverySecret(recoveryPhraseCheck.value);
    if (!provided) return void (recoveryError.textContent = "Ingrese el dato de recuperación.");

    try {
      const providedHash = await sha256Hex(provided.toLowerCase());
      if (providedHash !== cfg.answerHash) return void (recoveryError.textContent = "Recuperación incorrecta.");
    } catch {
      return void (recoveryError.textContent = "No se pudo verificar la recuperación en este navegador.");
    }

    try {
      const newHash = await sha256Hex(p1);
      setStoredPasswordHash(newHash);
      localStorage.removeItem(LS_PASSWORD);
    } catch {
      return void (recoveryError.textContent = "No se pudo guardar la nueva contraseña en este navegador.");
    }

    setSessionAuthenticated();
    showApp();
  });

  btnLogout.addEventListener("click", () => {
    clearSession();
    showAuthForms();
  });

  // ---------------------------------------------------------------------------
  // Ajustes (cambiar nombre visible)
  // ---------------------------------------------------------------------------
  function openSettings() {
    settingsError.textContent = "";
    settingsChurchName.value = getChurchName() || "";
    ensureResetPasswordButton();
    openOverlay(settingsOverlay, settingsChurchName);
  }

  btnSettings.addEventListener("click", openSettings);
  settingsClose.addEventListener("click", () => closeOverlay(settingsOverlay));
  settingsCancel.addEventListener("click", () => closeOverlay(settingsOverlay));

  settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    settingsError.textContent = "";
    const ok = setChurchName(settingsChurchName.value);
    if (!ok) return void (settingsError.textContent = "Escriba un nombre válido.");
    closeOverlay(settingsOverlay);
  });

  function ensureResetPasswordButton() {
    if (btnResetPassword) return;
    const footer = settingsForm.querySelector(".modal-footer");
    if (!footer) return;
    const wrap = document.createElement("div");
    wrap.style.marginTop = "12px";
    wrap.style.width = "100%";

    const hint = document.createElement("div");
    hint.className = "hint-inline";
    hint.innerHTML =
      '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Esto borra solo la contraseña guardada en este navegador (no elimina eventos ni otros datos).';

    btnResetPassword = document.createElement("button");
    btnResetPassword.type = "button";
    btnResetPassword.className = "btn btn-danger";
    btnResetPassword.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Restablecer contraseña';
    btnResetPassword.addEventListener("click", () => {
      const ok = window.confirm(
        "Esto borrará la contraseña guardada en este navegador.\n\nSus eventos y demás datos NO se borrarán.\n\n¿Continuar?"
      );
      if (!ok) return;
      clearStoredPasswordOnly();
      closeOverlay(settingsOverlay);
      showAuthForms();
      alert("Contraseña borrada. Configure una nueva para volver a entrar.");
    });

    wrap.appendChild(hint);
    wrap.appendChild(btnResetPassword);
    footer.parentNode.insertBefore(wrap, footer);
  }

  // ---------------------------------------------------------------------------
  // Navegación / sidebar
  // ---------------------------------------------------------------------------
  function showView(viewKey) {
    activeView = viewKey;
    Object.keys(views).forEach((k) => {
      views[k].classList.toggle("hidden", k !== viewKey);
    });
    navItems.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.view === viewKey));

    // En móvil, cerrar sidebar al seleccionar una opción
    if (window.matchMedia("(max-width: 980px)").matches) {
      sidebar.classList.add("is-hidden");
    }
  }

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      showView(btn.dataset.view);
      refreshAll();
    });
  });

  btnNavToggle.addEventListener("click", () => {
    sidebar.classList.toggle("is-hidden");
  });

  // Por defecto, en móvil el menú arranca cerrado
  if (window.matchMedia("(max-width: 980px)").matches) {
    sidebar.classList.add("is-hidden");
  }

  // ---------------------------------------------------------------------------
  // Backup (exportar / importar TODO)
  // ---------------------------------------------------------------------------
  function exportAllData() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        events: loadArray(LS_EVENTS),
        birthdays: loadArray(LS_BIRTHDAYS),
        weekly: loadObject(LS_WEEKLY, {}),
        members: loadArray(LS_MEMBERS),
        special: loadArray(LS_SPECIAL),
        notes: loadArray(LS_NOTES),
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "respaldo-iglesia-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Guardamos la fecha del último respaldo para no molestar con recordatorios.
    localStorage.setItem(LS_LAST_EXPORT_AT, new Date().toISOString());
  }

  function importAllDataFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = safeJsonParse(reader.result, null);
      if (!parsed || typeof parsed !== "object") return void alert("El archivo no es un JSON válido.");
      if (!parsed.data || typeof parsed.data !== "object") {
        return void alert("El archivo no parece ser un respaldo de esta aplicación.");
      }
      const ok = window.confirm(
        "Importar reemplazará TODOS los datos actuales (eventos, cumpleaños, plan semanal, miembros, fechas y notas). ¿Continuar?"
      );
      if (!ok) return;

      // Normalización mínima (evita romper la app por llaves faltantes)
      const d = parsed.data;
      saveArray(LS_EVENTS, Array.isArray(d.events) ? normalizeEvents(d.events) : []);
      saveArray(LS_BIRTHDAYS, Array.isArray(d.birthdays) ? normalizeBirthdays(d.birthdays) : []);
      saveObject(LS_WEEKLY, d.weekly && typeof d.weekly === "object" && !Array.isArray(d.weekly) ? d.weekly : {});
      saveArray(LS_MEMBERS, Array.isArray(d.members) ? normalizeMembers(d.members) : []);
      saveArray(LS_SPECIAL, Array.isArray(d.special) ? normalizeSpecialDates(d.special) : []);
      saveArray(LS_NOTES, Array.isArray(d.notes) ? normalizeNotes(d.notes) : []);

      selectedDayIso = null;
      refreshAll();
      alert("Importación completada.");
    };
    reader.readAsText(file, "UTF-8");
  }

  btnExport.addEventListener("click", exportAllData);
  importFile.addEventListener("change", () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = "";
    if (!file) return;
    importAllDataFromFile(file);
  });

  /**
   * Recordatorio automático de respaldo:
   * - Si hace ≥ 7 días que no exporta, sugerimos exportar.
   * - Para no ser invasivos, solo preguntamos como máximo 1 vez cada 24 horas.
   */
  function startBackupReminder() {
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;
    const SEVEN_DAYS = 7 * ONE_DAY;

    function shouldPrompt() {
      // Solo recordamos si el usuario ya está dentro de la app.
      if (!isSessionAuthenticated()) return false;

      const lastExportRaw = localStorage.getItem(LS_LAST_EXPORT_AT);
      const lastNagRaw = localStorage.getItem(LS_LAST_BACKUP_NAG_AT);
      const now = Date.now();

      const lastExport = lastExportRaw ? Date.parse(lastExportRaw) : 0;
      const lastNag = lastNagRaw ? Date.parse(lastNagRaw) : 0;

      const needsBackup = now - lastExport >= SEVEN_DAYS;
      const allowedToNag = now - lastNag >= ONE_DAY;
      return needsBackup && allowedToNag;
    }

    function promptIfNeeded() {
      if (!shouldPrompt()) return;
      localStorage.setItem(LS_LAST_BACKUP_NAG_AT, new Date().toISOString());
      const ok = window.confirm(
        "Recordatorio: hace varios días que no exporta un respaldo.\n\n¿Desea exportar sus datos ahora?"
      );
      if (ok) exportAllData();
    }

    // Primer chequeo (unos segundos después) y luego periódico
    window.setTimeout(promptIfNeeded, 4000);
    window.setInterval(promptIfNeeded, 2 * ONE_HOUR);
  }

  // ---------------------------------------------------------------------------
  // Eventos (CRUD)
  // ---------------------------------------------------------------------------
  function normalizeEvents(arr) {
    return arr
      .map((x) => ({
        id: x.id || generateId("evt"),
        title: String(x.title || "").trim(),
        date: String(x.date || ""),
        time: String(x.time || ""),
        type: EVENT_TYPES[x.type] ? x.type : "special",
        description: String(x.description || "").trim(),
      }))
      .filter((x) => x.title && x.date && x.time && x.description);
  }

  function getEventsForRender() {
    const all = normalizeEvents(loadArray(LS_EVENTS));
    const sorted = sortByDateTimeAsc(all, "date", "time");
    return filterByQuery(sorted, searchInput.value, (e) => e.title);
  }

  function renderEventList() {
    const events = getEventsForRender();
    eventsList.innerHTML = "";
    emptyMessage.classList.toggle("hidden", events.length !== 0);

    events.forEach((ev) => {
      const typeKey = EVENT_TYPES[ev.type] ? ev.type : "special";
      const meta = EVENT_TYPES[typeKey];
      const li = document.createElement("li");
      li.className = "event-card event-card--" + typeKey + (isUpcomingEvent(ev) ? " event-card--upcoming" : "");

      const header = document.createElement("div");
      header.className = "event-card-header";
      header.innerHTML =
        '<h3 class="event-card-title">' +
        escapeHtml(ev.title) +
        '</h3><span class="event-badge"><i class="' +
        meta.icon +
        '" aria-hidden="true"></i> ' +
        meta.label +
        "</span>";

      const metaRow = document.createElement("div");
      metaRow.className = "event-meta";
      metaRow.innerHTML =
        '<span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' +
        formatDateDisplay(ev.date) +
        '</span><span><i class="fa-regular fa-clock" aria-hidden="true"></i> ' +
        escapeHtml(ev.time) +
        "</span>";

      const desc = document.createElement("p");
      desc.className = "event-description";
      desc.textContent = ev.description || "";

      const actions = document.createElement("div");
      actions.className = "event-card-actions";
      actions.appendChild(makeButton("btn btn-secondary btn-sm", "fa-solid fa-pen", "Editar", () => openEventModal(ev)));
      actions.appendChild(
        makeButton("btn btn-danger btn-sm", "fa-solid fa-trash", "Eliminar", () => deleteEvent(ev.id, ev.title))
      );

      li.appendChild(header);
      li.appendChild(metaRow);
      li.appendChild(desc);
      li.appendChild(actions);
      eventsList.appendChild(li);
    });
  }

  function deleteEvent(id, title) {
    const ok = window.confirm("¿Eliminar el evento «" + (title || "sin título") + "»? Esta acción no se puede deshacer.");
    if (!ok) return;
    const all = loadArray(LS_EVENTS).filter((x) => x && x.id !== id);
    saveArray(LS_EVENTS, all);
    refreshAll();
  }

  function openEventModal(ev) {
    eventFormError.textContent = "";
    if (ev) {
      eventModalTitle.textContent = "Editar evento";
      eventIdInput.value = ev.id;
      eventTitle.value = ev.title || "";
      eventDate.value = ev.date || "";
      eventTime.value = ev.time || "";
      eventType.value = ev.type || "";
      eventDescription.value = ev.description || "";
    } else {
      eventModalTitle.textContent = "Nuevo evento";
      eventIdInput.value = "";
      eventTitle.value = "";
      eventDate.value = "";
      eventTime.value = "";
      eventType.value = "";
      eventDescription.value = "";
    }
    openOverlay(eventModalOverlay, eventTitle);
  }

  function validateEventForm() {
    eventFormError.textContent = "";
    const title = eventTitle.value.trim();
    const date = eventDate.value;
    const time = eventTime.value;
    const type = eventType.value;
    const desc = eventDescription.value.trim();

    if (!title) return fail(eventFormError, "Escriba un título para el evento.", eventTitle);
    if (!date) return fail(eventFormError, "Seleccione la fecha.", eventDate);
    if (!time) return fail(eventFormError, "Seleccione la hora.", eventTime);
    if (!type) return fail(eventFormError, "Seleccione el tipo de evento.", eventType);
    if (!desc) return fail(eventFormError, "Escriba una descripción.", eventDescription);
    return true;
  }

  eventForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateEventForm()) return;

    const payload = {
      id: eventIdInput.value || generateId("evt"),
      title: eventTitle.value.trim(),
      date: eventDate.value,
      time: eventTime.value,
      type: eventType.value,
      description: eventDescription.value.trim(),
    };

    const all = normalizeEvents(loadArray(LS_EVENTS));
    const idx = all.findIndex((x) => x.id === payload.id);
    if (idx >= 0) all[idx] = payload;
    else all.push(payload);
    saveArray(LS_EVENTS, all);

    closeOverlay(eventModalOverlay);
    refreshAll();
  });

  btnNewEvent.addEventListener("click", () => openEventModal(null));
  eventModalClose.addEventListener("click", () => closeOverlay(eventModalOverlay));
  eventFormCancel.addEventListener("click", () => closeOverlay(eventModalOverlay));

  // ---------------------------------------------------------------------------
  // Cumpleaños (CRUD + calendario)
  // ---------------------------------------------------------------------------
  function normalizeBirthdays(arr) {
    return arr
      .map((x) => ({
        id: x.id || generateId("bday"),
        name: String(x.name || "").trim(),
        date: String(x.date || ""),
      }))
      .filter((x) => x.name && x.date);
  }

  function openBirthdayModal(bday, preferredDateIso) {
    birthdayError.textContent = "";
    if (bday) {
      birthdayModalTitle.textContent = "Editar cumpleaños";
      birthdayId.value = bday.id;
      birthdayName.value = bday.name || "";
      birthdayDate.value = bday.date || "";
    } else {
      birthdayModalTitle.textContent = "Nuevo cumpleaños";
      birthdayId.value = "";
      birthdayName.value = "";
      birthdayDate.value = preferredDateIso || "";
    }
    openOverlay(birthdayOverlay, birthdayName);
  }

  function validateBirthdayForm() {
    birthdayError.textContent = "";
    const name = birthdayName.value.trim();
    const date = birthdayDate.value;
    if (!name) return fail(birthdayError, "Escriba el nombre.", birthdayName);
    if (!date) return fail(birthdayError, "Seleccione la fecha.", birthdayDate);
    return true;
  }

  birthdayForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateBirthdayForm()) return;
    const payload = { id: birthdayId.value || generateId("bday"), name: birthdayName.value.trim(), date: birthdayDate.value };
    const all = normalizeBirthdays(loadArray(LS_BIRTHDAYS));
    const idx = all.findIndex((x) => x.id === payload.id);
    if (idx >= 0) all[idx] = payload;
    else all.push(payload);
    saveArray(LS_BIRTHDAYS, all);
    closeOverlay(birthdayOverlay);
    refreshAll();
  });

  function deleteBirthday(id, name) {
    const ok = window.confirm("¿Eliminar el cumpleaños de «" + (name || "sin nombre") + "»? Esta acción no se puede deshacer.");
    if (!ok) return;
    const all = loadArray(LS_BIRTHDAYS).filter((x) => x && x.id !== id);
    saveArray(LS_BIRTHDAYS, all);
    refreshAll();
  }

  btnNewBirthday.addEventListener("click", () => openBirthdayModal(null, selectedDayIso || ""));
  btnAddBirthdayToDay.addEventListener("click", () => openBirthdayModal(null, selectedDayIso || ""));
  birthdayClose.addEventListener("click", () => closeOverlay(birthdayOverlay));
  birthdayCancel.addEventListener("click", () => closeOverlay(birthdayOverlay));

  // ---------------------------------------------------------------------------
  // Calendario mensual (eventos + cumpleaños)
  // ---------------------------------------------------------------------------
  function buildCountByDay(key, dateField) {
    const map = {};
    loadArray(key).forEach((x) => {
      const k = x && x[dateField];
      if (!k) return;
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  function renderCalendar() {
    const y = calendarView.getFullYear();
    const m = calendarView.getMonth();
    const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    calMonthLabel.textContent = monthNames[m] + " " + y;

    const first = new Date(y, m, 1);
    let startWeekday = first.getDay(); // 0 domingo
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1; // lunes = 0

    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevMonthDays = new Date(y, m, 0).getDate();

    const eventsByDay = buildCountByDay(LS_EVENTS, "date");
    const bdaysByDay = buildCountByDay(LS_BIRTHDAYS, "date");
    const tIso = todayIso();

    calendarGrid.innerHTML = "";

    for (let i = 0; i < startWeekday; i++) {
      const dayNum = prevMonthDays - startWeekday + i + 1;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-cell cal-cell--muted";
      cell.textContent = String(dayNum);
      cell.disabled = true;
      calendarGrid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-cell";
      cell.textContent = String(d);
      cell.setAttribute("aria-label", "Día " + d);

      if (iso === tIso) cell.classList.add("cal-cell--today");
      if (eventsByDay[iso]) cell.classList.add("cal-cell--has-events");
      if (bdaysByDay[iso]) cell.classList.add("cal-cell--has-birthdays");
      if (selectedDayIso === iso) cell.classList.add("cal-cell--selected");

      cell.addEventListener("click", () => {
        selectedDayIso = iso;
        renderCalendar();
        renderSelectedDay();
      });
      calendarGrid.appendChild(cell);
    }

    const totalCells = startWeekday + daysInMonth;
    const remainder = totalCells % 7;
    const toAdd = remainder === 0 ? 0 : 7 - remainder;
    let nextDay = 1;
    for (let j = 0; j < toAdd; j++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-cell cal-cell--muted";
      cell.textContent = String(nextDay++);
      cell.disabled = true;
      calendarGrid.appendChild(cell);
    }
  }

  function renderSelectedDay() {
    if (!selectedDayIso) {
      dayPanelEmpty.classList.remove("hidden");
      dayPanelContent.classList.add("hidden");
      return;
    }

    dayPanelEmpty.classList.add("hidden");
    dayPanelContent.classList.remove("hidden");
    dayEventsTitle.textContent = formatDateDisplay(selectedDayIso);

    const events = normalizeEvents(loadArray(LS_EVENTS)).filter((e) => e.date === selectedDayIso);
    const bdays = normalizeBirthdays(loadArray(LS_BIRTHDAYS)).filter((b) => b.date === selectedDayIso);

    const eventsSorted = sortByDateTimeAsc(events, "date", "time");
    dayEventsList.innerHTML = "";
    if (eventsSorted.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card";
      empty.textContent = "No hay eventos este día.";
      dayEventsList.appendChild(empty);
    } else {
      eventsSorted.forEach((ev) => {
        const meta = EVENT_TYPES[ev.type] || EVENT_TYPES.special;
        const card = document.createElement("div");
        card.className = "card card--event";
        card.innerHTML =
          '<h4 class="card-title"><i class="' +
          meta.icon +
          '" aria-hidden="true"></i> ' +
          escapeHtml(ev.title) +
          '</h4><p class="card-meta"><i class="fa-regular fa-clock" aria-hidden="true"></i> ' +
          escapeHtml(ev.time || "") +
          ' · <span class="event-badge"><i class="' +
          meta.icon +
          '" aria-hidden="true"></i> ' +
          meta.label +
          "</span></p>" +
          '<p class="card-meta">' +
          escapeHtml(ev.description || "") +
          '</p><div class="card-actions"></div>';

        const actions = card.querySelector(".card-actions");
        actions.appendChild(makeButton("btn btn-secondary btn-sm", "fa-solid fa-pen", "Editar", () => openEventModal(ev)));
        actions.appendChild(
          makeButton("btn btn-danger btn-sm", "fa-solid fa-trash", "Eliminar", () => deleteEvent(ev.id, ev.title))
        );
        dayEventsList.appendChild(card);
      });
    }

    dayBirthdaysList.innerHTML = "";
    if (bdays.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card";
      empty.textContent = "No hay cumpleaños este día.";
      dayBirthdaysList.appendChild(empty);
    } else {
      bdays
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
        .forEach((b) => {
          const card = document.createElement("div");
          card.className = "card card--birthday";
          card.innerHTML =
            '<h4 class="card-title"><i class="fa-solid fa-cake-candles" aria-hidden="true"></i> ' +
            escapeHtml(b.name) +
            '</h4><p class="card-meta"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' +
            escapeHtml(formatDateDisplay(b.date)) +
            '</p><div class="card-actions"></div>';
          const actions = card.querySelector(".card-actions");
          actions.appendChild(makeButton("btn btn-secondary btn-sm", "fa-solid fa-pen", "Editar", () => openBirthdayModal(b, null)));
          actions.appendChild(makeButton("btn btn-danger btn-sm", "fa-solid fa-trash", "Eliminar", () => deleteBirthday(b.id, b.name)));
          dayBirthdaysList.appendChild(card);
        });
    }
  }

  calPrev.addEventListener("click", () => {
    calendarView = new Date(calendarView.getFullYear(), calendarView.getMonth() - 1, 1);
    renderCalendar();
  });
  calNext.addEventListener("click", () => {
    calendarView = new Date(calendarView.getFullYear(), calendarView.getMonth() + 1, 1);
    renderCalendar();
  });
  dayEventsClose.addEventListener("click", () => {
    selectedDayIso = null;
    renderCalendar();
    renderSelectedDay();
  });

  // ---------------------------------------------------------------------------
  // Plan semanal
  // ---------------------------------------------------------------------------
  function getWeekStartIso(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0 domingo
    const mondayOffset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + mondayOffset);
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function addDaysIso(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return (
      dt.getFullYear() +
      "-" +
      String(dt.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(dt.getDate()).padStart(2, "0")
    );
  }

  function formatShortDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("es", { day: "2-digit", month: "short" });
  }

  function loadWeeklyPlan() {
    return loadObject(LS_WEEKLY, {});
  }

  function ensureWeekBucket(weeklyObj, weekStartIso) {
    if (!weeklyObj[weekStartIso]) {
      weeklyObj[weekStartIso] = { days: [[], [], [], [], [], [], []] };
    }
    if (!Array.isArray(weeklyObj[weekStartIso].days) || weeklyObj[weekStartIso].days.length !== 7) {
      weeklyObj[weekStartIso].days = [[], [], [], [], [], [], []];
    }
    return weeklyObj[weekStartIso];
  }

  function renderWeekly() {
    const weekly = loadWeeklyPlan();
    const bucket = ensureWeekBucket(weekly, weeklyWeekStartIso);
    const start = weeklyWeekStartIso;
    const end = addDaysIso(start, 6);
    weekRange.textContent = formatShortDate(start) + " → " + formatShortDate(end);

    weeklyGrid.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const dayIso = addDaysIso(start, i);
      const dayList = Array.isArray(bucket.days[i]) ? bucket.days[i] : [];
      const card = document.createElement("div");
      card.className = "day-card";
      card.innerHTML =
        "<h4>" +
        escapeHtml(WEEKDAY_NAMES[i]) +
        ' <span>' +
        escapeHtml(formatShortDate(dayIso)) +
        '</span></h4><ul class="activity-list"></ul>';

      const ul = card.querySelector(".activity-list");
      if (dayList.length === 0) {
        const li = document.createElement("li");
        li.className = "activity";
        li.textContent = "Sin actividades.";
        ul.appendChild(li);
      } else {
        dayList
          .slice()
          .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
          .forEach((act) => {
            const li = document.createElement("li");
            li.className = "activity";
            li.innerHTML =
              "<strong>" +
              (act.time ? escapeHtml(act.time) + " — " : "") +
              escapeHtml(act.title || "") +
              "</strong>" +
              (act.tag ? ' <span class="tag">' + escapeHtml(act.tag) + "</span>" : "") +
              (act.notes ? '<div class="card-meta">' + escapeHtml(act.notes) + "</div>" : "") +
              '<div class="card-actions">' +
              '<button type="button" class="btn btn-secondary btn-sm" data-action="edit"><i class="fa-solid fa-pen" aria-hidden="true"></i> Editar</button>' +
              '<button type="button" class="btn btn-danger btn-sm" data-action="del"><i class="fa-solid fa-trash" aria-hidden="true"></i> Eliminar</button>' +
              "</div>";
            li.querySelector('[data-action="edit"]').addEventListener("click", () => openWeeklyModal(i, weeklyWeekStartIso, act));
            li.querySelector('[data-action="del"]').addEventListener("click", () => deleteWeeklyActivity(i, act.id));
            ul.appendChild(li);
          });
      }

      const addBtn = makeButton("btn btn-primary btn-sm", "fa-solid fa-plus", "Añadir", () => openWeeklyModal(i, weeklyWeekStartIso, null));
      card.insertBefore(addBtn, ul);
      weeklyGrid.appendChild(card);
    }
  }

  function openWeeklyModal(dayIndex, weekStartIso, act) {
    weeklyError.textContent = "";
    weeklyWeekStart.value = weekStartIso;
    weeklyDayIndex.value = String(dayIndex);
    if (act) {
      weeklyModalTitle.textContent = "Editar actividad";
      weeklyActivityId.value = act.id;
      weeklyActivityTitle.value = act.title || "";
      weeklyActivityTime.value = act.time || "";
      weeklyActivityTag.value = act.tag || "";
      weeklyActivityNotes.value = act.notes || "";
    } else {
      weeklyModalTitle.textContent = "Nueva actividad";
      weeklyActivityId.value = "";
      weeklyActivityTitle.value = "";
      weeklyActivityTime.value = "";
      weeklyActivityTag.value = "";
      weeklyActivityNotes.value = "";
    }
    openOverlay(weeklyOverlay, weeklyActivityTitle);
  }

  function validateWeeklyForm() {
    weeklyError.textContent = "";
    if (!weeklyActivityTitle.value.trim()) return fail(weeklyError, "Escriba el nombre de la actividad.", weeklyActivityTitle);
    return true;
  }

  function saveWeeklyActivity(payload) {
    const weekly = loadWeeklyPlan();
    const weekStartIso = payload.weekStartIso;
    const bucket = ensureWeekBucket(weekly, weekStartIso);
    const di = payload.dayIndex;
    const list = Array.isArray(bucket.days[di]) ? bucket.days[di] : [];
    const idx = list.findIndex((x) => x.id === payload.id);
    if (idx >= 0) list[idx] = payload;
    else list.push(payload);
    bucket.days[di] = list;
    saveObject(LS_WEEKLY, weekly);
  }

  function deleteWeeklyActivity(dayIndex, activityId) {
    const ok = window.confirm("¿Eliminar esta actividad del plan semanal?");
    if (!ok) return;
    const weekly = loadWeeklyPlan();
    const bucket = ensureWeekBucket(weekly, weeklyWeekStartIso);
    const list = Array.isArray(bucket.days[dayIndex]) ? bucket.days[dayIndex] : [];
    bucket.days[dayIndex] = list.filter((x) => x.id !== activityId);
    saveObject(LS_WEEKLY, weekly);
    refreshAll();
  }

  weeklyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateWeeklyForm()) return;
    const payload = {
      id: weeklyActivityId.value || generateId("act"),
      weekStartIso: weeklyWeekStart.value,
      dayIndex: Number(weeklyDayIndex.value),
      title: weeklyActivityTitle.value.trim(),
      time: weeklyActivityTime.value || "",
      tag: weeklyActivityTag.value.trim() || "",
      notes: weeklyActivityNotes.value.trim() || "",
    };
    saveWeeklyActivity(payload);
    closeOverlay(weeklyOverlay);
    refreshAll();
  });

  weeklyClose.addEventListener("click", () => closeOverlay(weeklyOverlay));
  weeklyCancel.addEventListener("click", () => closeOverlay(weeklyOverlay));
  weekPrev.addEventListener("click", () => {
    weeklyWeekStartIso = addDaysIso(weeklyWeekStartIso, -7);
    renderWeekly();
  });
  weekNext.addEventListener("click", () => {
    weeklyWeekStartIso = addDaysIso(weeklyWeekStartIso, 7);
    renderWeekly();
  });

  // ---------------------------------------------------------------------------
  // Miembros activos (CRUD)
  // ---------------------------------------------------------------------------
  function normalizeMembers(arr) {
    return arr
      .map((x) => ({
        id: x.id || generateId("mem"),
        name: String(x.name || "").trim(),
        phone: String(x.phone || "").trim(),
        role: String(x.role || "").trim(),
      }))
      .filter((x) => x.name);
  }

  function renderMembers() {
    const all = normalizeMembers(loadArray(LS_MEMBERS)).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const filtered = filterByQuery(all, membersSearch.value, (m) => m.name);
    membersList.innerHTML = "";
    membersEmpty.classList.toggle("hidden", filtered.length !== 0);

    filtered.forEach((m) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<h4 class="card-title"><i class="fa-solid fa-user" aria-hidden="true"></i> ' +
        escapeHtml(m.name) +
        '</h4><p class="card-meta">' +
        (m.role ? "<strong>Rol:</strong> " + escapeHtml(m.role) + "<br/>" : "") +
        (m.phone ? "<strong>Tel:</strong> " + escapeHtml(m.phone) : "<span style=\"color:var(--text-muted)\">Sin teléfono</span>") +
        '</p><div class="card-actions"></div>';
      const actions = card.querySelector(".card-actions");
      actions.appendChild(makeButton("btn btn-secondary btn-sm", "fa-solid fa-pen", "Editar", () => openMemberModal(m)));
      actions.appendChild(makeButton("btn btn-danger btn-sm", "fa-solid fa-trash", "Eliminar", () => deleteMember(m.id, m.name)));
      membersList.appendChild(card);
    });
  }

  function openMemberModal(member) {
    memberError.textContent = "";
    if (member) {
      memberModalTitle.textContent = "Editar miembro";
      memberId.value = member.id;
      memberName.value = member.name || "";
      memberPhone.value = member.phone || "";
      memberRole.value = member.role || "";
    } else {
      memberModalTitle.textContent = "Nuevo miembro";
      memberId.value = "";
      memberName.value = "";
      memberPhone.value = "";
      memberRole.value = "";
    }
    openOverlay(memberOverlay, memberName);
  }

  function validateMemberForm() {
    memberError.textContent = "";
    if (!memberName.value.trim()) return fail(memberError, "Escriba el nombre completo.", memberName);
    return true;
  }

  memberForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateMemberForm()) return;
    const payload = {
      id: memberId.value || generateId("mem"),
      name: memberName.value.trim(),
      phone: memberPhone.value.trim(),
      role: memberRole.value.trim(),
    };
    const all = normalizeMembers(loadArray(LS_MEMBERS));
    const idx = all.findIndex((x) => x.id === payload.id);
    if (idx >= 0) all[idx] = payload;
    else all.push(payload);
    saveArray(LS_MEMBERS, all);
    closeOverlay(memberOverlay);
    refreshAll();
  });

  function deleteMember(id, name) {
    const ok = window.confirm("¿Eliminar el miembro «" + (name || "sin nombre") + "»?");
    if (!ok) return;
    const all = loadArray(LS_MEMBERS).filter((x) => x && x.id !== id);
    saveArray(LS_MEMBERS, all);
    refreshAll();
  }

  btnNewMember.addEventListener("click", () => openMemberModal(null));
  memberClose.addEventListener("click", () => closeOverlay(memberOverlay));
  memberCancel.addEventListener("click", () => closeOverlay(memberOverlay));
  membersSearch.addEventListener("input", renderMembers);

  // ---------------------------------------------------------------------------
  // Fechas especiales (CRUD)
  // ---------------------------------------------------------------------------
  function normalizeSpecialDates(arr) {
    return arr
      .map((x) => ({
        id: x.id || generateId("sp"),
        type: SPECIAL_TYPES[x.type] ? x.type : "baptism",
        date: String(x.date || ""),
        description: String(x.description || "").trim(),
      }))
      .filter((x) => x.date && x.description);
  }

  function renderSpecialDates() {
    const all = normalizeSpecialDates(loadArray(LS_SPECIAL));
    const sorted = [...all].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    specialList.innerHTML = "";
    specialEmpty.classList.toggle("hidden", sorted.length !== 0);

    sorted.forEach((s) => {
      const meta = SPECIAL_TYPES[s.type] || SPECIAL_TYPES.baptism;
      const li = document.createElement("li");
      li.className = "event-card";
      li.innerHTML =
        '<div class="event-card-header">' +
        '<h3 class="event-card-title">' +
        '<span class="label ' +
        meta.labelClass +
        '"><i class="' +
        meta.icon +
        '" aria-hidden="true"></i> ' +
        meta.label +
        "</span>" +
        "</h3>" +
        "</div>" +
        '<div class="event-meta"><span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' +
        formatDateDisplay(s.date) +
        "</span></div>" +
        '<p class="event-description">' +
        escapeHtml(s.description) +
        "</p>" +
        '<div class="event-card-actions"></div>';

      const actions = li.querySelector(".event-card-actions");
      actions.appendChild(makeButton("btn btn-secondary btn-sm", "fa-solid fa-pen", "Editar", () => openSpecialModal(s)));
      actions.appendChild(makeButton("btn btn-danger btn-sm", "fa-solid fa-trash", "Eliminar", () => deleteSpecial(s.id, meta.label)));
      specialList.appendChild(li);
    });
  }

  function openSpecialModal(s) {
    specialError.textContent = "";
    if (s) {
      specialModalTitle.textContent = "Editar fecha especial";
      specialId.value = s.id;
      specialType.value = s.type;
      specialDate.value = s.date || "";
      specialDescription.value = s.description || "";
    } else {
      specialModalTitle.textContent = "Nueva fecha especial";
      specialId.value = "";
      specialType.value = "";
      specialDate.value = "";
      specialDescription.value = "";
    }
    openOverlay(specialOverlay, specialType);
  }

  function validateSpecialForm() {
    specialError.textContent = "";
    if (!specialType.value) return fail(specialError, "Seleccione el tipo.", specialType);
    if (!specialDate.value) return fail(specialError, "Seleccione la fecha.", specialDate);
    if (!specialDescription.value.trim()) return fail(specialError, "Escriba una descripción.", specialDescription);
    return true;
  }

  specialForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateSpecialForm()) return;
    const payload = {
      id: specialId.value || generateId("sp"),
      type: specialType.value,
      date: specialDate.value,
      description: specialDescription.value.trim(),
    };
    const all = normalizeSpecialDates(loadArray(LS_SPECIAL));
    const idx = all.findIndex((x) => x.id === payload.id);
    if (idx >= 0) all[idx] = payload;
    else all.push(payload);
    saveArray(LS_SPECIAL, all);
    closeOverlay(specialOverlay);
    refreshAll();
  });

  function deleteSpecial(id, label) {
    const ok = window.confirm("¿Eliminar esta fecha especial (" + label + ")?");
    if (!ok) return;
    const all = loadArray(LS_SPECIAL).filter((x) => x && x.id !== id);
    saveArray(LS_SPECIAL, all);
    refreshAll();
  }

  btnNewSpecial.addEventListener("click", () => openSpecialModal(null));
  specialClose.addEventListener("click", () => closeOverlay(specialOverlay));
  specialCancel.addEventListener("click", () => closeOverlay(specialOverlay));

  // ---------------------------------------------------------------------------
  // Notas (CRUD + búsqueda)
  // ---------------------------------------------------------------------------
  function normalizeNotes(arr) {
    return arr
      .map((x) => ({
        id: x.id || generateId("note"),
        title: String(x.title || "").trim(),
        content: String(x.content || "").trim(),
        date: String(x.date || ""),
      }))
      .filter((x) => x.title && x.content && x.date);
  }

  function renderNotes() {
    const all = normalizeNotes(loadArray(LS_NOTES)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const filtered = filterByQuery(all, notesSearch.value, (n) => n.title + " " + n.content);
    notesList.innerHTML = "";
    notesEmpty.classList.toggle("hidden", filtered.length !== 0);

    filtered.forEach((n) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<h4 class="card-title"><i class="fa-solid fa-note-sticky" aria-hidden="true"></i> ' +
        escapeHtml(n.title) +
        '</h4><p class="card-meta"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' +
        escapeHtml(formatDateDisplay(n.date)) +
        '</p><p class="card-meta">' +
        escapeHtml(n.content.slice(0, 220)) +
        (n.content.length > 220 ? "…" : "") +
        '</p><div class="card-actions"></div>';
      const actions = card.querySelector(".card-actions");
      actions.appendChild(makeButton("btn btn-secondary btn-sm", "fa-solid fa-pen", "Editar", () => openNoteModal(n)));
      actions.appendChild(makeButton("btn btn-danger btn-sm", "fa-solid fa-trash", "Eliminar", () => deleteNote(n.id, n.title)));
      notesList.appendChild(card);
    });
  }

  function openNoteModal(n) {
    noteError.textContent = "";
    if (n) {
      noteModalTitle.textContent = "Editar nota";
      noteId.value = n.id;
      noteTitle.value = n.title || "";
      noteDate.value = n.date || "";
      noteContent.value = n.content || "";
    } else {
      noteModalTitle.textContent = "Nueva nota";
      noteId.value = "";
      noteTitle.value = "";
      noteDate.value = todayIso();
      noteContent.value = "";
    }
    openOverlay(noteOverlay, noteTitle);
  }

  function validateNoteForm() {
    noteError.textContent = "";
    if (!noteTitle.value.trim()) return fail(noteError, "Escriba un título.", noteTitle);
    if (!noteDate.value) return fail(noteError, "Seleccione la fecha.", noteDate);
    if (!noteContent.value.trim()) return fail(noteError, "Escriba el contenido.", noteContent);
    return true;
  }

  noteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateNoteForm()) return;
    const payload = {
      id: noteId.value || generateId("note"),
      title: noteTitle.value.trim(),
      date: noteDate.value,
      content: noteContent.value.trim(),
    };
    const all = normalizeNotes(loadArray(LS_NOTES));
    const idx = all.findIndex((x) => x.id === payload.id);
    if (idx >= 0) all[idx] = payload;
    else all.push(payload);
    saveArray(LS_NOTES, all);
    closeOverlay(noteOverlay);
    refreshAll();
  });

  function deleteNote(id, title) {
    const ok = window.confirm("¿Eliminar la nota «" + (title || "sin título") + "»?");
    if (!ok) return;
    const all = loadArray(LS_NOTES).filter((x) => x && x.id !== id);
    saveArray(LS_NOTES, all);
    refreshAll();
  }

  btnNewNote.addEventListener("click", () => openNoteModal(null));
  noteClose.addEventListener("click", () => closeOverlay(noteOverlay));
  noteCancel.addEventListener("click", () => closeOverlay(noteOverlay));
  notesSearch.addEventListener("input", renderNotes);

  // ---------------------------------------------------------------------------
  // Helpers de UI (botones, overlays)
  // ---------------------------------------------------------------------------
  function makeButton(className, iconClass, text, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.innerHTML = '<i class="' + iconClass + '" aria-hidden="true"></i> ' + escapeHtml(text);
    btn.addEventListener("click", onClick);
    return btn;
  }

  function openOverlay(overlayEl, focusEl) {
    overlayEl.classList.remove("hidden");
    overlayEl.setAttribute("aria-hidden", "false");
    if (focusEl && typeof focusEl.focus === "function") focusEl.focus();
  }

  function closeOverlay(overlayEl) {
    overlayEl.classList.add("hidden");
    overlayEl.setAttribute("aria-hidden", "true");
  }

  function bindOverlayClose(overlayEl) {
    overlayEl.addEventListener("click", (e) => {
      if (e.target === overlayEl) closeOverlay(overlayEl);
    });
  }

  [eventModalOverlay, birthdayOverlay, weeklyOverlay, memberOverlay, specialOverlay, noteOverlay, settingsOverlay].forEach(bindOverlayClose);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    [eventModalOverlay, birthdayOverlay, weeklyOverlay, memberOverlay, specialOverlay, noteOverlay, settingsOverlay].forEach((ov) => {
      if (!ov.classList.contains("hidden")) closeOverlay(ov);
    });
  });

  function fail(errorEl, message, focusEl) {
    errorEl.textContent = message;
    if (focusEl && typeof focusEl.focus === "function") focusEl.focus();
    return false;
  }

  // ---------------------------------------------------------------------------
  // Búsquedas / refresco global
  // ---------------------------------------------------------------------------
  searchInput.addEventListener("input", renderEventList);

  function refreshAll() {
    renderEventList();
    renderCalendar();
    renderSelectedDay();
    renderWeekly();
    renderMembers();
    renderSpecialDates();
    renderNotes();
  }

  // Arranque
  // Nota: initAuth es async, pero no necesitamos bloquear el hilo.
  void initAuth();
  startBackupReminder();
})();

