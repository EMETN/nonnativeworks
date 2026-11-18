import { expect, test } from 'vitest';
import type { ReviewData, ReviewJob } from './admin-schemas';
import { buildUploadPayload } from './admin-upload-payload';

const job = (extra: Partial<ReviewJob> = {}): ReviewJob => ({
    title: 'Engineer',
    url: 'https://a.example/1',
    city: ['Helsinki'],
    work_model: 'remote',
    category: 'engineering-it',
    requires_native_language: false,
    local_language_advantage: false,
    requiredLanguages: [],
    preferredLanguages: [],
    ...extra,
});

const data = (...jobs: ReviewJob[]): ReviewData => ({
    ats: 'greenhouse',
    company_name: '  Acme  ',
    career_page_url: 'https://a.example',
    skipped_unknown_location: 0,
    skipped_untracked_country: 0,
    is_english_company: true,
    countries: [
        { country: 'europe', country_name: 'Europe', country_code: 'EU', jobs },
    ],
});

test('forwards unplaced_location when present', () => {
    const [entry] = buildUploadPayload(
        data(job({ unplaced_location: 'Remote - Region 4' })),
    );
    expect(entry.positions[0].unplaced_location).toBe('Remote - Region 4');
});

test('omits unplaced_location when absent', () => {
    const [entry] = buildUploadPayload(data(job()));
    expect(entry.positions[0]).not.toHaveProperty('unplaced_location');
});

test('maps the company entry and position fields', () => {
    const [entry] = buildUploadPayload(
        data(job({ requiredLanguages: ['fi'], preferredLanguages: ['sv'] })),
    );
    expect(entry).toEqual({
        company_name: 'Acme',
        country: 'europe',
        country_name: 'Europe',
        country_code: 'EU',
        career_page_url: 'https://a.example',
        is_english_company: true,
        positions: [
            {
                country_code: 'EU',
                title: 'Engineer',
                url: 'https://a.example/1',
                city: ['Helsinki'],
                work_model: 'remote',
                requires_native_language: false,
                local_language_advantage: false,
                required_languages: ['fi'],
                preferred_languages: ['sv'],
                category: 'engineering-it',
            },
        ],
    });
});
