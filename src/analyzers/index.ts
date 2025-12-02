/**
 * Email Analyzers
 *
 * Export all analysis functions for deep email inspection.
 */

export {
  analyzeCatchAll,
  analyzeEmailPattern,
  analyzeNameLikeness,
  analyzeResponseTiming,
  checkSPF,
  checkDMARC,
} from './catchall';

export type { CatchAllAnalysis } from './catchall';

