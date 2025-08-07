// backend/routes/user.js
const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const { verifyUser } = require('../middleware/auth');

router.post('/applications', verifyUser, async (req, res) => {
    const { scholarshipId, amount, status } = req.body;
    const userId = req.user.id;
    if (!scholarshipId || amount === undefined) {
        return res.status(400).json({ error: 'scholarshipId and amount are required.' });
    }
    try {
        const application = await userService.trackApplication({ userId, scholarshipId, amount, status });
        res.status(201).json({ message: 'Application tracked successfully', application });
    } catch (error) {
        res.status(500).json({ error: 'Failed to track application.' });
    }
});

router.get('/stats/:userId', verifyUser, async (req, res) => {
    if (req.user.id !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const stats = await userService.getUserStats(req.params.userId);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve user statistics.' });
    }
});

module.exports = router;
