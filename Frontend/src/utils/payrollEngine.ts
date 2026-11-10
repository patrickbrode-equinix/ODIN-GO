/* ================================================ */
/* Payroll estimate (Germany, Hessen)               */
/* Approximation of the monthly gross-to-net        */
/* statement. Runs in the browser only: the salary  */
/* data never reaches the server unencrypted.       */
/*                                                  */
/* Values: income tax tariff / allowances 2026,     */
/* social security 2026 (also used for later years  */
/* until they are updated), church tax Hessen 9 %.  */
/* ================================================ */

export type FederalState = "HE" | "BY";
export type Confession = "none" | "ev" | "rk";
export type HealthInsurance = "statutory" | "private";

export interface ExtraItem {
  id: string;
  label: string;
  /** monthly amount in EUR (positive) */
  amount: number;
  /** "gross": added to the gross pay, "net": paid out / deducted after tax */
  kind: "gross-taxable" | "gross-free" | "net-add" | "net-deduct";
}

export interface PayrollProfile {
  version: 1;
  /** federal state: decides the public holidays and the church tax rate (Hessen 9 %, Bayern 8 %) */
  state: FederalState;
  /** yearly gross salary in EUR */
  annualGross: number;
  /** contractual monthly hours the hourly basic wage is derived from (default 174) */
  monthlyHours: number;
  taxClass: 1 | 2 | 3 | 4 | 5 | 6;
  /** child allowance counter ("Zähler"): 0, 0.5, 1, 1.5, 2 ... */
  childAllowance: number;
  /** children for the care insurance reduction (under 25) */
  childrenUnder25: number;
  birthYear: number;
  confession: Confession;
  healthInsurance: HealthInsurance;
  /** statutory: individual additional contribution in % (e.g. 2.9) */
  additionalContributionPercent: number;
  /** private: monthly employee share (premium minus employer subsidy) in EUR */
  privateMonthlyPremium: number;
  pensionInsured: boolean;
  unemploymentInsured: boolean;
  /** yearly tax allowance / addition from the tax card (Freibetrag positive, Hinzurechnung negative) */
  yearlyTaxAllowance: number;
  /** supplement rates agreed in the contract, % of the basic hourly wage */
  nightRatePercent: number;
  sundayRatePercent: number;
  holidayRatePercent: number;
  /** tax-free limits in % of the basic hourly wage (defaults per the company rule: 25 / 40 / 100) */
  nightFreePercent: number;
  sundayFreePercent: number;
  holidayFreePercent: number;
  extras: ExtraItem[];
}

export interface MonthHours {
  nightHours: number;
  sundayHours: number;
  holidayHours: number;
}

export const DEFAULT_PROFILE: PayrollProfile = {
  version: 1,
  state: "HE",
  annualGross: 0,
  monthlyHours: 174,
  taxClass: 1,
  childAllowance: 0,
  childrenUnder25: 0,
  birthYear: 1990,
  confession: "none",
  healthInsurance: "statutory",
  additionalContributionPercent: 2.9,
  privateMonthlyPremium: 0,
  pensionInsured: true,
  unemploymentInsured: true,
  yearlyTaxAllowance: 0,
  nightRatePercent: 25,
  sundayRatePercent: 40,
  holidayRatePercent: 100,
  nightFreePercent: 25,
  sundayFreePercent: 40,
  holidayFreePercent: 100,
  extras: [],
};

/* ---------- parameters 2026 ---------- */
export const PARAMS = {
  basicAllowance: 12348,
  employeeLumpSum: 1230,
  specialExpensesLumpSum: 36,
  singleParentRelief: 4260,
  singleParentReliefPerExtraChild: 240,
  childAllowancePerFull: 9756, // both parents; a counter of 1.0
  soliThresholdSingle: 20350,
  soliThresholdSplit: 40700,
  soliRate: 0.055,
  churchTaxRateHessen: 0.09,
  churchTaxRateBayern: 0.08,
  contributionCeilingPensionMonthly: 8450,
  contributionCeilingHealthMonthly: 5812.5,
  pensionEmployee: 0.093,
  unemploymentEmployee: 0.013,
  healthGeneralEmployee: 0.073,
  careEmployee: 0.018,
  careChildlessSurcharge: 0.006,
  careChildReductionPerChild: 0.0025,
  maxHourlyWageTaxFreeSupplement: 50,
  maxHourlyWageSocialFreeSupplement: 25,
} as const;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const floorEuro = (value: number) => Math.floor(value);

