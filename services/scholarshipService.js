// backend/services/scholarshipService.js (update these methods)

async getUpcomingDeadlines(days = 30) {
    try {
        // Add null check
        if (!this.collection) {
            console.warn('⚠️ Database not available, returning empty deadlines');
            return [];
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

async searchScholarshipsByText(searchText, studentProfile = null, limit = 20) {
    try {
        // Add null check
        if (!this.collection) {
            console.warn('⚠️ Database not available, returning empty search results');
            return [];
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
        console.error('Error in text search:', error);
        return [];
    }
}