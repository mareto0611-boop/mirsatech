window.renderFacturacionAsegurados = renderFacturacionAsegurados;
window.renderEmergenciasAsegurados = renderEmergenciasAsegurados;
window.renderAuditoriaAsegurados = renderAuditoriaAsegurados;
window.openAsegurado = openAsegurado;

// ---------------------
// helpers
// ---------------------
async function getBrandingSafe() {
  try {
    const r = await api2("/api/branding");
    return {
      org_name: r.org_name || "",
      powered_by: r.powered_by || "",
      logo_url: r.logo_url || "",
    };
  } catch (e) {
    return { org_name: "", powered_by: "", logo_url: "" };
  }
}

function renderPrintHeader(branding) {
  const org = escapeHtml(branding?.org_name || "");
  const logoUrl = (branding?.logo_url || "").trim();

  // logo_url ya viene como ruta (ej: /branding/logo)
  const logoHtml = logoUrl
    ? `<img src="${escapeAttr(logoUrl)}" style="height:56px;max-width:160px;object-fit:contain;" />`
    : ``;

  return `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:10px;">
      <div style="min-width:170px;">${logoHtml}</div>
      <div style="flex:1;">
        <div style="font-size:18px;font-weight:900;line-height:1.15;">${org}</div>
        <div style="font-size:12px;color:#555;margin-top:3px;">Historia Clínica — Sala de Emergencia</div>
      </div>
    </div>
  `;
}
function checkbox(id, label, checked) {
  return `
    <label style="display:flex;align-items:center;gap:8px;margin:4px 12px 4px 0;">
      <input type="checkbox" id="${id}" ${checked ? "checked" : ""}/>
      <span>${label}</span>
    </label>
  `;
}
function getChecked(id) { return document.getElementById(id)?.checked ? 1 : 0; }

function ribbon(title) {
  return `
    <div style="
      background:#eef2f7;
      border:1px solid var(--border);
      border-left:6px solid var(--primary);
      padding:10px 12px;
      border-radius:12px;
      margin:14px 0 10px;
      font-weight:900;
      color:var(--dark);
      text-transform:uppercase;
      letter-spacing:.5px;
      font-size:12px;
    ">
      ${title}
    </div>
  `;
}

function setIfEmpty(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if ((el.value || "").trim() === "") el.value = value;
}
function pad2(n) { return String(n).padStart(2, "0"); }
function todayISOFromPC() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function timeHHMMFromPC() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function computeAgeYears(dobISO) {
  if (!dobISO) return "";
  const d = new Date(dobISO + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < 0) age = 0;
  return String(age);
}
function validateMedicoRequiredOrThrow() {
  const missing = [];

  // Historia clínica (HEA)
  const hea = (document.getElementById("h_ea")?.value ?? "").trim();
  if (!hea) missing.push("Historia clínica (Historia de la enfermedad actual)");

  // Motivo: al menos 1 marcado o "Otro"
  const motivoIds = [
    "m_cefalea","m_tos","m_palpit","m_hemat","m_lumbar","m_diarrea","m_mareos","m_epist",
    "m_nauseas","m_torax","m_hematuria","m_arma","m_fiebre","m_disnea","m_vomitos","m_abd"
  ];
  const anyMotivo = motivoIds.some(id => document.getElementById(id)?.checked);
  const motivoOtro = (document.getElementById("m_otro")?.value ?? "").trim();
  if (!anyMotivo && !motivoOtro) missing.push("Motivo de consulta");

  // Signos vitales: al menos 1
  const vitalIds = ["sv_peso","sv_ta","sv_fc","sv_fr","sv_temp","sv_sao2","sv_gli"];
  const anyVital = vitalIds.some(id => ((document.getElementById(id)?.value ?? "").trim() !== ""));
  if (!anyVital) missing.push("Signos vitales");

  // Diagnóstico y tratamiento
  const dx1 = (document.getElementById("dx1")?.value ?? "").trim();
  if (!dx1) missing.push("Diagnóstico (DX 1)");

  const man1 = (document.getElementById("man1")?.value ?? "").trim();
  if (!man1) missing.push("Tratamiento (Manejo 1)");

  // Egreso
  const eg = (document.getElementById("egreso_tipo")?.value ?? "").trim();
  if (!eg) missing.push("Egreso (tipo)");

  if (missing.length) {
    throw new Error("Faltan campos obligatorios: " + missing.join(", "));
  }
}
function parseAntecedentesCSV(s) {
  return (String(s || ""))
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}
function serializeAntecedentes(list) {
  return (list || []).map(x => String(x).trim()).filter(Boolean).join(", ");
}

// defaults revision por sistema
const DEFAULT_NORMAL = "No se evidencia hallazgos positivos.";
function ensureDefaultNormal(ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if ((el.value || "").trim() === "") el.value = DEFAULT_NORMAL;
  });
}

// Lista ARS (RD) - editable via datalist
const ASEGURADORAS_RD = [
  "ARS Humano",
  "ARS Universal",
  "MAPFRE Salud ARS",
  "ARS Palic",
  "ARS Primera",
  "ARS Monumental",
  "ARS SEMMA",
  "ARS Renacer",
  "ARS APS",
  "ARS CMD",
  "SENASA Contributivo",
  "SENASA Subsidiado",
  "SENASA",
  "Futuro ARS",
  "Yunen ARS",
  "ARS Abel González",
  "ARS META Salud",
  "ARS La Colonial",
  "ARS Simag",
  "ARS Banco Central",
];

// ---------------------
// API helpers (usa api() de app.js global)
// ---------------------
async function api2(path, opts = {}) {
  if (typeof api !== "function") throw new Error("api() no está disponible (app.js no cargado).");
  return await api(path, opts);
}

// ---------------------
// read form (fact fields)
// ---------------------
function readFactSectionFromForm() {
  const d = {};
  d.fecha = document.getElementById("f_fecha")?.value || "";
  d.hora_llegada = document.getElementById("f_hora")?.value || "";

  d.nombre = document.getElementById("f_nombre")?.value || "";
  d.apodo = document.getElementById("f_apodo")?.value || "";
  d.sexo = document.getElementById("f_sexo")?.value || "";
  d.edad = document.getElementById("f_edad")?.value || "";
  d.fecha_nacimiento = document.getElementById("f_fn")?.value || "";
  d.cedula_pasaporte_nui = document.getElementById("f_ced")?.value || "";
  d.aseguradora = document.getElementById("f_aseg")?.value || "";
  d.nss = document.getElementById("f_nss")?.value || "";
  d.grupo_sanguineo = document.getElementById("f_grupo")?.value || "";
  d.alergico = document.getElementById("f_alergico")?.value || "";
  d.direccion = document.getElementById("f_dir")?.value || "";
  d.nacionalidad = document.getElementById("f_nac")?.value || "";
  d.telefono = document.getElementById("f_tel")?.value || "";

  d.via_llegada = document.getElementById("f_via")?.value || "";
  d.ambulancia_no = document.getElementById("f_amb")?.value || "";
  d.paramedico = document.getElementById("f_paramed")?.value || "";
  d.acompanante = document.getElementById("f_acomp")?.value || "";
  d.parentesco = document.getElementById("f_parent")?.value || "";
  d.acompanante_telefono = document.getElementById("f_acomp_tel")?.value || "";
  d.acompanante_direccion = document.getElementById("f_acomp_dir")?.value || "";

  return d;
}

