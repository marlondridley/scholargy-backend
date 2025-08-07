// backend/routes/search.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { ObjectId } = require('mongodb');
const { generateEmbedding } = require('../services/aiService');

router.post('/vector', async (req, res) => {
    const { collectionName, query } = req.body;
    if (!collectionName || !query) {
        return res.status(400).json({ error: 'collectionName and query are required.' });
    }
    try {
        const db = getDB();
        const queryVector = await generateEmbedding(query);
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
        res.status(500).json({ error: 'Search failed.' });
    }
});

router.get('/match/:sourceCollection/:sourceId/:targetCollection', async (req, res) => {
    const { sourceCollection, sourceId, targetCollection } = req.params;
    try {
        const db = getDB();
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
        res.status(500).json({ error: 'Match failed.' });
    }
});

module.exports = router;
