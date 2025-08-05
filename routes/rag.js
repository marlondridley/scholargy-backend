// Enhanced RAG System for Scholargy AI - Optimized for Educational Data
const express = require('express');
const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const OpenAI = require('openai');
const { getDB } = require('../db');
const { redisClient } = require('../cache');
const router = express.Router();

// Configuration with validation
const config = {
  search: {
    endpoint: process.env.AZURE_SEARCH_ENDPOINT,
    apiKey: process.env.AZURE_SEARCH_API_KEY,
    indexName: process.env.AZURE_SEARCH_INDEX_NAME || 'scholargyindex'
  },
  openai: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    chatModel: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
    embeddingModel: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME || 'text-embedding-ada-002'
  }
};

// Validate configuration
const validateConfig = () => {
  const missing = [];
  if (!config.search.endpoint) missing.push('AZURE_SEARCH_ENDPOINT');
  if (!config.search.apiKey) missing.push('AZURE_SEARCH_API_KEY');
  if (!config.openai.endpoint) missing.push('AZURE_OPENAI_ENDPOINT');
  if (!config.openai.apiKey) missing.push('AZURE_OPENAI_API_KEY');
  
  if (missing.length > 0) {
    console.error(`❌ RAG Configuration Error: Missing ${missing.join(', ')}`);
    return false;
  }
  return true;
};

// Initialize clients with error handling
let clients = {
  search: null,
  openai: null,
  embedding: null
};

let isInitialized = false;

const initializeClients = async () => {
  if (!validateConfig()) return false;

  try {
    // Initialize Azure Search client
    clients.search = new SearchClient(
      config.search.endpoint,
      config.search.indexName,
      new AzureKeyCredential(config.search.apiKey)
    );

    // Initialize OpenAI client
    clients.openai = new OpenAI({
      baseURL: `${config.openai.endpoint}openai/deployments/${config.openai.chatModel}`,
      apiKey: config.openai.apiKey,
      defaultQuery: { "api-version": "2024-02-01" },
      defaultHeaders: { "api-key": config.openai.apiKey },
    });

    // Initialize embedding client
    clients.embedding = new OpenAI({
      baseURL: `${config.openai.endpoint}openai/deployments/${config.openai.embeddingModel}`,
      apiKey: config.openai.apiKey,
      defaultQuery: { "api-version": "2024-02-01" },
      defaultHeaders: { "api-key": config.openai.apiKey },
    });

    isInitialized = true;
    console.log('✅ RAG clients initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize RAG clients:', error);
    return false;
  }
};

// Initialize on module load
initializeClients();

// Custom error class for RAG operations
class RAGError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RAGError';
    this.code = code;
  }
}

