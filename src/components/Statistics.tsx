import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsArrowLeft, BsBarChartLine, BsStarFill } from 'react-icons/bs';

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

interface RatingGroup {
  key: string;
  label: string;
  count: number;
  averageRating: number;
  distribution: Record<string, number>;
}

interface RatingDetail {
  requestId: string;
  type: string;
  serviceLabel: string;
  roomNumber: string;
  guestName: string;
  message: string;
  rating: number;
  ratedAt: string;
}

interface StatsResponse {
  availableServices: Array<{ key: string; label: string }>;
  availableRooms: string[];
  summary: {
    totalRated: number;
    averageRating: number;
    highestRatedService: RatingGroup | null;
    lowestRatedService: RatingGroup | null;
    distribution: Record<string, number>;
  };
  byService: RatingGroup[];
  byRoom: RatingGroup[];
  byPeriod: RatingGroup[];
  recentRatings: RatingDetail[];
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('staff_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatRating(value: number) {
  return value > 0 ? value.toFixed(2) : '0.00';
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return toDateInput(date);
}

function BarChart({ title, rows, color }: { title: string; rows: RatingGroup[]; color: string }) {
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <section className="bg-auto-secondary border border-auto rounded-xl p-5">
      <h2 className="text-base font-bold text-auto-primary mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-auto-tertiary">No rated requests for this filter.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-sm font-semibold text-auto-primary truncate">{row.label}</span>
                <span className="text-xs text-auto-secondary">{formatRating(row.averageRating)} / 5 ({row.count})</span>
              </div>
              <div className="h-3 rounded-full bg-auto-tertiary overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((row.count / maxCount) * 100, 8)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const rows = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: distribution[String(rating)] || 0 }));
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <section className="bg-auto-secondary border border-auto rounded-xl p-5">
      <h2 className="text-base font-bold text-auto-primary mb-4">Rating Distribution</h2>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.rating} className="grid grid-cols-[56px_1fr_42px] items-center gap-3">
            <span className="text-xs font-semibold text-auto-secondary">{row.rating} stars</span>
            <div className="h-3 rounded-full bg-auto-tertiary overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${row.count === 0 ? 0 : Math.max((row.count / maxCount) * 100, 6)}%` }}
              />
            </div>
            <span className="text-xs text-auto-tertiary text-right">{row.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PeriodLineChart({ rows }: { rows: RatingGroup[] }) {
  const points = useMemo(() => {
    if (rows.length === 0) return '';
    const width = 520;
    const height = 160;
    return rows
      .map((row, index) => {
        const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * width;
        const y = height - ((row.averageRating - 1) / 4) * height;
        return `${x},${Math.max(0, Math.min(height, y))}`;
      })
      .join(' ');
  }, [rows]);

  return (
    <section className="bg-auto-secondary border border-auto rounded-xl p-5 lg:col-span-2">
      <h2 className="text-base font-bold text-auto-primary mb-4">Average Rating By Period</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-auto-tertiary">No period data for this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox="0 0 560 210" className="min-w-[560px] w-full h-56">
            {[1, 2, 3, 4, 5].map((rating) => {
              const y = 180 - ((rating - 1) / 4) * 160;
              return (
                <g key={rating}>
                  <line x1="36" x2="556" y1={y} y2={y} stroke="var(--color-border)" strokeWidth="1" />
                  <text x="4" y={y + 4} className="fill-current text-[10px] text-auto-tertiary">{rating}</text>
                </g>
              );
            })}
            <polyline points={points.split(' ').map((point) => {
              const [x, y] = point.split(',').map(Number);
              return `${x + 36},${y + 20}`;
            }).join(' ')} fill="none" stroke="var(--hotel-primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {rows.map((row, index) => {
              const width = 520;
              const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * width;
              const y = 160 - ((row.averageRating - 1) / 4) * 160;
              return (
                <g key={row.key}>
                  <circle cx={x + 36} cy={y + 20} r="4" fill="var(--hotel-primary)" />
                  <title>{`${row.label}: ${formatRating(row.averageRating)} (${row.count})`}</title>
                </g>
              );
            })}
            <text x="36" y="205" className="fill-current text-[10px] text-auto-tertiary">{rows[0]?.label}</text>
            <text x="556" y="205" textAnchor="end" className="fill-current text-[10px] text-auto-tertiary">{rows[rows.length - 1]?.label}</text>
          </svg>
        </div>
      )}
    </section>
  );
}

