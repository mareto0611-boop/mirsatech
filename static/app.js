// ================================
// Mirsa Tech Hospital - app.js
// (archivo completo limpio + Planta + Ingresos Detalle)
// ================================

let currentModule = null;
let currentUser = null;

// ---------------------
// API helper
// ---------------------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    credentials: "same-origin",
    ...opts,
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = data && data.error ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ---------------------
// Escapes
// ---------------------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll("\n", " ");
}
function parseIngresoDateTime(ing) {
  // ing.fecha_ingreso = "YYYY-MM-DD"
  // ing.hora_ingreso  = "HH:MM" (opcional)
  const f = (ing && ing.fecha_ingreso) ? String(ing.fecha_ingreso).trim() : "";
  const h = (ing && ing.hora_ingreso) ? String(ing.hora_ingreso).trim() : "00:00";
  if (!f) return null;

  // construir fecha local
  const [Y, M, D] = f.split("-").map(n => parseInt(n, 10));
  const [HH, MM] = (h.includes(":") ? h : "00:00").split(":").map(n => parseInt(n, 10));
  return new Date(Y, (M - 1), D, HH || 0, MM || 0, 0, 0);
}

// Día de ingreso por corte 6:00 AM
// - Antes del primer corte: 0
// - En/Después del primer corte: 1,2,3...
function calcDiaIngresoBy6am(ing, now = new Date()) {
  const start = parseIngresoDateTime(ing);
  if (!start) return 1;

  const SHIFT_MS = 6 * 60 * 60 * 1000;
  const a = start.getTime() - SHIFT_MS;
  const b = now.getTime() - SHIFT_MS;

  const diffDays = Math.floor((b - a) / (24 * 60 * 60 * 1000));

  // SIEMPRE mínimo 1
  return Math.max(1, diffDays + 1);
}

function diaIngresoLabel(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 1) return "Día 1 de ingreso";
  return `Día ${num} de ingreso`;
}
// ---------------------
// Workspace
// ---------------------
function showWorkspace(title) {
  document.getElementById("mainPanel").style.display = "none";
  document.getElementById("workspacePanel").style.display = "block";
  document.getElementById("workspaceTitle").textContent = title;
  document.getElementById("sessionInfo").textContent = currentUser
    ? `${currentUser.name} • ${currentUser.role}`
    : "";
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch (e) {}
  currentUser = null;
  currentModule = null;
  document.getElementById("mainPanel").style.display = "block";
  document.getElementById("workspacePanel").style.display = "none";
  document.getElementById("module-content").innerHTML = "";
}
window.logout = logout;

// ---------------------
// Login
// ---------------------
function loginCard(title) {
  return `
    <div class="card" style="max-width:420px;margin:0 auto;">
      <h2 style="margin-top:0;">${escapeHtml(title)}</h2>
      <p class="muted">Ingresa tu usuario y contraseña.</p>
      <form id="loginForm" class="row-1">
        <input id="username" placeholder="Usuario" autocomplete="username" required />
        <input id="password" type="password" placeholder="Contraseña" autocomplete="current-password" required />
        <button class="btn" type="submit">Entrar</button>
        <div id="loginMsg" class="muted" style="color:#b00020;"></div>
      </form>
    </div>
  `;
}

async function doLogin(role) {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("loginMsg");
  msg.textContent = "";
  try {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    });
    currentUser = r.user;

    if (currentUser && currentUser.must_change_password) {
      await forceChangePasswordModal();
    }

    await openModule(role);
  } catch (e) {
    msg.textContent = e.message;
  }
}

async function forceChangePasswordModal() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <h3>Cambiar contraseña</h3>
      <p class="muted">Por seguridad, debes cambiar tu contraseña antes de continuar.</p>
      <div class="row-1">
        <label>Nueva contraseña</label>
        <input id="newPwd" type="password" placeholder="Nueva contraseña" />
        <label>Confirmar contraseña</label>
        <input id="newPwd2" type="password" placeholder="Confirmar" />
      </div>
      <div class="flex" style="justify-content:flex-end;margin-top:12px;">
        <button class="btn" id="btnSavePwd">Guardar</button>
      </div>
      <div id="pwdMsg" class="muted" style="margin-top:8px;color:#b00020;"></div>
    </div>
  `;
  document.body.appendChild(modal);

  return await new Promise((resolve) => {
    modal.querySelector("#btnSavePwd").addEventListener("click", async () => {
      const p1 = modal.querySelector("#newPwd").value.trim();
      const p2 = modal.querySelector("#newPwd2").value.trim();
      const msg = modal.querySelector("#pwdMsg");
      msg.textContent = "";
      if (!p1 || p1.length < 4) { msg.textContent = "Mínimo 4 caracteres."; return; }
      if (p1 !== p2) { msg.textContent = "No coinciden."; return; }

      try {
        await api("/api/auth/change_password", {
          method: "POST",
          body: JSON.stringify({ old_password: "", new_password: p1 })
        });
        currentUser.must_change_password = 0;
        modal.remove();
        resolve(true);
      } catch (e) {
        msg.textContent = e.message;
      }
    });
  });
}

// ---------------------
// Router
// ---------------------
async function openModule(module) {
  currentModule = module;
  const content = document.getElementById("module-content");

  const titles = {
    emergencias: "Médico de Emergencias",
    especialista: "Médico Especialista",
    planta: "Médico de Planta",
    enfermeria: "Enfermería",
    farmacia: "Farmacia",
    facturacion: "Facturación",
    admision: "Admisión",
    auditor: "Auditoría Médica",
    administrador: "Administrador",
    superadmin: "Configuración (Propietario)",
  };

  // load session
  const me = await api("/api/auth/me");
  currentUser = me.user || null;

  // if not logged in with this role, show login
  if (!currentUser || currentUser.role !== module) {
    content.innerHTML = loginCard(titles[module] || module);
    document.getElementById("loginForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      doLogin(module);
    });
    showWorkspace(titles[module] || "Acceso");
    return;
  }

  showWorkspace(titles[module] || "Workspace");

  if (module === "emergencias") return renderEmergenciasHome();
  if (module === "planta") return renderPlantaHome();
  if (module === "especialista") return renderEspecialistaHome();
  if (module === "admision") return renderAdmisionHome();
  if (module === "enfermeria") return renderEnfermeria();
  if (module === "facturacion") return renderFacturacionHome();
  if (module === "auditor") return renderAuditoriaHome();
  if (module === "superadmin") return renderSuperadmin();

  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">${escapeHtml(titles[module] || module)}</h2>
      <p class="muted">Módulo en construcción.</p>
    </div>
  `;
}
window.openModule = openModule;

// ---------------------
// Branding
// ---------------------
async function loadBranding() {
  const b = await api("/api/branding");
  document.getElementById("orgName").textContent = b.org_name || "Mirsa Tech";
  document.getElementById("poweredBy").textContent = b.powered_by || "Mirsa Tech®";
  const logo = document.getElementById("brandLogo");
  if (b.logo_url) {
    logo.src = b.logo_url + "?t=" + Date.now();
    logo.style.display = "block";
  } else {
    logo.style.display = "none";
  }
}

async function applyBrandingToUI() {
  try {
    const r = await api("/api/branding");
    const org = (r.org_name || "Mirsa Tech Hospital").trim();
    const powered = (r.powered_by || "Mirsa Tech®").trim();
    const logoUrl = (r.logo_url || "").trim();

    // Main panel header
    const orgName = document.getElementById("orgName");
    const poweredBy = document.getElementById("poweredBy");
    const logo = document.getElementById("brandLogo");

    if (orgName) orgName.textContent = org;
    if (poweredBy) poweredBy.textContent = powered;
    if (logoUrl && logo) {
      logo.src = logoUrl + "?t=" + Date.now();
      logo.style.display = "";
    } else if (logo) {
      logo.style.display = "none";
    }

    // Workspace header (segundo header)
    const orgName2 = document.getElementById("orgName2");
    const poweredBy2 = document.getElementById("poweredBy2");
    const logo2 = document.getElementById("brandLogo2");

    if (orgName2) orgName2.textContent = org;
    if (poweredBy2) poweredBy2.textContent = powered;
    if (logoUrl && logo2) {
      logo2.src = logoUrl + "?t=" + Date.now();
      logo2.style.display = "";
    } else if (logo2) {
      logo2.style.display = "none";
    }

    // Footer
    const y = new Date().getFullYear();
    const footerYear = document.getElementById("footerYear");
    const footerOrg = document.getElementById("footerOrg");
    const footerPoweredBy = document.getElementById("footerPoweredBy");

    if (footerYear) footerYear.textContent = String(y);
    if (footerOrg) footerOrg.textContent = org;
    if (footerPoweredBy) footerPoweredBy.textContent = powered;
  } catch (e) {
    const y = new Date().getFullYear();
    const footerYear = document.getElementById("footerYear");
    if (footerYear) footerYear.textContent = String(y);
  }
}

(async function boot() {
  try { await loadBranding(); } catch (e) {}
})();

document.addEventListener("DOMContentLoaded", () => {
  applyBrandingToUI();
});

// =====================================================
// Facturación Home
// =====================================================
async function renderFacturacionHome() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Facturación</h2>
      <p class="muted">Selecciona una opción.</p>
      <div class="menu-grid">
        <button class="menu-btn" id="btnSeguro"><i class="fas fa-file-medical"></i><br>Seguro Médico (Registro)</button>
      </div>
    </div>
  `;
  document.getElementById("btnSeguro").addEventListener("click", async () => {
    if (!window.renderFacturacionAsegurados) return alert("No se cargó asegurados.js");
    await window.renderFacturacionAsegurados();
  });
}

// =====================================================
// Auditoría Home
// =====================================================
async function renderAuditoriaHome() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Auditoría Médica</h2>
      <p class="muted">Selecciona una opción.</p>
      <div class="menu-grid">
        <button class="menu-btn" id="btnAudAseg"><i class="fas fa-shield-heart"></i><br>Pacientes Asegurados</button>
        <button class="menu-btn" id="btnAudIng"><i class="fas fa-hospital-user"></i><br>Ingresos</button>
      </div>
    </div>
    <div id="audPanel"></div>
  `;
  document.getElementById("btnAudAseg").addEventListener("click", async () => {
    if (!window.renderAuditoriaAsegurados) return alert("No se cargó asegurados.js");
    await window.renderAuditoriaAsegurados();
  });
  document.getElementById("btnAudIng").addEventListener("click", async () => {
    await renderIngresosHome(document.getElementById("audPanel"));
  });
}

