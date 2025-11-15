import express from 'express';
import Schedule from '../models/Schedule.js';
import Attendance from '../models/Attendance.js';
import Group from '../models/Group.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Estonian school holidays 2024-2026
const ESTONIAN_HOLIDAYS = [
  ['2024-10-21', '2024-10-27'], // I vaheaeg (autumn break)
  ['2024-12-23', '2025-01-05'], // II vaheaeg (winter break)
  ['2025-02-24', '2025-03-02'], // III vaheaeg (spring break)
  ['2025-04-14', '2025-04-20'], // IV vaheaeg (Easter break)
  ['2025-06-10', '2025-08-31'], // V vaheaeg (summer break)
  ['2025-10-20', '2025-10-26'], // I vaheaeg 2025-2026
  ['2025-12-22', '2026-01-04'], // II vaheaeg 2025-2026
  ['2026-02-23', '2026-03-01'], // III vaheaeg 2025-2026
  ['2026-04-06', '2026-04-12'], // IV vaheaeg 2025-2026
  ['2026-06-09', '2026-08-31'], // V vaheaeg 2025-2026
];

const isHoliday = (date) => {
  const dateStr = date.toISOString().split('T')[0];
  return ESTONIAN_HOLIDAYS.some(([start, end]) => dateStr >= start && dateStr <= end);
};

// @route   GET /api/schedules
// @desc    Get schedules (optionally filtered by group)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    if (req.query.groupId) {
      query.group = req.query.groupId;
    }

    if (req.query.startDate && req.query.endDate) {
      query.date = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    const schedules = await Schedule.find(query)
      .populate('group', 'name location')
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      data: schedules,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/schedules/:id
// @desc    Get single schedule
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id)
      .populate('group', 'name location');

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found',
      });
    }

    res.json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   POST /api/schedules
// @desc    Create new schedule
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const schedule = await Schedule.create(req.body);

    res.status(201).json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   POST /api/schedules/generate-bulk
// @desc    Generate bulk schedules for a group (full year)
// @access  Private (Admin only)
router.post('/generate-bulk', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to generate bulk schedules',
      });
    }

    const {
      groupId,
      startDate,
      endDate,
      dayOfWeek, // 0 = Sunday, 1 = Monday, etc.
      startTime,
      endTime,
      location,
      title,
    } = req.body;

    // Validate group exists
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const schedulesToCreate = [];

    // Find first occurrence of dayOfWeek
    let currentDate = new Date(start);
    while (currentDate.getDay() !== parseInt(dayOfWeek)) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Generate weekly schedules
    while (currentDate <= end) {
      // Skip holidays
      if (!isHoliday(currentDate)) {
        schedulesToCreate.push({
          group: groupId,
          title: title || `${group.name} - Trenn`,
          date: new Date(currentDate),
          startTime,
          endTime,
          location: location || group.location,
        });
      }

      // Move to next week
      currentDate.setDate(currentDate.getDate() + 7);
    }

    // Bulk insert
    const createdSchedules = await Schedule.insertMany(schedulesToCreate);

    res.status(201).json({
      success: true,
      data: createdSchedules,
      message: `${createdSchedules.length} trenni loodud`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PUT /api/schedules/:id
// @desc    Update schedule
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found',
      });
    }

    res.json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   DELETE /api/schedules/:id
// @desc    Delete schedule
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found',
      });
    }

    // Also delete associated attendance records
    await Attendance.deleteMany({ schedule: schedule._id });

    await schedule.deleteOne();

    res.json({
      success: true,
      message: 'Schedule deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   POST /api/schedules/:id/attendance
// @desc    Mark attendance for a schedule
// @access  Private
router.post('/:id/attendance', protect, async (req, res) => {
  try {
    const { studentId, present, notes } = req.body;

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found',
      });
    }

    // Upsert attendance
    const attendance = await Attendance.findOneAndUpdate(
      { schedule: req.params.id, student: studentId },
      {
        present,
        notes,
        markedBy: req.user._id,
        markedAt: new Date(),
      },
      { upsert: true, new: true }
    ).populate('student', 'firstName lastName');

    res.json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/schedules/group/:groupId/attendance
// @desc    Get attendance summary for a group
// @access  Private
router.get('/group/:groupId/attendance', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get all schedules for this group in date range
    const query = { group: req.params.groupId };
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const schedules = await Schedule.find(query).sort({ date: 1 });
    const scheduleIds = schedules.map((s) => s._id);

    // Get all attendance records
    const attendanceRecords = await Attendance.find({
      schedule: { $in: scheduleIds },
    })
      .populate('student', 'firstName lastName')
      .populate('schedule', 'date');

    // Get all students in group
    const group = await Group.findById(req.params.groupId).populate('students');

    // Build attendance matrix
    const attendanceByStudent = {};
    group.students.forEach((student) => {
      attendanceByStudent[student._id] = {
        student,
        totalLessons: schedules.length,
        attended: 0,
        records: [],
      };
    });

    attendanceRecords.forEach((record) => {
      const studentId = record.student._id.toString();
      if (attendanceByStudent[studentId]) {
        attendanceByStudent[studentId].records.push(record);
        if (record.present) {
          attendanceByStudent[studentId].attended += 1;
        }
      }
    });

    res.json({
      success: true,
      data: {
        schedules,
        attendanceByStudent: Object.values(attendanceByStudent),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
