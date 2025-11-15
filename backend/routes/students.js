import express from 'express';
import Student from '../models/Student.js';
import Group from '../models/Group.js';
import Parent from '../models/Parent.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const ensureParentInGroup = async (groupId, parentId) => {
  if (!groupId || !parentId) {
    return;
  }
  await Group.updateOne(
    { _id: groupId },
    { $addToSet: { parents: parentId } }
  );
};

const removeParentFromGroupIfUnused = async (groupId, parentId) => {
  if (!groupId || !parentId) {
    return;
  }
  const remainingStudents = await Student.countDocuments({
    group: groupId,
    parent: parentId,
  });
  if (remainingStudents === 0) {
    await Group.updateOne(
      { _id: groupId },
      { $pull: { parents: parentId } }
    );
  }
};

// @route   GET /api/students
// @desc    Get all students (with optional group filter)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    // If user is a teacher, only show students from their assigned groups
    if (req.user.role === 'teacher') {
      query.group = { $in: req.user.assignedGroups };
    }

    // Filter by group if provided
    if (req.query.group) {
      query.group = req.query.group;
    }

    // Search by name
    if (req.query.search) {
      query.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const students = await Student.find(query)
      .populate('group', 'name location')
      .populate('parent', 'firstName lastName email phone')
      .sort({ lastName: 1, firstName: 1 });

    res.json({
      success: true,
      data: students,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/students/:id
// @desc    Get single student
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('group', 'name location')
      .populate('parent', 'firstName lastName email phone');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Check if user has access to this student's group
    if (
      req.user.role === 'teacher' &&
      !req.user.assignedGroups.includes(student.group._id)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this student',
      });
    }

    res.json({
      success: true,
      data: student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   POST /api/students
// @desc    Create new student
// @access  Private (Admin only)
const normalizeParentName = (name) => {
  if (!name) {
    return {
      firstName: 'Lapsevanem',
      lastName: '',
      fullName: 'Lapsevanem',
    };
  }
  const cleaned = name.trim();
  if (!cleaned.length) {
    return {
      firstName: 'Lapsevanem',
      lastName: '',
      fullName: 'Lapsevanem',
    };
  }
  const parts = cleaned.split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.length ? parts.join(' ') : '';
  return {
    firstName: firstName || 'Lapsevanem',
    lastName,
    fullName: cleaned,
  };
};

router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create students',
      });
    }

    const { firstName, lastName, age, groupId, parentName, parentEmail } = req.body;

    if (!parentEmail) {
      return res.status(400).json({
        success: false,
        message: 'Parent email is required',
      });
    }

    // Verify group exists
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    const normalizedEmail = parentEmail.toLowerCase();
    const nameParts = normalizeParentName(parentName);

    let parent = await Parent.findOne({ email: normalizedEmail });
    if (!parent) {
      parent = await Parent.create({
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        email: normalizedEmail,
      });
    } else {
      let shouldSaveParent = false;
      if (nameParts.firstName && parent.firstName !== nameParts.firstName) {
        parent.firstName = nameParts.firstName;
        shouldSaveParent = true;
      }
      if (nameParts.lastName && parent.lastName !== nameParts.lastName) {
        parent.lastName = nameParts.lastName;
        shouldSaveParent = true;
      }
      if (shouldSaveParent) {
        await parent.save();
      }
    }

    const student = await Student.create({
      firstName,
      lastName,
      age,
      group: groupId,
      parent: parent._id,
      parentName: nameParts.fullName,
      parentEmail: normalizedEmail,
    });

    await Group.updateOne(
      { _id: groupId },
      { $addToSet: { students: student._id } }
    );

    if (!parent.students.some((id) => id.equals(student._id))) {
      parent.students.push(student._id);
      await parent.save();
    }

    await ensureParentInGroup(groupId, parent._id);

    const populatedStudent = await Student.findById(student._id)
      .populate('group', 'name location')
      .populate('parent', 'firstName lastName email phone');

    res.status(201).json({
      success: true,
      data: populatedStudent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PUT /api/students/:id
// @desc    Update student
// @access  Private (Admin only)
router.put('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update students',
      });
    }

    const { firstName, lastName, age, groupId, parentName, parentEmail } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    if (typeof firstName !== 'undefined') {
      student.firstName = firstName;
    }

    if (typeof lastName !== 'undefined') {
      student.lastName = lastName;
    }

    if (typeof age !== 'undefined') {
      student.age = age;
    }

    const originalGroupId = student.group ? student.group.toString() : null;
    const originalParentId = student.parent ? student.parent.toString() : null;

    if (groupId && (!originalGroupId || groupId.toString() !== originalGroupId)) {
      const newGroup = await Group.findById(groupId);
      if (!newGroup) {
        return res.status(404).json({
          success: false,
          message: 'Group not found',
        });
      }

      if (originalGroupId) {
        await Group.updateOne(
          { _id: originalGroupId },
          { $pull: { students: student._id } }
        );
      }

      await Group.updateOne(
        { _id: groupId },
        { $addToSet: { students: student._id } }
      );

      student.group = groupId;
    }

    let currentParent = null;
    if (student.parent) {
      currentParent = await Parent.findById(student.parent);
    }

    if (parentEmail) {
      const normalizedEmail = parentEmail.toLowerCase();
      const nameParts = normalizeParentName(parentName || student.parentName);

      if (!currentParent || currentParent.email !== normalizedEmail) {
        let nextParent = await Parent.findOne({ email: normalizedEmail });
        if (!nextParent) {
          nextParent = await Parent.create({
            firstName: nameParts.firstName,
            lastName: nameParts.lastName,
            email: normalizedEmail,
          });
        }

        if (currentParent) {
          currentParent.students.pull(student._id);
          await currentParent.save();
          if (!currentParent.students.length) {
            await currentParent.deleteOne();
          }
        }

        if (!nextParent.students.some((id) => id.equals(student._id))) {
          nextParent.students.push(student._id);
          await nextParent.save();
        }

        student.parent = nextParent._id;
        currentParent = nextParent;
      }

      if (currentParent) {
        let shouldSaveParent = false;
        if (nameParts.firstName && currentParent.firstName !== nameParts.firstName) {
          currentParent.firstName = nameParts.firstName;
          shouldSaveParent = true;
        }
        if (
          typeof nameParts.lastName !== 'undefined' &&
          currentParent.lastName !== nameParts.lastName
        ) {
          currentParent.lastName = nameParts.lastName;
          shouldSaveParent = true;
        }
        if (shouldSaveParent) {
          await currentParent.save();
        }
      }

      student.parentEmail = normalizedEmail;
      student.parentName = nameParts.fullName;
    } else if (parentName && currentParent) {
      const nameParts = normalizeParentName(parentName);
      let shouldSaveParent = false;
      if (currentParent.firstName !== nameParts.firstName) {
        currentParent.firstName = nameParts.firstName;
        shouldSaveParent = true;
      }
      if (currentParent.lastName !== nameParts.lastName) {
        currentParent.lastName = nameParts.lastName;
        shouldSaveParent = true;
      }
      if (shouldSaveParent) {
        await currentParent.save();
      }
      student.parentName = nameParts.fullName;
    }

    await student.save();

    if (student.parent) {
      await ensureParentInGroup(student.group, student.parent);
    }

    if (originalGroupId && (!student.group || student.group.toString() !== originalGroupId)) {
      await removeParentFromGroupIfUnused(originalGroupId, originalParentId);
    }

    if (
      originalParentId &&
      (!student.parent || student.parent.toString() !== originalParentId)
    ) {
      const targetGroupId = student.group ? student.group.toString() : originalGroupId;
      if (targetGroupId) {
        await removeParentFromGroupIfUnused(targetGroupId, originalParentId);
      }
    }

    const populatedStudent = await Student.findById(student._id)
      .populate('group', 'name location')
      .populate('parent', 'firstName lastName email phone');

    res.json({
      success: true,
      data: populatedStudent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   DELETE /api/students/:id
// @desc    Delete student
// @access  Private (Admin only)
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete students',
      });
    }

    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Remove student from group
    await Group.updateOne(
      { _id: student.group },
      { $pull: { students: student._id } }
    );

    // Remove student from parent
    if (student.parent) {
      const parent = await Parent.findById(student.parent);
      if (parent) {
        parent.students.pull(student._id);
        await parent.save();
        if (!parent.students.length) {
          await parent.deleteOne();
        }
      }

      await removeParentFromGroupIfUnused(student.group, student.parent);
    }

    await student.deleteOne();

    res.json({
      success: true,
      message: 'Student deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;

