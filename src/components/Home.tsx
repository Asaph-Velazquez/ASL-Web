import { useState, useEffect } from "react";
import { useWebSocket } from "../hooks/useWebSocket";

// Componentes de Iconos SVG
const HotelIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="currentColor" className="bi bi-buildings" viewBox="0 0 16 16">
    <path d="M14.763.075A.5.5 0 0 1 15 .5v15a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V14h-1v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V10a.5.5 0 0 1 .342-.474L6 7.64V4.5a.5.5 0 0 1 .276-.447l8-4a.5.5 0 0 1 .487.022M6 8.694 1 10.36V15h5zM7 15h2v-1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V15h2V1.309l-7 3.5z"/>
    <path d="M2 11h1v1H2zm2 0h1v1H4zm-2 2h1v1H2zm2 0h1v1H4zm4-4h1v1H8zm2 0h1v1h-1zm-2 2h1v1H8zm2 0h1v1h-1zm2-2h1v1h-1zm0 2h1v1h-1zM8 7h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zM8 5h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zm0-2h1v1h-1z"/>
  </svg>
);

const InboxIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M4.98 4a.5.5 0 0 0-.39.188L1.54 8H6a.5.5 0 0 1 .5.5 1.5 1.5 0 1 0 3 0A.5.5 0 0 1 10 8h4.46l-3.05-3.812A.5.5 0 0 0 11.02 4zm9.954 5H10.45a2.5 2.5 0 0 1-4.9 0H1.066l.32 2.562a.5.5 0 0 0 .497.438h12.234a.5.5 0 0 0 .496-.438zM3.809 3.563A1.5 1.5 0 0 1 4.981 3h6.038a1.5 1.5 0 0 1 1.172.563l3.7 4.625a.5.5 0 0 1 .105.374l-.39 3.124A1.5 1.5 0 0 1 14.117 13H1.883a1.5 1.5 0 0 1-1.489-1.314l-.39-3.124a.5.5 0 0 1 .106-.374z"/>
  </svg>
);

const BellIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2M8 1.918l-.797.161A4 4 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4 4 0 0 0-3.203-3.92zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5 5 0 0 1 13 6c0 .88.32 4.2 1.22 6"/>
  </svg>
);

const FoodIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M12.5 2A2.5 2.5 0 0 0 10 4.5V12h.5a.5.5 0 0 1 0 1H10v1.5a.5.5 0 0 1-1 0V13H8.5a.5.5 0 0 1 0-1H9V4.5A2.5 2.5 0 0 0 6.5 2 2.5 2.5 0 0 0 4 4.5v5.939l-1.828 1.828A.5.5 0 0 0 2 12.5V14a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-1.5a.5.5 0 0 0-.172-.372L7 10.439V4.5A1.5 1.5 0 0 1 8.5 3a1.5 1.5 0 0 1 1.5 1.5V12h1z"/>
  </svg>
);

const WarningIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>
  </svg>
);

const SparklesIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M8.5 5a.5.5 0 0 0-1 0v.518A1.5 1.5 0 0 0 6 7v.5h-.5a.5.5 0 0 0 0 1h.5v.5A1.5 1.5 0 0 0 7.5 10.5h.518a.5.5 0 0 0 0-1H7.5A.5.5 0 0 1 7 9V8h1.5a.5.5 0 0 0 0-1H7v-.5a.5.5 0 0 1 .5-.5h.518a.5.5 0 0 0 0-1zM3 6.5a.5.5 0 0 1 .5-.5h.5v-.5a.5.5 0 0 1 1 0v.5H6a.5.5 0 0 1 0 1h-.5v.5a.5.5 0 0 1-1 0V7h-.5a.5.5 0 0 1-.5-.5m7 3a.5.5 0 0 1 .5-.5h.5v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-.5v.5a.5.5 0 0 1-1 0v-.5h-.5a.5.5 0 0 1-.5-.5"/>
  </svg>
);

const PlusIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/>
  </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
    <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
  </svg>
);

const SaveIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H9.5a1 1 0 0 0-1 1v7.293l2.646-2.647a.5.5 0 0 1 .708.708l-3.5 3.5a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L7.5 9.293V2a2 2 0 0 1 2-2H14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h2.5a.5.5 0 0 1 0 1z"/>
  </svg>
);

const ClockIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/>
    <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/>
  </svg>
);

const ChatIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M2.678 11.894a1 1 0 0 1 .287.801 11 11 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8 8 0 0 0 8 14c3.996 0 7-2.807 7-6s-3.004-6-7-6-7 2.808-7 6c0 1.468.617 2.83 1.678 3.894m-.493 3.905a22 22 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a10 10 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105"/>
  </svg>
);

const HourglassIcon = ({ className = "w-12 h-12" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-1v1a4.5 4.5 0 0 1-2.557 4.06c-.29.139-.443.377-.443.59v.7c0 .213.154.451.443.59A4.5 4.5 0 0 1 12.5 13v1h1a.5.5 0 0 1 0 1h-11a.5.5 0 1 1 0-1h1v-1a4.5 4.5 0 0 1 2.557-4.06c.29-.139.443-.377.443-.59v-.7c0-.213-.154-.451-.443-.59A4.5 4.5 0 0 1 3.5 3V2h-1a.5.5 0 0 1-.5-.5m2.5.5v1a3.5 3.5 0 0 0 1.989 3.158c.533.256 1.011.791 1.011 1.491v.702c0 .7-.478 1.235-1.011 1.491A3.5 3.5 0 0 0 4.5 13v1h7v-1a3.5 3.5 0 0 0-1.989-3.158C8.978 9.586 8.5 9.052 8.5 8.351v-.702c0-.7.478-1.235 1.011-1.491A3.5 3.5 0 0 0 11.5 3V2z"/>
  </svg>
);

const ArrowRepeatIcon = ({ className = "w-12 h-12" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41m-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9"/>
    <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5 5 0 0 0 8 3M3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9z"/>
  </svg>
);

const ExclamationTriangleIcon = ({ className = "w-12 h-12" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.15.15 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.2.2 0 0 1-.054.06.1.1 0 0 1-.066.017H1.146a.1.1 0 0 1-.066-.017.2.2 0 0 1-.054-.06.18.18 0 0 1 .002-.183L7.884 2.073a.15.15 0 0 1 .054-.057m1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767z"/>
    <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0M7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/>
  </svg>
);

const CheckCircleIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
    <path d="m10.97 4.97-.02.022-3.473 4.425-2.093-2.094a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05"/>
  </svg>
);

const CheckIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425z"/>
  </svg>
);

const ArrowLeftIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>
  </svg>
);

// Tipos de datos
interface Peticion {
  id: string;
  tipo: "services" | "room-service" | "problem" | "extra";
  numeroHabitacion: string;
  nombreHuesped: string;
  mensaje: string;
  fecha: Date;
  estado: "pending" | "in-progress" | "completed";
  prioridad: "low" | "medium" | "high" | "urgent";
}

interface Servicio {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  categoria: "services" | "room-service" | "problem" | "extra";
  activo: boolean;
}

interface ConfiguracionApp {
  nombreHotel: string;
  servicios: Servicio[];
}

