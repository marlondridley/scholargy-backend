// backend/routes/dashboard.js
const express = require('express');
const { getDB } = require('../db');
const { getNextSteps } = require('../services/getNextSteps');
const router = express.Router();

/**
 * Helper: safe parse numeric GPA
 */
function parseGpa(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/dashboard/top-matches
 * Query params: ?userId=alex123  (optional; if provided will use user's college_matches snapshot)
 *
 * Response:
 * { results: [ { unitid, name, logo, netCost, likelihood, details }, ... ] }
 */
router.get('/top-matches', async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    
    const { userId } = req.query;

    // Priority 1: use cached college_matches collection for user
    if (userId) {
      const cm = await db.collection('college_matches').findOne({ userId }, { sort: { snapshotAt: -1 } });
      if (cm && Array.isArray(cm.matches) && cm.matches.length > 0) {
        const results = cm.matches.map(m => ({
          unitid: m.unitid,
          name: m.name,
          logo: m.logo || `https://placehold.co/80x80?text=${encodeURIComponent((m.name||'').charAt(0)||'C')}`,
          netCost: m.netCost || m.estimatedCost || null,
          likelihood: m.likelihood || m.category || 'target',
          details: m.details || ''
        }));
        return res.json({ results });
      }
    }

    // Fallback: pick top 3 colleges from ipeds_colleges (simple heuristic: largest enrollment -> pretend match)
    const ipeds = db.collection('ipeds_colleges');
    const fallbackDocs = await ipeds.find({}).sort({ "enrollment.total": -1 }).limit(3).toArray();
    const results = fallbackDocs.map(d => ({
      unitid: d.unitid || d._id || null,
      name: d.general_info?.name || 'Unknown',
      logo: d.logo || `https://placehold.co/80x80?text=${encodeURIComponent((d.general_info?.name||'').charAt(0)||'C')}`,
      netCost: d.cost_and_aid?.tuition_in_state || null,
      likelihood: 'target',
      details: d.general_info ? `${d.general_info.city}, ${d.general_info.state}` : ''
    }));
    return res.json({ results });
  } catch (err) {
    console.error('GET /api/dashboard/top-matches error', err);
    res.status(500).json({ error: 'Failed to fetch top matches' });
  }
});

/**
 * GET /api/dashboard/scholarship-stats
 * Optional query: ?userId=alex123
 * Response:
 * { totalEligibleAmount, opportunities: [ { title, amount, deadline, description } ] }
 */
router.get('/scholarship-stats', async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    
    const scholarships = db.collection('scholarships');
    const { userId } = req.query;

    let profile = null;
    if (userId) {
      profile = await db.collection('user_applications').findOne({ userId });
      profile = profile || null;
    }

    // Build filter: if profile.gpa exists, use eligibility.minGPA <= profile.gpa OR missing minGPA
    const gpa = profile ? parseGpa(profile.gpa) : null;
    const filter = gpa != null
      ? { $or: [{ 'eligibility.minGPA': { $lte: gpa } }, { 'eligibility.minGPA': { $exists: false } }] }
      : {};

    const docs = await scholarships.find(filter).toArray();
    const opportunities = docs.map(d => ({
      title: d.title,
      amount: d.amount || 0,
      deadline: d.deadline ? (new Date(d.deadline)).toISOString().slice(0,10) : null, // YYYY-MM-DD
      description: d.description || ''
    }));

    const totalEligibleAmount = opportunities.reduce((s, o) => s + (o.amount || 0), 0);
    res.json({ totalEligibleAmount, opportunities });
  } catch (err) {
    console.error('GET /api/dashboard/scholarship-stats error', err);
    res.status(500).json({ error: 'Failed to fetch scholarship stats' });
  }
});

/**
 * GET /api/dashboard/upcoming-deadlines
 * Query: ?days=30
 *
 * Response: { deadlines: [ { title, deadline, daysLeft } ] }
 */
