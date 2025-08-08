// backend/routes/scholarships.js
const express = require('express');
const router = express.Router();
const scholarshipService = require('../services/scholarshipService');

// Helper function to format category names
const formatCategoryName = (name) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// GET /api/scholarships/categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await scholarshipService.getScholarshipCategories();
        const formattedCategories = categories.map(cat => ({
            id: cat._id,
            name: formatCategoryName(cat._id), // Corrected call
            count: cat.count
        }));
        res.json({ categories: formattedCategories });
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ error: 'Failed to fetch scholarship categories.' });
    }
});

// GET /api/scholarships/deadlines
router.get('/deadlines', async (req, res) => {
    try {
        const days = req.query.days || 30;
        const deadlines = await scholarshipService.getUpcomingDeadlines(days);
        res.json({ upcoming_deadlines: deadlines });
    } catch (error) {
        console.error("Error fetching upcoming deadlines:", error);
        res.status(500).json({ error: 'Failed to fetch upcoming deadlines.' });
    }
});

// POST /api/scholarships/search
router.post('/search', async (req, res) => {
    try {
        const { studentProfile, options } = req.body;
        const scholarships = await scholarshipService.searchScholarships(studentProfile, options);
        res.json({ scholarships });
    } catch (error) {
        console.error("Error searching scholarships:", error);
        res.status(500).json({ error: 'Failed to search scholarships.' });
    }
});

// Other routes... make sure they all have try-catch blocks
// For example:
router.post('/recommendations', async (req, res) => {
    try {
        const { studentProfile } = req.body;
        const recommendations = await scholarshipService.getRecommendations(studentProfile);
        res.json({ recommendations });
    } catch (error) {
        console.error("Error getting recommendations:", error);
        res.status(500).json({ error: 'Failed to get recommendations.' });
    }
});

module.exports = router;
