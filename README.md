# 🌐 ASL Web Panel

Panel web para visualizar y gestionar las peticiones enviadas desde la aplicación móvil ASL, facilitando la comunicación entre huéspedes y el personal del hotel.

## 📋 Características

### Panel de Visualización
- Recepción y visualización de peticiones desde la aplicación móvil
- Dashboard en tiempo real de solicitudes de huéspedes
- Interfaz para que el personal del hotel pueda ver y responder peticiones

### Tipos de Peticiones
- Servicios del hotel
- Room Service
- Reportes de problemas
- Servicios extra

## 🚀 Comenzar

### Instalación

```bash
npm install
```

### Instalar el servidor WebSocket

```bash
cd server
npm install
cd ..
```

### Configurar Variables de Entorno

#### Para el Servidor WebSocket

1. Dirígete a la carpeta del servidor:
```bash
cd server
```

2. Crea un archivo `.env` basado en `.env.example`:
```bash
cp .env.example .env
```

3. Edita el archivo `.env` con tus valores:
```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/asl-hotel
JWT_SECRET=tu-clave-secreta-segura
```

**Variables disponibles:**
- `PORT`: Puerto donde se ejecutará el servidor (default: 3001)
- `MONGODB_URI`: Conexión a MongoDB (local o Atlas)
- `JWT_SECRET`: Clave para firmar tokens JWT (⚠️ cambiar en producción)

Para generar una `JWT_SECRET` segura:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Ejecutar el proyecto

Asegúrate de que MongoDB esté ejecutándose antes de iniciar el servidor.

**Terminal 1 - Servidor WebSocket:**
```bash
cd server
npm start
```

Deberías ver:
```
✅ MongoDB conectado correctamente
🚀 Servidor HTTP + WebSocket iniciado en:
   - HTTP: http://localhost:3001
   - WebSocket: ws://localhost:3001
```

**Terminal 2 - Panel Web:**
```bash
npm run dev
```

El panel web se ejecutará en `http://localhost:5173`

### Aplicación de escritorio del staff (Tauri 2)

El panel también se empaqueta como **ASL Staff** para Windows x64. Incluye la
interfaz React y usa `utilities/images/Hotel.png` como icono. El servidor del
hotel, MongoDB y el gateway se ejecutan por separado. Las cuentas y permisos
Staff/Admin siguen validándose en ASL-Web; el rol Interpreter continúa limitado
a la consola de llamadas. La app tiene su propia carpeta de datos y sesión,
separada de ASL Interpreter.

Para compilar necesitas Node.js, Rust con toolchain MSVC, Visual Studio Build
Tools con C++ para escritorio y Windows SDK, y WebView2. Requisitos oficiales:
https://v2.tauri.app/start/prerequisites/

Desde `ASL-Web`, para desarrollo local con el backend en `localhost:3001`:

```powershell
npm ci
npm run desktop:dev
```

Tauri inicia Vite en el puerto 5173 y abre la ventana de escritorio. Si ese puerto
ya está ocupado por el panel web iniciado con `run.ps1`, detén esa instancia
antes de usar `desktop:dev`. Las pantallas desktop usan rutas hash (`#/stays`,
`#/statistics`, etc.) para mantener la navegación y recarga dentro del paquete.

Para generar una versión que conecte desde otra computadora:

```powershell
Copy-Item .env.desktop.example .env.desktop.local
# Edita las dos URLs con el gateway HTTPS/WSS real del hotel.
npm run desktop:build
```

```env
VITE_API_URL=https://your-hotel-gateway.example
VITE_WS_URL=wss://your-hotel-gateway.example/ws/hotel
```

El modo `desktop` usa `.env` y después `.env.desktop.local`; las variables del
proceso tienen prioridad. Para pruebas en la computadora del servidor puedes
usar `http://localhost:3001` y `ws://localhost:3001/ws/hotel`. En otra computadora,
localhost apunta a esa computadora. Las URLs se integran al compilar: si cambia
el dominio, recompila. No incluyas secretos del backend en variables `VITE_*`.

El instalador queda en `src-tauri/target/release/bundle/nsis/` y el ejecutable en
`src-tauri/target/release/asl-staff.exe`. Se instala por usuario y descarga el
instalador de WebView2 si falta, por lo que ese paso requiere Internet. El paquete
generado no está firmado digitalmente. Conserva `package-lock.json` y
`src-tauri/Cargo.lock` para reproducir la compilación. `npm run desktop:icons`
regenera los iconos a partir del logo del hotel.

