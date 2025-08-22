// backend/routes/rag.js
const express = require('express');
const router = express.Router();
const { performRagQuery, topMatchesFromProfile, scholarshipSummaryFromProfile } = require('../services/ragService');

// POST /api/rag/top-matches
// Accepts { studentProfile } in body, returns top matches array
router.post('/top-matches', async (req, res) => {
  try {
    const { studentProfile } = req.body;
    const results = await topMatchesFromProfile(studentProfile);
    res.json({ results });
  } catch (err) {
    console.error('RAG top-matches error', err);
    res.status(500).json({ error: 'Failed to get top matches' });
  }
});

// POST /api/rag/scholarships
// Accepts { studentProfile, scholarshipRecommendations? } and returns a RAG-generated summary
router.post('/scholarships', async (req, res) => {
  try {
    const { studentProfile, scholarshipRecommendations = [] } = req.body;
    const summary = await scholarshipSummaryFromProfile(studentProfile, scholarshipRecommendations);
    res.json({ summary });
  } catch (err) {
    console.error('RAG scholarships error', err);
    res.status(500).json({ error: 'Failed to get scholarship summary' });
  }
});

// POST /api/rag/query
// Generic RAG query (used by CareerForecasterPage or ad-hoc queries)
router.post('/query', async (req, res) => {
  try {
    const { query, context } = req.body;
    const result = await performRagQuery(query, context);
    res.json({ text: result.text, sourceDocuments: result.sourceDocuments || [] });
  } catch (err) {
    console.error('RAG query error', err);
    res.status(500).json({ error: 'RAG query failed' });
  }
});

// GET /api/rag/health - Check RAG service health
router.get('/health', async (req, res) => {
  try {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ RAG health check error:', error.message);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

module.exports = router;
