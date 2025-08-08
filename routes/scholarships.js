// backend/routes/scholarships.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../db');

// Helper function to format category names
const formatCategoryName = (name) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Helper function to get scholarship service lazily
const getScholarshipService = () => {
    try {
        return require('../services/scholarshipService');
    } catch (error) {
        console.warn('⚠️ Scholarship service not available:', error.message);
        return null;
    }
};

// GET /api/scholarships/categories
router.get('/categories', async (req, res) => {
    try {
        const scholarshipService = getScholarshipService();
        if (!scholarshipService) {
            // Return mock data if service is not available
            const mockCategories = [
                { _id: 'stem', count: 15 },
                { _id: 'academic_excellence', count: 12 },
                { _id: 'minority_students', count: 8 },
                { _id: 'first_generation', count: 6 },
                { _id: 'community_service', count: 10 }
            ];
            const formattedCategories = mockCategories.map(cat => ({
                id: cat._id,
                name: formatCategoryName(cat._id),
                count: cat.count
            }));
            return res.json({ 
                categories: formattedCategories,
                source: 'Mock Data (Service Unavailable)'
            });
        }

        const categories = await scholarshipService.getScholarshipCategories();
        const formattedCategories = categories.map(cat => ({
            id: cat._id,
            name: formatCategoryName(cat._id),
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
        const scholarshipService = getScholarshipService();
        if (!scholarshipService) {
            return res.json({ 
                upcoming_deadlines: [],
                source: 'Mock Data (Service Unavailable)'
            });
        }

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
        const scholarshipService = getScholarshipService();
        if (!scholarshipService) {
            return res.json({ 
                scholarships: [],
                source: 'Mock Data (Service Unavailable)'
            });
        }

        const { studentProfile, options } = req.body;
        const scholarships = await scholarshipService.searchScholarships(studentProfile, options);
        res.json({ scholarships });
    } catch (error) {
        console.error("Error searching scholarships:", error);
        res.status(500).json({ error: 'Failed to search scholarships.' });
    }
});

// POST /api/scholarships/recommendations
router.post('/recommendations', async (req, res) => {
    try {
        const scholarshipService = getScholarshipService();
        if (!scholarshipService) {
            return res.json({ 
                recommendations: [],
                source: 'Mock Data (Service Unavailable)'
            });
        }

        const { studentProfile } = req.body;
        const recommendations = await scholarshipService.getRecommendations(studentProfile);
        res.json({ recommendations });
    } catch (error) {
        console.error("Error getting recommendations:", error);
        res.status(500).json({ error: 'Failed to get recommendations.' });
    }
});

module.exports = router;
