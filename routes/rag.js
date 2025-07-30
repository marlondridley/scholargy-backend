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

const initializeClients = () => {
  try {
    if (validateConfig()) {
      // Initialize Azure Search client
      clients.search = new SearchClient(
        config.search.endpoint,
        config.search.indexName,
        new AzureKeyCredential(config.search.apiKey)
      );

      // Initialize OpenAI clients with proper base URLs
      const baseURL = `${config.openai.endpoint}openai`;
      const defaultHeaders = { "api-key": config.openai.apiKey };
      const defaultQuery = { "api-version": "2024-02-01" };

      clients.openai = new OpenAI({
        baseURL,
        apiKey: config.openai.apiKey,
        defaultHeaders,
        defaultQuery
      });

      clients.embedding = new OpenAI({
        baseURL,
        apiKey: config.openai.apiKey,
        defaultHeaders,
        defaultQuery
      });

      console.log('✅ RAG clients initialized successfully');
      return true;
    }
  } catch (error) {
    console.error('❌ Failed to initialize RAG clients:', error);
    return false;
  }
  return false;
};

// Initialize clients on module load
const isInitialized = initializeClients();

// Enhanced error handling
class RAGError extends Error {
  constructor(message, type = 'GENERAL', statusCode = 500) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
  }
}

// Question preprocessing and categorization
const preprocessQuestion = (question) => {
  const cleanQuestion = question.trim().toLowerCase();
  
  // Categorize questions for better search strategies
  const categories = {
    admissions: /admission|accept|rate|requirement|gpa|sat|act|apply/i,
    financial: /cost|tuition|aid|scholarship|finance|price|afford/i,
    academic: /major|program|course|degree|curriculum|faculty/i,
    campus: /campus|location|size|student life|dorm|housing/i,
    outcomes: /graduation|employment|salary|career|job|outcome/i,
    comparison: /compare|versus|vs|better|best|rank/i
  };

  const category = Object.keys(categories).find(cat => categories[cat].test(cleanQuestion)) || 'general';
  
  return {
    original: question,
    cleaned: cleanQuestion,
    category,
    keywords: extractKeywords(cleanQuestion)
  };
};

// Extract relevant keywords for enhanced search
const extractKeywords = (text) => {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'what', 'how', 'when', 'where', 'why', 'which', 'who']);
  return text.split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Limit to top 10 keywords
};

