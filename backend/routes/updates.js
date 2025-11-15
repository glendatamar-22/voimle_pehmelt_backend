import express from 'express';
import Update from '../models/Update.js';
import Group from '../models/Group.js';
import { protect } from '../middleware/auth.js';
import { sendUpdateNotification } from '../utils/emailService.js';

const router = express.Router();

// @route   GET /api/updates
// @desc    Get all updates (with optional group filter)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    // Filter by group if provided
    if (req.query.group) {
      query.group = req.query.group;
      
      // Check if user has access to this group
      if (req.user.role === 'teacher') {
        if (!req.user.assignedGroups.includes(req.query.group)) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to access this group',
          });
        }
      }
    } else {
      // If no group specified, show updates from user's assigned groups
      if (req.user.role === 'teacher') {
        query.group = { $in: req.user.assignedGroups };
      }
    }

    const updates = await Update.find(query)
      .populate('author', 'name email')
      .populate('group', 'name location')
      .populate({
        path: 'comments.author',
        select: 'name email',
      })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: updates,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   GET /api/updates/:id
// @desc    Get single update
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const update = await Update.findById(req.params.id)
      .populate('author', 'name email')
      .populate('group', 'name location')
      .populate({
        path: 'comments.author',
        select: 'name email',
      });

    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'Update not found',
      });
    }

    // Check if user has access to this group
    if (
      req.user.role === 'teacher' &&
      !req.user.assignedGroups.includes(update.group._id)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this update',
      });
    }

    res.json({
      success: true,
      data: update,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   POST /api/updates
// @desc    Create new update
// @access  Private (Teacher/Admin)
router.post('/', protect, async (req, res) => {
  try {
    const { group, content, media } = req.body;

    // Verify group exists
    const groupDoc = await Group.findById(group);
    if (!groupDoc) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Check if user has access to this group
    if (
      req.user.role === 'teacher' &&
      !req.user.assignedGroups.includes(group)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to post updates to this group',
      });
    }

    const update = await Update.create({
      group,
      author: req.user._id,
      content,
      media: media || [],
    });

    const populatedUpdate = await Update.findById(update._id)
      .populate('author', 'name email')
      .populate('group', 'name location');

    // Send email notifications to parents
    try {
      await sendUpdateNotification(populatedUpdate);
    } catch (emailError) {
      console.error('Error sending email notifications:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      data: populatedUpdate,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   PUT /api/updates/:id
// @desc    Update update
// @access  Private (Author or Admin)
router.put('/:id', protect, async (req, res) => {
  try {
    const update = await Update.findById(req.params.id);

    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'Update not found',
      });
    }

    // Check if user is the author or admin
    if (
      update.author.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this update',
      });
    }

    update.content = req.body.content || update.content;
    update.media = req.body.media || update.media;
    update.updatedAt = new Date();

    await update.save();

    const populatedUpdate = await Update.findById(update._id)
      .populate('author', 'name email')
      .populate('group', 'name location')
      .populate({
        path: 'comments.author',
        select: 'name email',
      });

    res.json({
      success: true,
      data: populatedUpdate,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   DELETE /api/updates/:id
// @desc    Delete update
// @access  Private (Author or Admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const update = await Update.findById(req.params.id);

    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'Update not found',
      });
    }

    // Check if user is the author or admin
    if (
      update.author.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this update',
      });
    }

    await update.deleteOne();

    res.json({
      success: true,
      message: 'Update deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   POST /api/updates/:id/comments
// @desc    Add comment to update
// @access  Private (Teacher/Admin)
router.post('/:id/comments', protect, async (req, res) => {
  try {
    const update = await Update.findById(req.params.id);

    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'Update not found',
      });
    }

    // Check if user has access to this group
    if (
      req.user.role === 'teacher' &&
      !req.user.assignedGroups.includes(update.group)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to comment on this update',
      });
    }

    update.comments.push({
      author: req.user._id,
      content: req.body.content,
    });

    await update.save();

    const populatedUpdate = await Update.findById(update._id)
      .populate('author', 'name email')
      .populate('group', 'name location')
      .populate({
        path: 'comments.author',
        select: 'name email',
      });

    res.json({
      success: true,
      data: populatedUpdate,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;

