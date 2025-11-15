import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import studentRoutes from './routes/students.js';
import updateRoutes from './routes/updates.js';
import scheduleRoutes from './routes/schedules.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/upload.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// CORS configuration for Võimle Pehmelt
const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5174';

const corsOptions = {
    origin: frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/updates', updateRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// TEMPORARY: Full seed database endpoint - REMOVE after using!
app.get('/api/seed-full', async (req, res) => {
    try {
      const User = (await import('./models/User.js')).default;
      const Group = (await import('./models/Group.js')).default;
      const Student = (await import('./models/Student.js')).default;
      const Parent = (await import('./models/Parent.js')).default;
      const Schedule = (await import('./models/Schedule.js')).default;
      const Update = (await import('./models/Update.js')).default;
  
      // Clear existing data
      await User.deleteMany({});
      await Group.deleteMany({});
      await Student.deleteMany({});
      await Parent.deleteMany({});
      await Schedule.deleteMany({});
      await Update.deleteMany({});
  
      // Create admin
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@tantsukool.ee',
        password: 'admin123',
        role: 'admin',
      });
  
      // Create teachers
      const teachers = [];
      for (let i = 0; i < 5; i++) {
        const teacher = await User.create({
          name: `Õpetaja ${i + 1}`,
          email: `teacher${i + 1}@tantsukool.ee`,
          password: 'teacher123',
          role: 'teacher',
        });
        teachers.push(teacher);
      }
  
      // Create groups
      const groupNames = [
        'Laste Tantsugrupp',
        'Noorte Tantsugrupp',
        'Kontemporaarne Tants',
        'Balleti Algajad',
        'Hip-Hop Tants',
      ];
      
      const locations = ['Tallinn', 'Tartu', 'Narva', 'Pärnu', 'Viljandi'];
  
      const groups = [];
      for (let i = 0; i < 5; i++) {
        const group = await Group.create({
          name: groupNames[i],
          location: locations[i],
          description: `${groupNames[i]} asub ${locations[i]}s.`,
          teachers: [teachers[i]._id],
        });
        groups.push(group);
  
        teachers[i].assignedGroups.push(group._id);
        await teachers[i].save();
      }
  
      res.json({ 
        success: true,
        message: 'Full database seeded successfully!',
        created: {
          users: 6,
          groups: groups.length,
          admin: 'admin@tantsukool.ee / admin123',
          teachers: 'teacher1@tantsukool.ee / teacher123 (and teacher2-5)'
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

// Error handler
app.use(errorHandler);

// Connect to MongoDB (shared database with Minu Tantsukool, different database name)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/voimle_pehmelt';

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

export default app;