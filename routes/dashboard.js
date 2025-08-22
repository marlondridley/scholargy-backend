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
 * Body: { studentProfile, collegeMatches, scholarships }   (frontend can pass, or provide userId)
 *
 * Response:
 * { nextSteps: [ { task: "..." }, ... ] }
 */
router.post('/next-steps', async (req, res) => {
  try {
    const db = getDB();
    if (!db) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    
    let { studentProfile, collegeMatches, scholarships, userId } = req.body;

    // If userId provided but studentProfile missing, fetch profile
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

    // If scholarships not provided, fetch top 5 scholarships for context
    if (!scholarships) {
      const docs = await db.collection('scholarships').find({}).sort({ amount: -1 }).limit(5).toArray();
      scholarships = docs.map(d => ({ title: d.title, amount: d.amount, deadline: d.deadline }));
    }

    // Use the getNextSteps service
    const nextSteps = await getNextSteps(studentProfile, collegeMatches, scholarships);
    
    res.json({ nextSteps });
  } catch (err) {
    console.error('POST /api/dashboard/next-steps error', err);
    res.status(500).json({ error: 'Failed to generate next steps' });
  }
});

module.exports = router;
