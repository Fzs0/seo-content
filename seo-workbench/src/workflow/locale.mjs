const LOCALE_PRESETS = {
  US: {
    market: "United States",
    countryCode: "US",
    googleGl: "us",
    googleHl: "en",
    language: "English",
    languageCode: "en",
    semrushDatabase: "us",
  },
  UK: {
    market: "United Kingdom",
    countryCode: "GB",
    googleGl: "uk",
    googleHl: "en",
    language: "English",
    languageCode: "en",
    semrushDatabase: "uk",
  },
  CA: {
    market: "Canada",
    countryCode: "CA",
    googleGl: "ca",
    googleHl: "en",
    language: "English",
    languageCode: "en",
    semrushDatabase: "ca",
  },
  AU: {
    market: "Australia",
    countryCode: "AU",
    googleGl: "au",
    googleHl: "en",
    language: "English",
    languageCode: "en",
    semrushDatabase: "au",
  },
  DE: {
    market: "Germany",
    countryCode: "DE",
    googleGl: "de",
    googleHl: "de",
    language: "German",
    languageCode: "de",
    semrushDatabase: "de",
  },
  FR: {
    market: "France",
    countryCode: "FR",
    googleGl: "fr",
    googleHl: "fr",
    language: "French",
    languageCode: "fr",
    semrushDatabase: "fr",
  },
  JP: {
    market: "Japan",
    countryCode: "JP",
    googleGl: "jp",
    googleHl: "ja",
    language: "Japanese",
    languageCode: "ja",
    semrushDatabase: "jp",
  },
  GLOBAL: {
    market: "Global",
    countryCode: "GLOBAL",
    googleGl: "",
    googleHl: "en",
    language: "English",
    languageCode: "en",
    semrushDatabase: "",
  },
  EU: {
    market: "European Union",
    countryCode: "EU",
    googleGl: "",
    googleHl: "",
    language: "Multilingual",
    languageCode: "multi",
    semrushDatabase: "",
  },
};

const LANGUAGE_BY_NAME = {
  english: { language: "English", languageCode: "en", googleHl: "en" },
  german: { language: "German", languageCode: "de", googleHl: "de" },
  french: { language: "French", languageCode: "fr", googleHl: "fr" },
  japanese: { language: "Japanese", languageCode: "ja", googleHl: "ja" },
  spanish: { language: "Spanish", languageCode: "es", googleHl: "es" },
  italian: { language: "Italian", languageCode: "it", googleHl: "it" },
  portuguese: { language: "Portuguese", languageCode: "pt", googleHl: "pt" },
  dutch: { language: "Dutch", languageCode: "nl", googleHl: "nl" },
  multilingual: { language: "Multilingual", languageCode: "multi", googleHl: "" },
};

function normalizeMarketToken(value = "") {
  return String(value || "")
    .trim()
    .split(/[/-]/)[0]
    .trim()
    .toUpperCase()
    .replace(/^GB$/, "UK");
}

function normalizeLanguageToken(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function localeForMarket(marketValue = "") {
  const rawMarket = String(marketValue || "").trim();
  if (!rawMarket) {
    return {
      configured: false,
      rawMarket,
      market: "",
      countryCode: "",
      googleGl: "",
      googleHl: "",
      language: "",
      languageCode: "",
      semrushDatabase: "",
      warning: "Target market is not selected. Do not run production keyword analysis or article generation.",
    };
  }

  const [countryPart = "", languagePart = ""] = rawMarket.split("/").map((part) => part.trim());
  const marketToken = normalizeMarketToken(countryPart || rawMarket);
  const preset = LOCALE_PRESETS[marketToken] || null;
  const languagePreset = LANGUAGE_BY_NAME[normalizeLanguageToken(languagePart)] || null;

  const fallbackGl = marketToken.length === 2 ? marketToken.toLowerCase() : "";
  const fallbackLanguage = languagePart || preset?.language || "";
  const fallbackLanguagePreset = LANGUAGE_BY_NAME[normalizeLanguageToken(fallbackLanguage)] || {};

  return {
    configured: true,
    rawMarket,
    market: preset?.market || countryPart || rawMarket,
    countryCode: preset?.countryCode || marketToken,
    googleGl: preset?.googleGl ?? fallbackGl,
    googleHl: languagePreset?.googleHl ?? preset?.googleHl ?? fallbackLanguagePreset.googleHl ?? "",
    language: languagePreset?.language || preset?.language || fallbackLanguage || "",
    languageCode: languagePreset?.languageCode || preset?.languageCode || fallbackLanguagePreset.languageCode || "",
    semrushDatabase: preset ? preset.semrushDatabase : fallbackGl,
    warning:
      marketToken === "EU"
        ? "EU / Multilingual is not one Google SERP. Split keyword exports and generation by country-language before production."
        : "",
  };
}

export function localeForProject(project = {}) {
  return localeForMarket(project.market || "");
}

export function localeInstruction(locale = {}) {
  if (!locale.configured) {
    return [
      "Locale status: NOT CONFIGURED.",
      "Do not claim local SERP validation.",
      "Ask for target country/language before production publishing.",
    ].join("\n");
  }

  return [
    `Target market: ${locale.market} (${locale.countryCode})`,
    `Content language: ${locale.language || "Not specified"} (${locale.languageCode || "unknown"})`,
    `Google SERP locale for validation: gl=${locale.googleGl || "not-set"}, hl=${locale.googleHl || "not-set"}`,
    `Semrush database should match: ${locale.semrushDatabase || "not-set / split manually"}`,
    locale.warning ? `Locale warning: ${locale.warning}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