// Generate embeddings with retry logic
const generateEmbedding = async (text, retries = 3) => {
  if (!clients.embedding) {
    throw new RAGError('Embedding client not initialized', 'CLIENT_ERROR');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await clients.embedding.embeddings.create({
        model: config.openai.embeddingModel,
        input: text,
      });

      if (!response.data?.[0]?.embedding) {
        throw new RAGError('Invalid embedding response', 'EMBEDDING_ERROR');
      }

      return response.data[0].embedding;
    } catch (error) {
      if (attempt === retries) {
        console.error('❌ Embedding generation failed after retries:', error);
        throw new RAGError(`Embedding generation failed: ${error.message}`, 'EMBEDDING_ERROR');
      }
      console.warn(`⚠️ Embedding attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

// Enhanced search with multiple strategies
const searchDocuments = async (question, embedding, category) => {
  const searches = [];

  try {
    // 1. Vector search in research articles
    if (clients.search) {
      console.log('🔍 Searching research articles...');
      const articleSearch = clients.search.search(question, {
        vectorSearch: {
          queries: [{
            vector: embedding,
            kNearestNeighbors: 5,
            fields: ["content_vector"]
          }]
        },
        select: ["content", "metadata_storage_name", "title"],
        top: 5,
        queryType: "semantic"
      });
      searches.push(articleSearch);
    }

    // 2. Database searches
    const db = getDB();
    if (db) {
      console.log('🔍 Searching IPEDS database...');
      const ipedsCollection = db.collection('ipeds_colleges');
      
      // Vector search in database
      const vectorSearch = ipedsCollection.aggregate([
        {
          $search: {
            cosmosSearch: {
              vector: embedding,
              path: 'text_vector',
              k: 5
            },
            returnStoredSource: true
          }
        },
        {
          $project: {
            score: { $meta: 'searchScore' },
            document: '$$ROOT'
          }
        }
      ]).toArray();

      // Text search with category-specific fields
      let textSearchFields = ['general_info.name', 'general_info.city', 'general_info.state'];
      if (category === 'admissions') {
        textSearchFields.push('admissions');
      } else if (category === 'academic') {
        textSearchFields.push('academics');
      }

      const textSearch = ipedsCollection.find(
        { $text: { $search: question } },
        { score: { $meta: "textScore" } }
      ).sort({ score: { $meta: "textScore" } }).limit(5).toArray();

      searches.push(vectorSearch, textSearch);
    }

    // Execute all searches concurrently
    const results = await Promise.all(searches);
    return results.flat();

  } catch (error) {
    console.error('❌ Document search failed:', error);
    return [];
  }
};

// Build context from search results
const buildContext = async (searchResults, question, category) => {
  try {
    const sources = [];
    let context = '';

    for (const result of searchResults) {
      if (result.content) {
        context += `\n\n${result.content}`;
        sources.push({
          title: result.title || result.metadata_storage_name || 'Unknown',
          content: result.content.substring(0, 200) + '...'
        });
      } else if (result.document) {
        const doc = result.document;
        const collegeInfo = `College: ${doc.general_info?.name || 'Unknown'}\nLocation: ${doc.general_info?.city || 'Unknown'}, ${doc.general_info?.state || 'Unknown'}\nAdmission Rate: ${doc.admissions?.admission_rate || 'Unknown'}\nSAT Range: ${doc.admissions?.sat_scores?.math_25th || 'Unknown'}-${doc.admissions?.sat_scores?.math_75th || 'Unknown'}`;
        context += `\n\n${collegeInfo}`;
        sources.push({
          title: doc.general_info?.name || 'College Data',
          content: collegeInfo
        });
      }
    }

    return { context: context.trim(), sources };
  } catch (error) {
    console.error('❌ Context building failed:', error);
    return { context: "", sources: [] };
  }
};

// Generate AI response with enhanced prompting
const generateResponse = async (question, context, history, category) => {
  try {
    const systemPrompt = `You are Scholargy AI, an expert college admissions counselor with deep knowledge of higher education data and research.

Role & Expertise:
- Provide accurate, helpful guidance on college admissions, costs, programs, and outcomes
- Base responses ONLY on the provided context from IPEDS data and research literature
- Acknowledge when information isn't available in the context

Response Guidelines:
- Be conversational, encouraging, and student-focused
- Provide specific data points when available (admission rates, costs, etc.)
- Suggest actionable next steps when appropriate
- If comparing institutions, highlight key differences
- For admission questions, consider holistic factors beyond just statistics

Context Quality: ${context.length > 100 ? 'Rich data available' : 'Limited data - acknowledge this'}
Question Category: ${category}

If the context doesn't contain relevant information, respond: "I don't have specific information about that in my current knowledge base, but I'd be happy to help with other college-related questions."`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history?.slice(-6) || []), // Keep last 6 messages for context
      { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` }
    ];

    console.log('🤖 Generating AI response...');
    
    const response = await clients.openai.chat.completions.create({
      model: config.openai.chatModel,
      messages,
      max_tokens: 800,
      temperature: 0.3,
      stream: false // Changed to non-streaming for better error handling
    });

    if (!response.choices?.[0]?.message?.content) {
      throw new RAGError('Invalid response from AI model', 'AI_ERROR');
    }

    return response.choices[0].message.content;

  } catch (error) {
    console.error('❌ AI response generation failed:', error);
    throw new RAGError(`AI response generation failed: ${error.message}`, 'AI_ERROR');
  }
};

// Cache management
const getCachedResponse = async (question) => {
  if (!redisClient?.isOpen) return null;
  
  try {
    const cacheKey = `rag:${Buffer.from(question).toString('base64')}`;
    const cached = await redisClient.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('⚠️ Cache retrieval failed:', error);
    return null;
  }
};

const setCachedResponse = async (question, response) => {
  if (!redisClient?.isOpen) return;
  
  try {
    const cacheKey = `rag:${Buffer.from(question).toString('base64')}`;
    await redisClient.set(cacheKey, JSON.stringify(response), {
      EX: 3600 // Cache for 1 hour
    });
  } catch (error) {
    console.warn('⚠️ Cache storage failed:', error);
  }
};

// Preprocess question to determine category
const preprocessQuestion = (question) => {
  const lowerQuestion = question.toLowerCase();
  
  let category = 'general';
  if (lowerQuestion.includes('admission') || lowerQuestion.includes('acceptance') || lowerQuestion.includes('chance')) {
    category = 'admissions';
  } else if (lowerQuestion.includes('cost') || lowerQuestion.includes('tuition') || lowerQuestion.includes('financial')) {
    category = 'financial';
  } else if (lowerQuestion.includes('program') || lowerQuestion.includes('major') || lowerQuestion.includes('course')) {
    category = 'academic';
  }

  return {
    original: question,
    cleaned: question.trim(),
    category
  };
};

// Logging middleware
router.use((req, res, next) => {
  console.log(`📝 RAG Request: ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    initialized: isInitialized,
    services: {
      search: !!clients.search,
      openai: !!clients.openai,
      embedding: !!clients.embedding,
      cache: redisClient?.isOpen || false
    },
    timestamp: new Date().toISOString()
  });
});

