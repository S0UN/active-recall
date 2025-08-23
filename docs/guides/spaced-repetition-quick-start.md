# Spaced Repetition System - Quick Start Guide

## Overview

This guide will help you integrate the spaced repetition system into your application in 10 minutes or less.

## Installation & Setup

### 1. Environment Configuration

Create a `.env` file with required configuration:

```bash
# Required for question generation
OPENAI_API_KEY=your_openai_api_key_here

# Optional - system will use sensible defaults
SPACED_REPETITION_DATA_PATH=./data/schedules
QUESTION_DATA_PATH=./data/questions
OPENAI_MODEL=gpt-3.5-turbo
```

### 2. Basic Integration

```typescript
import { 
  ReviewSchedule,
  FileSystemReviewScheduleRepository,
  ReadableReviewSchedulerService,
  OpenAIQuestionGenerationService,
  FileSystemQuestionRepository,
  QuestionManagementService,
  ResponseQuality
} from './src/core';

// Initialize the system
async function initializeSpacedRepetition() {
  // Setup repositories
  const scheduleRepo = new FileSystemReviewScheduleRepository('./data/schedules');
  const questionRepo = new FileSystemQuestionRepository('./data/questions');
  
  // Setup services
  const schedulerService = new ReadableReviewSchedulerService(scheduleRepo);
  const questionGenService = new OpenAIQuestionGenerationService();
  const questionMgmtService = new QuestionManagementService(
    questionGenService,
    questionRepo,
    scheduleRepo
  );
  
  return { schedulerService, questionMgmtService };
}
```

## Common Use Cases

### 1. Create Review Schedule for New Content

```typescript
async function addNewConcept(conceptId: string) {
  const { schedulerService } = await initializeSpacedRepetition();
  
  // Create new review schedule
  const schedule = ReviewSchedule.createNew(conceptId);
  
  // Save to repository
  await schedulerService.save(schedule);
  
  console.log(`Created review schedule for: ${conceptId}`);
  return schedule;
}
```

### 2. Generate Questions from Content

```typescript
async function generateQuestionsForContent(content: string, conceptArea: string) {
  const { questionMgmtService } = await initializeSpacedRepetition();
  
  // Generate questions and create review schedules
  const result = await questionMgmtService.generateAndScheduleQuestions(content, {
    conceptArea,
    questionCount: 5,
    questionTypes: ['flashcard', 'multiple_choice', 'short_answer']
  });
  
  console.log(`Generated ${result.questions.length} questions`);
  console.log(`Created ${result.schedules.length} review schedules`);
  
  return result;
}

// Example usage
const content = `
Linear algebra is the branch of mathematics concerning linear equations,
linear functions, and their representations through matrices and vector spaces.
`;

await generateQuestionsForContent(content, 'Mathematics');
```

### 3. Get Study Session

```typescript
async function getStudySession(maxCards: number = 20) {
  const { schedulerService } = await initializeSpacedRepetition();
  
  const session = await schedulerService.getStudySession({
    maxCards,
    prioritizeDifficult: true,
    includeNewCards: true
  });
  
  console.log(`Study session: ${session.schedules.length} cards`);
  console.log(`Estimated time: ${session.estimatedDurationMinutes} minutes`);
  
  return session;
}
```

### 4. Process Review Session

```typescript
async function processReviewSession(reviewOutcomes: Array<{scheduleId: string, quality: ResponseQuality}>) {
  const { schedulerService } = await initializeSpacedRepetition();
  
  const result = await schedulerService.recordReviewOutcomesAndReschedule(reviewOutcomes);
  
  console.log(`Processed ${result.processedCount} reviews`);
  console.log(`Next session recommended: ${result.nextSessionRecommendation}`);
  console.log(`Performance summary:`, result.performanceSummary);
  
  return result;
}

// Example usage
await processReviewSession([
  { scheduleId: 'schedule-1', quality: ResponseQuality.GOOD },
  { scheduleId: 'schedule-2', quality: ResponseQuality.HARD },
  { scheduleId: 'schedule-3', quality: ResponseQuality.EASY }
]);
```

### 5. Get Learning Progress Report

```typescript
async function getLearningProgress() {
  const { schedulerService } = await initializeSpacedRepetition();
  
  const report = await schedulerService.generateComprehensiveProgressReport();
  
  console.log(`
📊 Learning Progress Report
---------------------------
Total concepts: ${report.totalConcepts}
Due today: ${report.dueToday}
Overdue: ${report.overdueCount}
Average ease factor: ${report.averageEaseFactor.toFixed(2)}
Retention rate: ${(report.retentionRate * 100).toFixed(1)}%
Study time needed: ${report.estimatedStudyMinutes} minutes
Current streak: ${report.streakDays} days
  `);
  
  if (report.problematicConcepts.length > 0) {
    console.log(`❌ Concepts needing attention: ${report.problematicConcepts.join(', ')}`);
  }
  
  return report;
}
```

## Complete Example Application

Here's a simple CLI application that demonstrates the full workflow:

```typescript
#!/usr/bin/env node

import readline from 'readline';
import { 
  initializeSpacedRepetition,
  ResponseQuality
} from './spaced-repetition-setup';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class StudyApp {
  private services: any;

  async initialize() {
    console.log('🚀 Initializing Spaced Repetition System...');
    this.services = await initializeSpacedRepetition();
    console.log('✅ System ready!');
  }

  async showMenu() {
    console.log(`