// =====================================================
// Médico de Planta Home
// =====================================================
async function renderPlantaHome() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Médico de Planta</h2>
      <p class="muted">Selecciona una opción.</p>
      <div class="menu-grid">
        <button class="menu-btn" id="btnPlantaIng"><i class="fas fa-hospital-user"></i><br>Ingresos</button>
      </div>
    </div>
    <div id="plantaPanel"></div>
  `;
  document.getElementById("btnPlantaIng").addEventListener("click", async () => {
    await renderIngresosHome(document.getElementById("plantaPanel"));
  });
}

// =====================================================
// Especialista Home
// =====================================================
async function renderEspecialistaHome() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Médico Especialista</h2>
      <p class="muted">Selecciona una opción.</p>
      <div class="menu-grid">
        <button class="menu-btn" id="btnEspIng"><i class="fas fa-hospital-user"></i><br>Ingresos</button>
      </div>
    </div>
    <div id="espPanel"></div>
  `;
  document.getElementById("btnEspIng").addEventListener("click", async () => {
    await renderIngresosHome(document.getElementById("espPanel"));
  });
}

// =====================================================
// Admisión Home
// =====================================================
async function renderAdmisionHome() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Admisión</h2>
      <p class="muted">Completa la hoja de admisión de los ingresos.</p>
      <div class="menu-grid">
        <button class="menu-btn" id="btnAdmIng"><i class="fas fa-hospital-user"></i><br>Ingresos</button>
      </div>
    </div>
    <div id="admPanel"></div>
  `;
  document.getElementById("btnAdmIng").addEventListener("click", async () => {
    await renderIngresosHome(document.getElementById("admPanel"));
  });
}

// =====================================================
// Emergencias Home
// =====================================================
async function renderEmergenciasHome() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Médico de Emergencias</h2>
      <p class="muted">Selecciona una opción.</p>
      <div class="menu-grid">
        <button class="menu-btn" id="btnEmerg"><i class="fas fa-ambulance"></i><br>Emergencias</button>
        <button class="menu-btn" id="btnAseg"><i class="fas fa-shield-halved"></i><br>Paciente Asegurado</button>
        <button class="menu-btn" id="btnIng"><i class="fas fa-hospital-user"></i><br>Ingresos</button>
      </div>
    </div>
    <div id="emergSubPanel"></div>
  `;
  document.getElementById("btnEmerg").addEventListener("click", () => renderEmergenciasNormal());
  document.getElementById("btnAseg").addEventListener("click", async () => {
    if (!window.renderEmergenciasAsegurados) return alert("No se cargó asegurados.js");
    await window.renderEmergenciasAsegurados();
  });
  document.getElementById("btnIng").addEventListener("click", async () => {
    await renderIngresosHome(document.getElementById("emergSubPanel"));
  });
}

// =====================================================
// Emergencias Normal (registro + lista + export)
// =====================================================
function badgeEstado(estado) {
  if (estado === "aplicado") return `<span class="badge badge-ok">Aplicado</span>`;
  return `<span class="badge badge-warn">Pendiente</span>`;
}

