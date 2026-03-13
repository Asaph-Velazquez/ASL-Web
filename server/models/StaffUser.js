import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

const staffUserSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  fullName: {
    type: String,
    required: false
  },
  role: {
    type: String,
    enum: ['staff', 'admin'],
    default: 'staff'
  },
  createdAt: {
    type: Date,
    default: () => new Date()
  }
});

// Hook pre-save para hashear la contrasena
staffUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcryptjs.hash(this.password, 10);
  next();
});

const StaffUser = mongoose.model('StaffUser', staffUserSchema);

export { StaffUser };
