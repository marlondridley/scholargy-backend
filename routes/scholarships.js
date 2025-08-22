const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');
// Directly require the service. The server's startup logic ensures this is available.
const scholarshipService = require('../services/scholarshipService');

// Helper function to format category names for a clean display
const formatCategoryName = (name) => {
  return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};



// GET /api/scholarships/deadlines
router.get('/deadlines', async (req, res) => {
    const days = parseInt(req.query.days, 10) || 30;
    const deadlines = await scholarshipService.getUpcomingDeadlines(days);
    res.json({ upcoming_deadlines: deadlines });
});

// POST /api/scholarships/search
router.post('/search', async (req, res) => {
    const { studentProfile, options } = req.body;
    // Add validation for required request body
    if (!studentProfile) {
        return res.status(400).json({ error: 'studentProfile is required' });
    }
    const scholarships = await scholarshipService.searchScholarships(studentProfile, options);
    res.json({ scholarships });
});

// POST /api/scholarships/recommendations
router.post('/recommendations', async (req, res) => {
    const { studentProfile } = req.body;
    if (!studentProfile) {
        return res.status(400).json({ error: 'studentProfile is required' });
    }
    const recommendations = await scholarshipService.getRecommendations(studentProfile);
    res.json({ recommendations });
});

// POST /api/scholarships/stats - Get scholarship statistics for a student profile
router.post('/stats', async (req, res) => {
    const { studentProfile } = req.body;
    
    if (!studentProfile) {
        return res.status(400).json({ error: 'studentProfile is required' });
    }

    try {
        // Use scholarship service to get actual statistics
        const recommendations = await scholarshipService.getRecommendations(studentProfile);
        const totalEligibleAmount = recommendations.reduce((sum, sch) => sum + (sch.award_info?.funds?.amount || 0), 0);
        
        const opportunities = recommendations.map(scholarship => ({
            id: scholarship._id,
            title: scholarship.description,
            organization: scholarship.organization,
            amount: scholarship.award_info?.funds?.amount || 0,
            deadline: scholarship.application?.deadline?.date,
            fitScore: scholarship.fit_score || 0,
            matchReason: scholarship.match_reason || 'General eligibility'
        }));

        res.json({ 
            totalEligibleAmount, 
            opportunities 
        });
    } catch (error) {
        console.error('Scholarship stats error:', error);
        res.status(500).json({ error: 'Failed to get scholarship statistics' });
    }
});

// GET /api/scholarships/upcoming-deadlines - Get upcoming scholarship deadlines
router.get('/upcoming-deadlines', async (req, res) => {
    const days = parseInt(req.query.days, 10) || 30;
    
    try {
        const deadlines = await scholarshipService.getUpcomingDeadlines(days);
        res.json({ deadlines });
    } catch (error) {
        console.error('Upcoming deadlines error:', error);
        res.status(500).json({ error: 'Failed to get upcoming deadlines' });
    }
});

// GET /api/scholarships/categories - Get scholarship categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await scholarshipService.getScholarshipCategories();
        const formattedCategories = categories.map(cat => ({
            id: cat._id,
            name: formatCategoryName(cat._id),
            count: cat.count
        }));
        res.json({ categories: formattedCategories });
    } catch (error) {
        console.error('Error fetching scholarship categories:', error);
        res.status(500).json({ error: 'Failed to fetch scholarship categories' });
    }
});

// GET /api/scholarships/:id - Get scholarship by ID (must be last to avoid conflicts)
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const scholarship = await db.collection('scholarships').findOne({ _id: new ObjectId(id) });
        if (!scholarship) {
            return res.status(404).json({ error: 'Scholarship not found' });
        }
        res.json({ scholarship });
    } catch (error) {
        console.error('Error fetching scholarship by ID:', error);
        res.status(500).json({ error: 'Failed to fetch scholarship.' });
    }
});

module.exports = router;
