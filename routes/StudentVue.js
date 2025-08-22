const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

// Frozen function - StudentVue API doesn't work, using manual profile data
const getStudentVueData = (studentProfile) => {
  // Generate mock data based on student profile
  const gpa = studentProfile.gpa || 3.5;
  const gradeLevel = studentProfile.gradeLevel || '12th';
  
  const mockData = {
    gradebook: {
      Courses: {
        Course: [
          {
            '@Title': 'AP Calculus AB',
            '@Grade': `${Math.round((gpa * 20) + 75)}%`,
            '@Teacher': 'Mr. Davison',
            Assignments: {
              Assignment: [
                { '@Measure': 'Homework 5.1', '@Score': '10/10', '@Notes': 'Excellent work!' },
                { '@Measure': 'Quiz Chapter 5', '@Score': `${Math.round((gpa * 20) + 65)}/100`, '@Notes': 'Good understanding of concepts.' },
                { '@Measure': 'Project: Real World Calculus', '@Score': `${Math.round((gpa * 20) + 78)}/100`, '@Notes': 'Creative application of calculus.' },
                { '@Measure': 'Midterm Exam', '@Score': `${Math.round((gpa * 20) + 72)}/100`, '@Notes': 'Strong performance.' },
              ],
            },
          },
          {
            '@Title': 'English Literature',
            '@Grade': `${Math.round((gpa * 15) + 73)}%`,
            '@Teacher': 'Ms. Gable',
            Assignments: {
              Assignment: [
                { '@Measure': 'Essay: The Great Gatsby', '@Score': `${Math.round((gpa * 15) + 70)}/100`, '@Notes': 'Good analysis, but check for grammar.' },
                { '@Measure': 'Reading Quiz', '@Score': '9/10', '@Notes': 'Excellent comprehension.' },
                { '@Measure': 'Presentation', '@Score': `${Math.round((gpa * 15) + 77)}/100`, '@Notes': 'Very confident and well-researched.' },
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
    profile: {
      gradeLevel,
      gpa,
      totalCredits: gradeLevel === '12th' ? 24 : 20,
      graduationYear: new Date().getFullYear() + (gradeLevel === '12th' ? 0 : 1)
    }
  };

  return mockData;
};

// POST handler at root: /
router.post(
  '/',
  [
    body('studentProfile').isObject().withMessage('Student profile is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { studentProfile } = req.body;

    try {
      // Use frozen function to generate data based on student profile
      const data = getStudentVueData(studentProfile);

      res.json({
        success: true,
        data,
        note: 'Using profile-based mock data (StudentVue API disabled)'
      });

    } catch (error) {
      console.error('StudentVue data generation error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate student data' 
      });
    }
  }
);

module.exports = router;