/** Income tax tariff (§ 32a EStG, 2026) for a taxable income in EUR (single assessment). */
export function incomeTax(zvE: number): number {
  const x = floorEuro(Math.max(0, zvE));
  if (x <= PARAMS.basicAllowance) return 0;
  if (x <= 17799) {
    const y = (x - PARAMS.basicAllowance) / 10000;
    return floorEuro((914.51 * y + 1400) * y);
  }
  if (x <= 69878) {
    const z = (x - 17799) / 10000;
    return floorEuro((173.1 * z + 2397) * z + 1034.87);
  }
  if (x <= 277825) return floorEuro(0.42 * x - 11135.63);
  return floorEuro(0.45 * x - 19470.38);
}

/** Yearly income tax by tax class for the taxable income (after all allowances). */
export function yearlyIncomeTaxByClass(zvE: number, taxClass: PayrollProfile["taxClass"]): number {
  const x = Math.max(0, zvE);
  if (taxClass === 3) return 2 * incomeTax(x / 2);
  if (taxClass === 5 || taxClass === 6) {
    // Special table of classes 5 / 6 (no basic allowance): 2 x (tariff(1.25 x) - tariff(0.75 x)), at least 14 %; above W2 only
    // the marginal rates 42 % / 45 % are added. Simplified version of the official program flow chart.
    const W2 = 34939;
    const W3 = 222260;
    const table = (value: number) => Math.max(2 * (incomeTax(1.25 * value) - incomeTax(0.75 * value)), 0.14 * value);
    if (x <= W2) return table(x);
    return table(W2) + (Math.min(x, W3) - W2) * 0.42 + Math.max(x - W3, 0) * 0.45;
  }
  return incomeTax(x);
}

export function soli(yearlyTax: number, taxClass: PayrollProfile["taxClass"]): number {
  const threshold = taxClass === 3 ? PARAMS.soliThresholdSplit : PARAMS.soliThresholdSingle;
  if (yearlyTax <= threshold) return 0;
  return Math.min(PARAMS.soliRate * yearlyTax, 0.119 * (yearlyTax - threshold));
}

export interface SupplementLine {
  key: "night" | "sunday" | "holiday";
  label: string;
  hours: number;
  ratePercent: number;
  freePercent: number;
  total: number;
  taxFree: number;
  taxable: number;
  socialFree: number;
}

export interface PayrollResult {
  baseMonthly: number;
  hourlyWage: number;
  supplements: SupplementLine[];
  supplementsTotal: number;
  supplementsTaxFree: number;
  extrasGrossTaxable: number;
  extrasGrossFree: number;
  grossTotal: number;
  taxableGross: number;
  socialGross: number;
  incomeTax: number;
  soli: number;
  churchTax: number;
  taxesTotal: number;
  health: number;
  care: number;
  pension: number;
  unemployment: number;
  socialTotal: number;
  rates: { health: number; care: number; pension: number; unemployment: number };
  netExtrasAdd: number;
  netExtrasDeduct: number;
  netPay: number;
  effectiveDeductionRate: number;
  yearlyTaxableForTax: number;
}

export function validateProfile(profile: PayrollProfile): string[] {
  const errors: string[] = [];
  if (!(profile.annualGross > 0)) errors.push("Das Jahresbruttogehalt fehlt.");
  if (!(profile.monthlyHours > 0 && profile.monthlyHours <= 250)) errors.push("Die Monatsstunden müssen zwischen 1 und 250 liegen.");
  if (![1, 2, 3, 4, 5, 6].includes(profile.taxClass)) errors.push("Die Steuerklasse fehlt.");
  if (!(profile.birthYear >= 1940 && profile.birthYear <= new Date().getFullYear() - 14)) errors.push("Das Geburtsjahr ist ungültig.");
  if (profile.healthInsurance === "statutory" && !(profile.additionalContributionPercent >= 0 && profile.additionalContributionPercent <= 6)) errors.push("Der Zusatzbeitrag der Krankenkasse fehlt (0 bis 6 %).");
  if (profile.healthInsurance === "private" && !(profile.privateMonthlyPremium >= 0)) errors.push("Der monatliche Beitrag der privaten Krankenversicherung fehlt.");
  if (profile.childAllowance < 0 || profile.childAllowance > 10) errors.push("Die Kinderfreibeträge sind ungültig.");
  if (profile.childrenUnder25 < 0 || profile.childrenUnder25 > 12) errors.push("Die Anzahl der Kinder ist ungültig.");
  if (profile.taxClass === 3 && profile.childAllowance === 0 && profile.childrenUnder25 === 0) { /* allowed */ }
  for (const key of ["nightRatePercent", "sundayRatePercent", "holidayRatePercent", "nightFreePercent", "sundayFreePercent", "holidayFreePercent"] as const) {
    if (!(profile[key] >= 0 && profile[key] <= 300)) errors.push("Ein Zuschlagssatz ist ungültig.");
  }
  return errors;
}

