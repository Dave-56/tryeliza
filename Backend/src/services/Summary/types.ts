// import { SummarizationResponse } from "../../Types/model";
// export interface StoreSummaryOptions {
//     userId: string;
//     period: 'morning' | 'evening';
//     summary: SummarizationResponse;
//     mergeStrategy: 'overwrite' | 'merge';
//     transaction?: DatabaseTransaction;
//   }
  
//   export interface CategorySummary {
//     category: string;
//     count: number;
//     summaries: EmailSummary[];
//   }
  
//   export interface EmailSummary {
//     subject: string;
//     gmail_id: string;
//     sender: string;
//     received_at: string;
//     headline: string;
//     priority_score: number;
//     insights?: {
//       key_highlights?: string[];
//       why_this_matters?: string;
//       next_step?: string[];
//     };
//   }