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

### Ejecutar el proyecto

**Terminal 1 - Servidor WebSocket:**
```bash
cd server
npm start
```

**Terminal 2 - Panel Web:**
```bash
npm run dev
```

El panel web se ejecutará en `http://localhost:5173`
El servidor WebSocket en `ws://localhost:8080`

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
│   └── Home.tsx
├── hooks/           # Custom hooks
│   └── useWebSocket.ts
├── assets/          # Recursos estáticos
├── App.tsx          # Componente principal
├── main.tsx         # Punto de entrada
└── index.css        # Estilos globales

server/              # Servidor WebSocket
├── websocket-server.js
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


## 📝 Desarrollo

El proyecto utiliza:
- **Vite** para desarrollo rápido con HMR (Hot Module Replacement)
- **TypeScript** para type safety
- **React** para la interfaz de usuario
- **ESLint** para mantener calidad de código

