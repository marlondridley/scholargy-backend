// routes/institutions.js - Defines API endpoints related to college data.

const express = require('express');
const { getDB } = require('../db');
const { redisClient } = require('../cache');
const router = express.Router();

const CACHE_EXPIRATION_SECONDS = 3600; // Cache for 1 hour

/**
 * @route   POST /api/institutions/search
 * @desc    Handles keyword search requests for institutions.
 * @access  Public
 */
router.post('/search', async (req, res) => {
  const { filters = {}, pagination = { page: 1, limit: 20 }, sortBy = {} } = req.body;
  try {
    const db = getDB();
    const collection = db.collection('ipeds_colleges');
    const page = parseInt(pagination.page, 10) || 1;
    const limit = parseInt(pagination.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const query = filters;
    const totalDocuments = await collection.countDocuments(query);
    const institutions = await collection.find(query).sort(sortBy).skip(skip).limit(limit).toArray();
    res.json({
      data: institutions,
      pagination: { page, limit, totalPages: Math.ceil(totalDocuments / limit), totalDocuments },
    });
  } catch (error) {
    console.error('Error performing advanced search:', error);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   GET /api/institutions/:id
 * @desc    Retrieves a single, comprehensive document for a specific institution.
 * @access  Public
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const unitIdAsNumber = parseInt(id, 10);
    if (isNaN(unitIdAsNumber)) {
        return res.status(400).json({ msg: 'Invalid Unit ID format.' });
    }

    const cacheKey = `institution_full:${unitIdAsNumber}`;

    try {
        if (redisClient?.isOpen) {
            const cachedData = await redisClient.get(cacheKey);
            if (cachedData) {
                console.log(`CACHE HIT for ${cacheKey}`);
                return res.json(JSON.parse(cachedData));
            }
        }

        console.log(`CACHE MISS for ${cacheKey}. Querying database...`);
        const db = getDB();
        const collection = db.collection('ipeds_colleges');

        const pipeline = [
            { $match: { "unitid": unitIdAsNumber } },
            {
                $lookup: {
                    from: "ipeds_derived_data",
                    localField: "unitid",
                    foreignField: "unitid",
                    as: "derivedData"
                }
            },
            {
                $unwind: {
                    path: "$derivedData",
                    preserveNullAndEmptyArrays: true
                }
            }
        ];

        const results = await collection.aggregate(pipeline).toArray();

        if (results.length === 0) {
            return res.status(404).json({ msg: 'Institution not found.' });
        }
        
        const document = results[0];

        if (redisClient?.isOpen) {
            await redisClient.set(cacheKey, JSON.stringify(document), {
                EX: CACHE_EXPIRATION_SECONDS,
            });
        }

        res.json(document);
    } catch (error) {
        console.error(`Error fetching institution with id ${id}:`, error);
        res.status(500).send('Server Error');
    }
});

/**
 * @route   POST /api/institutions/batch
 * @desc    Retrieves multiple institutions by their unit IDs.
 * @access  Public
 */
router.post('/batch', async (req, res) => {
    const { unitIds } = req.body;
    if (!unitIds || !Array.isArray(unitIds)) {
        return res.status(400).json({ error: 'unitIds array is required.' });
    }
    try {
        const db = getDB();
        if (!db) {
            return res.status(503).json({ error: 'Database service unavailable' });
        }
        
        const numericIds = unitIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (numericIds.length === 0) {
            return res.status(400).json({ error: 'No valid unit IDs provided.' });
        }
        
        const institutions = await db.collection('ipeds_colleges').find({
            unitid: { $in: numericIds }
        }).toArray();
        
        res.json({ institutions });
    } catch (error) {
        console.error('Error fetching institutions by IDs:', error);
        res.status(500).json({ error: 'Failed to fetch institutions by IDs.' });
    }
});

module.exports = router;