// Main RAG query endpoint with timeout handling
router.post('/query', async (req, res) => {
  const startTime = Date.now();
  let questionInfo = null;

  // Set response timeout
  const timeout = setTimeout(() => {
    console.log('⏰ RAG query timeout - sending fallback response');
    res.json({
      answer: "I'm processing your question, but it's taking longer than expected. Here's a helpful response while I work on getting you the best answer: For scholarships, focus on deadlines, essay requirements, and matching your profile. For college comparisons, consider factors like location, programs, and financial aid.",
      sources: [],
      question: req.body?.question || '',
      category: 'timeout',
      responseTime: Date.now() - startTime,
      timeout: true
    });
  }, 15000); // 15 second timeout

  try {
    const { question, history = [] } = req.body;

    // Input validation
    if (!question || typeof question !== 'string') {
      clearTimeout(timeout);
      return res.status(400).json({ 
        error: 'Valid question is required',
        code: 'INVALID_INPUT'
      });
    }

    if (question.length > 1000) {
      clearTimeout(timeout);
      return res.status(400).json({ 
        error: 'Question too long (max 1000 characters)',
        code: 'QUESTION_TOO_LONG'
      });
    }

    console.log(`🤖 RAG Query: "${question.substring(0, 100)}..."`);

    // Check initialization
    if (!isInitialized) {
      clearTimeout(timeout);
      console.log('⚠️ RAG service not initialized, providing fallback response');
      return res.json({
        answer: "I'm here to help with your college and scholarship questions! While I'm getting my advanced features ready, I can still provide helpful guidance. Try asking about scholarships, application deadlines, essay requirements, or finding the right college for you.",
        sources: [],
        question: question,
        category: 'fallback',
        responseTime: Date.now() - startTime,
        fallback: true
      });
    }

    // Preprocess question
    questionInfo = preprocessQuestion(question);
    console.log(`📊 Question category: ${questionInfo.category}`);

    // Check cache first
    const cached = await getCachedResponse(question);
    if (cached) {
      console.log('⚡ Returning cached response');
      return res.json({
        ...cached,
        cached: true,
        responseTime: Date.now() - startTime
      });
    }

    // Generate embedding
    let embedding;
    try {
      embedding = await generateEmbedding(questionInfo.cleaned);
      console.log(`✅ Generated embedding (${embedding.length} dimensions)`);
    } catch (embeddingError) {
      console.error('❌ Embedding generation failed:', embeddingError);
      // Continue without embedding for basic responses
      embedding = null;
    }

    // Search documents (if embedding available)
    let searchResults = [];
    if (embedding) {
      try {
        searchResults = await searchDocuments(question, embedding, questionInfo.category);
        console.log('✅ Document search completed');
      } catch (searchError) {
        console.error('❌ Document search failed:', searchError);
        // Continue without search results
      }
    }

    // Build context
    let context = '';
    let sources = [];
    if (searchResults.length > 0) {
      try {
        const contextResult = await buildContext(searchResults, question, questionInfo.category);
        context = contextResult.context;
        sources = contextResult.sources;
        console.log(`📋 Context built (${context.length} chars, ${sources.length} sources)`);
      } catch (contextError) {
        console.error('❌ Context building failed:', contextError);
      }
    }

    // Generate AI response
    let answer;
    try {
      answer = await generateResponse(question, context, history, questionInfo.category);
      console.log('✅ AI response generated');
    } catch (aiError) {
      console.error('❌ AI response generation failed:', aiError);
      
      // Provide fallback response based on question type
      const lowerQuestion = question.toLowerCase();
      if (lowerQuestion.includes('scholarship')) {
        answer = "I can help you find scholarships! Based on your profile, I recommend checking our scholarship database for opportunities that match your academic level, interests, and background. You can browse by category, search by keywords, or use our smart matching system to find the best opportunities for you.";
      } else if (lowerQuestion.includes('deadline') || lowerQuestion.includes('application')) {
        answer = "Application deadlines vary by institution and scholarship. I recommend checking our upcoming deadlines section and setting up reminders for important dates. Many scholarships have deadlines in the fall and winter months, so it's good to start early!";
      } else if (lowerQuestion.includes('essay') || lowerQuestion.includes('requirement')) {
        answer = "Essay requirements typically include personal statements, supplemental essays, and scholarship-specific prompts. Focus on telling your unique story, highlighting your achievements, and explaining why you're a good fit for the opportunity. Our AI can help you brainstorm topics and structure your essays.";
      } else if (lowerQuestion.includes('stem') || lowerQuestion.includes('science') || lowerQuestion.includes('technology')) {
        answer = "Great question! There are many STEM scholarships available for students interested in science, technology, engineering, and mathematics. These often have specific requirements related to your field of study, GPA, and sometimes research experience. Check our STEM category for targeted opportunities.";
      } else if (lowerQuestion.includes('merit') || lowerQuestion.includes('aid')) {
        answer = "Merit aid opportunities are based on academic achievement, leadership, and special talents. Many colleges offer merit scholarships, and there are also external organizations that provide merit-based funding. Your strong academic profile makes you competitive for these opportunities!";
      } else {
        answer = "I'm here to help with your college and scholarship questions! You can ask me about finding scholarships, application deadlines, essay requirements, financial aid, or any other college-related topics. What would you like to know more about?";
      }
    }

    // Prepare response
    const response = {
      answer,
      sources,
      question: questionInfo.original,
      category: questionInfo.category,
      responseTime: Date.now() - startTime
    };

    // Cache the response (if possible)
    try {
      await setCachedResponse(question, response);
    } catch (cacheError) {
      console.warn('⚠️ Cache storage failed:', cacheError);
    }

    clearTimeout(timeout);
    res.json(response);

  } catch (error) {
    console.error('❌ RAG query failed:', error);
    
    clearTimeout(timeout);
    
    // Provide a helpful fallback response
    const fallbackAnswer = "I'm here to help with your college and scholarship questions! While I'm experiencing some technical difficulties, I can still provide guidance. Try asking about scholarships, application deadlines, essay requirements, or finding the right college for you.";
    
    res.json({
      answer: fallbackAnswer,
      sources: [],
      question: question || 'Unknown',
      category: 'error',
      responseTime: Date.now() - startTime,
      error: true
    });
  }
});

