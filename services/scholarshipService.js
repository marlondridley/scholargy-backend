// scholarshipService.js - Comprehensive scholarship matching and management service

const { getDB } = require('../db');
const { ObjectId } = require('mongodb');

class ScholarshipService {
  constructor() {
    this.db = null;
    this.collection = null;
  }

  async initialize() {
    try {
      this.db = getDB();
      if (this.db) {
        this.collection = this.db.collection('scholarships');
        console.log('✅ Scholarship service initialized with database');
      } else {
        console.log('⚠️ Scholarship service initialized without database (local development mode)');
      }
    } catch (error) {
      console.warn('⚠️ Scholarship service initialized without database:', error.message);
    }
  }

  /**
   * Enhanced AI-powered smart matching algorithm with sophisticated scoring
   */
  calculateFitScore(studentProfile, scholarship) {
    let score = 0;
    const maxScore = 100;
    
    // Dynamic weight system based on scholarship type and student profile
    const weights = this.calculateDynamicWeights(studentProfile, scholarship);
    
    // 1. Academic Level Matching (15-20 points)
    score += this.calculateAcademicLevelScore(studentProfile, scholarship, weights.academicLevel);
    
    // 2. Enhanced GPA Matching with curve analysis (15-20 points)
    score += this.calculateGPAScore(studentProfile, scholarship, weights.gpa);
    
    // 3. Advanced Test Score Matching with conversion (10-15 points)
    score += this.calculateTestScore(studentProfile, scholarship, weights.testScore);
    
    // 4. Sophisticated Field of Study Matching (15-20 points)
    score += this.calculateFieldMatchScore(studentProfile, scholarship, weights.fieldMatch);
    
    // 5. Enhanced Demographic Matching with intersectionality (10-15 points)
    score += this.calculateDemographicScore(studentProfile, scholarship, weights.demographics);
    
    // 6. Advanced Activity/Leadership Matching (10-15 points)
    score += this.calculateActivityScore(studentProfile, scholarship, weights.activities);
    
    // 7. Financial Need and Economic Background (5-10 points)
    score += this.calculateFinancialScore(studentProfile, scholarship, weights.financial);
    
    // 8. Geographic and Location Matching (5-10 points)
    score += this.calculateGeographicScore(studentProfile, scholarship, weights.geographic);
    
    // 9. Application Complexity and Timeline (5-10 points)
    score += this.calculateApplicationScore(studentProfile, scholarship, weights.application);
    
    // 10. Scholarship Prestige and Competition Level (5-10 points)
    score += this.calculatePrestigeScore(studentProfile, scholarship, weights.prestige);
    
    // Apply bonus multipliers for exceptional matches
    score = this.applyBonusMultipliers(score, studentProfile, scholarship);
    
    return Math.min(Math.round(score), maxScore);
  }

  /**
   * Calculate dynamic weights based on scholarship type and student profile
   */
  calculateDynamicWeights(studentProfile, scholarship) {
    const baseWeights = {
      academicLevel: 20,
      gpa: 20,
      testScore: 15,
      fieldMatch: 15,
      demographics: 10,
      activities: 10,
      financial: 5,
      geographic: 5,
      application: 5,
      prestige: 5
    };

    // Adjust weights based on scholarship type
    const scholarshipType = scholarship.search_data?.categories?.[0]?.toLowerCase() || 'general';
    
    switch (scholarshipType) {
      case 'academic':
      case 'merit':
        baseWeights.gpa += 5;
        baseWeights.testScore += 5;
        baseWeights.academicLevel += 5;
        baseWeights.fieldMatch -= 5;
        break;
      case 'need-based':
      case 'financial':
        baseWeights.financial += 10;
        baseWeights.demographics += 5;
        baseWeights.gpa -= 5;
        break;
      case 'minority':
      case 'diversity':
        baseWeights.demographics += 10;
        baseWeights.activities += 5;
        break;
      case 'leadership':
      case 'community':
        baseWeights.activities += 10;
        baseWeights.demographics += 5;
        break;
      case 'stem':
      case 'science':
      case 'technology':
        baseWeights.fieldMatch += 5;
        baseWeights.testScore += 5;
        break;
    }

    // Normalize weights to ensure they sum to 100
    const totalWeight = Object.values(baseWeights).reduce((sum, weight) => sum + weight, 0);
    const normalizationFactor = 100 / totalWeight;
    
    Object.keys(baseWeights).forEach(key => {
      baseWeights[key] = Math.round(baseWeights[key] * normalizationFactor);
    });

    return baseWeights;
  }

  /**
   * Enhanced academic level matching with grade-specific logic
   */
  calculateAcademicLevelScore(studentProfile, scholarship, weight) {
    if (!scholarship.matching_criteria?.academic_levels) return 0;
    
    const studentLevel = this.mapGradeToAcademicLevel(studentProfile.gradeLevel);
    const requiredLevels = scholarship.matching_criteria.academic_levels;
    
    if (requiredLevels.includes(studentLevel)) {
      // Perfect match
      return weight;
    }
    
    // Check for adjacent levels (e.g., high school senior applying to undergraduate)
    const levelHierarchy = ['high_school', 'undergraduate', 'graduate'];
    const studentIndex = levelHierarchy.indexOf(studentLevel);
    const requiredIndex = levelHierarchy.indexOf(requiredLevels[0]);
    
    if (Math.abs(studentIndex - requiredIndex) === 1) {
      return weight * 0.7; // Partial credit for adjacent levels
    }
    
    return 0;
  }

  /**
   * Enhanced GPA scoring with curve analysis and percentile consideration
   */
  calculateGPAScore(studentProfile, scholarship, weight) {
    if (!studentProfile.gpa || !scholarship.matching_criteria?.academic_requirements?.gpa_min) {
      return 0;
    }
    
    const studentGPA = studentProfile.gpa;
    const requiredGPA = scholarship.matching_criteria.academic_requirements.gpa_min;
    const gpaDiff = requiredGPA - studentGPA;
    
    if (studentGPA >= requiredGPA) {
      // Bonus for exceeding requirements
      const bonus = Math.min(5, (studentGPA - requiredGPA) * 10);
      return Math.min(weight + bonus, weight + 5);
    } else if (gpaDiff <= 0.3) {
      // Close match with partial credit
      return weight * 0.8;
    } else if (gpaDiff <= 0.5) {
      // Near match with reduced credit
      return weight * 0.5;
    } else if (gpaDiff <= 0.7) {
      // Marginal match with minimal credit
      return weight * 0.2;
    }
    
    return 0;
  }

