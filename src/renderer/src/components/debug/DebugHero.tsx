interface DebugHeroProps {
  scanning: boolean
  gpsFix: boolean
  sessionId: string | null
  busyAction: string | null
}

export default function DebugHero({
  scanning,
  gpsFix,
  sessionId,
  busyAction
}: DebugHeroProps): React.JSX.Element {
  return (
    <section className="hero-card">
      <div>
        <p className="eyebrow">nir-monitor</p>
        <h1>Panel de Debug IPC</h1>
        <p className="hero-copy">
          Esta pantalla sirve para validar el wiring real entre renderer, preload, IPC y servicios
          del proceso principal.
        </p>
      </div>
      <div className="hero-meta">
        <span className={`badge ${scanning ? 'warn' : 'ok'}`}>{scanning ? 'Escaneando' : 'Idle'}</span>
        <span className={`badge ${gpsFix ? 'ok' : 'danger'}`}>{gpsFix ? 'GPS fix' : 'GPS sin fix'}</span>
        <span className={`badge ${sessionId ? 'active' : ''}`}>
          {sessionId ? 'Sesion activa' : 'Sin sesion'}
        </span>
        {busyAction ? <span className="busy">Ejecutando: {busyAction}</span> : null}
      </div>
    </section>
  )
}

