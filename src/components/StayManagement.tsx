import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BsCalendar3,
  BsDashLg,
  BsDownload,
  BsPencilSquare,
  BsPrinter,
  BsPlusLg,
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
const EditIcon = ({ className = 'w-4 h-4' }) => <BsPencilSquare className={className} />;
const CloseIcon = ({ className = 'w-5 h-5' }) => <BsXLg className={className} />;
const ArrowRightIcon = ({ className = 'w-4 h-4' }) => <BsArrowRight className={className} />;
const ArrowLeftIcon = ({ className = 'w-4 h-4' }) => <BsArrowLeft className={className} />;
const RotationIcon = ({ className = 'w-4 h-4' }) => <BsClockHistory className={className} />;
const PlusIcon = ({ className = 'w-4 h-4' }) => <BsPlusLg className={className} />;
const MinusIcon = ({ className = 'w-4 h-4' }) => <BsDashLg className={className} />;

interface Stay {
  stayId: string;
  roomNumber: string;
  guestName: string | null;
  additionalGuests?: string[];
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
  if (status === 'active') return 'Active';
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'cancelled') return 'Cancelled';
  return 'Ended';
}

function blocksRoomSchedule(stay: Stay) {
  const status = getStatus(stay);
  return status === 'scheduled' || status === 'active';
}

function normalizeGuestFields(guests: string[] = []) {
  return guests.length > 0 ? guests : [''];
}

