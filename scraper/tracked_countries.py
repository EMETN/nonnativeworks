"""
Tracked countries — shared by all Python scrapers.

Keep in sync with src/lib/tracked-countries.ts.
"""

TRACKED_CODES = {"FI", "SE", "NO", "DK", "IS", "NL", "DE", "EE", "LV", "LT", "PL", "FR", "BE", "LU", "CH"}

TRACKED_NAMES = {
    "finland", "sweden", "norway", "denmark", "iceland",
    "netherlands", "germany", "estonia", "latvia", "lithuania",
    "poland", "france", "belgium", "luxembourg", "switzerland",
}

_UNTRACKED_NAMES = {
    "afghanistan", "albania", "algeria", "andorra", "angola", "argentina",
    "armenia", "australia", "austria", "azerbaijan", "bahrain", "bangladesh",
    "barbados", "belarus", "belize", "benin", "bhutan", "bolivia",
    "bosnia", "botswana", "brazil", "brunei", "bulgaria", "burkina",
    "burundi", "cambodia", "cameroon", "canada", "chad", "chile", "china",
    "colombia", "congo", "costa rica", "croatia", "cuba", "cyprus",
    "czech", "djibouti", "dominican", "ecuador", "egypt", "el salvador",
    "eritrea", "ethiopia", "fiji", "gabon", "gambia", "georgia",
    "ghana", "greece", "guatemala", "guinea", "guyana", "haiti", "honduras",
    "hong kong", "hungary", "india", "indonesia", "iran", "iraq", "ireland",
    "israel", "italy", "ivory coast", "jamaica", "japan", "jordan",
    "kazakhstan", "kenya", "korea", "kosovo", "kuwait", "kyrgyzstan",
    "laos", "lebanon", "liberia", "libya", "liechtenstein",
    "macedonia", "madagascar", "malawi", "malaysia", "maldives", "mali",
    "malta", "mauritania", "mauritius", "mexico", "moldova", "monaco",
    "mongolia", "montenegro", "morocco", "mozambique", "myanmar", "namibia",
    "nepal", "new zealand", "nicaragua", "niger", "nigeria", "oman",
    "pakistan", "palestine", "panama", "papua", "paraguay", "peru",
    "philippines", "portugal", "qatar", "romania", "russia",
    "rwanda", "saudi arabia", "senegal", "serbia", "sierra leone",
    "singapore", "slovakia", "slovenia", "somalia", "south africa", "spain",
    "sri lanka", "sudan", "suriname", "syria", "taiwan",
    "tajikistan", "tanzania", "thailand", "togo", "trinidad", "tunisia",
    "turkey", "turkmenistan", "uganda", "ukraine", "united arab emirates",
    "united kingdom", "united states", "uruguay", "uzbekistan", "venezuela",
    "vietnam", "yemen", "zambia", "zimbabwe",
    "u.a.e.", "uae", "uk", "usa", "u.s.a.", "u.k.",
}


def is_tracked_location(location: str | None) -> bool:
    """Check if a location string is likely in a tracked country.

    Returns True if the location mentions a tracked country name, or if no
    country can be identified (city-only — let the TypeScript side decide).
    Returns False only when a recognisable untracked country is found.
    """
    if not location:
        return False
    loc = location.lower()
    if any(c in loc for c in TRACKED_NAMES):
        return True
    if any(c in loc for c in _UNTRACKED_NAMES):
        return False
    # No country recognised (city-only like "Berlin") — allow enrichment
    return True
