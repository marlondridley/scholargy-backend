// backend/services/ragService.js
const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const { generateEmbedding, getChatCompletion } = require("./aiService");

const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const searchIndexName = process.env.AZURE_SEARCH_INDEX_NAME;

let searchClient;

if (searchEndpoint && searchApiKey && searchIndexName) {
  searchClient = new SearchClient(
    searchEndpoint,
    searchIndexName,
    new AzureKeyCredential(searchApiKey)
  );
  console.log("✅ Azure Search initialized.");
} else {
  console.warn("⚠️ Azure Search environment variables are not configured.");
}

// 🔍 Vector-based embedding search
async function performVectorSearch(userQuery, topK = 3) {
  const embedding = await generateEmbedding(userQuery);
  const results = await searchClient.search("", {
    vector: {
      value: embedding,
      kNearestNeighborsCount: topK,
      fields: "embedding"
    }
  });

  const contextChunks = [];
  for await (const result of results.results) {
    if (result?.document?.content) {
      contextChunks.push(result.document.content);
    }
  }

  return contextChunks;
}

// 💬 Combine RAG workflow
async function performRagQuery(userQuery, history = []) {
  if (!searchClient) {
    throw new Error("Azure Cognitive Search is not configured.");
  }

  try {
    const contextTextChunks = await performVectorSearch(userQuery, 3);
    const contextText = contextTextChunks.join("\n---\n") || "No relevant sources found.";

    const systemPrompt = `
You are "Scholargy AI", a helpful assistant. Use ONLY the following SOURCES to answer. 
If the answer is not found in the sources, say "I don't have that information."

SOURCES:
${contextText}
    `.trim();

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userQuery }
    ];

    const reply = await getChatCompletion(messages);
    return reply;

  } catch (err) {
    console.error("❌ RAG processing failed:", err);
    throw new Error("Failed to complete RAG query.");
  }
}

// Get top college matches for a student profile
async function topMatchesFromProfile(studentProfile) {
  try {
    // Mock implementation - replace with actual college matching logic
    const mockMatches = [
      {
        unitid: 243744,
        name: "Stanford University",
        logo: "https://example.com/stanford-logo.png",
        netCost: 25000,
        likelihood: "reach",
        details: "Highly selective university with strong STEM programs",
        admissionRate: 0.04,
        tuition: 55000
      },
      {
        unitid: 236948,
        name: "University of Washington",
        logo: "https://example.com/uw-logo.png",
        likelihood: "target",
        netCost: 18000,
        admissionRate: 0.52,
        tuition: 38000
      },
      {
        unitid: 104151,
        name: "Arizona State University",
        logo: "https://example.com/asu-logo.png",
        likelihood: "safety",
        netCost: 15000,
        admissionRate: 0.88,
        tuition: 29000
      }
    ];

    return mockMatches;
  } catch (error) {
    console.error('Error getting top matches:', error);
    throw new Error('Failed to get top college matches');
  }
}

// Get scholarship summary for a student profile
async function scholarshipSummaryFromProfile(studentProfile, scholarshipRecommendations = []) {
  try {
    // Mock implementation - replace with actual scholarship analysis
    const summary = {
      totalScholarships: 45,
      totalValue: 125000,
      categories: [
        { name: 'Academic Merit', count: 15, value: 45000 },
        { name: 'Need-Based', count: 12, value: 35000 },
        { name: 'Minority Students', count: 8, value: 25000 },
        { name: 'STEM', count: 10, value: 20000 }
      ],
      topRecommendations: [
        { name: 'National Merit Scholarship', value: 2500, deadline: '2025-10-01' },
        { name: 'Gates Millennium Scholars', value: 50000, deadline: '2025-01-15' }
      ],
      analysis: `Based on your profile with a ${studentProfile.gpa || 3.5} GPA and ${studentProfile.major || 'undecided'} major, you have strong eligibility for academic merit scholarships. Consider focusing on STEM-specific opportunities if pursuing a technical field.`
    };

    return summary;
  } catch (error) {
    console.error('Error generating scholarship summary:', error);
    throw new Error('Failed to generate scholarship summary');
  }
}

module.exports = { 
  performRagQuery, 
  topMatchesFromProfile, 
  scholarshipSummaryFromProfile 
};
