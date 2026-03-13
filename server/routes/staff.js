import express from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { StaffUser } from '../models/index.js';

const router = express.Router();

/**
 * POST /api/staff/register
 * Crea un nuevo StaffUser (solo para configuracion inicial)
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password, fullName, role } = req.body;

    // Validar entrada
    if (!username || !password || !fullName) {
      return res.status(400).json({ 
        error: 'username, password, and fullName are required' 
      });
    }

    if (typeof username !== 'string' || typeof password !== 'string' || typeof fullName !== 'string') {
      return res.status(400).json({ 
        error: 'username, password, and fullName must be strings' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'password must be at least 6 characters' 
      });
    }

    // Verificar si el nombre de usuario ya existe
    const existingUser = await StaffUser.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Crear nuevo usuario de staff (la contrasena se hashea en pre-save)
    const staffUser = new StaffUser({
      username,
      password,
      fullName: fullName,
      role: role || 'staff' // Valor por defecto: 'staff'
    });

    await staffUser.save();

    return res.status(201).json({ 
      message: 'Staff user created successfully',
      username: staffUser.username 
    });
  } catch (error) {
    console.error('Error registering staff user:', error);
    return res.status(500).json({ error: 'Failed to register staff user' });
  }
});

/**
 * POST /api/staff/login
 * Valida usuario/contrasena contra el modelo StaffUser
 * Retorna token JWT de staff
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validar entrada
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'username and password are required' 
      });
    }

    // Buscar usuario de staff
    const staffUser = await StaffUser.findOne({ username });
    if (!staffUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Comparar contrasena con bcryptjs
    const isPasswordValid = await bcryptjs.compare(password, staffUser.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generar token JWT de staff
    const token = jwt.sign(
      {
        userId: staffUser._id,
        username: staffUser.username,
        role: staffUser.role || 'staff'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ 
      token,
      username: staffUser.username,
      role: staffUser.role || 'staff'
    });
  } catch (error) {
    console.error('Error during staff login:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/staff/list
 * Retorna lista de todos los usuarios staff (solo admin)
 */
router.get('/list', async (req, res) => {
  try {
    // Obtener token del encabezado
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar si el usuario es admin
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    // Obtener todos los usuarios de staff (sin contrasena)
    const users = await StaffUser.find({}, '-password').sort({ createdAt: -1 });

    return res.json({ users });
  } catch (error) {
    console.error('Error fetching staff list:', error);
    return res.status(500).json({ error: 'Failed to fetch staff list' });
  }
});

/**
 * PUT /api/staff/update-role
 * Actualiza el rol de un usuario (solo admin)
 */
router.put('/update-role', async (req, res) => {
  try {
    const { userId, role } = req.body;

    // Validar entrada
    if (!userId || !role) {
      return res.status(400).json({ error: 'userId and role are required' });
    }

    if (!['staff', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Obtener token del encabezado
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar si el usuario es admin
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    // Actualizar rol de usuario
    const updatedUser = await StaffUser.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ 
      message: 'Role updated successfully',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Error updating role:', error);
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * DELETE /api/staff/delete/:id
 * Elimina un usuario de staff (solo admin)
 */
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener token del encabezado
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar si el usuario es admin
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    // Evitar autoeliminacion
    if (decoded.userId === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Eliminar usuario
    const deletedUser = await StaffUser.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ 
      message: 'User deleted successfully',
      username: deletedUser.username 
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