function supplementLine(
  key: SupplementLine["key"], label: string, hours: number, hourly: number, ratePercent: number, freePercent: number,
): SupplementLine {
  const taxBase = Math.min(hourly, PARAMS.maxHourlyWageTaxFreeSupplement);
  const socialBase = Math.min(hourly, PARAMS.maxHourlyWageSocialFreeSupplement);
  const freeRate = Math.min(ratePercent, freePercent) / 100;
  const total = hours * hourly * (ratePercent / 100);
  const taxFree = Math.min(total, hours * taxBase * freeRate);
  const socialFree = Math.min(taxFree, hours * socialBase * freeRate);
  return { key, label, hours: round2(hours), ratePercent, freePercent, total: round2(total), taxFree: round2(taxFree), taxable: round2(total - taxFree), socialFree: round2(socialFree) };
}

/**
 * Estimates one month. `year` selects only the age rule (care insurance surcharge from age 23).
 * Hours that are both Sunday and holiday count as holiday only (the higher supplement applies, they do not add up).
 */
export function calculateMonth(profile: PayrollProfile, hours: MonthHours, year: number): PayrollResult {
  const baseMonthly = profile.annualGross / 12;
  const hourlyWage = baseMonthly / Math.max(profile.monthlyHours, 1);
  const sundayOnly = Math.max(hours.sundayHours - hours.holidayHours, 0);

  const supplements = [
    supplementLine("night", "Spät-/Nachtzuschlag (ab 20 Uhr)", hours.nightHours, hourlyWage, profile.nightRatePercent, profile.nightFreePercent),
    supplementLine("sunday", "Sonntagszuschlag", sundayOnly, hourlyWage, profile.sundayRatePercent, profile.sundayFreePercent),
    supplementLine("holiday", "Feiertagszuschlag", hours.holidayHours, hourlyWage, profile.holidayRatePercent, profile.holidayFreePercent),
  ];
  const supplementsTotal = supplements.reduce((sum, line) => sum + line.total, 0);
  const supplementsTaxFree = supplements.reduce((sum, line) => sum + line.taxFree, 0);
  const supplementsTaxable = supplementsTotal - supplementsTaxFree;
  const supplementsSocialFree = supplements.reduce((sum, line) => sum + line.socialFree, 0);

  const extrasGrossTaxable = profile.extras.filter((item) => item.kind === "gross-taxable").reduce((sum, item) => sum + item.amount, 0);
  const extrasGrossFree = profile.extras.filter((item) => item.kind === "gross-free").reduce((sum, item) => sum + item.amount, 0);
  const netExtrasAdd = profile.extras.filter((item) => item.kind === "net-add").reduce((sum, item) => sum + item.amount, 0);
  const netExtrasDeduct = profile.extras.filter((item) => item.kind === "net-deduct").reduce((sum, item) => sum + item.amount, 0);

  const grossTotal = baseMonthly + supplementsTotal + extrasGrossTaxable + extrasGrossFree;
  const taxableGross = baseMonthly + supplementsTaxable + extrasGrossTaxable;
  const socialGross = baseMonthly + (supplementsTotal - supplementsSocialFree) + extrasGrossTaxable;

  /* ---- social security ---- */
  const age = year - profile.birthYear;
  const pensionBase = Math.min(socialGross, PARAMS.contributionCeilingPensionMonthly);
  const healthBase = Math.min(socialGross, PARAMS.contributionCeilingHealthMonthly);
  const careRate = PARAMS.careEmployee
    + (profile.childrenUnder25 === 0 && age >= 23 ? PARAMS.careChildlessSurcharge : 0)
    - (profile.childrenUnder25 >= 2 ? Math.min(profile.childrenUnder25 - 1, 4) * PARAMS.careChildReductionPerChild : 0);
  const healthRate = PARAMS.healthGeneralEmployee + profile.additionalContributionPercent / 200;
  const health = profile.healthInsurance === "statutory" ? healthBase * healthRate : profile.privateMonthlyPremium;
  const care = profile.healthInsurance === "statutory" ? healthBase * careRate : 0;
  const pension = profile.pensionInsured ? pensionBase * PARAMS.pensionEmployee : 0;
  const unemployment = profile.unemploymentInsured ? pensionBase * PARAMS.unemploymentEmployee : 0;
  const socialTotal = health + care + pension + unemployment;

  /* ---- income tax (monthly table: annualised, divided by 12 again) ---- */
  const yearlyTaxable = taxableGross * 12;
  // Provision lump sum: pension, health / care (basic share) and unemployment, with the cap of the unemployment part.
  const unemploymentCap = profile.taxClass === 3 ? 3000 : 1900;
  const provision = (profile.pensionInsured ? pension * 12 : 0)
    + (profile.healthInsurance === "statutory" ? (healthBase * (0.07 + profile.additionalContributionPercent / 200) + care) * 12 : profile.privateMonthlyPremium * 12)
    + Math.min(unemployment * 12, unemploymentCap);
  const singleParentRelief = profile.taxClass === 2
    ? PARAMS.singleParentRelief + Math.max(Math.ceil(profile.childAllowance) - 1, 0) * PARAMS.singleParentReliefPerExtraChild
    : 0;
  const lumpSums = profile.taxClass === 6 ? 0 : PARAMS.employeeLumpSum + PARAMS.specialExpensesLumpSum;
  const zvE = Math.max(yearlyTaxable - lumpSums - provision - singleParentRelief - profile.yearlyTaxAllowance, 0);
  const yearlyTax = yearlyIncomeTaxByClass(zvE, profile.taxClass);

  // Child allowance only reduces the base for solidarity surcharge and church tax.
  const childReduction = profile.childAllowance * PARAMS.childAllowancePerFull;
  const taxBaseForSurcharges = profile.childAllowance > 0
    ? yearlyIncomeTaxByClass(Math.max(zvE - childReduction, 0), profile.taxClass)
    : yearlyTax;
  const incomeTaxMonthly = yearlyTax / 12;
  const soliMonthly = soli(taxBaseForSurcharges, profile.taxClass) / 12;
  const churchMonthly = profile.confession === "none" ? 0 : (taxBaseForSurcharges * (profile.state === "BY" ? PARAMS.churchTaxRateBayern : PARAMS.churchTaxRateHessen)) / 12;
  const taxesTotal = incomeTaxMonthly + soliMonthly + churchMonthly;

  const netPay = grossTotal - taxesTotal - socialTotal + netExtrasAdd - netExtrasDeduct;
  return {
    baseMonthly: round2(baseMonthly),
    hourlyWage: round2(hourlyWage),
    supplements,
    supplementsTotal: round2(supplementsTotal),
    supplementsTaxFree: round2(supplementsTaxFree),
    extrasGrossTaxable: round2(extrasGrossTaxable),
    extrasGrossFree: round2(extrasGrossFree),
    grossTotal: round2(grossTotal),
    taxableGross: round2(taxableGross),
    socialGross: round2(socialGross),
    incomeTax: round2(incomeTaxMonthly),
    soli: round2(soliMonthly),
    churchTax: round2(churchMonthly),
    taxesTotal: round2(taxesTotal),
    health: round2(health),
    care: round2(care),
    pension: round2(pension),
    unemployment: round2(unemployment),
    socialTotal: round2(socialTotal),
    rates: { health: round2(healthRate * 100), care: round2(careRate * 100), pension: round2(PARAMS.pensionEmployee * 100), unemployment: round2(PARAMS.unemploymentEmployee * 100) },
    netExtrasAdd: round2(netExtrasAdd),
    netExtrasDeduct: round2(netExtrasDeduct),
    netPay: round2(netPay),
    effectiveDeductionRate: grossTotal > 0 ? round2(((taxesTotal + socialTotal) / grossTotal) * 100) : 0,
    yearlyTaxableForTax: round2(zvE),
  };
}
