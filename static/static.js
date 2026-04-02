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
// Escape helpers
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

// ---------------------
// Workspace control
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
// Login UI
// ---------------------
function loginCard(role, title) {
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

    openModule(role);
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
      if (!p1 || p1.length < 4) {
        msg.textContent = "Mínimo 4 caracteres.";
        return;
      }
      if (p1 !== p2) {
        msg.textContent = "No coinciden.";
        return;
      }

      try {
        await api("/api/auth/change_password", {
          method: "POST",
          body: JSON.stringify({ old_password: "", new_password: p1 }),
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

// IMPORTANT: index.html onclick uses openModule
window.openModule = openModule;

// ---------------------
// Module Router
// ---------------------
async function openModule(module) {
  currentModule = module;
  const content = document.getElementById("module-content");

  const me = await api("/api/auth/me");
  currentUser = me.user;

  const titles = {
    emergencias: "Médico de Emergencias",
    especialista: "Médico Especialista",
    enfermeria: "Enfermería",
    farmacia: "Farmacia",
    facturacion: "Facturación",
    admision: "Admisión",
    auditor: "Auditoría Médica",
    administrador: "Administrador",
    superadmin: "Configuración (Propietario)",
  };

  if (!currentUser || currentUser.role !== module) {
    content.innerHTML = loginCard(module, titles[module] || module);
    document.getElementById("loginForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      doLogin(module);
    });
    showWorkspace(titles[module] || "Acceso");
    return;
  }

  showWorkspace(titles[module] || "Workspace");

  if (module === "emergencias") return renderEmergenciasHome();
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

// =====================================================
// Branding boot
// =====================================================
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
(async function boot() { await loadBranding(); })();

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
    <div id="factPanel"></div>
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
        <button class="menu-btn" id="btnAudIng"><i class="fas fa-hospital-user"></i><br>Ingresos (estructura)</button>
      </div>
    </div>
    <div id="audPanel"></div>
  `;
  document.getElementById("btnAudAseg").addEventListener("click", async () => {
    if (!window.renderAuditoriaAsegurados) return alert("No se cargó asegurados.js");
    await window.renderAuditoriaAsegurados();
  });
  document.getElementById("btnAudIng").addEventListener("click", () => {
    document.getElementById("audPanel").innerHTML = `
      <div class="card">
        <h2 style="margin-top:0;">Ingresos</h2>
        <p class="muted">Pendiente de programación.</p>
      </div>
    `;
  });
}

// =====================================================
// Emergencias Home (con submódulos)
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
  document.getElementById("btnIng").addEventListener("click", () => {
    document.getElementById("emergSubPanel").innerHTML = `
      <div class="card">
        <h2 style="margin-top:0;">Ingresos</h2>
        <p class="muted">Pendiente de programación.</p>
      </div>
    `;
  });
}

// =====================================================
// Emergencias Normal (registro + lista + editar + export)
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
      <div class="flex" style="justify-content:space-between;">
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
      await loadEmerTable();
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

  await loadEmerTable();
}

async function loadEmerTable() {
  const tbody = document.getElementById("tblEmer");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="muted">Cargando...</td></tr>`;
  const r = await api("/api/emergencias/pacientes?limit=10");
  const items = r.items || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sin registros aún.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(it => `
    <tr>
      <td class="col-fecha">${escapeHtml(it.created_at||"")}</td>
      <td class="col-paciente"><strong>${escapeHtml(it.paciente||"")}</strong></td>
      <td class="col-dx">${escapeHtml(it.diagnostico||"")}</td>
      <td class="col-trat">${escapeHtml(it.tratamiento||"")}</td>
      <td class="col-estado">${badgeEstado(it.estado)}</td>
      <td class="col-enf">${escapeHtml(it.enfermera_user||"")}</td>
      <td class="col-actions"><button class="btn-ghost" onclick="openEditPaciente(${it.id})">Editar</button></td>
    </tr>
  `).join("");
}

window.openEditPaciente = openEditPaciente;

function openEditPaciente(id) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <h3>Editar Paciente</h3>
      <p class="muted">Puedes editar paciente, diagnóstico y tratamiento.</p>

      <div class="row-1">
        <div>
          <label>Paciente *</label>
          <input id="edit_paciente" />
        </div>
        <div class="row">
          <div>
            <label>Diagnóstico *</label>
            <textarea id="edit_diagnostico"></textarea>
            <div class="muted">Enter = siguiente número. Shift+Enter = salto normal.</div>
          </div>
          <div>
            <label>Tratamiento *</label>
            <textarea id="edit_tratamiento"></textarea>
            <div class="muted">Enter = siguiente número. Shift+Enter = salto normal.</div>
          </div>
        </div>
      </div>

      <div class="flex" style="justify-content:flex-end;margin-top:12px;">
        <button class="btn-ghost" id="btnCancel">Cancelar</button>
        <button class="btn" id="btnSave">Guardar</button>
      </div>
      <div id="editMsg" class="muted" style="margin-top:8px;color:#b00020;"></div>
    </div>
  `;
  document.body.appendChild(modal);

  (async () => {
    const r = await api("/api/emergencias/pacientes?limit=50");
    const it = (r.items || []).find(x => x.id === id);
    if (it) {
      document.getElementById("edit_paciente").value = it.paciente || "";
      document.getElementById("edit_diagnostico").value = it.diagnostico || "";
      document.getElementById("edit_tratamiento").value = it.tratamiento || "";
      enableAutoNumbering(document.getElementById("edit_diagnostico"));
      enableAutoNumbering(document.getElementById("edit_tratamiento"));
    }
  })();

  modal.querySelector("#btnCancel").addEventListener("click", () => modal.remove());
  modal.querySelector("#btnSave").addEventListener("click", async () => {
    const paciente = document.getElementById("edit_paciente").value.trim();
    const diagnostico = document.getElementById("edit_diagnostico").value.trim();
    const tratamiento = document.getElementById("edit_tratamiento").value.trim();
    const msg = document.getElementById("editMsg");
    msg.textContent = "";
    try {
      await api(`/api/emergencias/pacientes/${id}`, { method: "PUT", body: JSON.stringify({ paciente, diagnostico, tratamiento }) });
      await loadEmerTable();
      modal.remove();
    } catch (e) {
      msg.textContent = e.message;
    }
  });
}

// =====================================================
// Enfermería (igual look)
// =====================================================
async function renderEnfermeria() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Ambulatorio</h2>
      <p class="muted">Requiere al menos 1 material.</p>

      <form id="formAmb" class="row-1">
        <div class="row">
          <div>
            <label>Paciente *</label>
            <input id="ambPaciente" required />
          </div>
          <div>
            <label>Medicamento/Tratamiento *</label>
            <input id="ambMed" required />
          </div>
        </div>

        <div class="flex" style="justify-content:flex-end;">
          <button class="btn-ghost" type="button" id="ambMaterialsBtn">Seleccionar materiales</button>
          <button class="btn" type="submit">Guardar ambulatorio</button>
        </div>
        <div id="ambMsg" class="muted"></div>
      </form>
    </div>

    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:flex-end;">
        <div>
          <h2 style="margin-top:0;">Últimas medicaciones</h2>
          <p class="muted">Incluye pendientes y aplicados.</p>
        </div>
        <div class="muted" id="enfMeta"></div>
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
              <th class="col-actions">Acción</th>
            </tr>
          </thead>
          <tbody id="tblEnf"></tbody>
        </table>
      </div>
    </div>
  `;

  let ambSelectedMaterials = [];

  document.getElementById("ambMaterialsBtn").addEventListener("click", async () => {
    ambSelectedMaterials = await openMaterialsPickerModal({ initial: ambSelectedMaterials, onlyActive: true });
  });

  document.getElementById("formAmb").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const paciente = document.getElementById("ambPaciente").value.trim();
    const medicamento = document.getElementById("ambMed").value.trim();
    const msg = document.getElementById("ambMsg");
    msg.textContent = "";
    try {
      if (!ambSelectedMaterials || ambSelectedMaterials.length === 0) {
        throw new Error("Debes seleccionar al menos 1 material gastable.");
      }
      await api("/api/enfermeria/ambulatorio", {
        method: "POST",
        body: JSON.stringify({
          paciente,
          medicamento,
          materiales: ambSelectedMaterials.map(x => ({ material_id: x.material_id, cantidad: x.cantidad })),
        }),
      });
      msg.textContent = "✓ Ambulatorio guardado";
      msg.style.color = "#137a3a";
      document.getElementById("ambPaciente").value = "";
      document.getElementById("ambMed").value = "";
      ambSelectedMaterials = [];
      await loadEnfTable();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });

  await loadEnfTable();
  setInterval(() => {
    if (currentModule === "enfermeria") loadEnfTable().catch(() => {});
  }, 3500);
}

async function loadEnfTable() {
  const tbody = document.getElementById("tblEnf");
  const meta = document.getElementById("enfMeta");
  if (!tbody) return;
  const r = await api("/api/enfermeria/pacientes");
  meta.textContent = `Mostrando últimos ${r.limit || ""}`;
  const items = r.items || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sin registros.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(it => `
    <tr>
      <td class="col-fecha">${escapeHtml(it.created_at||"")}</td>
      <td class="col-paciente"><strong>${escapeHtml(it.paciente||"")}</strong></td>
      <td class="col-dx">${escapeHtml(it.diagnostico||"")}</td>
      <td class="col-trat">${escapeHtml(it.tratamiento||"")}</td>
      <td class="col-estado">${badgeEstado(it.estado)}</td>
      <td class="col-enf">${escapeHtml(it.enfermera_user||"")}</td>
      <td class="col-actions">
        <button class="btn-ghost" onclick="editMaterials(${it.id})">Materiales</button>
        <button class="btn" onclick="applyPatient(${it.id})" ${it.estado === "aplicado" ? "disabled" : ""}>Aplicar</button>
      </td>
    </tr>
  `).join("");
}
window.editMaterials = editMaterials;
window.applyPatient = applyPatient;

async function editMaterials(pid) {
  const current = await api(`/api/enfermeria/pacientes/${pid}/materiales`);
  const initial = (current.items || []).map(x => ({ material_id: x.material_id, nombre: x.material, cantidad: x.cantidad }));
  const selected = await openMaterialsPickerModal({ initial, onlyActive: true });

  await api(`/api/enfermeria/pacientes/${pid}/materiales`, {
    method: "POST",
    body: JSON.stringify({ items: selected.map(x => ({ material_id: x.material_id, cantidad: x.cantidad })) }),
  });
  await loadEnfTable();
}

async function applyPatient(pid) {
  const mats = await api(`/api/enfermeria/pacientes/${pid}/materiales`);
  if (!mats.items || mats.items.length === 0) {
    alert("Debes seleccionar al menos 1 material gastable antes de aplicar.");
    return;
  }
  await api(`/api/enfermeria/pacientes/${pid}/aplicar`, { method: "POST", body: JSON.stringify({}) });
  await loadEnfTable();
}

// ---------------------
// Material picker modal
// ---------------------
async function openMaterialsPickerModal({ initial, onlyActive }) {
  let selected = Array.isArray(initial) ? [...initial] : [];
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal">
      <h3>Materiales gastables</h3>

      <div class="row">
        <div>
          <label>Buscar material</label>
          <input id="matSearch" placeholder="Escribe para buscar..." />
        </div>
        <div>
          <label>Resultados</label>
          <select id="matResults" size="6"></select>
        </div>
      </div>

      <div class="flex" style="margin-top:10px;justify-content:flex-end;">
        <button class="btn-ghost" id="btnAdd">Agregar</button>
      </div>

      <div style="margin-top:12px;">
        <h3 style="margin:0 0 8px;">Seleccionados</h3>
        <div id="selList"></div>
      </div>

      <div class="flex" style="justify-content:flex-end;margin-top:14px;">
        <button class="btn-ghost" id="btnCancel">Cancelar</button>
        <button class="btn" id="btnOk">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const search = modal.querySelector("#matSearch");
  const results = modal.querySelector("#matResults");
  const selList = modal.querySelector("#selList");

  function renderSelected() {
    if (selected.length === 0) {
      selList.innerHTML = `<div class="muted">No hay materiales seleccionados.</div>`;
      return;
    }
    selList.innerHTML = selected.map((x, idx) => `
      <div class="card" style="padding:10px;margin:8px 0;">
        <div class="flex" style="justify-content:space-between;">
          <div style="font-weight:800;">${escapeHtml(x.nombre)}</div>
          <button class="btn-danger" onclick="window.__rmSel(${idx})">Quitar</button>
        </div>
        <div class="flex" style="margin-top:8px;">
          <button class="btn-ghost" onclick="window.__decSel(${idx})">-</button>
          <input style="max-width:120px;" type="number" min="0" value="${x.cantidad}" oninput="window.__setSel(${idx}, this.value)" />
          <button class="btn-ghost" onclick="window.__incSel(${idx})">+</button>
          <div class="muted">unidad(es)</div>
        </div>
      </div>
    `).join("");

    window.__rmSel = (i) => { selected.splice(i, 1); renderSelected(); };
    window.__incSel = (i) => { selected[i].cantidad = (selected[i].cantidad || 0) + 1; renderSelected(); };
    window.__decSel = (i) => {
      selected[i].cantidad = Math.max(0, (selected[i].cantidad || 0) - 1);
      if (selected[i].cantidad === 0) selected.splice(i, 1);
      renderSelected();
    };
    window.__setSel = (i, v) => {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) selected.splice(i, 1);
      else selected[i].cantidad = n;
      renderSelected();
    };
  }

  async function refreshResults(q) {
    const r = await api(`/api/materiales?q=${encodeURIComponent(q || "")}`);
    const items = (r.items || []).filter(x => (onlyActive ? x.activo === 1 : true));
    results.innerHTML = items.slice(0, 200).map(x => `<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join("");
  }

  modal.querySelector("#btnAdd").addEventListener("click", () => {
    const opt = results.options[results.selectedIndex];
    if (!opt) return;
    const id = parseInt(opt.value, 10);
    const nombre = opt.textContent;
    const existing = selected.find(s => s.material_id === id);
    if (existing) existing.cantidad += 1;
    else selected.push({ material_id: id, nombre, cantidad: 1 });
    renderSelected();
  });

  search.addEventListener("input", () => refreshResults(search.value));
  await refreshResults("");
  renderSelected();

  return await new Promise((resolve) => {
    modal.querySelector("#btnCancel").addEventListener("click", () => { modal.remove(); resolve(Array.isArray(initial) ? initial : []); });
    modal.querySelector("#btnOk").addEventListener("click", () => { modal.remove(); resolve(selected); });
  });
}

// =====================================================
// Superadmin (mínimo necesario: DB tools + users exequatur + materiales + audit + settings/logo)
// NOTA: backend ya lo soporta según tu app.py actual.
// =====================================================
async function renderSuperadmin() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Configuración</h2>
      <div class="flex">
        <button class="btn-ghost" id="tabGeneral">General</button>
        <button class="btn-ghost" id="tabUsers">Usuarios</button>
        <button class="btn-ghost" id="tabMaterials">Materiales</button>
        <button class="btn-ghost" id="tabDb">Base de Datos</button>
        <button class="btn-ghost" id="tabAudit">Auditoría</button>
      </div>
    </div>
    <div id="superBody"></div>
  `;

  document.getElementById("tabGeneral").addEventListener("click", showGeneral);
  document.getElementById("tabUsers").addEventListener("click", showUsers);
  document.getElementById("tabMaterials").addEventListener("click", showMaterials);
  document.getElementById("tabDb").addEventListener("click", showDb);
  document.getElementById("tabAudit").addEventListener("click", showAudit);

  await showGeneral();

  async function showGeneral() {
    const b = await api("/api/branding");
    const lim = await api("/api/enfermeria/pacientes").then(r => r.limit).catch(() => 20);
    document.getElementById("superBody").innerHTML = `
      <div class="card">
        <h2 style="margin-top:0;">General</h2>
        <div class="row">
          <div>
            <label>Nombre institución</label>
            <input id="org_name" value="${escapeAttr(b.org_name||"")}" />
          </div>
          <div>
            <label>Powered by</label>
            <input id="powered_by" value="${escapeAttr(b.powered_by||"")}" />
          </div>
        </div>

        <div class="row" style="margin-top:10px;">
          <div>
            <label>Logo</label>
            <input id="logo_file" type="file" accept=".png,.jpg,.jpeg,.webp,.gif" />
          </div>
          <div>
            <label>Enfermería limit</label>
            <input id="enf_limit" type="number" min="5" max="200" value="${lim}" />
          </div>
        </div>

        <div class="flex" style="justify-content:flex-end;margin-top:12px;">
          <button class="btn" id="btnSaveSettings">Guardar</button>
        </div>
        <div class="muted" id="cfgMsg" style="margin-top:8px;"></div>
      </div>
    `;

    document.getElementById("btnSaveSettings").addEventListener("click", async () => {
      const msg = document.getElementById("cfgMsg");
      msg.textContent = "";
      msg.style.color = "#6b7280";
      try {
        await api("/api/settings", {
          method: "PUT",
          body: JSON.stringify({
            updates: {
              "branding.org_name": document.getElementById("org_name").value.trim(),
              "branding.powered_by": document.getElementById("powered_by").value.trim(),
              "enfermeria.limit": parseInt(document.getElementById("enf_limit").value, 10) || 20,
            },
          }),
        });

        const lf = document.getElementById("logo_file");
        if (lf.files && lf.files[0]) {
          const fd = new FormData();
          fd.append("file", lf.files[0]);
          const res = await fetch("/api/branding/logo", { method: "POST", body: fd, credentials: "same-origin" });
          if (!res.ok) throw new Error("No se pudo subir el logo");
        }

        msg.textContent = "✓ Guardado";
        msg.style.color = "#137a3a";
        await loadBranding();
      } catch (e) {
        msg.textContent = e.message;
        msg.style.color = "#b00020";
      }
    });
  }

  async function showUsers() {
    document.getElementById("superBody").innerHTML = `
      <div class="card">
        <div class="flex" style="justify-content:space-between;align-items:flex-end;">
          <div>
            <h2 style="margin-top:0;">Usuarios</h2>
            <p class="muted">Puedes editar Exequatur.</p>
          </div>
          <div class="flex">
            <input id="userQ" placeholder="Buscar..." style="max-width:260px;" />
            <button class="btn-ghost" id="btnReloadUsers">Recargar</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table" style="min-width:1200px;">
            <thead>
              <tr>
                <th>ID</th><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Exequatur</th><th>Acción</th>
              </tr>
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
          <td>${u.active ? '<span class="badge badge-ok">Sí</span>' : '<span class="badge badge-warn">No</span>'}</td>
          <td>${escapeHtml(u.exequatur||"")}</td>
          <td>
            <button class="btn-ghost" onclick="setEx(${u.id}, '${escapeAttr(u.exequatur||"")}')">Exequatur</button>
          </td>
        </tr>
      `).join("");
    }

    window.setEx = async (uid, current) => {
      const ex = prompt("Exequatur:", current || "");
      if (ex === null) return;
      await api(`/api/superadmin/users/${uid}/set_exequatur`, { method: "POST", body: JSON.stringify({ exequatur: ex }) });
      await loadUsers();
    };
  }

  async function showMaterials() {
    document.getElementById("superBody").innerHTML = `
      <div class="card">
        <h2 style="margin-top:0;">Materiales</h2>
        <p class="muted">Administración del catálogo.</p>
      </div>
    `;
  }

  async function showDb() {
    const info = await api("/api/superadmin/db_info");
    document.getElementById("superBody").innerHTML = `
      <div class="card">
        <h2 style="margin-top:0;">Base de Datos</h2>
        <div class="row-1">
          <div><label>DB</label><input readonly value="${escapeAttr(info.db_path)}"/></div>
          <div><label>Data dir</label><input readonly value="${escapeAttr(info.data_dir)}"/></div>
          <div><label>Exports</label><input readonly value="${escapeAttr(info.exports_dir)}"/></div>
          <div><label>Backups</label><input readonly value="${escapeAttr(info.backups_dir)}"/></div>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0;">Reset DB</h2>
        <p class="muted">Escribe RESET para confirmar.</p>
        <div class="row">
          <div><input id="resetConfirm" placeholder="RESET"/></div>
          <div class="flex" style="justify-content:flex-end;align-items:flex-end;">
            <button class="btn-danger" id="btnResetDb">Reset</button>
          </div>
        </div>
        <div id="resetMsg" class="muted" style="margin-top:8px;"></div>
      </div>
    `;

    document.getElementById("btnResetDb").addEventListener("click", async () => {
      if (!confirm("¿Seguro? Esto borra la base de datos (crea backup primero).")) return;
      const msg = document.getElementById("resetMsg");
      msg.textContent = "";
      try {
        const r = await api("/api/superadmin/reset_db", { method: "POST", body: JSON.stringify({ confirm: document.getElementById("resetConfirm").value.trim() }) });
        msg.textContent = `✓ Reset OK. Backup: ${r.backup_path}`;
        msg.style.color = "#137a3a";
      } catch (e) {
        msg.textContent = e.message;
        msg.style.color = "#b00020";
      }
    });
  }

  async function showAudit() {
    const r = await api("/api/audit?limit=200");
    document.getElementById("superBody").innerHTML = `
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
}

// =====================================================
// Auto-numbering helper
// =====================================================
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