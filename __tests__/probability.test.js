// __tests__/probability.test.js - Tests for calculateProbability function
const request = require('supertest');

// Mock the probability calculation function by extracting it
// In a real scenario, you'd refactor to export the function separately
const calculateProbability = (studentProfile, collegeStats) => {
    let score = 0;
    let maxScore = 0;

    // GPA comparison (40% weight)
    if (collegeStats.avgGPA && studentProfile.gpa) {
        maxScore += 40;
        const gpaDiff = studentProfile.gpa - collegeStats.avgGPA;
        if (gpaDiff >= 0.5) score += 40;
        else if (gpaDiff >= 0.2) score += 35;
        else if (gpaDiff >= 0) score += 30;
        else if (gpaDiff >= -0.2) score += 20;
        else if (gpaDiff >= -0.5) score += 10;
        else score += 5;
    }

    // SAT comparison (40% weight)
    if (collegeStats.sat75 && studentProfile.satScore) {
        maxScore += 40;
        const satDiff = studentProfile.satScore - collegeStats.sat75;
        if (satDiff >= 100) score += 40;
        else if (satDiff >= 50) score += 35;
        else if (satDiff >= 0) score += 30;
        else if (satDiff >= -50) score += 20;
        else if (satDiff >= -100) score += 10;
        else score += 5;
    }

    // Extracurriculars (20% weight)
    if (studentProfile.extracurricularStrength) {
        maxScore += 20;
        score += studentProfile.extracurricularStrength * 4; // 1-5 scale
    }

    // If admission rate is available, factor it in
    if (collegeStats.admissionRate && maxScore > 0) {
        const baseProb = score / maxScore;
        // Adjust based on selectivity
        return Math.min(baseProb * (collegeStats.admissionRate * 2), 0.95);
    }

    return maxScore > 0 ? score / maxScore : 0.5;
};