async function renderEmergenciasNormal() {
  const sub = document.getElementById("emergSubPanel") || document.getElementById("module-content");
  sub.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Registrar Paciente (Emergencias)</h2>
      <form id="formEmer" class="row-1">
        <div>
          <label>Paciente *</label>
          <input id="paciente" required placeholder="Nombre y apellido" />
        </div>
        <div class="row">
          <div>
            <label>Diagnóstico *</label>
            <textarea id="diagnostico" required placeholder="1- ..."></textarea>
            <div class="muted">Enter = siguiente número. Shift+Enter = salto normal.</div>
          </div>
          <div>
            <label>Tratamiento *</label>
            <textarea id="tratamiento" required placeholder="1- ..."></textarea>
            <div class="muted">Enter = siguiente número. Shift+Enter = salto normal.</div>
          </div>
        </div>
        <div class="flex" style="justify-content:flex-end;">
          <button class="btn" type="submit">Guardar</button>
        </div>
        <div id="msgEmer" class="muted"></div>
      </form>
    </div>

    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:flex-end;">
        <div>
          <h2 style="margin-top:0;">Mis últimos pacientes</h2>
          <p class="muted">Solo ves pacientes registrados por tu usuario.</p>
        </div>
        <div class="flex">
          <div>
            <div class="muted" style="font-size:12px;">Desde</div>
            <input type="date" id="expDesde" />
          </div>
          <div>
            <div class="muted" style="font-size:12px;">Hasta</div>
            <input type="date" id="expHasta" />
          </div>
          <button class="btn-ghost" id="btnExport">Exportar Excel</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="col-fecha">Fecha</th>
              <th class="col-paciente">Paciente</th>
              <th class="col-dx">Diagnóstico</th>
              <th class="col-trat">Tratamiento</th>
              <th class="col-estado">Estado</th>
              <th class="col-enf">Enfermera</th>
              <th class="col-actions">Acciones</th>
            </tr>
          </thead>
          <tbody id="tblEmer"></tbody>
        </table>
      </div>
    </div>
  `;

  enableAutoNumbering(document.getElementById("diagnostico"));
  enableAutoNumbering(document.getElementById("tratamiento"));

  document.getElementById("formEmer").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const paciente = document.getElementById("paciente").value.trim();
    const diagnostico = document.getElementById("diagnostico").value.trim();
    const tratamiento = document.getElementById("tratamiento").value.trim();
    const msg = document.getElementById("msgEmer");
    msg.textContent = "";
    try {
      await api("/api/emergencias/pacientes", {
        method: "POST",
        body: JSON.stringify({ paciente, diagnostico, tratamiento }),
      });
      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      document.getElementById("paciente").value = "";
      document.getElementById("diagnostico").value = "";
      document.getElementById("tratamiento").value = "";
      await loadEmerTable(true);
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });

  document.getElementById("btnExport").addEventListener("click", () => {
    const desde = document.getElementById("expDesde").value;
    const hasta = document.getElementById("expHasta").value;
    const url = new URL("/api/emergencias/export.xlsx", window.location.origin);
    if (desde) url.searchParams.set("desde", desde);
    if (hasta) url.searchParams.set("hasta", hasta);
    window.location.href = url.toString();
  });

  await loadEmerTable(false);

  clearInterval(window.__emergTimer);
  window.__emergTimer = setInterval(() => {
    if (currentModule === "emergencias") loadEmerTable(true);
  }, 25000);
}

async function loadEmerTable(silent = false) {
  const tbody = document.getElementById("tblEmer");
  if (!tbody) return;

  if (!silent) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Cargando...</td></tr>`;
  }

  const r = await api("/api/emergencias/pacientes?limit=10");
  const items = r.items || [];

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sin registros aún.</td></tr>`;
    return;
  }

  const html = items.map(it => `
    <tr>
      <td class="col-fecha">${escapeHtml(it.created_at||"")}</td>
      <td class="col-paciente"><strong>${escapeHtml(it.paciente||"")}</strong></td>
      <td class="col-dx">${escapeHtml(it.diagnostico||"")}</td>
      <td class="col-trat">${escapeHtml(it.tratamiento||"")}</td>
      <td class="col-estado">${badgeEstado(it.estado)}</td>
      <td class="col-enf">${escapeHtml(it.enfermera_user||"")}</td>
      <td class="col-actions">
        <button class="btn-ghost" type="button" onclick="editEmer(${it.id})">Editar</button>
      </td>
    </tr>
  `).join("");

  if (tbody.innerHTML !== html) tbody.innerHTML = html;
}

// =====================================================
// Enfermería
// =====================================================
async function renderEnfermeria() {
  if (!window.renderEnfermeriaModule) return alert("No se cargó enfermeria.js");
  return await window.renderEnfermeriaModule();
}

// =====================================================
// Superadmin (completo: Usuarios / Auditoría / DB)
// =====================================================
async function renderSuperadmin() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Configuración</h2>
      <div class="flex">
        <button class="btn-ghost" id="tabUsers">Usuarios</button>
        <button class="btn-ghost" id="tabAudit">Auditoría</button>
        <button class="btn-ghost" id="tabDb">Base de Datos</button>
      </div>
    </div>
    <div id="superBody"></div>
  `;

  document.getElementById("tabUsers").addEventListener("click", showUsers);
  document.getElementById("tabAudit").addEventListener("click", showAudit);
  document.getElementById("tabDb").addEventListener("click", showDb);

  await showUsers();

  async function showUsers() {
    const body = document.getElementById("superBody");
    body.innerHTML = `
      <div class="card">
        <div class="flex" style="justify-content:space-between;align-items:flex-end;">
          <div>
            <h2 style="margin-top:0;">Usuarios</h2>
            <p class="muted">Editar Exequatur.</p>
          </div>
          <div class="flex">
            <input id="userQ" placeholder="Buscar..." style="max-width:260px;" />
            <button class="btn-ghost" id="btnReloadUsers">Recargar</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table" style="min-width:1200px;">
            <thead>
              <tr><th>ID</th><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Exequatur</th><th>Acción</th></tr>
            </thead>
            <tbody id="tblUsers"></tbody>
          </table>
        </div>
      </div>
    `;
    document.getElementById("btnReloadUsers").addEventListener("click", loadUsers);
    document.getElementById("userQ").addEventListener("input", () => {
      clearTimeout(window.__uT); window.__uT = setTimeout(loadUsers, 250);
    });
    await loadUsers();

    async function loadUsers() {
      const q = document.getElementById("userQ").value.trim();
      const r = await api(`/api/superadmin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const items = r.items || [];
      const tb = document.getElementById("tblUsers");
      if (items.length === 0) {
        tb.innerHTML = `<tr><td colspan="7" class="muted">Sin usuarios.</td></tr>`;
        return;
      }
      tb.innerHTML = items.map(u => `
        <tr>
          <td>${u.id}</td>
          <td><strong>${escapeHtml(u.username||"")}</strong></td>
          <td>${escapeHtml(u.name||"")}</td>
          <td>${escapeHtml(u.role||"")}</td>
          <td>${u.active ? "Sí" : "No"}</td>
          <td>${escapeHtml(u.exequatur||"")}</td>
          <td><button class="btn-ghost" type="button" data-uid="${u.id}" data-ex="${escapeAttr(u.exequatur||"")}">Exequatur</button></td>
        </tr>
      `).join("");

      tb.querySelectorAll("button[data-uid]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const uid = Number(btn.getAttribute("data-uid"));
          const current = btn.getAttribute("data-ex") || "";
          const ex = prompt("Exequatur:", current || "");
          if (ex === null) return;
          await api(`/api/superadmin/users/${uid}/set_exequatur`, { method: "POST", body: JSON.stringify({ exequatur: ex }) });
          await loadUsers();
        });
      });
    }
  }

  async function showAudit() {
    const body = document.getElementById("superBody");
    const r = await api("/api/audit?limit=200");
    body.innerHTML = `
      <div class="card">
        <h2 style="margin-top:0;">Auditoría</h2>
        <div class="table-wrap">
          <table class="table" style="min-width:1200px;">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Entidad</th><th>ID</th></tr></thead>
            <tbody>
              ${(r.items||[]).map(it => `
                <tr>
                  <td class="col-fecha">${escapeHtml(it.created_at||"")}</td>
                  <td>${escapeHtml(it.user||"")}</td>
                  <td>${escapeHtml(it.role||"")}</td>
                  <td><strong>${escapeHtml(it.action||"")}</strong></td>
                  <td>${escapeHtml(it.entity||"")}</td>
                  <td>${it.entity_id ?? ""}</td>
                </tr>
              `).join("") || `<tr><td colspan="6" class="muted">Sin registros.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function showDb() {
    const body = document.getElementById("superBody");
    const info = await api("/api/superadmin/db_info");
    body.innerHTML = `
      <div class="card">
        <h2 style="margin-top:0;">Base de Datos</h2>
        <div class="row-1">
          <div><label>DB</label><input readonly value="${escapeAttr(info.db_path)}"/></div>
          <div><label>Data dir</label><input readonly value="${escapeAttr(info.data_dir)}"/></div>
          <div><label>Exports</label><input readonly value="${escapeAttr(info.exports_dir)}"/></div>
          <div><label>Backups</label><input readonly value="${escapeAttr(info.backups_dir)}"/></div>
        </div>
      </div>
    `;
  }
}

// =====================================================
// Ingresos - Home (lista + nuevo)
// =====================================================
function canCreateIngreso() {
  return currentUser && ["emergencias", "planta", "especialista", "administrador", "superadmin", "auditor"].includes(currentUser.role);
}

async function renderIngresosHome(mountEl) {
  mountEl.innerHTML = `
    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:flex-end;gap:12px;">
        <div>
          <h2 style="margin-top:0;">Ingresos</h2>
          <p class="muted">Activos y egresados. Selecciona un ingreso para ver detalle.</p>
        </div>
        <div class="flex" style="gap:8px;flex-wrap:wrap;">
          <select id="ingEstado">
            <option value="activo" selected>Activos</option>
            <option value="egresado">Egresados</option>
            <option value="all">Todos</option>
          </select>
          ${canCreateIngreso() ? `<button class="btn" id="btnNuevoIng" type="button">Nuevo ingreso</button>` : ``}
          <button class="btn-ghost" id="btnReloadIng" type="button">Recargar</button>
        </div>
      </div>

      <div class="table-wrap" style="margin-top:10px;">
        <table class="table" style="min-width:1100px;">
          <thead>
            <tr>
              <th>ID</th>
              <th>Creado</th>
              <th>Estado</th>
              <th>Sala</th>
              <th>Habitación</th>
              <th>Cama</th>
              <th>Especialidad</th>
              <th>Especialista que ordena</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="tblIngresos"></tbody>
        </table>
      </div>
    </div>

    <div id="ingDetalle"></div>
  `;

  const estadoSel = mountEl.querySelector("#ingEstado");
  const btnReload = mountEl.querySelector("#btnReloadIng");
  const btnNuevo = mountEl.querySelector("#btnNuevoIng");

  estadoSel.addEventListener("change", () => loadIngresosList());
  btnReload.addEventListener("click", () => loadIngresosList());

  if (btnNuevo) {
    btnNuevo.addEventListener("click", async () => {
      await modalNuevoIngreso(() => loadIngresosList());
    });
  }

  window.__ingresosMount = mountEl;
  await loadIngresosList();

  async function loadIngresosList() {
    const tbody = mountEl.querySelector("#tblIngresos");
    const estado = estadoSel.value;
    tbody.innerHTML = `<tr><td colspan="9" class="muted">Cargando...</td></tr>`;

    const r = await api(`/api/ingresos?estado=${encodeURIComponent(estado)}`);
    const items = r.items || [];

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="muted">No hay ingresos.</td></tr>`;
      mountEl.querySelector("#ingDetalle").innerHTML = "";
      return;
    }

    tbody.innerHTML = items.map(it => `
      <tr>
        <td><b>${it.id}</b></td>
        <td class="col-fecha">${escapeHtml(it.created_at || "")}</td>
        <td>${it.estado === "egresado" ? `<span class="badge badge-ok">Egresado</span>` : `<span class="badge badge-warn">Activo</span>`}</td>
        <td>${escapeHtml(it.sala || "")}</td>
        <td>${escapeHtml(it.habitacion || "")}</td>
        <td>${escapeHtml(it.cama || "")}</td>
        <td>${escapeHtml(it.especialidad || "")}</td>
        <td>${escapeHtml(it.especialista_user || "")}</td>
        <td><button class="btn-ghost" type="button" onclick="openIngresoDetalle(${it.id})">Abrir</button></td>
      </tr>
    `).join("");
  }
}

async function modalNuevoIngreso(onSaved) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:900px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Nuevo ingreso</h3>
          <div class="muted" style="margin-top:6px;">Fecha/hora se autocompletan, pero puedes modificarlas.</div>
        </div>
        <button class="btn-ghost" id="btnCloseIng" type="button">Cerrar</button>
      </div>

      <div class="row-1" style="margin-top:12px;">
        <div class="row">
          <div>
            <label>Sala</label>
            <input id="inSala" placeholder="Sala Clínica" />
          </div>
          <div>
            <label>Habitación</label>
            <input id="inHab" placeholder="101" />
          </div>
          <div>
            <label>Cama</label>
            <input id="inCama" placeholder="A" />
          </div>
        </div>

        <div class="row">
          <div>
            <label>Especialidad</label>
            <input id="inEsp" placeholder="Medicina interna" />
          </div>
          <div>
            <label>Fecha ingreso</label>
            <input id="inFecha" type="date" />
          </div>
          <div>
            <label>Hora</label>
            <input id="inHora" type="time" />
          </div>
        </div>

        <div>
          <label>Especialista que ordena *</label>
          <select id="inEspecialista">
            <option value="">-- Selecciona --</option>
          </select>
        </div>

        <div class="flex" style="justify-content:flex-end;gap:8px;">
          <button class="btn" id="btnSaveIng" type="button">Guardar</button>
        </div>

        <div id="msgIng" class="muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // fecha/hora automática (editable)
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());

  const inFecha = modal.querySelector("#inFecha");
  const inHora = modal.querySelector("#inHora");
  if (inFecha && !inFecha.value) inFecha.value = `${yyyy}-${mm}-${dd}`;
  if (inHora && !inHora.value) inHora.value = `${hh}:${mi}`;

  const close = () => modal.remove();
  modal.querySelector("#btnCloseIng").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  // cargar especialistas
  try {
    const r = await api("/api/users?role=especialista");
    const sel = modal.querySelector("#inEspecialista");
    (r.items || []).forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.username;
      opt.textContent = `${u.name || u.username} (${u.username})`;
      sel.appendChild(opt);
    });
  } catch (e) {}

  modal.querySelector("#btnSaveIng").addEventListener("click", async () => {
    const msg = modal.querySelector("#msgIng");
    msg.textContent = "";
    msg.style.color = "#6b7280";

    const espSel = modal.querySelector("#inEspecialista").value;
    if (!espSel) {
      msg.textContent = "Debes seleccionar el especialista que ordena el ingreso.";
      msg.style.color = "#b00020";
      return;
    }

    const payload = {
      sala: modal.querySelector("#inSala").value.trim(),
      habitacion: modal.querySelector("#inHab").value.trim(),
      cama: modal.querySelector("#inCama").value.trim(),
      especialidad: modal.querySelector("#inEsp").value.trim(),
      fecha_ingreso: modal.querySelector("#inFecha").value,
      hora_ingreso: modal.querySelector("#inHora").value,
      especialista_user: espSel,
    };

    try {
      await api("/api/ingresos", { method: "POST", body: JSON.stringify(payload) });
      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      close();
      if (onSaved) await onSaved();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}

// =====================================================
// Ingresos - Detalle (sin onclick inline para edición)
// =====================================================
window.openIngresoDetalle = openIngresoDetalle;

function _role() {
  return (currentUser && currentUser.role) || "";
}
function _canMedico() {
  return ["emergencias", "planta", "especialista", "auditor", "administrador", "superadmin"].includes(_role());
}
function _canAdmisionEdit() {
  return ["admision", "auditor", "administrador", "superadmin"].includes(_role());
}

async function openIngresoDetalle(iid) {
  const mountEl = window.__ingresosMount || document.getElementById("module-content");
  const detailEl = mountEl.querySelector("#ingDetalle");
  if (!detailEl) return alert("No se encontró #ingDetalle. Abre Ingresos primero.");

  detailEl.innerHTML = `<div class="card"><p class="muted">Cargando ingreso #${iid}...</p></div>`;

  try {
    const r = await api(`/api/ingresos/${iid}`);
    const ing = r.ingreso || {};
    const adm = r.admision || {};
    const admCompleta = !!(adm && (adm.admision_completa == 1 || adm.admision_completa === true));
    const evol = r.evoluciones || [];
    const ord = r.ordenes || [];
    const epi = r.epicrisis || null;

    const canMed = _canMedico();
    const canAdm = _canAdmisionEdit();

    const lockTab = (id, locked) => {
  const b = detailEl.querySelector("#"+id);
  if (!b) return;
  b.disabled = !!locked;
  b.title = locked ? "Completa la admisión primero" : "";
  b.style.opacity = locked ? "0.55" : "1";
};

lockTab("tabHc", !admCompleta);
lockTab("tabOrd", !admCompleta);
lockTab("tabEvo", !admCompleta);
lockTab("tabEpi", !admCompleta);
    detailEl.innerHTML = `
      <div class="card">
        <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <h2 style="margin:0;">Ingreso #${ing.id}</h2>
            <div class="muted" style="margin-top:6px;">
              Estado: <b>${escapeHtml(ing.estado || "")}</b>
              • Creado: <b>${escapeHtml(ing.created_at || "")}</b>
              • Especialista: <b>${escapeHtml(ing.especialista_user || "")}</b>
            </div>
            <div class="muted" style="margin-top:6px;">
              Ubicación: <b>${escapeHtml(ing.sala || "")}</b> / <b>${escapeHtml(ing.habitacion || "")}</b> / <b>${escapeHtml(ing.cama || "")}</b>
              • Especialidad: <b>${escapeHtml(ing.especialidad || "")}</b>
              • Ingreso: <b>${escapeHtml(ing.fecha_ingreso || "")}</b> <b>${escapeHtml(ing.hora_ingreso || "")}</b>
            </div>
          </div>

          <div class="flex" style="gap:8px;margin-top:12px;flex-wrap:wrap;">
  <button class="btn-ghost" id="tabAdm" type="button">Admisión</button>
  <button class="btn-ghost" id="tabHc" type="button">Historia clínica</button>
  <button class="btn-ghost" id="tabOrd" type="button">Órdenes (${ord.length})</button>
  <button class="btn-ghost" id="tabEvo" type="button">Evoluciones (${evol.length})</button>
  <button class="btn-ghost" id="tabEpi" type="button">Epicrisis</button>
</div>
        </div>
      </div>

      <div id="tabBody"></div>
    `;

    const btnNewEvo = detailEl.querySelector("#btnNewEvo");
const btnNewOrd = detailEl.querySelector("#btnNewOrd");
const btnEpicrisis = detailEl.querySelector("#btnEpicrisis");
const btnRefreshDet = detailEl.querySelector("#btnRefreshDet");

if (btnRefreshDet) {
  btnRefreshDet.addEventListener("click", () => openIngresoDetalle(iid));
}

if (btnNewEvo) {
  btnNewEvo.disabled = !canMed || !admCompleta;
  btnNewOrd.disabled = !canMed || !admCompleta;
  btnEpicrisis.disabled = !canMed || !admCompleta;
  btnNewEvo.addEventListener("click", () => modalNuevaEvolucion(iid, () => openIngresoDetalle(iid)));
}
if (!admCompleta) return alert("Debes completar la admisión primero.");

if (btnNewOrd) {
  btnNewOrd.disabled = !canMed;
  btnNewOrd.addEventListener("click", () => modalNuevaOrden(iid, false, () => openIngresoDetalle(iid)));
}

if (btnEpicrisis) {
  btnEpicrisis.disabled = !canMed;
  btnEpicrisis.addEventListener("click", () => modalEpicrisis(iid, epi, () => openIngresoDetalle(iid)));
}

    const body = detailEl.querySelector("#tabBody");
const tabAdm = detailEl.querySelector("#tabAdm");
const tabHc  = detailEl.querySelector("#tabHc");
const tabOrd = detailEl.querySelector("#tabOrd");
const tabEvo = detailEl.querySelector("#tabEvo");
const tabEpi = detailEl.querySelector("#tabEpi");

if (tabAdm) tabAdm.addEventListener("click", () => {
  setActive("tabAdm");
  renderTabAdmision(body, iid, adm, ing, canAdm, () => openIngresoDetalle(iid));
});

tabHc.addEventListener("click", () => {
  setActive("tabHc");
  if (!window.renderTabHistoriaClinica) return alert("No se cargó historia_clinica.js");
  window.renderTabHistoriaClinica(body, iid, ing, adm, () => openIngresoDetalle(iid));
});

if (tabOrd) tabOrd.addEventListener("click", () => {
  setActive("tabOrd");
  renderTabOrdenes(body, iid, ord, canMed, () => openIngresoDetalle(iid));
});

if (tabEvo) tabEvo.addEventListener("click", () => {
  setActive("tabEvo");
  renderTabEvoluciones(body, iid, evol, canMed, ing, () => openIngresoDetalle(iid));
});

if (tabEpi) tabEpi.addEventListener("click", () => {
  setActive("tabEpi");
  renderTabEpicrisis(body, epi);
});

if (!tabHc) {
  console.error("No existe #tabHc. Revisa detailEl.innerHTML (tabs duplicados o falta el botón).");
  return alert("No aparece el botón Historia clínica (#tabHc).");
}
    const setActive = (id) => {
  ["tabAdm","tabHc","tabOrd","tabEvo","tabEpi"].forEach(x => {
    const el = detailEl.querySelector("#"+x);
    if (el) el.classList.remove("btn");
  });
  const el = detailEl.querySelector("#"+id);
  if (el) el.classList.add("btn");
};
detailEl.querySelector("#tabAdm").addEventListener("click", () => {
  setActive("tabAdm");
  renderTabAdmision(body, iid, adm, ing, canAdm, () => openIngresoDetalle(iid));
});

detailEl.querySelector("#tabHc").addEventListener("click", () => {
  setActive("tabHc");
  if (!window.renderTabHistoriaClinica) return alert("No se cargó historia_clinica.js");
  window.renderTabHistoriaClinica(body, iid, ing, adm, () => openIngresoDetalle(iid));
});

detailEl.querySelector("#tabOrd").addEventListener("click", () => {
  setActive("tabOrd");
  renderTabOrdenes(body, iid, ord, canMed, () => openIngresoDetalle(iid));
});

detailEl.querySelector("#tabEvo").addEventListener("click", () => {
  setActive("tabEvo");
  renderTabEvoluciones(body, iid, evol, canMed, ing, () => openIngresoDetalle(iid));
});

detailEl.querySelector("#tabEpi").addEventListener("click", () => {
  setActive("tabEpi");
  renderTabEpicrisis(body, epi);
});

    setActive("tabHc");
if (!window.renderTabHistoriaClinica) return alert("No se cargó historia_clinica.js");
window.renderTabHistoriaClinica(body, iid, ing, adm, () => openIngresoDetalle(iid));
  } catch (e) {
    detailEl.innerHTML = `<div class="card"><p class="muted" style="color:#b00020;">${escapeHtml(e.message)}</p></div>`;
  }
}

function renderTabAdmision(body, iid, adm, ing, canEdit, onSaved) {
  body.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0;">Hoja de Admisión</h3>
      ${!canEdit ? `<p class="muted">Solo lectura.</p>` : ``}

      <div class="row-1">
        <div class="row">
          <div><label>Código</label><input id="adCodigo" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.codigo || "")}"></div>
          <div><label>Fecha</label><input id="adFecha" type="date" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.fecha || "")}"></div>
          <div><label>Hora</label><input id="adHora" type="time" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.hora || "")}"></div>
        </div>

        <div class="row">
          <div><label>Habitación</label><input id="adHab" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.habitacion || ing.habitacion || "")}"></div>
          <div><label>Especialidad</label><input id="adEsp" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.especialidad || ing.especialidad || "")}"></div>
        </div>

        <div class="row">
          <div><label>Nombres</label><input id="adNom" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.nombres || "")}"></div>
          <div><label>Apellidos</label><input id="adApe" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.apellidos || "")}"></div>
        </div>

        <div class="row">
          <div><label>Edad</label><input id="adEdad" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.edad || "")}"></div>
          <div><label>Sexo</label><input id="adSexo" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.sexo || "")}"></div>
          <div><label>Cédula</label><input id="adCed" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.cedula || "")}"></div>
        </div>

        <div><label>Dirección</label><input id="adDir" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.direccion || "")}"></div>

        <div class="row">
          <div><label>ARS</label><input id="adArs" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.seguro_ars || "")}"></div>
          <div><label>NSS</label><input id="adNss" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.nss || "")}"></div>
          <div><label>Ocupación</label><input id="adOcu" ${canEdit ? "" : "readonly"} value="${escapeAttr(adm.ocupacion || "")}"></div>
        </div>

        <hr style="margin:12px 0;border:none;border-top:1px solid #e5e7eb;" />

        <h4 style="margin:0 0 8px 0;">Diagnósticos</h4>
        <div class="row-1">
          <input id="dx1" ${canEdit ? "" : "readonly"} placeholder="1" value="${escapeAttr(adm.dx_1 || "")}">
          <input id="dx2" ${canEdit ? "" : "readonly"} placeholder="2" value="${escapeAttr(adm.dx_2 || "")}">
          <input id="dx3" ${canEdit ? "" : "readonly"} placeholder="3" value="${escapeAttr(adm.dx_3 || "")}">
          <input id="dx4" ${canEdit ? "" : "readonly"} placeholder="4" value="${escapeAttr(adm.dx_4 || "")}">
          <input id="dx5" ${canEdit ? "" : "readonly"} placeholder="5" value="${escapeAttr(adm.dx_5 || "")}">
        </div>

        ${canEdit ? `
          <div class="flex" style="justify-content:flex-end;gap:8px;margin-top:12px;">
            <button class="btn" id="btnSaveAdm" type="button">Guardar admisión</button>
          </div>
          <div id="admMsg" class="muted" style="margin-top:8px;"></div>
        ` : ``}
      </div>
    </div>
  `;

  if (!canEdit) return;

  const f = body.querySelector("#adFecha");
  const h = body.querySelector("#adHora");
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  if (f && !f.value) f.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (h && !h.value) h.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  body.querySelector("#btnMarkAdmComplete").addEventListener("click", async () => {
  const msg = body.querySelector("#admMsg");
  msg.textContent = "";
  msg.style.color = "#6b7280";

  // Reusa el mismo payload (lo recalculamos)
  const payload = {
    codigo: body.querySelector("#adCodigo").value.trim(),
    fecha: body.querySelector("#adFecha").value,
    hora: body.querySelector("#adHora").value,
    habitacion: body.querySelector("#adHab").value.trim(),
    especialidad: body.querySelector("#adEsp").value.trim(),
    nombres: body.querySelector("#adNom").value.trim(),
    apellidos: body.querySelector("#adApe").value.trim(),
    edad: body.querySelector("#adEdad").value.trim(),
    sexo: body.querySelector("#adSexo").value.trim(),
    cedula: body.querySelector("#adCed").value.trim(),
    direccion: body.querySelector("#adDir").value.trim(),
    seguro_ars: body.querySelector("#adArs").value.trim(),
    nss: body.querySelector("#adNss").value.trim(),
    ocupacion: body.querySelector("#adOcu").value.trim(),
    dx_1: body.querySelector("#dx1").value.trim(),
    dx_2: body.querySelector("#dx2").value.trim(),
    dx_3: body.querySelector("#dx3").value.trim(),
    dx_4: body.querySelector("#dx4").value.trim(),
    dx_5: body.querySelector("#dx5").value.trim(),

    admision_completa: 1,
  };
body.querySelector("#btnMarkAdmIncomplete").addEventListener("click", async () => {
  if (!confirm("¿Marcar admisión como INCOMPLETA? Se bloquearán historia clínica/órdenes/evoluciones/epicrisis.")) return;
  try {
    await api(`/api/ingresos/${iid}/admision`, { method: "PUT", body: JSON.stringify({ admision_completa: 0 }) });
    if (onSaved) await onSaved();
  } catch (e) {
    alert(e.message);
  }
});
  const errs = requiredErrors(payload);
  if (errs.length) {
    msg.textContent = "Faltan campos para completar admisión:\n" + errs.join("\n");
    msg.style.color = "#b00020";
    return;
  }

  try {
    await api(`/api/ingresos/${iid}/admision`, { method: "PUT", body: JSON.stringify(payload) });
    msg.textContent = "✓ Admisión COMPLETA";
    msg.style.color = "#137a3a";
    if (onSaved) await onSaved(); // esto refresca openIngresoDetalle y habilita tabs
  } catch (e) {
    msg.textContent = e.message;
    msg.style.color = "#b00020";
  }
});
}
function renderTabOrdenes(body, iid, ord, canEdit, onRefresh) {
  body.innerHTML = `
    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;">
        <div>
          <h3 style="margin-top:0;">Órdenes médicas</h3>
          <p class="muted" style="margin:6px 0 0 0;">Puedes imprimir cada orden de forma independiente o todas.</p>
        </div>
        <div class="flex" style="gap:8px;flex-wrap:wrap;">
          <button class="btn-ghost" id="btnPrintOrdAll" type="button">Imprimir todas</button>
        </div>
      </div>

      ${(ord.length === 0) ? `<p class="muted">Sin órdenes aún.</p>` : `
        <div class="table-wrap">
          <table class="table" style="min-width:1100px;">
            <thead><tr><th>Fecha/Hora</th><th>Medidas</th><th>Órdenes</th><th>Acción</th></tr></thead>
            <tbody>
              ${ord.map(o => `
                <tr>
                  <td class="col-fecha">${escapeHtml(o.fecha_hora || "")}</td>
                  <td style="white-space:pre-wrap;">${escapeHtml(o.medidas_generales || "")}</td>
                  <td style="white-space:pre-wrap;">${escapeHtml(o.ordenes || "")}</td>
                  <td>
                    <div class="flex" style="gap:8px;flex-wrap:wrap;">
                      <button class="btn-ghost btnPrintOrdOne" type="button" data-oid="${o.id}">Imprimir</button>
                      ${canEdit ? `<button class="btn-ghost btnEditOrd" type="button" data-oid="${o.id}">Editar</button>` : ``}
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  const btnAll = body.querySelector("#btnPrintOrdAll");
  if (btnAll) btnAll.addEventListener("click", () => modalPrintOrdenes(iid, "all"));

  // imprimir una orden (independiente)
  body.querySelectorAll(".btnPrintOrdOne").forEach(btn => {
    btn.addEventListener("click", () => {
      const oid = Number(btn.getAttribute("data-oid"));
      modalPrintOrdenes(iid, "one", { oid });
    });
  });

  if (!canEdit) return;
  body.querySelectorAll(".btnEditOrd").forEach(btn => {
    btn.addEventListener("click", () => {
      const oid = Number(btn.getAttribute("data-oid"));
      modalEditarOrdenFromList(oid, ord, onRefresh);
    });
  });
}

