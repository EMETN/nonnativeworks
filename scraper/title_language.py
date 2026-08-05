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

_NON_ASCII_RE = re.compile(
    r"[äöüåéèêëàâîïôùûçñßãõøæœþðāčēģīķļņšūžąęėįųłńśźżćóășț]", re.IGNORECASE
)

_TITLE_KEYWORDS_BY_LANG: dict[str, list[str]] = {
    # ── Danish ───────────────────────────────────────────────────────────
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
    # ── Dutch ────────────────────────────────────────────────────────────
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
        "monteur",        # installer
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
        "technieker",     # technician
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
    # ── Estonian ─────────────────────────────────────────────────────────
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
    # ── Finnish ──────────────────────────────────────────────────────────
    "FI": [
        "ammattitaito",     # skill
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
    # ── French ───────────────────────────────────────────────────────────
    "FR": [
        "acheteur",        # buyer / purchaser
        "administrateur",  # director
        "alternance",      # apprenticeship / work-study program
        "amenagement",     # planning / development (accent-free "aménagement")
        "approvisionnement", # procurement / supply
        "approvisionneur", # procurement officer
        "architecte",      # architect
        "batiment",        # building / construction (accent-free "bâtiment")
        "cariste",         # forklift operator
        "concepteur",      # designer
        "conducteur",      # operator, conductor
        "conseiller",      # advisor
        "dessinateur",     # illustrator
        "developpeur",     # developer (accent-free "développeur")
        "electricien",     # electrician (accent-free "électricien")
        "electronique",    # electronics
        "embauche",        # hiring
        "environnement",   # environment
        "evaluateur",      # tester
        "gestion",         # management
        "industriel",      # industrial
        "ingénieur",       # engineer
        "juriste",         # legal counsel
        "logiciel",        # software
        "magasinier",      # warehouse clerk
        "manutentionnaire", # warehouse handler
        "menuisier",       # carpenter / joiner
        "offre",           # offer
        "ordonnanceur",    # scheduler
        "peintre",         # painter
        "planificateur",   # planner
        "plateforme",      # platform
        "plombier",        # plumber
        "produit",         # product
        "projet",          # projects
        "qualite",         # quality (accent-free "qualité")
        "recherche",       # research
        "recrutement",     # recruitment
        "reseau",          # network (accent-free "réseau")
        "responsable",     # manager / lead
        "secteur",         # sector
        "securite",        # security (accent-free "sécurité")
        "soudeur",         # welder
        "soutien",         # support
        "stagiaire",       # intern
        "superviseur",     # supervisor
        "technicien",      # technician
        "testeur",         # tester
        "thermique",       # thermal
        "vendeur",         # salesperson
    ],
    # ── German ───────────────────────────────────────────────────────────
    "DE": [
        "anforderung",  # requirement
        "architekt",  # architect
        "assistenz",  # assistant
        "ausbilder",  # instructor, trainer
        "ausbildung",  # apprenticeship / training
        "aushilfe",  # temporary worker
        "ausschreiberung",  # tender
        "auszubildender",  # trainee
        "berater",        # consultant / advisor
        "datenbank",      # database
        "digitalisierung", # digitalization
        "elektroniker",   # electrician
        "energiebranche", # energy sector
        "entwickler",     # developer
        "entwicklung",    # development
        "erfahrung",      # experience
        "fachbereich",    # department
        "fachexperte",    # subject matter expert
        "fachgutachter",  # expert / technical consultant
        "fachkraft",      # skilled worker
        "fachplaner",     # specialist planner
        "genehmigung",    # approval
        "geomatiker",     # geomatics engineer
        "glasfaser",      # fibre optic
        "informatik",     # computer science
        "infrastruktur",  # infrastructure
        "ingenieur",  # engineer
        "kauffrau",  # merchant / business person (female form)
        "kaufmann",  # merchant / business person
        "konstrukteur",  # designer / design engineer
        "koordinator",  # coordinator
        "kraftfahrer",  # driver
        "laborant",  # laboratory technician
        "landschaft",  # landscape
        "logistik",  # logistics
        "masterstudium",  # master's degree/programme
        "mechaniker",  # mechanic
        "medienbranche",  # media sector
        "mitarbeiter",  # staff
        "praktikant",  # intern
        "praktikum",  # internship
        "projekt",  # project
        "sachbearbeiter",  # clerk / officer
        "schwerpunkt",  # focus
        "spezialist",  # specialist
        "studium",  # degree programme
        "teamleiter",  # team lead
        "teamleitung",  # team leader
        "technischer",  # technical
        "verantwortung",  # responsibility
        "verkehr",  # traffic
        "verkäufer",  # salesperson
        "vertrag",  # contract
        "vertrieb",  # sales
        "werkstudent",  # working student / student employee
        "wirtschaft",  # economy
        "zeichner",  # illustrator / draftsman
    ],
    # ── Icelandic ────────────────────────────────────────────────────────
    "IS": [
        "sérfræðingur",    # specialist / expert
        "stjórnandi",      # manager
        "þróunarfulltrúi", # development representative
    ],
    # ── Latvian ──────────────────────────────────────────────────────────
    "LV": [
        "izstrādātājs",  # developer
        "konsultants",  # consultant
        "pārdevējs",  # salesperson
        "speciālists",  # specialist
        "vadītājs",  # manager
    ],
    # ── Lithuanian ───────────────────────────────────────────────────────
    "LT": [
        "kūrėjas",  # developer / creator
        "konsultantas",  # consultant
        "pardavėjas",  # salesperson
        "specialistas",  # specialist
        "vadovas",  # manager / head
    ],
    # ── Norwegian ────────────────────────────────────────────────────────
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
    # ── Polish ───────────────────────────────────────────────────────────
    "PL": [
        "brygadzista",    # foreman / shift supervisor
        "doradca",        # advisor
        "elektromonter",  # electrical installer
        "elektryk",       # electrician
        "handlowiec",     # salesperson
        "informatyk",     # IT specialist
        "inżynier",       # engineer
        "inzynier",       # engineer (accent-free "inżynier")
        "kelner",         # waiter
        "kierowca",       # driver
        "kierownictwo",   # management
        "kierownik",      # manager / head
        "konsultant",     # consultant
        "koordynator",    # coordinator
        "księgowy",       # accountant
        "ksiegowy",       # accountant (accent-free "księgowy")
        "kucharz",        # cook / chef
        "magazyn",        # warehouse
        "magazynier",     # warehouse worker
        "malarz",         # painter
        "mechanik",       # mechanic
        "monter",         # installer / assembler
        "opiekun",        # caregiver
        "opiekunka",      # caregiver (female form)
        "praktykant",     # intern
        "pracownik",      # employee / worker
        "prawnik",        # lawyer
        "programista",    # programmer
        "przedstawiciel", # representative
        "recepcjonista",  # receptionist
        "rekrutacja",     # recruitment
        "specjalista",    # specialist
        "spawacz",        # welder
        "sprzedawca",     # salesperson
        "stażysta",       # intern
        "stazysta",       # intern (accent-free "stażysta")
        "stolarz",        # carpenter
        "zaopatrzenie",   # procurement / supply
    ],
    # ── Swedish ──────────────────────────────────────────────────────────
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


# Non-ASCII city names from CITY_MAP in src/lib/ats/country-lookup.ts (the
# global gazetteer, not scoped to any particular country). Mirrors
# titleAppearsNonEnglishExcludingCityNames() in src/lib/ats/title-language.ts —
# keep both lists in sync.
_NON_ASCII_CITY_NAMES = [
    "asnières sur seine", "asunción", "bogotá", "bollnäs", "borlänge",
    "borås", "brasília", "brüttisellen", "bucurești", "bäumenheim",
    "bückeburg", "cesson-sevigné", "châtellerault", "ciudad de panamá",
    "donauwörth", "düren", "düsseldorf", "enköping", "faßberg", "flöha",
    "gdańsk", "gemünden am main", "genève", "großkrotzenburg",
    "großmehring", "gävle", "gémenos", "göteborg", "götene", "hyvinkää",
    "hämeenlinna", "ishøj", "jyväskylä", "jämsä", "järvenpää", "jönköping",
    "kankaanpää", "klaipėda", "kraków", "kruså", "köln", "københavn",
    "la ferté-saint-aubin", "lempäälä", "les sorinières", "linköping",
    "luleå", "lübeck", "malmö", "montréal", "málaga", "mäntyharju",
    "mölndal", "münchen", "norrköping", "nurmijärvi", "nyköping",
    "nürnberg", "orléans", "osnabrück", "ostrołęka", "panevėžys",
    "pieksämäki", "poznań", "pärnu", "québec", "riihimäki", "ringkøbing",
    "rīga", "saarbrücken", "saint lô", "saint-étienne", "san josé",
    "seinäjoki", "skellefteå", "sotteville-lès-rouen", "strømmen",
    "são paulo", "tromsø", "umeå", "vallensbæk", "videbæk", "västerås",
    "växjö", "vélizy-villacoublay", "województwo", "wrocław", "würzburg",
    "ylöjärvi", "zürich", "älmhult", "örebro", "örnsköldsvik", "östersund",
    "łódź", "šiauliai",
]
_CITY_NAME_RE = re.compile(
    "(" + "|".join(re.escape(c) for c in _NON_ASCII_CITY_NAMES) + ")",
    re.IGNORECASE,
)


def _title_appears_non_english_excluding_cities(title: str) -> bool:
    """Like _title_appears_non_english, but a city name alone doesn't count.

    A city name isn't a reliable enough signal to skip fetching a job's
    description entirely — e.g. "Besiktningsman VVS till Linköping" has
    "Linköping" as its only non-ASCII content, but an English title could
    just as easily be based in an accented-named city. When the ONLY
    non-English signal in a title is a city name, this returns False so the
    caller goes ahead and fetches the description — giving the real
    classifier (which strips city names too, but has full description text
    and signal-matching/tinyld available) a chance to decide properly instead
    of silently defaulting to English for lack of any fetched content.
    """
    stripped = _CITY_NAME_RE.sub(" ", title)
    return _title_appears_non_english(stripped)