function StayManagement() {
  const navigate = useNavigate();
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roomNumber, setRoomNumber] = useState('');
  const [guestName, setGuestName] = useState('');
  const [additionalGuests, setAdditionalGuests] = useState<string[]>(['']);
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
  const [editModal, setEditModal] = useState<{
    open: boolean;
    stay: Stay | null;
    roomNumber: string;
    guestName: string;
    additionalGuests: string[];
  }>({
    open: false,
    stay: null,
    roomNumber: '',
    guestName: '',
    additionalGuests: [''],
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
    confirmLabel: 'Confirm',
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
      confirmLabel: 'Confirm',
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
        throw new Error('Unable to load reservations');
      }

      const data = await response.json();
      setStays(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load reservations';
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

        const status = getStatus(stay);
        const hasConflict = blocksRoomSchedule(stay) && roomStays.some((otherStay) => {
          if (otherStay.stayId === stay.stayId) {
            return false;
          }

          if (!blocksRoomSchedule(otherStay)) {
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
          status,
        };
      });

      // Calcular tracks (filas) para evitar traslapos visuales
      const trackMap = new Map<string, number>();
      const barsWithTracks = bars.map((bar, index) => {
        let track = 0;
        for (let i = 0; i < index; i++) {
          const otherBar = bars[i];
          const stayStart = new Date(bar.stay.checkIn);
          const stayEnd = new Date(bar.stay.checkOut);
          const otherStart = new Date(otherBar.stay.checkIn);
          const otherEnd = new Date(otherBar.stay.checkOut);

          if (overlapsRange(stayStart, stayEnd, otherStart, otherEnd)) {
            const otherTrack = trackMap.get(otherBar.stay.stayId) ?? 0;
            if (otherTrack === track) {
              track += 1;
            }
          }
        }
        trackMap.set(bar.stay.stayId, track);
        return {
          ...bar,
          track,
        };
      });

      return {
        room,
        bars: barsWithTracks,
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
      showNotification('Room, check-in, and check-out are required', 'warning');
      return;
    }

    if (new Date(checkOut) <= new Date(checkIn)) {
      showNotification('Check-out must be after check-in', 'warning');
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
          additionalGuests: additionalGuests.map((guest) => guest.trim()).filter(Boolean),
          checkIn,
          checkOut,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to create the reservation');
      }

      const newStay = (await response.json()) as Stay;
      const status = getStatus(newStay);

      if (status === 'active') {
        const qrResponse = await fetch(`${API_BASE}/stays/${newStay.stayId}/qr`, {
          headers: getAuthHeaders(),
        });
        if (!qrResponse.ok) {
          throw new Error('Reservation created, but the QR could not be generated');
        }

        const qrData = await qrResponse.json();
        setCurrentQr({ stayId: newStay.stayId, qrCode: qrData.qrCode });
        setQrModalOpen(true);
        showNotification('Active stay created with QR', 'success');
      } else {
        showNotification('Reservation scheduled on calendar', 'success');
      }

      setRoomNumber('');
      setGuestName('');
      setAdditionalGuests(['']);
      setCheckIn(toLocalDateTimeInput(new Date()));
      setCheckOut(toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));

      await fetchStays();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create the reservation';
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
        throw new Error('Unable to process rotation');
      }

      const data = await response.json();
      showNotification(
        `Rotation applied: ${data.ended || 0} ended, ${data.activated || 0} activated`,
        'success'
      );
      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Error processing rotation', 'error');
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
        throw new Error('Unable to end the stay');
      }

      showNotification('Stay ended', 'success');
      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Unable to end the stay', 'error');
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
        throw new Error('Unable to delete the reservation');
      }

      showNotification('Reservation deleted', 'success');
      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Unable to delete the reservation', 'error');
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
        throw new Error(payload?.error || 'Unable to cancel the reservation');
      }

      const data = await response.json();
      const transitions = data?.transitions;

      if (transitions && (transitions.ended > 0 || transitions.activated > 0)) {
        showNotification(
          `Reservation cancelled. Rotation: ${transitions.ended || 0} ended and ${transitions.activated || 0} activated`,
          'success'
        );
      } else {
        showNotification('Reservation cancelled', 'success');
      }

      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Unable to cancel the reservation', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openExtendModal = (stay: Stay) => {
    const defaultNewDate = toLocalDateTimeInput(new Date(new Date(stay.checkOut).getTime() + 24 * 60 * 60 * 1000));
    setExtendModal({ open: true, stay, newCheckOut: defaultNewDate });
  };

  const openEditModal = (stay: Stay) => {
    setEditModal({
      open: true,
      stay,
      roomNumber: stay.roomNumber,
      guestName: stay.guestName || '',
      additionalGuests: normalizeGuestFields(stay.additionalGuests || []),
    });
  };

  const handleUpdateStay = async () => {
    if (!editModal.stay) {
      return;
    }

    if (!editModal.roomNumber.trim()) {
      showNotification('Room is required', 'warning');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stays/${editModal.stay.stayId}`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          roomNumber: editModal.roomNumber.trim(),
          guestName: editModal.guestName.trim() || null,
          additionalGuests: editModal.additionalGuests.map((guest) => guest.trim()).filter(Boolean),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to update the reservation');
      }

      setEditModal({
        open: false,
        stay: null,
        roomNumber: '',
        guestName: '',
        additionalGuests: [''],
      });
      showNotification('Reservation updated', 'success');
      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Unable to update the reservation', 'error');
    }
  };

  const handleExtendStay = async () => {
    if (!extendModal.stay || !extendModal.newCheckOut) {
      showNotification('Enter a new check-out date', 'warning');
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
        throw new Error(payload?.error || 'Unable to extend the reservation');
      }

      setExtendModal({ open: false, stay: null, newCheckOut: '' });
      showNotification('Reservation extended without conflicts', 'success');
      await fetchStays();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Unable to extend the reservation', 'error');
    }
  };

  const openQrModal = async (stayId: string) => {
    try {
      const response = await fetch(`${API_BASE}/stays/${stayId}/qr`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to generate the QR');
      }

      const qrData = await response.json();
      setCurrentQr({ stayId, qrCode: qrData.qrCode });
      setQrModalOpen(true);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Unable to generate the QR', 'error');
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
                title="Close notification"
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
                <h1 className="text-xl font-bold text-auto-primary">Stay Management</h1>
                <p className="text-xs text-auto-tertiary">Reservation calendar, automatic QR, and extensions</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/')}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-auto text-auto-secondary hover:bg-auto-tertiary flex items-center gap-2"
              >
                <ArrowLeftIcon />
                Back
              </button>
              <button
                onClick={handleProcessTransitions}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-white flex items-center gap-2 hover:opacity-90"
                style={{ backgroundColor: 'var(--hotel-primary)' }}
              >
                <RotationIcon />
                Process rotation
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
              <div className="flex items-center gap-2 mb-5 pb-4 border-b border-auto">
                <CalendarIcon className="text-auto-secondary" />
                <h2 className="text-base font-bold text-auto-primary">New Reservation</h2>
              </div>

              <form onSubmit={handleCreateStay} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-auto-secondary mb-1.5">Room</label>
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
                  <label className="block text-xs font-medium text-auto-secondary mb-1.5">Guest (optional)</label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Guest name"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="block text-xs font-medium text-auto-secondary">Additional guests (optional)</label>
                    <button
                      type="button"
                      onClick={() => setAdditionalGuests((prev) => [...prev, ''])}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600"
                    >
                      <span className="w-5 h-5 rounded-full border-2 border-blue-600 inline-flex items-center justify-center">
                        <PlusIcon className="w-3 h-3" />
                      </span>
                      Add guest
                    </button>
                  </div>
                  <div className="space-y-2">
                    {additionalGuests.map((guest, index) => (
                      <div key={`new-guest-${index}`} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={guest}
                          onChange={(e) =>
                            setAdditionalGuests((prev) =>
                              prev.map((item, itemIndex) => (itemIndex === index ? e.target.value : item))
                            )
                          }
                          placeholder={`Additional guest ${index + 1}`}
                          className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                          style={{
                            backgroundColor: 'var(--color-bg-tertiary)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text)',
                          }}
                        />
                        {additionalGuests.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setAdditionalGuests((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                            }
                            className="w-7 h-7 rounded-full border-2 border-red-600 text-red-600 inline-flex items-center justify-center shrink-0"
                            title="Remove additional guest"
                          >
                            <MinusIcon className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-auto-tertiary">
                    These names are stored on the stay record only. Communication keeps using the primary guest.
                  </p>
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
                  {loading ? 'Saving...' : 'Save reservation'}
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
                  <option value="all">All rooms</option>
                  {uniqueRooms.map((room) => (
                    <option key={room} value={room}>
                      Room {room}
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
                        {reservationsCount > 0 ? `${reservationsCount} reservation(s)` : 'Available'}
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
                <h3 className="text-base font-bold text-auto-primary">Timeline By Room</h3>
                <p className="text-xs text-auto-tertiary">
                  Monthly Gantt view to detect reservation conflicts
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
                  <span>Room</span>
                  <div className="flex justify-between">
                    <span>Start of month</span>
                    <span>Middle</span>
                    <span>End of month</span>
                  </div>
                </div>

                {timelineData.rows.map((row) => {
                  const maxTrack = Math.max(...row.bars.map((b) => b.track), 0);
                  const containerHeight = (maxTrack + 1) * 36;

                  return (
                    <div key={`timeline-${row.room}`} className="grid grid-cols-[120px_1fr] gap-3 items-start">
                      <div className="text-sm font-semibold text-auto-primary">Hab {row.room}</div>

                      <div className="relative rounded-lg border border-auto bg-auto-tertiary/25 overflow-hidden" style={{ height: `${containerHeight}px` }}>
                        <div className="absolute inset-y-0 left-1/2 w-px bg-auto-tertiary" />
                        {row.bars.map(({ stay, leftPct, widthPct, hasConflict, status, track }) => {
                          const canExtendFromTimeline = status === 'active' || status === 'scheduled';
                          const topOffset = track * 36 + 4;

                          return (
                            <button
                              key={`bar-${stay.stayId}`}
                              onClick={() => {
                                if (canExtendFromTimeline) {
                                  openExtendModal(stay);
                                }
                              }}
                              disabled={!canExtendFromTimeline}
                              className="absolute h-8 rounded-md px-2 text-[11px] font-semibold text-white truncate disabled:cursor-default"
                              style={{
                                top: `${topOffset}px`,
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: hasConflict
                                  ? '#ef4444'
                                  : status === 'active'
                                    ? '#059669'
                                    : status === 'scheduled'
                                      ? '#2563eb'
                                      : status === 'cancelled'
                                        ? '#f97316'
                                        : '#6b7280',
                                opacity: status === 'ended' || status === 'cancelled' ? 0.65 : 1,
                              }}
                            title={`${stay.guestName || 'No guest'} | ${statusLabel(status)} | ${formatDateTime(stay.checkIn)} - ${formatDateTime(stay.checkOut)}${
                              hasConflict ? ' | Conflict detected' : ''
                              }`}
                            >
                              {stay.guestName || stay.stayId.slice(0, 6)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {timelineData.rows.length === 0 && (
                  <p className="text-sm text-auto-tertiary py-4">No rooms to show in the timeline.</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 text-auto-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#2563eb]" /> Scheduled
              </span>
              <span className="inline-flex items-center gap-1 text-auto-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#059669]" /> Active
              </span>
              <span className="inline-flex items-center gap-1 text-auto-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#6b7280]" /> Ended
              </span>
              <span className="inline-flex items-center gap-1 text-auto-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#f97316] opacity-65" /> Cancelled
              </span>
              <span className="inline-flex items-center gap-1 text-auto-secondary">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" /> Conflict
              </span>
            </div>
          </div>

          <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
            <h3 className="text-base font-bold text-auto-primary mb-4">
              Reservations for {new Intl.DateTimeFormat('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(selectedDay)}
            </h3>

            {dayReservations.length === 0 ? (
              <p className="text-sm text-auto-tertiary">No reservations match the selected filter on this date.</p>
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
                          <p className="text-sm font-semibold text-auto-primary">Room {stay.roomNumber}</p>
                          <p className="text-xs text-auto-tertiary">{stay.guestName || 'No guest assigned'}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${statusBadge(status)}`}>
                          {statusLabel(status)}
                        </span>
                      </div>

                      <p className="text-xs text-auto-secondary mt-2">{formatDateTime(stay.checkIn)} - {formatDateTime(stay.checkOut)}</p>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(stay)}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-auto text-auto-secondary"
                          title="Edit reservation"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openExtendModal(stay)}
                          disabled={!canExtend}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-40"
                          style={{ backgroundColor: 'var(--hotel-primary)' }}
                          title="Extend reservation"
                        >
                          Extend
                        </button>
                        <button
                          onClick={() =>
                            openConfirmation({
                              title: 'Cancel reservation',
                              message: 'Are you sure you want to cancel this reservation?',
                              confirmLabel: 'Cancel reservation',
                              variant: 'warning',
                              onConfirm: () => handleCancelStay(stay.stayId),
                            })
                          }
                          disabled={!canCancel}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-auto text-auto-secondary disabled:opacity-40"
                          title="Cancel reservation"
                        >
                          Cancel
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
              <h3 className="text-base font-bold text-auto-primary">General List</h3>
              <span className="text-xs text-auto-tertiary">{stays.length} reservation(s)</span>
            </div>

            <div className="overflow-auto max-h-[460px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-auto">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-auto-secondary">Room</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-auto-secondary">Guest</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-auto-secondary">Period</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-auto-secondary">Status</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-auto-secondary">Actions</th>
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
                              title={canOpenQr ? 'View active QR' : 'QR available when activated'}
                            >
                              <QrCodeIcon className="w-4 h-4 text-auto-secondary" />
                            </button>

                            <button
                              onClick={() => openEditModal(stay)}
                              className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors"
                              title="Edit reservation"
                            >
                              <EditIcon className="w-4 h-4 text-auto-secondary" />
                            </button>

                            <button
                              onClick={() => openExtendModal(stay)}
                              disabled={!canExtend}
                              className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors disabled:opacity-40"
                              title="Extend reservation"
                            >
                              <ArrowRightIcon className="w-4 h-4 text-blue-500" />
                            </button>

                            <button
                              onClick={() =>
                                openConfirmation({
                                  title: 'Cancel reservation',
                                  message: 'Are you sure you want to cancel this reservation?',
                                  confirmLabel: 'Cancel reservation',
                                  variant: 'warning',
                                  onConfirm: () => handleCancelStay(stay.stayId),
                                })
                              }
                              disabled={!canCancel}
                              className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors disabled:opacity-40"
                              title="Cancel reservation"
                            >
                              <CloseIcon className="w-4 h-4 text-orange-500" />
                            </button>

                            {status === 'active' && (
                              <button
                                onClick={() =>
                                  openConfirmation({
                                    title: 'End stay',
                                    message: 'Are you sure you want to end this stay?',
                                    confirmLabel: 'End',
                                    variant: 'warning',
                                    onConfirm: () => handleEndStay(stay.stayId),
                                  })
                                }
                                className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors"
                                title="End stay"
                              >
                                <StopCircleIcon className="w-4 h-4 text-yellow-500" />
                              </button>
                            )}

                            <button
                              onClick={() =>
                                openConfirmation({
                                  title: 'Delete reservation',
                                  message: 'This action cannot be undone. Do you want to continue?',
                                  confirmLabel: 'Delete',
                                  variant: 'danger',
                                  onConfirm: () => handleDeleteStay(stay.stayId),
                                })
                              }
                              className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors"
                              title="Delete reservation"
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
              <h3 className="text-lg font-bold text-auto-primary">Extend Reservation</h3>
              <button
                onClick={() => setExtendModal({ open: false, stay: null, newCheckOut: '' })}
                className="p-1 rounded-lg hover:bg-auto-tertiary transition-colors"
              >
                <CloseIcon className="text-auto-secondary" />
              </button>
            </div>

            <p className="text-sm text-auto-secondary mb-3">
              Room {extendModal.stay.roomNumber} | current check-out: {formatDateTime(extendModal.stay.checkOut)}
            </p>

            <label className="block text-xs font-medium text-auto-secondary mb-1.5">New check-out date</label>
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
                Cancel
              </button>
              <button
                onClick={handleExtendStay}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--hotel-primary)' }}
              >
                Confirm extension
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal.open && editModal.stay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-auto-secondary rounded-xl shadow-xl border border-auto max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-auto-primary">Update Reservation</h3>
              <button
                onClick={() => setEditModal({ open: false, stay: null, roomNumber: '', guestName: '', additionalGuests: [''] })}
                className="p-1 rounded-lg hover:bg-auto-tertiary transition-colors"
              >
                <CloseIcon className="text-auto-secondary" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-auto-secondary mb-1.5">Room</label>
                <input
                  type="text"
                  value={editModal.roomNumber}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, roomNumber: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-auto-secondary mb-1.5">Primary guest</label>
                <input
                  type="text"
                  value={editModal.guestName}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, guestName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="block text-xs font-medium text-auto-secondary">Additional guests</label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditModal((prev) => ({ ...prev, additionalGuests: [...prev.additionalGuests, ''] }))
                    }
                    className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600"
                  >
                    <span className="w-5 h-5 rounded-full border-2 border-blue-600 inline-flex items-center justify-center">
                      <PlusIcon className="w-3 h-3" />
                    </span>
                    Add guest
                  </button>
                </div>
                <div className="space-y-2">
                  {editModal.additionalGuests.map((guest, index) => (
                    <div key={`edit-guest-${index}`} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={guest}
                        onChange={(e) =>
                          setEditModal((prev) => ({
                            ...prev,
                            additionalGuests: prev.additionalGuests.map((item, itemIndex) =>
                              itemIndex === index ? e.target.value : item
                            ),
                          }))
                        }
                        placeholder={`Additional guest ${index + 1}`}
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                        style={{
                          backgroundColor: 'var(--color-bg-tertiary)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)',
                        }}
                      />
                      {editModal.additionalGuests.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditModal((prev) => ({
                              ...prev,
                              additionalGuests: prev.additionalGuests.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                          className="w-7 h-7 rounded-full border-2 border-red-600 text-red-600 inline-flex items-center justify-center shrink-0"
                          title="Remove additional guest"
                        >
                          <MinusIcon className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-auto-tertiary">
                  This list is only visible in stay registration and update. Guest communication keeps using the primary guest.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditModal({ open: false, stay: null, roomNumber: '', guestName: '', additionalGuests: [''] })}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border"
                style={{ borderColor: 'var(--color-border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStay}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--hotel-primary)' }}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {qrModalOpen && currentQr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-auto-secondary rounded-xl shadow-xl border border-auto max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-auto-primary">Active Stay QR</h3>
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
                <PrinterIcon /> Print
              </button>
              <button
                onClick={handleDownloadQr}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--hotel-primary)' }}
              >
                <DownloadIcon /> Download
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
