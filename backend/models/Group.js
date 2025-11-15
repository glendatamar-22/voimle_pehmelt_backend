import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  location: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  teachers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  students: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
    },
  ],
  parents: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Parent',
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Virtual for student count
groupSchema.virtual('studentCount').get(function () {
  return this.students ? this.students.length : 0;
});

export default mongoose.model('Group', groupSchema);

