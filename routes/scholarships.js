// backend/routes/scholarships.js - Enhanced with smart matching and advanced features

const express = require('express');
const router = express.Router();
const scholarshipService = require('../services/scholarshipService');
const { redisClient } = require('../cache');
const { ObjectId } = require('mongodb');

// Initialize scholarship service
scholarshipService.initialize().catch(console.error);

/**
 * POST /api/scholarships/search
 * Search for scholarships based on student profile
 */
router.post('/search', async (req, res) => {
  try {
    const { studentProfile } = req.body;
    
    if (!studentProfile) {
      return res.status(400).json({ error: 'Student profile is required' });
    }

    // Create cache key based on profile
    const profileKey = `${studentProfile.gpa || 'nogpa'}_${studentProfile.gradeLevel || 'nograde'}_${studentProfile.satScore || 'nosat'}`;
    const cacheKey = `scholarships:search:${Buffer.from(profileKey).toString('base64').slice(0, 20)}`;
    
    // Try cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          console.log('Returning cached scholarship results');
          return res.json(JSON.parse(cached));
        }
      } catch (cacheError) {
        console.warn('Cache read error:', cacheError.message);
      }
    }

    // Search scholarships using enhanced service
    console.log('Searching scholarships for profile:', {
      gpa: studentProfile.gpa,
      gradeLevel: studentProfile.gradeLevel,
      satScore: studentProfile.satScore,
      actScore: studentProfile.actScore
    });
    
    const scholarships = await scholarshipService.searchScholarships(studentProfile);
    const stats = await scholarshipService.getScholarshipStats(studentProfile);
    
    const result = {
      scholarships: scholarships.map(s => ({
        id: s._id,
        title: s.description?.substring(0, 100) || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        amount_type: s.award_info?.funds?.amount_type || 'one_time',
        deadline: s.application?.deadline?.date,
        gpa_requirement: s.matching_criteria?.academic_requirements?.gpa_min,
        test_score_requirement: {
          sat: s.matching_criteria?.academic_requirements?.sat_min,
          act: s.matching_criteria?.academic_requirements?.act_min
        },
        description: s.description || 'Scholarship description',
        requirements: s.application?.requirements || [],
        categories: s.search_data?.categories || [],
        application_url: s.contact_info?.website || '#',
        fit_score: s.fit_score,
        days_until_deadline: s.days_until_deadline,
        urgency_level: s.urgency_level,
        renewable: s.award_info?.renewable || false,
        fields_of_study: s.matching_criteria?.fields_of_study || [],
        academic_levels: s.matching_criteria?.academic_levels || [],
        demographics: s.matching_criteria?.demographics || {}
      })),
      stats,
      timestamp: new Date().toISOString(),
      total_count: scholarships.length,
      source: 'Scholargy Database'
    };

    // Cache for 30 minutes
    if (redisClient) {
      try {
        await redisClient.setEx(cacheKey, 1800, JSON.stringify(result));
        console.log('Cached scholarship results');
      } catch (cacheError) {
        console.warn('Cache write error:', cacheError.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error searching scholarships:', error);
    res.status(500).json({ 
      error: 'Failed to search scholarships',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/scholarships/categories
 * Get available scholarship categories from the database
 */
router.get('/categories', async (req, res) => {
  try {
    const cacheKey = 'scholarships:categories';
    
    // Try cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (cacheError) {
        console.warn('Cache read error:', cacheError.message);
      }
    }

    // Get categories from database
    const { getDB } = require('../db');
    const db = getDB();
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
      name: this.formatCategoryName(cat._id),
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
    if (redisClient) {
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

/**
 * GET /api/scholarships/deadlines
 * Get scholarships with upcoming deadlines
 */
router.get('/deadlines', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const parsedDays = parseInt(days);
    
    const cacheKey = `scholarships:deadlines:${parsedDays}`;
    
    // Try cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (cacheError) {
        console.warn('Cache read error:', cacheError.message);
      }
    }

    const upcomingScholarships = await scholarshipService.getUpcomingDeadlines(parsedDays);
    
    const result = {
      upcoming_deadlines: upcomingScholarships.map(s => ({
        id: s._id,
        title: s.basic_info?.title || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        deadline: s.application?.deadline?.date,
        days_remaining: s.days_until_deadline,
        requirements: s.application?.requirements?.slice(0, 3) || [],
        urgency: s.urgency_level,
        application_url: s.application?.how_to_apply?.website || '#'
      })),
      total_value: upcomingScholarships.reduce((sum, s) => sum + (s.award_info?.funds?.amount || 0), 0),
      filter_days: parsedDays,
      critical_count: upcomingScholarships.filter(s => s.urgency_level === 'critical').length,
      timestamp: new Date().toISOString()
    };

    // Cache for 15 minutes
    if (redisClient) {
      try {
        await redisClient.setEx(cacheKey, 900, JSON.stringify(result));
      } catch (cacheError) {
        console.warn('Cache write error:', cacheError.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching deadline scholarships:', error);
    res.status(500).json({ error: 'Failed to fetch deadline scholarships' });
  }
});

/**
 * GET /api/scholarships/search-text
 * Text search scholarships
 */
router.get('/search-text', async (req, res) => {
  try {
    const { q: searchText, limit = 20 } = req.query;
    
    if (!searchText || searchText.trim().length < 2) {
      return res.status(400).json({ error: 'Search text must be at least 2 characters' });
    }

    const scholarships = await scholarshipService.searchScholarshipsByText(
      searchText.trim(), 
      null, 
      parseInt(limit)
    );
    
    const result = {
      scholarships: scholarships.map(s => ({
        id: s._id,
        title: s.basic_info?.title || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        deadline: s.application?.deadline?.date,
        description: s.basic_info?.description || s.basic_info?.summary || '',
        categories: s.search_data?.categories || [],
        days_until_deadline: s.days_until_deadline,
        search_score: s.score
      })),
      search_term: searchText,
      total_count: scholarships.length,
      timestamp: new Date().toISOString()
    };

    res.json(result);
  } catch (error) {
    console.error('Error in text search:', error);
    res.status(500).json({ error: 'Failed to search scholarships' });
  }
});

/**
 * GET /api/scholarships/category/:category
 * Get scholarships by category
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20 } = req.query;
    
    const cacheKey = `scholarships:category:${category}:${limit}`;
    
    // Try cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (cacheError) {
        console.warn('Cache read error:', cacheError.message);
      }
    }

    const scholarships = await scholarshipService.getScholarshipsByCategory(category, parseInt(limit));
    
    const result = {
      scholarships: scholarships.map(s => ({
        id: s._id,
        title: s.basic_info?.title || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        deadline: s.application?.deadline?.date,
        description: s.basic_info?.description || s.basic_info?.summary || '',
        requirements: s.application?.requirements || [],
        days_until_deadline: s.days_until_deadline
      })),
      category,
      total_count: scholarships.length,
      timestamp: new Date().toISOString()
    };

    // Cache for 1 hour
    if (redisClient) {
      try {
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(result));
      } catch (cacheError) {
        console.warn('Cache write error:', cacheError.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching scholarships by category:', error);
    res.status(500).json({ error: 'Failed to fetch scholarships by category' });
  }
});

/**
 * GET /api/scholarships/:id
 * Get detailed information about a specific scholarship
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid scholarship ID' });
    }

    const cacheKey = `scholarship:${id}`;
    
    // Try cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (cacheError) {
        console.warn('Cache read error:', cacheError.message);
      }
    }

    const scholarship = await scholarshipService.getScholarshipById(new ObjectId(id));
    
    const result = {
      scholarship: {
        id: scholarship._id,
        title: scholarship.basic_info?.title || 'Scholarship Title',
        provider: scholarship.organization || 'Organization',
        amount: scholarship.award_info?.funds?.amount || 0,
        deadline: scholarship.application?.deadline?.date,
        description: scholarship.basic_info?.description || scholarship.basic_info?.summary || '',
        requirements: scholarship.application?.requirements || [],
        categories: scholarship.search_data?.categories || [],
        fields_of_study: scholarship.matching_criteria?.fields_of_study || [],
        academic_levels: scholarship.matching_criteria?.academic_levels || [],
        demographics: scholarship.matching_criteria?.demographics || {}
      },
      timestamp: new Date().toISOString()
    };

    // Cache for 1 hour
    if (redisClient) {
      try {
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(result));
      } catch (cacheError) {
        console.warn('Cache write error:', cacheError.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching scholarship by ID:', error);
    res.status(500).json({ error: 'Failed to fetch scholarship by ID' });
  }
});

/**
 * GET /api/scholarships/recommendations
 * Get personalized scholarship recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const { studentProfile } = req.query;
    
    if (!studentProfile) {
      return res.status(400).json({ error: 'Student profile is required' });
    }

    const profile = JSON.parse(studentProfile);
    const recommendations = await scholarshipService.getRecommendations(profile, 10);
    
    const result = {
      recommendations: recommendations.map(s => ({
        id: s._id,
        title: s.description?.substring(0, 100) || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        deadline: s.application?.deadline?.date,
        fit_score: s.fit_score,
        categories: s.search_data?.categories || [],
        urgency_level: s.urgency_level
      })),
      timestamp: new Date().toISOString(),
      total_count: recommendations.length
    };

    res.json(result);
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

/**
 * GET /api/scholarships/stats
 * Get comprehensive scholarship statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { studentProfile } = req.query;
    const profile = studentProfile ? JSON.parse(studentProfile) : null;
    
    const stats = await scholarshipService.getScholarshipStats(profile);
    
    res.json({
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * GET /api/scholarships/insights
 * Get personalized scholarship insights and analytics
 */
router.get('/insights', async (req, res) => {
  try {
    const { studentProfile } = req.query;
    
    if (!studentProfile) {
      return res.status(400).json({ error: 'Student profile is required for insights' });
    }
    
    const profile = JSON.parse(studentProfile);
    const insights = await scholarshipService.getScholarshipInsights(profile);
    
    res.json({
      insights,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting scholarship insights:', error);
    res.status(500).json({ error: 'Failed to get scholarship insights' });
  }
});

/**
 * POST /api/scholarships/match
 * Advanced matching with filters
 */
router.post('/match', async (req, res) => {
  try {
    const { studentProfile, filters = {} } = req.body;
    
    if (!studentProfile) {
      return res.status(400).json({ error: 'Student profile is required' });
    }

    const options = {
      limit: filters.limit || 50,
      minScore: filters.minScore || 30,
      categories: filters.categories || [],
      deadlineFilter: filters.deadlineFilter || null,
      amountFilter: filters.amountFilter || null
    };

    const scholarships = await scholarshipService.searchScholarships(studentProfile, options);
    
    const result = {
      scholarships: scholarships.map(s => ({
        id: s._id,
        title: s.description?.substring(0, 100) || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        deadline: s.application?.deadline?.date,
        fit_score: s.fit_score,
        urgency_level: s.urgency_level,
        categories: s.search_data?.categories || [],
        fields_of_study: s.matching_criteria?.fields_of_study || []
      })),
      filters: options,
      timestamp: new Date().toISOString(),
      total_count: scholarships.length
    };

    res.json(result);
  } catch (error) {
    console.error('Error in advanced matching:', error);
    res.status(500).json({ error: 'Failed to perform advanced matching' });
  }
});

/**
 * GET /api/scholarships/keywords
 * Search scholarships by keywords using idx_keywords
 */
router.get('/keywords', async (req, res) => {
  try {
    const { keywords, studentProfile, limit = 20 } = req.query;
    
    if (!keywords) {
      return res.status(400).json({ error: 'Keywords are required' });
    }

    const keywordArray = keywords.split(',').map(k => k.trim());
    const profile = studentProfile ? JSON.parse(studentProfile) : null;
    
    const scholarships = await scholarshipService.searchScholarshipsByKeywords(keywordArray, profile, parseInt(limit));
    
    res.json({
      scholarships: scholarships.map(s => ({
        id: s._id,
        title: s.description?.substring(0, 100) || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        deadline: s.application?.deadline?.date,
        fit_score: s.fit_score,
        keyword_match_count: s.keyword_match_count,
        categories: s.search_data?.categories || []
      })),
      total_count: scholarships.length,
      keywords_searched: keywordArray
    });
  } catch (error) {
    console.error('Error searching by keywords:', error);
    res.status(500).json({ error: 'Failed to search by keywords' });
  }
});

/**
 * GET /api/scholarships/organization
 * Search scholarships by organization using idx_organization
 */
router.get('/organization', async (req, res) => {
  try {
    const { organization, studentProfile, limit = 20 } = req.query;
    
    if (!organization) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const profile = studentProfile ? JSON.parse(studentProfile) : null;
    const scholarships = await scholarshipService.searchScholarshipsByOrganization(organization, profile, parseInt(limit));
    
    res.json({
      scholarships: scholarships.map(s => ({
        id: s._id,
        title: s.description?.substring(0, 100) || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        deadline: s.application?.deadline?.date,
        fit_score: s.fit_score,
        categories: s.search_data?.categories || []
      })),
      total_count: scholarships.length,
      organization_searched: organization
    });
  } catch (error) {
    console.error('Error searching by organization:', error);
    res.status(500).json({ error: 'Failed to search by organization' });
  }
});

/**
 * GET /api/scholarships/contact-info
 * Get scholarships with contact information using idx_contact_emails
 */
router.get('/contact-info', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const scholarships = await scholarshipService.getScholarshipsWithContactInfo(parseInt(limit));
    
    res.json({
      scholarships: scholarships.map(s => ({
        id: s._id,
        title: s.description?.substring(0, 100) || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        deadline: s.application?.deadline?.date,
        contact_email: s.contact_info?.email,
        contact_phone: s.contact_info?.phone,
        website: s.contact_info?.website,
        categories: s.search_data?.categories || []
      })),
      total_count: scholarships.length
    });
  } catch (error) {
    console.error('Error getting scholarships with contact info:', error);
    res.status(500).json({ error: 'Failed to get scholarships with contact info' });
  }
});

/**
 * POST /api/scholarships/comprehensive-search
 * Advanced comprehensive search leveraging multiple indexes
 */
router.post('/comprehensive-search', async (req, res) => {
  try {
    const { studentProfile, options = {} } = req.body;
    
    if (!studentProfile) {
      return res.status(400).json({ error: 'Student profile is required' });
    }

    // Create cache key based on profile and options
    const optionsKey = JSON.stringify(options);
    const profileKey = `${studentProfile.gpa || 'nogpa'}_${studentProfile.gradeLevel || 'nograde'}`;
    const cacheKey = `scholarships:comprehensive:${Buffer.from(profileKey + optionsKey).toString('base64').slice(0, 20)}`;
    
    // Try cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          console.log('Returning cached comprehensive search results');
          return res.json(JSON.parse(cached));
        }
      } catch (cacheError) {
        console.warn('Cache read error:', cacheError.message);
      }
    }

    const scholarships = await scholarshipService.advancedComprehensiveSearch(studentProfile, options);
    
    const result = {
      scholarships: scholarships.map(s => ({
        id: s._id,
        title: s.description?.substring(0, 100) || 'Scholarship Title',
        provider: s.organization || 'Organization',
        amount: s.award_info?.funds?.amount || 0,
        deadline: s.application?.deadline?.date,
        fit_score: s.fit_score,
        categories: s.search_data?.categories || [],
        urgency_level: s.urgency_level,
        days_until_deadline: s.days_until_deadline
      })),
      total_count: scholarships.length,
      search_options: options,
      timestamp: new Date().toISOString()
    };

    // Cache for 15 minutes
    if (redisClient) {
      try {
        await redisClient.setEx(cacheKey, 900, JSON.stringify(result));
        console.log('Cached comprehensive search results');
      } catch (cacheError) {
        console.warn('Cache write error:', cacheError.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error in comprehensive search:', error);
    res.status(500).json({ error: 'Failed to perform comprehensive search' });
  }
});

/**
 * GET /api/scholarships/test
 * Test endpoint to check database connectivity and scholarship count
 */
router.get('/test', async (req, res) => {
  try {
    const { getDB } = require('../db');
    const db = getDB();
    const collection = db.collection('scholarships');
    
    // Count total scholarships
    const totalCount = await collection.countDocuments();
    
    // Get a sample scholarship
    const sampleScholarship = await collection.findOne({});
    
    // Check if collection exists and has data
    const collections = await db.listCollections().toArray();
    const scholarshipCollection = collections.find(col => col.name === 'scholarships');
    
    res.json({
      success: true,
      total_scholarships: totalCount,
      has_sample: !!sampleScholarship,
      collection_exists: !!scholarshipCollection,
      sample_scholarship: sampleScholarship ? {
        id: sampleScholarship._id,
        title: sampleScholarship.basic_info?.title || sampleScholarship.description?.substring(0, 100),
        provider: sampleScholarship.organization,
        amount: sampleScholarship.award_info?.funds?.amount,
        deadline: sampleScholarship.application?.deadline?.date
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in scholarship test endpoint:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;