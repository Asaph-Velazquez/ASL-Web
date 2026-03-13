import { useState, useEffect } from "react";
import {
  BsCalendar3,
  BsDownload,
  BsPrinter,
  BsQrCode,
  BsStopCircle,
  BsTrash,
  BsXLg,
} from "react-icons/bs";

// Componentes de iconos
const QrCodeIcon = ({ className = "w-6 h-6" }) => <BsQrCode className={className} />;

const CalendarIcon = ({ className = "w-5 h-5" }) => <BsCalendar3 className={className} />;

const TrashIcon = ({ className = "w-4 h-4" }) => <BsTrash className={className} />;

const StopCircleIcon = ({ className = "w-4 h-4" }) => <BsStopCircle className={className} />;

const PrinterIcon = ({ className = "w-4 h-4" }) => <BsPrinter className={className} />;

const DownloadIcon = ({ className = "w-4 h-4" }) => <BsDownload className={className} />;

const CloseIcon = ({ className = "w-5 h-5" }) => <BsXLg className={className} />;

// Tipos
interface Stay {
  stayId: string;
  roomNumber: string;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  qrToken: string;
  active: boolean;
  createdAt: string;
}

function StayManagement() {
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomNumber, setRoomNumber] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [currentQr, setCurrentQr] = useState<{ stayId: string; qrCode: string } | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

  // Obtener todas las estancias
  const fetchStays = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/stays`);
      if (!response.ok) throw new Error("Failed to fetch stays");
      const data = await response.json();
      setStays(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stays");
    } finally {
      setLoading(false);
    }
  };

  // Carga inicial
  useEffect(() => {
    fetchStays();
  }, []);

  // Crear nueva estancia
  const handleCreateStay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomNumber || !checkIn || !checkOut) {
      setError("All fields are required");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/stays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomNumber, checkIn, checkOut }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create stay");
      }

      const newStay = await response.json();
      
      // Obtener el codigo QR de la nueva estancia
      const qrResponse = await fetch(`${API_BASE}/stays/${newStay.stayId}/qr`);
      if (!qrResponse.ok) throw new Error("Failed to generate QR code");
      const qrData = await qrResponse.json();

      // Mostrar modal del QR
      setCurrentQr({ stayId: newStay.stayId, qrCode: qrData.qrCode });
      setQrModalOpen(true);

      // Reiniciar formulario
      setRoomNumber("");
      setCheckIn("");
      setCheckOut("");

      // Refrescar lista de estancias
      await fetchStays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create stay");
    } finally {
      setLoading(false);
    }
  };

  // Finalizar estancia
  const handleEndStay = async (stayId: string) => {
    if (!confirm("Are you sure you want to end this stay?")) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/stays/${stayId}/end`, {
        method: "PATCH",
      });

      if (!response.ok) throw new Error("Failed to end stay");
      await fetchStays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end stay");
    } finally {
      setLoading(false);
    }
  };

  // Eliminar estancia
  const handleDeleteStay = async (stayId: string) => {
    if (!confirm("Are you sure you want to delete this stay?")) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/stays/${stayId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete stay");
      await fetchStays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete stay");
    } finally {
      setLoading(false);
    }
  };

  // Imprimir QR
  const handlePrintQr = () => {
    window.print();
  };

  // Descargar QR
  const handleDownloadQr = () => {
    if (!currentQr) return;
    const link = document.createElement("a");
    link.href = currentQr.qrCode;
    link.download = `stay-qr-${currentQr.stayId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Formatear fecha para mostrar
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}>
      {/* Encabezado */}
      <header className="border-b" style={{ backgroundColor: "var(--color-bg-secondary)", borderColor: "var(--color-border)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: "var(--hotel-primary)" }}>
              <QrCodeIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-auto-primary">Stay Management</h1>
              <p className="text-xs text-auto-tertiary">Manage guest stays and generate QR codes</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Formulario de nueva estancia */}
          <div className="lg:col-span-1">
            <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
              <div className="flex items-center gap-2 mb-5 pb-4 border-b border-auto">
                <CalendarIcon className="text-auto-secondary" />
                <h2 className="text-base font-bold text-auto-primary">Create New Stay</h2>
              </div>

              <form onSubmit={handleCreateStay} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-auto-secondary mb-1.5">
                    Room Number
                  </label>
                  <input
                    type="text"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="101"
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-auto-secondary mb-1.5">
                    Check-in Date
                  </label>
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-auto-secondary mb-1.5">
                    Check-out Date
                  </label>
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
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
                  style={{ backgroundColor: "var(--hotel-primary)" }}
                >
                  {loading ? "Creating..." : "Create Stay"}
                </button>
              </form>
            </div>
          </div>

          {/* Lista de estancias activas */}
          <div className="lg:col-span-2">
            <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6">
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-auto">
                <div>
                  <h2 className="text-lg font-bold text-auto-primary">Active Stays</h2>
                  <p className="text-xs text-auto-tertiary">{stays.length} total stays</p>
                </div>
              </div>

              {loading && stays.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-auto-tertiary">Loading stays...</p>
                </div>
              ) : stays.length === 0 ? (
                <div className="text-center py-12">
                  <QrCodeIcon className="w-16 h-16 mx-auto mb-3 opacity-30 text-auto-tertiary" />
                  <p className="text-sm text-auto-tertiary">No stays created yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-auto">
                        <th className="text-left py-3 px-2 font-semibold text-auto-secondary">Room</th>
                        <th className="text-left py-3 px-2 font-semibold text-auto-secondary">Guest Name</th>
                        <th className="text-left py-3 px-2 font-semibold text-auto-secondary">Check-in</th>
                        <th className="text-left py-3 px-2 font-semibold text-auto-secondary">Check-out</th>
                        <th className="text-left py-3 px-2 font-semibold text-auto-secondary">Status</th>
                        <th className="text-right py-3 px-2 font-semibold text-auto-secondary">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stays.map((stay) => (
                        <tr key={stay.stayId} className="border-b border-auto/50 hover:bg-auto-tertiary/30 transition-colors">
                          <td className="py-3 px-2">
                            <span className="font-medium text-auto-primary">{stay.roomNumber}</span>
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-auto-secondary">{stay.guestName || "—"}</span>
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-auto-secondary">{formatDate(stay.checkIn)}</span>
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-auto-secondary">{formatDate(stay.checkOut)}</span>
                          </td>
                          <td className="py-3 px-2">
                            <span
                              className={`px-2 py-1 rounded-md text-xs font-medium ${
                                stay.active
                                  ? "bg-green-500/20 text-green-500"
                                  : "bg-gray-500/20 text-gray-500"
                              }`}
                            >
                              {stay.active ? "Active" : "Ended"}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={async () => {
                                  const qrResponse = await fetch(`${API_BASE}/stays/${stay.stayId}/qr`);
                                  const qrData = await qrResponse.json();
                                  setCurrentQr({ stayId: stay.stayId, qrCode: qrData.qrCode });
                                  setQrModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors"
                                title="View QR Code"
                              >
                                <QrCodeIcon className="w-4 h-4 text-auto-secondary" />
                              </button>
                              {stay.active && (
                                <button
                                  onClick={() => handleEndStay(stay.stayId)}
                                  className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors"
                                  title="End Stay"
                                >
                                  <StopCircleIcon className="w-4 h-4 text-yellow-500" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteStay(stay.stayId)}
                                className="p-1.5 rounded-lg hover:bg-auto-tertiary transition-colors"
                                title="Delete Stay"
                              >
                                <TrashIcon className="w-4 h-4 text-red-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de codigo QR */}
      {qrModalOpen && currentQr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-auto-secondary rounded-xl shadow-xl border border-auto max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-auto-primary">Stay QR Code</h3>
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

            <p className="text-xs text-auto-tertiary mb-4 text-center">
              Stay ID: {currentQr.stayId}
            </p>

            <div className="flex gap-3">
              <button
                onClick={handlePrintQr}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 border"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <PrinterIcon /> Print
              </button>
              <button
                onClick={handleDownloadQr}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                style={{ backgroundColor: "var(--hotel-primary)" }}
              >
                <DownloadIcon /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StayManagement;
