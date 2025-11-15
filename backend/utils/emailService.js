import nodemailer from 'nodemailer';
import Group from '../models/Group.js';
import Student from '../models/Student.js';
import Parent from '../models/Parent.js';

// Create transporter
const createTransporter = () => {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    console.warn('Email configuration not set. Email notifications will be disabled.');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Send update notification to parents
export const sendUpdateNotification = async (update) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    console.log('Email transporter not available. Skipping notification.');
    return;
  }

  try {
    // Get group with students
    const group = await Group.findById(update.group._id).populate({
      path: 'students',
      populate: {
        path: 'parent',
        select: 'email firstName lastName',
      },
    });

    if (!group || !group.students || group.students.length === 0) {
      return;
    }

    // Get unique parent emails
    const parentEmails = [
      ...new Set(
        group.students
          .map((student) => student.parent?.email)
          .filter((email) => email)
      ),
    ];

    if (parentEmails.length === 0) {
      return;
    }

    // Create email content
    const updateUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/groups/${update.group._id}`;
    
    const mailOptions = {
      from: `"Minu Tantsukool" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: parentEmails.join(', '),
      subject: `New Update from ${update.group.name} - Minu Tantsukool`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Update from ${update.group.name}</h2>
          <p style="color: #666;">
            ${update.content || 'Check out the latest update from your dance group!'}
          </p>
          ${update.media && update.media.length > 0 ? '<p>This update includes media files.</p>' : ''}
          <a href="${updateUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px;">
            View Update
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Posted by ${update.author.name} on ${new Date(update.createdAt).toLocaleDateString()}
          </p>
        </div>
      `,
      text: `
        New Update from ${update.group.name}
        
        ${update.content || 'Check out the latest update from your dance group!'}
        
        View the update at: ${updateUrl}
        
        Posted by ${update.author.name} on ${new Date(update.createdAt).toLocaleDateString()}
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Update notification sent to ${parentEmails.length} parents`);
  } catch (error) {
    console.error('Error sending update notification:', error);
    throw error;
  }
};

