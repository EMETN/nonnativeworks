"""
Job title language detection.

Mirrors the logic in src/lib/ats/title-language.ts.
Used to skip description enrichment for titles that already signal a
native-language requirement without needing to fetch the job page.

Only add words that would never appear in an English job title.
Words with non-ASCII chars (ä, ö, …) are already caught by _NON_ASCII_RE
but may be listed here for documentation. Keep in sync with the TS file.
"""

import re

_NON_ASCII_RE = re.compile(r"[äöüåéèêëàâîïôùûçñßãõøæœ]", re.IGNORECASE)

_TITLE_KEYWORDS_BY_LANG: dict[str, list[str]] = {
    "FI": [
        "johtaja",        # manager / director
        "asiantuntija",   # specialist / expert
        "myynti",         # sales
        "kehitys",        # development
        "suunnittelija",  # designer / planner
        "hankinta",       # procurement
        "rekrytointi",    # recruitment
        "liiketoiminta",  # business
        "koordinaattori", # coordinator
        "konsultti",      # consultant
        "palvelu",        # service
        "tiimi",          # team
        "ravintola",      # restaurant
        "vastaanotto",    # reception / front desk
        "vuoromestari",   # shift supervisor
        "hakemus",        # application (open application postings)
        "hovimestari",    # headwaiter
    ],
    "SE": [
        "säljare",        # salesperson
        "ansvarig",       # responsible / manager
        "handläggare",    # administrator / officer
        "utvecklare",     # developer
        "rådgivare",      # advisor
        "förvaltare",     # administrator / manager
        "samordnare",     # coordinator
        "verksamhet",     # operations / business
    ],
    "NO": [
        "selger",         # salesperson
        "rådgiver",       # advisor
        "utvikler",       # developer
        "koordinator",    # coordinator
        "saksbehandler",  # case officer
        "fagansvarlig",   # subject-matter responsible
        "avdelingsleder", # department manager
    ],
    "DK": [
        "sælger",         # salesperson
        "rådgiver",       # advisor
        "udvikler",       # developer
        "sagsbehandler",  # case officer
        "afdelingsleder", # department manager
    ],
    "DE": [
        "vertrieb",       # sales
        "sachbearbeiter", # clerk / officer
        "berater",        # consultant / advisor
        "entwickler",     # developer
        "fachkraft",      # skilled worker
        "ausbildung",     # apprenticeship / training
        "kaufmann",       # merchant / business person
        "kauffrau",       # merchant / business person (female form)
        "verkäufer",      # salesperson
    ],
    "NL": [
        "verkoper",       # salesperson
        "adviseur",       # advisor
        "medewerker",     # employee / associate
        "ontwikkelaar",   # developer
        "coördinator",    # coordinator
        "beheerder",      # administrator
        "uitvoerder",     # executor / operative
    ],
    "EE": [
        "juht",           # manager / head
        "spetsialist",    # specialist
        "müügijuht",      # sales manager
        "arendaja",       # developer
        "nõustaja",       # advisor
    ],
    "LV": [
        "vadītājs",       # manager
        "speciālists",    # specialist
        "pārdevējs",      # salesperson
        "izstrādātājs",   # developer
        "konsultants",    # consultant
    ],
    "LT": [
        "vadovas",        # manager / head
        "specialistas",   # specialist
        "pardavėjas",     # salesperson
        "kūrėjas",        # developer / creator
        "konsultantas",   # consultant
    ],
    "IS": [
        "sérfræðingur",    # specialist / expert
        "stjórnandi",      # manager
        "þróunarfulltrúi", # development representative
    ],
}

_all_keywords = [kw for kws in _TITLE_KEYWORDS_BY_LANG.values() for kw in kws]
# No word boundaries — pure substring match so keywords are caught anywhere
# inside a compound word (e.g. "johtaja" matches "myyntijohtaja" and
# "kehitysjohtaja"; "myynti" matches "myyntiassistentti").
# False positives are negligible: these roots never appear inside English words.
_TITLE_KEYWORDS_RE = re.compile(
    "(" + "|".join(re.escape(k) for k in _all_keywords) + ")",
    re.IGNORECASE,
)


def _title_appears_non_english(title: str) -> bool:
    return bool(_NON_ASCII_RE.search(title) or _TITLE_KEYWORDS_RE.search(title))
