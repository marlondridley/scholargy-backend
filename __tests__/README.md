# Backend Tests

This directory contains test files for the Scholargy backend.

## Running Tests

```bash
# Install test dependencies first
npm install

# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- probability.test.js
```

## Test Structure

- `probability.test.js` - Tests for the calculateProbability function, including:
  - GPA weighting verification (40% weight)
  - SAT score weighting verification (40% weight) 
  - Extracurricular weighting verification (20% weight)
  - Edge cases (missing data, extreme values)
  - Admission rate adjustments
  - Probability bounds validation (0-1 range)

## Test Coverage

The tests verify:
- ✅ Correct GPA scoring based on difference from college average
- ✅ Correct SAT scoring based on difference from college 75th percentile  
- ✅ Correct extracurricular scoring (1-5 scale × 4 multiplier)
- ✅ Graceful handling of missing profile data
- ✅ Admission rate adjustment calculations
- ✅ Probability capping at 0.95 maximum
- ✅ Default 0.5 probability when no data available
- ✅ Consistent results for identical inputs
- ✅ Valid probability range (0-1) for all scenarios

## Adding New Tests

1. Create a new `.test.js` file in this directory
2. Follow the existing naming convention: `[module].test.js`
3. Use Jest testing framework with describe/test structure
4. Mock external dependencies as needed
5. Include edge cases and error scenarios