// ---------------------
// read medical fields (doctor/auditor)
// ---------------------
function readMedicalSectionFromForm() {
  const d = {};

  // Motivos (multi)
  d.motivo_cefalea = getChecked("m_cefalea");
  d.motivo_tos = getChecked("m_tos");
  d.motivo_palpitaciones = getChecked("m_palpit");
  d.motivo_hematemesis = getChecked("m_hemat");
  d.motivo_dolor_lumbar = getChecked("m_lumbar");
  d.motivo_diarrea = getChecked("m_diarrea");
  d.motivo_mareos = getChecked("m_mareos");
  d.motivo_epistaxis = getChecked("m_epist");
  d.motivo_nauseas = getChecked("m_nauseas");
  d.motivo_dolor_toracico = getChecked("m_torax");
  d.motivo_hematuria = getChecked("m_hematuria");
  d.motivo_herida_arma = getChecked("m_arma");
  d.motivo_fiebre = getChecked("m_fiebre");
  d.motivo_disnea = getChecked("m_disnea");
  d.motivo_vomitos = getChecked("m_vomitos");
  d.motivo_dolor_abdominal = getChecked("m_abd");
  d.motivo_otro = document.getElementById("m_otro")?.value || "";

  d.historia_enfermedad_actual = document.getElementById("h_ea")?.value || "";

  // Antecedentes checklist + otros
  const checkedLabels = [];
  document.querySelectorAll('input[data-ant="1"]').forEach((el) => {
    if (el.checked) checkedLabels.push(el.getAttribute("data-label") || "");
  });
  d.antecedentes_1 = serializeAntecedentes(checkedLabels);
  d.antecedentes_2 = document.getElementById("ant_otros")?.value || "";
  d.antecedentes_3 = document.getElementById("ant_notas")?.value || "";

  // Signos vitales + peso
  d.peso = document.getElementById("sv_peso")?.value || "";
  d.ta = document.getElementById("sv_ta")?.value || "";
  d.fc = document.getElementById("sv_fc")?.value || "";
  d.fr = document.getElementById("sv_fr")?.value || "";
  d.temp = document.getElementById("sv_temp")?.value || "";
  d.glicemia = document.getElementById("sv_gli")?.value || "";
  d.sao2 = document.getElementById("sv_sao2")?.value || "";

  // Revisión por sistemas (DB fields)
  d.examen_cabeza = document.getElementById("ex_cabeza")?.value || "";
  d.examen_cuello = document.getElementById("ex_cuello")?.value || "";
  d.examen_pulmones = document.getElementById("ex_pulmones")?.value || "";
  d.examen_torax = document.getElementById("ex_torax")?.value || "";
  d.examen_corazon = document.getElementById("ex_corazon")?.value || "";
  d.examen_abdomen = document.getElementById("ex_abdomen")?.value || "";
  d.examen_extremidades = document.getElementById("ex_extremidades")?.value || "";
  d.examen_genitales = document.getElementById("ex_genitales")?.value || "";

  // Indicaciones: laboratorio
  d.lab_hemograma = getChecked("lab_hemograma");
  d.lab_ex_orina = getChecked("lab_orina");
  d.lab_creatinina = getChecked("lab_creatinina");
  d.lab_urea = getChecked("lab_urea");
  d.lab_glicemia = getChecked("lab_glucosa");
  d.lab_sodio = getChecked("lab_sodio");
  d.lab_potasio = getChecked("lab_potasio");
  d.lab_cloro = getChecked("lab_cloro");
  d.lab_tgo = getChecked("lab_tgo");
  d.lab_tgp = getChecked("lab_tgp");
  d.lab_gases_arteriales = getChecked("lab_gaso");
  d.lab_troponinas = getChecked("lab_trop");
  d.lab_ck = getChecked("lab_ck");
  d.lab_cpk_mb = getChecked("lab_ckmb");
  d.lab_otros = document.getElementById("lab_otros")?.value || "";

  // Indicaciones: imágenes
  d.img_rayosx = getChecked("img_rx");
  d.img_sonografia = getChecked("img_sono");
  d.img_tac = getChecked("img_tac");
  d.img_ekg = getChecked("img_ekg");
  // Resonancia magnética la guardamos en img_otras (texto) si se marca
  const rm = getChecked("img_rm");
  const otrasPrev = (document.getElementById("img_otras")?.value || "").trim();
  const rmToken = "Resonancia magnética";
  let otrasFinal = otrasPrev;
  if (rm === 1) {
    if (!otrasFinal.toLowerCase().includes(rmToken.toLowerCase())) {
      otrasFinal = (otrasFinal ? (otrasFinal + ", ") : "") + rmToken;
    }
  } else {
    // si se desmarca, intentamos removerlo suavemente
    otrasFinal = otrasFinal
      .split(",")
      .map(x => x.trim())
      .filter(x => x.toLowerCase() !== rmToken.toLowerCase() && x !== "")
      .join(", ");
  }
  d.img_otras = otrasFinal;
  d.img_indicar_parte_cuerpo = document.getElementById("img_especificaciones")?.value || "";

  // Dx/Manejo/Obs/Egreso
  d.dx_1 = document.getElementById("dx1")?.value || "";
  d.dx_2 = document.getElementById("dx2")?.value || "";
  d.dx_3 = document.getElementById("dx3")?.value || "";
  d.manejo_1 = document.getElementById("man1")?.value || "";
  d.manejo_2 = document.getElementById("man2")?.value || "";
  d.manejo_3 = document.getElementById("man3")?.value || "";
  d.observaciones = document.getElementById("obs")?.value || "";

  // Tipo de egreso (destino_*)
  const eg = document.getElementById("egreso_tipo")?.value || "";
  d.destino_alta = eg === "alta" ? 1 : 0;
  d.destino_referido_a = eg === "referido" ? (document.getElementById("egreso_referido")?.value || "") : "";
  d.destino_admitido = eg === "ingresado" ? 1 : 0;
  d.destino_fallecido = eg === "fallecido" ? 1 : 0;

  d.observaciones_destino = eg === "consulta"
    ? "Consulta"
    : (document.getElementById("egreso_obs")?.value || "");

  return d;
}

function fillFactSectionFromMaster(it) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ""; };
  set("f_nombre", it.nombre);
  set("f_apodo", it.apodo);
  set("f_sexo", it.sexo);
  set("f_edad", it.edad);
  set("f_fn", it.fecha_nacimiento);
  set("f_ced", it.cedula_pasaporte_nui);
  set("f_aseg", it.aseguradora);
  set("f_nss", it.nss);
  set("f_grupo", it.grupo_sanguineo);
  set("f_alergico", it.alergico);
  set("f_dir", it.direccion);
  set("f_nac", it.nacionalidad);
  set("f_tel", it.telefono);
}

function renderAseguradorasDatalist() {
  return `
    <datalist id="aseguradorasRD">
      ${ASEGURADORAS_RD.map(x => `<option value="${escapeHtml(x)}"></option>`).join("")}
    </datalist>
  `;
}

function enableViaLlegadaDependencies() {
  const via = document.getElementById("f_via");
  const amb = document.getElementById("f_amb");
  const param = document.getElementById("f_paramed");
  if (!via || !amb || !param) return;

  function sync() {
    const v = via.value || "";
    const show = (v === "ambulancia" || v === "9-1-1" || v === "crue");
    amb.disabled = !show;
    param.disabled = !show;
  }
  via.addEventListener("change", sync);
  sync();
}

