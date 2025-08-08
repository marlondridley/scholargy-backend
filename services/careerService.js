// Fixed version of careerService.js with proper class method syntax
const { getDB } = require('../db');
const { generateEmbedding, getChatCompletion } = require('./aiService');

class CareerService {
  constructor() {
    this.db = null;
    this.collection = null;
  }

  async initialize() {
    try {
      this.db = getDB();
      if (this.db) {
        this.collection = this.db.collection('careers');
        console.log('✅ Career service initialized.');
      }
    } catch (error) {
      console.warn('⚠️ Career service initialization failed:', error.message);
    }
  }

  async findCareers(query) {
    if (!this.collection) throw new Error('Career database not initialized.');
    const queryVector = await generateEmbedding(query);
    return await this.collection
      .aggregate([
        {
          $search: {
            index: 'vector_index_on_careers',
            cosmosDbVectorSearch: {
              vector: queryVector,
              path: 'embedding',
              k: 5,
            },
          },
        },
        { $limit: 5 },
      ])
      .toArray();
  }

  async generateForecast(studentProfile, career, college) {
    const prompt = `
      You are "Scholargy AI," a financial and career advisor.
      Generate a "Career & ROI Forecast" for a student.
      **Student Profile:** - Major: ${studentProfile.major || 'Undecided'}
      **Chosen Career: ${career.title}** - Average Starting Salary: $${career.avg_salary_start.toLocaleString()} - 10-Year Salary Projection: $${career.avg_salary_10_year.toLocaleString()}
      **Chosen College: ${college.general_info.name}** - Estimated 4-Year Cost (In-State): $${(college.cost_and_aid.tuition_in_state * 4).toLocaleString()}
      Based on this, provide a concise forecast covering: 1. **Earnings Potential**, 2. **Cost vs. Earnings Analysis**, and 3. **Recommendation**.
    `;
    const messages = [{ role: 'user', content: prompt }];
    return await getChatCompletion(messages);
  }
}

module.exports = new CareerService();
