// backend/routes/profile.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { verifyUser } = require('../middleware/auth');

// GET /api/profile/:userId - Get user profile
router.get('/:userId', verifyUser, async (req, res) => {
    if (req.user.id !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden: You can only access your own profile.' });
    }
    try {
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        const profile = await db.collection('user_profiles').findOne({ userId: req.params.userId });
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        res.json(profile);
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/profile - Create user profile
router.post('/', verifyUser, async (req, res) => {
    const { profileData } = req.body;
    const userId = req.user.id; // Use the authenticated user's ID

    if (!profileData || !profileData.email) {
        return res.status(400).json({ error: 'Email is required in profileData' });
    }
    try {
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        const existingProfile = await db.collection('user_profiles').findOne({ userId: userId });
        if (existingProfile) {
            return res.status(409).json({ error: 'Profile already exists' });
        }
        const profileDocument = {
            userId: userId,
            email: profileData.email,
            fullName: profileData.fullName || profileData.email.split('@')[0],
            avatarUrl: profileData.avatarUrl || null,
            provider: profileData.provider || 'email',
            roles: ['student'], // Default role
            createdAt: new Date(),
            updatedAt: new Date(),
            gpa: null,
            satScore: null,
            extracurriculars: null,
        };
        const result = await db.collection('user_profiles').insertOne(profileDocument);
        const createdProfile = await db.collection('user_profiles').findOne({ _id: result.insertedId });
        res.status(201).json(createdProfile);
    } catch (error) {
        console.error('Profile creation error:', error);
        res.status(400).json({ error: 'Invalid profile data provided.', details: error.message });
    }
});

// PUT /api/profile/:userId - Update user profile
router.put('/:userId', verifyUser, async (req, res) => {
    if (req.user.id !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden: You can only update your own profile.' });
    }
    try {
        const { profileData } = req.body;
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        const result = await db.collection('user_profiles').findOneAndUpdate(
            { userId: req.params.userId },
            { $set: { ...profileData, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (!result.value) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        res.json(result.value);
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(400).json({ error: 'Invalid profile data provided.', details: error.message });
    }
});

module.exports = router;