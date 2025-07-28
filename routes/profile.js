// routes/profile.js - Defines API endpoints for student profile assessment.
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
    const { gpa, satScore, actScore, apClasses, extracurriculars } = req.body;

    if (!gpa || (!satScore && !actScore) || !extracurriculars) {
        return res.status(400).json({ error: 'GPA, at least one test score, and extracurriculars are required.' });
    }

    try {
        const systemPrompt = `You are an expert college admissions counselor AI. Respond ONLY with a valid JSON object in the following format:
        {
          "readinessScore": <integer between 0-100>,
          "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"]
        }`;

        const userPrompt = `Assess the following student profile:
        - GPA: ${gpa}, SAT: ${satScore || 'N/A'}, ACT: ${actScore || 'N/A'}
        - AP Classes: "${apClasses}"
        - Extracurriculars: "${extracurriculars}"`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];

        const response = await openaiClient.chat.completions.create({
            model: "", // Model is in the baseURL
            messages: messages,
            max_tokens: 512,
            temperature: 0.3,
            response_format: { type: "json_object" },
        });

        const rawResponse = response.choices[0].message.content;
        const assessment = JSON.parse(rawResponse);
        res.json(assessment);

    } catch (error) {
        console.error("Error assessing student profile:", error);
        res.status(500).send("Error generating assessment.");
    }
});

module.exports = router;