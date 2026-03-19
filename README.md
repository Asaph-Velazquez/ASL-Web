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
src/
├── components/      # Componentes reutilizables
│   ├── Home.tsx
│   └── modals/      # Componentes de modales
├── hooks/           # Custom hooks
│   └── useWebSocket.ts
├── assets/          # Recursos estáticos
├── App.tsx          # Componente principal
├── main.tsx         # Punto de entrada
└── index.css        # Estilos globales

server/              # Servidor WebSocket + API
├── index.js         # Servidor principal
├── models/          # Esquemas de base de datos
├── routes/          # Rutas API
├── services/        # Lógica de negocio
├── middleware/      # Middleware Express
├── .env.example     # Variables de entorno (ejemplo)
├── .env             # Variables de entorno (local - no commitear)
├── package.json
└── README.md

public/              # Archivos públicos estáticos
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
│                 │   WebSocket        │   Port: 8080     │   WebSocket        │                 │
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

