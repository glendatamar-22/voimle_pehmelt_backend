import express from 'express';
import upload from '../utils/upload.js';
import { protect } from '../middleware/auth.js';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

// Serve uploaded files statically (if not using Cloudinary)
// Files are served from /uploads route in server.js

// @route   POST /api/upload
// @desc    Upload file (image or video)
// @access  Private
router.post('/', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    let fileUrl;
    let thumbnailUrl = null;
    const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    // If using Cloudinary, file is already uploaded via CloudinaryStorage
    if (req.file.path && req.file.path.startsWith('http')) {
      // File was uploaded to Cloudinary
      fileUrl = req.file.path;
      
      // For videos, Cloudinary provides a thumbnail URL
      if (fileType === 'video' && req.file.filename) {
        // Extract public_id from Cloudinary URL or use filename
        const publicId = req.file.filename.replace(/\.[^/.]+$/, '');
        thumbnailUrl = cloudinary.url(publicId, {
          resource_type: 'video',
          format: 'jpg',
        });
      }
    } else {
      // For local storage, return the file URL
      fileUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/uploads/${req.file.filename}`;
    }

    res.json({
      success: true,
      data: {
        type: fileType,
        url: fileUrl,
        thumbnail: thumbnailUrl,
        filename: req.file.originalname,
        size: req.file.size,
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

