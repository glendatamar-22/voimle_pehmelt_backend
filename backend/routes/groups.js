import express from 'express';
import mongoose from 'mongoose';
import Group from '../models/Group.js';
import Student from '../models/Student.js';
import Parent from '../models/Parent.js';
import Schedule from '../models/Schedule.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

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

const ensureParentInGroup = async (groupId, parentId) => {
  if (!parentId) {
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
  const remaining = await Student.countDocuments({
    group: groupId,
    parent: parentId,
  });
  if (remaining === 0) {
    await Group.updateOne(
      { _id: groupId },
      { $pull: { parents: parentId } }
    );
  }
};

// @route   GET /api/groups
// @desc    Get all groups
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};
    
    // If user is a teacher, only show their assigned groups
    if (req.user.role === 'teacher') {
      query._id = { $in: req.user.assignedGroups };
    }

    const groups = await Group.find(query)
      .populate('teachers', 'name email')
      .populate('students', 'firstName lastName age')
      .sort({ name: 1 });

    // Get next schedule for each group
    const groupsWithSchedule = await Promise.all(
      groups.map(async (group) => {
        const nextSchedule = await Schedule.findOne({
          group: group._id,
          date: { $gte: new Date() },
        })
          .sort({ date: 1, startTime: 1 })
          .limit(1);

        const groupObj = group.toObject();
        groupObj.nextTraining = nextSchedule
          ? {
              date: nextSchedule.date,
              startTime: nextSchedule.startTime,
            }
          : null;
        groupObj.studentCount = group.students.length;

        return groupObj;
      })
    );

    res.json({
      success: true,
      data: groupsWithSchedule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/groups/:id/full
// @desc    Get group with full relations for admin bulk editor
// @access  Private (Admin only)
router.get('/:id/full', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this resource',
      });
    }

    const group = await Group.findById(req.params.id)
      .populate({
        path: 'students',
        populate: {
          path: 'parent',
          select: 'firstName lastName email phone',
        },
      })
      .populate('parents', 'firstName lastName email phone');

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    res.json({
      success: true,
      data: group,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/groups/:id
// @desc    Get single group
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('teachers', 'name email')
      .populate({
        path: 'students',
        populate: {
          path: 'parent',
          select: 'firstName lastName email phone',
        },
      })
      .populate('parents', 'firstName lastName email phone');

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Check if user has access to this group
    if (
      req.user.role === 'teacher' &&
      !req.user.assignedGroups.includes(group._id)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this group',
      });
    }

    res.json({
      success: true,
      data: group,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   POST /api/groups
// @desc    Create new group
// @access  Private (Admin only)
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create groups',
      });
    }

    const group = await Group.create(req.body);

    res.status(201).json({
      success: true,
      data: group,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PUT /api/groups/:id
// @desc    Update group
// @access  Private (Admin only)
router.put('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update groups',
      });
    }

    const group = await Group.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    res.json({
      success: true,
      data: group,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PATCH /api/groups/:id/full
// @desc    Bulk update group (name, students, parents)
// @access  Private (Admin only)
router.patch('/:id/full', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update groups',
      });
    }

    const { name, location, description, studentIds = [], parents = [] } = req.body;

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    if (typeof name === 'string') {
      group.name = name.trim();
    }
    if (typeof location === 'string') {
      group.location = location.trim();
    }
    if (typeof description === 'string') {
      group.description = description;
    }

    const requestedStudentIds = Array.isArray(studentIds)
      ? [...new Set(studentIds.filter(Boolean).map((id) => id.toString()))]
      : [];

    // Validate students
    if (requestedStudentIds.length) {
      const foundStudents = await Student.find({ _id: { $in: requestedStudentIds } }).select(
        '_id group parent'
      );
      if (foundStudents.length !== requestedStudentIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more students were not found',
        });
      }

      const currentStudentIds = group.students.map((id) => id.toString());

      const toRemove = currentStudentIds.filter(
        (id) => !requestedStudentIds.includes(id)
      );
      const toAssign = requestedStudentIds;

      // Remove students that are no longer in the group
      for (const studentId of toRemove) {
        const student = await Student.findById(studentId);
        if (!student) {
          continue;
        }
        const parentId = student.parent ? student.parent.toString() : null;
        student.group = null;
        await student.save();
        await Group.updateOne(
          { _id: group._id },
          { $pull: { students: student._id } }
        );
        await removeParentFromGroupIfUnused(group._id, parentId);
      }

      // Assign requested students to the group
      for (const studentId of toAssign) {
        const student = await Student.findById(studentId);
        if (!student) {
          continue;
        }
        const previousGroupId = student.group ? student.group.toString() : null;
        if (!previousGroupId || previousGroupId !== group._id.toString()) {
          if (previousGroupId) {
            await Group.updateOne(
              { _id: previousGroupId },
              { $pull: { students: student._id } }
            );
            await removeParentFromGroupIfUnused(previousGroupId, student.parent);
          }
          student.group = group._id;
          await student.save();
        }
        await Group.updateOne(
          { _id: group._id },
          { $addToSet: { students: student._id } }
        );
        if (student.parent) {
          await ensureParentInGroup(group._id, student.parent);
        }
      }

      group.students = requestedStudentIds.map((id) => new mongoose.Types.ObjectId(id));
    } else {
      // No students requested - detach all
      const currentStudentIds = group.students.map((id) => id.toString());
      for (const studentId of currentStudentIds) {
        const student = await Student.findById(studentId);
        if (!student) {
          continue;
        }
        const parentId = student.parent ? student.parent.toString() : null;
        student.group = null;
        await student.save();
        await removeParentFromGroupIfUnused(group._id, parentId);
      }
      group.students = [];
    }

    const studentParentIds = await Student.find({ group: group._id })
      .distinct('parent')
      .then((ids) =>
        ids.filter(Boolean).map((id) => id.toString())
      );

    const parentIdsSet = new Set(studentParentIds);
    const parentPayload = Array.isArray(parents) ? parents : [];

    for (const parentItem of parentPayload) {
      const email = parentItem?.email?.toLowerCase().trim();
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Parent email is required for each parent entry',
        });
      }

      const nameParts = normalizeParentName(parentItem.name);
      let parentDoc = await Parent.findOne({ email });
      if (!parentDoc) {
        parentDoc = await Parent.create({
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          email,
        });
      } else {
        let shouldSave = false;
        if (nameParts.firstName && parentDoc.firstName !== nameParts.firstName) {
          parentDoc.firstName = nameParts.firstName;
          shouldSave = true;
        }
        if (
          typeof nameParts.lastName !== 'undefined' &&
          parentDoc.lastName !== nameParts.lastName
        ) {
          parentDoc.lastName = nameParts.lastName;
          shouldSave = true;
        }
        if (shouldSave) {
          await parentDoc.save();
        }
      }

      parentIdsSet.add(parentDoc._id.toString());
    }

    const finalParentIds = Array.from(parentIdsSet).map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    const previousParentIds = group.parents.map((id) => id.toString());
    const removedParentIds = previousParentIds.filter(
      (id) => !parentIdsSet.has(id)
    );

    group.parents = finalParentIds;
    await group.save();

    // Clean up removed parents if they are no longer referenced
    for (const parentId of removedParentIds) {
      await removeParentFromGroupIfUnused(group._id, parentId);
      const stillReferenced =
        (await Student.countDocuments({ parent: parentId })) > 0 ||
        (await Group.countDocuments({ parents: parentId })) > 0;
      if (!stillReferenced) {
        await Parent.deleteOne({ _id: parentId });
      }
    }

    const updatedGroup = await Group.findById(group._id)
      .populate({
        path: 'students',
        populate: {
          path: 'parent',
          select: 'firstName lastName email phone',
        },
      })
      .populate('parents', 'firstName lastName email phone');

    res.json({
      success: true,
      data: updatedGroup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/groups/:id/export-csv
// @desc    Export group students to CSV
// @access  Private (Admin only)
router.get('/:id/export-csv', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to export group data',
      });
    }

    const group = await Group.findById(req.params.id)
      .populate({
        path: 'students',
        populate: {
          path: 'parent',
          select: 'firstName lastName email phone',
        },
      });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Create CSV content with UTF-8 BOM for Estonian characters
    const BOM = '\uFEFF';
    let csv = BOM + 'Grupi nimi,Õpilase nimi,Õpilase vanus,Lapsevanema nimi,Lapsevanema e-post,Telefon\n';

    group.students.forEach((student) => {
      const groupName = group.name || '';
      const studentName = `${student.firstName} ${student.lastName}`;
      const studentAge = student.age || '';
      const parentName = student.parentName || 
        (student.parent ? `${student.parent.firstName || ''} ${student.parent.lastName || ''}`.trim() : '');
      const parentEmail = student.parentEmail || student.parent?.email || '';
      const parentPhone = student.parent?.phone || '';

      // Escape commas and quotes in CSV
      const escapeCSV = (str) => {
        if (!str) return '';
        const s = String(str);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      csv += `${escapeCSV(groupName)},${escapeCSV(studentName)},${escapeCSV(studentAge)},${escapeCSV(parentName)},${escapeCSV(parentEmail)},${escapeCSV(parentPhone)}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${group.name}_opilased.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   DELETE /api/groups/:id
// @desc    Delete group
// @access  Private (Admin only)
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete groups',
      });
    }

    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Delete associated students
    await Student.deleteMany({ group: group._id });

    await group.deleteOne();

    res.json({
      success: true,
      message: 'Group deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;

