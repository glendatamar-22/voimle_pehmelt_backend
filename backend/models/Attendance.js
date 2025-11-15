import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  schedule: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule',
    required: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  present: {
    type: Boolean,
    default: false,
  },
  notes: {
    type: String,
    trim: true,
  },
  markedAt: {
    type: Date,
    default: Date.now,
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
});

// Compound index to prevent duplicates
attendanceSchema.index({ schedule: 1, student: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);

