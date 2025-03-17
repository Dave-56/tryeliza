import { BayesClassifier } from 'natural';
import { emailTrainingData, EmailCategory } from '../data/emailDatasets';
import { EmailThread } from '../../../Types/model';
import { CategoryResult } from '../utils/patternMatching';
import { EmailFeatureExtractor } from '../utils/featureExtraction';

export class EmailClassifier {
    private classifier: BayesClassifier;
    private featureExtractor: EmailFeatureExtractor;

    constructor(featureExtractor?: EmailFeatureExtractor) {
        this.classifier = new BayesClassifier();
        this.featureExtractor = featureExtractor || new EmailFeatureExtractor();
        this.loadTrainingData();
    }

    private loadTrainingData(): void {
        // Train classifier with each category's data
        Object.entries(emailTrainingData).forEach(([category, phrases]) => {
            phrases.forEach(text => {
                this.classifier.addDocument(text, category);
            });
        });

        // Train the classifier
        this.classifier.train();
    }

    public classify(text: string): { category: EmailCategory; confidence: number } {
        const classifications = this.classifier.getClassifications(text);
        if (!classifications.length) {
            // Default to 'other' with low confidence if no classification found
            return {
                category: 'important' as EmailCategory, // Use important as fallback
                confidence: 0.1
            };
        }

        const topClassification = classifications[0];
        return {
            category: topClassification.label.toLowerCase() as EmailCategory,
            confidence: topClassification.value
        };
    }

    public getClassifications(text: string) {
        return this.classifier.getClassifications(text);
    }

    // Use ML classifier to categorize email
    public classifyEmailThread(emailThread: EmailThread): CategoryResult {
        // Extract content from the latest message in the thread
        const latestMessage = emailThread.messages[emailThread.messages.length - 1];
        
        // Ensure content is a string (not a Promise)
        const content = typeof latestMessage.body === 'string' ? latestMessage.body : 
                       typeof latestMessage.snippet === 'string' ? latestMessage.snippet : '';
        const subject = latestMessage.headers?.subject || '';
        
        // Combine subject and content for classification
        const textToAnalyze = `${subject} ${content}`.toLowerCase();
        
        // Extract features for better classification
        const features = this.featureExtractor.extractFeatures(emailThread);
        
        // Get classification result using our classifier
        const { category, confidence } = this.classify(textToAnalyze);

        // Adjust confidence based on features
        let adjustedConfidence = confidence;
        if (features.promotionalScore > 0.7) {
            adjustedConfidence = Math.max(adjustedConfidence, 0.8);
        }
        
        if (features.urgencyScore > 0.7 && category === 'actions') {
            adjustedConfidence = Math.max(adjustedConfidence, 0.85);
        }
        
        // Determine if action is required based on category
        const requiresAction = category === 'actions';
        
        return {
            category,
            confidence: adjustedConfidence,
            requiresAction
        };
    }

    
}
