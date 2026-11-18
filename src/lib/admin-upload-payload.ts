import type { ReviewData } from './admin-schemas';

export function buildUploadPayload(data: ReviewData) {
    return data.countries.map((group) => ({
        company_name: data.company_name.trim(),
        country: group.country,
        country_name: group.country_name,
        country_code: group.country_code,
        career_page_url: data.career_page_url,
        is_english_company: data.is_english_company,
        positions: group.jobs.map((job) => ({
            country_code: group.country_code,
            title: job.title,
            url: job.url,
            city: job.city,
            work_model: job.work_model,
            ...(job.unplaced_location && {
                unplaced_location: job.unplaced_location,
            }),
            requires_native_language: job.requires_native_language,
            local_language_advantage: job.local_language_advantage,
            required_languages: job.requiredLanguages,
            preferred_languages: job.preferredLanguages,
            category: job.category,
        })),
    }));
}
