import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsArrowLeft, BsArrowRepeat, BsDownload, BsJournalText, BsListUl, BsCodeSlash, BsXLg } from 'react-icons/bs';
import { getApiBase } from '../utils/env';

const API_BASE = getApiBase();
const AUTO_REFRESH_MS = 15000;

interface StayLogSummary {
  groupKey: string;
  stayId: string | null;
  roomNumber: string | null;
  guestName: string | null;
  latestTimestamp: string | null;
  counts: {
    connections: number;
    requests: number;
    errors: number;
    total: number;
  };
}

interface LogEvent {
  category: 'connections' | 'requests' | 'errors';
  timestamp: string | null;
  level: string;
  eventType: string;
  message: string;
  stayId: string | null;
  roomNumber: string | null;
  guestName: string | null;
  requestId: string | null;
  actor: string | null;
  actorRole: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
}

interface StayLogFile {
  name: string;
  category: 'connections' | 'requests' | 'errors';
  size: number;
  content: string;
}

type ModalView = 'list' | 'xml';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('staff_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(value: string | null) {
  if (!value) {
    return 'No date';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function categoryLabel(category: LogEvent['category'] | 'connections' | 'requests' | 'errors') {
  switch (category) {
    case 'connections':
      return 'Connections';
    case 'requests':
      return 'Requests';
    case 'errors':
      return 'Errors';
    default:
      return category;
  }
}

function categoryBadgeClass(category: string) {
  if (category === 'connections') return 'bg-sky-100 text-sky-700';
  if (category === 'requests') return 'bg-emerald-100 text-emerald-700';
  return 'bg-red-100 text-red-700';
}

function levelBadgeClass(level: string) {
  if (level === 'error') return 'bg-red-100 text-red-700';
  if (level === 'warn') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function buildQuery(search: string, start: string, end: string) {
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return params.toString();
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

interface StayLogsModalProps {
  open: boolean;
  stay: StayLogSummary | null;
  view: ModalView;
  events: LogEvent[];
  files: StayLogFile[];
  selectedFileName: string | null;
  loading: boolean;
  onClose: () => void;
  onChangeView: (view: ModalView) => void;
  onSelectFile: (fileName: string) => void;
  onDownload: () => void;
  onRefresh: () => void;
}

function StayLogsModal({
  open,
  stay,
  view,
  events,
  files,
  selectedFileName,
  loading,
  onClose,
  onChangeView,
  onSelectFile,
  onDownload,
  onRefresh,
}: StayLogsModalProps) {
  if (!open || !stay) {
    return null;
  }

  const selectedFile = files.find((file) => file.name === selectedFileName) || files[0] || null;

  return (
    <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-[90] p-4">
      <div className="bg-auto-secondary rounded-xl shadow-xl border border-auto w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-auto flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-auto-primary">
                Room {stay.roomNumber || 'No room'} Logs
                </h3>
              {stay.guestName && <span className="text-xs px-2 py-1 rounded-full bg-auto-tertiary text-auto-secondary">{stay.guestName}</span>}
              {stay.stayId && <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{stay.stayId}</span>}
            </div>
            <p className="text-xs text-auto-tertiary">Latest event: {formatDate(stay.latestTimestamp)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-auto-secondary hover:text-auto-primary hover:bg-auto-tertiary"
            aria-label="Close logs modal"
          >
            <BsXLg className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangeView('list')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border ${view === 'list' ? 'text-white border-transparent' : 'text-auto-secondary border-auto hover:bg-auto-tertiary'}`}
              style={view === 'list' ? { backgroundColor: 'var(--hotel-primary)' } : {}}
            >
              <BsListUl className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => onChangeView('xml')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border ${view === 'xml' ? 'text-white border-transparent' : 'text-auto-secondary border-auto hover:bg-auto-tertiary'}`}
              style={view === 'xml' ? { backgroundColor: '#334155' } : {}}
            >
              <BsCodeSlash className="w-3.5 h-3.5" />
              XML
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-auto text-auto-secondary hover:bg-auto-tertiary flex items-center gap-2"
            >
              <BsArrowRepeat className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onDownload}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-auto text-auto-secondary hover:bg-auto-tertiary flex items-center gap-2"
            >
              <BsDownload className="w-3.5 h-3.5" />
              Download
            </button>
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-150px)] bg-auto-primary/30">
          {loading && <div className="text-sm text-auto-secondary">Loading stay logs...</div>}

          {!loading && view === 'list' && (
            <>
              {events.length === 0 ? (
                <div className="text-sm text-auto-secondary">No hay eventos disponibles para esta estancia.</div>
                
              ) : (
                <div className="space-y-3">
                  {events.map((event, index) => (
                    <div key={`${event.category}-${event.timestamp}-${index}`} className="rounded-lg border border-auto bg-auto-secondary p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${categoryBadgeClass(event.category)}`}>
                          {categoryLabel(event.category)}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${levelBadgeClass(event.level)}`}>
                          {event.level}
                        </span>
                        <span className="text-xs text-auto-tertiary">{formatDate(event.timestamp)}</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-auto-primary">{event.eventType}</p>
                        <p className="text-sm text-auto-secondary">{event.message}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-auto-tertiary">
                          {event.requestId && <span>Request: {event.requestId}</span>}
                          {event.actor && <span>Actor: {event.actor}</span>}
                          {event.actorRole && <span>Role: {event.actorRole}</span>}
                          {event.source && <span>Source: {event.source}</span>}
                        </div>
                        {Object.keys(event.metadata || {}).length > 0 && (
                          <pre className="mt-2 p-3 rounded-lg bg-slate-950 text-slate-100 text-xs overflow-x-auto">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && view === 'xml' && (
            <div className="grid lg:grid-cols-[240px_1fr] gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-auto-secondary uppercase tracking-wide">Files in Folder</p>
                {files.length === 0 && (
                  <div className="text-sm text-auto-secondary">No XML files are available for this stay.</div>
                )}
                {files.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => onSelectFile(file.name)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${selectedFile?.name === file.name ? 'text-white border-transparent' : 'text-auto-secondary border-auto hover:bg-auto-tertiary'}`}
                    style={selectedFile?.name === file.name ? { backgroundColor: '#334155' } : {}}
                  >
                    <div>{file.name}</div>
                    <div className="mt-1 text-[11px] opacity-80">{categoryLabel(file.category)} • {file.size} bytes</div>
                  </button>
                ))}
              </div>
              <div>
                <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 text-xs overflow-x-auto whitespace-pre-wrap min-h-[420px]">
                  {selectedFile?.content || ''}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogsManagement() {
  const navigate = useNavigate();
  const [stays, setStays] = useState<StayLogSummary[]>([]);
  const [eventsByStay, setEventsByStay] = useState<Record<string, LogEvent[]>>({});
  const [filesByStay, setFilesByStay] = useState<Record<string, StayLogFile[]>>({});
  const [selectedFileByStay, setSelectedFileByStay] = useState<Record<string, string>>({});
  const [selectedStay, setSelectedStay] = useState<StayLogSummary | null>(null);
  const [modalView, setModalView] = useState<ModalView>('list');
  const [loading, setLoading] = useState(true);
  const [loadingStayKey, setLoadingStayKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const loadStays = async (preserveSelection = true) => {
    try {
      setLoading(true);
      setError('');
      const query = buildQuery(search, start, end);
      const response = await fetch(`${API_BASE}/logs/stays${query ? `?${query}` : ''}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'No se pudieron cargar los logs');
      }

      const payload = await response.json();
      setStays(payload.stays || []);

      if (preserveSelection && selectedStay) {
        const refreshedSelection = (payload.stays || []).find((item: StayLogSummary) => item.groupKey === selectedStay.groupKey) || null;
        setSelectedStay(refreshedSelection);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStays();
  }, []);

  const handleSearch = async () => {
    setSelectedStay(null);
    setEventsByStay({});
    setFilesByStay({});
    setSelectedFileByStay({});
    await loadStays(false);
  };

  const loadStayDetails = async (stay: StayLogSummary) => {
    try {
      setLoadingStayKey(stay.groupKey);
      const query = buildQuery(search, start, end);
      const response = await fetch(`${API_BASE}/logs/stays/${encodeURIComponent(stay.groupKey)}/events${query ? `?${query}` : ''}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'No se pudieron cargar los eventos de la estancia');
      }

      const payload = await response.json();
      setEventsByStay((current) => ({
        ...current,
        [stay.groupKey]: payload.events || [],
      }));
      const files = Array.isArray(payload.files) ? payload.files : [];
      setFilesByStay((current) => ({
        ...current,
        [stay.groupKey]: files,
      }));
      setSelectedFileByStay((current) => ({
        ...current,
        [stay.groupKey]: current[stay.groupKey] || files[0]?.name || '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los eventos de la estancia');
      setSelectedStay(null);
    } finally {
      setLoadingStayKey(null);
    }
  };

  const handleOpenStay = async (stay: StayLogSummary) => {
    setSelectedStay(stay);

    if (!forceLoadNeeded(stay.groupKey, eventsByStay, filesByStay)) {
      return;
    }

    await loadStayDetails(stay);
  };

  const handleRefreshStay = async () => {
    if (!selectedStay) {
      return;
    }

    await loadStayDetails(selectedStay);
  };

  const handleDownloadStay = async () => {
    if (!selectedStay) {
      return;
    }

    const selectedFileName = selectedFileByStay[selectedStay.groupKey];
    const selectedFile = (filesByStay[selectedStay.groupKey] || []).find((file) => file.name === selectedFileName);

    if (selectedFile) {
      downloadTextFile(selectedFile.name, selectedFile.content);
      return;
    }

    try {
      if (!selectedFileName) {
        throw new Error('No hay archivo seleccionado para descargar');
      }

      const response = await fetch(`${API_BASE}/logs/stays/${encodeURIComponent(selectedStay.groupKey)}/files/${encodeURIComponent(selectedFileName)}/download`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'No se pudo descargar el archivo');
      }

      downloadTextFile(selectedFileName, await response.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el archivo');
    }
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadStays();
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [search, start, end, selectedStay]);

  useEffect(() => {
    if (!selectedStay) {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadStayDetails(selectedStay);
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [selectedStay, search, start, end]);

  return (
    <div className="min-h-screen bg-auto-primary">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-auto-secondary/90 border-b border-auto shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md text-white" style={{ backgroundColor: '#334155' }}>
                <BsJournalText className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-auto-primary">Logs by Stay</h1>
                <p className="text-xs text-auto-tertiary">Select a stay to open its logs in a modal</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-auto text-auto-secondary hover:bg-auto-tertiary flex items-center gap-2"
            >
              <BsArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <section className="bg-auto-secondary border border-auto rounded-xl p-5">
          <div className="grid md:grid-cols-[2fr_1fr_1fr_auto] gap-4">
            <div>
              <label className="block text-xs font-semibold text-auto-secondary mb-1.5">Search stay or event</label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary"
                placeholder="stayId, room, guest, event..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-auto-secondary mb-1.5">Start date</label>
              <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-auto-secondary mb-1.5">End date</label>
              <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary" />
            </div>
            <div className="flex items-end">
              <div className="w-full flex gap-2">
                <button onClick={handleSearch} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: 'var(--hotel-primary)' }}>
                  Apply
                </button>
                <button
                  onClick={() => loadStays()}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-auto text-auto-secondary hover:bg-auto-tertiary flex items-center justify-center"
                  title="Refresh logs list"
                >
                  <BsArrowRepeat className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {error && <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>}
        {loading && <div className="p-6 text-sm text-auto-secondary">Loading stays with logs...</div>}

        {!loading && (
          <section className="space-y-4">
            {stays.length === 0 && (
              <div className="bg-auto-secondary border border-auto rounded-xl p-6 text-sm text-auto-secondary">
                No logs are associated with stays for the current filters.
              </div>
            )}

            {stays.map((stay) => (
              <article key={stay.groupKey} className="bg-auto-secondary border border-auto rounded-xl p-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-auto-primary">
                        Room {stay.roomNumber || 'No room'}
                      </span>
                      {stay.guestName && <span className="text-xs px-2 py-1 rounded-full bg-auto-tertiary text-auto-secondary">{stay.guestName}</span>}
                      {stay.stayId && <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{stay.stayId}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-700">Connections: {stay.counts.connections}</span>
                      <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Requests: {stay.counts.requests}</span>
                      <span className="px-2 py-1 rounded-full bg-red-100 text-red-700">Errors: {stay.counts.errors}</span>
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">Total: {stay.counts.total}</span>
                    </div>
                    <p className="text-xs text-auto-tertiary">Latest event: {formatDate(stay.latestTimestamp)}</p>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={() => handleOpenStay(stay)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                      style={{ backgroundColor: 'var(--hotel-primary)' }}
                    >
                      View Logs
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>

      <StayLogsModal
        open={!!selectedStay}
        stay={selectedStay}
        view={modalView}
        events={selectedStay ? eventsByStay[selectedStay.groupKey] || [] : []}
        files={selectedStay ? filesByStay[selectedStay.groupKey] || [] : []}
        selectedFileName={selectedStay ? selectedFileByStay[selectedStay.groupKey] || null : null}
        loading={!!selectedStay && loadingStayKey === selectedStay.groupKey}
        onClose={() => setSelectedStay(null)}
        onChangeView={setModalView}
        onSelectFile={(fileName) => {
          if (!selectedStay) {
            return;
          }

          setSelectedFileByStay((current) => ({
            ...current,
            [selectedStay.groupKey]: fileName,
          }));
        }}
        onDownload={handleDownloadStay}
        onRefresh={handleRefreshStay}
      />
    </div>
  );
}

function forceLoadNeeded(
  groupKey: string,
  eventsByStay: Record<string, LogEvent[]>,
  filesByStay: Record<string, StayLogFile[]>,
) {
  return !eventsByStay[groupKey] || !filesByStay[groupKey];
}

export default LogsManagement;