function Statistics() {
  const navigate = useNavigate();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [service, setService] = useState('all');
  const [room, setRoom] = useState('all');
  const [start, setStart] = useState(defaultStartDate());
  const [end, setEnd] = useState(toDateInput(new Date()));

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError('');
        const params = new URLSearchParams({ service, room, start, end });
        const response = await fetch(`${API_BASE}/stats/ratings?${params.toString()}`, {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Unable to load statistics');
        }

        setData(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [service, room, start, end]);

  return (
    <div className="min-h-screen bg-auto-primary">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-auto-secondary/90 border-b border-auto shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md text-white" style={{ backgroundColor: 'var(--hotel-primary)' }}>
                <BsBarChartLine className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-auto-primary">Statistics</h1>
                <p className="text-xs text-auto-tertiary">Detailed service rating reports</p>
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
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-auto-secondary mb-1.5">Service</label>
              <select value={service} onChange={(event) => setService(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary">
                <option value="all">All services</option>
                {data?.availableServices.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-auto-secondary mb-1.5">Room</label>
              <select value={room} onChange={(event) => setRoom(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary">
                <option value="all">All rooms</option>
                {data?.availableRooms.map((item) => <option key={item} value={item}>Room {item}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-auto-secondary mb-1.5">Start date</label>
              <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-auto-secondary mb-1.5">End date</label>
              <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary" />
            </div>
          </div>
        </section>

        {error && <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>}
        {loading && <div className="p-6 text-sm text-auto-secondary">Loading statistics...</div>}

        {data && !loading && (
          <>
            <section className="grid md:grid-cols-4 gap-4">
              <div className="bg-auto-secondary border border-auto rounded-xl p-5">
                <p className="text-xs text-auto-tertiary mb-1">Average Rating</p>
                <p className="text-3xl font-bold text-auto-primary">{formatRating(data.summary.averageRating)}</p>
              </div>
              <div className="bg-auto-secondary border border-auto rounded-xl p-5">
                <p className="text-xs text-auto-tertiary mb-1">Rated Requests</p>
                <p className="text-3xl font-bold text-auto-primary">{data.summary.totalRated}</p>
              </div>
              <div className="bg-auto-secondary border border-auto rounded-xl p-5">
                <p className="text-xs text-auto-tertiary mb-1">Top Service</p>
                <p className="text-lg font-bold text-auto-primary">{data.summary.highestRatedService?.label || '-'}</p>
                <p className="text-xs text-auto-secondary">{data.summary.highestRatedService ? formatRating(data.summary.highestRatedService.averageRating) : '0.00'} / 5</p>
              </div>
              <div className="bg-auto-secondary border border-auto rounded-xl p-5">
                <p className="text-xs text-auto-tertiary mb-1">Lowest Service</p>
                <p className="text-lg font-bold text-auto-primary">{data.summary.lowestRatedService?.label || '-'}</p>
                <p className="text-xs text-auto-secondary">{data.summary.lowestRatedService ? formatRating(data.summary.lowestRatedService.averageRating) : '0.00'} / 5</p>
              </div>
            </section>

            <section className="grid lg:grid-cols-2 gap-6">
              <BarChart title="Average By Service" rows={data.byService} color="var(--hotel-primary)" />
              <DistributionChart distribution={data.summary.distribution} />
              <BarChart title="Average By Room" rows={data.byRoom} color="var(--success)" />
              <PeriodLineChart rows={data.byPeriod} />
            </section>

            <section className="bg-auto-secondary border border-auto rounded-xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-base font-bold text-auto-primary">Recent Rated Requests</h2>
                <span className="text-xs text-auto-tertiary">{data.recentRatings.length} shown</span>
              </div>
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-auto">
                      <th className="text-left py-2 px-2 text-xs text-auto-secondary">Service</th>
                      <th className="text-left py-2 px-2 text-xs text-auto-secondary">Room</th>
                      <th className="text-left py-2 px-2 text-xs text-auto-secondary">Guest</th>
                      <th className="text-left py-2 px-2 text-xs text-auto-secondary">Message</th>
                      <th className="text-right py-2 px-2 text-xs text-auto-secondary">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRatings.map((item) => (
                      <tr key={item.requestId} className="border-b border-auto/50">
                        <td className="py-2 px-2 text-auto-primary font-semibold">{item.serviceLabel}</td>
                        <td className="py-2 px-2 text-auto-secondary">{item.roomNumber}</td>
                        <td className="py-2 px-2 text-auto-secondary">{item.guestName}</td>
                        <td className="py-2 px-2 text-auto-secondary max-w-[360px] truncate">{item.message}</td>
                        <td className="py-2 px-2 text-right text-amber-500 font-semibold">
                          <span className="inline-flex items-center justify-end gap-1">
                            {item.rating}
                            <BsStarFill className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    ))}
                    {data.recentRatings.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-auto-tertiary">No rated requests found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default Statistics;