describe('calculateProbability', () => {
    
    describe('GPA weighting tests', () => {
        const baseCollegeStats = { avgGPA: 3.5, sat75: 1400, admissionRate: 0.5 };
        const baseSatScore = 1400;
        const baseExtracurriculars = 3;

        test('should give maximum GPA score when student GPA is 0.5+ higher than college average', () => {
            const studentProfile = { gpa: 4.0, satScore: baseSatScore, extracurricularStrength: baseExtracurriculars };
            const probability = calculateProbability(studentProfile, baseCollegeStats);
            
            // With GPA 4.0 vs college 3.5 (diff = 0.5), should get max GPA score (40 points)
            // Total possible: 100 points, expect high probability
            expect(probability).toBeGreaterThan(0.7);
        });

        test('should give moderate GPA score when student GPA is slightly higher (0.2-0.5)', () => {
            const studentProfile = { gpa: 3.7, satScore: baseSatScore, extracurricularStrength: baseExtracurriculars };
            const probability = calculateProbability(studentProfile, baseCollegeStats);
            
            // With GPA 3.7 vs college 3.5 (diff = 0.2), should get 35 GPA points
            expect(probability).toBeGreaterThan(0.6);
            expect(probability).toBeLessThan(0.8);
        });

        test('should give minimum GPA score when student GPA is much lower', () => {
            const studentProfile = { gpa: 2.8, satScore: baseSatScore, extracurricularStrength: baseExtracurriculars };
            const probability = calculateProbability(studentProfile, baseCollegeStats);
            
            // With GPA 2.8 vs college 3.5 (diff = -0.7), should get minimum GPA score (5 points)
            expect(probability).toBeLessThan(0.4);
        });
    });

    describe('SAT weighting tests', () => {
        const baseCollegeStats = { avgGPA: 3.5, sat75: 1400, admissionRate: 0.5 };
        const baseGPA = 3.5;
        const baseExtracurriculars = 3;

        test('should give maximum SAT score when student SAT is 100+ higher than college 75th percentile', () => {
            const studentProfile = { gpa: baseGPA, satScore: 1520, extracurricularStrength: baseExtracurriculars };
            const probability = calculateProbability(studentProfile, baseCollegeStats);
            
            // With SAT 1520 vs college 1400 (diff = 120), should get max SAT score (40 points)
            expect(probability).toBeGreaterThan(0.7);
        });

        test('should give moderate SAT score when student SAT is moderately higher (50-100)', () => {
            const studentProfile = { gpa: baseGPA, satScore: 1450, extracurricularStrength: baseExtracurriculars };
            const probability = calculateProbability(studentProfile, baseCollegeStats);
            
            // With SAT 1450 vs college 1400 (diff = 50), should get 35 SAT points
            expect(probability).toBeGreaterThan(0.6);
            expect(probability).toBeLessThan(0.8);
        });

        test('should give minimum SAT score when student SAT is much lower', () => {
            const studentProfile = { gpa: baseGPA, satScore: 1200, extracurricularStrength: baseExtracurriculars };
            const probability = calculateProbability(studentProfile, baseCollegeStats);
            
            // With SAT 1200 vs college 1400 (diff = -200), should get minimum SAT score (5 points)
            expect(probability).toBeLessThan(0.4);
        });
    });

    describe('Extracurricular weighting tests', () => {
        const baseCollegeStats = { avgGPA: 3.5, sat75: 1400, admissionRate: 0.5 };
        const baseGPA = 3.5;
        const baseSatScore = 1400;

        test('should give maximum extracurricular score for strength level 5', () => {
            const studentProfile = { gpa: baseGPA, satScore: baseSatScore, extracurricularStrength: 5 };
            const probability = calculateProbability(studentProfile, baseCollegeStats);
            
            // With extracurricular strength 5, should get 20 points (5 * 4)
            expect(probability).toBeGreaterThan(0.7);
        });

        test('should give minimum extracurricular score for strength level 1', () => {
            const studentProfile = { gpa: baseGPA, satScore: baseSatScore, extracurricularStrength: 1 };
            const probability = calculateProbability(studentProfile, baseCollegeStats);
            
            // With extracurricular strength 1, should get 4 points (1 * 4)
            expect(probability).toBeLessThan(0.6);
        });
    });

    describe('Edge cases and admission rate adjustments', () => {
        test('should handle missing GPA gracefully', () => {
            const studentProfile = { satScore: 1400, extracurricularStrength: 3 };
            const collegeStats = { avgGPA: 3.5, sat75: 1400, admissionRate: 0.5 };
            const probability = calculateProbability(studentProfile, collegeStats);
            
            // Should still calculate probability based on SAT and extracurriculars only
            expect(probability).toBeGreaterThan(0);
            expect(probability).toBeLessThan(1);
        });

        test('should handle missing SAT score gracefully', () => {
            const studentProfile = { gpa: 3.5, extracurricularStrength: 3 };
            const collegeStats = { avgGPA: 3.5, sat75: 1400, admissionRate: 0.5 };
            const probability = calculateProbability(studentProfile, collegeStats);
            
            // Should still calculate probability based on GPA and extracurriculars only
            expect(probability).toBeGreaterThan(0);
            expect(probability).toBeLessThan(1);
        });

        test('should handle missing extracurricular strength gracefully', () => {
            const studentProfile = { gpa: 3.5, satScore: 1400 };
            const collegeStats = { avgGPA: 3.5, sat75: 1400, admissionRate: 0.5 };
            const probability = calculateProbability(studentProfile, collegeStats);
            
            // Should still calculate probability based on GPA and SAT only
            expect(probability).toBeGreaterThan(0);
            expect(probability).toBeLessThan(1);
        });

        test('should return 0.5 when no data is available', () => {
            const studentProfile = {};
            const collegeStats = {};
            const probability = calculateProbability(studentProfile, collegeStats);
            
            // Should return default probability of 0.5
            expect(probability).toBe(0.5);
        });

        test('should cap probability at 0.95 when admission rate adjustment is applied', () => {
            const studentProfile = { gpa: 4.0, satScore: 1600, extracurricularStrength: 5 };
            const collegeStats = { avgGPA: 3.0, sat75: 1200, admissionRate: 0.8 };
            const probability = calculateProbability(studentProfile, collegeStats);
            
            // Even with perfect scores, should cap at 0.95
            expect(probability).toBeLessThanOrEqual(0.95);
        });

        test('should adjust probability based on low admission rate (highly selective school)', () => {
            const studentProfile = { gpa: 3.5, satScore: 1400, extracurricularStrength: 3 };
            const collegeStats = { avgGPA: 3.5, sat75: 1400, admissionRate: 0.1 }; // Very selective
            const probability = calculateProbability(studentProfile, collegeStats);
            
            // With low admission rate, probability should be reduced significantly
            expect(probability).toBeLessThan(0.4);
        });

        test('should handle very high admission rate correctly', () => {
            const studentProfile = { gpa: 3.5, satScore: 1400, extracurricularStrength: 3 };
            const collegeStats = { avgGPA: 3.5, sat75: 1400, admissionRate: 0.9 }; // Very open admission
            const probability = calculateProbability(studentProfile, collegeStats);
            
            // With high admission rate, probability should be higher
            expect(probability).toBeGreaterThan(0.8);
        });
    });

    describe('Probability calculation consistency', () => {
        test('should return consistent results for identical inputs', () => {
            const studentProfile = { gpa: 3.7, satScore: 1450, extracurricularStrength: 4 };
            const collegeStats = { avgGPA: 3.5, sat75: 1400, admissionRate: 0.6 };
            
            const probability1 = calculateProbability(studentProfile, collegeStats);
            const probability2 = calculateProbability(studentProfile, collegeStats);
            
            expect(probability1).toBe(probability2);
        });

        test('should return values between 0 and 1', () => {
            const testCases = [
                { student: { gpa: 2.0, satScore: 900, extracurricularStrength: 1 }, college: { avgGPA: 4.0, sat75: 1600, admissionRate: 0.05 } },
                { student: { gpa: 4.0, satScore: 1600, extracurricularStrength: 5 }, college: { avgGPA: 2.0, sat75: 800, admissionRate: 0.95 } },
                { student: { gpa: 3.5, satScore: 1200, extracurricularStrength: 3 }, college: { avgGPA: 3.5, sat75: 1400, admissionRate: 0.5 } }
            ];

            testCases.forEach((testCase, index) => {
                const probability = calculateProbability(testCase.student, testCase.college);
                expect(probability).toBeGreaterThanOrEqual(0);
                expect(probability).toBeLessThanOrEqual(1);
            });
        });
    });
});
