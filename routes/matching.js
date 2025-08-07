// backend/routes/matching.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { generateEmbedding } = require('../services/aiService');

router.post('/scholarships', async (req, res) => {
    const { studentProfile } = req.body;
    if (!studentProfile) {
        return res.status(400).json({ error: 'studentProfile is required.' });
    }
    try {
        const profileText = `Student with GPA ${studentProfile.gpa}, majoring in ${studentProfile.major}. Extracurriculars include ${studentProfile.extracurriculars}.`;
        const studentVector = await generateEmbedding(profileText);
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        const matchedScholarships = await db.collection('scholarships').aggregate([
            {
                $search: {
                    index: 'vector_index_on_scholarships',
                    cosmosDbVectorSearch: { vector: studentVector, path: 'embedding', k: 10 }
                }
            },
            { $project: { similarityScore: { $meta: "searchScore" }, title: 1, description: 1, award_info: 1, organization: 1 } },
            { $limit: 10 }
        ]).toArray();
        const results = matchedScholarships.map(item => ({
            id: item._id,
            title: item.title,
            description: item.description,
            organization: item.organization,
            fundingAmount: item.award_info?.funds?.amount || 0,
            relevance: (item.similarityScore * 100).toFixed(2) + '%'
        }));
        res.json({ matches: results });
    } catch (error) {
        console.error('Scholarship matching error:', error);
        res.status(500).json({ error: 'Failed to find scholarship matches.' });
    }
});

module.exports = router;