router.get('/upcoming-deadlines', async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    
    const scholarships = db.collection('scholarships');
    const days = parseInt(req.query.days || '30', 10);
    const now = new Date();
    const future = new Date(); future.setDate(now.getDate() + days);

    const docs = await scholarships.find({ deadline: { $exists: true, $gte: now.toISOString(), $lte: future.toISOString() } }).sort({ deadline: 1 }).toArray();
    const deadlines = docs.map(d => {
      const dl = new Date(d.deadline);
      const daysLeft = Math.ceil((dl.getTime() - Date.now()) / (1000*60*60*24));
      return {
        title: d.title,
        deadline: dl.toISOString().slice(0,10),
        daysLeft
      };
    });
    res.json({ deadlines });
  } catch (err) {
    console.error('GET /api/dashboard/upcoming-deadlines error', err);
    res.status(500).json({ error: 'Failed to fetch upcoming deadlines' });
  }
});

/**
 * POST /api/dashboard/next-steps
 * Body: { studentProfile, collegeMatches, scholarships, userId } (frontend can pass, or provide userId)
 *
 * Response:
 * { nextSteps: [ { task: "...", priority: "high|medium|low", dueDate: "..." }, ... ] }
 */
router.post('/next-steps', async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    
    let { studentProfile, collegeMatches, scholarships, userId } = req.body;

    // If userId provided but studentProfile missing, fetch profile from user_applications
    if (!studentProfile && userId) {
      const userDoc = await db.collection('user_applications').findOne({ userId });
      studentProfile = userDoc || null;
    }

    // If not provided, at least pass an empty object
    studentProfile = studentProfile || {};

    // If collegeMatches not provided, try to fetch cached snapshot
    if (!collegeMatches && userId) {
      const cm = await db.collection('college_matches').findOne({ userId }, { sort: { snapshotAt: -1 } });
      collegeMatches = cm?.matches || [];
    }
    collegeMatches = collegeMatches || [];

    // Enhance college matches with additional details from ipeds_colleges
    if (collegeMatches.length > 0) {
      const collegeIds = collegeMatches.map(college => college.unitid || college._id).filter(Boolean);
      if (collegeIds.length > 0) {
        const enhancedColleges = await db.collection('ipeds_colleges')
          .find({ unitid: { $in: collegeIds } })
          .toArray();
        
        // Merge enhanced data with existing college matches
        collegeMatches = collegeMatches.map(college => {
          const enhanced = enhancedColleges.find(ec => ec.unitid === college.unitid);
          if (enhanced) {
            return {
              ...college,
              // Add detailed college information
              admission_rate: enhanced.admissions?.admission_rate,
              graduation_rate: enhanced.graduation?.overall_rate,
              enrollment_total: enhanced.enrollment?.total,
              popular_majors: enhanced.academics?.popular_majors || [],
              tuition_in_state: enhanced.cost_and_aid?.tuition_in_state,
              tuition_out_of_state: enhanced.cost_and_aid?.tuition_out_of_state,
              room_board: enhanced.cost_and_aid?.room_board,
              sat_scores: enhanced.admissions?.sat_scores,
              act_scores: enhanced.admissions?.act_scores,
              location: enhanced.general_info ? {
                city: enhanced.general_info.city,
                state: enhanced.general_info.state,
                region: enhanced.general_info.region
              } : null
            };
          }
          return college;
        });
      }
    }

    // If scholarships not provided, fetch comprehensive scholarship data
    if (!scholarships) {
      const gpa = studentProfile ? parseGpa(studentProfile.gpa) : null;
      
      // Build scholarship filter based on student profile
      let filter = {};
      if (gpa != null) {
        filter = { $or: [{ 'eligibility.minGPA': { $lte: gpa } }, { 'eligibility.minGPA': { $exists: false } }] };
      }
      
      // Add other eligibility filters if available
      if (studentProfile.major || studentProfile.career_goals) {
        const majorKeywords = [studentProfile.major, studentProfile.career_goals].filter(Boolean);
        if (majorKeywords.length > 0) {
          filter.$or = filter.$or || [];
          filter.$or.push({
            $or: majorKeywords.map(keyword => ({
              $or: [
                { title: { $regex: keyword, $options: 'i' } },
                { description: { $regex: keyword, $options: 'i' } },
                { 'eligibility.majors': { $regex: keyword, $options: 'i' } }
              ]
            }))
          });
        }
      }

      const scholarshipDocs = await db.collection('scholarships')
        .find(filter)
        .sort({ amount: -1 })
        .limit(10)
        .toArray();
      
      scholarships = scholarshipDocs.map(d => ({
        title: d.title,
        amount: d.amount || 0,
        deadline: d.deadline ? new Date(d.deadline).toISOString().slice(0, 10) : null,
        description: d.description || '',
        eligibility: d.eligibility || {},
        application_requirements: d.application_requirements || [],
        url: d.url || null,
        category: d.category || 'General'
      }));
    }

    // Add contextual information for better AI analysis
    const context = {
      currentDate: new Date().toISOString().slice(0, 10),
      applicationSeason: getApplicationSeason(),
      financialAidDeadlines: getFinancialAidDeadlines(),
      testDates: getUpcomingTestDates()
    };

    // Enhanced student profile with calculated metrics
    const enhancedProfile = {
      ...studentProfile,
      academicMetrics: calculateAcademicMetrics(studentProfile),
      financialNeed: assessFinancialNeed(studentProfile),
      applicationReadiness: assessApplicationReadiness(studentProfile)
    };

    // Use the enhanced getNextSteps service with comprehensive context
    const nextSteps = await getNextSteps(enhancedProfile, collegeMatches, scholarships);
    
    res.json({ 
      nextSteps,
      context: {
        totalScholarshipAmount: scholarships.reduce((sum, s) => sum + (s.amount || 0), 0),
        scholarshipCount: scholarships.length,
        collegeCount: collegeMatches.length,
        applicationSeason: context.applicationSeason
      }
    });
  } catch (err) {
    console.error('POST /api/dashboard/next-steps error', err);
    res.status(500).json({ error: 'Failed to generate next steps' });
  }
});

