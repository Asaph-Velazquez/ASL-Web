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
  createdAt: {
    type: Date,
    default: () => new Date()
  }
});

// Pre-save hook to hash password
staffUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcryptjs.hash(this.password, 10);
  next();
});

const StaffUser = mongoose.model('StaffUser', staffUserSchema);

export { StaffUser };
