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
            Generate a comprehensive college report for a student considering a specific college.
            
            **Student Profile:**
            - GPA: ${studentProfile.gpa || 'N/A'}
            - SAT Score: ${studentProfile.satScore || 'N/A'}
            - Extracurriculars: ${studentProfile.extracurriculars || 'N/A'}
            - Major Interest: ${studentProfile.major || 'Undecided'}

            **College Data: ${collegeData.general_info?.name || 'Unknown College'}**
            - Admission Rate: ${(collegeData.admissions?.admission_rate * 100 || 0).toFixed(1)}%
            - SAT 75th Percentile: ${(collegeData.admissions?.sat_scores?.math_75th || 0) + (collegeData.admissions?.sat_scores?.verbal_75th || 0)}
            - In-State Tuition: $${(collegeData.cost_and_aid?.tuition_in_state || 0).toLocaleString()}

            Provide a structured report with:
            1. Advisor Insights: Overall assessment of fit and chances
            2. Action Plan: Specific steps to improve chances
            3. College Recommendations: Similar colleges to consider
        `;
        const messages = [{ role: 'user', content: prompt }];
        const reportText = await getChatCompletion(messages);
        
        // Parse the AI response and structure it
        const report = {
            advisorInsights: reportText,
            actionPlan: [
                'Complete college applications early',
                'Prepare strong personal statement',
                'Request letters of recommendation',
                'Apply for financial aid and scholarships'
            ],
            collegeRecommendations: [
                'Consider similar institutions in the same region',
                'Look into safety schools with higher admission rates',
                'Research colleges with strong programs in your major'
            ]
        };
        
        res.json({ report });
    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({ error: 'Failed to generate AI report.' });
    }
});

module.exports = router;
