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
        "tutkija",          # researcher
        "valvoja",          # supervisor
        "varasto",          # warehouse
        "vastaanotto",      # reception / front desk
        "vuoromestari",     # shift supervisor
    ],
    "SE": [
        "ansvarig",       # responsible / manager
        "arkitekt",       # architect
        "ekonom",         # economist
        "erfaren",        # experienced
        "förvaltare",     # administrator / manager
        "gruppchef",      # group leader
        "handläggare",    # administrator / officer
        "informatiker",   # computer scientist
        "konsult",        # consultant
        "mekaniker",      # mechanic
        "projektledare",  # project manager
        "rådgivare",      # advisor
        "samordnare",     # coordinator
        "säljare",        # salesperson
        "tekniker",       # technician
        "teknisk",        # technical
        "testare",        # tester
        "uppdragsledare", # project manager
        "utredare",       # investigator
        "utvecklare",     # developer
        "validering",     # validation
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
        "afvanding",      # drainage
        "arkitekt",       # architect
        "boreformand",    # drilling foreman
        "fagchef",        # head of department
        "fagspecialist",  # subject specialist
        "hjælper",        # assistant
        "karriere",       # career
        "konsulent",      # consultant
        "offentlige",     # public
        "projectchef",    # project manager
        "projectleder",   # project manager
        "rådgiver",       # advisor
        "sagsbehandler",  # case officer
        "sælger",         # salesperson
        "statiker",       # structural engineer
        "tilbudspartner", # offer partner
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
        "fachgutachter",  # expert / technical consultant
        "fachkraft",      # skilled worker
        "fachplaner",     # specialist planner
        "genehmigung",    # approval
        "geomatiker",     # geomatics engineer
        "glasfaser",      # fibre optic
        "informatiker",   # computer scientist
        "infrastruktur",  # infrastructure
        "ingenieur",      # engineer
        "kauffrau",       # merchant / business person (female form)
        "kaufmann",       # merchant / business person
        "konstrukteur",   # designer / design engineer
        "koordinator",    # coordinator
        "kraftfahrer",    # driver
        "laborant",       # laboratory technician
        "landschaft",     # landscape
        "logistik",       # logistics
        "masterstudium",  # master's degree/programme
        "mechaniker",     # mechanic
        "medienbranche",  # media sector
        "mitarbeiter",    # staff
        "praktikant",     # intern
        "praktikum",      # internship
        "projekt",        # project
        "sachbearbeiter", # clerk / officer
        "schwerpunkt",    # focus
        "spezialist",     # specialist
        "studium",        # degree programme
        "teamleiter",     # team lead
        "teamleitung",    # team leader
        "technischer",    # technical
        "verantwortung",  # responsibility
        "verkehr",        # traffic
        "verkäufer",      # salesperson
        "vertrag",        # contract
        "vertrieb",       # sales
        "werkstudent",    # working student / student employee
        "wirtschaft",     # economy
        "zeichner",       # illustrator / draftsman
    ],
    "NL": [
        "adviseur",       # advisor
        "afstudeer",      # graduate
        "afstuderen",     # graduate
        "automatiseerder", # automater
        "automatisering", # automation
        "beheerder",      # administrator
        "bouwkundig",     # architectural
        "constructeur",   # constructor / manufacturer
        "coördinator",    # coordinator
        "defensie",       # defence
        "gezocht",        # wanted
        "informatie",     # information
        "innovatie",      # innovation
        "medewerker",     # employee / associate
        "netwerk",        # network
        "omgeving",       # environment
        "ontwerp",        # design
        "ontwikkelaar",   # developer
        "openbaar",       # public
        "overheid",       # government
        "projectleider",  # project manager
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
        "voorbereider",   # planner
        "voorziening",    # facility
    ],
    "EE": [
        "arendaja",       # developer
        "insener",       # engineer
        "juht",           # manager / head
        "konstruktorit",  # design engineer
        "modelleerija",   # modeler
        "müügijuht",      # sales manager
        "nõustaja",       # advisor
        "projekteerija",  # designer
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
