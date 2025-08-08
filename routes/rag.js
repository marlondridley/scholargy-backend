// backend/routes/rag.js
const express = require('express');
const router = express.Router();
const { performRagQuery } = require('../services/ragService');

// POST /api/rag - performs Retrieval-Augmented Generation
router.post('/', async (req, res) => {
  const { query, history = [] } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'A valid query string is required.' });
  }

  try {
    const result = await performRagQuery(query, history);
    res.json(result);
  } catch (error) {
    console.error('❌ RAG route error:', error.message);
    res.status(500).json({ error: 'Failed to process RAG query.' });
  }
});

module.exports = router;
