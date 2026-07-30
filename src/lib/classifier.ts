import type { RawJob, ClassifiedJob } from './ats/types';
import { getCityNames } from './ats/country-lookup';
import { classifyCategoryVerbose } from './classifiers/category';
import { detectNativeLanguage, stripHtml } from './classifiers/language';
import type { SignalEntry } from './classifiers/language';

export type { SignalEntry } from './classifiers/language';

export type ClassificationSignals = {
    categorySignal?: string;
    categorySource: 'title' | 'description' | 'jobFunction' | 'default';
    languageSignals: SignalEntry[];
};

export { classifyCategory } from './classifiers/category';
export { detectNativeLanguage } from './classifiers/language';

let _properNounPattern: RegExp | null = null;

function buildPattern(names: string[]): RegExp | null {
    if (names.length === 0) return null;
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    escaped.sort((a, b) => b.length - a.length);
    return new RegExp(escaped.join('|'), 'gi');
}

function getProperNounPattern(companyName?: string): RegExp | null {
    if (!companyName) {
        if (!_properNounPattern) {
            const cityNames = getCityNames().filter((n) =>
                /[^\x00-\x7F]/.test(n),
            );
            _properNounPattern = buildPattern(cityNames);
        }
        return _properNounPattern;
    }
    const cityNames = getCityNames().filter((n) => /[^\x00-\x7F]/.test(n));
    return buildPattern([companyName, ...cityNames]);
}

function stripProperNouns(text: string, companyName?: string): string {
    const re = getProperNounPattern(companyName);
    if (!re) return text;
    re.lastIndex = 0;
    return text.replace(re, ' ');
}

export function classifyJobVerbose(
    job: RawJob,
    countryCode: string,
    companyName?: string,
): { classified: ClassifiedJob; signals: ClassificationSignals } {
    // Always run stripHtml — it's safe on plain text and ensures HTML in descriptionText
    // (e.g. from company APIs that return "clean" but still-marked-up content) doesn't
    // interfere with tinyld language detection or signal phrase matching.
    const rawDesc = job.descriptionHtml ?? job.descriptionText;
    const descText = rawDesc ? stripHtml(rawDesc) : undefined;
    const cleanDesc = descText
        ? stripProperNouns(descText, companyName)
        : undefined;

    const classifierTitle = job.classifierTitle ?? job.title;
    const cleanTitle = stripProperNouns(classifierTitle, companyName);
    const { category, matchedKeyword, source } = classifyCategoryVerbose(
        classifierTitle,
        descText,
        job.jobFunction,
    );
    const langResult = detectNativeLanguage(cleanTitle, cleanDesc, countryCode);

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

export function classifyJob(
    job: RawJob,
    countryCode: string,
    companyName?: string,
): ClassifiedJob {
    return classifyJobVerbose(job, countryCode, companyName).classified;
}
