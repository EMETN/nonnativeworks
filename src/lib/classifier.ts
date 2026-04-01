import type { RawJob, ClassifiedJob } from './ats/types';
import { classifyCategory, classifyCategoryVerbose } from './classifiers/category';
import { detectNativeLanguage, stripHtml } from './classifiers/language';
import type { SignalEntry } from './classifiers/language';

export type { SignalEntry } from './classifiers/language';

export type ClassificationSignals = {
  categorySignal?: string;
  categorySource: 'title' | 'description' | 'default';
  languageSignals: SignalEntry[];
};

export { classifyCategory } from './classifiers/category';
export { detectNativeLanguage } from './classifiers/language';

export function classifyJobVerbose(
  job: RawJob,
  countryCode: string,
): { classified: ClassifiedJob; signals: ClassificationSignals } {
  // Always run stripHtml — it's safe on plain text and ensures HTML in descriptionText
  // (e.g. from company APIs that return "clean" but still-marked-up content) doesn't
  // interfere with tinyld language detection or signal phrase matching.
  const rawDesc = job.descriptionHtml ?? job.descriptionText;
  const descText = rawDesc ? stripHtml(rawDesc) : undefined;

  const { category, matchedKeyword, source } = classifyCategoryVerbose(job.title, descText);
  const langResult = detectNativeLanguage(job.title, descText, countryCode);

  return {
    classified: {
      title: job.title,
      url: job.url,
      category,
      requires_native_language: langResult.value,
      local_language_advantage: langResult.local_language_advantage,
      requiredLanguages: langResult.requiredLanguages,
      preferredLanguages: langResult.preferredLanguages,
    },
    signals: {
      categorySignal: matchedKeyword,
      categorySource: source,
      languageSignals: langResult.signals,
    },
  };
}

export function classifyJob(job: RawJob, countryCode: string): ClassifiedJob {
  return classifyJobVerbose(job, countryCode).classified;
}
