const OpenAI = require("openai");

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  azure: {
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME
  }
});

/**
 * getNextSteps - Generates personalized next steps for a student with comprehensive context
 * @param {Object} studentProfile - Student profile with GPA, goals, test scores, etc.
 * @param {Array} collegeMatches - List of colleges with name, likelihood, net cost, etc.
 * @param {Array} scholarships - List of scholarships with title, amount, deadline, etc.
 * @returns {Array} Array of next step objects with task property
 */
async function getNextSteps(studentProfile, collegeMatches, scholarships) {
  try {
    // Enhanced system prompt with more detailed context
    const systemPrompt = `
You are an expert college and career advisor with deep knowledge of higher education, financial aid, and student success strategies. Your role is to provide highly personalized, actionable guidance to students based on their complete academic and personal profile.

CONTEXT ANALYSIS FRAMEWORK:
1. Academic Profile Analysis: Evaluate GPA, test scores, course rigor, and academic strengths
2. College Match Assessment: Analyze fit based on selectivity, cost, programs, and student preferences
3. Financial Aid Strategy: Consider scholarship opportunities, deadlines, and eligibility requirements
4. Career Alignment: Connect academic choices with career goals and market trends
5. Timeline Planning: Prioritize actions based on application deadlines and preparation needs

INPUT DATA STRUCTURE:
- studentProfile: Complete student information including academic metrics, goals, preferences, and background
- collegeMatches: Detailed college information including admission rates, graduation rates, program offerings, costs, and fit assessment
- scholarships: Comprehensive scholarship data including amounts, deadlines, eligibility criteria, and application requirements

OUTPUT REQUIREMENTS:
Return exactly 3 prioritized action steps in this JSON format:
{
  "nextSteps": [
    {
      "task": "Specific, actionable step with concrete details and timeline"
    },
    {
      "task": "Secondary priority action with specific guidance"
    },
    {
      "task": "Tertiary action that supports long-term success"
    }
  ]
}

ACTION STEP GUIDELINES:
- Prioritize by urgency (deadlines), impact (high-value opportunities), and feasibility
- Include specific deadlines, amounts, or requirements when available
- Provide concrete next actions (e.g., "Apply to X scholarship by Y date")
- Consider the student's academic profile and financial situation
- Balance immediate actions with long-term planning
- Use encouraging, motivating language while being realistic
- Focus on college applications, scholarship applications, test preparation, and career development

QUALITY STANDARDS:
- Each step must be immediately actionable
- Include specific details (names, dates, amounts, requirements)
- Personalize based on the student's unique profile
- Consider financial constraints and academic capabilities
- Provide realistic timelines and expectations
- Address both short-term deadlines and long-term goals
`;

    // Enhanced user message with structured context
    const userMessage = `
STUDENT PROFILE ANALYSIS:
${JSON.stringify(studentProfile, null, 2)}

COLLEGE MATCHES ANALYSIS:
${JSON.stringify(collegeMatches, null, 2)}

SCHOLARSHIP OPPORTUNITIES:
${JSON.stringify(scholarships, null, 2)}

Based on this comprehensive data, provide exactly 3 prioritized, actionable next steps that will maximize the student's college and scholarship success. Focus on concrete actions with specific details, deadlines, and requirements.
`;

    // Use Azure OpenAI if configured, otherwise fall back to OpenAI
    const model = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o-mini";
    
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 0.9,
      frequency_penalty: 0.1,
      presence_penalty: 0.1
    });

    const content = response.choices[0].message.content;
    
    // Enhanced JSON parsing with better error handling
    let parsed;
    try {
      parsed = JSON.parse(content);
      
      // Validate the structure
      if (!parsed.nextSteps || !Array.isArray(parsed.nextSteps)) {
        throw new Error("Invalid response structure");
      }
      
      // Ensure each step has a task property
      const validatedSteps = parsed.nextSteps.map((step, index) => ({
        task: step.task || `Step ${index + 1}: Complete this action`,
        priority: step.priority || (index === 0 ? 'high' : index === 1 ? 'medium' : 'low'),
        dueDate: step.dueDate || 'ASAP'
      }));
      
      return validatedSteps;
      
    } catch (parseError) {
      console.warn("GPT returned invalid JSON, returning fallback steps:", parseError);
      console.log("Raw response:", content);
      
      // Enhanced fallback steps based on available data
      const fallbackSteps = [];
      
      if (studentProfile && studentProfile.gpa) {
        fallbackSteps.push({
          task: `Complete your college applications early. With your ${studentProfile.gpa} GPA, focus on schools where you're a strong candidate.`,
          priority: 'high',
          dueDate: 'ASAP'
        });
      } else {
        fallbackSteps.push({
          task: "Complete your college applications early to meet deadlines and maximize your chances of admission.",
          priority: 'high',
          dueDate: 'ASAP'
        });
      }
      
      if (scholarships && scholarships.length > 0) {
        const totalAmount = scholarships.reduce((sum, s) => sum + (s.amount || 0), 0);
        fallbackSteps.push({
          task: `Apply for scholarships immediately. You have access to $${totalAmount.toLocaleString()} in potential funding with ${scholarships.length} opportunities.`,
          priority: 'high',
          dueDate: 'ASAP'
        });
      } else {
        fallbackSteps.push({
          task: "Research and apply for scholarships that match your academic profile and career goals.",
          priority: 'medium',
          dueDate: 'This week'
        });
      }
      
      if (studentProfile && (!studentProfile.satScore || studentProfile.satScore === 'N/A')) {
        fallbackSteps.push({
          task: "Register for and prepare for the SAT/ACT to strengthen your college applications.",
          priority: 'medium',
          dueDate: 'Next month'
        });
      } else {
        fallbackSteps.push({
          task: "Continue building your extracurricular activities and leadership experience to strengthen your applications.",
          priority: 'medium',
          dueDate: 'Ongoing'
        });
      }
      
      return fallbackSteps;
    }

  } catch (err) {
    console.error("Error in getNextSteps:", err);
    
    // Return helpful error message with fallback steps
    return [
      {
        task: "Complete your college applications early to meet deadlines",
        priority: 'high',
        dueDate: 'ASAP'
      },
      {
        task: "Research and apply for scholarships that match your profile",
        priority: 'high',
        dueDate: 'This week'
      },
      {
        task: "Prepare for college entrance exams and improve your test scores",
        priority: 'medium',
        dueDate: 'Next month'
      }
    ];
  }
}

module.exports = { getNextSteps };
