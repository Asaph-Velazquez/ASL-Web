import { useEffect, useMemo, useState } from 'react';
import {
  BsCalendar3,
  BsDownload,
  BsPrinter,
  BsQrCode,
  BsStopCircle,
  BsTrash,
  BsXLg,
  BsArrowRight,
  BsArrowLeft,
  BsClockHistory,
} from 'react-icons/bs';
import ConfirmationModal from './modals/ConfirmationModal';

const QrCodeIcon = ({ className = 'w-6 h-6' }) => <BsQrCode className={className} />;
const CalendarIcon = ({ className = 'w-5 h-5' }) => <BsCalendar3 className={className} />;
const TrashIcon = ({ className = 'w-4 h-4' }) => <BsTrash className={className} />;
const StopCircleIcon = ({ className = 'w-4 h-4' }) => <BsStopCircle className={className} />;
const PrinterIcon = ({ className = 'w-4 h-4' }) => <BsPrinter className={className} />;
const DownloadIcon = ({ className = 'w-4 h-4' }) => <BsDownload className={className} />;
const CloseIcon = ({ className = 'w-5 h-5' }) => <BsXLg className={className} />;
const ArrowRightIcon = ({ className = 'w-4 h-4' }) => <BsArrowRight className={className} />;
const ArrowLeftIcon = ({ className = 'w-4 h-4' }) => <BsArrowLeft className={className} />;
const RotationIcon = ({ className = 'w-4 h-4' }) => <BsClockHistory className={className} />;

interface Stay {
  stayId: string;
  roomNumber: string;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  qrToken?: string;
  active: boolean;
  status?: 'scheduled' | 'active' | 'ended' | 'cancelled';
  createdAt: string;
}

interface NotificationState {
  open: boolean;
  message: string;
  type: 'success' | 'error' | 'warning';
}

