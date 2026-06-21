import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../hooks/useWebSocket";
import {
  BsArrowLeft,
  BsArrowRepeat,
  BsBoxArrowRight,
  BsBuildingsFill,
  BsBarChartLine,
  BsChatDots,
  BsCheckCircle,
  BsCheckLg,
  BsClock,
  BsFilter,
  BsHourglassSplit,
  BsInbox,
  BsJournalText,
  BsPersonBadge,
  BsQrCode,
  BsSearch,
  BsStar,
  BsStarFill,
  BsXLg,
  BsXCircle,
} from "react-icons/bs";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import LocalTaxiRoundedIcon from "@mui/icons-material/LocalTaxiRounded";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import ConfirmationModal from "./modals/ConfirmationModal";
import TransportResponseModal from "./modals/TransportResponseModal";
import type { TransportResponseFormValue } from "./modals/TransportResponseModal";

// Componentes de iconos Bootstrap
const HotelIcon = () => <BsBuildingsFill className="w-10 h-10 text-white" />;
const InboxIcon = ({ className = "w-6 h-6" }) => <BsInbox className={className} />;
const BellIcon = ({ className = "w-5 h-5" }) => <LocalTaxiRoundedIcon className={className} />;
const FoodIcon = ({ className = "w-5 h-5" }) => <RestaurantRoundedIcon className={className} />;
const WarningIcon = ({ className = "w-5 h-5" }) => <ReportProblemRoundedIcon className={className} />;
const SparklesIcon = ({ className = "w-5 h-5" }) => <AutoAwesomeRoundedIcon className={className} />;
const ClockIcon = ({ className = "w-4 h-4" }) => <BsClock className={className} />;
const ChatIcon = ({ className = "w-4 h-4" }) => <BsChatDots className={className} />;
const HourglassIcon = ({ className = "w-12 h-12" }) => <BsHourglassSplit className={className} />;
const ArrowRepeatIcon = ({ className = "w-12 h-12" }) => <BsArrowRepeat className={className} />;
const CheckCircleIcon = ({ className = "w-4 h-4" }) => <BsCheckCircle className={className} />;
const XCircleIcon = ({ className = "w-4 h-4" }) => <BsXCircle className={className} />;
const CheckIcon = ({ className = "w-4 h-4" }) => <BsCheckLg className={className} />;
const ArrowLeftIcon = ({ className = "w-4 h-4" }) => <BsArrowLeft className={className} />;
const FilterIcon = ({ className = "w-5 h-5" }) => <BsFilter className={className} />;
const SearchIcon = ({ className = "w-5 h-5" }) => <BsSearch className={className} />;
const XIcon = ({ className = "w-4 h-4" }) => <BsXLg className={className} />;
const LogoutIcon = ({ className = "w-4 h-4" }) => <BsBoxArrowRight className={className} />;
const AdminIcon = ({ className = "w-4 h-4" }) => <BsPersonBadge className={className} />;
const QrCodeIcon = ({ className = "w-4 h-4" }) => <BsQrCode className={className} />;
const StatsIcon = ({ className = "w-4 h-4" }) => <BsBarChartLine className={className} />;
const LogsIcon = ({ className = "w-4 h-4" }) => <BsJournalText className={className} />;

// Tipos de datos
interface Peticion {
  id: string;
  tipo: "services" | "room-service" | "problem" | "extra";
  numeroHabitacion: string;
  nombreHuesped: string;
  mensaje: string;
  fecha: Date;
  estado: "pending" | "in-progress" | "completed" | "cancelled";
  prioridad: "low" | "medium" | "high" | "urgent";
  cancelledBy?: "staff" | "guest";
  cancelledByName?: string;
  cancelledAt?: string;
  rating?: number;
  ratedAt?: string;
  details?: any;
}

interface Filtros {
  estado: string[];
  tipo: string[];
  busqueda: string;
}

interface PersistedRequest {
  requestId: string;
  type: string;
  roomNumber: string;
  guestName: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  timestamp: string;
  cancelledBy?: 'staff' | 'guest';
  cancelledByName?: string;
  cancelledAt?: string;
  rating?: number;
  ratedAt?: string;
  details?: any;
}

interface TransportResponse {
  vehiclePlate: string;
  vehicleModel: string;
  transportCost?: string;
  updatedAt?: string;
  updatedBy?: string;
}

type TransportKind = "taxi" | "valet" | null;

function isObjectRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inferTransportKind(details: unknown, mensaje?: string): TransportKind {
  if (isObjectRecord(details) && (details.serviceType === "taxi" || details.serviceType === "valet")) {
    return details.serviceType;
  }

  const normalizedMessage = (mensaje || "").toLowerCase();
  if (/(taxi|ride-hailing|uber|didi|cab)/.test(normalizedMessage)) {
    return "taxi";
  }
  if (/(valet|parking|parkink|estacionamiento)/.test(normalizedMessage)) {
    return "valet";
  }

  return null;
}

