// Enhanced DashboardPage with Top Matches, Scholarship Graph, AI Chat Streaming
import React, { useState, useEffect, useRef } from 'react';
import { searchInstitutions, calculateProbabilities, getTopMatches, getScholarshipSummary } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const DashboardPage = ({ onSelectCollege, setView, studentProfile, aiSummary }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState(null);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [probabilities, setProbabilities] = useState({});
    const [topMatches, setTopMatches] = useState([]);
    const [scholarships, setScholarships] = useState([]);

    const [conversation, setConversation] = useState([]);
    const [currentQuestion, setCurrentQuestion] = useState('');
    const [loadingRag, setLoadingRag] = useState(false);
    const chatContainerRef = useRef(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [conversation]);

    useEffect(() => {
        if (!studentProfile) return;
        getTopMatches(studentProfile).then(setTopMatches);
        getScholarshipSummary(studentProfile).then(setScholarships);
    }, [studentProfile]);

    const handleSearch = async (e) => {
        e.preventDefault();
        setLoadingSearch(true);
        const response = await searchInstitutions({ filters: { "general_info.name": { $regex: searchTerm, $options: 'i' } } });
        setResults(response.data);
        setLoadingSearch(false);
    };

    useEffect(() => {
        const calculateCollegeProbabilities = async () => {
            if (!results || results.length === 0 || !studentProfile) return;
            const collegeIds = results.map(c => c.unitid);
            const probResult = await calculateProbabilities(studentProfile, collegeIds);
            const probMap = (probResult.results || []).reduce((acc, curr) => {
                acc[curr.unitid] = curr;
                return acc;
            }, {});
            setProbabilities(probMap);
        };
        calculateCollegeProbabilities();
    }, [results, studentProfile]);

    const handleRagQuery = async (e) => {
        e.preventDefault();
        if (!currentQuestion.trim()) return;

        const newConversation = [...conversation, { role: 'user', content: currentQuestion }];
        setConversation(newConversation);
        setCurrentQuestion('');
        setLoadingRag(true);

        try {
            const response = await fetch('/api/rag/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: currentQuestion, history: newConversation.slice(0, -1) }),
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantResponse = '';
            setConversation(prev => [...prev, { role: 'assistant', content: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.substring(6));
                        assistantResponse += data.content;
                        setConversation(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1].content = assistantResponse;
                            return updated;
                        });
                    }
                }
            }
        } catch (err) {
            console.error("RAG error:", err);
            setConversation(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error.' }]);
        } finally {
            setLoadingRag(false);
        }
    };

    const handleDownload = () => {
        const blob = new Blob([aiSummary], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'scholargy_recommendations.txt';
        link.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div onClick={() => setView('profile')} className="bg-blue-50 border shadow-md rounded-xl p-6 hover:shadow-lg transition cursor-pointer">
                    <h3 className="text-lg font-semibold text-blue-800">🎓 My Profile</h3>
                    <p className="text-sm text-blue-700">View or edit your academic profile</p>
                </div>
                <div onClick={() => setView('readiness')} className="bg-green-50 border shadow-md rounded-xl p-6 hover:shadow-lg transition cursor-pointer">
                    <h3 className="text-lg font-semibold text-green-800">📊 Assess My Readiness</h3>
                    <p className="text-sm text-green-700">Generate insights and college fit scores</p>
                </div>
                <div onClick={() => setView('tutor')} className="bg-purple-50 border shadow-md rounded-xl p-6 hover:shadow-lg transition cursor-pointer">
                    <h3 className="text-lg font-semibold text-purple-800">📅 Schedule a Tutor</h3>
                    <p className="text-sm text-purple-700">Connect with a college prep expert</p>
                </div>
                {aiSummary && (
                    <div className="bg-yellow-50 border shadow-md rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-yellow-800">🧠 AI Recommendations</h3>
                        <p className="text-sm text-yellow-700 mb-2">{aiSummary.slice(0, 200)}...</p>
                        <button onClick={handleDownload} className="mt-2 text-sm font-medium text-yellow-700 hover:underline">
                            ⬇️ Download Summary
                        </button>
                    </div>
                )}
            </div>

            {topMatches.length > 0 && (
                <div className="bg-white border shadow rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">🎯 Top 5 College Matches</h2>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                        {topMatches.map((match, idx) => (
                            <li key={idx} className="font-medium cursor-pointer hover:text-blue-700" onClick={() => onSelectCollege(match.unitid)}>
                                {match.name} ({match.state})
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {scholarships.length > 0 && (
                <div className="bg-white border shadow rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">💰 Scholarships Qualified For</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={scholarships} layout="vertical" margin={{ left: 20 }}>
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="college" width={150} />
                            <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                            <Bar dataKey="amount" fill="#4ade80" onClick={({ college }) => {
                                const match = topMatches.find(m => m.name === college);
                                if (match) onSelectCollege(match.unitid);
                            }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="bg-white p-6 rounded-xl shadow border">
                <h2 className="text-xl font-semibold mb-4">🤖 Ask Scholargy</h2>
                <div className="bg-gray-100 p-4 h-72 overflow-y-auto rounded mb-4" ref={chatContainerRef}>
                    {conversation.length === 0 ? (
                        <p className="text-gray-500">👋 Hi! Ask me anything about colleges, scholarships, or readiness.</p>
                    ) : (
                        conversation.map((msg, idx) => (
                            <div key={idx} className={`mb-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                <span className={`inline-block px-3 py-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-200 text-blue-900' : 'bg-gray-300 text-gray-800'}`}>{msg.content}</span>
                            </div>
                        ))
                    )}
                </div>
                <form onSubmit={handleRagQuery} className="flex">
                    <input
                        value={currentQuestion}
                        onChange={(e) => setCurrentQuestion(e.target.value)}
                        disabled={loadingRag}
                        placeholder="Type your question..."
                        className="flex-1 p-2 rounded-l border border-gray-300 focus:outline-none"
                    />
                    <button type="submit" disabled={loadingRag || !currentQuestion.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-r disabled:bg-gray-400">
                        {loadingRag ? '...' : 'Ask'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default DashboardPage;
