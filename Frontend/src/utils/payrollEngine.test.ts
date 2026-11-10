import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, calculateMonth, incomeTax, validateProfile, type PayrollProfile } from "./payrollEngine";

const base: PayrollProfile = { ...DEFAULT_PROFILE, annualGross: 60000, birthYear: 1990 };
const none = { nightHours: 0, sundayHours: 0, holidayHours: 0 };

describe("income tax tariff", () => {
  it("is zero up to the basic allowance and rises monotonically", () => {
    expect(incomeTax(12348)).toBe(0);
    let previous = 0;
    for (let income = 13000; income <= 300000; income += 3000) {
      const tax = incomeTax(income);
      expect(tax).toBeGreaterThanOrEqual(previous);
      previous = tax;
    }
  });
});

describe("monthly estimate", () => {
  it("60,000 EUR, tax class 1: net is in the realistic range", () => {
    const result = calculateMonth(base, none, 2027);
    expect(result.grossTotal).toBe(5000);
    expect(result.netPay).toBeGreaterThan(3000);
    expect(result.netPay).toBeLessThan(3350);
    expect(result.socialTotal).toBeCloseTo(1087.5, 1);
  });

  it("tax class 3 pays less tax than class 1, class 5 more", () => {
    const class1 = calculateMonth(base, none, 2027).incomeTax;
    expect(calculateMonth({ ...base, taxClass: 3 }, none, 2027).incomeTax).toBeLessThan(class1);
    expect(calculateMonth({ ...base, taxClass: 5 }, none, 2027).incomeTax).toBeGreaterThan(class1);
  });

  it("church tax only for members, 9 % of the tax", () => {
    const plain = calculateMonth(base, none, 2027);
    const church = calculateMonth({ ...base, confession: "ev" }, none, 2027);
    expect(plain.churchTax).toBe(0);
    expect(church.churchTax).toBeCloseTo(plain.incomeTax * 0.09, 0);
    expect(church.netPay).toBeLessThan(plain.netPay);
  });

  it("supplements: the tax-free parts follow 25 / 40 / 100 %, Sunday and holiday hours do not add up", () => {
    const result = calculateMonth(base, { nightHours: 40, sundayHours: 16, holidayHours: 8 }, 2027);
    const hourly = 5000 / 174;
    const night = result.supplements.find((line) => line.key === "night")!;
    const sunday = result.supplements.find((line) => line.key === "sunday")!;
    const holiday = result.supplements.find((line) => line.key === "holiday")!;
    expect(night.total).toBeCloseTo(40 * hourly * 0.25, 1);
    expect(night.taxable).toBe(0);
    expect(sunday.hours).toBe(8); // 16 Sunday hours, 8 of them on a holiday
    expect(holiday.hours).toBe(8);
    expect(result.grossTotal).toBeGreaterThan(5000);
  });

  it("a supplement above the tax-free limit is partly taxable", () => {
    const result = calculateMonth({ ...base, nightRatePercent: 50 }, { nightHours: 40, sundayHours: 0, holidayHours: 0 }, 2027);
    const night = result.supplements[0];
    expect(night.taxFree).toBeCloseTo(night.total / 2, 1);
    expect(night.taxable).toBeCloseTo(night.total / 2, 1);
  });

  it("more supplement hours raise the net pay (swapped shifts change the result)", () => {
    const low = calculateMonth(base, { nightHours: 0, sundayHours: 0, holidayHours: 0 }, 2027).netPay;
    const high = calculateMonth(base, { nightHours: 60, sundayHours: 0, holidayHours: 0 }, 2027).netPay;
    expect(high).toBeGreaterThan(low);
  });

  it("childless people from 23 pay the care insurance surcharge, several children reduce it", () => {
    const childless = calculateMonth(base, none, 2027).rates.care;
    const threeChildren = calculateMonth({ ...base, childrenUnder25: 3, childAllowance: 3 }, none, 2027).rates.care;
    expect(childless).toBeCloseTo(2.4, 2);
    expect(threeChildren).toBeCloseTo(1.3, 2);
  });

  it("contribution ceilings apply", () => {
    const result = calculateMonth({ ...base, annualGross: 150000 }, none, 2027);
    expect(result.pension).toBeCloseTo(8450 * 0.093, 1);
  });

  it("extras: net payments and deductions change the payout only", () => {
    const plain = calculateMonth(base, none, 2027);
    const withExtras = calculateMonth({ ...base, extras: [
      { id: "a", label: "Fahrtkosten", amount: 50, kind: "net-add" },
      { id: "b", label: "Vorschuss", amount: 20, kind: "net-deduct" },
    ] }, none, 2027);
    expect(withExtras.netPay).toBeCloseTo(plain.netPay + 30, 1);
    expect(withExtras.taxesTotal).toBe(plain.taxesTotal);
  });
});

describe("validation", () => {
  it("requires the data the estimate needs", () => {
    expect(validateProfile({ ...DEFAULT_PROFILE, annualGross: Number.NaN }).length).toBeGreaterThan(0);
    expect(validateProfile(base)).toEqual([]);
    expect(validateProfile({ ...base, healthInsurance: "statutory", additionalContributionPercent: Number.NaN }).length).toBeGreaterThan(0);
  });
});

describe("federal state", () => {
  it("church tax is 8 % in Bayern and 9 % in Hessen", () => {
    const he = calculateMonth({ ...base, confession: "ev", state: "HE" }, none, 2027);
    const by = calculateMonth({ ...base, confession: "ev", state: "BY" }, none, 2027);
    expect(by.churchTax).toBeCloseTo(by.incomeTax * 0.08, 0);
    expect(by.churchTax).toBeLessThan(he.churchTax);
  });
});
