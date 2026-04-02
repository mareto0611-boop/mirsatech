// static/historia_clinica.js
// Requiere: api(), escapeHtml() disponibles (definidas en app.js)

window.renderTabHistoriaClinica = async function renderTabHistoriaClinica(body, iid, ing, adm, onRefresh) {
  body.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0;">Historia clínica</h3>
      <div class="muted">Cargando...</div>
      <div id="hcBox" style="margin-top:10px;"></div>
      <div class="flex" style="gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button class="btn" id="hcEdit" type="button">Editar</button>
        <button class="btn-ghost" id="hcReload" type="button">Recargar</button>
      </div>
    </div>
  `;

  body.querySelector("#hcReload").addEventListener("click", () => {
    window.renderTabHistoriaClinica(body, iid, ing, adm, onRefresh);
  });

  let historia = null;
  try {
    const r = await api(`/api/ingresos/${iid}/historia`);
    historia = r.historia || null;
  } catch (e) {
    body.querySelector("#hcBox").innerHTML = `<div style="color:#b00020;">${escapeHtml(e.message)}</div>`;
    return;
  }

  const h = historia || {};
  body.querySelector("#hcBox").innerHTML = `
    <div><b>Fecha:</b> ${escapeHtml(h.fecha || "")}</div>
    <div><b>Hora:</b> ${escapeHtml(h.hora || "")}</div>
    <div><b>Motivo:</b><div style="white-space:pre-wrap;">${escapeHtml(h.motivo_consulta || "")}</div></div>
    <div><b>HEA:</b><div style="white-space:pre-wrap;">${escapeHtml(h.historia_enfermedad_actual || "")}</div></div>
    ${historia ? "" : `<div class="muted" style="margin-top:8px;">(Aún no hay historia guardada para este ingreso)</div>`}
  `;

  body.querySelector("#hcEdit").addEventListener("click", async () => {
    const motivo = prompt("Motivo de consulta:", h.motivo_consulta || "");
    if (motivo === null) return;

    const hea = prompt("Historia de la enfermedad actual:", h.historia_enfermedad_actual || "");
    if (hea === null) return;

    try {
      await api(`/api/ingresos/${iid}/historia`, {
        method: "PUT",
        body: JSON.stringify({
          fecha: h.fecha || "",
          hora: h.hora || "",
          especialidad: h.especialidad || (ing && ing.especialidad) || "",
          nombres: h.nombres || (adm && adm.nombres) || "",
          apellidos: h.apellidos || (adm && adm.apellidos) || "",
          edad: h.edad || (adm && adm.edad) || "",
          direccion: h.direccion || (adm && adm.direccion) || "",
          motivo_consulta: motivo,
          historia_enfermedad_actual: hea,
        }),
      });
      await window.renderTabHistoriaClinica(body, iid, ing, adm, onRefresh);
    } catch (e) {
      alert(e.message);
    }
  });
};

console.log("historia_clinica.js cargado");