// Helper functions for enhanced context
function getApplicationSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 9 && month <= 12) return 'Early Decision/Early Action';
  if (month >= 1 && month <= 3) return 'Regular Decision';
  if (month >= 4 && month <= 8) return 'Summer Planning';
  return 'General Application';
}

function getFinancialAidDeadlines() {
  const currentYear = new Date().getFullYear();
  return {
    fafsa: `${currentYear}-10-01`,
    css: `${currentYear}-10-01`,
    stateAid: `${currentYear}-03-01`
  };
}

function getUpcomingTestDates() {
  const currentYear = new Date().getFullYear();
  return {
    sat: [`${currentYear}-10-05`, `${currentYear}-11-02`, `${currentYear}-12-07`],
    act: [`${currentYear}-10-26`, `${currentYear}-12-14`]
  };
}

function calculateAcademicMetrics(profile) {
  if (!profile) return {};
  
  const gpa = parseGpa(profile.gpa);
  const sat = profile.satScore ? parseInt(profile.satScore) : null;
  
  return {
    gpaPercentile: gpa ? Math.min(Math.round((gpa / 4.0) * 100), 100) : null,
    satPercentile: sat ? Math.min(Math.round((sat / 1600) * 100), 100) : null,
    academicStrength: gpa >= 3.8 ? 'Excellent' : gpa >= 3.5 ? 'Strong' : gpa >= 3.0 ? 'Good' : 'Needs Improvement',
    testReadiness: sat >= 1400 ? 'Excellent' : sat >= 1200 ? 'Good' : sat >= 1000 ? 'Fair' : 'Needs Preparation'
  };
}

function assessFinancialNeed(profile) {
  if (!profile) return 'Unknown';
  
  const familyIncome = profile.familyIncome ? parseInt(profile.familyIncome) : null;
  if (!familyIncome) return 'Unknown';
  
  if (familyIncome < 50000) return 'High Need';
  if (familyIncome < 100000) return 'Moderate Need';
  return 'Low Need';
}

function assessApplicationReadiness(profile) {
  if (!profile) return 'Incomplete';
  
  const requiredFields = ['gpa', 'satScore', 'gradeLevel', 'extracurriculars', 'career_goals'];
  const completedFields = requiredFields.filter(field => {
    const value = profile[field];
    return value && value.toString().trim() !== '' && value !== 'N/A';
  });
  
  const completionPercentage = Math.round((completedFields.length / requiredFields.length) * 100);
  
  if (completionPercentage >= 80) return 'Ready';
  if (completionPercentage >= 60) return 'Nearly Ready';
  if (completionPercentage >= 40) return 'In Progress';
  return 'Needs Work';
}

module.exports = router;