// Top matches endpoint
router.post('/top-matches', async (req, res) => {
  try {
    const { studentProfile } = req.body;
    
    if (!studentProfile) {
      return res.status(400).json({ error: 'Student profile required' });
    }

    const db = getDB();
    const collection = db.collection('ipeds_colleges');
    
    // Simple matching logic - can be enhanced
    const matches = await collection.find({
      "admissions.admission_rate": { $gte: 0.3, $lte: 0.8 }
    }).limit(5).toArray();

    res.json({ data: matches });
  } catch (error) {
    console.error('Error getting top matches:', error);
    res.status(500).json({ error: 'Failed to get top matches' });
  }
});

// Scholarship summary endpoint
router.post('/scholarships', async (req, res) => {
  try {
    const { studentProfile } = req.body;
    
    if (!studentProfile) {
      return res.status(400).json({ error: 'Student profile required' });
    }

    // Mock scholarship data - replace with real logic
    const scholarships = [
      { college: "Stanford University", amount: 50000 },
      { college: "MIT", amount: 45000 },
      { college: "Harvard University", amount: 48000 },
      { college: "Yale University", amount: 46000 },
      { college: "Princeton University", amount: 47000 }
    ];

    res.json({ data: scholarships });
  } catch (error) {
    console.error('Error getting scholarship summary:', error);
    res.status(500).json({ error: 'Failed to get scholarship summary' });
  }
});

