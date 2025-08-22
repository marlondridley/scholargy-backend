const OpenAI = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * getNextSteps - Generates personalized next steps for a student
 * @param {Object} studentProfile - Student profile with GPA, goals, test scores, etc.
 * @param {Array} collegeMatches - List of colleges with name, likelihood, net cost, etc.
 * @param {Array} scholarships - List of scholarships with title, amount, deadline, etc.
 * @returns {Array} Array of next step objects with task property
 */
async function getNextSteps(studentProfile, collegeMatches, scholarships) {
  try {
    const systemPrompt = `
You are a highly knowledgeable and empathetic educational AI assistant. Your goal is to provide actionable, personalized guidance to students based on their complete academic profile, college matches, and scholarship opportunities. Follow these instructions strictly:

1. Input Context:
- studentProfile: contains name, GPA, test scores, goals, intended major, extracurriculars, and other relevant info.
- collegeMatches: a list of colleges with name, likelihood (reach, target, safety), net cost, and details.
- scholarships: a list of scholarships with title, amount, deadline, and description.

2. Output Format (JSON):
{
  "nextSteps": [
    {
      "task": "Step 1: Highest priority action with specific details"
    },
    {
      "task": "Step 2: Secondary action with specific details"
    },
    {
      "task": "Step 3: Tertiary action with specific details"
    }
  ]
}

3. Behavior Rules:
- Provide exactly 3 numbered action steps (1., 2., 3.)
- Each step should be 1-2 sentences, actionable and prioritized
- Prioritize actions based on eligibility, deadlines, and likelihood
- Give concrete advice; avoid vague recommendations
- Personalize suggestions based on the student profile and goals
- Use friendly, motivating language
- Focus on college prep, scholarship strategy, and career prep

4. If data is missing, make reasonable assumptions and indicate them.
`;

    const userMessage = `
studentProfile: ${JSON.stringify(studentProfile)}
collegeMatches: ${JSON.stringify(collegeMatches)}
scholarships: ${JSON.stringify(scholarships)}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7
    });

    const content = response.choices[0].message.content;
    // Parse JSON safely
    let parsed;
    try {
      parsed = JSON.parse(content);
      // Ensure we return the nextSteps array
      return parsed.nextSteps || [];
    } catch {
      console.warn("GPT returned invalid JSON, returning fallback steps");
      return [
        { task: "Complete your college applications early to meet deadlines" },
        { task: "Research and apply for scholarships that match your profile" },
        { task: "Prepare for college entrance exams and improve your test scores" }
      ];
    }

  } catch (err) {
    console.error("Error in getNextSteps:", err);
    return { error: err.message };
  }
}

module.exports = { getNextSteps };
