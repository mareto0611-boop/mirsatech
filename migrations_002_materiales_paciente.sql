-- Tabla de materiales usados por paciente (multi material + cantidad)
CREATE TABLE IF NOT EXISTS materiales_paciente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL,
  material TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  usuario TEXT,                 -- quien lo registró/actualizó (enfermera)
  rol TEXT,                     -- 'enfermeria' (u otros si lo permiten)
  fecha TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(paciente_id, material),
  FOREIGN KEY(paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_materiales_paciente_pid ON materiales_paciente(paciente_id);
CREATE INDEX IF NOT EXISTS idx_materiales_paciente_material ON materiales_paciente(material);