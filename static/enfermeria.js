window.__modalOpen = false;
window.renderEnfermeriaModule = renderEnfermeriaModule;
window.openEnf = openEnf;
window.openAmbulatorio = openAmbulatorio;

async function api2(path, opts = {}) {
  if (typeof api !== "function") throw new Error("api() no está disponible (app.js no cargado).");
  return await api(path, opts);
}

function escapeHtml2(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escAttr2(s) {
  return escapeHtml2(s).replaceAll("\n", " ");
}

async function renderEnfermeriaModule() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:flex-end;">
        <div>
          <h2 style="margin-top:0;">Enfermería</h2>
          <p class="muted">Últimos pacientes registrados (más reciente primero).</p>
        </div>
        <div class="flex">
          <button class="btn-ghost" id="btnEnfAmb" type="button">Ambulatorio</button>
          <button class="btn-ghost" id="btnEnfReload" type="button">Recargar</button>
        </div>
      </div>

      <div class="table-wrap" style="margin-top:10px;">
        <table class="table" style="min-width:1000px;">
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
      <div class="muted" id="enfLimitNote" style="margin-top:8px;"></div>
    </div>
  `;

  document.getElementById("btnEnfAmb").addEventListener("click", () => window.openAmbulatorio());
  document.getElementById("btnEnfReload").addEventListener("click", load);
  await load();
  // Auto-refresh: NO interrumpe si hay un modal abierto
  clearInterval(window.__enfTimer);
  window.__enfTimer = setInterval(() => {
    if (window.__modalOpen) return;
    load(true); // silent
  }, 12000);
  async function load(silent = false) {
    const tb = document.getElementById("tblEnf");
    if (!silent) tb.innerHTML = `<tr><td colspan="7" class="muted">Cargando...</td></tr>`;

    const r = await api2("/api/enfermeria/pacientes");
    const items = r.items || [];
    document.getElementById("enfLimitNote").textContent =
      r.limit ? `Mostrando últimos ${r.limit} pacientes.` : "";

    if (items.length === 0) {
      tb.innerHTML = `<tr><td colspan="7" class="muted">Sin registros.</td></tr>`;
      return;
    }

    tb.innerHTML = items.map(it => `
      <tr>
        <td class="col-fecha">${escapeHtml2(it.created_at||"")}</td>
        <td class="col-paciente"><strong>${escapeHtml2(it.paciente||"")}</strong></td>
        <td class="col-dx">${escapeHtml2(it.diagnostico||"")}</td>
        <td class="col-trat">${escapeHtml2(it.tratamiento||"")}</td>
        <td class="col-estado">${typeof badgeEstado === "function" ? badgeEstado(it.estado) : escapeHtml2(it.estado||"")}</td>
        <td class="col-enf">${escapeHtml2(it.enfermera_user||"")}</td>
        <td class="col-actions">
          <button class="btn" onclick="window.openEnf(${it.id})">Aplicar</button>
        </td>
      </tr>
    `).join("");
  }
}

// -----------------------------
// Modal: aplicar materiales
// -----------------------------
async function openEnf(pid) {
  const list = await api2("/api/enfermeria/pacientes");
  const it = (list.items || []).find(x => Number(x.id) === Number(pid));
  if (!it) return alert("Paciente no encontrado. Recarga e intenta de nuevo.");

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Aplicar material gastable</h3>
          <div class="muted" style="margin-top:6px;">
            Paciente: <b>${escapeHtml2(it.paciente||"")}</b> • ID: <b>${pid}</b> • Estado: <b>${escapeHtml2(it.estado||"")}</b>
          </div>
        </div>
        <div class="flex">
          <button class="btn-ghost" id="btnCloseModal" type="button">Cerrar</button>
        </div>
      </div>

      <div class="row" style="margin-top:12px;grid-template-columns: 1fr 220px 160px; gap:12px; align-items:end;">
        <div>
          <label>Buscar material</label>
          <input id="enfMatQ" placeholder="Ej: jeringa, gasa..." />
        </div>
        <div>
          <label>Mostrar</label>
          <select id="enfMatShow">
            <option value="all">Todos</option>
            <option value="selected">Solo seleccionados</option>
          </select>
        </div>
        <div class="flex" style="justify-content:flex-end;">
          <button class="btn-ghost" id="btnSave" type="button">Guardar</button>
          <button class="btn" id="btnApply" type="button">Aplicar</button>
        </div>
      </div>

      <div class="table-wrap" style="margin-top:12px; max-height:52vh; overflow:auto;">
        <table class="table" style="min-width:860px;">
          <thead><tr><th>Material</th><th style="width:140px;">Cantidad</th></tr></thead>
          <tbody id="enfMatTbl"></tbody>
        </table>
      </div>

      <div id="enfMsg" class="muted" style="margin-top:10px;"></div>
    </div>
  `;
   window.__modalOpen = true;
  document.body.appendChild(modal);

  const close = () => {
    window.__modalOpen = false;
    modal.remove();
  };

  modal.querySelector("#btnCloseModal").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  const msg = modal.querySelector("#enfMsg");
  const qEl = modal.querySelector("#enfMatQ");
  const showEl = modal.querySelector("#enfMatShow");
  const tbl = modal.querySelector("#enfMatTbl");

  msg.textContent = "Cargando catálogo...";
  const [cat, cur] = await Promise.all([
    api2("/api/materiales"),
    api2(`/api/enfermeria/pacientes/${pid}/materiales`),
  ]);

  const catalogo = (cat.items || []).filter(m => Number(m.activo) === 1);
  const usadosMap = new Map((cur.items || []).map(x => [String(x.material_id), String(x.cantidad)]));

  msg.textContent = "";

  const renderRows = () => {
    const q = (qEl.value || "").trim().toLowerCase();
    const mode = showEl.value;

    let rows = catalogo.slice();
    if (q) rows = rows.filter(m => (m.nombre || "").toLowerCase().includes(q));

    if (mode === "selected") {
      rows = rows.filter(m => {
        const v = (usadosMap.get(String(m.id)) || "").trim();
        return v !== "" && v !== "0";
      });
    }

    if (rows.length === 0) {
      tbl.innerHTML = `<tr><td colspan="2" class="muted">Sin materiales.</td></tr>`;
      return;
    }

    tbl.innerHTML = rows.map(m => {
      const qty = usadosMap.get(String(m.id)) || "";
      return `
        <tr>
          <td><strong>${escapeHtml2(m.nombre||"")}</strong></td>
          <td>
            <input class="enfQty" data-mid="${m.id}" type="number" min="0" step="1"
              value="${escAttr2(qty)}" placeholder="0" style="max-width:120px;" />
          </td>
        </tr>
      `;
    }).join("");
  };

  qEl.addEventListener("input", () => {
    clearTimeout(window.__enfMatT);
    window.__enfMatT = setTimeout(renderRows, 150);
  });
  showEl.addEventListener("change", renderRows);

  renderRows();

  const collectItems = () => {
    const inputs = [...modal.querySelectorAll(".enfQty")];
    return inputs.map(inp => {
      const material_id = Number(inp.dataset.mid);
      const cantidad = Number((inp.value || "0").trim() || "0");
      return { material_id, cantidad };
    });
  };

  modal.querySelector("#btnSave").addEventListener("click", async () => {
    msg.textContent = "";
    msg.style.color = "#6b7280";
    try {
      await api2(`/api/enfermeria/pacientes/${pid}/materiales`, {
        method: "POST",
        body: JSON.stringify({ items: collectItems() }),
      });

      const cur2 = await api2(`/api/enfermeria/pacientes/${pid}/materiales`);
      usadosMap.clear();
      (cur2.items || []).forEach(x => usadosMap.set(String(x.material_id), String(x.cantidad)));

      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      if (showEl.value === "selected") renderRows();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });

  modal.querySelector("#btnApply").addEventListener("click", async () => {
    msg.textContent = "";
    msg.style.color = "#6b7280";
    try {
      await api2(`/api/enfermeria/pacientes/${pid}/aplicar`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      msg.textContent = "✓ Aplicado";
      msg.style.color = "#137a3a";
      close();
      if (window.renderEnfermeriaModule) await window.renderEnfermeriaModule();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}

// -----------------------------
// Modal: registro ambulatorio
// -----------------------------
async function openAmbulatorio() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h3 style="margin:0;">Registro ambulatorio</h3>
          <div class="muted" style="margin-top:6px;">Nombre + Medicamento + Material gastable.</div>
        </div>
        <div class="flex">
          <button class="btn-ghost" id="btnCloseAmb" type="button">Cerrar</button>
        </div>
      </div>

      <div class="row" style="margin-top:12px;grid-template-columns: 1fr 1fr; gap:12px;">
        <div>
          <label>Nombre del paciente *</label>
          <input id="ambPaciente" placeholder="Nombre y apellido" />
        </div>
        <div>
          <label>Medicamento *</label>
          <input id="ambMed" placeholder="Ej: Diclofenac, Amoxicilina..." />
        </div>
      </div>

      <div class="row" style="margin-top:12px;grid-template-columns: 1fr 220px; gap:12px; align-items:end;">
        <div>
          <label>Buscar material</label>
          <input id="ambMatQ" placeholder="Ej: jeringa, gasa..." />
        </div>
        <div>
          <label>Mostrar</label>
          <select id="ambMatShow">
            <option value="all">Todos</option>
            <option value="selected">Solo seleccionados</option>
          </select>
        </div>
      </div>

      <div class="table-wrap" style="margin-top:12px; max-height:45vh; overflow:auto;">
        <table class="table" style="min-width:860px;">
          <thead><tr><th>Material</th><th style="width:140px;">Cantidad</th></tr></thead>
          <tbody id="ambMatTbl"></tbody>
        </table>
      </div>

      <div class="flex" style="justify-content:flex-end; margin-top:12px; gap:8px;">
        <button class="btn" id="btnAmbGuardar" type="button">Guardar / Aplicar</button>
      </div>

      <div id="ambMsg" class="muted" style="margin-top:10px;"></div>
    </div>
  `;
  window.__modalOpen = true;
  document.body.appendChild(modal);

  const close = () => {
    window.__modalOpen = false;
    modal.remove();
  };

  modal.querySelector("#btnCloseAmb").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  const msg = modal.querySelector("#ambMsg");
  const qEl = modal.querySelector("#ambMatQ");
  const showEl = modal.querySelector("#ambMatShow");
  const tbl = modal.querySelector("#ambMatTbl");

  msg.textContent = "Cargando catálogo...";
  const cat = await api2("/api/materiales");
  const catalogo = (cat.items || []).filter(m => Number(m.activo) === 1);

  const qtyMap = new Map(); // material_id -> string

  msg.textContent = "";

  const syncMapFromInputs = () => {
    [...modal.querySelectorAll(".ambQty")].forEach(inp => {
      qtyMap.set(String(inp.dataset.mid), String(inp.value || ""));
    });
  };

  const renderRows = () => {
    const q = (qEl.value || "").trim().toLowerCase();
    const mode = showEl.value;

    let rows = catalogo.slice();
    if (q) rows = rows.filter(m => (m.nombre || "").toLowerCase().includes(q));

    if (mode === "selected") {
      rows = rows.filter(m => {
        const v = (qtyMap.get(String(m.id)) || "").trim();
        return v !== "" && v !== "0";
      });
    }

    if (rows.length === 0) {
      tbl.innerHTML = `<tr><td colspan="2" class="muted">Sin materiales.</td></tr>`;
      return;
    }

    tbl.innerHTML = rows.map(m => {
      const qty = qtyMap.get(String(m.id)) || "";
      return `
        <tr>
          <td><strong>${escapeHtml2(m.nombre||"")}</strong></td>
          <td>
            <input class="ambQty" data-mid="${m.id}" type="number" min="0" step="1"
              value="${escAttr2(qty)}" placeholder="0" style="max-width:120px;" />
          </td>
        </tr>
      `;
    }).join("");
  };

  qEl.addEventListener("input", () => {
    clearTimeout(window.__ambT);
    window.__ambT = setTimeout(() => { syncMapFromInputs(); renderRows(); }, 150);
  });
  showEl.addEventListener("change", () => { syncMapFromInputs(); renderRows(); });

  renderRows();

  modal.querySelector("#btnAmbGuardar").addEventListener("click", async () => {
    const paciente = (modal.querySelector("#ambPaciente").value || "").trim();
    const medicamento = (modal.querySelector("#ambMed").value || "").trim();

    msg.textContent = "";
    msg.style.color = "#6b7280";

    if (!paciente || !medicamento) {
      msg.textContent = "Paciente y medicamento son requeridos.";
      msg.style.color = "#b00020";
      return;
    }

    syncMapFromInputs();

    const materiales = [];
    for (const [mid, val] of qtyMap.entries()) {
      const cantidad = Number((val || "0").trim() || "0");
      if (cantidad > 0) materiales.push({ material_id: Number(mid), cantidad });
    }

    if (materiales.length === 0) {
      msg.textContent = "Ambulatorio requiere al menos 1 material gastable (cantidad > 0).";
      msg.style.color = "#b00020";
      return;
    }

    try {
      await api2("/api/enfermeria/ambulatorio", {
        method: "POST",
        body: JSON.stringify({ paciente, medicamento, materiales }),
      });

      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
      close();

      if (window.renderEnfermeriaModule) await window.renderEnfermeriaModule();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });
}