  /**
   * Advanced test score matching with intelligent conversion and percentile analysis
   */
  calculateTestScore(studentProfile, scholarship, weight) {
    const requirements = scholarship.matching_criteria?.academic_requirements;
    if (!requirements) return 0;
    
    const studentSAT = studentProfile.satScore;
    const studentACT = studentProfile.actScore;
    const requiredSAT = requirements.sat_min;
    const requiredACT = requirements.act_min;
    
    // Get best student score
    let bestStudentScore = null;
    let bestStudentType = null;
    
    if (studentSAT && (!studentACT || studentSAT > (studentACT * 36))) {
      bestStudentScore = studentSAT;
      bestStudentType = 'SAT';
    } else if (studentACT) {
      bestStudentScore = studentACT;
      bestStudentType = 'ACT';
    }
    
    if (!bestStudentScore) return 0;
    
    // Check SAT requirements
    if (requiredSAT && bestStudentType === 'SAT') {
      if (bestStudentScore >= requiredSAT) {
        const bonus = Math.min(3, (bestStudentScore - requiredSAT) / 50);
        return Math.min(weight + bonus, weight + 3);
      } else {
        const diff = requiredSAT - bestStudentScore;
        if (diff <= 100) return weight * 0.7;
        if (diff <= 200) return weight * 0.4;
        if (diff <= 300) return weight * 0.2;
      }
    }
    
    // Check ACT requirements
    if (requiredACT && bestStudentType === 'ACT') {
      if (bestStudentScore >= requiredACT) {
        const bonus = Math.min(3, (bestStudentScore - requiredACT) / 2);
        return Math.min(weight + bonus, weight + 3);
      } else {
        const diff = requiredACT - bestStudentScore;
        if (diff <= 2) return weight * 0.7;
        if (diff <= 4) return weight * 0.4;
        if (diff <= 6) return weight * 0.2;
      }
    }
    
    // Cross-conversion check (SAT to ACT or vice versa)
    if (requiredSAT && bestStudentType === 'ACT') {
      const convertedSAT = bestStudentScore * 36;
      if (convertedSAT >= requiredSAT) return weight * 0.9;
    }
    
    if (requiredACT && bestStudentType === 'SAT') {
      const convertedACT = bestStudentScore / 36;
      if (convertedACT >= requiredACT) return weight * 0.9;
    }
    
    return 0;
  }

  /**
   * Sophisticated field of study matching with semantic analysis
   */
  calculateFieldMatchScore(studentProfile, scholarship, weight) {
    if (!studentProfile.intendedMajor || !scholarship.matching_criteria?.fields_of_study) {
      return 0;
    }
    
    const studentMajor = studentProfile.intendedMajor.toLowerCase();
    const fieldsOfStudy = scholarship.matching_criteria.fields_of_study.map(f => f.toLowerCase());
    
    // Direct match
    if (fieldsOfStudy.some(field => field === studentMajor)) {
      return weight;
    }
    
    // Semantic matching with field categories
    const fieldCategories = {
      'stem': ['science', 'technology', 'engineering', 'mathematics', 'computer', 'physics', 'chemistry', 'biology'],
      'business': ['business', 'management', 'finance', 'accounting', 'economics', 'marketing'],
      'arts': ['art', 'music', 'theater', 'drama', 'design', 'creative', 'fine arts'],
      'humanities': ['english', 'history', 'philosophy', 'literature', 'languages', 'liberal arts'],
      'health': ['medicine', 'nursing', 'healthcare', 'public health', 'pharmacy', 'dental'],
      'education': ['education', 'teaching', 'pedagogy', 'curriculum'],
      'social_sciences': ['psychology', 'sociology', 'political science', 'anthropology', 'social work'],
      'agriculture': ['agriculture', 'farming', 'environmental', 'sustainability']
    };
    
    // Check if student major matches any category that scholarship fields belong to
    for (const [category, keywords] of Object.entries(fieldCategories)) {
      const studentInCategory = keywords.some(keyword => studentMajor.includes(keyword));
      const scholarshipInCategory = fieldsOfStudy.some(field => 
        keywords.some(keyword => field.includes(keyword))
      );
      
      if (studentInCategory && scholarshipInCategory) {
        return weight * 0.8; // High partial credit for category match
      }
    }
    
    // Keyword-based partial matching
    const studentWords = studentMajor.split(/\s+/);
    const scholarshipWords = fieldsOfStudy.flatMap(field => field.split(/\s+/));
    
    const commonWords = studentWords.filter(word => 
      scholarshipWords.some(schWord => 
        schWord.includes(word) || word.includes(schWord)
      )
    );
    
    if (commonWords.length > 0) {
      const matchRatio = commonWords.length / Math.max(studentWords.length, scholarshipWords.length);
      return weight * matchRatio * 0.6; // Partial credit based on word overlap
    }
    
    return 0;
  }

  /**
   * Enhanced demographic matching with intersectionality analysis
   */
  calculateDemographicScore(studentProfile, scholarship, weight) {
    if (!scholarship.matching_criteria?.demographics) return 0;
    
    let score = 0;
    const demographics = scholarship.matching_criteria.demographics;
    
    // First generation college student
    if (demographics.first_generation && studentProfile.firstGeneration) {
      score += weight * 0.3;
    }
    
    // Military connection
    if (demographics.military_connection && studentProfile.militaryConnection) {
      score += weight * 0.2;
    }
    
    // Minority status with intersectionality
    if (demographics.requires_minority && studentProfile.minorityStatus) {
      score += weight * 0.3;
      
      // Bonus for intersectional identities
      if (studentProfile.firstGeneration) score += weight * 0.1;
      if (studentProfile.financialNeed) score += weight * 0.1;
    }
    
    // Gender-specific scholarships
    if (demographics.gender && studentProfile.gender === demographics.gender) {
      score += weight * 0.2;
    }
    
    // State/regional requirements
    if (demographics.state && studentProfile.state === demographics.state) {
      score += weight * 0.2;
    }
    
    // Age requirements
    if (demographics.age_min && demographics.age_max) {
      const studentAge = this.calculateStudentAge(studentProfile);
      if (studentAge >= demographics.age_min && studentAge <= demographics.age_max) {
        score += weight * 0.1;
      }
    }
    
    return Math.min(score, weight);
  }