// =====================================================
// FACTURACION UI (igual que tu versión)
// =====================================================
async function renderFacturacionAsegurados() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    ${renderAseguradorasDatalist()}
    <div class="card">
      <h2 style="margin-top:0;">Seguro Médico (Facturación)</h2>
      <p class="muted">
        Fecha/hora se autocompletan (PC) pero puedes editarlas.
        Facturación NO llena motivo de consulta.
        Puedes ver e imprimir cuando el médico complete.
      </p>

      ${ribbon("Buscar paciente (autollenar)")}
      <div class="row">
        <div>
          <label>Buscar (nombre / cédula / teléfono)</label>
          <input id="pm_q" placeholder="Escribe al menos 2 caracteres..." />
          <div class="muted">Selecciona un resultado y presiona “Usar seleccionado”.</div>
        </div>
        <div>
          <label>Resultados</label>
          <select id="pm_results" size="6"></select>
        </div>
      </div>
      <div class="flex" style="justify-content:flex-end;margin-top:10px;">
        <button class="btn-ghost" id="pm_pick">Usar seleccionado</button>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">Registro (Facturación)</h2>

      ${ribbon("Información general")}
      <div class="row">
        <div><label>Fecha</label><input type="date" id="f_fecha"/></div>
        <div><label>Hora de llegada</label><input type="time" id="f_hora"/></div>
      </div>

      ${ribbon("Datos del paciente")}
      <div class="row">
        <div><label>Nombre</label><input id="f_nombre"/></div>
        <div><label>Apodo</label><input id="f_apodo"/></div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div><label>Sexo</label><input id="f_sexo" placeholder="M/F"/></div>
        <div><label>Edad (auto por F.N., editable)</label><input id="f_edad" placeholder="Ej: 32"/></div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div><label>Fecha Nacimiento</label><input type="date" id="f_fn"/></div>
        <div><label>Cédula/Pasaporte/NUI</label><input id="f_ced"/></div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div><label>Aseguradora (lista + editable)</label><input id="f_aseg" list="aseguradorasRD" placeholder="Selecciona o escribe..." /></div>
        <div><label>NSS</label><input id="f_nss"/></div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div><label>Grupo sanguíneo</label><input id="f_grupo"/></div>
        <div><label>Alérgico(a)</label><input id="f_alergico"/></div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div><label>Dirección</label><input id="f_dir"/></div>
        <div><label>Teléfono</label><input id="f_tel"/></div>
      </div>

      <div style="margin-top:10px;"><label>Nacionalidad</label><input id="f_nac" value="DOMINICANA"/></div>

      ${ribbon("Vía de llegada")}
      <div class="row">
        <div>
          <label>Vía</label>
          <select id="f_via">
            <option value=""></option>
            <option value="medios_propios">Medios propios</option>
            <option value="9-1-1">9-1-1</option>
            <option value="crue">CRUE</option>
            <option value="privada">Privada</option>
            <option value="ambulancia">Ambulancia</option>
          </select>
        </div>
        <div><label>Ambulancia No. (si aplica)</label><input id="f_amb"/></div>
      </div>
      <div style="margin-top:10px;"><label>Paramédico (si aplica)</label><input id="f_paramed"/></div>

      <div class="row" style="margin-top:10px;">
        <div><label>Acompañante</label><input id="f_acomp"/></div>
        <div><label>Parentesco</label><input id="f_parent"/></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Teléfono (Acompañante)</label><input id="f_acomp_tel"/></div>
        <div><label>Dirección (Acompañante)</label><input id="f_acomp_dir"/></div>
      </div>

      <div class="flex" style="justify-content:flex-end;margin-top:12px;">
        <button class="btn" id="btnFactSave">Guardar y enviar al médico</button>
      </div>
      <div id="factMsg" class="muted" style="margin-top:8px;"></div>
    </div>

    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:flex-end;">
        <div>
          <h2 style="margin-top:0;">Mis registros</h2>
          <p class="muted">Pendientes y completados. Puedes abrir y luego imprimir.</p>
        </div>
        <div class="flex">
          <select id="factEstado">
            <option value="">Todos</option>
            <option value="pendiente_medico">Pendientes</option>
            <option value="completo">Completos</option>
          </select>
          <input id="factQ" placeholder="Buscar..." style="max-width:260px;" />
          <button class="btn-ghost" id="btnFactReload">Recargar</button>
        </div>
      </div>

      <div class="table-wrap" style="margin-top:10px;">
        <table class="table" style="min-width:900px;">
          <thead>
            <tr><th>Fecha</th><th>Expediente</th><th>Paciente</th><th>Estado</th><th>Acción</th></tr>
          </thead>
          <tbody id="factTbl"></tbody>
        </table>
      </div>
    </div>
  `;

  setIfEmpty("f_fecha", todayISOFromPC());
  setIfEmpty("f_hora", timeHHMMFromPC());

  let edadManual = false;
  document.getElementById("f_edad").addEventListener("input", () => { edadManual = true; });
  document.getElementById("f_fn").addEventListener("change", () => {
    const dob = document.getElementById("f_fn").value;
    if (!edadManual) document.getElementById("f_edad").value = computeAgeYears(dob);
  });

  enableViaLlegadaDependencies();

  const qEl = document.getElementById("pm_q");
  const resEl = document.getElementById("pm_results");
  qEl.addEventListener("input", async () => {
    const q = qEl.value.trim();
    if (q.length < 2) { resEl.innerHTML = ""; return; }
    const r = await api2(`/api/pacientes_master?q=${encodeURIComponent(q)}`);
    const items = r.items || [];
    resEl.innerHTML = items.map(x => `<option value="${x.id}">${escapeHtml(x.nombre)} • ${escapeHtml(x.cedula_pasaporte_nui||"")} • ${escapeHtml(x.telefono||"")}</option>`).join("");
    window.__pmItems = items;
  });

  document.getElementById("pm_pick").addEventListener("click", () => {
    const opt = resEl.options[resEl.selectedIndex];
    if (!opt) return;
    const id = parseInt(opt.value, 10);
    const it = (window.__pmItems || []).find(x => x.id === id);
    if (it) {
      fillFactSectionFromMaster(it);
      edadManual = false;
      document.getElementById("f_edad").value = computeAgeYears(document.getElementById("f_fn").value);
      enableViaLlegadaDependencies();
    }
  });

  document.getElementById("btnFactSave").addEventListener("click", async () => {
    const msg = document.getElementById("factMsg");
    msg.textContent = "";
    msg.style.color = "#6b7280";
    try {
            // Validación requerida (Facturación)
      const required = [
        ["f_nombre", "Nombre"],
        ["f_fn", "Fecha de nacimiento"],
        ["f_edad", "Edad"],
        ["f_aseg", "Aseguradora"],
        ["f_dir", "Dirección"],
        ["f_via", "Vía de llegada"],
      ];

      const missing = [];
      for (const [id, label] of required) {
        const el = document.getElementById(id);
        const val = (el?.value ?? "").trim();
        if (!val) missing.push(label);
      }

      if (missing.length) {
        msg.textContent = `Faltan campos obligatorios: ${missing.join(", ")}.`;
        msg.style.color = "#b00020";
        return;
      }
      const data = readFactSectionFromForm();
      const r = await api2("/api/asegurados", { method: "POST", body: JSON.stringify(data) });
      msg.textContent = `✓ Guardado. Expediente: ${r.expediente_clinico}`;
      msg.style.color = "#137a3a";
      await loadFactList();
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });

  document.getElementById("btnFactReload").addEventListener("click", loadFactList);
  document.getElementById("factQ").addEventListener("input", () => {
    clearTimeout(window.__factT);
    window.__factT = setTimeout(loadFactList, 250);
  });
  document.getElementById("factEstado").addEventListener("change", loadFactList);

  await loadFactList();

  async function loadFactList() {
    const q = document.getElementById("factQ").value.trim();
    const estado = document.getElementById("factEstado").value;

    const url = new URL("/api/asegurados", window.location.origin);
    if (q) url.searchParams.set("q", q);
    if (estado) url.searchParams.set("estado", estado);

    const r = await api2(url.pathname + url.search);
    const items = r.items || [];
    const tb = document.getElementById("factTbl");
    if (items.length === 0) {
      tb.innerHTML = `<tr><td colspan="5" class="muted">Sin registros.</td></tr>`;
      return;
    }
    tb.innerHTML = items.map(it => `
      <tr>
        <td class="col-fecha">${escapeHtml(it.created_at||"")}</td>
        <td><strong>${escapeHtml(it.expediente_clinico||"")}</strong></td>
        <td class="col-paciente">${escapeHtml(it.nombre||"")}</td>
        <td>${escapeHtml(it.estado||"")}</td>
        <td><button class="btn-ghost" onclick="openAsegurado(${it.id}, 'facturacion')">Abrir</button></td>
      </tr>
    `).join("");
  }
}

// ---------------------
// EMERGENCIAS LIST (igual tu versión)
// ---------------------
async function renderEmergenciasAsegurados() {
  const sub = document.getElementById("emergSubPanel") || document.getElementById("module-content");
  sub.innerHTML = `
    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:flex-end;">
        <div>
          <h2 style="margin-top:0;">Paciente Asegurado</h2>
          <p class="muted">Pendientes digitados por facturación.</p>
        </div>
        <div class="flex">
          <select id="asegEstado">
            <option value="pendiente_medico">Pendientes</option>
            <option value="completo">Completos</option>
            <option value="">Todos</option>
          </select>
          <input id="asegQ" placeholder="Buscar..." style="max-width:260px;" />
          <button class="btn-ghost" id="btnAsegReload">Recargar</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table" style="min-width:1000px;">
          <thead>
            <tr><th>Fecha</th><th>Expediente</th><th>Paciente</th><th>Digitado por</th><th>Estado</th><th>Acción</th></tr>
          </thead>
          <tbody id="asegTbl"></tbody>
        </table>
      </div>
    </div>

    <div id="asegEditor"></div>
  `;

  document.getElementById("btnAsegReload").addEventListener("click", loadList);
  document.getElementById("asegQ").addEventListener("input", () => {
    clearTimeout(window.__asegT);
    window.__asegT = setTimeout(loadList, 250);
  });
  document.getElementById("asegEstado").addEventListener("change", loadList);

  await loadList();

  async function loadList() {
    const q = document.getElementById("asegQ").value.trim();
    const estado = document.getElementById("asegEstado").value;
    const url = new URL("/api/asegurados", window.location.origin);
    if (q) url.searchParams.set("q", q);
    if (estado !== "") url.searchParams.set("estado", estado);
    const r = await api2(url.pathname + url.search);
    const items = r.items || [];
    const tb = document.getElementById("asegTbl");
    if (items.length === 0) {
      tb.innerHTML = `<tr><td colspan="6" class="muted">Sin registros.</td></tr>`;
      return;
    }
    tb.innerHTML = items.map(it => `
      <tr>
        <td class="col-fecha">${escapeHtml(it.created_at||"")}</td>
        <td><strong>${escapeHtml(it.expediente_clinico||"")}</strong></td>
        <td class="col-paciente">${escapeHtml(it.nombre||"")}</td>
        <td>${escapeHtml(it.fact_user||"")}</td>
        <td>${escapeHtml(it.estado||"")}</td>
        <td><button class="btn" onclick="openAsegurado(${it.id}, 'emergencias')">Abrir</button></td>
      </tr>
    `).join("");
  }
}

// ---------------------
// AUDITOR LIST (igual tu versión)
// ---------------------
async function renderAuditoriaAsegurados() {
  const content = document.getElementById("module-content");
  content.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Auditoría Médica — Pacientes Asegurados</h2>
      <p class="muted">Filtra por fecha y corrige errores.</p>

      <div class="flex" style="justify-content:space-between;align-items:flex-end;">
        <div class="flex">
          <div>
            <div class="muted" style="font-size:12px;">Desde</div>
            <input type="date" id="audDesde" />
          </div>
          <div>
            <div class="muted" style="font-size:12px;">Hasta</div>
            <input type="date" id="audHasta" />
          </div>
          <button class="btn-ghost" id="btnAudReload">Filtrar</button>
        </div>
        <div class="flex">
          <input id="audQ" placeholder="Buscar..." style="max-width:260px;" />
        </div>
      </div>

      <div class="table-wrap" style="margin-top:10px;">
        <table class="table" style="min-width:1000px;">
          <thead>
            <tr><th>Fecha</th><th>Expediente</th><th>Paciente</th><th>Facturación</th><th>Médico</th><th>Estado</th><th>Acción</th></tr>
          </thead>
          <tbody id="audTbl"></tbody>
        </table>
      </div>
    </div>

    <div id="audEditor"></div>
  `;

  document.getElementById("btnAudReload").addEventListener("click", loadAud);
  document.getElementById("audQ").addEventListener("input", () => {
    clearTimeout(window.__audT);
    window.__audT = setTimeout(loadAud, 250);
  });

  await loadAud();

  async function loadAud() {
    const desde = document.getElementById("audDesde").value;
    const hasta = document.getElementById("audHasta").value;
    const q = document.getElementById("audQ").value.trim();

    const url = new URL("/api/asegurados", window.location.origin);
    if (desde) url.searchParams.set("desde", desde);
    if (hasta) url.searchParams.set("hasta", hasta);
    if (q) url.searchParams.set("q", q);
    url.searchParams.set("estado", "");

    const r = await api2(url.pathname + url.search);
    const items = r.items || [];
    const tb = document.getElementById("audTbl");
    if (items.length === 0) {
      tb.innerHTML = `<tr><td colspan="7" class="muted">Sin registros.</td></tr>`;
      return;
    }
    tb.innerHTML = items.map(it => `
      <tr>
        <td class="col-fecha">${escapeHtml(it.created_at||"")}</td>
        <td><strong>${escapeHtml(it.expediente_clinico||"")}</strong></td>
        <td class="col-paciente">${escapeHtml(it.nombre||"")}</td>
        <td>${escapeHtml(it.fact_user||"")}</td>
        <td>${escapeHtml(it.medico_user||"")}</td>
        <td>${escapeHtml(it.estado||"")}</td>
        <td><button class="btn-ghost" onclick="openAsegurado(${it.id}, 'auditor')">Abrir</button></td>
      </tr>
    `).join("");
  }
}

