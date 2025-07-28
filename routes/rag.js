// routes/rag.js - Defines the core RAG endpoint using Integrated Vector Search.
const express = require('express');
const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const OpenAI = require('openai');
const { getDB } = require('../db');
const router = express.Router();

const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
const articleIndexName = process.env.AZURE_SEARCH_INDEX_NAME;

const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const openaiApiKey = process.env.AZURE_OPENAI_API_KEY;
const openaiDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const openaiEmbeddingDeploymentName = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME;

const articleSearchClient = new SearchClient(searchEndpoint, articleIndexName, new AzureKeyCredential(searchApiKey));
const openaiClient = new OpenAI({
    baseURL: `${openaiEndpoint}openai/deployments/${openaiEmbeddingDeploymentName}`,
    apiKey: openaiApiKey,
    defaultQuery: { "api-version": "2023-05-15" },
    defaultHeaders: { "api-key": openaiApiKey },
});

router.post('/query', async (req, res) => {
    const { question, history } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'Question is required.' });
    }

    try {
        const embeddingResponse = await openaiClient.embeddings.create({
            model: "",
            input: question,
        });
        const questionVector = embeddingResponse.data[0].embedding;

        const [articleSearchResults, vectorSearchResults, keywordSearchResults] = await Promise.all([
            articleSearchClient.search(question, {
                vectorQueries: [{
                    vector: questionVector,
                    kNearestNeighborsCount: 2,
                    fields: ["content_vector"] 
                }],
                speller: 'lexicon'
            }),
            (async () => {
                const db = getDB();
                const collection = db.collection('ipeds_colleges');
                const pipeline = [
                    { $search: { cosmosSearch: { vector: questionVector, path: 'text_vector', k: 3 }, returnStoredSource: true } },
                    { $project: { score: { $meta: 'searchScore' }, document: '$$ROOT' } }
                ];
                return await collection.aggregate(pipeline).toArray();
            })(),
            (async () => {
                const db = getDB();
                const collection = db.collection('ipeds_colleges');
                return await collection.find({ $text: { $search: question } }).limit(3).toArray();
            })()
        ]);

        let context = "";

        let articleContext = "";
        for await (const result of articleSearchResults.results) {
            articleContext += `[Source: ${result.document.metadata_storage_name || 'article'}] ` + (result.document.content || '') + "\n\n";
        }
        if (articleContext) {
            context += "--- Context from Curated Research Articles ---\n" + articleContext;
        }

        const combinedDbResults = [...vectorSearchResults.map(r => r.document), ...keywordSearchResults];
        const uniqueDbResults = Array.from(new Map(combinedDbResults.map(item => [item.unitid, item])).values());

        let databaseContext = "";
        for (const doc of uniqueDbResults) {
            databaseContext += `[Source: IPEDS Database for ${doc.general_info?.name || 'Unknown'}]\n` +
                               `Graduation Rate: ${doc.outcomes?.grad_rate_total}%\n` +
                               `Admission Rate: ${(doc.admissions?.admission_rate * 100)?.toFixed(1) || 'N/A'}%\n`+
                               `Total Enrollment: ${doc.enrollment?.total?.toLocaleString()}\n\n`;
        }
        if (databaseContext) {
            context += "\n--- Context from IPEDS Database ---\n" + databaseContext;
        }

        const systemPrompt = `You are Scholargy AI, an expert college admissions counselor. You MUST answer questions based ONLY on the provided context from IPEDS data and research articles. If the answer is not in the provided context, you MUST state 'I could not find an answer in the provided documents.' Do not make up information. Be friendly and conversational.`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` }
        ];

        const chatClient = new OpenAI({
            baseURL: `${openaiEndpoint}openai/deployments/${openaiDeploymentName}`,
            apiKey: openaiApiKey,
            defaultQuery: { "api-version": "2023-05-15" },
            defaultHeaders: { "api-key": openaiApiKey },
        });

        const response = await chatClient.chat.completions.create({
            model: "",
            messages: messages,
            max_tokens: 700,
            stream: true,
        });

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        for await (const part of response) {
            const content = part.choices[0]?.delta?.content || '';
            if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
        }
        res.end();

    } catch (error) {
        console.error("Error in RAG process:", error);
        if (!res.headersSent) {
            res.status(500).send("Error processing your question.");
        } else {
            res.end();
        }
    }
});

module.exports = router;