interface ConfirmationState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'primary' | 'warning' | 'danger';
  onConfirm: (() => void | Promise<void>) | null;
}

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const WEEK_DAYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function getAuthHeaders(extra: Record<string, string> = {}) {
  const token = localStorage.getItem('staff_token');
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toLocalDateTimeInput(date = new Date()) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(date);
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function overlapsDay(stay: Stay, date: Date) {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  const checkIn = new Date(stay.checkIn);
  const checkOut = new Date(stay.checkOut);

  return checkIn <= dayEnd && checkOut >= dayStart;
}

function overlapsRange(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

function getStatus(stay: Stay) {
  if (stay.status) {
    return stay.status;
  }

  if (stay.active) {
    return 'active';
  }

  const now = new Date();
  const checkOut = new Date(stay.checkOut);
  return checkOut > now ? 'scheduled' : 'ended';
}

function statusBadge(status: 'scheduled' | 'active' | 'ended' | 'cancelled') {
  if (status === 'active') {
    return 'bg-emerald-500/15 text-emerald-600';
  }

  if (status === 'scheduled') {
    return 'bg-blue-500/15 text-blue-600';
  }

  if (status === 'cancelled') {
    return 'bg-rose-500/15 text-rose-600';
  }

  return 'bg-gray-500/15 text-gray-600';
}

function statusLabel(status: 'scheduled' | 'active' | 'ended' | 'cancelled') {
  if (status === 'active') return 'Activa';
  if (status === 'scheduled') return 'Programada';
  if (status === 'cancelled') return 'Cancelada';
  return 'Finalizada';
}

function StayManagement() {
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roomNumber, setRoomNumber] = useState('');
  const [guestName, setGuestName] = useState('');
  const [checkIn, setCheckIn] = useState(toLocalDateTimeInput(new Date()));
  const [checkOut, setCheckOut] = useState(toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));

  const [monthCursor, setMonthCursor] = useState(new Date());
  const [selectedRoomFilter, setSelectedRoomFilter] = useState('all');
  const [selectedDay, setSelectedDay] = useState(new Date());

  const [extendModal, setExtendModal] = useState<{ open: boolean; stay: Stay | null; newCheckOut: string }>({
    open: false,
    stay: null,
    newCheckOut: '',
  });

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [currentQr, setCurrentQr] = useState<{ stayId: string; qrCode: string } | null>(null);

  const [notification, setNotification] = useState<NotificationState>({
    open: false,
    message: '',
    type: 'success',
  });
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    variant: 'primary',
    onConfirm: null,
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const showNotification = (message: string, type: NotificationState['type']) => {
    setNotification({ open: true, message, type });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, open: false }));
    }, 3200);
  };

  const openConfirmation = ({
    title,
    message,
    confirmLabel,
    variant,
    onConfirm,
  }: Omit<ConfirmationState, 'open'>) => {
    setConfirmation({
      open: true,
      title,
      message,
      confirmLabel,
      variant,
      onConfirm,
    });
  };

  const closeConfirmation = () => {
    if (confirmLoading) return;
    setConfirmation({
      open: false,
      title: '',
      message: '',
      confirmLabel: 'Confirmar',
      variant: 'primary',
      onConfirm: null,
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmation.onConfirm) return;

    try {
      setConfirmLoading(true);
      await confirmation.onConfirm();
      closeConfirmation();
    } finally {
      setConfirmLoading(false);
    }
  };

  const fetchStays = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/stays`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error('No se pudieron cargar las reservaciones');
      }

      const data = await response.json();
      setStays(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar las reservaciones';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStays();
  }, []);

  const uniqueRooms = useMemo(() => {
    const rooms = new Set(stays.map((stay) => stay.roomNumber));
    return Array.from(rooms).sort((a, b) => a.localeCompare(b, 'es-ES', { numeric: true }));
  }, [stays]);

  const filteredStays = useMemo(() => {
    if (selectedRoomFilter === 'all') {
      return stays;
    }

    return stays.filter((stay) => stay.roomNumber === selectedRoomFilter);
  }, [selectedRoomFilter, stays]);

  const monthDates = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();

    const days: Array<Date | null> = [];

    for (let i = 0; i < startPadding; i += 1) {
      days.push(null);
    }

    for (let d = 1; d <= lastDay.getDate(); d += 1) {
      days.push(new Date(year, month, d));
    }

    while (days.length % 7 !== 0) {
      days.push(null);
    }

    return days;
  }, [monthCursor]);

  const dayReservations = useMemo(() => {
    return filteredStays
      .filter((stay) => overlapsDay(stay, selectedDay))
      .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());
  }, [filteredStays, selectedDay]);

  const timelineData = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const monthDuration = monthEnd.getTime() - monthStart.getTime() + 1;

    const rooms = selectedRoomFilter === 'all' ? uniqueRooms : [selectedRoomFilter];

    const rows = rooms.map((room) => {
      const roomStays = stays
        .filter((stay) => stay.roomNumber === room)
        .filter((stay) => {
          const checkIn = new Date(stay.checkIn);
          const checkOut = new Date(stay.checkOut);
          return overlapsRange(checkIn, checkOut, monthStart, monthEnd);
        })
        .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());

      const bars = roomStays.map((stay) => {
        const checkIn = new Date(stay.checkIn);
        const checkOut = new Date(stay.checkOut);
        const clippedStart = checkIn < monthStart ? monthStart : checkIn;
        const clippedEnd = checkOut > monthEnd ? monthEnd : checkOut;

        const startOffset = clippedStart.getTime() - monthStart.getTime();
        const duration = Math.max(clippedEnd.getTime() - clippedStart.getTime(), 1);

        const leftPct = (startOffset / monthDuration) * 100;
        const widthPct = Math.max((duration / monthDuration) * 100, 1.8);

        const hasConflict = roomStays.some((otherStay) => {
          if (otherStay.stayId === stay.stayId) {
            return false;
          }

          return overlapsRange(
            new Date(stay.checkIn),
            new Date(stay.checkOut),
            new Date(otherStay.checkIn),
            new Date(otherStay.checkOut)
          );
        });

        return {
          stay,
          leftPct,
          widthPct,
          hasConflict,
          status: getStatus(stay),
        };
      });

      return {
        room,
        bars,
      };
    });

    return {
      rows,
      monthStart,
      monthEnd,
    };
  }, [monthCursor, selectedRoomFilter, stays, uniqueRooms]);

  const handleCreateStay = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!roomNumber.trim() || !checkIn || !checkOut) {
      showNotification('Habitacion, check-in y check-out son obligatorios', 'warning');
      return;
    }

    if (new Date(checkOut) <= new Date(checkIn)) {
      showNotification('La salida debe ser posterior al check-in', 'warning');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/stays`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          roomNumber: roomNumber.trim(),
          guestName: guestName.trim() || null,
          checkIn,
          checkOut,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'No se pudo crear la reservacion');
      }

      const newStay = (await response.json()) as Stay;
      const status = getStatus(newStay);

      if (status === 'active') {
        const qrResponse = await fetch(`${API_BASE}/stays/${newStay.stayId}/qr`, {
          headers: getAuthHeaders(),
        });
        if (!qrResponse.ok) {
          throw new Error('Reservacion creada, pero no se pudo generar el QR');
        }

        const qrData = await qrResponse.json();
        setCurrentQr({ stayId: newStay.stayId, qrCode: qrData.qrCode });
        setQrModalOpen(true);
        showNotification('Estancia activa creada con QR', 'success');
      } else {
        showNotification('Reservacion agendada en calendario', 'success');
      }

      setRoomNumber('');
      setGuestName('');
      setCheckIn(toLocalDateTimeInput(new Date()));
      setCheckOut(toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));

      await fetchStays();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear la reservacion';
      showNotification(message, 'error');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessTransitions = async () => {
    try {
      const response = await fetch(`${API_BASE}/stays/process-transitions`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('No se pudo procesar la rotacion');
      }

      const data = await response.json();
      showNotification(
        `Rotacion aplicada: ${data.ended || 0} finalizadas, ${data.activated || 0} activadas`,
        'success'
      );
      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Error al procesar rotacion', 'error');
    }
  };

  const handleEndStay = async (stayId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/stays/${stayId}/end`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('No se pudo finalizar la estancia');
      }

      showNotification('Estancia finalizada', 'success');
      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'No se pudo finalizar la estancia', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStay = async (stayId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/stays/${stayId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('No se pudo eliminar la reservacion');
      }

      showNotification('Reservacion eliminada', 'success');
      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'No se pudo eliminar la reservacion', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelStay = async (stayId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/stays/${stayId}/cancel`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'No se pudo cancelar la reservacion');
      }

      const data = await response.json();
      const transitions = data?.transitions;

      if (transitions && (transitions.ended > 0 || transitions.activated > 0)) {
        showNotification(
          `Reservacion cancelada. Rotacion: ${transitions.ended || 0} finalizadas y ${transitions.activated || 0} activadas`,
          'success'
        );
      } else {
        showNotification('Reservacion cancelada', 'success');
      }

      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'No se pudo cancelar la reservacion', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openExtendModal = (stay: Stay) => {
    const defaultNewDate = toLocalDateTimeInput(new Date(new Date(stay.checkOut).getTime() + 24 * 60 * 60 * 1000));
    setExtendModal({ open: true, stay, newCheckOut: defaultNewDate });
  };

  const handleExtendStay = async () => {
    if (!extendModal.stay || !extendModal.newCheckOut) {
      showNotification('Indica una nueva fecha de salida', 'warning');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stays/${extendModal.stay.stayId}/extend`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ newCheckOut: extendModal.newCheckOut }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'No se pudo extender la reservacion');
      }

      setExtendModal({ open: false, stay: null, newCheckOut: '' });
      showNotification('Reserva extendida sin conflictos', 'success');
      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'No se pudo extender la reservacion', 'error');
    }
  };

  const openQrModal = async (stayId: string) => {
    try {
      const response = await fetch(`${API_BASE}/stays/${stayId}/qr`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'No se pudo generar el QR');
      }

      const qrData = await response.json();
      setCurrentQr({ stayId, qrCode: qrData.qrCode });
      setQrModalOpen(true);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'No se pudo generar el QR', 'error');
    }
  };

  const handlePrintQr = () => {
    window.print();
  };

  const handleDownloadQr = () => {
    if (!currentQr) return;

    const link = document.createElement('a');
    link.href = currentQr.qrCode;
    link.download = `stay-qr-${currentQr.stayId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {notification.open && (
        <div className="fixed top-4 right-4 z-[70] max-w-sm w-[calc(100%-2rem)] sm:w-auto">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm ${
              notification.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-800'
                : notification.type === 'error'
                  ? 'bg-red-50/95 border-red-200 text-red-800'
                  : 'bg-amber-50/95 border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-sm leading-5 font-medium">{notification.message}</span>
              <button
                onClick={() => setNotification((prev) => ({ ...prev, open: false }))}
                className="ml-auto text-current/70 hover:text-current transition-colors"
                title="Cerrar notificacion"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="border-b" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--hotel-primary)' }}>
                <QrCodeIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-auto-primary">Administracion de Estancias</h1>
                <p className="text-xs text-auto-tertiary">Calendario de reservaciones, QR automatico y extensiones</p>
              </div>
            </div>

            <button
              onClick={handleProcessTransitions}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-white flex items-center gap-2 hover:opacity-90"
              style={{ backgroundColor: 'var(--hotel-primary)' }}
            >
              <RotationIcon />
              Procesar rotacion
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
              <div className="flex items-center gap-2 mb-5 pb-4 border-b border-auto">
                <CalendarIcon className="text-auto-secondary" />
                <h2 className="text-base font-bold text-auto-primary">Nueva Reservacion</h2>
              </div>

              <form onSubmit={handleCreateStay} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-auto-secondary mb-1.5">Habitacion</label>
                  <input
                    type="text"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="101"
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-auto-secondary mb-1.5">Huesped (opcional)</label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Nombre del huesped"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-auto-secondary mb-1.5">Check-in</label>
                  <input
                    type="datetime-local"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-auto-secondary mb-1.5">Check-out</label>
                  <input
                    type="datetime-local"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>

                {error && (
                  <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                    <p className="text-xs text-red-500">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--hotel-primary)' }}
                >
                  {loading ? 'Guardando...' : 'Guardar reservacion'}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
              <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-auto flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    className="p-2 rounded-lg hover:bg-auto-tertiary"
                  >
                    <ArrowLeftIcon className="text-auto-secondary" />
                  </button>
                  <h2 className="text-lg font-bold text-auto-primary capitalize">{monthLabel(monthCursor)}</h2>
                  <button
                    onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    className="p-2 rounded-lg hover:bg-auto-tertiary"
                  >
                    <ArrowRightIcon className="text-auto-secondary" />
                  </button>
                </div>

                <select
                  value={selectedRoomFilter}
                  onChange={(e) => setSelectedRoomFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                >
                  <option value="all">Todas las habitaciones</option>
                  {uniqueRooms.map((room) => (
                    <option key={room} value={room}>
                      Habitacion {room}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs text-auto-tertiary mb-2">
                {WEEK_DAYS.map((day) => (
                  <div key={day} className="py-1 font-semibold">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {monthDates.map((day, index) => {
                  if (!day) {
                    return <div key={`blank-${index}`} className="h-20 rounded-lg bg-auto-tertiary/20" />;
                  }

                  const key = dayKey(day);
                  const selectedKey = dayKey(selectedDay);
                  const reservationsCount = filteredStays.filter((stay) => overlapsDay(stay, day)).length;

                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(day)}
                      className={`h-20 rounded-lg border text-left p-2 transition-colors ${
                        selectedKey === key ? 'ring-2' : ''
                      }`}
                      style={{
                        borderColor: 'var(--color-border)',
                        backgroundColor: selectedKey === key ? 'var(--color-bg-tertiary)' : 'transparent',
                        boxShadow: selectedKey === key ? '0 0 0 2px var(--hotel-primary)' : 'none',
                      }}
                    >
                      <div className="text-xs font-semibold text-auto-primary">{day.getDate()}</div>
                      <div className="mt-2 text-[11px] text-auto-tertiary">
                        {reservationsCount > 0 ? `${reservationsCount} reserva(s)` : 'Libre'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="lg:col-span-2 bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div>
                <h3 className="text-base font-bold text-auto-primary">Timeline Por Habitacion</h3>
                <p className="text-xs text-auto-tertiary">
                  Vista mensual tipo Gantt para detectar conflictos de reservaciones
                </p>
              </div>
              <div className="text-xs text-auto-tertiary">
                {new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' }).format(timelineData.monthStart)} -{' '}
                {new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' }).format(timelineData.monthEnd)}
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[860px] space-y-3">
                <div className="grid grid-cols-[120px_1fr] gap-3 text-[11px] text-auto-tertiary font-semibold px-1">
                  <span>Habitacion</span>
                  <div className="flex justify-between">
                    <span>Inicio de mes</span>
                    <span>Mitad</span>
                    <span>Fin de mes</span>
                  </div>
                </div>

                {timelineData.rows.map((row) => (
                  <div key={`timeline-${row.room}`} className="grid grid-cols-[120px_1fr] gap-3 items-center">
                    <div className="text-sm font-semibold text-auto-primary">Hab {row.room}</div>

                    <div className="relative h-12 rounded-lg border border-auto bg-auto-tertiary/25 overflow-hidden">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-auto-tertiary" />
                      {row.bars.map(({ stay, leftPct, widthPct, hasConflict, status }) => (
                        <button
                          key={`bar-${stay.stayId}`}
                          onClick={() => openExtendModal(stay)}
                          className="absolute top-1/2 -translate-y-1/2 h-8 rounded-md px-2 text-[11px] font-semibold text-white truncate"
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            backgroundColor: hasConflict
                              ? '#ef4444'
                              : status === 'active'
                                ? '#059669'
                                : status === 'scheduled'
                                  ? '#2563eb'
                                  : '#6b7280',
                            opacity: status === 'ended' ? 0.65 : 1,
                          }}
                          title={`${stay.guestName || 'Sin huesped'} | ${formatDateTime(stay.checkIn)} - ${formatDateTime(stay.checkOut)}${
                            hasConflict ? ' | Conflicto detectado' : ''
                          }`}
                        >
                          {stay.guestName || stay.stayId.slice(0, 6)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {timelineData.rows.length === 0 && (
                  <p className="text-sm text-auto-tertiary py-4">No hay habitaciones para mostrar en el timeline.</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 text-auto-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#2563eb]" /> Programada
              </span>
              <span className="inline-flex items-center gap-1 text-auto-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#059669]" /> Activa
              </span>
              <span className="inline-flex items-center gap-1 text-auto-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#6b7280]" /> Finalizada
              </span>
              <span className="inline-flex items-center gap-1 text-auto-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" /> Conflicto
              </span>
            </div>
          </div>

          <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
            <h3 className="text-base font-bold text-auto-primary mb-4">
              Reservas del dia {new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(selectedDay)}
            </h3>

            {dayReservations.length === 0 ? (
              <p className="text-sm text-auto-tertiary">No hay reservas para el filtro seleccionado en esta fecha.</p>
            ) : (
              <div className="space-y-3">
                {dayReservations.map((stay) => {
                  const status = getStatus(stay);
                  const canExtend = status === 'active' || status === 'scheduled';
                  const canCancel = status === 'active' || status === 'scheduled';
                  return (
                    <div key={stay.stayId} className="rounded-lg border border-auto p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-auto-primary">Habitacion {stay.roomNumber}</p>
                          <p className="text-xs text-auto-tertiary">{stay.guestName || 'Sin huesped asignado'}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${statusBadge(status)}`}>
                          {statusLabel(status)}
                        </span>
                      </div>

                      <p className="text-xs text-auto-secondary mt-2">{formatDateTime(stay.checkIn)} - {formatDateTime(stay.checkOut)}</p>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => openExtendModal(stay)}
                          disabled={!canExtend}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-40"
                          style={{ backgroundColor: 'var(--hotel-primary)' }}
                          title="Extender reservacion"
                        >
                          Extender
                        </button>
                        <button
                          onClick={() =>
                            openConfirmation({
                              title: 'Cancelar reservacion',
                              message: 'Seguro que deseas cancelar esta reservacion?',
                              confirmLabel: 'Cancelar reservacion',
                              variant: 'warning',
                              onConfirm: () => handleCancelStay(stay.stayId),
                            })
                          }
                          disabled={!canCancel}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-auto text-auto-secondary disabled:opacity-40"
                          title="Cancelar reservacion"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-auto-primary">Listado General</h3>
              <span className="text-xs text-auto-tertiary">{stays.length} reservacion(es)</span>
            </div>

            <div className="overflow-auto max-h-[460px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-auto">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-auto-secondary">Hab</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-auto-secondary">Huesped</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-auto-secondary">Periodo</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-auto-secondary">Estado</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-auto-secondary">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStays.map((stay) => {
                    const status = getStatus(stay);
                    const canExtend = status === 'active' || status === 'scheduled';
                    const canCancel = status === 'active' || status === 'scheduled';
                    const canOpenQr = status === 'active';

                    return (
                      <tr key={stay.stayId} className="border-b border-auto/50">
                        <td className="py-2 px-2 text-auto-primary font-semibold">{stay.roomNumber}</td>
                        <td className="py-2 px-2 text-auto-secondary">{stay.guestName || '-'}</td>
                        <td className="py-2 px-2 text-xs text-auto-secondary">
                          <div>{formatDateTime(stay.checkIn)}</div>
                          <div>{formatDateTime(stay.checkOut)}</div>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-1 rounded-md text-[11px] font-semibold ${statusBadge(status)}`}>
                            {statusLabel(status)}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openQrModal(stay.stayId)}
                              disabled={!canOpenQr}
                              className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors disabled:opacity-40"
                              title={canOpenQr ? 'Ver QR activo' : 'QR disponible al activarse'}
                            >
                              <QrCodeIcon className="w-4 h-4 text-auto-secondary" />
                            </button>

                            <button
                              onClick={() => openExtendModal(stay)}
                              disabled={!canExtend}
                              className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors disabled:opacity-40"
                              title="Extender reservacion"
                            >
                              <ArrowRightIcon className="w-4 h-4 text-blue-500" />
                            </button>

                            <button
                              onClick={() =>
                                openConfirmation({
                                  title: 'Cancelar reservacion',
                                  message: 'Seguro que deseas cancelar esta reservacion?',
                                  confirmLabel: 'Cancelar reservacion',
                                  variant: 'warning',
                                  onConfirm: () => handleCancelStay(stay.stayId),
                                })
                              }
                              disabled={!canCancel}
                              className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors disabled:opacity-40"
                              title="Cancelar reservacion"
                            >
                              <CloseIcon className="w-4 h-4 text-orange-500" />
                            </button>

                            {status === 'active' && (
                              <button
                                onClick={() =>
                                  openConfirmation({
                                    title: 'Finalizar estancia',
                                    message: 'Seguro que deseas finalizar esta estancia?',
                                    confirmLabel: 'Finalizar',
                                    variant: 'warning',
                                    onConfirm: () => handleEndStay(stay.stayId),
                                  })
                                }
                                className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors"
                                title="Finalizar estancia"
                              >
                                <StopCircleIcon className="w-4 h-4 text-yellow-500" />
                              </button>
                            )}

                            <button
                              onClick={() =>
                                openConfirmation({
                                  title: 'Eliminar reservacion',
                                  message: 'Esta accion no se puede deshacer. Deseas continuar?',
                                  confirmLabel: 'Eliminar',
                                  variant: 'danger',
                                  onConfirm: () => handleDeleteStay(stay.stayId),
                                })
                              }
                              className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors"
                              title="Eliminar reservacion"
                            >
                              <TrashIcon className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {extendModal.open && extendModal.stay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-auto-secondary rounded-xl shadow-xl border border-auto max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-auto-primary">Extender Reservacion</h3>
              <button
                onClick={() => setExtendModal({ open: false, stay: null, newCheckOut: '' })}
                className="p-1 rounded-lg hover:bg-auto-tertiary transition-colors"
              >
                <CloseIcon className="text-auto-secondary" />
              </button>
            </div>

            <p className="text-sm text-auto-secondary mb-3">
              Habitacion {extendModal.stay.roomNumber} | salida actual: {formatDateTime(extendModal.stay.checkOut)}
            </p>

            <label className="block text-xs font-medium text-auto-secondary mb-1.5">Nueva fecha de salida</label>
            <input
              type="datetime-local"
              value={extendModal.newCheckOut}
              onChange={(e) => setExtendModal((prev) => ({ ...prev, newCheckOut: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setExtendModal({ open: false, stay: null, newCheckOut: '' })}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleExtendStay}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--hotel-primary)' }}
              >
                Confirmar extension
              </button>
            </div>
          </div>
        </div>
      )}

      {qrModalOpen && currentQr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-auto-secondary rounded-xl shadow-xl border border-auto max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-auto-primary">QR de Estancia Activa</h3>
              <button
                onClick={() => setQrModalOpen(false)}
                className="p-1 rounded-lg hover:bg-auto-tertiary transition-colors"
              >
                <CloseIcon className="text-auto-secondary" />
              </button>
            </div>

            <div className="bg-white rounded-lg p-6 mb-4 flex items-center justify-center">
              <img src={currentQr.qrCode} alt="Stay QR Code" className="w-64 h-64" />
            </div>

            <p className="text-xs text-auto-tertiary mb-4 text-center">Stay ID: {currentQr.stayId}</p>

            <div className="flex gap-3">
              <button
                onClick={handlePrintQr}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 border"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                <PrinterIcon /> Imprimir
              </button>
              <button
                onClick={handleDownloadQr}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--hotel-primary)' }}
              >
                <DownloadIcon /> Descargar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={confirmation.open}
        title={confirmation.title}
        message={confirmation.message}
        confirmLabel={confirmation.confirmLabel}
        variant={confirmation.variant}
        loading={confirmLoading}
        onCancel={closeConfirmation}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}

export default StayManagement;
