import mongoose from 'mongoose';
import argon2 from 'argon2';

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

staffUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await argon2.hash(this.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4
  });
  next();
});

staffUserSchema.methods.comparePassword = async function(password) {
  try {
    return await argon2.verify(this.password, password);
  } catch (_error) {
    return false;
  }
};

const StaffUser = mongoose.model('StaffUser', staffUserSchema);

export { StaffUser };
