import mongoose from 'mongoose';
import { StaffUser } from '../models/index.js';
import { config } from 'dotenv';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/asl-hotel';

async function seedStaffUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Check if admin user already exists
    const existingAdmin = await StaffUser.findOne({ username: 'admin' });
    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      await mongoose.connection.close();
      return;
    }

    // Create default admin user
    const adminUser = new StaffUser({
      username: 'admin',
      password: 'hotel2026'
    });

    await adminUser.save();
    console.log('✅ Default admin user created successfully');
    console.log('   Username: admin');
    console.log('   Password: hotel2026');

  } catch (error) {
    console.error('❌ Error seeding staff users:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  }
}

seedStaffUsers();
