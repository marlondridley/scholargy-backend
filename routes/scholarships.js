const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { redisClient } = require('../cache');

// Helper function to format category names
const formatCategoryName = (categoryName) => {
    if (!categoryName) return 'Unknown Category';
    return categoryName
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
};

// Get scholarship categories with caching and fallback
router.get('/categories', async (req, res) => {
    try {
        const cacheKey = 'scholarships:categories';
        
        // Try cache first
        if (redisClient?.isOpen) {
            try {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    return res.json(JSON.parse(cached));
                }
            } catch (cacheError) {
                console.warn('Cache read error:', cacheError.message);
            }
        }

        // Get database connection
        const db = getDB();
        
        // If database is not available, return mock categories
        if (!db) {
            console.log('⚠️ Database not available, returning mock categories');
            const mockCategories = [
                { _id: 'stem', count: 15, total_value: 75000 },
                { _id: 'academic_excellence', count: 12, total_value: 60000 },
                { _id: 'minority_students', count: 8, total_value: 40000 },
                { _id: 'first_generation', count: 6, total_value: 30000 },
                { _id: 'community_service', count: 10, total_value: 50000 }
            ];
            
            const categories = mockCategories.map(cat => ({
                id: cat._id,
                name: formatCategoryName(cat._id),
                count: cat.count,
                total_value: cat.total_value || 0
            }));

            const result = {
                categories,
                total_scholarships: mockCategories.reduce((sum, cat) => sum + cat.count, 0),
                last_updated: new Date().toISOString(),
                source: 'Mock Data (Database Unavailable)'
            };

            return res.json(result);
        }
        
        const collection = db.collection('scholarships');
        
        const categoryAggregation = await collection.aggregate([
            { $match: { 'metadata.is_active': true } },
            { $unwind: '$search_data.categories' },
            { 
                $group: { 
                    _id: '$search_data.categories', 
                    count: { $sum: 1 },
                    total_value: { $sum: '$award_info.funds.amount' }
                } 
            },
            { $sort: { count: -1 } },
            { $limit: 20 }
        ]).toArray();

        const categories = categoryAggregation.map(cat => ({
            id: cat._id,
            name: formatCategoryName(cat._id),
            count: cat.count,
            total_value: cat.total_value || 0
        }));

        const result = {
            categories,
            total_scholarships: categoryAggregation.reduce((sum, cat) => sum + cat.count, 0),
            last_updated: new Date().toISOString(),
            source: 'Scholargy Database'
        };

        // Cache for 1 hour
        if (redisClient?.isOpen) {
            try {
                await redisClient.setEx(cacheKey, 3600, JSON.stringify(result));
            } catch (cacheError) {
                console.warn('Cache write error:', cacheError.message);
            }
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Get scholarship statistics
router.get('/stats', async (req, res) => {
    try {
        const db = getDB();
        
        if (!db) {
            console.log('⚠️ Database not available, returning mock stats');
            return res.json({
                totalScholarships: 150,
                totalAmount: 750000,
                averageAmount: 5000,
                source: 'Mock Data (Database Unavailable)'
            });
        }
        
        const collection = db.collection('scholarships');
        
        const stats = await collection.aggregate([
            { $match: { 'metadata.is_active': true } },
            {
                $group: {
                    _id: null,
                    totalScholarships: { $sum: 1 },
                    totalAmount: { $sum: '$award_info.funds.amount' },
                    averageAmount: { $avg: '$award_info.funds.amount' }
                }
            }
        ]).toArray();
        
        const result = stats[0] || {
            totalScholarships: 0,
            totalAmount: 0,
            averageAmount: 0
        };
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching scholarship stats:', error);
        res.status(500).json({ error: 'Failed to fetch scholarship statistics' });
    }
});

// Get scholarships by category
router.get('/category/:categoryId', async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        
        const db = getDB();
        
        if (!db) {
            console.log('⚠️ Database not available, returning mock category scholarships');
            return res.json({
                scholarships: [],
                total: 0,
                page: parseInt(page),
                limit: parseInt(limit),
                source: 'Mock Data (Database Unavailable)'
            });
        }
        
        const collection = db.collection('scholarships');
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const scholarships = await collection.find({
            'metadata.is_active': true,
            'search_data.categories': categoryId
        })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
        
        const total = await collection.countDocuments({
            'metadata.is_active': true,
            'search_data.categories': categoryId
        });
        
        res.json({
            scholarships,
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error fetching scholarships by category:', error);
        res.status(500).json({ error: 'Failed to fetch scholarships by category' });
    }
});

// Search scholarships by text
router.get('/search', async (req, res) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        
        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        
        const db = getDB();
        
        if (!db) {
            console.log('⚠️ Database not available, returning mock search results');
            return res.json({
                scholarships: [],
                total: 0,
                page: parseInt(page),
                limit: parseInt(limit),
                source: 'Mock Data (Database Unavailable)'
            });
        }
        
        const collection = db.collection('scholarships');
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const scholarships = await collection.find({
            $text: { $search: q },
            'metadata.is_active': true
        })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
        
        const total = await collection.countDocuments({
            $text: { $search: q },
            'metadata.is_active': true
        });
        
        res.json({
            scholarships,
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error searching scholarships:', error);
        res.status(500).json({ error: 'Failed to search scholarships' });
    }
});

// Get scholarship by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDB();
        
        if (!db) {
            console.log('⚠️ Database not available, returning mock scholarship');
            return res.status(404).json({ error: 'Scholarship not found' });
        }
        
        const collection = db.collection('scholarships');
        const scholarship = await collection.findOne({
            _id: id,
            'metadata.is_active': true
        });
        
        if (!scholarship) {
            return res.status(404).json({ error: 'Scholarship not found' });
        }
        
        res.json(scholarship);
    } catch (error) {
        console.error('Error fetching scholarship by ID:', error);
        res.status(500).json({ error: 'Failed to fetch scholarship' });
    }
});

module.exports = router;