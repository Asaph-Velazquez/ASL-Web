import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import winston from 'winston';
import { z } from 'zod';

function isValidDateString(value) {
  return !Number.isNaN(new Date(value).getTime());
}

// =============================================================
// RATE LIMITING
// =============================================================

// Rate limit general - 100 solicitudes por 15 minutos
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limit estricto para login - 5 intentos por 15 minutos
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limit para registro de huéspedes - 10 por hora
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados registros. Espera una hora.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limit para WebSocket - 50 mensajes por minuto
export const wsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: 'Demasiados mensajes. Espera un momento.',
  standardHeaders: true,
  legacyHeaders: false
});

// =============================================================
// HELMET - Headers de seguridad HTTP
// =============================================================

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" }
});

// =============================================================
// CORS ESTRICTO
// =============================================================

export const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:5173', 'http://localhost:3001'];

    // Permitir requests sin origin (Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// =============================================================
// SANITIZACIÓN DE INPUT
// =============================================================

// Sanitizar req.body, req.query, req.params contra NoSQL injection
export const sanitizeInput = mongoSanitize({
  replaceWith: '_'
});

// =============================================================
// WINDSOR - Logs de auditoría
// =============================================================

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const auditLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    new winston.transports.File({
      filename: 'logs/audit.log',
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  auditLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Log simplificado para requests HTTP (para morgan)
export const httpLogStream = {
  write: (message) => {
    auditLogger.info(message.trim());
  }
};

// =============================================================
// EVENTOS DE SEGURIDAD A LOGUEAR
// =============================================================

export function logSecurityEvent(eventType, data) {
  const event = {
    eventType,
    timestamp: new Date().toISOString(),
    ...data
  };

  switch (eventType) {
    case 'LOGIN_ATTEMPT':
    case 'LOGIN_SUCCESS':
    case 'LOGIN_FAILED':
    case 'TOKEN_INVALID':
    case 'TOKEN_EXPIRED':
    case 'CORS_BLOCKED':
    case 'RATE_LIMIT_EXCEEDED':
    case 'INVALID_INPUT':
    case 'UNAUTHORIZED_ACCESS':
    case 'WEBSOCKET_UNAUTHORIZED':
      auditLogger.warn(event);
      break;
    case 'USER_CREATED':
    case 'USER_DELETED':
    case 'STAY_CREATED':
    case 'STAY_ENDED':
      auditLogger.info(event);
      break;
    default:
      auditLogger.info(event);
  }
}

// =============================================================
// VALIDACIÓN ZOD - Esquemas
// =============================================================

export const schemas = {
  // Login de staff
  staffLogin: z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6).max(100)
  }),

  // Registro de stay
  createStay: z.object({
    roomNumber: z.string().min(1).max(10).regex(/^[A-Za-z0-9-]+$/),
    guestName: z.string().max(100).optional(),
    checkIn: z.string().min(1).max(40).refine(isValidDateString, 'Formato de checkIn inválido'),
    checkOut: z.string().min(1).max(40).refine(isValidDateString, 'Formato de checkOut inválido')
  }),

  // Registro de huésped
  guestRegister: z.object({
    guestName: z.string().min(1).max(100)
  }),

  // Extensión de estancia
  extendStay: z.object({
    newCheckOut: z.string().min(1).max(40).refine(isValidDateString, 'Formato de nueva salida inválido')
  }),

  // Actualizar stay
  updateStay: z.object({
    roomNumber: z.string().min(1).max(10).optional(),
    guestName: z.string().max(100).optional(),
    active: z.boolean().optional()
  }),

  // Mensaje WebSocket
  wsMessage: z.object({
    type: z.enum(['NEW_REQUEST', 'UPDATE_REQUEST', 'CANCEL_REQUEST', 'RATE_REQUEST']),
    payload: z.record(z.unknown())
  })
};

// Middleware de validación Zod
export function validateBody(schema) {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      logSecurityEvent('INVALID_INPUT', {
        path: req.path,
        errors: error.errors
      });
      return res.status(400).json({
        error: 'Datos inválidos',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
  };
}

// =============================================================
// SANITIZACIÓN DE WEBSOCKET
// =============================================================

export function sanitizeWSMessage(data) {
  if (typeof data === 'string') {
    return data.replace(/[<>]/g, '').substring(0, 5000);
  }

  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        sanitized[key] = value.replace(/[<>]/g, '').substring(0, 1000);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return data;
}

// =============================================================
// TIMEOUT DE INACTIVIDAD WEBSOCKET
// =============================================================

export const WS_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutos
export const WS_PING_INTERVAL = 30 * 1000; // 30 segundos