function getTransportResponse(details: unknown): TransportResponse | null {
  if (!isObjectRecord(details) || !isObjectRecord(details.transportResponse)) {
    return null;
  }

  return details.transportResponse as TransportResponse;
}

const normalizarTipoPeticion = (
  tipo?: string,
  mensaje?: string,
): Peticion["tipo"] => {
  const t = (tipo || "").toLowerCase();
  const m = (mensaje || "").toLowerCase();

  const esMovilidad =
    ["services", "service", "movilidad", "mobility", "taxi", "parking", "parkink", "estacionamiento"].includes(t) ||
    /(taxi|ride-hailing|uber|didi|cab|parking|parkink|estacionamiento|movilidad)/.test(m);

  if (esMovilidad) {
    return "services";
  }

  if (["room-service", "room_service", "roomservice", "comida", "food"].includes(t)) {
    return "room-service";
  }

  if (["problem", "problema", "issue", "incident"].includes(t)) {
    return "problem";
  }

  return "extra";
};

function Home() {
  const navigate = useNavigate();
  const URL_WS = import.meta.env.VITE_WS_URL || "ws://localhost:3001";
  const staffToken = localStorage.getItem("staff_token");
  const { estaConectado, enviarMensaje, ultimoMensaje } = useWebSocket(URL_WS, staffToken);

  const [peticiones, setPeticiones] = useState<Peticion[]>([]);
  const [filtros, setFiltros] = useState<Filtros>({
    estado: [],
    tipo: [],
    busqueda: "",
  });
  const [userRole, setUserRole] = useState<string>("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [peticionIdToCancel, setPeticionIdToCancel] = useState<string | null>(
    null,
  );
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [transportRequestId, setTransportRequestId] = useState<string | null>(null);
  const [isTransportSaving, setIsTransportSaving] = useState(false);

  // Manejadores de filtros
  const toggleFiltroEstado = (estado: string) => {
    setFiltros((prev) => ({
      ...prev,
      estado: prev.estado.includes(estado)
        ? prev.estado.filter((e) => e !== estado)
        : [...prev.estado, estado],
    }));
  };

  const toggleFiltroTipo = (tipo: string) => {
    setFiltros((prev) => ({
      ...prev,
      tipo: prev.tipo.includes(tipo)
        ? prev.tipo.filter((t) => t !== tipo)
        : [...prev.tipo, tipo],
    }));
  };

  const limpiarFiltros = () => {
    setFiltros({
      estado: [],
      tipo: [],
      busqueda: "",
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("staff_token");
    localStorage.removeItem("staff_username");
    navigate("/login");
  };

  // Obtener rol del usuario del token
  useEffect(() => {
    const token = localStorage.getItem("staff_token");
    if (token) {
      try {
        // Decodificar el JWT para obtener el rol
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUserRole(payload.role || "staff");
      } catch (error) {
        setUserRole("staff");
      }
    }
  }, []);

  // Aplicar filtros a las peticiones
  const peticionesFiltradas = peticiones.filter((peticion) => {
    // Filtrar por estado
    if (
      filtros.estado.length > 0 &&
      !filtros.estado.includes(peticion.estado)
    ) {
      return false;
    }

    // Filtrar por tipo
    if (filtros.tipo.length > 0 && !filtros.tipo.includes(peticion.tipo)) {
      return false;
    }

    // Filtrar por búsqueda
    if (filtros.busqueda) {
      const busquedaLower = filtros.busqueda.toLowerCase();
      return (
        peticion.numeroHabitacion.toLowerCase().includes(busquedaLower) ||
        peticion.nombreHuesped.toLowerCase().includes(busquedaLower) ||
        peticion.mensaje.toLowerCase().includes(busquedaLower)
      );
    }

    return true;
  });

  // Actualizar estado de peticiones
  const manejarActualizarEstado = (
    idPeticion: string,
    nuevoEstado: "pending" | "in-progress" | "completed",
  ) => {
    enviarMensaje({
      type: "UPDATE_REQUEST",
      payload: {
        id: idPeticion,
        status: nuevoEstado,
      },
    });

    // Actualizar localmente también
    setPeticiones((prev) =>
      prev.map((pet) =>
        pet.id === idPeticion ? { ...pet, estado: nuevoEstado } : pet,
      ),
    );

  };

  // Cancelar petición
  const manejarCancelarPeticion = (idPeticion: string) => {
    setPeticionIdToCancel(idPeticion);
    setShowCancelModal(true);
  };

  const confirmarCancelacion = () => {
    if (!peticionIdToCancel) {
      setShowCancelModal(false);
      return;
    }

    enviarMensaje({
      type: "CANCEL_REQUEST",
      payload: {
        id: peticionIdToCancel,
        requestedBy: "staff",
      },
    });

    setShowCancelModal(false);
    setPeticionIdToCancel(null);
  };

  const peticionSeleccionadaParaCancelar = peticiones.find(
    (p) => p.id === peticionIdToCancel,
  );

  const cerrarModalCancelacion = () => {
    setShowCancelModal(false);
    setPeticionIdToCancel(null);
  };

  const peticionSeleccionadaParaTransporte = peticiones.find(
    (p) => p.id === transportRequestId,
  );

  const abrirModalTransporte = (peticion: Peticion) => {
    setTransportRequestId(peticion.id);
    setShowTransportModal(true);
  };

  const cerrarModalTransporte = () => {
    setShowTransportModal(false);
    setTransportRequestId(null);
    setIsTransportSaving(false);
  };

  const guardarRespuestaTransporte = async (value: TransportResponseFormValue) => {
    if (!peticionSeleccionadaParaTransporte) {
      return;
    }

    const transportKind = inferTransportKind(
      peticionSeleccionadaParaTransporte.details,
      peticionSeleccionadaParaTransporte.mensaje,
    );

    if (!transportKind) {
      return;
    }

    setIsTransportSaving(true);

    const updatedAt = new Date().toISOString();
    const updatedBy = localStorage.getItem("staff_username") || "Staff";
    const nextTransportResponse: TransportResponse = {
      vehiclePlate: value.vehiclePlate,
      vehicleModel: value.vehicleModel,
      updatedAt,
      updatedBy,
      ...(transportKind === "taxi" ? { transportCost: value.transportCost } : {}),
    };

    const nextDetails = {
      ...(isObjectRecord(peticionSeleccionadaParaTransporte.details) ? peticionSeleccionadaParaTransporte.details : {}),
      serviceType: transportKind,
      transportResponse: nextTransportResponse,
    };

    enviarMensaje({
      type: "UPDATE_REQUEST",
      payload: {
        id: peticionSeleccionadaParaTransporte.id,
        details: nextDetails,
        note: transportKind === "taxi"
          ? "Transport response updated with cost"
          : "Transport response updated",
      },
    });

    setPeticiones((prev) =>
      prev.map((pet) =>
        pet.id === peticionSeleccionadaParaTransporte.id
          ? { ...pet, details: nextDetails }
          : pet,
      ),
    );

    cerrarModalTransporte();
  };

  // Escuchar mensajes de WebSocket
  useEffect(() => {
    if (ultimoMensaje) {
      try {
        switch (ultimoMensaje.type) {
          case "INIT_REQUESTS":
            const persistedRequests = Array.isArray(ultimoMensaje.payload?.requests)
              ? (ultimoMensaje.payload.requests as PersistedRequest[])
              : [];
            setPeticiones(
              persistedRequests.map((request) => ({
                id: request.requestId,
                tipo: normalizarTipoPeticion(request.type, request.message),
                numeroHabitacion: request.roomNumber,
                nombreHuesped: request.guestName,
                mensaje: request.message,
                prioridad: request.priority,
                estado: request.status,
                fecha: new Date(request.timestamp),
                cancelledBy: request.cancelledBy,
                cancelledByName: request.cancelledByName,
                cancelledAt: request.cancelledAt,
                rating: request.rating,
                ratedAt: request.ratedAt,
                details: request.details,
              })),
            );
            break;
          case "NEW_REQUEST":
            const payload = ultimoMensaje.payload;
            const nuevaPeticion: Peticion = {
              id: payload.id,
              tipo: normalizarTipoPeticion(payload.type, payload.message),
              numeroHabitacion: payload.roomNumber,
              nombreHuesped: payload.guestName,
              mensaje: payload.message,
              prioridad: payload.priority,
              estado: payload.status,
              fecha: new Date(payload.timestamp),
              details: payload.details,
            };
            setPeticiones((prev) => [nuevaPeticion, ...prev]);
            break;
          case "UPDATE_REQUEST":
            const update = ultimoMensaje.payload;
            setPeticiones((prev) =>
              prev.map((r) =>
                r.id === update.id
                  ? {
                      ...r,
                      estado: update.status || update.estado || r.estado,
                      details: update.details ?? r.details,
                    }
                  : r,
              ),
            );
            break;
          case "CANCEL_REQUEST":
            // Actualizar petición como cancelada
            const cancelData = ultimoMensaje.payload;
            setPeticiones((prev) =>
              prev.map((r) =>
                r.id === cancelData.id
                  ? {
                      ...r,
                      estado: "cancelled",
                      cancelledBy: cancelData.cancelledBy,
                      cancelledByName: cancelData.cancelledByName,
                      cancelledAt: cancelData.cancelledAt,
                    }
                  : r,
              ),
            );
            break;
          case "RATE_REQUEST":
            // Actualizar petición con calificación
            const rateData = ultimoMensaje.payload;
            setPeticiones((prev) =>
              prev.map((r) =>
                r.id === rateData.id
                  ? {
                      ...r,
                      rating: rateData.rating,
                      ratedAt: rateData.ratedAt,
                    }
                  : r,
              ),
            );
            break;
          case "CONFIG_UPDATED":
            break;
          default:
        }
      } catch (error) {
        
      }
    }
  }, [ultimoMensaje]);

  // Estadísticas
  const contadorPendientes = peticionesFiltradas.filter(
    (r) => r.estado === "pending",
  ).length;
  const contadorEnProgreso = peticionesFiltradas.filter(
    (r) => r.estado === "in-progress",
  ).length;
  const contadorCompletadas = peticionesFiltradas.filter(
    (r) => r.estado === "completed",
  ).length;
  const contadorCanceladas = peticionesFiltradas.filter(
    (r) => r.estado === "cancelled",
  ).length;

  const filtrosActivos =
    filtros.estado.length +
    filtros.tipo.length +
    (filtros.busqueda ? 1 : 0);

  return (
    <div className="min-h-screen bg-auto-primary">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-auto-secondary/90 border-b border-auto shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md transition-all hover:scale-105"
                style={{
                  background:
                    "linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))",
                }}
              >
                <HotelIcon />
              </div>
              <div>
                <h1 className="text-xl font-bold text-auto-primary tracking-tight">
                  ASL Control Panel
                </h1>
                <p className="text-xs text-auto-tertiary">
                  Real-time management
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {userRole === "admin" && (
                <button
                  onClick={() => navigate("/admin")}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 flex items-center gap-1.5 text-white"
                  style={{ backgroundColor: "var(--hotel-secondary)" }}
                  title="Staff Management"
                >
                  <AdminIcon className="w-3.5 h-3.5" />
                  Management
                </button>
              )}
              <button
                onClick={() => navigate("/stays")}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 flex items-center gap-1.5 text-white"
                style={{ backgroundColor: "var(--hotel-primary)" }}
                title="Manage guest stays and QR codes"
              >
                <QrCodeIcon className="w-3.5 h-3.5" />
                Manage Stays
              </button>
              <button
                onClick={() => navigate("/statistics")}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 flex items-center gap-1.5 text-white"
                style={{ backgroundColor: "var(--success)" }}
                title="View service rating statistics"
              >
                <StatsIcon className="w-3.5 h-3.5" />
                Statistics
              </button>
              {userRole === "admin" && (
                <button
                  onClick={() => navigate("/logs")}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 flex items-center gap-1.5 text-white"
                  style={{ backgroundColor: "#334155" }}
                  title="View operational logs by stay"
                >
                  <LogsIcon className="w-3.5 h-3.5" />
                  Logs
                </button>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-auto-tertiary/50 border border-auto">
                <div
                  className={`w-2 h-2 rounded-full ${estaConectado ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
                ></div>
                <span className="text-xs font-medium text-auto-secondary">
                  {estaConectado ? "Online" : "Disconnected"}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 flex items-center gap-1.5 border border-auto hover:bg-auto-tertiary"
                style={{ color: "var(--text-primary)" }}
                title="Log out"
              >
                <LogoutIcon className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <TarjetaEstadistica
            titulo="Pending"
            valor={contadorPendientes}
            icono={<HourglassIcon />}
            color="var(--warning)"
          />
          <TarjetaEstadistica
            titulo="In Progress"
            valor={contadorEnProgreso}
            icono={<ArrowRepeatIcon />}
            color="var(--hotel-secondary)"
          />
          <TarjetaEstadistica
            titulo="Completed"
            valor={contadorCompletadas}
            icono={<CheckCircleIcon className="w-12 h-12" />}
            color="var(--success)"
          />
          <TarjetaEstadistica
            titulo="Cancelled"
            valor={contadorCanceladas}
            icono={<XCircleIcon className="w-12 h-12" />}
            color="#DC2626"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-6 mb-4">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: "var(--hotel-primary)" }}
                  >
                    <InboxIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-auto-primary">
                      Requests
                    </h2>
                    <p className="text-xs text-auto-tertiary">
                      {filtrosActivos > 0
                        ? `${peticionesFiltradas.length} of ${peticiones.length} requests`
                        : `${peticiones.length} total requests`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar pr-2">
                {peticionesFiltradas.length === 0 ? (
                  <div className="text-center py-12 text-auto-tertiary">
                    <InboxIcon className="w-16 h-16 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                      {filtrosActivos > 0
                        ? "No requests match the filters"
                        : "No requests at this time"}
                    </p>
                  </div>
                ) : (
                  peticionesFiltradas.map((peticion) => (
                    <TarjetaPeticion
                      key={peticion.id}
                      peticion={peticion}
                      onActualizarEstado={manejarActualizarEstado}
                      onCancelar={manejarCancelarPeticion}
                      onEditarTransporte={abrirModalTransporte}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="bg-auto-secondary rounded-xl shadow-sm border border-auto p-5 sticky top-24">
              {/* Header */}
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-auto">
                <div className="flex items-center gap-2">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: "var(--hotel-primary)" }}
                  >
                    <FilterIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-auto-primary">
                      Filters
                    </h2>
                    <p className="text-xs text-auto-tertiary">
                      {filtrosActivos > 0
                        ? `${filtrosActivos} active`
                        : "None active"}
                    </p>
                  </div>
                </div>
                {filtrosActivos > 0 && (
                  <button
                    onClick={limpiarFiltros}
                    className="text-xs font-medium px-2 py-1 rounded-md transition-all hover:bg-auto-tertiary flex items-center gap-1"
                    style={{ color: "var(--problem)" }}
                    title="Clear all filters"
                  >
                    <XIcon className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>

              <div className="space-y-5 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar pr-2">
                {/* Búsqueda */}
                <div>
                  <label className="text-xs font-semibold text-auto-secondary mb-2 block">
                    Search
                  </label>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-auto-tertiary" />
                    <input
                      type="text"
                      placeholder="Room, name..."
                      value={filtros.busqueda}
                      onChange={(e) =>
                        setFiltros((prev) => ({
                          ...prev,
                          busqueda: e.target.value,
                        }))
                      }
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-auto-tertiary/50 border border-auto text-auto-primary text-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all"
                      style={
                        {
                          "--tw-ring-color": "var(--hotel-primary)",
                        } as React.CSSProperties
                      }
                    />
                  </div>
                </div>

                {/* Filtro por Estado */}
                <div>
                  <h3 className="text-xs font-semibold text-auto-secondary mb-2">
                    Status
                  </h3>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => toggleFiltroEstado("pending")}
                      className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between ${
                        filtros.estado.includes("pending")
                          ? "text-white shadow-sm"
                          : "bg-auto-tertiary/50 text-auto-secondary hover:bg-auto-tertiary border border-auto"
                      }`}
                      style={
                        filtros.estado.includes("pending")
                          ? { backgroundColor: "var(--warning)" }
                          : {}
                      }
                    >
                      <span>Pending</span>
                      <span className="font-bold">
                        {
                          peticiones.filter((p) => p.estado === "pending")
                            .length
                        }
                      </span>
                    </button>
                    <button
                      onClick={() => toggleFiltroEstado("in-progress")}
                      className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between ${
                        filtros.estado.includes("in-progress")
                          ? "text-white shadow-sm"
                          : "bg-auto-tertiary/50 text-auto-secondary hover:bg-auto-tertiary border border-auto"
                      }`}
                      style={
                        filtros.estado.includes("in-progress")
                          ? { backgroundColor: "var(--hotel-secondary)" }
                          : {}
                      }
                    >
                      <span>In Progress</span>
                      <span className="font-bold">
                        {
                          peticiones.filter((p) => p.estado === "in-progress")
                            .length
                        }
                      </span>
                    </button>
                    <button
                      onClick={() => toggleFiltroEstado("completed")}
                      className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between ${
                        filtros.estado.includes("completed")
                          ? "text-white shadow-sm"
                          : "bg-auto-tertiary/50 text-auto-secondary hover:bg-auto-tertiary border border-auto"
                      }`}
                      style={
                        filtros.estado.includes("completed")
                          ? { backgroundColor: "var(--success)" }
                          : {}
                      }
                    >
                      <span>Completed</span>
                      <span className="font-bold">
                        {
                          peticiones.filter((p) => p.estado === "completed")
                            .length
                        }
                      </span>
                    </button>
                    <button
                      onClick={() => toggleFiltroEstado("cancelled")}
                      className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between ${
                        filtros.estado.includes("cancelled")
                          ? "text-white shadow-sm"
                          : "bg-auto-tertiary/50 text-auto-secondary hover:bg-auto-tertiary border border-auto"
                      }`}
                      style={
                        filtros.estado.includes("cancelled")
                          ? { backgroundColor: "#DC2626" }
                          : {}
                      }
                    >
                      <span>Cancelled</span>
                      <span className="font-bold">
                        {
                          peticiones.filter((p) => p.estado === "cancelled")
                            .length
                        }
                      </span>
                    </button>
                  </div>
                </div>

                {/* Filtro por Tipo */}
                <div>
                  <h3 className="text-xs font-semibold text-auto-secondary mb-2">
                    Service Type
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => toggleFiltroTipo("services")}
                      className={`px-3 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 text-xs ${
                        filtros.tipo.includes("services")
                          ? "text-white shadow-md"
                          : "bg-auto-tertiary/50 text-auto-secondary hover:bg-auto-tertiary border border-auto"
                      }`}
                      style={
                        filtros.tipo.includes("services")
                          ? { backgroundColor: "var(--services)" }
                          : {}
                      }
                    >
                      <BellIcon className="w-3.5 h-3.5" /> Mobility
                    </button>
                    <button
                      onClick={() => toggleFiltroTipo("room-service")}
                      className={`px-3 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 text-xs ${
                        filtros.tipo.includes("room-service")
                          ? "text-white shadow-md"
                          : "bg-auto-tertiary/50 text-auto-secondary hover:bg-auto-tertiary border border-auto"
                      }`}
                      style={
                        filtros.tipo.includes("room-service")
                          ? { backgroundColor: "var(--room-service)" }
                          : {}
                      }
                    >
                      <FoodIcon className="w-3.5 h-3.5" /> Room
                    </button>
                    <button
                      onClick={() => toggleFiltroTipo("problem")}
                      className={`px-3 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 text-xs ${
                        filtros.tipo.includes("problem")
                          ? "text-white shadow-md"
                          : "bg-auto-tertiary/50 text-auto-secondary hover:bg-auto-tertiary border border-auto"
                      }`}
                      style={
                        filtros.tipo.includes("problem")
                          ? { backgroundColor: "var(--problem)" }
                          : {}
                      }
                    >
                      <WarningIcon className="w-3.5 h-3.5" /> Problems
                    </button>
                    <button
                      onClick={() => toggleFiltroTipo("extra")}
                      className={`px-3 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 text-xs ${
                        filtros.tipo.includes("extra")
                          ? "text-white shadow-md"
                          : "bg-auto-tertiary/50 text-auto-secondary hover:bg-auto-tertiary border border-auto"
                      }`}
                      style={
                        filtros.tipo.includes("extra")
                          ? { backgroundColor: "var(--extra)" }
                          : {}
                      }
                    >
                      <SparklesIcon className="w-3.5 h-3.5" /> Extra
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationModal
        open={showCancelModal}
        title="Cancel request"
        message={
          peticionSeleccionadaParaCancelar
            ? `Are you sure you want to cancel the request for room ${peticionSeleccionadaParaCancelar.numeroHabitacion}?`
            : "Are you sure you want to cancel this request?"
        }
        confirmLabel="Yes, cancel"
        cancelLabel="No, go back"
        variant="danger"
        onConfirm={confirmarCancelacion}
        onCancel={cerrarModalCancelacion}
      />
      <TransportResponseModal
        open={showTransportModal}
        isTaxi={
          inferTransportKind(
            peticionSeleccionadaParaTransporte?.details,
            peticionSeleccionadaParaTransporte?.mensaje,
          ) === "taxi"
        }
        loading={isTransportSaving}
        initialValue={getTransportResponse(peticionSeleccionadaParaTransporte?.details)}
        onClose={cerrarModalTransporte}
        onSave={guardarRespuestaTransporte}
      />
    </div>
  );
}

// Componentes auxiliares
interface PropsTarjetaEstadistica {
  titulo: string;
  valor: number;
  icono: React.ReactNode;
  color: string;
}

function TarjetaEstadistica({
  titulo,
  valor,
  icono,
  color,
}: PropsTarjetaEstadistica) {
  return (
    <div className="bg-auto-secondary rounded-xl p-5 shadow-sm border border-auto hover:shadow-md transition-all group">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-auto-tertiary font-medium mb-1">
            {titulo}
          </p>
          <p className="text-3xl font-bold" style={{ color }}>
            {valor}
          </p>
        </div>
        <div
          className="p-3 rounded-xl transition-all group-hover:scale-110"
          style={{ color, backgroundColor: `${color}15` }}
        >
          {icono}
        </div>
      </div>
    </div>
  );
}

interface PropsTarjetaPeticion {
  peticion: Peticion;
  onActualizarEstado: (
    id: string,
    estado: "pending" | "in-progress" | "completed",
  ) => void;
  onCancelar: (id: string) => void;
  onEditarTransporte: (peticion: Peticion) => void;
}

function TarjetaPeticion({
  peticion,
  onActualizarEstado,
  onCancelar,
  onEditarTransporte,
}: PropsTarjetaPeticion) {
  const transportKind = inferTransportKind(peticion.details, peticion.mensaje);
  const isTaxi = transportKind === "taxi";
  const isTransportRequest = transportKind === "taxi" || transportKind === "valet";
  const taxiDetails = isTaxi && isObjectRecord(peticion.details) ? peticion.details : null;
  const transportResponse = getTransportResponse(peticion.details);
  const taxiCategoryLabels: Record<string, string> = {
    tourist: "Tourist destinations",
    hospitals: "Nearby hospitals",
    "airports-buses": "Airports and bus stations",
  };

  const configTipo = {
    services: {
      etiqueta: "Mobility",
      icono: <BellIcon className="w-6 h-6" />,
      color: "var(--services)",
    },
    "room-service": {
      etiqueta: "Room Service",
      icono: <FoodIcon className="w-6 h-6" />,
      color: "var(--room-service)",
    },
    problem: {
      etiqueta: "Problem",
      icono: <WarningIcon className="w-6 h-6" />,
      color: "var(--problem)",
    },
    extra: {
      etiqueta: "Extra",
      icono: <SparklesIcon className="w-6 h-6" />,
      color: "var(--extra)",
    },
  };

  const configEstado = {
    pending: { etiqueta: "Pending", color: "var(--warning)" },
    "in-progress": { etiqueta: "In Progress", color: "var(--hotel-secondary)" },
    completed: { etiqueta: "Completed", color: "var(--success)" },
    cancelled: { etiqueta: "Cancelled", color: "#DC2626" },
  };

  const config = configTipo[peticion.tipo];
  const estado = configEstado[peticion.estado];

  const formatearTiempo = (fecha: Date) => {
    try {
      const marcaTiempo = fecha instanceof Date ? fecha : new Date(fecha);

      if (isNaN(marcaTiempo.getTime())) {
        return "Invalid date";
      }

      const diferencia = Date.now() - marcaTiempo.getTime();
      const minutos = Math.floor(diferencia / 60000);
      if (minutos < 1) return "Just now";
      if (minutos < 60) return `${minutos} min ago`;
      const horas = Math.floor(minutos / 60);
      return `${horas}h ago`;
    } catch (error) {
      return "Invalid date";
    }
  };

  return (
    <div
      className="bg-auto-secondary rounded-lg p-4 shadow-sm border border-auto hover:shadow-md transition-all"
      style={{ borderLeftWidth: "3px", borderLeftColor: config.color }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform hover:scale-110"
            style={{
              backgroundColor: `${config.color}20`,
              color: config.color,
            }}
          >
            {config.icono}
          </div>
          <div>
            <h3 className="font-bold text-sm text-auto-primary">
              Room {peticion.numeroHabitacion}
            </h3>
            <p className="text-xs text-auto-secondary">
              {peticion.nombreHuesped}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className="px-2.5 py-1 rounded-md text-xs font-semibold text-white"
            style={{ backgroundColor: config.color }}
          >
            {config.etiqueta}
          </span>
        </div>
      </div>

      <div className="bg-auto-tertiary/50 rounded-lg p-3 mb-3 border border-auto">
        <p className="text-sm text-auto-primary flex items-start gap-2 leading-relaxed">
          <ChatIcon className="mt-0.5 flex-shrink-0 text-auto-secondary w-3.5 h-3.5" />
          <span className="flex-1">{peticion.mensaje}</span>
        </p>
      </div>

      {taxiDetails && (
        <div className="bg-auto-tertiary/50 rounded-lg p-3 mb-3 border border-auto">
          <div className="grid grid-cols-2 gap-2 text-xs text-auto-secondary">
            <span>
              <strong>Destination:</strong> {taxiDetails.destinationLabel}
            </span>
            <span>
              <strong>Category:</strong> {taxiCategoryLabels[taxiDetails.destinationCategory] || taxiDetails.destinationCategory}
            </span>
            <span>
              <strong>Time:</strong>{" "}
              {taxiDetails.timeMode === "now"
                ? "NOW"
                : new Date(taxiDetails.scheduledAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
            </span>
            <span>
              <strong>People:</strong> {taxiDetails.passengerCount}
            </span>
            <span>
              <strong>Luggage:</strong> {taxiDetails.hasLuggage ? "YES" : "NO"}
            </span>
            <span>
              <strong>Mode:</strong> {taxiDetails.sourceMode}
            </span>
          </div>
        </div>
      )}

      {transportResponse && isTransportRequest && (
        <div className="bg-green-50/70 dark:bg-green-900/10 rounded-lg p-3 mb-3 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-green-700 dark:text-green-400">
              Transport response
            </span>
            {transportResponse.updatedAt && (
              <span className="text-[11px] text-green-700/80 dark:text-green-400/80">
                {new Date(transportResponse.updatedAt).toLocaleString("es-ES", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-auto-secondary">
            <span>
              <strong>Plates:</strong> {transportResponse.vehiclePlate}
            </span>
            <span>
              <strong>Model:</strong> {transportResponse.vehicleModel}
            </span>
            {isTaxi && transportResponse.transportCost && (
              <span>
                <strong>Cost:</strong> {transportResponse.transportCost}
              </span>
            )}
            {transportResponse.updatedBy && (
              <span>
                <strong>Updated by:</strong> {transportResponse.updatedBy}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Información de cancelación */}
      {peticion.estado === "cancelled" && peticion.cancelledByName && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
          <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
            <XCircleIcon className="w-4 h-4" />
            <span>
              Cancelled by: <strong>{peticion.cancelledByName}</strong>
              {peticion.cancelledAt && (
                <span className="ml-1">
                  (
                  {new Date(peticion.cancelledAt).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  )
                </span>
              )}
            </span>
          </p>
        </div>
      )}

      {/* Información de calificación */}
      {peticion.rating && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-400">
                Guest rating:
              </span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  star <= peticion.rating! ? (
                    <BsStarFill key={star} className="w-4 h-4 text-yellow-400" />
                  ) : (
                    <BsStar key={star} className="w-4 h-4 text-gray-300" />
                  )
                ))}
              </div>
            </div>
            {peticion.ratedAt && (
              <span className="text-xs text-yellow-700 dark:text-yellow-500">
                {new Date(peticion.ratedAt).toLocaleString("es-ES", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-auto-tertiary flex items-center gap-1">
          <ClockIcon className="w-3.5 h-3.5" />
          {formatearTiempo(peticion.fecha)}
        </span>
        <span
          className="px-2.5 py-1 rounded-md text-xs font-medium"
          style={{ backgroundColor: `${estado.color}20`, color: estado.color }}
        >
          {estado.etiqueta}
        </span>
      </div>

      {isTransportRequest && peticion.estado !== "cancelled" && (
        <button
          onClick={() => onEditarTransporte(peticion)}
          className="w-full mb-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.01] active:scale-95 border border-green-600 text-green-700 hover:bg-green-50 flex items-center justify-center gap-2"
          title="Capture or update transport data"
        >
          {transportResponse ? "Edit transport details" : "Add transport details"}
          <CheckCircleIcon className="w-4 h-4" />
        </button>
      )}

      {/* Botones de actualización de estado - Flujo secuencial */}
      <div className="flex gap-2">
        {peticion.estado === "cancelled" ? (
          <div
            className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-center flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "#DC2626",
              color: "#fff",
              opacity: 0.7,
            }}
          >
            Cancelled <XCircleIcon className="w-3 h-3" />
          </div>
        ) : (
          <>
            {peticion.estado === "pending" && (
              <>
                {/* Solo avanzar a En Progreso */}
                <button
                  onClick={() => onActualizarEstado(peticion.id, "in-progress")}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 shadow-sm flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: "var(--hotel-secondary)",
                    color: "#fff",
                  }}
                  title="Start handling this request"
                >
                  Start <ArrowRepeatIcon className="w-4 h-4" />
                </button>
                {/* Botón de cancelar */}
                <button
                  onClick={() => onCancelar(peticion.id)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 border border-red-500 text-red-500 hover:bg-red-50 flex items-center justify-center gap-1"
                  title="Cancel this request"
                >
                  <XCircleIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {peticion.estado === "in-progress" && (
              <>
                {/* Retroceder a Pendiente */}
                <button
                  onClick={() => onActualizarEstado(peticion.id, "pending")}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 border flex items-center justify-center gap-1"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: "var(--warning)",
                    color: "var(--warning)",
                  }}
                  title="Move back to pending"
                >
                  <ArrowLeftIcon className="w-3 h-3" /> Pending
                </button>

                {/* Avanzar a Completada */}
                <button
                  onClick={() => onActualizarEstado(peticion.id, "completed")}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 shadow-sm flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: "var(--success)", color: "#fff" }}
                  title="Mark as completed"
                >
                  Complete <CheckCircleIcon className="w-4 h-4" />
                </button>

                {/* Botón de cancelar */}
                <button
                  onClick={() => onCancelar(peticion.id)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 border border-red-500 text-red-500 hover:bg-red-50 flex items-center justify-center gap-1"
                  title="Cancel this request"
                >
                  <XCircleIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {peticion.estado === "completed" && (
              <>
                {/* Retroceder a En Progreso */}
                <button
                  onClick={() => onActualizarEstado(peticion.id, "in-progress")}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 border flex items-center justify-center gap-1"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: "var(--hotel-secondary)",
                    color: "var(--hotel-secondary)",
                  }}
                  title="Move back to in progress"
                >
                  <ArrowLeftIcon className="w-3 h-3" /> Reopen
                </button>

                <div
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-center flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: "var(--success)",
                    color: "#fff",
                    opacity: 0.6,
                  }}
                >
                  Finished <CheckIcon className="w-3 h-3" />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Home;