📚 Spaced Repetition Study App
------------------------------
1. Add new content
2. Generate questions
3. Start study session
4. View progress
5. Exit
    `);
    
    rl.question('Choose an option (1-5): ', (choice) => {
      this.handleChoice(parseInt(choice));
    });
  }

  async handleChoice(choice: number) {
    switch (choice) {
      case 1:
        await this.addNewContent();
        break;
      case 2:
        await this.generateQuestions();
        break;
      case 3:
        await this.startStudySession();
        break;
      case 4:
        await this.showProgress();
        break;
      case 5:
        console.log('👋 Happy studying!');
        rl.close();
        return;
      default:
        console.log('❌ Invalid choice');
    }
    
    this.showMenu();
  }

  async addNewContent() {
    rl.question('Enter concept ID: ', async (conceptId) => {
      const schedule = await this.services.schedulerService.createSchedule(conceptId);
      console.log(`✅ Created review schedule for: ${conceptId}`);
    });
  }

  async generateQuestions() {
    rl.question('Enter content to generate questions from: ', async (content) => {
      if (content.length < 50) {
        console.log('❌ Content too short. Please provide at least 50 characters.');
        return;
      }
      
      try {
        const result = await this.services.questionMgmtService.generateAndScheduleQuestions(content);
        console.log(`✅ Generated ${result.questions.length} questions`);
        console.log(`📋 Question types: ${result.questions.map(q => q.type).join(', ')}`);
      } catch (error) {
        console.log(`❌ Error generating questions: ${error.message}`);
      }
    });
  }

  async startStudySession() {
    const session = await this.services.schedulerService.getStudySession({
      maxCards: 10,
      prioritizeDifficult: true,
      includeNewCards: true
    });

    if (session.schedules.length === 0) {
      console.log('🎉 No cards due for review! Come back later.');
      return;
    }

    console.log(`📚 Starting study session: ${session.schedules.length} cards`);
    
    for (let i = 0; i < session.schedules.length; i++) {
      const schedule = session.schedules[i];
      console.log(`\n[${i + 1}/${session.schedules.length}] Concept: ${schedule.conceptId}`);
      
      const quality = await this.askForQuality();
      await this.services.schedulerService.recordReview(schedule.id, quality);
      
      console.log('✅ Progress saved');
    }

    console.log('🎉 Study session complete!');
  }

  async askForQuality(): Promise<ResponseQuality> {
    return new Promise((resolve) => {
      console.log(`
How well did you remember this concept?
1. Forgot (need to relearn)
2. Hard (struggled to remember)
3. Good (remembered well)
4. Easy (very easy to remember)
      `);
      
      rl.question('Your response (1-4): ', (answer) => {
        const quality = {
          '1': ResponseQuality.FORGOT,
          '2': ResponseQuality.HARD,
          '3': ResponseQuality.GOOD,
          '4': ResponseQuality.EASY
        }[answer] || ResponseQuality.GOOD;
        
        resolve(quality);
      });
    });
  }

  async showProgress() {
    const report = await this.services.schedulerService.generateComprehensiveProgressReport();
    
    console.log(`
📊 Your Learning Progress
-------------------------
📚 Total concepts: ${report.totalConcepts}
⏰ Due today: ${report.dueToday}
⚠️  Overdue: ${report.overdueCount}
📈 Retention rate: ${(report.retentionRate * 100).toFixed(1)}%
🔥 Study streak: ${report.streakDays} days
⏱️  Study time needed: ${report.estimatedStudyMinutes} minutes
    `);
  }
}

// Run the app
async function main() {
  const app = new StudyApp();
  await app.initialize();
  app.showMenu();
}

main().catch(console.error);
```

## Error Handling Best Practices

```typescript
import { 
  SpacedRepetitionError,
  QuestionGenerationError,
  OpenAIServiceError 
} from './src/core';

async function safeQuestionGeneration(content: string) {
  try {
    const result = await questionMgmtService.generateAndScheduleQuestions(content);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof OpenAIServiceError) {
      console.log('🔄 OpenAI service temporarily unavailable, trying again...');
      // Implement retry logic
      return { success: false, error: 'Service temporarily unavailable' };
    }
    
    if (error instanceof QuestionGenerationError) {
      console.log('❌ Question generation failed:', error.message);
      return { success: false, error: error.message };
    }
    
    // Unexpected error
    console.error('💥 Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
```

## Performance Tips

1. **Batch Operations**: Use `saveMany()` for multiple schedules
2. **Connection Reuse**: Initialize services once, reuse throughout app lifecycle
3. **Cache Strategy**: Question generation automatically caches based on content hash
4. **Async Patterns**: All operations are async - use `Promise.all()` for parallel operations

```typescript
// Good: Parallel processing
const [session, progress, stats] = await Promise.all([
  schedulerService.getStudySession(options),
  schedulerService.generateComprehensiveProgressReport(),
  scheduleRepo.getStatistics()
]);

// Good: Batch operations
await scheduleRepo.saveMany(schedules);
```

## Next Steps

- Read the [comprehensive implementation guide](./SPACED_REPETITION_SYSTEM.md) for deep understanding
- Check the [API reference](./SPACED_REPETITION_API_REFERENCE.md) for complete method documentation
- Explore the test files for more usage examples
- Consider implementing custom repositories for database backends

## Support

The system includes comprehensive error handling and logging. All errors include context for debugging. Check the console output for detailed error information if something goes wrong.