// ---------------------
// OPEN / EDIT / PRINT
// ---------------------
async function openAsegurado(id, roleContext) {
  const target =
    roleContext === "auditor" ? document.getElementById("audEditor")
    : roleContext === "facturacion" ? document.getElementById("module-content")
    : document.getElementById("asegEditor");

  const r = await api2(`/api/asegurados/${id}`);
  const it = r.item;
  const doctor = r.doctor || null;

  const canEditAll = (roleContext === "emergencias" || roleContext === "auditor");
  const canEditFact = (roleContext === "facturacion") || canEditAll;

  target.innerHTML = `
    ${renderAseguradorasDatalist()}
    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:flex-end;">
        <div>
          <h2 style="margin-top:0;">Historia Clínica (Asegurado)</h2>
          <div class="muted">
            Expediente: <b>${escapeHtml(it.expediente_clinico||"")}</b> • Estado: <b>${escapeHtml(it.estado||"")}</b>
          </div>
        </div>
        <div class="flex">
          <button class="btn-ghost" id="btnPrintTop">Imprimir</button>
          ${roleContext === "emergencias" ? `<button class="btn" id="btnCerrar">Cerrar y guardar</button>` : ``}
        </div>
      </div>

      <div id="asegForm"></div>
      <div id="asegMsg" class="muted" style="margin-top:8px;"></div>
    </div>
  `;

  document.getElementById("asegForm").innerHTML = renderFullForm(it, doctor, { canEditAll, canEditFact, roleContext });
    // ---------------------
  // DX / Manejo: mostrar siguiente línea al escribir o Enter
  // ---------------------
  setupAutoLines("dx1", "dx2_wrap", "dx2");
  setupAutoLines("dx2", "dx3_wrap", "dx3");
  setupAutoLines("man1", "man2_wrap", "man2");
  setupAutoLines("man2", "man3_wrap", "man3");

  // Si ya hay valores guardados, mostrar los campos ocultos
  if ((document.getElementById("dx2")?.value || "").trim()) document.getElementById("dx2_wrap").style.display = "";
  if ((document.getElementById("dx3")?.value || "").trim()) document.getElementById("dx3_wrap").style.display = "";
  if ((document.getElementById("man2")?.value || "").trim()) document.getElementById("man2_wrap").style.display = "";
  if ((document.getElementById("man3")?.value || "").trim()) document.getElementById("man3_wrap").style.display = "";

  function setupAutoLines(fromId, wrapId, nextId) {
    const from = document.getElementById(fromId);
    const wrap = document.getElementById(wrapId);
    const next = document.getElementById(nextId);
    if (!from || !wrap || !next) return;

    const showNext = () => {
      if ((from.value || "").trim() !== "") wrap.style.display = "";
    };

    from.addEventListener("input", showNext);
    from.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        showNext();
        if ((from.value || "").trim() !== "") next.focus();
      }
    });

    showNext();
  }
  attachPatientMasterSearch();
  enableViaLlegadaDependencies();
    // Imprimir (arriba/abajo)
  const btnPT = document.getElementById("btnPrintTop");
  if (btnPT) btnPT.addEventListener("click", async () => { await printAsegurado(it, doctor); });

  const btnPB = document.getElementById("btnPrintBottom");
  if (btnPB) btnPB.addEventListener("click", async () => { await printAsegurado(it, doctor); });  

  setIfEmpty("f_fecha", todayISOFromPC());
  setIfEmpty("f_hora", timeHHMMFromPC());

  // Default normal por sistema
  ensureDefaultNormal([
    "ex_cabeza",
    "ex_cuello",
    "ex_pulmones",
    "ex_torax",
    "ex_corazon",
    "ex_abdomen",
    "ex_extremidades",
    "ex_genitales",
  ]);

  // edad auto (editable)
  let edadManual = false;
  const edadEl = document.getElementById("f_edad");
  if (edadEl) edadEl.addEventListener("input", () => { edadManual = true; });
  const fnEl = document.getElementById("f_fn");
  if (fnEl) fnEl.addEventListener("change", () => {
    if (!edadManual) document.getElementById("f_edad").value = computeAgeYears(document.getElementById("f_fn").value);
  });

  document.getElementById("btnSaveAseg").addEventListener("click", async () => {
    const msg = document.getElementById("asegMsg");
    msg.textContent = "";
    try {
          if (roleContext === "emergencias" || roleContext === "auditor") {
      validateMedicoRequiredOrThrow();
    }
      await saveAsegurado(id);
      msg.textContent = "✓ Guardado";
      msg.style.color = "#137a3a";
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = "#b00020";
    }
  });

  if (roleContext === "emergencias") {
    document.getElementById("btnCerrar").addEventListener("click", async () => {
      const msg = document.getElementById("asegMsg");
      msg.textContent = "";
      try {
            validateMedicoRequiredOrThrow();
        await saveAsegurado(id);
        await api2(`/api/asegurados/${id}/cerrar`, { method: "POST", body: JSON.stringify({}) });
        msg.textContent = "✓ Cerrado y guardado (actualiza para ver firma final).";
        msg.style.color = "#137a3a";
      } catch (e) {
        msg.textContent = e.message;
        msg.style.color = "#b00020";
      }
    });
  }

  if (!canEditAll) document.getElementById("triage").disabled = true;

  if (roleContext === "facturacion") {
    ["medicalBlock","medicalBlock2","systemsBlock","indicacionesBlock","medicalBlock3","medicalBlock4"].forEach(id => {
      const blk = document.getElementById(id);
      if (blk) blk.querySelectorAll("input,textarea,select").forEach(el => el.setAttribute("disabled", "disabled"));
    });
  }

  // Pre-check antecedentes
  const antSelected = new Set(parseAntecedentesCSV(it.antecedentes_1));
  document.querySelectorAll('input[data-ant="1"]').forEach((el) => {
    const label = el.getAttribute("data-label") || "";
    el.checked = antSelected.has(label);
  });

  function attachPatientMasterSearch() {
    const qEl = document.getElementById("pm_q2");
    const resEl = document.getElementById("pm_results2");
    if (!qEl || !resEl) return;

    qEl.addEventListener("input", async () => {
      const q = qEl.value.trim();
      if (q.length < 2) { resEl.innerHTML = ""; return; }
      const r2 = await api2(`/api/pacientes_master?q=${encodeURIComponent(q)}`);
      const items = r2.items || [];
      resEl.innerHTML = items.map(x => `<option value="${x.id}">${escapeHtml(x.nombre)} • ${escapeHtml(x.cedula_pasaporte_nui||"")} • ${escapeHtml(x.telefono||"")}</option>`).join("");
      window.__pmItems2 = items;
    });

    document.getElementById("pm_pick2").addEventListener("click", () => {
      const opt = resEl.options[resEl.selectedIndex];
      if (!opt) return;
      const id2 = parseInt(opt.value, 10);
      const it2 = (window.__pmItems2 || []).find(x => x.id === id2);
      if (it2) {
        fillFactSectionFromMaster(it2);
        edadManual = false;
        document.getElementById("f_edad").value = computeAgeYears(document.getElementById("f_fn").value);
        enableViaLlegadaDependencies();
      }
    });
  }
}

