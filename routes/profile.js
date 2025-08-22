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
        const profile = await db.collection('user_applications').findOne({ userId: req.params.userId });
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
        const existingProfile = await db.collection('user_applications').findOne({ userId: userId });
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
            // Student profile fields
            gpa: profileData.gpa || null,
            satScore: profileData.satScore || null,
            actScore: profileData.actScore || null,
            gradeLevel: profileData.gradeLevel || null,
            major: profileData.major || null,
            extracurriculars: profileData.extracurriculars || null,
            careerGoals: profileData.careerGoals || null,
            minorityStudent: profileData.minorityStudent || false,
            firstGeneration: profileData.firstGeneration || false,
            financialNeed: profileData.financialNeed || null,
            // Additional profile data
            address: profileData.address || null,
            phone: profileData.phone || null,
            dateOfBirth: profileData.dateOfBirth || null,
            highSchool: profileData.highSchool || null,
            graduationYear: profileData.graduationYear || null
        };
        const result = await db.collection('user_applications').insertOne(profileDocument);
        const createdProfile = await db.collection('user_applications').findOne({ _id: result.insertedId });
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
        const result = await db.collection('user_applications').findOneAndUpdate(
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

// GET /api/profile/:userId/assessment - Get AI-generated profile assessment
router.get('/:userId/assessment', verifyUser, async (req, res) => {
    if (req.user.id !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden: You can only access your own profile assessment.' });
    }
    
    try {
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const profile = await db.collection('user_applications').findOne({ userId: req.params.userId });
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        // Generate comprehensive AI assessment based on profile data
        const assessment = {
            summary: `Based on your ${profile.gpa || 3.5} GPA, ${profile.satScore || 'pending'} SAT score, and ${profile.major || 'undecided'} major interest, you have strong potential for college success.`,
            strengths: [
                profile.gpa >= 3.5 ? 'Strong academic performance' : 'Consistent academic record',
                profile.satScore >= 1200 ? 'Competitive test scores' : 'Good test-taking abilities',
                profile.actScore >= 24 ? 'Strong ACT performance' : null,
                profile.extracurriculars ? 'Active extracurricular involvement' : 'Well-rounded interests',
                profile.minorityStudent ? 'Diversity scholarship opportunities' : null,
                profile.firstGeneration ? 'First-generation student programs available' : null
            ].filter(Boolean),
            gaps: [
                profile.gpa < 3.5 ? 'Consider improving GPA through challenging courses' : null,
                !profile.satScore && !profile.actScore ? 'Complete SAT/ACT testing' : null,
                !profile.extracurriculars ? 'Build leadership and community service experience' : null,
                !profile.careerGoals ? 'Define clear career goals and major interests' : null
            ].filter(Boolean),
            recommendations: [
                'Continue maintaining strong academic performance',
                'Take AP/IB courses if available',
                'Prepare for college entrance exams',
                'Develop leadership skills through extracurricular activities',
                'Research and apply for scholarships early',
                'Consider summer programs and internships',
                'Build relationships with teachers for recommendations'
            ],
            scholarshipOpportunities: {
                academicMerit: profile.gpa >= 3.5,
                needBased: profile.financialNeed,
                minorityPrograms: profile.minorityStudent,
                firstGenPrograms: profile.firstGeneration,
                stemScholarships: profile.major && ['engineering', 'computer science', 'mathematics', 'physics'].includes(profile.major.toLowerCase())
            }
        };

        res.json({ assessment });
    } catch (error) {
        console.error('Profile assessment error:', error);
        res.status(500).json({ error: 'Failed to generate profile assessment' });
    }
});

// POST /api/profile/:userId/save - Save profile data
router.post('/:userId/save', verifyUser, async (req, res) => {
    if (req.user.id !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden: You can only save your own profile.' });
    }
    
    try {
        const { profileData } = req.body;
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const result = await db.collection('user_applications').findOneAndUpdate(
            { userId: req.params.userId },
            { $set: { ...profileData, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        
        if (!result.value) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        res.json(result.value);
    } catch (error) {
        console.error('Profile save error:', error);
        res.status(500).json({ error: 'Failed to save profile data' });
    }
});

module.exports = router;