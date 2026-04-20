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
        "ammattitaitoinen", # skilled
        "ammattitaitoisia", # skilled (plural)
        "arkkitehti",       # architect
        "asiakas",          # customer
        "asennus",          # installation
        "asentaja",         # installer
        "asentajia",        # installers
        "asiantuntija",     # specialist / expert
        "finanssiala",      # finance sector
        "hakemus",          # application (open application postings)
        "hankinta",         # procurement
        "hitsaaja",         # welder
        "hoitaja",          # caregiver / nurse
        "hovimestari",      # headwaiter
        "huolto",           # maintenance
        "johtaja",          # manager / director
        "kehitys",          # development
        "kokki",            # chef
        "kokoonpanija",     # assembler
        "koneistaja",       # machinist
        "konsultti",        # consultant
        "koordinaattori",   # coordinator
        "kuljettaja",       # driver
        "liiketoiminta",    # business
        "mekaanikko",       # mechanic
        "myynti",           # sales
        "osaaja",           # specialist / expert
        "palvelu",          # service
        "rakennus",         # building
        "rakentaja",        # builder
        "ravintola",        # restaurant
        "rekrytointi",      # recruitment
        "suunnittelija",    # designer / planner
        "tarjoilija",       # waiter
        "testaaja",         # tester
        "tiimi",            # team
        "timpuri",          # carpenter
        "toimiala",         # industry
        "tuotanto",         # production
        "tuotannon",        # production (genitive)
        "varasto",          # warehouse
        "vastaanotto",      # reception / front desk
        "vuoromestari",     # shift supervisor
    ],
    "SE": [
        "ansvarig",       # responsible / manager
        "arkitekt",       # architect
        "ekonom",         # economist
        "förvaltare",     # administrator / manager
        "handläggare",    # administrator / officer
        "informatiker",   # computer scientist
        "konsult",        # consultant
        "projektledare",  # project manager
        "rådgivare",      # advisor
        "samordnare",     # coordinator
        "säljare",        # salesperson
        "tekniker",       # technician
        "teknisk",        # technical
        "testare",        # tester
        "utvecklare",     # developer
        "verksamhet",     # operations / business
    ],
    "NO": [
        "avdelingsleder", # department manager
        "fagansvarlig",   # subject-matter responsible
        "karriere",       # career
        "konsulent",      # consultant
        "koordinator",    # coordinator
        "rådgiver",       # advisor
        "saksbehandler",  # case officer
        "selger",         # salesperson
        "utvikler",       # developer

    ],
    "DK": [
        "afdelingsleder", # department manager
        "arkitekt",       # architect
        "karriere",       # career
        "konsulent",      # consultant
        "offentlige",     # public
        "rådgiver",       # advisor
        "sagsbehandler",  # case officer
        "sælger",         # salesperson
        "udvikler",       # developer
        
        
    ],
    "DE": [
        "anforderung",    # requirement
        "architekt",      # architect
        "assistenz",      # assistant
        "ausbilder",      # instructor, trainer
        "ausbildung",     # apprenticeship / training
        "ausschreiberung", # tender
        "auszubildender",  # trainee
        "berater",        # consultant / advisor
        "datenbank",      # database
        "digitalisierung", # digitalization
        "elektroniker",   # electrician
        "energiebranche", # energy sector
        "entwickler",     # developer
        "entwicklung",    # development
        "erfahrung",      # experience
        "fachexperte",    # subject matter expert
        "fachkraft",      # skilled worker
        "glasfaser",      # fibre optic
        "informatiker",   # computer scientist
        "infrastruktur",  # infrastructure
        "kauffrau",       # merchant / business person (female form)
        "kaufmann",       # merchant / business person
        "koordinator",    # coordinator
        "kraftfahrer",    # driver
        "laborant",       # laboratory technician
        "logistik",       # logistics
        "masterstudium",  # master's degree/programme
        "mechaniker",     # mechanic
        "medienbranche",  # media sector
        "praktikant",     # intern
        "praktikum",      # internship
        "projekt",        # project
        "sachbearbeiter", # clerk / officer
        "schwerpunkt",    # focus
        "spezialist",     # specialist
        "studium",        # degree programme
        "teamleiter",     # team lead
        "technischer",    # technical
        "technologie",    # technology
        "verantwortung",  # responsibility
        "verkehr",        # traffic
        "vertrieb",       # sales
        "verkäufer",      # salesperson
        "werkstudent",    # working student / student employee
        "wirtschaft",     # economy
    ],
    "NL": [
        "adviseur",       # advisor
        "afstuderen",     # graduate
        "automatiseerder", # automater
        "automatisering", # automation
        "beheerder",      # administrator
        "coördinator",    # coordinator
        "defensie",       # defence
        "gezocht",        # wanted
        "informatie",     # information
        "innovatie",      # innovation
        "medewerker",     # employee / associate
        "medior",         # mid-level
        "netwerk",        # network
        "ontwikkelaar",   # developer
        "openbaar",       # public
        "overheid",       # government
        "publieke",       # public
        "spoordomein",    # railway network
        "stagiair",       # intern
        "technisch",      # technical
        "telecommunicatie", # telecommunications
        "transitie",      # transition
        "uitvoerder",     # executor / operative
        "veiligheid",     # safety
        "verkoper",       # salesperson
        "verzekeringen",  # insurance
        "virtualisatie",  # virtualization
    ],
    "EE": [
        "arendaja",       # developer
        "juht",           # manager / head
        "müügijuht",      # sales manager
        "nõustaja",       # advisor
        "spetsialist",    # specialist
    ],
    "LV": [
        "izstrādātājs",   # developer
        "konsultants",    # consultant
        "pārdevējs",      # salesperson
        "speciālists",    # specialist
        "vadītājs",       # manager
    ],
    "LT": [
        "kūrėjas",        # developer / creator
        "konsultantas",   # consultant
        "pardavėjas",     # salesperson
        "specialistas",   # specialist
        "vadovas",        # manager / head
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