function renderFullForm(it, doctor, { canEditAll, canEditFact }) {
  const ro = (enabled) => enabled ? "" : "readonly";
  const dis = (enabled) => enabled ? "" : "disabled";

  let eg = "";
  if (Number(it.destino_fallecido || 0) === 1) eg = "fallecido";
  else if (Number(it.destino_admitido || 0) === 1) eg = "ingresado";
  else if ((it.destino_referido_a || "").trim() !== "") eg = "referido";
  else if (Number(it.destino_alta || 0) === 1) eg = "alta";
  else if ((it.observaciones_destino || "").trim() === "Consulta") eg = "consulta";

  const displayDoctorName = (it.medico_tratante || doctor?.name || "");
  const displayDoctorEx = (it.medico_exequatur || doctor?.exequatur || "");

  const antecedentesChecklist = [
    "Asma bronquial",
    "Hipertensión arterial",
    "Diabetes mellitus",
    "Cardiopatía",
    "Cáncer",
    "ERC (Enfermedad renal crónica)",
    "EPOC",
    "Alergias medicamentosas",
    "Epilepsia",
    "TIROIDES",
    "Embarazo",
    "Quirúrgicos",
  ];

  return `
    <div class="card">
      <h3 style="margin-top:0;">Autollenado</h3>
      <div class="row">
        <div>
          <label>Buscar (nombre / cédula / teléfono)</label>
          <input id="pm_q2" placeholder="Escribe al menos 2 caracteres..." />
        </div>
        <div>
          <label>Resultados</label>
          <select id="pm_results2" size="5"></select>
        </div>
      </div>
      <div class="flex" style="justify-content:flex-end;margin-top:8px;">
        <button class="btn-ghost" id="pm_pick2">Usar seleccionado</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Información General</h3>
      <div class="row">
        <div><label>Expediente</label><input value="${escapeAttr(it.expediente_clinico||"")}" readonly /></div>
        <div><label>Fecha</label><input type="date" id="f_fecha" value="${escapeAttr(it.fecha||"")}" ${ro(canEditFact)} /></div>
      </div>
      <div style="margin-top:10px;">
        <label>Hora de llegada</label>
        <input type="time" id="f_hora" value="${escapeAttr(it.hora_llegada||"")}" ${ro(canEditFact)} />
      </div>
      <div style="margin-top:10px;">
        <label>Prioridad del Triaje (solo médico)</label>
        <select id="triage">
          <option value=""></option>
          <option value="I" ${it.triaje_prioridad==="I"?"selected":""}>I</option>
          <option value="II" ${it.triaje_prioridad==="II"?"selected":""}>II</option>
          <option value="III" ${it.triaje_prioridad==="III"?"selected":""}>III</option>
          <option value="IV" ${it.triaje_prioridad==="IV"?"selected":""}>IV</option>
          <option value="V" ${it.triaje_prioridad==="V"?"selected":""}>V</option>
        </select>
      </div>
    </div>

    ${ribbon("Datos del paciente")}
    <div class="card">
      <div class="row">
        <div><label>Nombre</label><input id="f_nombre" value="${escapeAttr(it.nombre||"")}" ${ro(canEditFact)} /></div>
        <div><label>Apodo</label><input id="f_apodo" value="${escapeAttr(it.apodo||"")}" ${ro(canEditFact)} /></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Sexo</label><input id="f_sexo" value="${escapeAttr(it.sexo||"")}" ${ro(canEditFact)} /></div>
        <div><label>Edad</label><input id="f_edad" value="${escapeAttr(it.edad||"")}" ${ro(canEditFact)} /></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Fecha Nac.</label><input type="date" id="f_fn" value="${escapeAttr(it.fecha_nacimiento||"")}" ${ro(canEditFact)} /></div>
        <div><label>Cédula/Pasaporte/NUI</label><input id="f_ced" value="${escapeAttr(it.cedula_pasaporte_nui||"")}" ${ro(canEditFact)} /></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Aseguradora</label><input id="f_aseg" list="aseguradorasRD" value="${escapeAttr(it.aseguradora||"")}" ${ro(canEditFact)} /></div>
        <div><label>NSS</label><input id="f_nss" value="${escapeAttr(it.nss||"")}" ${ro(canEditFact)} /></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Grupo sanguíneo</label><input id="f_grupo" value="${escapeAttr(it.grupo_sanguineo||"")}" ${ro(canEditFact)} /></div>
        <div><label>Alérgico(a)</label><input id="f_alergico" value="${escapeAttr(it.alergico||"")}" ${ro(canEditFact)} /></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Dirección</label><input id="f_dir" value="${escapeAttr(it.direccion||"")}" ${ro(canEditFact)} /></div>
        <div><label>Teléfono</label><input id="f_tel" value="${escapeAttr(it.telefono||"")}" ${ro(canEditFact)} /></div>
      </div>
      <div style="margin-top:10px;"><label>Nacionalidad</label><input id="f_nac" value="${escapeAttr(it.nacionalidad||"")}" ${ro(canEditFact)} /></div>
    </div>

    ${ribbon("Motivo / Historia / Antecedentes")}
    <div class="card" id="medicalBlock">
      <h3 style="margin-top:0;">Motivo de la consulta (múltiple)</h3>
      <div class="flex" style="align-items:flex-start;">
        <div style="display:flex;flex-wrap:wrap;">
          ${checkbox("m_cefalea","Cefalea", Number(it.motivo_cefalea||0))}
          ${checkbox("m_tos","Tos", Number(it.motivo_tos||0))}
          ${checkbox("m_palpit","Palpitaciones", Number(it.motivo_palpitaciones||0))}
          ${checkbox("m_hemat","Hematemesis", Number(it.motivo_hematemesis||0))}
          ${checkbox("m_lumbar","Dolor lumbar", Number(it.motivo_dolor_lumbar||0))}
          ${checkbox("m_diarrea","Diarrea", Number(it.motivo_diarrea||0))}
          ${checkbox("m_mareos","Mareos", Number(it.motivo_mareos||0))}
          ${checkbox("m_epist","Epistaxis", Number(it.motivo_epistaxis||0))}
          ${checkbox("m_nauseas","Náuseas", Number(it.motivo_nauseas||0))}
          ${checkbox("m_torax","Dolor torácico", Number(it.motivo_dolor_toracico||0))}
          ${checkbox("m_hematuria","Hematuria", Number(it.motivo_hematuria||0))}
          ${checkbox("m_arma","Herida arma blanca/fuego", Number(it.motivo_herida_arma||0))}
          ${checkbox("m_fiebre","Fiebre", Number(it.motivo_fiebre||0))}
          ${checkbox("m_disnea","Disnea", Number(it.motivo_disnea||0))}
          ${checkbox("m_vomitos","Vómitos", Number(it.motivo_vomitos||0))}
          ${checkbox("m_abd","Dolor abdominal", Number(it.motivo_dolor_abdominal||0))}
        </div>
      </div>
      <div style="margin-top:10px;">
        <label>Otro</label>
        <input id="m_otro" value="${escapeAttr(it.motivo_otro||"")}" />
      </div>

      <div style="margin-top:12px;">
        <label>Historia de la enfermedad actual</label>
        <textarea id="h_ea">${escapeHtml(it.historia_enfermedad_actual||"")}</textarea>
      </div>

      <div style="margin-top:12px;">
        <label>Antecedentes (checklist) + Otros</label>
        <div class="flex" style="align-items:flex-start;">
          <div style="display:flex;flex-wrap:wrap;">
            ${antecedentesChecklist.map((label, idx) => `
              <label style="display:flex;align-items:center;gap:8px;margin:4px 12px 4px 0;">
                <input type="checkbox" data-ant="1" data-label="${escapeAttr(label)}" id="ant_ck_${idx}" />
                <span>${escapeHtml(label)}</span>
              </label>
            `).join("")}
          </div>
        </div>
        <div class="row" style="margin-top:10px;">
          <div><label>Otros antecedentes (editable)</label><input id="ant_otros" value="${escapeAttr(it.antecedentes_2||"")}" /></div>
          <div><label>Notas</label><input id="ant_notas" value="${escapeAttr(it.antecedentes_3||"")}" /></div>
        </div>
      </div>
    </div>

    ${ribbon("Evaluación física")}
    <div class="card" id="medicalBlock2">
      <h3 style="margin-top:0;">Signos vitales</h3>
      <div class="row">
        <div><label>Peso</label><input id="sv_peso" value="${escapeAttr(it.peso||"")}" placeholder="kg" /></div>
        <div><label>TA</label><input id="sv_ta" value="${escapeAttr(it.ta||"")}" /></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>FC</label><input id="sv_fc" value="${escapeAttr(it.fc||"")}" /></div>
        <div><label>FR</label><input id="sv_fr" value="${escapeAttr(it.fr||"")}" /></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Temp</label><input id="sv_temp" value="${escapeAttr(it.temp||"")}" /></div>
        <div><label>SaO2</label><input id="sv_sao2" value="${escapeAttr(it.sao2||"")}" /></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Glicemia</label><input id="sv_gli" value="${escapeAttr(it.glicemia||"")}" /></div>
        <div><label></label><input disabled value="" /></div>
      </div>
    </div>

    ${ribbon("Revisión por sistemas")}
    <div class="card" id="systemsBlock">
      <p class="muted">Por defecto: “${DEFAULT_NORMAL}”. Sobrescribe donde aplique.</p>
      <div class="row">
        <div><label>Cabeza</label><textarea id="ex_cabeza">${escapeHtml(it.examen_cabeza||"")}</textarea></div>
        <div><label>Cuello</label><textarea id="ex_cuello">${escapeHtml(it.examen_cuello||"")}</textarea></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Pulmones</label><textarea id="ex_pulmones">${escapeHtml(it.examen_pulmones||"")}</textarea></div>
        <div><label>Tórax</label><textarea id="ex_torax">${escapeHtml(it.examen_torax||"")}</textarea></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Corazón</label><textarea id="ex_corazon">${escapeHtml(it.examen_corazon||"")}</textarea></div>
        <div><label>Abdomen</label><textarea id="ex_abdomen">${escapeHtml(it.examen_abdomen||"")}</textarea></div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div><label>Extremidades</label><textarea id="ex_extremidades">${escapeHtml(it.examen_extremidades||"")}</textarea></div>
        <div><label>Genitales</label><textarea id="ex_genitales">${escapeHtml(it.examen_genitales||"")}</textarea></div>
      </div>
    </div>

    ${ribbon("Indicaciones (Laboratorio / Imágenes)")}
    <div class="card" id="indicacionesBlock">
      <h3 style="margin-top:0;">Laboratorio</h3>
      <div class="flex" style="align-items:flex-start;">
        <div style="display:flex;flex-wrap:wrap;">
          ${checkbox("lab_hemograma","Hemograma", Number(it.lab_hemograma||0))}
          ${checkbox("lab_orina","Orina", Number(it.lab_ex_orina||0))}
          ${checkbox("lab_creatinina","Creatinina", Number(it.lab_creatinina||0))}
          ${checkbox("lab_urea","Urea", Number(it.lab_urea||0))}
          ${checkbox("lab_glucosa","Glucosa", Number(it.lab_glicemia||0))}
          ${checkbox("lab_sodio","Electrolitos: Sodio", Number(it.lab_sodio||0))}
          ${checkbox("lab_potasio","Electrolitos: Potasio", Number(it.lab_potasio||0))}
          ${checkbox("lab_cloro","Electrolitos: Cloro", Number(it.lab_cloro||0))}
          ${checkbox("lab_tgo","TGO", Number(it.lab_tgo||0))}
          ${checkbox("lab_tgp","TGP", Number(it.lab_tgp||0))}
          ${checkbox("lab_gaso","Gasometría", Number(it.lab_gases_arteriales||0))}
          ${checkbox("lab_trop","Troponina", Number(it.lab_troponinas||0))}
          ${checkbox("lab_ck","CK", Number(it.lab_ck||0))}
          ${checkbox("lab_ckmb","CK-MB", Number(it.lab_cpk_mb||0))}
        </div>
      </div>
      <div style="margin-top:10px;">
        <label>Otros (Laboratorio)</label>
        <input id="lab_otros" value="${escapeAttr(it.lab_otros||"")}" placeholder="Ej: Grupo y RH, Prueba embarazo, etc." />
        <div class="muted">Nota: “Grupo y RH” y “Prueba embarazo” se escriben aquí (según tu lista).</div>
      </div>

      <h3 style="margin:16px 0 8px;">Imágenes</h3>
      <div class="flex" style="align-items:flex-start;">
        <div style="display:flex;flex-wrap:wrap;">
          ${checkbox("img_rm","Resonancia Magnética", (String(it.img_otras||"").toLowerCase().includes("resonancia magnética") ? 1 : 0))}
          ${checkbox("img_tac","Tomografía", Number(it.img_tac||0))}
          ${checkbox("img_sono","Sonografía", Number(it.img_sonografia||0))}
          ${checkbox("img_rx","Radiografía", Number(it.img_rayosx||0))}
          ${checkbox("img_ekg","EKG", Number(it.img_ekg||0))}
        </div>
      </div>
      <div style="margin-top:10px;">
        <label>Otros (Imágenes)</label>
        <input id="img_otras" value="${escapeAttr(it.img_otras||"")}" placeholder="Ej: RMN, etc." />
      </div>
      <div style="margin-top:10px;">
        <label>Especificaciones (parte del cuerpo)</label>
        <input id="img_especificaciones" value="${escapeAttr(it.img_indicar_parte_cuerpo||"")}" placeholder="Ej: Tórax, Abdomen, Cráneo..." />
      </div>
    </div>
${ribbon("Diagnóstico y manejo")}
<div class="card" id="medicalBlock3">
  <div class="row">
    <div>
      <label>DX 1</label>
      <input id="dx1" value="${escapeAttr(it.dx_1||"")}" />
    </div>

    <div id="dx2_wrap" style="display:none;">
      <label>DX 2</label>
      <input id="dx2" value="${escapeAttr(it.dx_2||"")}" />
    </div>
  </div>

  <div id="dx3_wrap" style="margin-top:10px;display:none;">
    <label>DX 3</label>
    <input id="dx3" value="${escapeAttr(it.dx_3||"")}" />
  </div>

  <div class="row" style="margin-top:10px;">
    <div>
      <label>Tratamiento / Manejo 1</label>
      <input id="man1" value="${escapeAttr(it.manejo_1||"")}" />
    </div>

    <div id="man2_wrap" style="display:none;">
      <label>Tratamiento / Manejo 2</label>
      <input id="man2" value="${escapeAttr(it.manejo_2||"")}" />
    </div>
  </div>

  <div id="man3_wrap" style="margin-top:10px;display:none;">
    <label>Tratamiento / Manejo 3</label>
    <input id="man3" value="${escapeAttr(it.manejo_3||"")}" />
  </div>

  <div style="margin-top:10px;">
    <label>Observaciones</label>
    <textarea id="obs">${escapeHtml(it.observaciones||"")}</textarea>
  </div>
</div>

    ${ribbon("Egreso")}
    <div class="card" id="medicalBlock4">
      <div class="row">
        <div>
          <label>Tipo de egreso</label>
          <select id="egreso_tipo">
            <option value="" ${eg===""?"selected":""}></option>
            <option value="alta" ${eg==="alta"?"selected":""}>Alta</option>
            <option value="referido" ${eg==="referido"?"selected":""}>Referido</option>
            <option value="consulta" ${eg==="consulta"?"selected":""}>Consulta</option>
            <option value="ingresado" ${eg==="ingresado"?"selected":""}>Ingresado</option>
            <option value="fallecido" ${eg==="fallecido"?"selected":""}>Fallecido</option>
          </select>
        </div>
        <div><label>Referido a (si aplica)</label><input id="egreso_referido" value="${escapeAttr(it.destino_referido_a||"")}" /></div>
      </div>
      <div style="margin-top:10px;">
        <label>Observaciones egreso</label>
        <textarea id="egreso_obs">${escapeHtml(it.observaciones_destino||"")}</textarea>
      </div>
    </div>

    ${ribbon("Firma")}
    <div class="card">
      <div class="row">
        <div><label>Médico tratante (auto)</label><input value="${escapeAttr(displayDoctorName)}" readonly /></div>
        <div><label>Exequatur (auto)</label><input value="${escapeAttr(displayDoctorEx)}" readonly /></div>
      </div>

      <div class="row" style="margin-top:12px;">
        <div><label>Firma del médico</label><div style="border:1px solid var(--border);border-radius:12px;height:70px;background:#fff;"></div></div>
        <div>
          <label>Nombre del paciente</label>
          <div style="border:1px solid var(--border);border-radius:12px;height:70px;display:flex;align-items:center;padding:0 12px;font-weight:900;color:var(--dark);">
            ${escapeHtml(it.nombre||"")}
          </div>
        </div>
      </div>

      <div class="flex" style="justify-content:flex-end;margin-top:12px;">
        <button class="btn-ghost" id="btnPrintBottom">Imprimir</button>
        <button class="btn" id="btnSaveAseg">Guardar cambios</button>
      </div>
    </div>
  `;
}

