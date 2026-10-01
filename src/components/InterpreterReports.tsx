import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsArrowLeft, BsJournalText } from 'react-icons/bs';
import { getApiBase, getWsUrl } from '../utils/env';
import { useWebSocket } from '../hooks/useWebSocket';

const API_BASE = getApiBase();

interface InterpreterReport {
  reportId: string;
  callId: string;
  roomNumber: string;
  guestName: string;
  interpreterName: string;
  summary: string;
  priority: string;
  category: string;
  notes: string;
  followUpRequired: boolean;
  requestId?: string | null;
  submittedAt: string;
  followUpStatus?: string | null;
}

export default function InterpreterReports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<InterpreterReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const token = localStorage.getItem('staff_token');
  const { estaConectado } = useWebSocket(getWsUrl(), token, message => {
    if (['INTERPRETER_REPORT_RECEIVED', 'UPDATE_REQUEST', 'CANCEL_REQUEST'].includes(message.type)) setRevision(value => value + 1);
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`${API_BASE}/calls/interpreter-reports`, {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load interpreter reports');
        }
        setReports(data.reports || []);
        setError('');
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load interpreter reports'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision, token, estaConectado]);

  return (
    <div className="min-h-screen bg-auto-primary">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-auto-secondary/90 border-b border-auto shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md text-white" style={{ backgroundColor: '#0f766e' }}>
              <BsJournalText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-auto-primary">Interpreter Reports</h1>
              <p className="text-xs text-auto-tertiary">Formal call handoff records for hotel follow-up.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
          <span className="text-xs text-auto-secondary" role="status">{estaConectado ? 'Live updates' : 'Live updates disconnected — refresh to check'}</span>
          <button disabled={loading} onClick={() => setRevision(value => value + 1)} className="px-3 py-2 rounded-lg border border-auto text-auto-secondary">Refresh</button>
          <button onClick={() => navigate('/')} className="px-3 py-2 rounded-lg text-xs font-semibold border border-auto text-auto-secondary hover:bg-auto-tertiary inline-flex items-center gap-2">
            <BsArrowLeft className="w-4 h-4" />
            Back
          </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {loading && <p className="text-sm text-auto-secondary">Loading interpreter reports...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid gap-4">
          {reports.map((report) => (
            <article key={report.reportId} className="bg-auto-secondary border border-auto rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h2 className="text-base font-bold text-auto-primary">Room {report.roomNumber} • {report.guestName}</h2>
                  <p className="text-xs text-auto-tertiary">Interpreter: {report.interpreterName} • {new Date(report.submittedAt).toLocaleString('en-US')}</p>
                </div>
                <span className="px-2.5 py-1 rounded-md text-xs font-semibold text-white" style={{ backgroundColor: '#0f766e' }}>{report.priority}</span>
              </div>
              <p className="text-sm text-auto-primary mb-3 whitespace-pre-wrap">{report.summary}</p>
              <div className="grid md:grid-cols-4 gap-3 text-xs text-auto-secondary">
                <span><strong>Category:</strong> {report.category}</span>
                <span><strong>Follow-up:</strong> {report.followUpRequired ? report.followUpStatus || 'Pending' : 'Not required'}</span>
                <span><strong>Call ID:</strong> {report.callId}</span>
                <span><strong>Request:</strong> {report.requestId || 'No follow-up request'}</span>
              </div>
              {report.notes && <p className="text-xs text-auto-secondary mt-3"><strong>Notes:</strong> {report.notes}</p>}
            </article>
          ))}
          {!loading && !reports.length && <p className="text-sm text-auto-tertiary">No interpreter reports yet.</p>}
        </div>
      </main>
    </div>
  );
}