Reinicia el backend actualizado para admitir los origins locales exactos de
Tauri en CORS. La app usa HTTP/WebSocket con los mismos tokens y controles de
rol del panel web; no solicita acceso nativo al sistema de archivos ni incorpora
el servidor dentro del instalador. El gateway vigente es Nginx en 8080 para
desarrollo, publicado por HTTPS si se necesita acceso remoto.

Antes de distribuir, comprueba login, solicitudes en tiempo real, navegación y
recarga, gestión de estancias y personal, reportes, estadísticas, impresión y
descarga de QR, descarga de logs y cierre de sesión en la computadora destino.

Verificación del empaquetado (2026-10-08): lint, build web y build Tauri/NSIS x64
aprobados; instalador de 1.96 MiB. El ejecutable inicia y responde con título
**ASL Staff Control Panel**. Las 27 comprobaciones HTTP/MongoDB/WebSocket pasan
con una base aislada, incluyendo CORS y preflight de Tauri y permisos del staff.
La base temporal se elimina al terminar. `cargo fmt --check`, `node --check` y
`git diff --check` pasan. La versión generada apunta a `localhost:3001`.
No se verificaron visualmente las pantallas ni la impresión/descarga dentro
de la app instalada; tampoco se instaló en otra computadora.

### Tunel publico unico para mobile y videollamada

Cuando necesites exponer el sistema hacia la app movil o pruebas remotas, el punto de entrada recomendado es solo `ASL-Web/server`:

- publica `http://localhost:3001` con `ngrok`
- manten `ASL-CallAPP/server` en `http://localhost:3101` como upstream interno
- el backend web reenvia `/calls` y `/api/interpreter/*` al servidor de llamadas

Con esto, el dominio publico del tunel sirve tanto para:

- API y WebSocket operativos del hotel
- `call session` consumida por la app movil
- WebSocket de videollamada y endpoints del interprete proxied desde el backend web

No se recomienda exponer `3101` por separado en el runbook base, especialmente si trabajas con un solo dominio `ngrok free`.

### Dockerizar solo el server

La carpeta [`server`](C:\Users\samur\Downloads\TT\ASL-System\ASL-Web\server) ya incluye:
- `Dockerfile` para construir la imagen del backend
- `.dockerignore` para no subir dependencias, logs ni secretos locales
- `compose.yaml` para levantar backend + MongoDB en contenedores

#### Opción 1: Ejecutar solo el backend en Docker

Desde `ASL-Web/server`:

```bash
docker build -t asl-server .
docker run --env-file .env -p 3001:3001 asl-server
```

Si MongoDB está fuera del contenedor, configura `MONGODB_URI` con el host real antes de levantarlo. Para despliegue en nube, normalmente conviene usar Mongo Atlas u otra base administrada.

#### Opción 2: Backend + MongoDB con Docker Compose

Desde `ASL-Web/server`:

```bash
docker compose up --build
```

Esto expone:
- API/WebSocket en `http://localhost:3001`
- MongoDB en `mongodb://localhost:27017`

Para este modo, el `compose.yaml` ya fuerza `MONGODB_URI=mongodb://mongodb:27017/asl-hotel` dentro de la red interna de Docker.

#### Notas para nube

- No incluyas `.env` dentro de la imagen; inyéctalo con variables del proveedor.
- En cloud normalmente `USE_HTTPS=false`, porque el HTTPS lo termina el balanceador o proxy.
- Los logs del contenedor se complementan con el volumen `./logs:/app/logs`; en producción puedes cambiarlo por almacenamiento persistente o logging centralizado.

### Compilar para producción

```bash
npm run build
```

### Vista previa de la compilación

```bash
npm run preview
```

## 🛠️ Tecnologías

- **Framework**: React 18
- **Build Tool**: Vite
- **TypeScript**: Para type safety
- **ESLint**: Para linting y calidad de código

## 📁 Estructura del Proyecto

