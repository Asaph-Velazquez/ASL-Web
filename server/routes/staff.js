import express from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { StaffUser } from '../models/index.js';

const router = express.Router();

/**
 * POST /api/staff/register
 * Creates a new StaffUser (for initial setup only)
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'username and password are required' 
      });
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ 
        error: 'username and password must be strings' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'password must be at least 6 characters' 
      });
    }

    // Check if username already exists
    const existingUser = await StaffUser.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Create new staff user (password will be hashed by pre-save hook)
    const staffUser = new StaffUser({
      username,
      password
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
 * Validates username/password against StaffUser model
 * Returns staff JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'username and password are required' 
      });
    }

    // Find staff user
    const staffUser = await StaffUser.findOne({ username });
    if (!staffUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare password using bcryptjs
    const isPasswordValid = await bcryptjs.compare(password, staffUser.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate staff JWT token
    const token = jwt.sign(
      {
        userId: staffUser._id,
        username: staffUser.username,
        role: 'staff'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ 
      token,
      username: staffUser.username 
    });
  } catch (error) {
    console.error('Error during staff login:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