async function modalPrintOrdenes(iid, mode, extra = {}) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Imprimir órdenes</h3>
          <div class="muted" style="margin-top:6px;">Ingreso #<b>${iid}</b></div>
        </div>
        <button class="btn-ghost" id="btnClose" type="button">Cerrar</button>
      </div>

      <div class="row-1" style="margin-top:12px;">
        <div>
          <label>Médico que redacta (firma)</label>
          <input id="medRedacta" value="${escapeAttr((currentUser && currentUser.name) || (currentUser && currentUser.username) || "")}" />
        </div>

        <div>
          <label>Especialista que autoriza *</label>
          <select id="selEsp">
            <option value="">-- Selecciona --</option>
          </select>
          <div class="muted">Por defecto se selecciona el especialista del ingreso, pero puedes cambiarlo.</div>
        </div>

        <div class="flex" style="justify-content:flex-end;gap:8px;">
          <button class="btn" id="btnPrint" type="button">Imprimir</button>
        </div>

        <div id="msg" class="muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#btnClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  // cargar ingreso para obtener especialista_user (default)
  let defaultEsp = "";
  try {
    const det = await api(`/api/ingresos/${iid}`);
    defaultEsp = ((det.ingreso && det.ingreso.especialista_user) || "").trim();
  } catch (e) {}

  // cargar especialistas
  try {
    const r = await api("/api/users?role=especialista");
    const sel = modal.querySelector("#selEsp");
    (r.items || []).forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.username;
      opt.textContent = `${u.name || u.username} (${u.username})`;
      if (defaultEsp && u.username === defaultEsp) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (e) {}

  // si defaultEsp existe pero no vino en la lista, lo ponemos como opción
  if (defaultEsp) {
    const has = [...modal.querySelectorAll("#selEsp option")].some(o => o.value === defaultEsp);
    if (!has) {
      const opt = document.createElement("option");
      opt.value = defaultEsp;
      opt.textContent = `${defaultEsp} (ingreso)`;
      opt.selected = true;
      modal.querySelector("#selEsp").appendChild(opt);
    }
  }

  modal.querySelector("#btnPrint").addEventListener("click", async () => {
    const msg = modal.querySelector("#msg");
    msg.textContent = "";
    msg.style.color = "#6b7280";

    const medicoRedacta = modal.querySelector("#medRedacta").value.trim();
    const espUser = modal.querySelector("#selEsp").value;

    if (!espUser) {
      msg.textContent = "Debes seleccionar el especialista que autoriza.";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await printOrdenesIngreso(iid, mode, { medicoRedacta, especialistaUser: espUser, oid: extra.oid });
      close();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}

async function printOrdenesIngreso(iid, mode, opts) {
  const r = await api(`/api/ingresos/${iid}`);
  const ing = r.ingreso || {};
  const adm = r.admision || {};
  const ordenes = (r.ordenes || []);

  let items = [];
  if (mode === "all") items = ordenes;
  else if (mode === "last") items = ordenes.slice(0, 1);
  else if (mode === "one") {
    const oid = Number(opts && opts.oid);
    items = ordenes.filter(o => Number(o.id) === oid);
  }

  if (!items.length) throw new Error("No se encontró la(s) orden(es) a imprimir.");

  const pacienteNombre = `${(adm.nombres || "").trim()} ${(adm.apellidos || "").trim()}`.trim() || "(Sin nombre)";
  const sala = (ing.sala || "").trim();
  const hab = (ing.habitacion || "").trim();
  const cama = (ing.cama || "").trim();

  const dx = [adm.dx_1, adm.dx_2, adm.dx_3, adm.dx_4, adm.dx_5]
    .filter(Boolean).map(x => String(x).trim()).filter(Boolean);
  const dxText = dx.length ? dx.map((d, i) => `${i + 1}- ${d}`).join("\n") : "(Sin diagnóstico)";

  const medicoIngresa = (ing.especialista_user || "").trim() || "(N/D)";
  const medicoRedacta = (opts && opts.medicoRedacta) ? opts.medicoRedacta : "";
  const espAutoriza = (opts && opts.especialistaUser) ? opts.especialistaUser : "";

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Órdenes médicas - Ingreso ${iid}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; }
    h1 { font-size:18px; margin:0; }
    .muted { color:#444; font-size:12px; }
    .box { border:1px solid #000; padding:10px; margin-top:10px; }
    .row { display:flex; gap:12px; flex-wrap:wrap; }
    .col { flex:1; min-width:240px; }
    pre { white-space:pre-wrap; margin:0; font-family: Arial, sans-serif; }
    .signRow { display:flex; gap:24px; margin-top:28px; }
    .sign { flex:1; }
    .line { border-top:1px solid #000; margin-top:40px; }
    .signName { margin-top:6px; font-size:12px; }
  </style>
</head>
<body>
  <div>
    <h1>ÓRDENES MÉDICAS</h1>
    <div class="muted">Ingreso #${iid} • ${new Date().toLocaleString()}</div>
  </div>

  <div class="box">
    <div class="row">
      <div class="col"><b>Paciente:</b> ${escapeHtml(pacienteNombre)}</div>
      <div class="col"><b>Sala:</b> ${escapeHtml(sala)} / <b>Hab:</b> ${escapeHtml(hab)} / <b>Cama:</b> ${escapeHtml(cama)}</div>
    </div>
    <div class="row" style="margin-top:6px;">
      <div class="col"><b>Médico que ingresa:</b> ${escapeHtml(medicoIngresa)}</div>
      <div class="col"><b>Especialidad:</b> ${escapeHtml(ing.especialidad || "")}</div>
    </div>
  </div>

  <div class="box">
    <b>Diagnóstico</b>
    <pre>${escapeHtml(dxText)}</pre>
  </div>

  ${items.map(o => `
    <div class="box">
      <div class="muted"><b>Fecha/Hora:</b> ${escapeHtml(o.fecha_hora || "")}</div>
      <div style="margin-top:8px;"><b>Medidas generales</b></div>
      <pre>${escapeHtml(o.medidas_generales || "")}</pre>
      <div style="margin-top:8px;"><b>Órdenes</b></div>
      <pre>${escapeHtml(o.ordenes || "")}</pre>
    </div>
  `).join("")}

  <div class="signRow">
    <div class="sign">
      <div class="line"></div>
      <div class="signName"><b>Firma médico que redacta:</b> ${escapeHtml(medicoRedacta)}</div>
    </div>
    <div class="sign">
      <div class="line"></div>
      <div class="signName"><b>Firma especialista que autoriza:</b> ${escapeHtml(espAutoriza)}</div>
    </div>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) throw new Error("Popup bloqueado. Permite popups para imprimir.");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

async function modalEditarOrdenFromList(oid, ordList, onRefresh) {
  const o = (ordList || []).find(x => Number(x.id) === Number(oid));
  if (!o) return alert("No se encontró la orden. Recarga.");

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Editar orden</h3>
          <div class="muted" style="margin-top:6px;">ID Orden: <b>${oid}</b></div>
        </div>
        <button class="btn-ghost" id="btnClose" type="button">Cerrar</button>
      </div>

      <div class="row-1" style="margin-top:12px;">
        <div>
          <label>Fecha/Hora</label>
          <input id="f" value="${escapeAttr(o.fecha_hora || "")}" />
        </div>

        <div>
          <label>Medidas generales *</label>
          <textarea id="m" rows="6">${escapeHtml(o.medidas_generales || "")}</textarea>
        </div>

        <div>
          <label>Órdenes *</label>
          <textarea id="t" rows="10">${escapeHtml(o.ordenes || "")}</textarea>
          <div class="muted">Enter = siguiente número. Shift+Enter = salto normal.</div>
        </div>

        <div class="flex" style="justify-content:flex-end;gap:8px;">
          <button class="btn" id="btnSave" type="button">Guardar</button>
        </div>
        <div id="msg" class="muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector("#btnClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  enableAutoNumbering(modal.querySelector("#t"));
  enableAutoNumbering(modal.querySelector("#m"));

  modal.querySelector("#btnSave").addEventListener("click", async () => {
    const msg = modal.querySelector("#msg");
    msg.textContent = "";
    msg.style.color = "#6b7280";

    const payload = {
      fecha_hora: modal.querySelector("#f").value.trim(),
      medidas_generales: modal.querySelector("#m").value.trim(),
      ordenes: modal.querySelector("#t").value.trim(),
    };
   
    if (!payload.medidas_generales || !payload.ordenes) {
      msg.textContent = "Completa medidas generales y órdenes.";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await api(`/api/ingresos/ordenes/${oid}`, { method: "PUT", body: JSON.stringify(payload) });
      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      close();
      if (onRefresh) await onRefresh();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}
function renderTabEvoluciones(body, iid, evol, canEdit, ing, onRefresh) {
  const diaActual = calcDiaIngresoBy6am(ing, new Date());
  body.innerHTML = `
    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;">
        <div>
          <h3 style="margin-top:0;">
  Evoluciones <span class="muted">(${diaIngresoLabel(diaActual)})</span>
</h3>
          <p class="muted" style="margin:6px 0 0 0;">Imprime cada evolución de forma independiente o todas.</p>
        </div>
        <div class="flex" style="gap:8px;flex-wrap:wrap;">
          <button class="btn-ghost" id="btnPrintEvoAll" type="button">Imprimir todas</button>
        </div>
      </div>

      ${(evol.length === 0) ? `<p class="muted">Sin evoluciones aún.</p>` : `
        <div class="table-wrap">
          <table class="table" style="min-width:950px;">
            <thead><tr><th>Fecha/Hora</th><th>Nota</th><th>Acción</th></tr></thead>
            <tbody>
              ${evol.map(ev => `
                <tr>
                  <td class="col-fecha">${escapeHtml(ev.fecha_hora || "")}<div class="muted">${escapeHtml(diaIngresoLabel(ev.dia_ingreso))}</div></td>
                  <td style="white-space:pre-wrap;">${escapeHtml(ev.nota || "")}</td>
                  <td>
                    <div class="flex" style="gap:8px;flex-wrap:wrap;">
                      <button class="btn-ghost btnPrintEvoOne" type="button" data-eid="${ev.id}">Imprimir</button>
                      ${canEdit ? `<button class="btn-ghost btnEditEvo" type="button" data-eid="${ev.id}">Editar</button>` : ``}
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  const btnAll = body.querySelector("#btnPrintEvoAll");
  if (btnAll) btnAll.addEventListener("click", () => modalPrintEvoluciones(iid, "all"));

  body.querySelectorAll(".btnPrintEvoOne").forEach(btn => {
    btn.addEventListener("click", () => {
      const eid = Number(btn.getAttribute("data-eid"));
      modalPrintEvoluciones(iid, "one", { eid });
    });
  });

  if (!canEdit) return;
  body.querySelectorAll(".btnEditEvo").forEach(btn => {
    btn.addEventListener("click", () => {
      const eid = Number(btn.getAttribute("data-eid"));
      modalEditarEvoFromList(eid, evol, onRefresh);
    });
  });
}

async function modalPrintEvoluciones(iid, mode, extra = {}) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Imprimir evoluciones</h3>
          <div class="muted" style="margin-top:6px;">Ingreso #<b>${iid}</b></div>
        </div>
        <button class="btn-ghost" id="btnClose" type="button">Cerrar</button>
      </div>

      <div class="row-1" style="margin-top:12px;">
        <div>
          <label>Médico que escribe (firma)</label>
          <input id="medFirma" value="${escapeAttr((currentUser && currentUser.name) || (currentUser && currentUser.username) || "")}" />
        </div>

        <div class="flex" style="justify-content:flex-end;gap:8px;">
          <button class="btn" id="btnPrint" type="button">Imprimir</button>
        </div>

        <div id="msg" class="muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#btnClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  modal.querySelector("#btnPrint").addEventListener("click", async () => {
    const msg = modal.querySelector("#msg");
    msg.textContent = "";
    msg.style.color = "#6b7280";

    const medicoFirma = modal.querySelector("#medFirma").value.trim();
    if (!medicoFirma) {
      msg.textContent = "Indica el nombre para la firma.";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await printEvolucionesIngreso(iid, mode, { medicoFirma, eid: extra.eid });
      close();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}

async function printEvolucionesIngreso(iid, mode, opts) {
  const r = await api(`/api/ingresos/${iid}`);
  const ing = r.ingreso || {};
  const adm = r.admision || {};
  const diaIng = calcDiaIngresoBy6am(ing, new Date());
  const evol = (r.evoluciones || []);

  let items = [];
  if (mode === "all") items = evol;
  else if (mode === "last") items = evol.slice(0, 1);
  else if (mode === "one") {
    const eid = Number(opts && opts.eid);
    items = evol.filter(x => Number(x.id) === eid);
  }

  if (!items.length) throw new Error("No se encontró la(s) evolución(es) a imprimir.");

  const pacienteNombre = `${(adm.nombres || "").trim()} ${(adm.apellidos || "").trim()}`.trim() || "(Sin nombre)";
  const sala = (ing.sala || "").trim();
  const hab = (ing.habitacion || "").trim();
  const cama = (ing.cama || "").trim();

  const dx = [adm.dx_1, adm.dx_2, adm.dx_3, adm.dx_4, adm.dx_5]
    .filter(Boolean).map(x => String(x).trim()).filter(Boolean);
  const dxText = dx.length ? dx.map((d, i) => `${i + 1}- ${d}`).join("\n") : "(Sin diagnóstico)";

  const medicoIngresa = (ing.especialista_user || "").trim() || "(N/D)";
  const medicoFirma = (opts && opts.medicoFirma) ? opts.medicoFirma : "";

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Evoluciones - Ingreso ${iid}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; }
    h1 { font-size:18px; margin:0; }
    .muted { color:#444; font-size:12px; }
    .box { border:1px solid #000; padding:10px; margin-top:10px; }
    .row { display:flex; gap:12px; flex-wrap:wrap; }
    .col { flex:1; min-width:240px; }
    pre { white-space:pre-wrap; margin:0; font-family: Arial, sans-serif; }
    .sign { margin-top:28px; }
    .line { border-top:1px solid #000; margin-top:40px; }
    .signName { margin-top:6px; font-size:12px; }
  </style>
</head>
<body>
  <div>
    <h1>EVOLUCIÓN</h1>
    <div class="muted">Ingreso #${iid} • ${new Date().toLocaleString()}</div>
  </div>

  <div class="box">
    <div class="row">
      <div class="col"><b>Paciente:</b> ${escapeHtml(pacienteNombre)}</div>
      <div class="col"><b>Sala:</b> ${escapeHtml(sala)} / <b>Hab:</b> ${escapeHtml(hab)} / <b>Cama:</b> ${escapeHtml(cama)}</div>
    <div class="row" style="margin-top:6px;">
  <div class="col"><b>${escapeHtml(diaIngresoLabel(diaIng))}</b></div>
</div>
    <div class="row" style="margin-top:6px;">
      <div class="col"><b>Médico que ingresa:</b> ${escapeHtml(medicoIngresa)}</div>
      <div class="col"><b>Especialidad:</b> ${escapeHtml(ing.especialidad || "")}</div>
    </div>
  </div>

  <div class="box">
    <b>Diagnóstico</b>
    <pre>${escapeHtml(dxText)}</pre>
  </div>

  ${items.map(ev => `
    <div class="box">
      <div class="muted"><b>Fecha/Hora:</b> ${escapeHtml(ev.fecha_hora || "")}</div>
      <div style="margin-top:8px;"><b>Nota de evolución</b></div>
      <pre>${escapeHtml(ev.nota || "")}</pre>
    </div>
  `).join("")}

  <div class="sign">
    <div class="line"></div>
    <div class="signName"><b>Firma médico que escribe:</b> ${escapeHtml(medicoFirma)}</div>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) throw new Error("Popup bloqueado. Permite popups para imprimir.");
  w.document.open();
  w.document.write(html);
    w.document.close();
  w.focus();
  w.print();
}
  
async function modalEditarEvoFromList(eid, evolList, onRefresh) {
  const ev = (evolList || []).find(x => Number(x.id) === Number(eid));
  if (!ev) return alert("No se encontró. Recarga.");
  const svPrev = parseSvFromNota(ev.nota || "");
const notaSinSv = stripSvBlockFromNota(ev.nota || "");

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Editar evolución</h3>
          <div class="muted" style="margin-top:6px;">ID: <b>${eid}</b></div>
        </div>
        <button class="btn-ghost" id="btnClose" type="button">Cerrar</button>
      </div>

      <div class="row-1" style="margin-top:12px;">
        <div>
          <label>Fecha/Hora</label>
          <input id="f" value="${escapeAttr(ev.fecha_hora || "")}" />
          <div class="muted">Editable</div>
        </div>

        <div>
          <label>Día de ingreso (editable)</label>
          <input id="diaIng" type="number" min="1" step="1" value="${escapeAttr(ev.dia_ingreso ?? "")}" />
          <div class="muted">Si lo dejas vacío, se usa 1.</div>
        </div>

        <div>
          <label>Nota *</label>
         <textarea id="t" rows="12">${escapeHtml(notaSinSv || "")}</textarea>
        </div>
                <div style="margin-top:10px;">
          <label>Signos vitales</label>

          <div class="row">
            <div><label>TA</label><input id="sv_ta" value="${escapeAttr(svPrev.ta)}" /></div>
            <div><label>FC</label><input id="sv_fc" value="${escapeAttr(svPrev.fc)}" /></div>
            <div><label>FR</label><input id="sv_fr" value="${escapeAttr(svPrev.fr)}" /></div>
          </div>

          <div class="row" style="margin-top:8px;">
            <div><label>TEMP</label><input id="sv_temp" value="${escapeAttr(svPrev.temp)}" /></div>
            <div><label>SAT O2</label><input id="sv_sat" value="${escapeAttr(svPrev.sat_o2)}" /></div>
            <div><label>GLICEMIA</label><input id="sv_glic" value="${escapeAttr(svPrev.glicemia)}" /></div>
          </div>
        </div>

        <div class="flex" style="justify-content:flex-end;gap:8px;">
          <button class="btn" id="btnSave" type="button">Guardar</button>
        </div>

        <div id="msg" class="muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#btnClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  modal.querySelector("#btnSave").addEventListener("click", async () => {
    const msg = modal.querySelector("#msg");
    msg.textContent = "";
    msg.style.color = "#59606e";

    const notaLibre = modal.querySelector("#t").value.trim();
if (!notaLibre) {
  msg.textContent = "La nota es requerida.";
  msg.style.color = "#b00020";
  return;
}
const diaIng = Number(modal.querySelector("#diaIng").value || 1);
if (!Number.isFinite(diaIng) || diaIng < 1) {
  msg.textContent = "Día de ingreso inválido (mínimo 1).";
  msg.style.color = "#b00020";
  return;
}

const sv = {
  ta: modal.querySelector("#sv_ta").value.trim(),
  fc: modal.querySelector("#sv_fc").value.trim(),
  fr: modal.querySelector("#sv_fr").value.trim(),
  temp: modal.querySelector("#sv_temp").value.trim(),
  sat_o2: modal.querySelector("#sv_sat").value.trim(),
  glicemia: modal.querySelector("#sv_glic").value.trim(),
};

const payload = {
  fecha_hora: modal.querySelector("#f").value.trim(),
  nota: (notaLibre + buildSvBlock(sv)).trim(),
  dia_ingreso: diaIng,
};

    try {
      await api(`/api/ingresos/evoluciones/${eid}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      close();
      if (onRefresh) await onRefresh();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}

function renderTabEpicrisis(body, epi) {
  if (!epi) {
    body.innerHTML = `
      <div class="card">
        <h3 style="margin-top:0;">Epicrisis</h3>
        <p class="muted">No se ha registrado epicrisis aún.</p>
      </div>
    `;
    return;
  }

  body.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0;">Epicrisis / Egreso</h3>
      <div class="row-1">
        <div class="row">
          <div><label>Fecha egreso</label><input readonly value="${escapeAttr(epi.fecha_egreso || "")}"></div>
          <div><label>Destino</label><input readonly value="${escapeAttr(epi.destino || "")}"></div>
          <div><label>Referido hospital</label><input readonly value="${escapeAttr(epi.referido_hospital || "")}"></div>
        </div>

        <div><label>Dx Ingreso</label><textarea readonly rows="3">${escapeHtml(epi.dx_ingreso || "")}</textarea></div>
        <div><label>Dx Egreso</label><textarea readonly rows="3">${escapeHtml(epi.dx_egreso || "")}</textarea></div>
        <div><label>Procedimientos</label><textarea readonly rows="3">${escapeHtml(epi.procedimientos || "")}</textarea></div>
        <div><label>Hallazgos</label><textarea readonly rows="3">${escapeHtml(epi.hallazgos || "")}</textarea></div>
        <div><label>Tratamiento</label><textarea readonly rows="3">${escapeHtml(epi.tratamiento || "")}</textarea></div>
        <div><label>Plan seguimiento</label><textarea readonly rows="3">${escapeHtml(epi.plan_seguimiento || "")}</textarea></div>
        <div><label>Causas fallecimiento</label><textarea readonly rows="3">${escapeHtml(epi.causas_fallecimiento || "")}</textarea></div>
      </div>
    </div>
  `;
}
async function modalNuevaEvolucion(iid, onDone, copyLast = false) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const f = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  modal.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Nueva evolución</h3>
          <div class="muted" style="margin-top:6px;">Ingreso #<b>${iid}</b></div>
        </div>
        <button class="btn-ghost" id="btnClose" type="button">Cerrar</button>
      </div>

      <div class="row-1" style="margin-top:12px;">
        <div>
          <label>Fecha/Hora</label>
          <input id="fecha" value="${escapeAttr(f)}" />
          <div class="muted">Editable</div>
        </div>
        <div>
  <label>Día de ingreso (editable)</label>
  <input id="diaIng" type="number" min="1" step="1" value="1" />
  <div class="muted">Si lo dejas vacío, se usa 1.</div>
</div>
        <div>
          <label>Nota *</label>
          <textarea id="nota" rows="12" placeholder="Escribe la evolución..."></textarea>
        </div>
                <div>
          <label>Signos vitales</label>

          <div class="row">
            <div><label>TA</label><input id="sv_ta" placeholder="120/80" /></div>
            <div><label>FC</label><input id="sv_fc" placeholder="80" /></div>
            <div><label>FR</label><input id="sv_fr" placeholder="18" /></div>
          </div>

          <div class="row" style="margin-top:8px;">
            <div><label>TEMP</label><input id="sv_temp" placeholder="36.8" /></div>
            <div><label>SAT O2</label><input id="sv_sat" placeholder="98%" /></div>
            <div><label>GLICEMIA</label><input id="sv_glic" placeholder="110" /></div>
          </div>

          <div class="muted" style="margin-top:6px;">Se guardan dentro de la nota como “SIGNOS VITALES”.</div>
        </div>

        <div class="flex" style="justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <button class="btn-ghost" id="btnLoadLastEvo" type="button">Cargar última</button>
          <button class="btn" id="btnSave" type="button">Guardar</button>
        </div>

        <div id="msg" class="muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
try {
  const det = await api(`/api/ingresos/${iid}`);
  const ing = det.ingreso || {};
  const dia = calcDiaIngresoBy6am(ing, new Date());
  modal.querySelector("#diaIng").value = String(dia || 1);
} catch (e) {
  modal.querySelector("#diaIng").value = "1";
}
  const close = () => modal.remove();
  modal.querySelector("#btnClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  // ====== AQUÍ VA lo de "Cargar última" ======
  modal.querySelector("#btnLoadLastEvo").addEventListener("click", async () => {
    try {
      const r = await api(`/api/ingresos/${iid}`);
      const last = (r.evoluciones || [])[0]; // DESC => [0] última
      if (!last) return alert("No hay evoluciones previas para copiar.");
      modal.querySelector("#nota").value = last.nota || "";
    } catch (e) {
      alert(e.message);
    }
  });

  if (copyLast) modal.querySelector("#btnLoadLastEvo").click();
  // ====== FIN bloque ======

  modal.querySelector("#btnSave").addEventListener("click", async () => {
    const msg = modal.querySelector("#msg");
    msg.textContent = "";
    msg.style.color = "#6b7280";
const diaEl = modal.querySelector("#diaIng");
const diaIng = Number((diaEl && diaEl.value) ? diaEl.value : 1) || 1;

if (diaIng < 1) {
  msg.textContent = "Día de ingreso inválido (mínimo 1).";
  msg.style.color = "#b00020";
  return;
}
    const notaLibre = modal.querySelector("#nota").value.trim();

const sv = {
  ta: modal.querySelector("#sv_ta").value.trim(),
  fc: modal.querySelector("#sv_fc").value.trim(),
  fr: modal.querySelector("#sv_fr").value.trim(),
  temp: modal.querySelector("#sv_temp").value.trim(),
  sat_o2: modal.querySelector("#sv_sat").value.trim(),
  glicemia: modal.querySelector("#sv_glic").value.trim(),
};

const payload = {
  fecha_hora: modal.querySelector("#fecha").value.trim(),
  nota: (notaLibre + buildSvBlock(sv)).trim(),
  dia_ingreso: diaIng,
};
    if (!payload.nota) {
      msg.textContent = "La nota es requerida.";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await api(`/api/ingresos/${iid}/evoluciones`, { method: "POST", body: JSON.stringify(payload) });
      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      close();
      if (onDone) await onDone();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}

// Órdenes: UI lista para POST que acepte medidas_generales/ordenes.
// Si tu backend aún no las acepta, se guardará default y luego editas con PUT.
async function modalNuevaOrden(iid, copyLast, onDone) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const f = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  modal.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Nueva orden médica</h3>
          <div class="muted" style="margin-top:6px;">Ingreso #<b>${iid}</b></div>
        </div>
        <button class="btn-ghost" id="btnClose" type="button">Cerrar</button>
      </div>

      <div class="row-1" style="margin-top:12px;">
        <div>
          <label>Fecha/Hora</label>
          <input id="fecha" value="${escapeAttr(f)}" />
          <div class="muted">Editable</div>
        </div>

        <div>
          <label>Medidas generales *</label>
          <textarea id="medidas" rows="6" placeholder="1- ..."></textarea>
          <div class="muted">Enter = siguiente número. Shift+Enter = salto normal.</div>
        </div>

        <div>
          <label>Órdenes *</label>
          <textarea id="ordenes" rows="10" placeholder="1- ..."></textarea>
          <div class="muted">Enter = siguiente número. Shift+Enter = salto normal.</div>
        </div>

        <div class="flex" style="justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div class="flex" style="gap:8px;">
            <button class="btn-ghost" id="btnLoadDefault" type="button">Cargar default</button>
            <button class="btn-ghost" id="btnLoadLast" type="button">Cargar última</button>
          </div>
          <button class="btn" id="btnSave" type="button">Guardar</button>
        </div>

        <div id="msg" class="muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector("#btnClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  const taMed = modal.querySelector("#medidas");
  const taOrd = modal.querySelector("#ordenes");
  enableAutoNumbering(taMed);
  enableAutoNumbering(taOrd);

  const DEFAULT_MED = (
    "1- Ingresar a Sala Clinica\n" +
    "2- Signos Vitales por Turno\n" +
    "3- Dieta Suave\n" +
    "4- Cuidados Generales por Enfermeria\n" +
    "5- Avisar Ante Eventualidad\n"
  );
  function loadDefault() {
    taMed.value = DEFAULT_MED;
    if (!taOrd.value.trim()) taOrd.value = "1- ";
  }

  modal.querySelector("#btnLoadDefault").addEventListener("click", loadDefault);
  modal.querySelector("#btnLoadLast").addEventListener("click", async () => {
    try {
      const r = await api(`/api/ingresos/${iid}`);
      const last = (r.ordenes || [])[0]; // DESC => [0] última
      if (!last) return alert("No hay órdenes previas para copiar.");
      taMed.value = last.medidas_generales || "";
      taOrd.value = last.ordenes || "";
      if (!taOrd.value.trim()) taOrd.value = "1- ";
    } catch (e) {
      alert(e.message);
    }
  });

  if (copyLast) modal.querySelector("#btnLoadLast").click();
  else loadDefault();

  modal.querySelector("#btnSave").addEventListener("click", async () => {
    const msg = modal.querySelector("#msg");
    msg.textContent = "";
    msg.style.color = "#6b7280";

    const payload = {
      copy_last: false,
      fecha_hora: modal.querySelector("#fecha").value.trim(),
      medidas_generales: taMed.value.trim(),
      ordenes: taOrd.value.trim(),
    };

    if (!payload.medidas_generales || !payload.ordenes) {
      msg.textContent = "Completa medidas generales y órdenes.";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await api(`/api/ingresos/${iid}/ordenes`, { method: "POST", body: JSON.stringify(payload) });
      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      close();
      if (onDone) await onDone();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}

async function modalEpicrisis(iid, epiPrev, onDone) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dfltFecha = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  modal.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Epicrisis / Egreso</h3>
          <div class="muted" style="margin-top:6px;">Ingreso #<b>${iid}</b></div>
        </div>
        <button class="btn-ghost" id="btnClose" type="button">Cerrar</button>
      </div>

      <div class="row-1" style="margin-top:12px;">
        <div class="row">
          <div>
            <label>Fecha egreso *</label>
            <input id="fecha" type="date" value="${escapeAttr((epiPrev && epiPrev.fecha_egreso) || dfltFecha)}" />
          </div>
          <div>
            <label>Destino *</label>
            <select id="destino">
              ${["alta_medica","referido","fallecido","fuga","alta_peticion"].map(x => `
                <option value="${x}" ${(epiPrev && epiPrev.destino===x) ? "selected" : ""}>${x}</option>
              `).join("")}
            </select>
          </div>
          <div>
            <label>Hospital referido</label>
            <input id="refHosp" value="${escapeAttr((epiPrev && epiPrev.referido_hospital) || "")}" placeholder="Obligatorio si destino = referido" />
          </div>
        </div>

        <div><label>Dx Ingreso</label><textarea id="dxIng" rows="3">${escapeHtml((epiPrev && epiPrev.dx_ingreso) || "")}</textarea></div>
        <div><label>Dx Egreso</label><textarea id="dxEgr" rows="3">${escapeHtml((epiPrev && epiPrev.dx_egreso) || "")}</textarea></div>
        <div><label>Procedimientos</label><textarea id="proc" rows="3">${escapeHtml((epiPrev && epiPrev.procedimientos) || "")}</textarea></div>
        <div><label>Hallazgos</label><textarea id="hall" rows="3">${escapeHtml((epiPrev && epiPrev.hallazgos) || "")}</textarea></div>
        <div><label>Tratamiento</label><textarea id="trat" rows="3">${escapeHtml((epiPrev && epiPrev.tratamiento) || "")}</textarea></div>
        <div><label>Plan seguimiento</label><textarea id="plan" rows="3">${escapeHtml((epiPrev && epiPrev.plan_seguimiento) || "")}</textarea></div>
        <div><label>Causas fallecimiento</label><textarea id="caus" rows="3">${escapeHtml((epiPrev && epiPrev.causas_fallecimiento) || "")}</textarea></div>

        <div class="flex" style="justify-content:flex-end;gap:8px;">
          <button class="btn" id="btnSave" type="button">Guardar y egresar</button>
        </div>
        <div id="msg" class="muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector("#btnClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  modal.querySelector("#btnSave").addEventListener("click", async () => {
    const msg = modal.querySelector("#msg");
    msg.textContent = "";
    msg.style.color = "#6b7280";

    const destino = modal.querySelector("#destino").value;
    const refHosp = modal.querySelector("#refHosp").value.trim();
    if (destino === "referido" && !refHosp) {
      msg.textContent = "Si destino es referido, debes indicar hospital referido.";
      msg.style.color = "#b00020";
      return;
    }

    const payload = {
      fecha_egreso: modal.querySelector("#fecha").value,
      destino,
      referido_hospital: refHosp,
      dx_ingreso: modal.querySelector("#dxIng").value.trim(),
      dx_egreso: modal.querySelector("#dxEgr").value.trim(),
      procedimientos: modal.querySelector("#proc").value.trim(),
      hallazgos: modal.querySelector("#hall").value.trim(),
      tratamiento: modal.querySelector("#trat").value.trim(),
      plan_seguimiento: modal.querySelector("#plan").value.trim(),
      causas_fallecimiento: modal.querySelector("#caus").value.trim(),
    };

    try {
      await api(`/api/ingresos/${iid}/epicrisis`, { method: "POST", body: JSON.stringify(payload) });
      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      close();
      if (onDone) await onDone();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}

// =====================================================
// Editar Emergencia (editEmer) - conservado
// =====================================================
window.editEmer = editEmer;

async function editEmer(pid) {
  const r = await api("/api/emergencias/pacientes?limit=200");
  const it = (r.items || []).find(x => Number(x.id) === Number(pid));
  if (!it) return alert("No se encontró el paciente. Recarga e intenta de nuevo.");

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Editar paciente</h3>
          <div class="muted" style="margin-top:6px;">
            ID: <b>${pid}</b> • Estado: <b>${it.estado === "aplicado" ? "Aplicado" : "Pendiente"}</b>
            ${it.enfermera_user ? `• Enfermera: <b>${escapeHtml(it.enfermera_user)}</b>` : ""}
          </div>
        </div>
        <div class="flex">
          <button class="btn-ghost" id="btnCloseEdit" type="button">Cerrar</button>
        </div>
      </div>

      <div class="row-1" style="margin-top:12px;">
        <div>
          <label>Paciente *</label>
          <input id="edPaciente" value="${escapeAttr(it.paciente || "")}" />
        </div>

        <div class="row">
          <div>
            <label>Diagnóstico *</label>
            <textarea id="edDx">${escapeHtml(it.diagnostico || "")}</textarea>
            <div class="muted">Enter = siguiente número. Shift+Enter = salto normal.</div>
          </div>
          <div>
            <label>Tratamiento / Medicamentos *</label>
            <textarea id="edTx">${escapeHtml(it.tratamiento || "")}</textarea>
            <div class="muted">Enter = siguiente número. Shift+Enter = salto normal.</div>
          </div>
        </div>

        <div class="flex" style="justify-content:flex-end; gap:8px;">
          <button class="btn" id="btnSaveEdit" type="button">Guardar cambios</button>
        </div>

        <div id="editMsg" class="muted" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#btnCloseEdit").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  enableAutoNumbering(modal.querySelector("#edDx"));
  enableAutoNumbering(modal.querySelector("#edTx"));

  modal.querySelector("#btnSaveEdit").addEventListener("click", async () => {
    const msg = modal.querySelector("#editMsg");
    msg.textContent = "";
    msg.style.color = "#6b7280";

    const paciente = modal.querySelector("#edPaciente").value.trim();
    const diagnostico = modal.querySelector("#edDx").value.trim();
    const tratamiento = modal.querySelector("#edTx").value.trim();

    if (!paciente || !diagnostico || !tratamiento) {
      msg.textContent = "Completa paciente, diagnóstico y tratamiento.";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await api(`/api/emergencias/pacientes/${pid}`, {
        method: "PUT",
        body: JSON.stringify({ paciente, diagnostico, tratamiento }),
      });
      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      await loadEmerTable();
      close();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}

// =====================================================
// Auto-numbering helper
// =====================================================
function parseSvFromNota(nota = "") {
  const out = { ta:"", fc:"", fr:"", temp:"", glicemia:"", sat_o2:"" };
  const lines = String(nota || "").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*(TA|FC|FR|TEMP|GLICEMIA|SAT\s*O2)\s*:\s*(.*)\s*$/i);
    if (!m) continue;
    const k = m[1].toUpperCase().replace(/\s+/g, " ");
    const v = (m[2] || "").trim();
    if (k === "TA") out.ta = v;
    else if (k === "FC") out.fc = v;
    else if (k === "FR") out.fr = v;
    else if (k === "TEMP") out.temp = v;
    else if (k === "GLICEMIA") out.glicemia = v;
    else if (k === "SAT O2") out.sat_o2 = v;
  }
  return out;
}

function stripSvBlockFromNota(nota = "") {
  const lines = String(nota || "").split(/\r?\n/);
  const filtered = lines.filter(l =>
    !/^\s*(SV|SIGNOS\s+VITALES)\s*:?\s*$/i.test(l) &&
    !/^\s*(TA|FC|FR|TEMP|GLICEMIA|SAT\s*O2)\s*:/i.test(l)
  );
  return filtered.join("\n").trim();
}

function buildSvBlock({ ta, fc, fr, temp, glicemia, sat_o2 }) {
  return [
    "",
    "SIGNOS VITALES:",
    `TA: ${ta || "-"}`,
    `FC: ${fc || "-"}`,
    `FR: ${fr || "-"}`,
    `TEMP: ${temp || "-"}`,
    `SAT O2: ${sat_o2 || "-"}`,
    `GLICEMIA: ${glicemia || "-"}`,
  ].join("\n");
}
function enableAutoNumbering(textarea) {
  textarea.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();

    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const before = value.slice(0, start);
    const after = value.slice(end);

    const lastNewline = before.lastIndexOf("\n");
    const currentLine = before.slice(lastNewline + 1);

    const m = currentLine.match(/^\s*(\d+)\-\s/);

    let nextPrefix = "1- ";
    if (m) nextPrefix = `${parseInt(m[1], 10) + 1}- `;
    else {
      const allMatches = [...value.matchAll(/^\s*(\d+)\-\s/mg)];
      if (allMatches.length > 0) nextPrefix = `${parseInt(allMatches[allMatches.length - 1][1], 10) + 1}- `;
    }

    const insert = "\n" + nextPrefix;
    textarea.value = before + insert + after;

    const newPos = before.length + insert.length;
    textarea.setSelectionRange(newPos, newPos);
  });

  textarea.addEventListener("focus", () => {
    if (textarea.value.trim() === "") {
      textarea.value = "1- ";
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  });
}

// Debug
console.log("app.js cargado OK, openModule:", typeof window.openModule); 