// Streaming endpoint for real-time responses
router.post('/stream', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { question, history = [] } = req.body;

    // Input validation
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ 
        error: 'Valid question is required',
        code: 'INVALID_INPUT'
      });
    }

    // Check initialization
    if (!isInitialized) {
      return res.status(503).json({ 
        error: 'RAG service not properly configured for streaming',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    console.log(`🌊 Streaming RAG Query: "${question.substring(0, 100)}..."`);

    // Set headers for streaming
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Preprocess question
    const questionInfo = preprocessQuestion(question);
    
    // Generate embedding
    let embedding;
    try {
      embedding = await generateEmbedding(questionInfo.cleaned);
    } catch (error) {
      console.error('❌ Embedding failed for streaming:', error);
      res.write('data: {"error": "Embedding service unavailable"}\n\n');
      res.end();
      return;
    }

    // Search documents
    let searchResults = [];
    try {
      searchResults = await searchDocuments(question, embedding, questionInfo.category);
    } catch (error) {
      console.error('❌ Search failed for streaming:', error);
      res.write('data: {"error": "Search service unavailable"}\n\n');
      res.end();
      return;
    }

    // Build context
    let context = '';
    let sources = [];
    if (searchResults.length > 0) {
      try {
        const contextResult = await buildContext(searchResults, question, questionInfo.category);
        context = contextResult.context;
        sources = contextResult.sources;
      } catch (error) {
        console.error('❌ Context building failed for streaming:', error);
      }
    }

    // Generate streaming response
    try {
      const systemPrompt = `You are Scholargy AI, an expert college admissions counselor. Provide helpful, accurate guidance on college admissions, scholarships, and academic planning. Be conversational and encouraging.`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...(history?.slice(-6) || []),
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` }
      ];

      const stream = await clients.openai.chat.completions.create({
        model: config.openai.chatModel,
        messages,
        max_tokens: 800,
        temperature: 0.3,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ content, type: 'chunk' })}\n\n`);
        }
      }

      // Send completion signal
      res.write(`data: ${JSON.stringify({ type: 'done', responseTime: Date.now() - startTime })}\n\n`);
      res.end();

    } catch (error) {
      console.error('❌ Streaming AI response failed:', error);
      res.write(`data: ${JSON.stringify({ error: 'AI service temporarily unavailable' })}\n\n`);
      res.end();
    }

  } catch (error) {
    console.error('❌ Streaming RAG query failed:', error);
    res.write(`data: ${JSON.stringify({ error: 'Service temporarily unavailable' })}\n\n`);
    res.end();
  }
});

module.exports = router;
