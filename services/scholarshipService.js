const { getDB } = require('../db');

class ScholarshipService {
    constructor() {
        this.collection = null;
        this.initialized = false;
    }

    async initialize() {
        try {
            const db = getDB();
            if (db) {
                this.collection = db.collection('scholarships');
                this.initialized = true;
                console.log('✅ ScholarshipService initialized successfully');
            } else {
                console.warn('⚠️ Database not available, ScholarshipService will use mock data');
                this.initialized = false;
            }
        } catch (error) {
            console.error('❌ Failed to initialize ScholarshipService:', error);
            this.initialized = false;
        }
    }

    async getScholarshipCategories() {
        try {
            // If database is not available, return mock categories
            if (!this.collection) {
                console.log('⚠️ Database not available, returning mock categories');
                return [
                    { _id: 'stem', count: 15, total_value: 75000 },
                    { _id: 'academic_excellence', count: 12, total_value: 60000 },
                    { _id: 'minority_students', count: 8, total_value: 40000 },
                    { _id: 'first_generation', count: 6, total_value: 30000 },
                    { _id: 'community_service', count: 10, total_value: 50000 }
                ];
            }

            const categoryAggregation = await this.collection.aggregate([
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

            return categoryAggregation;
        } catch (error) {
            console.error('Error getting scholarship categories:', error);
            return [];
        }
    }

    async getUpcomingDeadlines(days = 30) {
        try {
            // If database is not available, return mock data
            if (!this.collection) {
                console.log('⚠️ Database not available, returning mock deadlines');
                return [
                    {
                        _id: '1',
                        description: 'STEM Excellence Scholarship',
                        organization: 'National Science Foundation',
                        'award_info': { 'funds': { 'amount': 5000 } },
                        'application': { 'deadline': { 'date': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
                        urgency_level: 'critical',
                        days_until_deadline: 7
                    },
                    {
                        _id: '2',
                        description: 'Merit-Based Academic Scholarship',
                        organization: 'Academic Excellence Foundation',
                        'award_info': { 'funds': { 'amount': 3000 } },
                        'application': { 'deadline': { 'date': new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } },
                        urgency_level: 'urgent',
                        days_until_deadline: 14
                    }
                ];
            }
            
            const now = new Date();
            const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
            
            const pipeline = [
                {
                    $match: {
                        'metadata.is_active': true,
                        'application.deadline.date': { $gte: now, $lte: futureDate }
                    }
                },
                {
                    $addFields: {
                        days_until_deadline: {
                            $ceil: {
                                $divide: [
                                    { $subtract: ['$application.deadline.date', now] },
                                    1000 * 60 * 60 * 24
                                ]
                            }
                        },
                        urgency_level: {
                            $cond: {
                                if: { $lte: ['$days_until_deadline', 7] },
                                then: 'critical',
                                else: {
                                    $cond: {
                                        if: { $lte: ['$days_until_deadline', 30] },
                                        then: 'urgent',
                                        else: 'normal'
                                    }
                                }
                            }
                        }
                    }
                },
                { $sort: { 'application.deadline.date': 1 } },
                { $limit: 50 }
            ];
            
            return await this.collection.aggregate(pipeline).toArray();
        } catch (error) {
            console.error('Error getting upcoming deadlines:', error);
            return [];
        }
    }

    async searchScholarships(studentProfile, options = {}) {
        try {
            const { searchText = '', limit = 20 } = options;
            
            // If database is not available, return mock data
            if (!this.collection) {
                console.log('⚠️ Database not available, returning mock search results');
                return [
                    {
                        _id: '1',
                        description: 'STEM Excellence Scholarship',
                        organization: 'National Science Foundation',
                        'award_info': { 'funds': { 'amount': 5000 } },
                        'application': { 'deadline': { 'date': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
                        urgency_level: 'critical',
                        days_until_deadline: 7
                    },
                    {
                        _id: '2',
                        description: 'Merit-Based Academic Scholarship',
                        organization: 'Academic Excellence Foundation',
                        'award_info': { 'funds': { 'amount': 3000 } },
                        'application': { 'deadline': { 'date': new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } },
                        urgency_level: 'urgent',
                        days_until_deadline: 14
                    }
                ];
            }
            
            // Use text search
            const searchResults = await this.collection.find({
                $text: { $search: searchText },
                'metadata.is_active': true
            })
            .limit(limit * 2)
            .toArray();
            
            // Calculate fit scores if student profile provided
            if (studentProfile) {
                return searchResults
                    .map(scholarship => ({
                        ...scholarship,
                        fit_score: this.calculateFitScore(studentProfile, scholarship)
                    }))
                    .sort((a, b) => b.fit_score - a.fit_score)
                    .slice(0, limit);
            }
            
            return searchResults.slice(0, limit);
        } catch (error) {
            console.error('Error in scholarship search:', error);
            return [];
        }
    }

    async getRecommendations(studentProfile) {
        try {
            // If database is not available, return mock recommendations
            if (!this.collection) {
                console.log('⚠️ Database not available, returning mock recommendations');
                return [
                    {
                        _id: '1',
                        description: 'STEM Excellence Scholarship',
                        organization: 'National Science Foundation',
                        'award_info': { 'funds': { 'amount': 5000 } },
                        fit_score: 95,
                        match_reason: 'Strong match for STEM students'
                    },
                    {
                        _id: '2',
                        description: 'Merit-Based Academic Scholarship',
                        organization: 'Academic Excellence Foundation',
                        'award_info': { 'funds': { 'amount': 3000 } },
                        fit_score: 88,
                        match_reason: 'High academic achievement requirement'
                    }
                ];
            }
            
            // Get recommendations based on student profile
            const recommendations = await this.collection.find({
                'metadata.is_active': true
            })
            .limit(20)
            .toArray();
            
            return recommendations
                .map(scholarship => ({
                    ...scholarship,
                    fit_score: this.calculateFitScore(studentProfile, scholarship),
                    match_reason: this.getMatchReason(studentProfile, scholarship)
                }))
                .sort((a, b) => b.fit_score - a.fit_score)
                .slice(0, 10);
        } catch (error) {
            console.error('Error getting recommendations:', error);
            return [];
        }
    }

    calculateFitScore(studentProfile, scholarship) {
        // Simple fit score calculation
        let score = 50; // Base score
        
        // Add points based on various criteria
        if (studentProfile.major && scholarship.search_data?.categories?.includes(studentProfile.major)) {
            score += 20;
        }
        
        if (studentProfile.gpa && studentProfile.gpa >= 3.5) {
            score += 15;
        }
        
        if (studentProfile.minority_student && scholarship.search_data?.categories?.includes('minority_students')) {
            score += 15;
        }
        
        return Math.min(score, 100);
    }

    getMatchReason(studentProfile, scholarship) {
        const reasons = [];
        
        if (studentProfile.major && scholarship.search_data?.categories?.includes(studentProfile.major)) {
            reasons.push('Major match');
        }
        
        if (studentProfile.gpa && studentProfile.gpa >= 3.5) {
            reasons.push('High GPA');
        }
        
        if (studentProfile.minority_student && scholarship.search_data?.categories?.includes('minority_students')) {
            reasons.push('Minority student');
        }
        
        return reasons.length > 0 ? reasons.join(', ') : 'General eligibility';
    }
}

// Create and export a singleton instance
const scholarshipService = new ScholarshipService();

module.exports = scholarshipService;