async function saveAsegurado(id) {
  const data = {};
  Object.assign(data, readFactSectionFromForm());
  const tri = document.getElementById("triage");
  if (tri) data.triaje_prioridad = tri.value || "";
  Object.assign(data, readMedicalSectionFromForm());
  await api2(`/api/asegurados/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
function pageBreakCSS() {
  // Ya no forzamos 2 páginas. Dejamos que el navegador haga el salto cuando se pase.
  return `
    <style>
      @page { margin: 12mm; }
      body {
        font-family: Arial, sans-serif;
        font-size: 12.5px;
        line-height: 1.45;
        color:#111;
              .compact .rowline { margin: 1px 0; }
      .compact .grid2 { gap: 4px 10px; }
      .compact .grid3 { gap: 4px 10px; }
      .compact h3 { margin-bottom: 6px; }
      }
      h2 { margin: 0 0 6px; }
      .muted { color: #555; }
      .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
      .grid3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px 16px; }
      .sec { border: 1px solid #111; padding: 10px 12px; margin: 10px 0; }
      .sec h3 { margin: 0 0 8px 0; font-size: 13.5px; }
      .rowline { margin: 3px 0; }
      .line { border-bottom:1px solid #111; height:24px; margin-top:12px; }
      .pre { white-space:pre-wrap; }
      .pill { display:inline-block; border:1px solid #111; border-radius:999px; padding:2px 8px; margin:2px 6px 2px 0; }
    </style>
  `;
}
function v(id, fallback) {
  const el = document.getElementById(id);
  const val = el ? (el.value ?? "").trim() : "";
  return val !== "" ? val : (fallback ?? "");
}
function _v(id, fallback) {
  const el = document.getElementById(id);
  const val = el ? (el.value ?? "").trim() : "";
  return val !== "" ? val : (fallback ?? "");
}
function _checkedOrSaved(id, savedVal) {
  const el = document.getElementById(id);
  if (!el) return Number(savedVal || 0) === 1;
  return !!el.checked;
}
function _buildMotivo(it) {
  const motivos = [
    ["m_cefalea", "Cefalea", it.motivo_cefalea],
    ["m_tos", "Tos", it.motivo_tos],
    ["m_palpit", "Palpitaciones", it.motivo_palpitaciones],
    ["m_hemat", "Hematemesis", it.motivo_hematemesis],
    ["m_lumbar", "Dolor lumbar", it.motivo_dolor_lumbar],
    ["m_diarrea", "Diarrea", it.motivo_diarrea],
    ["m_mareos", "Mareos", it.motivo_mareos],
    ["m_epist", "Epistaxis", it.motivo_epistaxis],
    ["m_nauseas", "Náuseas", it.motivo_nauseas],
    ["m_torax", "Dolor torácico", it.motivo_dolor_toracico],
    ["m_hematuria", "Hematuria", it.motivo_hematuria],
    ["m_arma", "Herida arma blanca/fuego", it.motivo_herida_arma],
    ["m_fiebre", "Fiebre", it.motivo_fiebre],
    ["m_disnea", "Disnea", it.motivo_disnea],
    ["m_vomitos", "Vómitos", it.motivo_vomitos],
    ["m_abd", "Dolor abdominal", it.motivo_dolor_abdominal],
  ];

  const selected = motivos
    .filter(([id, _label, saved]) => _checkedOrSaved(id, saved))
    .map(([_id, label]) => label);

  const otro = (document.getElementById("m_otro")?.value ?? it.motivo_otro ?? "").trim();
  return { selected, otro };
}

async function printAsegurado(it, doctor) {
    const branding = await getBrandingSafe();
  const headerHtml = renderPrintHeader(branding);
  const w = window.open("", "_blank");
  if (!w) return alert("Pop-up bloqueado. Permite ventanas emergentes para imprimir.");

  const dname = it.medico_tratante || doctor?.name || "";
  const dex = it.medico_exequatur || doctor?.exequatur || "";
  const motivo = _buildMotivo(it);

  const labList = [
    (Number(it.lab_hemograma || 0) === 1 ? "Hemograma" : ""),
    (Number(it.lab_ex_orina || 0) === 1 ? "Orina" : ""),
    (Number(it.lab_creatinina || 0) === 1 ? "Creatinina" : ""),
    (Number(it.lab_urea || 0) === 1 ? "Urea" : ""),
    (Number(it.lab_glicemia || 0) === 1 ? "Glucosa" : ""),
    ((Number(it.lab_sodio || 0) === 1 || Number(it.lab_potasio || 0) === 1 || Number(it.lab_cloro || 0) === 1) ? "Electrolitos (Na/K/Cl)" : ""),
    ((Number(it.lab_tgo || 0) === 1 || Number(it.lab_tgp || 0) === 1) ? "TGO/TGP" : ""),
    (Number(it.lab_gases_arteriales || 0) === 1 ? "Gasometría" : ""),
    ((Number(it.lab_troponinas || 0) === 1 || Number(it.lab_ck || 0) === 1 || Number(it.lab_cpk_mb || 0) === 1) ? "Troponina/CK-MB" : ""),
    ((it.lab_otros || "").trim() ? `Otros: ${it.lab_otros}` : ""),
  ].filter(Boolean);

  const imgList = [
    (Number(it.img_tac || 0) === 1 ? "Tomografía" : ""),
    (Number(it.img_sonografia || 0) === 1 ? "Sonografía" : ""),
    (Number(it.img_rayosx || 0) === 1 ? "Radiografía" : ""),
    (Number(it.img_ekg || 0) === 1 ? "EKG" : ""),
    ((it.img_otras || "").trim() ? `Otros: ${it.img_otras}` : ""),
    ((it.img_indicar_parte_cuerpo || "").trim() ? `Especificaciones: ${it.img_indicar_parte_cuerpo}` : ""),
  ].filter(Boolean);

  w.document.write(`
    <html>
    <head>
      <title>Historia Clínica ${escapeHtml(it.expediente_clinico||"")}</title>
      ${pageBreakCSS()}
    </head>
    <body>
            ${headerHtml}
      <div class="muted">Expediente: <b>${escapeHtml(it.expediente_clinico||"")}</b></div>

      <div class="sec">
        <h3>Información General</h3>
        <div class="grid3">
          <div><b>Fecha:</b> ${escapeHtml(_v("f_fecha", it.fecha))}</div>
          <div><b>Hora llegada:</b> ${escapeHtml(_v("f_hora", it.hora_llegada))}</div>
          <div><b>Triage:</b> ${escapeHtml(document.getElementById("triage")?.value || it.triaje_prioridad || "")}</div>
        </div>
      </div>

      <div class="sec compact">
<h3>Paciente</h3>
        <div class="grid2">
          <div class="rowline"><b>Nombre:</b> ${escapeHtml(_v("f_nombre", it.nombre))}</div>
          <div class="rowline"><b>Apodo:</b> ${escapeHtml(_v("f_apodo", it.apodo))}</div>

          <div class="rowline"><b>Sexo:</b> ${escapeHtml(_v("f_sexo", it.sexo))}</div>
          <div class="rowline"><b>Edad:</b> ${escapeHtml(_v("f_edad", it.edad))} &nbsp; <b>F.N.:</b> ${escapeHtml(_v("f_fn", it.fecha_nacimiento))}</div>

          <div class="rowline"><b>Cédula:</b> ${escapeHtml(_v("f_ced", it.cedula_pasaporte_nui))}</div>
          <div class="rowline"><b>NSS:</b> ${escapeHtml(_v("f_nss", it.nss))}</div>

          <div class="rowline"><b>Aseguradora:</b> ${escapeHtml(_v("f_aseg", it.aseguradora))}</div>
          <div class="rowline"><b>Grupo:</b> ${escapeHtml(_v("f_grupo", it.grupo_sanguineo))}</div>

          <div class="rowline"><b>Alérgico:</b> ${escapeHtml(_v("f_alergico", it.alergico))}</div>
          <div class="rowline"><b>Tel:</b> ${escapeHtml(_v("f_tel", it.telefono))}</div>
        </div>
      <div class="sec">
        <h3>Datos de llegada</h3>
        <div class="grid2">
          <div class="rowline"><b>Vía de llegada:</b> ${escapeHtml(_v("f_via", it.via_llegada))}</div>
          <div class="rowline"><b>Ambulancia No.:</b> ${escapeHtml(_v("f_amb", it.ambulancia_no))}</div>

          <div class="rowline"><b>Paramédico:</b> ${escapeHtml(_v("f_paramed", it.paramedico))}</div>
          <div class="rowline"><b>Acompañante:</b> ${escapeHtml(_v("f_acomp", it.acompanante))}</div>

          <div class="rowline"><b>Parentesco:</b> ${escapeHtml(_v("f_parent", it.parentesco))}</div>
          <div class="rowline"><b>Tel. (Acomp.):</b> ${escapeHtml(_v("f_acomp_tel", it.acompanante_telefono))}</div>
        </div>
        <div class="rowline" style="margin-top:6px;"><b>Dirección (Acomp.):</b> ${escapeHtml(_v("f_acomp_dir", it.acompanante_direccion))}</div>
      </div>
      <div class="sec">
        <h3>Motivo de consulta</h3>
        <div>
          ${motivo.selected.length ? motivo.selected.map(x => `<span class="pill">${escapeHtml(x)}</span>`).join("") : ""}
        </div>
        ${motivo.otro ? `<div style="margin-top:6px;"><b>Otro:</b> ${escapeHtml(motivo.otro)}</div>` : ""}
      </div>

      <div class="sec">
        <h3>Historia de la Enfermedad Actual</h3>
        <div class="pre">${escapeHtml(_v("h_ea", it.historia_enfermedad_actual))}</div>
      </div>

      <div class="sec">
        <h3>Antecedentes</h3>
        <div class="rowline"><b>Checklist:</b> ${escapeHtml(it.antecedentes_1||"")}</div>
        <div class="rowline"><b>Otros:</b> ${escapeHtml(_v("ant_otros", it.antecedentes_2))}</div>
        <div class="rowline"><b>Notas:</b> ${escapeHtml(_v("ant_notas", it.antecedentes_3))}</div>
      </div>

      <div class="sec">
        <h3>Evaluación física / Signos vitales</h3>
        <div class="grid3">
          <div><b>Peso:</b> ${escapeHtml(_v("sv_peso", it.peso))}</div>
          <div><b>TA:</b> ${escapeHtml(_v("sv_ta", it.ta))}</div>
          <div><b>FC:</b> ${escapeHtml(_v("sv_fc", it.fc))}</div>
          <div><b>FR:</b> ${escapeHtml(_v("sv_fr", it.fr))}</div>
          <div><b>Temp:</b> ${escapeHtml(_v("sv_temp", it.temp))}</div>
          <div><b>SaO2:</b> ${escapeHtml(_v("sv_sao2", it.sao2))}</div>
        </div>
        <div style="margin-top:6px;"><b>Glicemia:</b> ${escapeHtml(_v("sv_gli", it.glicemia))}</div>
      </div>

      <div class="sec">
        <h3>Revisión por sistemas</h3>
        <div class="grid2">
          <div><b>Cabeza:</b> ${escapeHtml(_v("ex_cabeza", it.examen_cabeza))}</div>
          <div><b>Cuello:</b> ${escapeHtml(_v("ex_cuello", it.examen_cuello))}</div>
          <div><b>Pulmones:</b> ${escapeHtml(_v("ex_pulmones", it.examen_pulmones))}</div>
          <div><b>Tórax:</b> ${escapeHtml(_v("ex_torax", it.examen_torax))}</div>
          <div><b>Corazón:</b> ${escapeHtml(_v("ex_corazon", it.examen_corazon))}</div>
          <div><b>Abdomen:</b> ${escapeHtml(_v("ex_abdomen", it.examen_abdomen))}</div>
          <div><b>Extremidades:</b> ${escapeHtml(_v("ex_extremidades", it.examen_extremidades))}</div>
          <div><b>Genitales:</b> ${escapeHtml(_v("ex_genitales", it.examen_genitales))}</div>
        </div>
      </div>

      <div class="sec">
        <h3>Laboratorio</h3>
        <div>${labList.length ? labList.map(x => `<span class="pill">${escapeHtml(x)}</span>`).join("") : ""}</div>
      </div>

      <div class="sec">
        <h3>Imágenes</h3>
        <div>${imgList.length ? imgList.map(x => `<span class="pill">${escapeHtml(x)}</span>`).join("") : ""}</div>
      </div>

          <div class="sec">
        <h3>Diagnósticos</h3>
        ${
          [ _v("dx1", it.dx_1), _v("dx2", it.dx_2), _v("dx3", it.dx_3) ]
            .map(x => (x || "").trim())
            .filter(Boolean)
            .map((x, i) => `<div class="rowline">${i+1}) ${escapeHtml(x)}</div>`)
            .join("") || `<div class="muted">Sin diagnósticos.</div>`
        }
      </div>
      <div class="sec">
        <h3>Tratamiento</h3>
        ${
          [ _v("man1", it.manejo_1), _v("man2", it.manejo_2), _v("man3", it.manejo_3) ]
            .map(x => (x || "").trim())
            .filter(Boolean)
            .map((x, i) => `<div class="rowline">${i+1}) ${escapeHtml(x)}</div>`)
            .join("") || `<div class="muted">Sin tratamiento.</div>`
        }
      </div>

      <div class="sec">
        <h3>Observaciones</h3>
        <div class="pre">${escapeHtml(_v("obs", it.observaciones))}</div>
      </div>
      <div class="sec">
        <h3>Egreso</h3>
        <div class="grid2">
          <div class="rowline"><b>Tipo:</b> ${escapeHtml(document.getElementById("egreso_tipo")?.value || "")}</div>
          <div class="rowline"><b>Referido a:</b> ${escapeHtml(_v("egreso_referido", it.destino_referido_a))}</div>
        </div>
        <div class="rowline" style="margin-top:6px;"><b>Observaciones egreso:</b></div>
        <div class="pre">${escapeHtml(_v("egreso_obs", it.observaciones_destino))}</div>
      </div>
      <div class="sec">
        <h3>Firma</h3>
        <div class="grid2">
          <div>
            <div><b>Médico tratante:</b> ${escapeHtml(dname)}</div>
            <div><b>Exequatur:</b> ${escapeHtml(dex)}</div>
            <div class="line"></div>
            <div class="muted">Firma Médico</div>
          </div>
          <div>
            <div><b>Paciente:</b> ${escapeHtml(_v("f_nombre", it.nombre))}</div>
            <div class="line"></div>
            <div class="muted">Firma Paciente o / Acompañante</div>
          </div>
        </div>
      </div>

      <script>window.onload = () => window.print();</script>
    </body></html>
  `);
  w.document.close();
}