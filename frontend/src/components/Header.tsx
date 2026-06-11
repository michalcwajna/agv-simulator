import { useSimulatorStore } from '../stores/useSimulatorStore';

const LABELS: Record<string, string> = {
  idle: 'Oczekiwanie',
  uploading: 'Przesyłanie…',
  translating: 'Translacja…',
  ready: 'Mapa gotowa',
  error: 'Błąd',
};

export function Header() {
  const { uploadStatus, fileName } = useSimulatorStore();

  return (
    <header className="header">
      <div className="header-logo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        AGV / AMR Simulator
      </div>

      {fileName && (
        <span className="header-file">{fileName}</span>
      )}

      <div className="header-spacer" />

      <span className={`badge badge-${uploadStatus}`}>
        {uploadStatus === 'uploading' || uploadStatus === 'translating'
          ? <span className="badge-spin" />
          : <span className="badge-dot" />}
        {LABELS[uploadStatus]}
      </span>
    </header>
  );
}
