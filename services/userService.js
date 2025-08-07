// backend/services/userService.js
const { getDB } = require('../db');

class UserService {
    constructor() {
        this.db = null;
        this.collection = null;
        this.initialize();
    }

    async initialize() {
        try {
            this.db = getDB();
            if (this.db) {
                this.collection = this.db.collection('user_applications');
                console.log('✅ User service initialized.');
            }
        } catch (error) {
            console.warn('⚠️ User service initialization failed:', error.message);
        }
    }

    async trackApplication(applicationData) {
        if (!this.collection) throw new Error("Database service not initialized.");
        const { userId, scholarshipId, amount, status = 'tracked' } = applicationData;
        const result = await this.collection.findOneAndUpdate(
            { userId, scholarshipId },
            { $set: { userId, scholarshipId, amount, status, trackedAt: new Date() } },
            { upsert: true, returnDocument: 'after' }
        );
        return result.value;
    }

    async getUserStats(userId) {
        if (!this.collection) throw new Error("Database service not initialized.");
        const statsPipeline = [
            { $match: { userId: userId } },
            { $group: { _id: "$userId", activeApps: { $sum: 1 }, potentialAid: { $sum: "$amount" } } }
        ];
        const result = await this.collection.aggregate(statsPipeline).toArray();
        if (result.length > 0) {
            return { activeApps: result[0].activeApps, potentialAid: result[0].potentialAid };
        }
        return { activeApps: 0, potentialAid: 0 };
    }
}

module.exports = new UserService();