function Home() {
  const URL_WS = "ws://localhost:8080";
  const { estaConectado, enviarMensaje, ultimoMensaje } = useWebSocket(URL_WS);

  const [peticiones, setPeticiones] = useState<Peticion[]>([]);
  const [configuracionApp, setConfiguracionApp] = useState<ConfiguracionApp>({
    nombreHotel: "Hotel ASL Grand",
    servicios: [],
  });

  const [pestanaActiva, setPestanaActiva] = useState<
    "services" | "room-service" | "problem" | "extra"
  >("services");
  const [nuevoServicio, setNuevoServicio] = useState({
    nombre: "",
    descripcion: "",
    icono: "",
  });

  // Manejadores de eventos
  const manejarAgregarServicio = () => {
    if (
      !nuevoServicio.nombre ||
      !nuevoServicio.descripcion ||
      !nuevoServicio.icono
    ) {
      alert("Por favor completa todos los campos");
      return;
    }

    const servicio: Servicio = {
      id: Date.now().toString(),
      nombre: nuevoServicio.nombre,
      descripcion: nuevoServicio.descripcion,
      icono: nuevoServicio.icono,
      categoria: pestanaActiva,
      activo: true,
    };

    setConfiguracionApp((prev) => ({
      ...prev,
      servicios: [...prev.servicios, servicio],
    }));

    setNuevoServicio({ nombre: "", descripcion: "", icono: "" });
    alert("✅ Servicio agregado exitosamente");
  };

  const manejarCambiarEstadoServicio = (idServicio: string) => {
    setConfiguracionApp((prev) => ({
      ...prev,
      servicios: prev.servicios.map((s) =>
        s.id === idServicio ? { ...s, activo: !s.activo } : s,
      ),
    }));
  };

  const manejarEliminarServicio = (idServicio: string) => {
    if (confirm("¿Estás seguro de eliminar este servicio?")) {
      setConfiguracionApp((prev) => ({
        ...prev,
        servicios: prev.servicios.filter((s) => s.id !== idServicio),
      }));
    }
  };

  const manejarGuardarConfiguracion = () => {
    enviarMensaje({
      type: "UPDATE_CONFIG",
      payload: configuracionApp,
    });
    console.log("Configuración guardada:", configuracionApp);
    alert("Configuración guardada exitosamente ✅");
  };

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

    console.log("✅ Estado actualizado:", idPeticion, "→", nuevoEstado);
  };

  // Escuchar mensajes de WebSocket
  useEffect(() => {
    if (ultimoMensaje) {
      try {
        switch (ultimoMensaje.type) {
          case "NEW_REQUEST":
            const payload = ultimoMensaje.payload;
            const nuevaPeticion: Peticion = {
              id: payload.id,
              tipo: payload.type,
              numeroHabitacion: payload.roomNumber,
              nombreHuesped: payload.guestName,
              mensaje: payload.message,
              prioridad: payload.priority,
              estado: payload.status,
              fecha: new Date(payload.timestamp),
            };
            setPeticiones((prev) => [nuevaPeticion, ...prev]);
            console.log("✅ Nueva petición recibida:", nuevaPeticion);
            break;
          case "UPDATE_REQUEST":
            // Actualizar solo el estado de la petición
            const update = ultimoMensaje.payload;
            setPeticiones((prev) =>
              prev.map((r) =>
                r.id === update.id
                  ? { ...r, estado: update.status || update.estado }
                  : r,
              ),
            );
            console.log("🔄 Petición actualizada:", update);
            break;
          case "CONFIG_UPDATED":
            console.log("⚙️ Configuración actualizada en servidor");
            break;
          default:
            console.log("⚠️ Mensaje no manejado:", ultimoMensaje);
        }
      } catch (error) {
        console.error(
          "❌ Error al procesar mensaje WebSocket:",
          error,
          ultimoMensaje,
        );
      }
    }
  }, [ultimoMensaje]);

  // Estadísticas
  const contadorPendientes = peticiones.filter(
    (r) => r.estado === "pending",
  ).length;
  const contadorEnProgreso = peticiones.filter(
    (r) => r.estado === "in-progress",
  ).length;
  const contadorUrgentes = peticiones.filter(
    (r) => r.prioridad === "urgent",
  ).length;

  return (
    <div className="min-h-screen bg-auto-primary">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-auto-secondary/95 border-b border-auto shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                style={{
                  background:
                    "linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))",
                }}
              >
                <HotelIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-auto-primary">
                  Panel de Control ASL
                </h1>
                <p className="text-sm text-auto-secondary">
                  Gestión de Peticiones y Configuración
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-auto-tertiary">
                <div
                  className={`w-3 h-3 rounded-full ${estaConectado ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
                ></div>
                <span className="text-sm font-semibold text-auto-secondary">
                  {estaConectado ? "Conectado" : "Desconectado"}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm text-auto-tertiary">Admin</p>
                <p className="text-xs text-auto-tertiary">En línea 🟢</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <TarjetaEstadistica
            titulo="Peticiones Pendientes"
            valor={contadorPendientes}
            icono={<HourglassIcon />}
            color="var(--warning)"
          />
          <TarjetaEstadistica
            titulo="En Progreso"
            valor={contadorEnProgreso}
            icono={<ArrowRepeatIcon />}
            color="var(--hotel-secondary)"
          />
          <TarjetaEstadistica
            titulo="Urgentes"
            valor={contadorUrgentes}
            icono={<ExclamationTriangleIcon />}
            color="var(--problem)"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-auto-primary flex items-center gap-2">
                <InboxIcon className="w-7 h-7" />
                Peticiones Entrantes
              </h2>
              <span className="px-4 py-2 rounded-xl bg-auto-tertiary text-auto-primary font-bold">
                {peticiones.length} Total
              </span>
            </div>

            <div className="space-y-4">
              {peticiones.map((peticion) => (
                <TarjetaPeticion
                  key={peticion.id}
                  peticion={peticion}
                  onActualizarEstado={manejarActualizarEstado}
                />
              ))}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-auto-secondary rounded-2xl shadow-xl border-2 border-auto p-6 sticky top-24">
              <h2 className="text-xl font-bold text-auto-primary mb-6 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0" />
                  <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z" />
                </svg>
                Configuración de Servicios
              </h2>

              <div className="grid grid-cols-2 gap-2 mb-6">
                <button
                  onClick={() => setPestanaActiva("services")}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    pestanaActiva === "services"
                      ? "text-white shadow-lg"
                      : "bg-auto-tertiary text-auto-secondary hover:bg-auto"
                  }`}
                  style={
                    pestanaActiva === "services"
                      ? { backgroundColor: "var(--services)" }
                      : {}
                  }
                >
                  <BellIcon /> Servicios
                </button>
                <button
                  onClick={() => setPestanaActiva("room-service")}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    pestanaActiva === "room-service"
                      ? "text-white shadow-lg"
                      : "bg-auto-tertiary text-auto-secondary hover:bg-auto"
                  }`}
                  style={
                    pestanaActiva === "room-service"
                      ? { backgroundColor: "var(--room-service)" }
                      : {}
                  }
                >
                  <FoodIcon /> Room Service
                </button>
                <button
                  onClick={() => setPestanaActiva("problem")}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    pestanaActiva === "problem"
                      ? "text-white shadow-lg"
                      : "bg-auto-tertiary text-auto-secondary hover:bg-auto"
                  }`}
                  style={
                    pestanaActiva === "problem"
                      ? { backgroundColor: "var(--problem)" }
                      : {}
                  }
                >
                  <WarningIcon /> Problemas
                </button>
                <button
                  onClick={() => setPestanaActiva("extra")}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    pestanaActiva === "extra"
                      ? "text-white shadow-lg"
                      : "bg-auto-tertiary text-auto-secondary hover:bg-auto"
                  }`}
                  style={
                    pestanaActiva === "extra"
                      ? { backgroundColor: "var(--extra)" }
                      : {}
                  }
                >
                  <SparklesIcon /> Extra
                </button>
              </div>

              <div className="bg-auto-tertiary rounded-xl p-4 mb-4">
                <h3 className="font-bold text-auto-primary mb-3 flex items-center gap-2">
                  <PlusIcon /> Agregar Nuevo Servicio
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Nombre (ej: Parking)"
                    value={nuevoServicio.nombre}
                    onChange={(e) =>
                      setNuevoServicio({
                        ...nuevoServicio,
                        nombre: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-auto-secondary border-2 border-auto text-auto-primary text-sm focus:outline-none focus:ring-2"
                    style={
                      {
                        "--tw-ring-color": "var(--hotel-primary)",
                      } as React.CSSProperties
                    }
                  />
                  <input
                    type="text"
                    placeholder="Descripción"
                    value={nuevoServicio.descripcion}
                    onChange={(e) =>
                      setNuevoServicio({
                        ...nuevoServicio,
                        descripcion: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-auto-secondary border-2 border-auto text-auto-primary text-sm focus:outline-none focus:ring-2"
                    style={
                      {
                        "--tw-ring-color": "var(--hotel-primary)",
                      } as React.CSSProperties
                    }
                  />
                  <input
                    type="text"
                    placeholder="Emoji/Icono (ej: 🅿️)"
                    value={nuevoServicio.icono}
                    onChange={(e) =>
                      setNuevoServicio({
                        ...nuevoServicio,
                        icono: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-auto-secondary border-2 border-auto text-auto-primary text-sm focus:outline-none focus:ring-2"
                    style={
                      {
                        "--tw-ring-color": "var(--hotel-primary)",
                      } as React.CSSProperties
                    }
                  />
                  <button
                    onClick={manejarAgregarServicio}
                    className="w-full px-4 py-2 rounded-lg font-semibold text-white shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))",
                    }}
                  >
                    <PlusIcon /> Agregar
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                <h3 className="font-bold text-auto-primary mb-2 sticky top-0 bg-auto-secondary py-2">
                  Servicios Actuales
                </h3>
                {configuracionApp.servicios
                  .filter((s) => s.categoria === pestanaActiva)
                  .map((servicio) => (
                    <div
                      key={servicio.id}
                      className="bg-auto-tertiary rounded-lg p-3 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-2xl">{servicio.icono}</span>
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-auto-primary">
                            {servicio.nombre}
                          </p>
                          <p className="text-xs text-auto-secondary">
                            {servicio.descripcion}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            manejarCambiarEstadoServicio(servicio.id)
                          }
                          className={`px-2 py-1 rounded-md text-xs font-bold flex items-center justify-center ${
                            servicio.activo
                              ? "bg-green-500 text-white"
                              : "bg-gray-400 text-white"
                          }`}
                        >
                          {servicio.activo ? <CheckIcon /> : "✗"}
                        </button>
                        <button
                          onClick={() => manejarEliminarServicio(servicio.id)}
                          className="px-2 py-1 rounded-md text-xs font-bold bg-red-500 text-white hover:bg-red-600 flex items-center justify-center"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              <button
                onClick={manejarGuardarConfiguracion}
                className="w-full px-6 py-4 rounded-xl font-bold text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 mt-6 flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))",
                }}
              >
                <SaveIcon /> Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      </div>
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
    <div className="bg-auto-secondary rounded-2xl p-6 shadow-lg border-2 border-auto hover:scale-105 transition-transform">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-auto-tertiary font-medium mb-1">
            {titulo}
          </p>
          <p className="text-4xl font-extrabold" style={{ color }}>
            {valor}
          </p>
        </div>
        <div style={{ color }}>{icono}</div>
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
}

function TarjetaPeticion({
  peticion,
  onActualizarEstado,
}: PropsTarjetaPeticion) {
  const configTipo = {
    services: { etiqueta: "Servicios", icono: <BellIcon className="w-6 h-6" />, color: "var(--services)" },
    "room-service": {
      etiqueta: "Room Service",
      icono: <FoodIcon className="w-6 h-6" />,
      color: "var(--room-service)",
    },
    problem: { etiqueta: "Problema", icono: <WarningIcon className="w-6 h-6" />, color: "var(--problem)" },
    extra: { etiqueta: "Extra", icono: <SparklesIcon className="w-6 h-6" />, color: "var(--extra)" },
  };

  const configEstado = {
    pending: { etiqueta: "Pendiente", color: "var(--warning)" },
    "in-progress": { etiqueta: "En Progreso", color: "var(--hotel-secondary)" },
    completed: { etiqueta: "Completada", color: "var(--success)" },
  };

  const config = configTipo[peticion.tipo];
  const estado = configEstado[peticion.estado];

  const formatearTiempo = (fecha: Date) => {
    try {
      const marcaTiempo = fecha instanceof Date ? fecha : new Date(fecha);

      if (isNaN(marcaTiempo.getTime())) {
        return "Fecha inválida";
      }

      const diferencia = Date.now() - marcaTiempo.getTime();
      const minutos = Math.floor(diferencia / 60000);
      if (minutos < 1) return "Ahora mismo";
      if (minutos < 60) return `Hace ${minutos} min`;
      const horas = Math.floor(minutos / 60);
      return `Hace ${horas}h`;
    } catch (error) {
      console.error("Error al formatear fecha:", error);
      return "Fecha inválida";
    }
  };

  return (
    <div
      className="bg-auto-secondary rounded-xl p-5 shadow-lg border-l-4 hover:shadow-2xl transition-all"
      style={{ borderLeftColor: config.color }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: config.color }}
          >
            {config.icono}
          </div>
          <div>
            <h3 className="font-bold text-lg text-auto-primary">
              Habitación {peticion.numeroHabitacion}
            </h3>
            <p className="text-sm text-auto-secondary">
              {peticion.nombreHuesped}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className="px-3 py-1 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: config.color }}
          >
            {config.etiqueta}
          </span>
          {peticion.prioridad === "urgent" && (
            <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-500 text-white animate-pulse flex items-center gap-1">
              <ExclamationTriangleIcon className="w-4 h-4" />
              URGENTE
            </span>
          )}
        </div>
      </div>

      <div className="bg-auto-tertiary rounded-lg p-4 mb-3 border border-auto">
        <p className="text-sm text-auto-primary flex items-start gap-2 leading-relaxed">
          <ChatIcon className="mt-1 flex-shrink-0 text-auto-secondary w-3.5 h-3.5" />
          <span className="flex-1">{peticion.mensaje}</span>
        </p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-auto-tertiary flex items-center gap-1">
          <ClockIcon />
          {formatearTiempo(peticion.fecha)}
        </span>
        <span
          className="px-3 py-1 rounded-lg text-xs font-semibold"
          style={{ backgroundColor: estado.color, color: "#fff" }}
        >
          {estado.etiqueta}
        </span>
      </div>

      {/* Botones de actualización de estado - Flujo secuencial */}
      <div className="flex gap-2">
        {peticion.estado === "pending" && (
          <>
            {/* Solo avanzar a En Progreso */}
            <button
              onClick={() => onActualizarEstado(peticion.id, "in-progress")}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center gap-2"
              style={{
                backgroundColor: "var(--hotel-secondary)",
                color: "#fff",
              }}
              title="Comenzar a atender esta petición"
            >
              Atender <ArrowRepeatIcon className="w-4 h-4" />
            </button>
          </>
        )}

        {peticion.estado === "in-progress" && (
          <>
            {/* Retroceder a Pendiente */}
            <button
              onClick={() => onActualizarEstado(peticion.id, "pending")}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 border-2 flex items-center justify-center gap-1"
              style={{
                backgroundColor: "transparent",
                borderColor: "var(--warning)",
                color: "var(--warning)",
              }}
              title="Regresar a pendiente"
            >
              <ArrowLeftIcon /> Pendiente
            </button>

            {/* Avanzar a Completada */}
            <button
              onClick={() => onActualizarEstado(peticion.id, "completed")}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--success)", color: "#fff" }}
              title="Marcar como completada"
            >
              Completar <CheckCircleIcon />
            </button>
          </>
        )}

        {peticion.estado === "completed" && (
          <>
            {/* Retroceder a En Progreso */}
            <button
              onClick={() => onActualizarEstado(peticion.id, "in-progress")}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 border-2 flex items-center justify-center gap-1"
              style={{
                backgroundColor: "transparent",
                borderColor: "var(--hotel-secondary)",
                color: "var(--hotel-secondary)",
              }}
              title="Regresar a en progreso"
            >
              <ArrowLeftIcon /> Reabrir
            </button>

            <div
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-center flex items-center justify-center gap-2"
              style={{
                backgroundColor: "var(--success)",
                color: "#fff",
                opacity: 0.7,
              }}
            >
              Finalizada <CheckIcon />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Home;
