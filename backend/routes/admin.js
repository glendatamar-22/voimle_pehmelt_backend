import express from 'express';
import User from '../models/User.js';
import Group from '../models/Group.js';
import Student from '../models/Student.js';
import Parent from '../models/Parent.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require admin role
router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin/users
// @desc    Get all users
// @access  Private (Admin only)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('assignedGroups', 'name location')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PUT /api/admin/users/:id
// @desc    Update user (name, email, password, assign groups, change roles)
// @access  Private (Admin only)
router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, password, assignedGroups, role, roles } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (password) user.password = password; // Will be hashed by pre-save hook
    if (assignedGroups !== undefined) user.assignedGroups = assignedGroups;
    if (role) user.role = role;
    if (roles && Array.isArray(roles)) {
      user.roles = roles;
      // Set primary role to first role in array
      if (roles.length > 0) {
        user.role = roles[0];
      }
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('assignedGroups', 'name location');

    res.json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/admin/parents
// @desc    Get all parents
// @access  Private (Admin only)
router.get('/parents', async (req, res) => {
  try {
    let query = {};

    // Search by name or email
    if (req.query.search) {
      query.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const parents = await Parent.find(query)
      .populate('students', 'firstName lastName age')
      .sort({ lastName: 1, firstName: 1 });

    res.json({
      success: true,
      data: parents,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   POST /api/admin/parents
// @desc    Create new parent
// @access  Private (Admin only)
router.post('/parents', async (req, res) => {
  try {
    const parent = await Parent.create(req.body);

    res.status(201).json({
      success: true,
      data: parent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PUT /api/admin/parents/:id
// @desc    Update parent
// @access  Private (Admin only)
router.put('/parents/:id', async (req, res) => {
  try {
    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    ).populate('students', 'firstName lastName age');

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent not found',
      });
    }

    res.json({
      success: true,
      data: parent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   DELETE /api/admin/parents/:id
// @desc    Delete parent
// @access  Private (Admin only)
router.delete('/parents/:id', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id);

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent not found',
      });
    }

    // Check if parent has students
    if (parent.students && parent.students.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete parent with associated students',
      });
    }

    await parent.deleteOne();

    res.json({
      success: true,
      message: 'Parent deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/admin/stats
// @desc    Get dashboard statistics
// @access  Private (Admin only)
router.get('/stats', async (req, res) => {
  try {
    const totalGroups = await Group.countDocuments();
    const totalStudents = await Student.countDocuments();
    const totalParents = await Parent.countDocuments();
    const totalTeachers = await User.countDocuments({ role: 'teacher' });

    res.json({
      success: true,
      data: {
        totalGroups,
        totalStudents,
        totalParents,
        totalTeachers,
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

