// routes/probability.js - Calculates admission probabilities based on student profile
const express = require('express');
const { getDB } = require('../db');
const router = express.Router();

/**
 * Calculate admission probability based on student profile vs college stats
 */
const calculateProbability = (studentProfile, collegeStats) => {
    let score = 0;
    let maxScore = 0;

    // GPA comparison (40% weight)
    if (collegeStats.avgGPA && studentProfile.gpa) {
        maxScore += 40;
        const gpaDiff = studentProfile.gpa - collegeStats.avgGPA;
        if (gpaDiff >= 0.5) score += 40;
        else if (gpaDiff >= 0.2) score += 35;
        else if (gpaDiff >= 0) score += 30;
        else if (gpaDiff >= -0.2) score += 20;
        else if (gpaDiff >= -0.5) score += 10;
        else score += 5;
    }

    // SAT comparison (40% weight)
    if (collegeStats.sat75 && studentProfile.satScore) {
        maxScore += 40;
        const satDiff = studentProfile.satScore - collegeStats.sat75;
        if (satDiff >= 100) score += 40;
        else if (satDiff >= 50) score += 35;
        else if (satDiff >= 0) score += 30;
        else if (satDiff >= -50) score += 20;
        else if (satDiff >= -100) score += 10;
        else score += 5;
    }

    // Extracurriculars (20% weight)
    if (studentProfile.extracurricularStrength) {
        maxScore += 20;
        score += studentProfile.extracurricularStrength * 4; // 1-5 scale
    }

    // If admission rate is available, factor it in
    if (collegeStats.admissionRate && maxScore > 0) {
        const baseProb = score / maxScore;
        // Adjust based on selectivity
        return Math.min(baseProb * (collegeStats.admissionRate * 2), 0.95);
    }

    return maxScore > 0 ? score / maxScore : 0.5;
};

/**
 * @route   POST /api/probability/calculate
 * @desc    Calculate admission probabilities for multiple colleges
 * @access  Public
 */
router.post('/calculate', async (req, res) => {
    const { studentProfile, collegeIds } = req.body;

    if (!studentProfile || !collegeIds || collegeIds.length === 0) {
        return res.status(400).json({ error: 'Student profile and college IDs required' });
    }

    try {
        const db = getDB();
        const collection = db.collection('ipeds_colleges');
        
        // Fetch colleges
        const colleges = await collection.find({
            unitid: { $in: collegeIds.map(id => parseInt(id)) }
        }).toArray();

        // Calculate probabilities
        const results = colleges.map(college => {
            const collegeStats = {
                avgGPA: 3.5, // Default if not available
                sat75: college.admissions?.sat_scores?.math_75th && college.admissions?.sat_scores?.verbal_75th
                    ? college.admissions.sat_scores.math_75th + college.admissions.sat_scores.verbal_75th
                    : 1400,
                admissionRate: college.admissions?.admission_rate || 0.5
            };

            const probability = calculateProbability(studentProfile, collegeStats);
            
            return {
                unitid: college.unitid,
                name: college.general_info?.name,
                probability: Math.round(probability * 100),
                category: probability >= 0.7 ? 'safety' : probability >= 0.4 ? 'target' : 'reach'
            };
        });

        res.json({ results });
    } catch (error) {
        console.error('Error calculating probabilities:', error);
        res.status(500).json({ error: 'Failed to calculate probabilities' });
    }
});



module.exports = router;