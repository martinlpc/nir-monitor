import { useState, useMemo } from 'react'
import rawData from '../data/provincias-localidades.json'

interface RawLocalidad {
  categoria: string
  fuente: string
  municipio: { nombre: string; id: string }
  departamento: { nombre: string; id: string }
  nombre: string
  id: string
  provincia: { nombre: string; id: string }
  localidad_censal: { nombre: string; id: string }
  centroide: { lat: number; lon: number }
}

interface ProvinciaEntry {
  n: string
  l: string[]
}

const CABA_NAME = 'Ciudad Autónoma de Buenos Aires'

function buildProvincias(data: { localidades: RawLocalidad[] }): ProvinciaEntry[] {
  const grouped = new Map<string, Set<string>>()

  for (const loc of data.localidades) {
    const provName = loc.provincia.nombre

    if (provName === CABA_NAME) {
      if (!grouped.has(CABA_NAME)) {
        grouped.set(CABA_NAME, new Set([CABA_NAME]))
      }
      continue
    }

    if (!grouped.has(provName)) {
      grouped.set(provName, new Set())
    }
    grouped.get(provName)!.add(loc.nombre)
  }

  const entries = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'))

  const cabaIdx = entries.findIndex(([name]) => name === CABA_NAME)
  if (cabaIdx > 0) {
    const [caba] = entries.splice(cabaIdx, 1)
    entries.unshift(caba)
  }

  return entries.map(([name, localities]) => ({
    n: name,
    l: Array.from(localities).sort((a, b) => a.localeCompare(b, 'es'))
  }))
}

const provincias = buildProvincias(rawData as { localidades: RawLocalidad[] })

interface SessionStartModalProps {
  onConfirm: (data: {
    provincia: string
    localidad: string
    apellido1: string
    apellido2: string
  }) => void
  onCancel: () => void
}

export default function SessionStartModal({
  onConfirm,
  onCancel
}: SessionStartModalProps): React.JSX.Element {
  const [selectedProvincia, setSelectedProvincia] = useState('')
  const [selectedLocalidad, setSelectedLocalidad] = useState('')
  const [apellido1, setApellido1] = useState('')
  const [apellido2, setApellido2] = useState('')
  const [touched, setTouched] = useState({ apellido1: false, apellido2: false })

  const localidades = useMemo(() => {
    const p = provincias.find((p) => p.n === selectedProvincia)
    return p ? p.l : []
  }, [selectedProvincia])

  const canSubmit =
    selectedProvincia &&
    selectedLocalidad &&
    apellido1.trim().length >= 2 &&
    apellido2.trim().length >= 2

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!canSubmit) return
    onConfirm({
      provincia: selectedProvincia,
      localidad: selectedLocalidad,
      apellido1: apellido1.trim(),
      apellido2: apellido2.trim()
    })
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Datos del recorrido</h2>
        <p className="modal-subtitle">Completá los datos antes de iniciar la sesión de medición</p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span className="modal-label">Provincia</span>
            <select
              className="modal-select"
              value={selectedProvincia}
              onChange={(e) => {
                setSelectedProvincia(e.target.value)
                setSelectedLocalidad('')
              }}
              required
            >
              <option value="">Seleccionar provincia</option>
              {provincias.map((p) => (
                <option key={p.n} value={p.n}>
                  {p.n}
                </option>
              ))}
            </select>
          </label>

          <label className="modal-field">
            <span className="modal-label">Localidad</span>
            <select
              className="modal-select"
              value={selectedLocalidad}
              onChange={(e) => setSelectedLocalidad(e.target.value)}
              disabled={!selectedProvincia}
              required
            >
              <option value="">
                {selectedProvincia ? 'Seleccionar localidad' : 'Primero seleccioná una provincia'}
              </option>
              {localidades.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>

          <label className="modal-field">
            <span className="modal-label">Apellido del operador 1</span>
            <input
              className="modal-input"
              type="text"
              value={apellido1}
              onChange={(e) => setApellido1(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, apellido1: true }))}
              placeholder="Ej: García"
              minLength={2}
              required
            />
            {touched.apellido1 && apellido1.trim().length < 2 && (
              <span className="modal-error">Debe tener al menos 2 caracteres</span>
            )}
          </label>

          <label className="modal-field">
            <span className="modal-label">Apellido del operador 2</span>
            <input
              className="modal-input"
              type="text"
              value={apellido2}
              onChange={(e) => setApellido2(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, apellido2: true }))}
              placeholder="Ej: López"
              minLength={2}
              required
            />
            {touched.apellido2 && apellido2.trim().length < 2 && (
              <span className="modal-error">Debe tener al menos 2 caracteres</span>
            )}
          </label>

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn modal-btn-confirm" disabled={!canSubmit}>
              Comenzar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
