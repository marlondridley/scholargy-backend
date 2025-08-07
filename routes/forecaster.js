// backend/routes/forecaster.js
const express = require('express');
const router = express.Router();
const { getChatCompletion } = require('../services/aiService');
const { getDB } = require('../db');

// UPDATED: This endpoint now queries GPT-4o for career data
router.post('/find-careers', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required.' });

    try {
        // Construct a prompt to get structured JSON data from the AI
        const prompt = `
            Provide estimated career data for the field: "${query}".
            Respond with ONLY a JSON object in the following format, with no other text or explanations.
            {
              "careers": [
                {
                  "_id": "career-1",
                  "title": "Primary Career Title for '${query}'",
                  "avg_salary_start": 85000,
                  "avg_salary_10_year": 150000
                },
                {
                  "_id": "career-2",
                  "title": "A related or alternative career for '${query}'",
                  "avg_salary_start": 70000,
                  "avg_salary_10_year": 120000
                }
              ]
            }
            Use realistic salary estimates for the United States.
        `;

        const messages = [{ role: 'user', content: prompt }];
        const aiResponse = await getChatCompletion(messages);
        
        // Parse the JSON string from the AI's response
        const careerData = JSON.parse(aiResponse);

        res.json(careerData); // Send the structured data to the frontend
    } catch (error) {
        console.error("Error fetching career data from AI:", error);
        res.status(500).json({ error: 'Failed to find career data.' });
    }
});

// This endpoint remains the same, generating the final narrative forecast
router.post('/generate-forecast', async (req, res) => {
    const { studentProfile, career, college } = req.body; // Updated to receive full objects
    if (!studentProfile || !career || !college) {
        return res.status(400).json({ error: 'studentProfile, career, and college are required.' });
    }
    try {
        const prompt = `
            You are "Scholargy AI," a financial and career advisor.
            Generate a "Career & ROI Forecast" for a student.
            **Student Profile:** - Major: ${studentProfile.major || 'Undecided'}
            **Chosen Career: ${career.title}** - Average Starting Salary: $${career.avg_salary_start.toLocaleString()} - 10-Year Salary Projection: $${career.avg_salary_10_year.toLocaleString()}
            **Chosen College: ${college.general_info.name}** - Estimated 4-Year Cost (In-State): $${(college.cost_and_aid.tuition_in_state * 4).toLocaleString()}
            Based on this, provide a concise forecast covering: 1. **Earnings Potential**, 2. **Cost vs. Earnings Analysis**, and 3. **Recommendation**.
        `;
        const messages = [{ role: 'user', content: prompt }];
        const forecast = await getChatCompletion(messages);
        res.json({ forecast });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate forecast.' });
    }
});

module.exports = router;
