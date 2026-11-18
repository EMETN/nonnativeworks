import {
    EUROPE,
    extractWorkModelFromLocation,
    lookupCountryFromLocation,
    stripWorkModel,
    type CountryInfo,
} from './country-lookup';
import type { WorkModel } from '../database.types';
import { TRACKED_COUNTRY_CODES } from '../tracked-countries';
import type { RawJob } from './types';

export type { WorkModel };

export interface Placement {
    countries: CountryInfo[];
    workModel: WorkModel | null;
    unplacedLocation?: string;
}

const PLACELESS_RE =
    /^(?:remote|fully remote|worldwide|global|anywhere|work from home|wfh|home office)$/i;

function isPlaceless(location: string): boolean {
    return PLACELESS_RE.test(stripWorkModel(location).replace(/\s+/g, ' '));
}

export function placeJob(
    location: string,
    atsWorkModel: WorkModel | undefined,
    companyFallback: CountryInfo | null,
): Placement {
    const placeless = isPlaceless(location);
    const locationModel = extractWorkModelFromLocation(location);
    const ownModel =
        atsWorkModel ?? locationModel ?? (placeless ? 'remote' : null);

    const countries = lookupCountryFromLocation(location);
    if (countries.length > 0) {
        const europeOnly =
            countries.length === 1 && countries[0].code === EUROPE.code;
        return { countries, workModel: europeOnly ? 'remote' : ownModel };
    }
    if (companyFallback) {
        return { countries: [companyFallback], workModel: ownModel };
    }

    const remote = atsWorkModel === 'remote' || locationModel === 'remote';
    if (placeless || (remote && !location.trim())) {
        return { countries: [EUROPE], workModel: 'remote' };
    }
    if (remote) {
        return {
            countries: [EUROPE],
            workModel: 'remote',
            unplacedLocation: location,
        };
    }
    return { countries: [], workModel: ownModel };
}

export function placeRawJob(
    job: RawJob,
    companyFallback: CountryInfo | null,
): Placement {
    return placeJob(
        job.country_code ?? job.location ?? '',
        job.work_model ??
            extractWorkModelFromLocation(job.location ?? '') ??
            undefined,
        companyFallback,
    );
}

function landsInTrackedCountry(placement: Placement): boolean {
    return placement.countries.some((c) => TRACKED_COUNTRY_CODES.has(c.code));
}

export function isPlacedInTrackedCountry(
    job: RawJob,
    companyFallback: CountryInfo | null,
): boolean {
    return landsInTrackedCountry(placeRawJob(job, companyFallback));
}

export function isLocationPlacedInTrackedCountry(
    location: string,
    companyFallback: CountryInfo | null,
): boolean {
    return landsInTrackedCountry(
        placeJob(
            location,
            extractWorkModelFromLocation(location) ?? undefined,
            companyFallback,
        ),
    );
}