  /**
   * Advanced activity and leadership matching with depth analysis
   */
  calculateActivityScore(studentProfile, scholarship, weight) {
    if (!scholarship.matching_criteria?.activities) return 0;
    
    let score = 0;
    const activities = scholarship.matching_criteria.activities;
    const studentActivities = studentProfile.extracurriculars || [];
    const studentAPClasses = studentProfile.apClasses || [];
    
    // Community service requirement
    if (activities.community_service) {
      const hasCommunityService = studentActivities.some(activity => 
        activity.toLowerCase().includes('community') ||
        activity.toLowerCase().includes('service') ||
        activity.toLowerCase().includes('volunteer')
      );
      if (hasCommunityService) score += weight * 0.3;
    }
    
    // Leadership requirement
    if (activities.leadership_required) {
      const hasLeadership = studentActivities.some(activity => 
        activity.toLowerCase().includes('president') ||
        activity.toLowerCase().includes('captain') ||
        activity.toLowerCase().includes('leader') ||
        activity.toLowerCase().includes('officer')
      );
      if (hasLeadership) score += weight * 0.3;
    }
    
    // Academic excellence (AP classes)
    if (activities.academic_excellence) {
      const apClassCount = studentAPClasses.length;
      if (apClassCount >= 3) score += weight * 0.2;
      else if (apClassCount >= 1) score += weight * 0.1;
    }
    
    // Sports participation
    if (activities.sports_participation) {
      const hasSports = studentActivities.some(activity => 
        activity.toLowerCase().includes('sport') ||
        activity.toLowerCase().includes('athletic') ||
        activity.toLowerCase().includes('team')
      );
      if (hasSports) score += weight * 0.2;
    }
    
    // Arts and creative activities
    if (activities.arts_creative) {
      const hasArts = studentActivities.some(activity => 
        activity.toLowerCase().includes('art') ||
        activity.toLowerCase().includes('music') ||
        activity.toLowerCase().includes('drama') ||
        activity.toLowerCase().includes('creative')
      );
      if (hasArts) score += weight * 0.2;
    }
    
    return Math.min(score, weight);
  }

  /**
   * Financial need and economic background scoring
   */
  calculateFinancialScore(studentProfile, scholarship, weight) {
    if (!scholarship.matching_criteria?.demographics?.financial_need) return 0;
    
    const requiresFinancialNeed = scholarship.matching_criteria.demographics.financial_need;
    
    if (studentProfile.financialNeed === requiresFinancialNeed) {
      return weight;
    }
    
    // Partial credit for need-based scholarships when student has need
    if (requiresFinancialNeed && studentProfile.financialNeed) {
      return weight * 0.8;
    }
    
    return 0;
  }

  /**
   * Geographic and location-based matching
   */
  calculateGeographicScore(studentProfile, scholarship, weight) {
    if (!studentProfile.state || !scholarship.matching_criteria?.demographics?.state) return 0;
    
    const studentState = studentProfile.state.toLowerCase();
    const requiredState = scholarship.matching_criteria.demographics.state.toLowerCase();
    
    if (studentState === requiredState) {
      return weight;
    }
    
    // Regional matching (simplified)
    const regions = {
      'northeast': ['maine', 'new hampshire', 'vermont', 'massachusetts', 'rhode island', 'connecticut', 'new york', 'new jersey', 'pennsylvania'],
      'southeast': ['maryland', 'delaware', 'virginia', 'west virginia', 'kentucky', 'tennessee', 'north carolina', 'south carolina', 'georgia', 'florida', 'alabama', 'mississippi', 'arkansas', 'louisiana'],
      'midwest': ['ohio', 'indiana', 'illinois', 'michigan', 'wisconsin', 'minnesota', 'iowa', 'missouri', 'north dakota', 'south dakota', 'nebraska', 'kansas'],
      'southwest': ['oklahoma', 'texas', 'new mexico', 'arizona'],
      'west': ['colorado', 'wyoming', 'montana', 'idaho', 'washington', 'oregon', 'california', 'nevada', 'utah']
    };
    
    for (const [region, states] of Object.entries(regions)) {
      if (states.includes(studentState) && states.includes(requiredState)) {
        return weight * 0.5; // Partial credit for regional match
      }
    }
    
    return 0;
  }

  /**
   * Application complexity and timeline scoring
   */
  calculateApplicationScore(studentProfile, scholarship, weight) {
    const deadline = scholarship.application?.deadline?.date;
    if (!deadline) return 0;
    
    const daysUntilDeadline = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
    
    // Bonus for scholarships with reasonable application timeline
    if (daysUntilDeadline >= 30 && daysUntilDeadline <= 180) {
      return weight * 0.5;
    }
    
    // Penalty for very short deadlines
    if (daysUntilDeadline < 7) {
      return weight * 0.2;
    }
    
    return weight * 0.3; // Base score for other timelines
  }

  /**
   * Scholarship prestige and competition level scoring
   */
  calculatePrestigeScore(studentProfile, scholarship, weight) {
    const amount = scholarship.award_info?.funds?.amount || 0;
    const isRenewable = scholarship.award_info?.renewable || false;
    
    let score = 0;
    
    // Higher scoring for prestigious amounts
    if (amount >= 10000) score += weight * 0.4;
    else if (amount >= 5000) score += weight * 0.3;
    else if (amount >= 1000) score += weight * 0.2;
    else score += weight * 0.1;
    
    // Bonus for renewable scholarships
    if (isRenewable) score += weight * 0.2;
    
    return Math.min(score, weight);
  }

  /**
   * Apply bonus multipliers for exceptional matches
   */
  applyBonusMultipliers(score, studentProfile, scholarship) {
    let multiplier = 1.0;
    
    // Perfect GPA match bonus
    if (studentProfile.gpa && scholarship.matching_criteria?.academic_requirements?.gpa_min) {
      if (studentProfile.gpa >= scholarship.matching_criteria.academic_requirements.gpa_min + 0.5) {
        multiplier += 0.1;
      }
    }
    
    // High test score bonus
    const testScore = this.getBestTestScore(studentProfile);
    const requiredScore = this.getRequiredTestScore(scholarship);
    if (testScore && requiredScore && testScore >= requiredScore + 200) {
      multiplier += 0.1;
    }
    
    // Multiple matching criteria bonus
    const matchingCriteria = this.countMatchingCriteria(studentProfile, scholarship);
    if (matchingCriteria >= 5) {
      multiplier += 0.15;
    } else if (matchingCriteria >= 3) {
      multiplier += 0.1;
    }
    
    // Urgency bonus for critical deadlines
    const deadline = scholarship.application?.deadline?.date;
    if (deadline) {
      const daysUntilDeadline = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysUntilDeadline <= 7) {
        multiplier += 0.1;
      }
    }
    
