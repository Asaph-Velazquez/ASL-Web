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

Este panel web se comunica con:
- **ASL-MobileApp**: Recibe peticiones en tiempo real vía WebSocket de la aplicación móvil que ya incluye el procesamiento de lenguaje de señas integrado

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

⚠️ **IMPORTANTE**: Nunca uses la clave de ejemplo en producción.

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
