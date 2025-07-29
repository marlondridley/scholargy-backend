// routes/articles.js - Defines API endpoints for keyword search on articles.
const express = require('express');
const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const router = express.Router();

const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
const apiKey = process.env.AZURE_SEARCH_API_KEY;
const indexName = process.env.AZURE_SEARCH_INDEX_NAME;

if (!endpoint || !apiKey || !indexName) {
    console.warn("Azure AI Search environment variables not set. Article search will be disabled.");
}

const searchClient = endpoint && apiKey && indexName ? new SearchClient(endpoint, indexName, new AzureKeyCredential(apiKey)) : null;

router.get('/search', async (req, res) => {
    if (!searchClient) {
        return res.status(503).json({ msg: 'Article search service is not configured.' });
    }
    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ msg: 'Search query "q" is required.' });
    }
    try {
        const searchResults = await searchClient.search(q, { includeTotalCount: true });
        res.json(searchResults);
    } catch (error) {
        console.error("Error searching articles:", error);
        res.status(500).send("Server Error");
    }
});

module.exports = router;