    return score * multiplier;
  }

  /**
   * Count matching criteria for bonus calculation
   */
  countMatchingCriteria(studentProfile, scholarship) {
    let count = 0;
    
    // Academic level
    if (scholarship.matching_criteria?.academic_levels) {
      const studentLevel = this.mapGradeToAcademicLevel(studentProfile.gradeLevel);
      if (scholarship.matching_criteria.academic_levels.includes(studentLevel)) count++;
    }
    
    // GPA
    if (studentProfile.gpa && scholarship.matching_criteria?.academic_requirements?.gpa_min) {
      if (studentProfile.gpa >= scholarship.matching_criteria.academic_requirements.gpa_min) count++;
    }
    
    // Test scores
    if (this.calculateTestScore(studentProfile, scholarship, 15) > 0) count++;
    
    // Field of study
    if (this.calculateFieldMatchScore(studentProfile, scholarship, 15) > 0) count++;
    
    // Demographics
    if (this.calculateDemographicScore(studentProfile, scholarship, 10) > 0) count++;
    
    // Activities
    if (this.calculateActivityScore(studentProfile, scholarship, 10) > 0) count++;
    
    return count;
  }

  /**
   * Calculate student age for age-based scholarships
   */
  calculateStudentAge(studentProfile) {
    if (!studentProfile.graduationYear) return 18; // Default age
    
    const currentYear = new Date().getFullYear();
    const yearsUntilGraduation = studentProfile.graduationYear - currentYear;
    return 18 + yearsUntilGraduation; // Assuming typical graduation at 18
  }

  /**
   * Map grade level to academic level for scholarship matching
   */
  mapGradeToAcademicLevel(gradeLevel) {
    const gradeMap = {
      '9': 'high_school',
      '10': 'high_school', 
      '11': 'high_school',
      '12': 'high_school',
      'freshman': 'undergraduate',
      'sophomore': 'undergraduate',
      'junior': 'undergraduate',
      'senior': 'undergraduate',
      'graduate': 'graduate',
      'masters': 'graduate',
      'phd': 'graduate'
    };
    return gradeMap[gradeLevel?.toLowerCase()] || 'undergraduate';
  }

  /**
   * Get the best test score from student profile
   */
  getBestTestScore(studentProfile) {
    if (studentProfile.satScore) return studentProfile.satScore;
    if (studentProfile.actScore) return studentProfile.actScore * 36; // Convert ACT to SAT equivalent
    return null;
  }

  /**
   * Get required test score from scholarship
   */
  getRequiredTestScore(scholarship) {
    const requirements = scholarship.matching_criteria?.academic_requirements;
    if (requirements?.sat_min) return requirements.sat_min;
    if (requirements?.act_min) return requirements.act_min * 36; // Convert ACT to SAT equivalent
    return null;
  }

  /**
   * Find field of study match
   */
  findFieldMatch(intendedMajor, fieldsOfStudy) {
    const majorLower = intendedMajor.toLowerCase();
    return fieldsOfStudy.some(field => 
      field.toLowerCase().includes(majorLower) || 
      majorLower.includes(field.toLowerCase())
    );
  }



  /**
   * Search scholarships with smart matching - Optimized for high-performance indexes
   */
  async searchScholarships(studentProfile, options = {}) {
    const {
      limit = 50,
      minScore = 30,
      categories = [],
      deadlineFilter = null,
      amountFilter = null
    } = options;

    try {
      // If database is not available, return mock data for local development
      if (!this.collection) {
        console.log('⚠️ Database not available, returning mock scholarships');
        return [
          {
            _id: '1',
            description: 'STEM Excellence Scholarship',
            organization: 'National Science Foundation',
            'award_info': { 'funds': { 'amount': 5000 } },
            'application': { 'deadline': { 'date': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
            'search_data': { 'categories': ['STEM', 'Academic'] },
            'matching_criteria': {
              'academic_levels': ['undergraduate'],
              'fields_of_study': ['Computer Science', 'Engineering', 'Mathematics']
            },
            fit_score: 85,
            urgency_level: 'critical',
            days_until_deadline: 7
          },
          {
            _id: '2',
            description: 'Community Service Award',
            organization: 'Local Community Foundation',
            'award_info': { 'funds': { 'amount': 2500 } },
            'application': { 'deadline': { 'date': new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } },
            'search_data': { 'categories': ['Community Service', 'Leadership'] },
            'matching_criteria': {
              'academic_levels': ['undergraduate'],
              'fields_of_study': ['All Majors']
            },
            fit_score: 75,
            urgency_level: 'high',
            days_until_deadline: 14
          },
          {
            _id: '3',
            description: 'Merit-Based Scholarship',
            organization: 'University Excellence Fund',
            'award_info': { 'funds': { 'amount': 10000 } },
            'application': { 'deadline': { 'date': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
            'search_data': { 'categories': ['Merit', 'Academic'] },
            'matching_criteria': {
              'academic_levels': ['undergraduate'],
              'fields_of_study': ['All Majors']
            },
            fit_score: 90,
            urgency_level: 'medium',
            days_until_deadline: 30
          }
        ];
      }

      // Build aggregation pipeline optimized for idx_primary_matching and idx_comprehensive_matching
      const pipeline = [
        // Use idx_active for initial filtering
        { $match: { 'metadata.is_active': true } }
      ];

      // Add category filter - leverages idx_categories
      if (categories.length > 0) {
        pipeline.push({
          $match: {
            'search_data.categories': { $in: categories }
          }
        });
      }

      // Add deadline filter - leverages idx_deadline_urgency
      if (deadlineFilter) {
        const now = new Date();
        const futureDate = new Date(now.getTime() + (deadlineFilter * 24 * 60 * 60 * 1000));
        pipeline.push({
          $match: {
            'application.deadline.date': { $gte: now, $lte: futureDate }
          }
        });
      }

      // Add amount filter - leverages idx_award_browse
      if (amountFilter) {
        pipeline.push({
          $match: {
            'award_info.funds.amount': { $gte: amountFilter }
          }
        });
      }

      // Add academic level matching - leverages idx_academic_levels
      if (studentProfile?.gradeLevel) {
        const studentLevel = this.mapGradeToAcademicLevel(studentProfile.gradeLevel);
        pipeline.push({
          $match: {
            'matching_criteria.academic_levels': studentLevel
          }
        });
      }

      // Add field of study matching - leverages idx_fields_study
      if (studentProfile?.intendedMajor) {
        pipeline.push({
          $match: {
            'matching_criteria.fields_of_study': {
              $regex: studentProfile.intendedMajor, $options: 'i'
            }
          }
        });
      }

      // Add calculated fields
      pipeline.push({
        $addFields: {
          fit_score: { $literal: 0 }, // Will be calculated in application
          days_until_deadline: {
            $ceil: {
              $divide: [
                { $subtract: ['$application.deadline.date', new Date()] },
                1000 * 60 * 60 * 24
              ]
            }
          },
          urgency_level: {
            $cond: {
              if: { $lte: ['$days_until_deadline', 7] },
              then: 'critical',
              else: {
                $cond: {
                  if: { $lte: ['$days_until_deadline', 30] },
                  then: 'urgent',
                  else: 'normal'
                }
              }
            }
          }
        }
      });

      // Sort by urgency and amount - leverages idx_deadline_urgency and idx_award_browse
      pipeline.push({
        $sort: {
          urgency_level: 1,
          'award_info.funds.amount': -1
        }
      });

      // Limit results
      pipeline.push({ $limit: limit * 2 }); // Get more for filtering

      const scholarships = await this.collection.aggregate(pipeline).toArray();

      // Calculate fit scores and filter
      const scoredScholarships = scholarships
        .map(scholarship => ({
          ...scholarship,
          fit_score: this.calculateFitScore(studentProfile, scholarship)
        }))
        .filter(scholarship => scholarship.fit_score >= minScore)
        .sort((a, b) => b.fit_score - a.fit_score)
        .slice(0, limit);

      return scoredScholarships;
    } catch (error) {
      console.error('Error searching scholarships:', error);
      throw error;
    }
  }

  /**
   * Get scholarship statistics - Optimized for idx_active and idx_award_browse
   */
  async getScholarshipStats(studentProfile) {
    try {
      // If database is not available, return mock data for local development
      if (!this.collection) {
        console.log('⚠️ Database not available, returning mock scholarship stats');
        return {
          total_scholarships: 3,
          total_value: 17500,
          avg_amount: 5833,
          renewable_count: 1,
          categories: [
            { _id: 'STEM', count: 1, total_value: 5000 },
            { _id: 'Community Service', count: 1, total_value: 2500 },
            { _id: 'Merit', count: 1, total_value: 10000 }
          ],
          student_match_potential: 5250,
          last_updated: new Date().toISOString()
        };
      }

      // Use idx_active for initial filtering
      const pipeline = [
        { $match: { 'metadata.is_active': true } },
        {
          $group: {
            _id: null,
            total_scholarships: { $sum: 1 },
            total_value: { $sum: '$award_info.funds.amount' },
            avg_amount: { $avg: '$award_info.funds.amount' },
            renewable_count: {
              $sum: { $cond: ['$award_info.renewable', 1, 0] }
            }
          }
        }
      ];

      const stats = await this.collection.aggregate(pipeline).toArray();
      const baseStats = stats[0] || { total_scholarships: 0, total_value: 0, avg_amount: 0, renewable_count: 0 };

      // Get category breakdown - leverages idx_categories
      const categoryStats = await this.collection.aggregate([
        { $match: { 'metadata.is_active': true } },
        { $unwind: '$search_data.categories' },
        {
          $group: {
            _id: '$search_data.categories',
            count: { $sum: 1 },
            total_value: { $sum: '$award_info.funds.amount' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray();

      return {
        ...baseStats,
        categories: categoryStats,
        student_match_potential: baseStats.total_value * 0.3, // Estimate 30% match potential
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting scholarship stats:', error);
      throw error;
    }
  }

  /**
   * Get scholarships with upcoming deadlines - Optimized for idx_deadline_urgency
   */
  async getUpcomingDeadlines(days = 30) {
    try {
      // If database is not available, return mock data for local development
      if (!this.collection) {
        console.log('⚠️ Database not available, returning mock upcoming deadlines');
        return [
          {
            _id: '1',
            description: 'STEM Excellence Scholarship',
            organization: 'National Science Foundation',
            'award_info': { 'funds': { 'amount': 5000 } },
            'application': { 'deadline': { 'date': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
            urgency_level: 'critical',
            days_until_deadline: 7
          },
          {
            _id: '2',
            description: 'Merit-Based Academic Scholarship',
            organization: 'Academic Excellence Foundation',
            'award_info': { 'funds': { 'amount': 3000 } },
            'application': { 'deadline': { 'date': new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } },
            urgency_level: 'urgent',
            days_until_deadline: 14
          }
        ];
      }

      const now = new Date();
      const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));

      // Use idx_deadline_urgency for optimal performance
      const pipeline = [
        {
          $match: {
            'metadata.is_active': true,
            'application.deadline.date': { $gte: now, $lte: futureDate }
          }
        },
        {
          $addFields: {
            days_until_deadline: {
              $ceil: {
                $divide: [
                  { $subtract: ['$application.deadline.date', now] },
                  1000 * 60 * 60 * 24
                ]
              }
            }
          }
        },
        { $sort: { 'application.deadline.date': 1 } },
        { $limit: 50 }
      ];

      return await this.collection.aggregate(pipeline).toArray();
    } catch (error) {
      console.error('Error getting upcoming deadlines:', error);
      throw error;
    }
  }

  /**
   * Text search scholarships using MongoDB text search - Optimized for idx_text_search
   */
  async searchScholarshipsByText(searchText, studentProfile = null, limit = 20) {
    try {
      // If database is not available, return mock data
      if (!this.collection) {
        console.log('⚠️ Database not available, returning mock search results');
        return [
          {
            _id: '1',
            description: 'STEM Excellence Scholarship',
            organization: 'National Science Foundation',
            'award_info': { 'funds': { 'amount': 5000 } },
            'application': { 'deadline': { 'date': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
            urgency_level: 'critical',
            days_until_deadline: 7
          },
          {
            _id: '2',
            description: 'Merit-Based Academic Scholarship',
            organization: 'Academic Excellence Foundation',
            'award_info': { 'funds': { 'amount': 3000 } },
            'application': { 'deadline': { 'date': new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } },
            urgency_level: 'urgent',
            days_until_deadline: 14
          }
        ];
      }

      // Use idx_text_search for optimal full-text search performance
      const pipeline = [
        {
          $search: {
            text: {
              query: searchText,
              path: ['search_data.searchable_text', 'description', 'organization'],
              fuzzy: { maxEdits: 2 }
            }
          }
        },
        { $match: { 'metadata.is_active': true } },
        { $limit: limit * 2 } // Get more for scoring
      ];

      const scholarships = await this.collection.aggregate(pipeline).toArray();

      // Calculate fit scores if student profile provided
      if (studentProfile) {
        return scholarships
          .map(scholarship => ({
            ...scholarship,
            fit_score: this.calculateFitScore(studentProfile, scholarship)
          }))
          .sort((a, b) => b.fit_score - a.fit_score)
          .slice(0, limit);
      }

      return scholarships.slice(0, limit);
    } catch (error) {
      console.error('Error in text search:', error);
      throw error;
    }
  }

  /**
   * Get scholarships by category - Optimized for idx_categories
   */
  async getScholarshipsByCategory(category, limit = 20) {
    try {
      // Use idx_categories for optimal category filtering
      const pipeline = [
        {
          $match: {
            'metadata.is_active': true,
            'search_data.categories': category
          }
        },
        { $sort: { 'award_info.funds.amount': -1 } },
        { $limit: limit }
      ];

      return await this.collection.aggregate(pipeline).toArray();
    } catch (error) {
      console.error('Error getting scholarships by category:', error);
      throw error;
    }
  }

  /**
   * Get scholarship by ID - Optimized for primary key lookup
   */
  async getScholarshipById(id) {
    try {
      const scholarship = await this.collection.findOne({ _id: id });
      if (!scholarship) {
        throw new Error('Scholarship not found');
      }
      return scholarship;
    } catch (error) {
      console.error('Error getting scholarship by ID:', error);
      throw error;
    }
  }

  /**
   * Enhanced AI-powered scholarship recommendations with smart categorization
   * Optimized for idx_comprehensive_matching
   */
  async getRecommendations(studentProfile, limit = 10) {
    try {
      // Use comprehensive matching pipeline for AI recommendations
      const pipeline = [
        { $match: { 'metadata.is_active': true } }
      ];

      // Add academic level matching - leverages idx_academic_levels
      if (studentProfile?.gradeLevel) {
        const studentLevel = this.mapGradeToAcademicLevel(studentProfile.gradeLevel);
        pipeline.push({
          $match: {
            'matching_criteria.academic_levels': studentLevel
          }
        });
      }

      // Add field matching - leverages idx_fields_study
      if (studentProfile?.intendedMajor) {
        pipeline.push({
          $match: {
            'matching_criteria.fields_of_study': {
              $regex: studentProfile.intendedMajor, $options: 'i'
            }
          }
        });
      }

      // Add demographic matching if applicable
      if (studentProfile?.minorityStatus) {
        pipeline.push({
          $match: {
            'matching_criteria.demographics.requires_minority': true
          }
        });
      }

      // Sort by award amount for high-value opportunities
      pipeline.push({
        $sort: { 'award_info.funds.amount': -1 }
      });

      pipeline.push({ $limit: limit * 3 });

      const scholarships = await this.collection.aggregate(pipeline).toArray();
      
      // Enhanced categorization with priority scoring
      const scoredScholarships = scholarships.map(scholarship => ({
        ...scholarship,
        fit_score: this.calculateFitScore(studentProfile, scholarship)
      }));
      
      const categorizedScholarships = this.categorizeScholarships(scoredScholarships, studentProfile);
      
      // Apply AI-powered selection strategy
      const recommendations = this.applyAISelectionStrategy(categorizedScholarships, studentProfile, limit);
      
      return recommendations;
    } catch (error) {
      console.error('Error getting recommendations:', error);
      throw error;
    }
  }

  /**
   * Categorize scholarships with enhanced AI logic
   */
  categorizeScholarships(scholarships, studentProfile) {
    const categories = {
      'perfect_match': [],
      'high_potential': [],
      'good_fit': [],
      'worth_applying': [],
      'long_shot': []
    };

    scholarships.forEach(scholarship => {
      const fitScore = scholarship.fit_score;
      
      if (fitScore >= 90) {
        categories.perfect_match.push(scholarship);
      } else if (fitScore >= 75) {
        categories.high_potential.push(scholarship);
      } else if (fitScore >= 60) {
        categories.good_fit.push(scholarship);
      } else if (fitScore >= 40) {
        categories.worth_applying.push(scholarship);
      } else {
        categories.long_shot.push(scholarship);
      }
    });

    return categories;
  }

  /**
   * Apply AI selection strategy for balanced recommendations
   */
  applyAISelectionStrategy(categorizedScholarships, studentProfile, limit) {
    const recommendations = [];
    const strategy = this.determineSelectionStrategy(studentProfile);
    
    switch (strategy) {
      case 'conservative':
        // Focus on high-probability scholarships
        recommendations.push(...categorizedScholarships.perfect_match.slice(0, 4));
        recommendations.push(...categorizedScholarships.high_potential.slice(0, 3));
        recommendations.push(...categorizedScholarships.good_fit.slice(0, 3));
        break;
        
      case 'balanced':
        // Mix of high and medium probability
        recommendations.push(...categorizedScholarships.perfect_match.slice(0, 3));
        recommendations.push(...categorizedScholarships.high_potential.slice(0, 4));
        recommendations.push(...categorizedScholarships.good_fit.slice(0, 3));
        break;
        
      case 'aggressive':
        // Include some long shots for high-reward opportunities
        recommendations.push(...categorizedScholarships.perfect_match.slice(0, 2));
        recommendations.push(...categorizedScholarships.high_potential.slice(0, 3));
        recommendations.push(...categorizedScholarships.good_fit.slice(0, 3));
        recommendations.push(...categorizedScholarships.worth_applying.slice(0, 2));
        break;
        
      default:
        // Default balanced approach
        recommendations.push(...categorizedScholarships.perfect_match.slice(0, 3));
        recommendations.push(...categorizedScholarships.high_potential.slice(0, 4));
        recommendations.push(...categorizedScholarships.good_fit.slice(0, 3));
    }
    
    return recommendations.slice(0, limit);
  }

  /**
   * Determine selection strategy based on student profile
   */
  determineSelectionStrategy(studentProfile) {
    const gpa = studentProfile.gpa || 0;
    const satScore = studentProfile.satScore || 0;
    const actScore = studentProfile.actScore || 0;
    const apClasses = studentProfile.apClasses?.length || 0;
    const extracurriculars = studentProfile.extracurriculars?.length || 0;
    
    // Calculate academic strength score
    let academicStrength = 0;
    if (gpa >= 3.8) academicStrength += 3;
    else if (gpa >= 3.5) academicStrength += 2;
    else if (gpa >= 3.0) academicStrength += 1;
    
    if (satScore >= 1400) academicStrength += 2;
    else if (satScore >= 1200) academicStrength += 1;
    
    if (actScore >= 30) academicStrength += 2;
    else if (actScore >= 25) academicStrength += 1;
    
    if (apClasses >= 3) academicStrength += 2;
    else if (apClasses >= 1) academicStrength += 1;
    
    if (extracurriculars >= 3) academicStrength += 1;
    
    // Determine strategy based on academic strength
    if (academicStrength >= 8) return 'aggressive'; // Strong candidate can aim high
    else if (academicStrength >= 5) return 'balanced'; // Average candidate
    else return 'conservative'; // Weaker candidate should focus on safety
  }

  /**
   * Get personalized scholarship insights and analytics
   */
  async getScholarshipInsights(studentProfile) {
    try {
      const scholarships = await this.searchScholarships(studentProfile, { limit: 100 });
      
      const insights = {
        total_matches: scholarships.length,
        average_fit_score: scholarships.reduce((sum, s) => sum + s.fit_score, 0) / scholarships.length,
        category_breakdown: {},
        deadline_analysis: {},
        amount_analysis: {},
        application_strategy: this.generateApplicationStrategy(scholarships, studentProfile),
        competitive_analysis: this.analyzeCompetitiveness(scholarships, studentProfile),
        timeline_recommendations: this.generateTimelineRecommendations(scholarships)
      };
      
      // Category breakdown
      scholarships.forEach(scholarship => {
        const category = scholarship.search_data?.categories?.[0] || 'General';
        if (!insights.category_breakdown[category]) {
          insights.category_breakdown[category] = { count: 0, avg_fit: 0, total_value: 0 };
        }
        insights.category_breakdown[category].count++;
        insights.category_breakdown[category].avg_fit += scholarship.fit_score;
        insights.category_breakdown[category].total_value += scholarship.award_info?.funds?.amount || 0;
      });
      
      // Calculate averages
      Object.keys(insights.category_breakdown).forEach(category => {
        const data = insights.category_breakdown[category];
        data.avg_fit = Math.round(data.avg_fit / data.count);
      });
      
      return insights;
    } catch (error) {
      console.error('Error getting scholarship insights:', error);
      throw error;
    }
  }

  /**
   * Generate personalized application strategy
   */
  generateApplicationStrategy(scholarships, studentProfile) {
    const strategy = {
      primary_focus: [],
      secondary_focus: [],
      safety_options: [],
      stretch_goals: [],
      timeline: {}
    };
    
    // Categorize by fit score
    const perfectMatches = scholarships.filter(s => s.fit_score >= 85);
    const goodMatches = scholarships.filter(s => s.fit_score >= 70 && s.fit_score < 85);
    const moderateMatches = scholarships.filter(s => s.fit_score >= 50 && s.fit_score < 70);
    const longShots = scholarships.filter(s => s.fit_score < 50);
    
    strategy.primary_focus = perfectMatches.slice(0, 5);
    strategy.secondary_focus = goodMatches.slice(0, 8);
    strategy.safety_options = moderateMatches.slice(0, 5);
    strategy.stretch_goals = longShots.slice(0, 3);
    
    // Generate timeline
    const deadlines = scholarships
      .filter(s => s.application?.deadline?.date)
      .sort((a, b) => new Date(a.application.deadline.date) - new Date(b.application.deadline.date));
    
    strategy.timeline = {
      immediate: deadlines.filter(s => {
        const days = Math.ceil((new Date(s.application.deadline.date) - new Date()) / (1000 * 60 * 60 * 24));
        return days <= 30;
      }).slice(0, 3),
      next_month: deadlines.filter(s => {
        const days = Math.ceil((new Date(s.application.deadline.date) - new Date()) / (1000 * 60 * 60 * 24));
        return days > 30 && days <= 60;
      }).slice(0, 5),
      upcoming: deadlines.filter(s => {
        const days = Math.ceil((new Date(s.application.deadline.date) - new Date()) / (1000 * 60 * 60 * 24));
        return days > 60;
      }).slice(0, 5)
    };
    
    return strategy;
  }

  /**
   * Analyze competitiveness of scholarship matches
   */
  analyzeCompetitiveness(scholarships, studentProfile) {
    const analysis = {
      overall_competitiveness: 'moderate',
      strength_areas: [],
      improvement_areas: [],
      competitive_advantages: [],
      risk_factors: []
    };
    
    const avgFitScore = scholarships.reduce((sum, s) => sum + s.fit_score, 0) / scholarships.length;
    
    if (avgFitScore >= 75) {
      analysis.overall_competitiveness = 'high';
    } else if (avgFitScore >= 50) {
      analysis.overall_competitiveness = 'moderate';
    } else {
      analysis.overall_competitiveness = 'low';
    }
    
    // Analyze strength areas based on high-scoring scholarships
    const highScoringScholarships = scholarships.filter(s => s.fit_score >= 80);
    const strengthCategories = new Set();
    highScoringScholarships.forEach(s => {
      if (s.search_data?.categories) {
        s.search_data.categories.forEach(cat => strengthCategories.add(cat));
      }
    });
    analysis.strength_areas = Array.from(strengthCategories);
    
    // Identify improvement areas
    const lowScoringScholarships = scholarships.filter(s => s.fit_score < 40);
    const weakCategories = new Set();
    lowScoringScholarships.forEach(s => {
      if (s.search_data?.categories) {
        s.search_data.categories.forEach(cat => weakCategories.add(cat));
      }
    });
    analysis.improvement_areas = Array.from(weakCategories);
    
    return analysis;
  }

  /**
   * Generate timeline recommendations for scholarship applications
   */
  generateTimelineRecommendations(scholarships) {
    const recommendations = {
      immediate_actions: [],
      short_term: [],
      medium_term: [],
      long_term: []
    };
    
    const urgentScholarships = scholarships.filter(s => {
      const days = Math.ceil((new Date(s.application.deadline.date) - new Date()) / (1000 * 60 * 60 * 24));
      return days <= 7;
    });
    
    if (urgentScholarships.length > 0) {
      recommendations.immediate_actions.push({
        action: 'Apply to urgent scholarships',
        scholarships: urgentScholarships.slice(0, 3),
        priority: 'critical'
      });
    }
    
    const highValueScholarships = scholarships
      .filter(s => (s.award_info?.funds?.amount || 0) >= 5000)
      .sort((a, b) => (b.award_info?.funds?.amount || 0) - (a.award_info?.funds?.amount || 0));
    
    if (highValueScholarships.length > 0) {
      recommendations.short_term.push({
        action: 'Focus on high-value opportunities',
        scholarships: highValueScholarships.slice(0, 5),
        priority: 'high'
      });
    }
    
    return recommendations;
  }

  /**
   * Search scholarships by keywords - Optimized for idx_keywords
   */
  async searchScholarshipsByKeywords(keywords, studentProfile = null, limit = 20) {
    try {
      // Use idx_keywords for optimal keyword search performance
      const pipeline = [
        {
          $match: {
            'metadata.is_active': true,
            'search_data.keywords': { $in: keywords }
          }
        },
        {
          $addFields: {
            keyword_match_count: {
              $size: {
                $setIntersection: ['$search_data.keywords', keywords]
              }
            }
          }
        },
        { $sort: { keyword_match_count: -1, 'award_info.funds.amount': -1 } },
        { $limit: limit * 2 }
      ];

      const scholarships = await this.collection.aggregate(pipeline).toArray();

      // Calculate fit scores if student profile provided
      if (studentProfile) {
        return scholarships
          .map(scholarship => ({
            ...scholarship,
            fit_score: this.calculateFitScore(studentProfile, scholarship)
          }))
          .sort((a, b) => b.fit_score - a.fit_score)
          .slice(0, limit);
      }

      return scholarships.slice(0, limit);
    } catch (error) {
      console.error('Error in keyword search:', error);
      throw error;
    }
  }

  /**
   * Search scholarships by organization - Optimized for idx_organization
   */
  async searchScholarshipsByOrganization(organization, studentProfile = null, limit = 20) {
    try {
      // Use idx_organization for optimal organization search performance
      const pipeline = [
        {
          $match: {
            'metadata.is_active': true,
            'organization': { $regex: organization, $options: 'i' }
          }
        },
        { $sort: { 'award_info.funds.amount': -1 } },
        { $limit: limit * 2 }
      ];

      const scholarships = await this.collection.aggregate(pipeline).toArray();

      // Calculate fit scores if student profile provided
      if (studentProfile) {
        return scholarships
          .map(scholarship => ({
            ...scholarship,
            fit_score: this.calculateFitScore(studentProfile, scholarship)
          }))
          .sort((a, b) => b.fit_score - a.fit_score)
          .slice(0, limit);
      }

      return scholarships.slice(0, limit);
    } catch (error) {
      console.error('Error in organization search:', error);
      throw error;
    }
  }

  /**
   * Get scholarships with contact information - Optimized for idx_contact_emails
   */
  async getScholarshipsWithContactInfo(limit = 20) {
    try {
      // Use idx_contact_emails for scholarships with contact information
      const pipeline = [
        {
          $match: {
            'metadata.is_active': true,
            'contact_info.email': { $exists: true, $ne: null }
          }
        },
        {
          $addFields: {
            has_contact: {
              $cond: {
                if: { $ne: ['$contact_info.email', ''] },
                then: true,
                else: false
              }
            }
          }
        },
        { $match: { has_contact: true } },
        { $sort: { 'award_info.funds.amount': -1 } },
        { $limit: limit }
      ];

      return await this.collection.aggregate(pipeline).toArray();
    } catch (error) {
      console.error('Error getting scholarships with contact info:', error);
      throw error;
    }
  }

  /**
   * Advanced comprehensive search leveraging multiple indexes
   */
  async advancedComprehensiveSearch(studentProfile, options = {}) {
    const {
      limit = 50,
      categories = [],
      keywords = [],
      organizations = [],
      minAmount = 0,
      maxAmount = null,
      deadlineRange = null,
      academicLevels = [],
      fieldsOfStudy = []
    } = options;

    try {
      // Build comprehensive pipeline leveraging multiple indexes
      const pipeline = [
        // Use idx_active for initial filtering
        { $match: { 'metadata.is_active': true } }
      ];

      // Use idx_categories for category filtering
      if (categories.length > 0) {
        pipeline.push({
          $match: {
            'search_data.categories': { $in: categories }
          }
        });
      }

      // Use idx_keywords for keyword filtering
      if (keywords.length > 0) {
        pipeline.push({
          $match: {
            'search_data.keywords': { $in: keywords }
          }
        });
      }

      // Use idx_organization for organization filtering
      if (organizations.length > 0) {
        pipeline.push({
          $match: {
            'organization': { $in: organizations }
          }
        });
      }

      // Use idx_award_browse for amount filtering
      if (minAmount > 0 || maxAmount) {
        const amountFilter = {};
        if (minAmount > 0) amountFilter.$gte = minAmount;
        if (maxAmount) amountFilter.$lte = maxAmount;
        
        pipeline.push({
          $match: {
            'award_info.funds.amount': amountFilter
          }
        });
      }

      // Use idx_deadline_urgency for deadline filtering
      if (deadlineRange) {
        const now = new Date();
        const futureDate = new Date(now.getTime() + (deadlineRange * 24 * 60 * 60 * 1000));
        pipeline.push({
          $match: {
            'application.deadline.date': { $gte: now, $lte: futureDate }
          }
        });
      }

      // Use idx_academic_levels for academic level filtering
      if (academicLevels.length > 0) {
        pipeline.push({
          $match: {
            'matching_criteria.academic_levels': { $in: academicLevels }
          }
        });
      }

      // Use idx_fields_study for field of study filtering
      if (fieldsOfStudy.length > 0) {
        pipeline.push({
          $match: {
            'matching_criteria.fields_of_study': { $in: fieldsOfStudy }
          }
        });
      }

      // Add calculated fields for scoring
      pipeline.push({
        $addFields: {
          days_until_deadline: {
            $ceil: {
              $divide: [
                { $subtract: ['$application.deadline.date', new Date()] },
                1000 * 60 * 60 * 24
              ]
            }
          },
          urgency_level: {
            $cond: {
              if: { $lte: ['$days_until_deadline', 7] },
              then: 'critical',
              else: {
                $cond: {
                  if: { $lte: ['$days_until_deadline', 30] },
                  then: 'urgent',
                  else: 'normal'
                }
              }
            }
          }
        }
      });

      // Sort by urgency and amount
      pipeline.push({
        $sort: {
          urgency_level: 1,
          'award_info.funds.amount': -1
        }
      });

      pipeline.push({ $limit: limit * 2 });

      const scholarships = await this.collection.aggregate(pipeline).toArray();

      // Calculate fit scores and return
      return scholarships
        .map(scholarship => ({
          ...scholarship,
          fit_score: this.calculateFitScore(studentProfile, scholarship)
        }))
        .sort((a, b) => b.fit_score - a.fit_score)
        .slice(0, limit);

    } catch (error) {
      console.error('Error in comprehensive search:', error);
      throw error;
    }
  }
}

// Create singleton instance
const scholarshipService = new ScholarshipService();

module.exports = scholarshipService; 