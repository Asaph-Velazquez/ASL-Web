import mongoose from 'mongoose';
import { StaffUser } from '../models/index.js';
import { config } from 'dotenv';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/asl-hotel';

async function seedStaffUsers() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB conectado');

    // Verificar si el usuario admin ya existe
    const existingAdmin = await StaffUser.findOne({ username: 'admin' });
    if (existingAdmin) {
      console.log('✅ El usuario admin ya existe');
      console.log(`   Rol: ${existingAdmin.role}`);
      
      // Actualizar rol a admin si no esta asignado
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log('✅ Rol admin actualizado');
      }
      
      await mongoose.connection.close();
      return;
    }

    // Crear usuario admin por defecto
    const adminUser = new StaffUser({
      username: 'admin',
      password: 'hotel2026',
      fullName: 'Administrator',
      role: 'admin'
    });

    await adminUser.save();
    console.log('✅ Usuario admin por defecto creado correctamente');
    console.log('   Usuario: admin');
    console.log('   Contrasena: hotel2026');
    console.log('   Rol: admin');

  } catch (error) {
    console.error('❌ Error al sembrar usuarios de staff:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Conexion de MongoDB cerrada');
  }
}

seedStaffUsers();
