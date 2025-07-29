const express = require('express');
const OpenAI = require('openai');
const router = express.Router();

const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const openaiApiKey = process.env.AZURE_OPENAI_API_KEY;
const openaiDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

const openaiClient = new OpenAI({
    baseURL: `${openaiEndpoint}openai/deployments/${openaiDeploymentName}`,
    apiKey: openaiApiKey,
    defaultQuery: { "api-version": "2023-05-15" },
    defaultHeaders: { "api-key": openaiApiKey },
});

router.post('/assess', async (req, res) => {
    const { gradeLevel, gpa, satScore, actScore, apClasses, extracurriculars } = req.body;

    if (!gpa || (!satScore && !actScore) || !extracurriculars) {
        return res.status(400).json({ error: 'GPA, at least one test score, and extracurriculars are required.' });
    }

    try {
        // **UPDATED:** Use the new, more detailed system prompt.
        const systemPrompt = `You are a college readiness advisor trained on U.S. admissions data, including GPA benchmarks, standardized test score ranges, AP course rigor, and extracurricular impact.
Use known admissions patterns from selective, mid-tier, and broad access universities.
Your job is to assess whether a high school student is likely:
- On track for selective colleges (e.g. Ivy League, Stanford, Duke)
- Competitive for strong public universities (e.g. Michigan, UNC, UCLA)
- A good match for regional or broad access schools
You’ll analyze academics (GPA, SAT/ACT, APs) and activities. Provide encouragement and suggest areas of improvement.`;

        // **UPDATED:** Use the new user prompt structure, dynamically inserting the student's data.
        const userPrompt = `
Student Profile:
- Grade: ${gradeLevel}
- Cumulative GPA: ${gpa}
- SAT: ${satScore || 'Not provided'}
- ACT: ${actScore || 'Not provided'}
- AP Classes: ${apClasses}
- Extracurriculars: ${extracurriculars}

Evaluate their college readiness. Mention what range of schools they’re currently competitive for and what would improve their profile.
Also provide one “reach,” “target,” and “safety” suggestion.
`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];

        const response = await openaiClient.chat.completions.create({
            model: "", // Model is in the baseURL
            messages: messages,
            max_tokens: 800, // Increased tokens for a more detailed response
            temperature: 0.7,
        });

        const assessmentText = response.choices[0].message.content;
        
        // Send back the raw text response
        res.json({ assessmentText });

    } catch (error) {
        console.error("Error assessing student profile:", error);
        res.status(500).send("Error generating assessment.");
    }
});

module.exports = router;