```
ASL-Web/
├── src/                         # Aplicacion React + Vite
│   ├── components/              # Vistas y componentes principales
│   │   ├── Home.tsx             # Dashboard de peticiones en tiempo real
│   │   ├── Login.tsx            # Inicio de sesion del personal
│   │   ├── Register.tsx         # Registro de usuarios autorizados
│   │   ├── StaffManagement.tsx  # Gestion de personal
│   │   ├── Statistics.tsx       # Estadisticas de solicitudes/calificaciones
│   │   ├── StayManagement.tsx   # Gestion de estancias y codigos QR
│   │   └── modals/              # Modales reutilizables
│   ├── hooks/
│   │   └── useWebSocket.ts      # Conexion WebSocket del panel
│   ├── App.tsx                  # Rutas principales
│   ├── main.tsx                 # Punto de entrada
│   └── index.css                # Estilos globales
├── server/                      # API HTTP + WebSocket + MongoDB
│   ├── index.js                 # Servidor Express y WebSocket
│   ├── middleware/              # Autenticacion, seguridad, CORS y rate limits
│   ├── models/                  # Modelos Mongoose
│   ├── routes/                  # Rutas de auth, estancias, staff y stats
│   ├── services/                # Persistencia y ciclo de vida de estancias
│   ├── scripts/                 # Scripts administrativos
│   ├── utils/                   # Utilidades como generacion QR
│   ├── Dockerfile
│   ├── compose.yaml
│   ├── .env.example
│   └── package.json
├── utilities/images/            # Recursos graficos del panel
├── package.json                 # Scripts y dependencias del frontend
├── vite.config.ts
├── tsconfig.json
└── eslint.config.js
```

## 🧪 Scripts Disponibles

```bash
npm run dev        # Iniciar servidor de desarrollo
npm run build      # Compilar para producción
npm run preview    # Vista previa de la compilación
npm run lint       # Ejecutar linter
```

## 🔗 Integración

### Opciones de transporte

Al publicar `PUBLISH_TRANSPORT_OPTIONS`, cada opcion incluye `vehicles` con
exactamente `vehicleCount` entradas. Cada entrada requiere `vehiclePlate` y
`vehicleModel` (1-100 caracteres); las placas son unicas dentro de la opcion.
`description` queda disponible para notas adicionales opcionales.
La app movil muestra placa y modelo antes de que el huesped elija. La aceptacion
conserva una copia de la opcion y `Assign vehicles` precarga sus vehiculos;
el staff puede agregar `vehicleColor` opcional y guardar la asignacion.
Las asignaciones ya guardadas conservan sus valores al volver a abrir el modal.
Las propuestas antiguas sin `vehicles` siguen siendo aceptables y permiten
captura manual al asignar; al publicar una nueva revision se requieren los campos.

Este panel web se comunica con:
- **ASL-MobileApp**: Recibe peticiones en tiempo real vía WebSocket de la aplicación móvil que ya incluye el procesamiento de lenguaje de señas integrado
- **ASL-CallAPP/server**: Actua como upstream interno para presencia de interpretes, senalizacion y reportes de videollamada cuando el backend web opera como gateway publico unico

**Nota**: El procesamiento de lenguaje de señas (ASL-IA) está integrado directamente en la aplicación móvil. Este panel web solo visualiza las peticiones ya procesadas.

### Flujo de Comunicación

1. **App Móvil** → Procesa lenguaje de señas con ASL-IA
2. **App Móvil** → Envía petición al servidor WebSocket
3. **Servidor WebSocket** → Reenvía petición al Panel Web
4. **Panel Web** → Muestra petición en tiempo real al personal del hotel


## 🏗️ Arquitectura

```
┌─────────────────┐                    ┌──────────────────┐                    ┌─────────────────┐
│   APP MÓVIL     │                    │  SERVIDOR WS     │                    │   PANEL WEB     │
│  (React Native) │ ◄─────────────────►│  (Node.js + ws)  │◄──────────────────►│  (React + Vite) │
│                 │   WebSocket        │   Port: 3001     │   WebSocket        │                 │
└─────────────────┘                    └──────────────────┘                    └─────────────────┘
```


## ⚙️ Configuración Importante

### Variables de Entorno

**El archivo `.env` contiene secretos y NO debe ser commiteado.**

El repositorio incluye `.env.example` como referencia. Cada desarrollador debe:

1. Copiar `.env.example` a `.env`
2. Actualizar los valores según su entorno local
3. El `.env` está en `.gitignore` para proteger secretos

### MongoDB

Para desarrollo local, asegúrate de tener MongoDB instalado y ejecutándose:

```bash
# macOS (con Homebrew)
brew services start mongodb-community

# Windows (si instalaste como servicio)
net start MongoDB

# O ejecutar MongoDB directamente
mongod
```

### JWT_SECRET en Producción

Genera una clave segura:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Luego actualiza `JWT_SECRET` en tu `.env` de producción.

## 📝 Desarrollo

El proyecto utiliza:
- **Vite** para desarrollo rápido con HMR (Hot Module Replacement)
- **TypeScript** para type safety
- **React** para la interfaz de usuario
- **Express + WebSocket** para el servidor backend
- **MongoDB + Mongoose** para persistencia de datos
- **JWT** para autenticación segura
- **ESLint** para mantener calidad de código
