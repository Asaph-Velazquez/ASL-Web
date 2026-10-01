import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { StaffUser } from '../models/StaffUser.js';

export async function currentStaffIdentity(decoded) {
  if (!decoded?.userId || !mongoose.isObjectIdOrHexString(decoded.userId)
      || !['staff', 'admin'].includes(decoded.role) || (decoded.exp && decoded.exp * 1000 <= Date.now())) return null;
  const user = await StaffUser.findById(decoded.userId).select('username fullName role').maxTimeMS(4000);
  if (!user || user.role !== decoded.role) return null;
  return { ...decoded, username: user.username, fullName: user.fullName, role: user.role };
}

/**
 * Middleware de verificacion JWT
 * Extrae el token del encabezado Authorization, lo verifica y adjunta el payload en req.user
 */
export function verifyToken(req, res, next) {
  try {
    // Extraer token del encabezado Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Quitar prefijo 'Bearer '

    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Adjuntar payload decodificado a la solicitud
    req.user = decoded;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Token verification failed' });
  }
}

/**
 * Middleware para autenticar personal (staff/admin) via JWT
 */
export async function verifyStaffToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.userId || !['staff', 'admin'].includes(decoded.role)) {
      return res.status(403).json({ error: 'Access denied. Staff only.' });
    }

    const current = await currentStaffIdentity(decoded);
    if (!current) return res.status(403).json({ error: 'Staff access revoked' });
    req.user = current;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Token verification failed' });
  }
}

/**
 * Middleware para restringir endpoints a administradores
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }

  next();
}
