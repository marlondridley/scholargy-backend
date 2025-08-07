// backend/routes/report.js
const express = require('express');
const router = express.Router();
const { getChatCompletion } = require('../services/aiService');

router.post('/generate', async (req, res) => {
    const { studentProfile, collegeData } = req.body;
    if (!studentProfile || !collegeData) {
        return res.status(400).json({ error: 'studentProfile and collegeData are required.' });
    }
    try {
        const prompt = `
            You are "Scholargy AI," a college admissions advisor.
            Generate a concise "Advisor Insights" report for a student considering a specific college.
            
            **Student Profile:**
            - GPA: ${studentProfile.gpa || 'N/A'}
            - SAT Score: ${studentProfile.satScore || 'N/A'}
            - Extracurriculars: ${studentProfile.extracurriculars || 'N/A'}

            **College Data: ${collegeData.general_info.name}**
            - Admission Rate: ${(collegeData.admissions.admission_rate * 100).toFixed(1)}%
            - SAT 75th Percentile: ${collegeData.admissions.sat_scores?.math_75th + collegeData.admissions.sat_scores?.verbal_75th}
            - In-State Tuition: $${collegeData.cost_and_aid.tuition_in_state?.toLocaleString()}

            Based on this data, provide an "Overall Assessment" and 2-3 bullet points covering "Academic Fit" and "Financial Considerations". Be encouraging but realistic.
        `;
        const messages = [{ role: 'user', content: prompt }];
        const reportText = await getChatCompletion(messages);
        res.json({ reportText });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate AI report.' });
    }
});

module.exports = router;
