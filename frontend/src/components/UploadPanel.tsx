import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { useSimulatorStore } from '../stores/useSimulatorStore';

export function UploadPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    uploadStatus,
    uploadError,
    translationProgress,
    setUploadStatus,
    setTranslationProgress,
    setUrn,
    reset,
  } = useSimulatorStore();

  const busy = uploadStatus === 'uploading' || uploadStatus === 'translating';

  const processFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.dwg') && !name.endsWith('.dxf')) {
      setUploadStatus('error', 'Obsługiwane formaty: .dwg, .dxf');
      return;
    }

    setUploadStatus('uploading');

    const form = new FormData();
    form.append('file', file);

    try {
      const uploadRes = await fetch('/api/aps/upload', { method: 'POST', body: form });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${uploadRes.status}`);
      }
      const { urn, filename } = await uploadRes.json();

      setUploadStatus('translating');
      setUrn(urn, filename || file.name);
      await pollStatus(urn);
    } catch (e: unknown) {
      setUploadStatus('error', e instanceof Error ? e.message : 'Nieznany błąd');
    }
  };

  const pollStatus = async (urn: string): Promise<void> => {
    const res = await fetch(`/api/aps/status/${urn}`);
    if (!res.ok) {
      setUploadStatus('error', `Błąd sprawdzania statusu: HTTP ${res.status}`);
      return;
    }
    const { status, progress } = await res.json();

    if (status === 'success') {
      setTranslationProgress('');
      setUploadStatus('ready');
    } else if (status === 'failed') {
      setUploadStatus('error', 'Translacja pliku nie powiodła się');
    } else {
      setTranslationProgress(progress || 'w toku…');
      await new Promise((r) => setTimeout(r, 3000));
      await pollStatus(urn);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  return (
    <>
      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
        onClick={() => !busy && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
      >
        <div className="upload-zone-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="upload-zone-text">
          {busy ? 'Przetwarzanie…' : 'Przeciągnij plik lub kliknij'}
        </div>
        <div className="upload-zone-hint">.dwg / .dxf</div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".dwg,.dxf"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      {uploadStatus === 'translating' && (
        <div className="progress-wrap">
          <div className="progress-label">Translacja APS: {translationProgress}</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: '100%', animation: 'none', opacity: 0.6 }} />
          </div>
        </div>
      )}

      {uploadStatus === 'error' && uploadError && (
        <div className="error-msg">{uploadError}</div>
      )}

      {uploadStatus === 'ready' && (
        <button className="btn btn-danger" onClick={reset} style={{ marginTop: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
          Wczytaj inny plik
        </button>
      )}
    </>
  );
}
