/**
 * All user-facing copy in one place. Category labels are not duplicated here:
 * they come from `CATEGORY_LABELS_SR` in the contracts module.
 */
export const UI_SR = {
  appTitle: "Zanimljiva Geografija",
  navLabel: "Glavna navigacija",
  startTitle: "Nova igra",
  startIntro:
    "Pet rundi, pet slova. Za svako slovo upiši po jedan pojam u osam kategorija. " +
    "Posle svake runde AI proverava odgovore i pokazuje primere za ono što si propustio.",
  startRules: "Priznat odgovor nosi 10 poena. Imaš 3 hinta po igri.",
  newGame: "Nova igra",
  countdownTitle: "Runda počinje",
  answeringTitle: "Upiši pojmove",
  round: "Runda",
  of: "od",
  letterIs: "Slovo",
  timeLeft: "Preostalo vreme",
  finish: "Završio sam",
  checking: "Proveravamo odgovore…",
  roundResultsTitle: "Rezultat runde",
  gameResultsTitle: "Kraj igre",
  nextRound: "Sledeća runda",
  showFinal: "Pogledaj ukupan rezultat",
  total: "Ukupno",
  points: "Poeni",
  pointsFor: "poena",
  totalPoints: "Ukupno poena",
  valid: "priznato",
  invalid: "nije priznato",
  noAnswer: "bez odgovora",
  example: "primer",
  noKnownTerm: "nema poznatog pojma na ovo slovo",
  unverified: "nije provereno",
  unverifiedTemporary:
    "AI provera trenutno nije dostupna. Runda je bodovana samo po početnom slovu.",
  unverifiedQuota:
    "Dnevni limit AI provera je potrošen. Igra radi dalje, a odgovori se boduju samo po početnom slovu do sutra oko 9h.",
  unverifiedNotConfigured:
    "AI provera nije podešena. Runda je bodovana samo po početnom slovu.",
  examplesUnavailable: "Primeri trenutno nisu dostupni.",
  recheck: "Proveri ponovo",
  rechecking: "Proveravamo ponovo…",
  gameHasUnverified: "Neke runde nisu proverene AI-jem.",
  hints: "Hintovi",
  hintAsk: "Hint",
  hintLoading: "Tražimo hint…",
  hintFailed: "Hint trenutno nije dostupan. Kredit nije potrošen.",
  hintQuota: "Dnevni limit za hintove je potrošen. Kredit nije potrošen.",
  hintNoTerm: "Za ovo slovo ne postoji poznat pojam u ovoj kategoriji. Kredit nije potrošen.",
  hintsUnavailable: "Hintovi nisu dostupni bez AI podešavanja.",
  theme: "Tema",
  themes: {
    system: "Kao sistem",
    light: "Svetla",
    dark: "Tamna",
  },
} as const;
