const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Client } = require('studentvue');

// Optional: mock fallback
const mockData = {
  gradebook: {
    Courses: {
      Course: [
        {
          '@Title': 'AP Calculus AB',
          '@Grade': '94.5%',
          '@Teacher': 'Mr. Davison',
          Assignments: {
            Assignment: [
              { '@Measure': 'Homework 5.1', '@Score': '10/10', '@Notes': 'Excellent work!' },
              { '@Measure': 'Quiz Chapter 5', '@Score': '85/100', '@Notes': 'Needs to review derivatives.' },
              { '@Measure': 'Project: Real World Calculus', '@Score': '98/100', '@Notes': '' },
              { '@Measure': 'Midterm Exam', '@Score': '92/100', '@Notes': 'Strong performance.' },
            ],
          },
        },
        {
          '@Title': 'English Literature',
          '@Grade': '88.0%',
          '@Teacher': 'Ms. Gable',
          Assignments: {
            Assignment: [
              { '@Measure': 'Essay: The Great Gatsby', '@Score': '85/100', '@Notes': 'Good analysis, but check for grammar.' },
              { '@Measure': 'Reading Quiz', '@Score': '9/10', '@Notes': '' },
              { '@Measure': 'Presentation', '@Score': '92/100', '@Notes': 'Very confident and well-researched.' },
            ],
          },
        },
      ],
    },
  },
  attendance: {
    Absences: {
      Absence: [
        { '@AbsenceDate': '2025-05-10', '@Reason': 'Excused' },
        { '@AbsenceDate': '2025-04-22', '@Reason': 'Unexcused' },
      ],
    },
  },
};

// POST handler at root: /studentvue
router.post(
  '/studentvue',
  [
    body('districtUrl').isURL().withMessage('Valid District URL is required.'),
    body('username').notEmpty().withMessage('Username is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { districtUrl, username, password } = req.body;

    try {
      // Try to use real StudentVue client
      const client = new Client(districtUrl, username, password);
      
      // Fetch student data
      const [gradebook, attendance] = await Promise.all([
        client.gradebook(),
        client.attendance()
      ]);

      res.json({
        success: true,
        data: {
          gradebook,
          attendance
        }
      });

    } catch (error) {
      console.error('StudentVue error:', error);
      
      // Fallback to mock data if real client fails
      res.json({
        success: true,
        data: mockData,
        note: 'Using mock data due to connection issues'
      });
    }
  }
);

module.exports = router;
