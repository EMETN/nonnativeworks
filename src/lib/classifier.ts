import type { RawJob, ClassifiedJob } from './ats/types';
import { classifyCategory } from './classifiers/category';
import { detectNativeLanguage, stripHtml } from './classifiers/language';

export { classifyCategory } from './classifiers/category';
export { detectNativeLanguage } from './classifiers/language';

export function classifyJob(job: RawJob, countryCode: string): ClassifiedJob {
  const descText = job.descriptionHtml ? stripHtml(job.descriptionHtml) : job.descriptionText;

  const category = classifyCategory(job.title, descText);
  const { value: requires_native_language, local_language_advantage, confidence } =
    detectNativeLanguage(job.title, job.descriptionHtml, countryCode);

  return {
    title: job.title,
    url: job.url,
    category,
    requires_native_language,
    local_language_advantage,
    confidence,
  };
}
