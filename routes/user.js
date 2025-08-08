// backend/routes/user.js
const express = require('express');
const router = express.Router();
const { verifyUser } = require('../middleware/auth');

// Helper function to get user service lazily
const getUserService = () => {
    try {
        return require('../services/userService');
    } catch (error) {
        console.warn('⚠️ User service not available:', error.message);
        return null;
    }
};

router.post('/applications', verifyUser, async (req, res) => {
    const { scholarshipId, amount, status } = req.body;
    const userId = req.user.id;
    if (!scholarshipId || amount === undefined) {
        return res.status(400).json({ error: 'scholarshipId and amount are required.' });
    }
    try {
        const userService = getUserService();
        if (!userService) {
            return res.status(503).json({ 
                error: 'User service not available.',
                message: 'Database service is not initialized.'
            });
        }

        const application = await userService.trackApplication({ userId, scholarshipId, amount, status });
        res.status(201).json({ message: 'Application tracked successfully', application });
    } catch (error) {
        console.error('Error tracking application:', error);
        res.status(500).json({ error: 'Failed to track application.' });
    }
});

router.get('/stats/:userId', verifyUser, async (req, res) => {
    if (req.user.id !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const userService = getUserService();
        if (!userService) {
            return res.json({ 
                activeApps: 0, 
                potentialAid: 0,
                source: 'Mock Data (Service Unavailable)'
            });
        }

        const stats = await userService.getUserStats(req.params.userId);
        res.json(stats);
    } catch (error) {
        console.error('Error getting user stats:', error);
        res.status(500).json({ error: 'Failed to retrieve user statistics.' });
    }
});

module.exports = router;
