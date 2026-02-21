import { useState, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

// Tipos de datos
interface Peticion {
  id: string;
  tipo: 'services' | 'room-service' | 'problem' | 'extra';
  numeroHabitacion: string;
  nombreHuesped: string;
  mensaje: string;
  fecha: Date;
  estado: 'pending' | 'in-progress' | 'completed';
  prioridad: 'low' | 'medium' | 'high' | 'urgent';
}

interface Servicio {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  categoria: 'services' | 'room-service' | 'problem' | 'extra';
  activo: boolean;
}

interface ConfiguracionApp {
  nombreHotel: string;
  servicios: Servicio[];
}

function Home() {
  const URL_WS = 'ws://localhost:8080';
  const { estaConectado, enviarMensaje, ultimoMensaje } = useWebSocket(URL_WS);

  const [peticiones, setPeticiones] = useState<Peticion[]>([]);
  const [configuracionApp, setConfiguracionApp] = useState<ConfiguracionApp>({
    nombreHotel: 'Hotel ASL Grand',
    servicios: [],
  });

  const [pestanaActiva, setPestanaActiva] = useState<'services' | 'room-service' | 'problem' | 'extra'>('services');
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: '', descripcion: '', icono: '' });

  // Manejadores de eventos
  const manejarAgregarServicio = () => {
    if (!nuevoServicio.nombre || !nuevoServicio.descripcion || !nuevoServicio.icono) {
      alert('Por favor completa todos los campos');
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

    setConfiguracionApp(prev => ({
      ...prev,
      servicios: [...prev.servicios, servicio],
    }));

    setNuevoServicio({ nombre: '', descripcion: '', icono: '' });
    alert('✅ Servicio agregado exitosamente');
  };

  const manejarCambiarEstadoServicio = (idServicio: string) => {
    setConfiguracionApp(prev => ({
      ...prev,
      servicios: prev.servicios.map(s => 
        s.id === idServicio ? { ...s, activo: !s.activo } : s
      ),
    }));
  };

  const manejarEliminarServicio = (idServicio: string) => {
    if (confirm('¿Estás seguro de eliminar este servicio?')) {
      setConfiguracionApp(prev => ({
        ...prev,
        servicios: prev.servicios.filter(s => s.id !== idServicio),
      }));
    }
  };

  const manejarGuardarConfiguracion = () => {
    enviarMensaje({
      type: 'UPDATE_CONFIG',
      payload: configuracionApp,
    });
    console.log('Configuración guardada:', configuracionApp);
    alert('Configuración guardada exitosamente ✅');
  };

  // Actualizar estado de peticiones
  const manejarActualizarEstado = (idPeticion: string, nuevoEstado: 'pending' | 'in-progress' | 'completed') => {
    enviarMensaje({
      type: 'UPDATE_REQUEST',
      payload: {
        id: idPeticion,
        status: nuevoEstado,
      },
    });

    // Actualizar localmente también
    setPeticiones(prev =>
      prev.map(pet =>
        pet.id === idPeticion ? { ...pet, estado: nuevoEstado } : pet
      )
    );

    console.log('✅ Estado actualizado:', idPeticion, '→', nuevoEstado);
  };

  // Escuchar mensajes de WebSocket
  useEffect(() => {
    if (ultimoMensaje) {
      try {
        switch (ultimoMensaje.type) {
          case 'NEW_REQUEST':
            // Mapear campos de inglés (app móvil) a español (dashboard)
            const payload = ultimoMensaje.payload;
            const nuevaPeticion: Peticion = {
              id: payload.id,
              tipo: payload.type,                          // type → tipo
              numeroHabitacion: payload.roomNumber,        // roomNumber → numeroHabitacion
              nombreHuesped: payload.guestName,            // guestName → nombreHuesped
              mensaje: payload.message,                    // message → mensaje
              prioridad: payload.priority,                 // priority → prioridad
              estado: payload.status,                      // status → estado
              fecha: new Date(payload.timestamp),          // timestamp → fecha
            };
            setPeticiones(prev => [nuevaPeticion, ...prev]);
            console.log('✅ Nueva petición recibida:', nuevaPeticion);
            break;
          case 'UPDATE_REQUEST':
            // Actualizar solo el estado de la petición
            const update = ultimoMensaje.payload;
            setPeticiones(prev => 
              prev.map(r => r.id === update.id 
                ? { ...r, estado: update.status || update.estado }
                : r
              )
            );
            console.log('🔄 Petición actualizada:', update);
            break;
          case 'CONFIG_UPDATED':
            console.log('⚙️ Configuración actualizada en servidor');
            break;
          default:
            console.log('⚠️ Mensaje no manejado:', ultimoMensaje);
        }
      } catch (error) {
        console.error('❌ Error al procesar mensaje WebSocket:', error, ultimoMensaje);
      }
    }
  }, [ultimoMensaje]);

  // Estadísticas
  const contadorPendientes = peticiones.filter(r => r.estado === 'pending').length;
  const contadorEnProgreso = peticiones.filter(r => r.estado === 'in-progress').length;
  const contadorUrgentes = peticiones.filter(r => r.prioridad === 'urgent').length;

  return (
    <div className="min-h-screen bg-auto-primary">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-auto-secondary/95 border-b border-auto shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div 
                className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                style={{ 
                  background: 'linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))',
                }}
              >
                <span className="text-3xl">🏨</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-auto-primary">Panel de Control ASL</h1>
                <p className="text-sm text-auto-secondary">Gestión de Peticiones y Configuración</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-auto-tertiary">
                <div className={`w-3 h-3 rounded-full ${estaConectado ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-sm font-semibold text-auto-secondary">
                  {estaConectado ? 'Conectado' : 'Desconectado'}
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
            icono="⏳"
            color="var(--warning)"
          />
          <TarjetaEstadistica 
            titulo="En Progreso"
            valor={contadorEnProgreso}
            icono="🔄"
            color="var(--hotel-secondary)"
          />
          <TarjetaEstadistica 
            titulo="Urgentes"
            valor={contadorUrgentes}
            icono="🚨"
            color="var(--problem)"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-auto-primary flex items-center gap-2">
                <span className="text-3xl">📥</span>
                Peticiones Entrantes
              </h2>
              <span className="px-4 py-2 rounded-xl bg-auto-tertiary text-auto-primary font-bold">
                {peticiones.length} Total
              </span>
            </div>

            <div className="space-y-4">
              {peticiones.map(peticion => (
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
                <span className="text-2xl">⚙️</span>
                Configuración de Servicios
              </h2>

              <div className="grid grid-cols-2 gap-2 mb-6">
                <button
                  onClick={() => setPestanaActiva('services')}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all ${
                    pestanaActiva === 'services'
                      ? 'text-white shadow-lg'
                      : 'bg-auto-tertiary text-auto-secondary hover:bg-auto'
                  }`}
                  style={pestanaActiva === 'services' ? { backgroundColor: 'var(--services)' } : {}}
                >
                  🛎️ Servicios
                </button>
                <button
                  onClick={() => setPestanaActiva('room-service')}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all ${
                    pestanaActiva === 'room-service'
                      ? 'text-white shadow-lg'
                      : 'bg-auto-tertiary text-auto-secondary hover:bg-auto'
                  }`}
                  style={pestanaActiva === 'room-service' ? { backgroundColor: 'var(--room-service)' } : {}}
                >
                  🍽️ Room Service
                </button>
                <button
                  onClick={() => setPestanaActiva('problem')}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all ${
                    pestanaActiva === 'problem'
                      ? 'text-white shadow-lg'
                      : 'bg-auto-tertiary text-auto-secondary hover:bg-auto'
                  }`}
                  style={pestanaActiva === 'problem' ? { backgroundColor: 'var(--problem)' } : {}}
                >
                  ⚠️ Problemas
                </button>
                <button
                  onClick={() => setPestanaActiva('extra')}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all ${
                    pestanaActiva === 'extra'
                      ? 'text-white shadow-lg'
                      : 'bg-auto-tertiary text-auto-secondary hover:bg-auto'
                  }`}
                  style={pestanaActiva === 'extra' ? { backgroundColor: 'var(--extra)' } : {}}
                >
                  ✨ Extra
                </button>
              </div>

              <div className="bg-auto-tertiary rounded-xl p-4 mb-4">
                <h3 className="font-bold text-auto-primary mb-3 flex items-center gap-2">
                  <span>➕</span> Agregar Nuevo Servicio
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Nombre (ej: Parking)"
                    value={nuevoServicio.nombre}
                    onChange={(e) => setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-auto-secondary border-2 border-auto text-auto-primary text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--hotel-primary)' } as React.CSSProperties}
                  />
                  <input
                    type="text"
                    placeholder="Descripción"
                    value={nuevoServicio.descripcion}
                    onChange={(e) => setNuevoServicio({ ...nuevoServicio, descripcion: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-auto-secondary border-2 border-auto text-auto-primary text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--hotel-primary)' } as React.CSSProperties}
                  />
                  <input
                    type="text"
                    placeholder="Emoji/Icono (ej: 🅿️)"
                    value={nuevoServicio.icono}
                    onChange={(e) => setNuevoServicio({ ...nuevoServicio, icono: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-auto-secondary border-2 border-auto text-auto-primary text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--hotel-primary)' } as React.CSSProperties}
                  />
                  <button
                    onClick={manejarAgregarServicio}
                    className="w-full px-4 py-2 rounded-lg font-semibold text-white shadow-md hover:shadow-lg transition-all"
                    style={{ 
                      background: 'linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))',
                    }}
                  >
                    ➕ Agregar
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                <h3 className="font-bold text-auto-primary mb-2 sticky top-0 bg-auto-secondary py-2">
                  Servicios Actuales
                </h3>
                {configuracionApp.servicios
                  .filter(s => s.categoria === pestanaActiva)
                  .map(servicio => (
                    <div 
                      key={servicio.id}
                      className="bg-auto-tertiary rounded-lg p-3 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-2xl">{servicio.icono}</span>
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-auto-primary">{servicio.nombre}</p>
                          <p className="text-xs text-auto-secondary">{servicio.descripcion}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => manejarCambiarEstadoServicio(servicio.id)}
                          className={`px-2 py-1 rounded-md text-xs font-bold ${
                            servicio.activo 
                              ? 'bg-green-500 text-white' 
                              : 'bg-gray-400 text-white'
                          }`}
                        >
                          {servicio.activo ? '✓' : '✗'}
                        </button>
                        <button
                          onClick={() => manejarEliminarServicio(servicio.id)}
                          className="px-2 py-1 rounded-md text-xs font-bold bg-red-500 text-white hover:bg-red-600"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              <button
                onClick={manejarGuardarConfiguracion}
                className="w-full px-6 py-4 rounded-xl font-bold text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 mt-6"
                style={{ 
                  background: 'linear-gradient(135deg, var(--hotel-primary), var(--hotel-secondary))',
                }}
              >
                💾 Guardar Configuración
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
  icono: string;
  color: string;
}

function TarjetaEstadistica({ titulo, valor, icono, color }: PropsTarjetaEstadistica) {
  return (
    <div className="bg-auto-secondary rounded-2xl p-6 shadow-lg border-2 border-auto hover:scale-105 transition-transform">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-auto-tertiary font-medium mb-1">{titulo}</p>
          <p className="text-4xl font-extrabold" style={{ color }}>{valor}</p>
        </div>
        <div className="text-5xl">{icono}</div>
      </div>
    </div>
  );
}

interface PropsTarjetaPeticion {
  peticion: Peticion;
  onActualizarEstado: (id: string, estado: 'pending' | 'in-progress' | 'completed') => void;
}

function TarjetaPeticion({ peticion, onActualizarEstado }: PropsTarjetaPeticion) {
  const configTipo = {
    services: { etiqueta: 'Servicios', icono: '🛎️', color: 'var(--services)' },
    'room-service': { etiqueta: 'Room Service', icono: '🍽️', color: 'var(--room-service)' },
    problem: { etiqueta: 'Problema', icono: '⚠️', color: 'var(--problem)' },
    extra: { etiqueta: 'Extra', icono: '✨', color: 'var(--extra)' },
  };

  const configEstado = {
    pending: { etiqueta: 'Pendiente', color: 'var(--warning)' },
    'in-progress': { etiqueta: 'En Progreso', color: 'var(--hotel-secondary)' },
    completed: { etiqueta: 'Completada', color: 'var(--success)' },
  };

  const config = configTipo[peticion.tipo];
  const estado = configEstado[peticion.estado];

  const formatearTiempo = (fecha: Date) => {
    try {
      const marcaTiempo = fecha instanceof Date ? fecha : new Date(fecha);
      
      if (isNaN(marcaTiempo.getTime())) {
        return 'Fecha inválida';
      }
      
      const diferencia = Date.now() - marcaTiempo.getTime();
      const minutos = Math.floor(diferencia / 60000);
      if (minutos < 1) return 'Ahora mismo';
      if (minutos < 60) return `Hace ${minutos} min`;
      const horas = Math.floor(minutos / 60);
      return `Hace ${horas}h`;
    } catch (error) {
      console.error('Error al formatear fecha:', error);
      return 'Fecha inválida';
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
            <h3 className="font-bold text-lg text-auto-primary">Habitación {peticion.numeroHabitacion}</h3>
            <p className="text-sm text-auto-secondary">{peticion.nombreHuesped}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span 
            className="px-3 py-1 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: config.color }}
          >
            {config.etiqueta}
          </span>
          {peticion.prioridad === 'urgent' && (
            <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-500 text-white animate-pulse">
              🚨 URGENTE
            </span>
          )}
        </div>
      </div>

      <div className="bg-auto-tertiary rounded-lg p-3 mb-3">
        <p className="text-sm text-auto-primary">💬 {peticion.mensaje}</p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-auto-tertiary">⏰ {formatearTiempo(peticion.fecha)}</span>
        <span 
          className="px-3 py-1 rounded-lg text-xs font-semibold"
          style={{ backgroundColor: estado.color, color: '#fff' }}
        >
          {estado.etiqueta}
        </span>
      </div>

      {/* Botones de actualización de estado - Flujo secuencial */}
      <div className="flex gap-2">
        {peticion.estado === 'pending' && (
          <>
            {/* Solo avanzar a En Progreso */}
            <button
              onClick={() => onActualizarEstado(peticion.id, 'in-progress')}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 shadow-md"
              style={{ backgroundColor: 'var(--hotel-secondary)', color: '#fff' }}
              title="Comenzar a atender esta petición"
            >
              Atender 🔄
            </button>
          </>
        )}
        
        {peticion.estado === 'in-progress' && (
          <>
            {/* Retroceder a Pendiente */}
            <button
              onClick={() => onActualizarEstado(peticion.id, 'pending')}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 border-2"
              style={{ 
                backgroundColor: 'transparent', 
                borderColor: 'var(--warning)', 
                color: 'var(--warning)' 
              }}
              title="Regresar a pendiente"
            >
              ← Pendiente
            </button>
            
            {/* Avanzar a Completada */}
            <button
              onClick={() => onActualizarEstado(peticion.id, 'completed')}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 shadow-md"
              style={{ backgroundColor: 'var(--success)', color: '#fff' }}
              title="Marcar como completada"
            >
              Completar ✅
            </button>
          </>
        )}
        
        {peticion.estado === 'completed' && (
          <>
            {/* Retroceder a En Progreso */}
            <button
              onClick={() => onActualizarEstado(peticion.id, 'in-progress')}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 border-2"
              style={{ 
                backgroundColor: 'transparent', 
                borderColor: 'var(--hotel-secondary)', 
                color: 'var(--hotel-secondary)' 
              }}
              title="Regresar a en progreso"
            >
              ← Reabrir
            </button>
            
            <div className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-center" 
                 style={{ backgroundColor: 'var(--success)', color: '#fff', opacity: 0.7 }}>
              Finalizada ✓
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Home;
