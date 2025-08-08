// backend/routes/search.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { ObjectId } = require('mongodb');
const { generateEmbedding } = require('../services/aiService');
const { performRagQuery } = require('../services/ragService');

router.post('/vector', async (req, res) => {
    const { collectionName, query } = req.body;
    if (!collectionName || !query) {
        return res.status(400).json({ error: 'collectionName and query are required.' });
    }
    try {
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database not available.' });
        }

        // Check if AI service is available
        let queryVector;
        try {
            queryVector = await generateEmbedding(query);
        } catch (aiError) {
            console.warn('AI service not available, falling back to text search:', aiError.message);
            // Fallback to text search if embedding generation fails
            const results = await db.collection(collectionName).find({
                $text: { $search: query }
            }).limit(10).toArray();
            return res.json({ results, fallback: true });
        }

        const results = await db.collection(collectionName).aggregate([
            {
                $search: {
                    index: `vector_index_on_${collectionName}`,
                    cosmosDbVectorSearch: { vector: queryVector, path: 'embedding', k: 10 }
                }
            },
            { $project: { similarityScore: { $meta: "searchScore" }, document: "$$ROOT" } }
        ]).toArray();
        res.json({ results });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed.' });
    }
});

router.get('/match/:sourceCollection/:sourceId/:targetCollection', async (req, res) => {
    const { sourceCollection, sourceId, targetCollection } = req.params;
    try {
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database not available.' });
        }

        const sourceDoc = await db.collection(sourceCollection).findOne({ _id: new ObjectId(sourceId) });
        if (!sourceDoc || !sourceDoc.embedding) {
            return res.status(404).json({ error: 'Source document or its embedding not found.' });
        }

        const matches = await db.collection(targetCollection).aggregate([
             {
                $search: {
                    index: `vector_index_on_${targetCollection}`,
                    cosmosDbVectorSearch: { vector: sourceDoc.embedding, path: 'embedding', k: 5 }
                }
            },
            { $project: { similarityScore: { $meta: "searchScore" }, document: "$$ROOT" } }
        ]).toArray();
        res.json({ source: sourceDoc, matches });
    } catch (error) {
        console.error('Match error:', error);
        res.status(500).json({ error: 'Match failed.' });
    }
});

// Add RAG query endpoint
router.post('/rag', async (req, res) => {
    const { query, history = [] } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required.' });
    }
    try {
        const response = await performRagQuery(query, history);
        res.json({ response });
    } catch (error) {
        console.error('RAG query error:', error);
        res.status(500).json({ error: 'RAG query failed.' });
    }
});

module.exports = router;