// Enhanced embedding generation with retry logic
const generateEmbedding = async (text, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔍 Generating embedding (attempt ${attempt})`);
      
      const response = await clients.embedding.embeddings.create({
        model: config.openai.embeddingModel,
        input: text.substring(0, 8000) // Limit input length
      });

      if (!response.data?.[0]?.embedding) {
        throw new RAGError('Invalid embedding response', 'EMBEDDING_ERROR');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error(`❌ Embedding attempt ${attempt} failed:`, error.message);
      
      if (attempt === retries) {
        throw new RAGError(`Failed to generate embedding after ${retries} attempts`, 'EMBEDDING_ERROR');
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
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
    const results = await Promise.allSettled(searches);
    
    return {
      articles: results[0]?.status === 'fulfilled' ? results[0].value : null,
      vectorResults: results[1]?.status === 'fulfilled' ? results[1].value : [],
      textResults: results[2]?.status === 'fulfilled' ? results[2].value : []
    };

  } catch (error) {
    console.error('❌ Search error:', error);
    throw new RAGError('Search operation failed', 'SEARCH_ERROR');
  }
};

// Enhanced context building with relevance scoring
const buildContext = async (searchResults, question, category) => {
  let context = "";
  let sources = [];

  try {
    // Process research articles
    if (searchResults.articles) {
      let articleContext = "";
      let articleCount = 0;
      
      for await (const result of searchResults.articles.results) {
        if (articleCount >= 3) break; // Limit to top 3 articles
        
        const source = result.document.metadata_storage_name || result.document.title || 'Research Article';
        const content = result.document.content || '';
        
        if (content.trim() && content.length > 50) {
          // Extract most relevant sentences
          const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
          const relevantSentences = sentences
            .filter(sentence => question.split(' ').some(word => 
              sentence.toLowerCase().includes(word.toLowerCase())
            ))
            .slice(0, 3)
            .join('. ');

          if (relevantSentences) {
            articleContext += `[Source: ${source}]\n${relevantSentences}.\n\n`;
            sources.push(source);
            articleCount++;
          }
        }
      }
      
      if (articleContext) {
        context += "--- Research Literature ---\n" + articleContext;
      }
    }

    // Process IPEDS database results
    const combinedDbResults = [
      ...searchResults.vectorResults.map(r => r.document || r),
      ...searchResults.textResults
    ];

    // Remove duplicates and get top 5
    const uniqueResults = Array.from(
      new Map(combinedDbResults.map(item => [item.unitid, item])).values()
    ).slice(0, 5);

    if (uniqueResults.length > 0) {
      let databaseContext = "";
      
      for (const doc of uniqueResults) {
        const name = doc.general_info?.name || doc.institution_name || 'Unknown Institution';
        const state = doc.general_info?.state || 'Unknown State';
        
        // Build context based on question category
        let institutionInfo = `[Institution: ${name}, ${state}]\n`;
        
        if (category === 'admissions' || category === 'general') {
          const admissionRate = doc.admissions?.admission_rate 
            ? (doc.admissions.admission_rate * 100).toFixed(1) + '%' 
            : 'N/A';
          const satMath = doc.admissions?.sat_math_75th || 'N/A';
          const satVerbal = doc.admissions?.sat_verbal_75th || 'N/A';
          
          institutionInfo += `Admission Rate: ${admissionRate}\n`;
          if (satMath !== 'N/A') institutionInfo += `SAT Math (75th percentile): ${satMath}\n`;
          if (satVerbal !== 'N/A') institutionInfo += `SAT Verbal (75th percentile): ${satVerbal}\n`;
        }
        
        if (category === 'financial' || category === 'general') {
          const tuition = doc.cost?.tuition_in_state || doc.cost?.tuition_out_state || 'N/A';
          if (tuition !== 'N/A') {
            institutionInfo += `Tuition: $${tuition.toLocaleString()}\n`;
          }
        }
        
        if (category === 'outcomes' || category === 'general') {
          const gradRate = doc.outcomes?.grad_rate_total || 'N/A';
          if (gradRate !== 'N/A') {
            institutionInfo += `Graduation Rate: ${gradRate}%\n`;
          }
        }
        
        const enrollment = doc.enrollment?.total || 'N/A';
        if (enrollment !== 'N/A') {
          institutionInfo += `Total Enrollment: ${enrollment.toLocaleString()}\n`;
        }
        
        databaseContext += institutionInfo + "\n";
        sources.push(name);
      }
      
      if (databaseContext) {
        context += "\n--- IPEDS College Data ---\n" + databaseContext;
      }
    }

    return { context, sources: [...new Set(sources)] };

  } catch (error) {
    console.error('❌ Context building error:', error);
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
    throw new RAGError('Failed to generate AI response', 'AI_ERROR');
  }
};

// Cache management
const getCacheKey = (question) => `rag:${Buffer.from(question).toString('base64')}`;

const getCachedResponse = async (question) => {
  try {
    if (redisClient?.isOpen) {
      const cached = await redisClient.get(getCacheKey(question));
      return cached ? JSON.parse(cached) : null;
    }
  } catch (error) {
    console.error('❌ Cache read error:', error);
  }
  return null;
};

const cacheResponse = async (question, response) => {
  try {
    if (redisClient?.isOpen) {
      await redisClient.setex(getCacheKey(question), 3600, JSON.stringify(response)); // 1 hour cache
    }
  } catch (error) {
    console.error('❌ Cache write error:', error);
  }
};

// Debug endpoint
router.get('/debug', (req, res) => {
  res.json({
    status: isInitialized ? 'ready' : 'not_initialized',
    config: {
      hasSearchEndpoint: !!config.search.endpoint,
      hasSearchKey: !!config.search.apiKey,
      hasOpenAIEndpoint: !!config.openai.endpoint,
      hasOpenAIKey: !!config.openai.apiKey,
      searchIndex: config.search.indexName,
      chatModel: config.openai.chatModel,
      embeddingModel: config.openai.embeddingModel
    },
    clients: {
      search: !!clients.search,
      openai: !!clients.openai,
      embedding: !!clients.embedding
    },
    timestamp: new Date().toISOString()
  });
});

// Main RAG query endpoint
router.post('/query', async (req, res) => {
  const startTime = Date.now();
  let questionInfo = null;

  try {
    const { question, history = [] } = req.body;

    // Input validation
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ 
        error: 'Valid question is required',
        code: 'INVALID_INPUT'
      });
    }

    if (question.length > 1000) {
      return res.status(400).json({ 
        error: 'Question too long (max 1000 characters)',
        code: 'QUESTION_TOO_LONG'
      });
    }

    // Check initialization
    if (!isInitialized) {
      return res.status(503).json({ 
        error: 'RAG service not properly configured',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    console.log(`🤖 RAG Query: "${question.substring(0, 100)}..."`);

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
    const embedding = await generateEmbedding(questionInfo.cleaned);
    console.log(`✅ Generated embedding (${embedding.length} dimensions)`);

    // Search documents
    const searchResults = await searchDocuments(question, embedding, questionInfo.category);
    console.log('✅ Document search completed');

    // Build context
    const { context, sources } = await buildContext(searchResults, question, questionInfo.category);
    console.log(`📋 Context built (${context.length} chars, ${sources.length} sources)`);

    // Handle no context found
    if (!context.trim()) {
      const noContextResponse = {
        answer: "I couldn't find specific information about your question in my knowledge base. Could you try rephrasing your question or asking about college admissions, costs, or academic programs?",
        sources: [],
        hasContext: false,
        category: questionInfo.category,
        responseTime: Date.now() - startTime
      };
      
      return res.json(noContextResponse);
    }

    // Generate AI response
    const answer = await generateResponse(question, context, history, questionInfo.category);
    console.log('✅ AI response generated');

    const response = {
      answer,
      sources,
      hasContext: true,
      category: questionInfo.category,
      contextLength: context.length,
      responseTime: Date.now() - startTime
    };

    // Cache successful response
    await cacheResponse(question, response);

    res.json(response);

  } catch (error) {
    console.error('❌ RAG query error:', error);

    const errorResponse = {
      error: error instanceof RAGError ? error.message : 'An error occurred processing your question',
      code: error instanceof RAGError ? error.type : 'INTERNAL_ERROR',
      category: questionInfo?.category || 'unknown',
      responseTime: Date.now() - startTime
    };

    const statusCode = error instanceof RAGError ? error.statusCode : 500;
    res.status(statusCode).json(errorResponse);
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    initialized: isInitialized,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;