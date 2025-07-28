// routes/institutions.js - Defines API endpoints related to college data.
/**
 * @route   POST /api/institutions/search
 * @desc    Handles advanced search requests for institutions.
 * @access  Public
 */
const express = require('express');
const { getDB } = require('../db');
const { redisClient } = require('../cache');
const router = express.Router();

const CACHE_EXPIRATION_SECONDS = 3600;

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

module.exports = router;