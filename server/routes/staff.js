import express from 'express';
import jwt from 'jsonwebtoken';
import { StaffUser } from '../models/index.js';
import { loginLimiter, validateBody, schemas } from '../middleware/security.js';
import { verifyStaffToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/staff/register
 * Crea un nuevo StaffUser (solo para configuracion inicial)
 */
router.post('/register', async (req, res) => {
  try {
    const totalUsers = await StaffUser.countDocuments();
    if (totalUsers > 0) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Admin token required' });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin only.' });
      }
    }

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
 * Valida usuario/contraseña contra el modelo StaffUser
**/
router.post('/login', loginLimiter, validateBody(schemas.staffLogin), async (req, res) => {
  try {
    const { username, password } = req.body;

    const normalizedUsername = username.trim();

    // Buscar usuario de staff
    const staffUser = await StaffUser.findOne({ username: normalizedUsername });
    if (!staffUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await staffUser.comparePassword(password);
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

// Todas las rutas de administracion de staff requieren admin autenticado
router.use(verifyStaffToken, requireAdmin);

/**
 * GET /api/staff/list
 * Retorna lista de todos los usuarios staff (solo admin)
 */
router.get('/list', async (req, res) => {
  try {
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
 * PUT /api/staff/update/:id
 * Actualiza usuario, nombre completo y rol de un usuario (solo admin)
 */
router.put('/update/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, fullName, role } = req.body;

    // Validar entrada
    if (!username || !fullName || !role) {
      return res.status(400).json({ error: 'username, fullName and role are required' });
    }

    if (typeof username !== 'string' || typeof fullName !== 'string') {
      return res.status(400).json({ error: 'username and fullName must be strings' });
    }

    const normalizedUsername = username.trim();
    const normalizedFullName = fullName.trim();

    if (!normalizedUsername || !normalizedFullName) {
      return res.status(400).json({ error: 'username and fullName cannot be empty' });
    }

    if (!['staff', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Verificar duplicidad de username
    const existingUsername = await StaffUser.findOne({ username: normalizedUsername, _id: { $ne: id } });
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const updatedUser = await StaffUser.findByIdAndUpdate(
      id,
      {
        username: normalizedUsername,
        fullName: normalizedFullName,
        role,
      },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'User updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/staff/delete/:id
 * Elimina un usuario de staff (solo admin)
 */
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Evitar autoeliminacion
    if (String(req.user.userId) === id) {
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
