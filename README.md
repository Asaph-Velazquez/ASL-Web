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

### Ejecutar el servidor de desarrollo

```bash
npm run dev
```

El servidor se ejecutará por defecto en `http://localhost:5173`

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
├── assets/          # Recursos estáticos
├── App.tsx          # Componente principal
├── main.tsx         # Punto de entrada
└── index.css        # Estilos globales

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
- **ASL-MobileApp**: Recibe peticiones de la aplicación móvil que ya incluye el procesamiento de lenguaje de señas integrado

**Nota**: El procesamiento de lenguaje de señas (ASL-IA) está integrado directamente en la aplicación móvil. Este panel web solo visualiza las peticiones ya procesadas.

## 📝 Desarrollo

El proyecto utiliza:
- **Vite** para desarrollo rápido con HMR (Hot Module Replacement)
- **TypeScript** para type safety
- **React** para la interfaz de usuario
- **ESLint** para mantener calidad de código

