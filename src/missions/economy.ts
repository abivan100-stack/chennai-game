/**
 * Money: cash from fares, and Uncle's loan from Kandasamy the moneylender, repaid a little every
 * day. Pure logic (no DOM / three.js) so scripts/check.ts can test it.
 */
export const LOAN_TOTAL = 15000;
export const DAILY_DUE = 500;
/** Missed days in a row before Kandasamy takes the auto. */
export const SEIZE_AFTER = 3;
/** His fee for the trouble, on top of the overdue amount, to get the auto back. */
export const SEIZE_PENALTY = 500;

export class Economy {
  cash = 0;
  loan = LOAN_TOTAL;
  rides = 0;
  earnedToday = 0;
  paidToday = 0;
  /** Days in a row the daily amount wasn't paid. */
  missedDays = 0;
  /** Kandasamy has taken the auto (too many missed days). */
  seized = false;
  private day: number | null = null;

  earn(amount: number) {
    this.cash += amount;
    this.earnedToday += amount;
    this.rides++;
  }

  /** Pay towards the loan; limited by cash and what's owed. Returns the amount actually paid. */
  pay(amount: number) {
    const paid = Math.max(0, Math.min(amount, this.cash, this.loan));
    this.cash -= paid;
    this.loan -= paid;
    this.paidToday += paid;
    return paid;
  }

  /**
   * A fine or bill: paid from cash as far as it goes; whatever's left is added to the loan
   * (Kandasamy covers it, at his price). Returns what was paid now and what went on the loan.
   */
  charge(amount: number) {
    const paid = Math.max(0, Math.min(amount, this.cash));
    this.cash -= paid;
    const owed = amount - paid;
    this.loan += owed;
    return { paid, owed };
  }

  /** To get a seized auto back: the overdue days plus his penalty. */
  get redeemCost() {
    return this.missedDays * DAILY_DUE + SEIZE_PENALTY;
  }

  /** Pay to get the auto back. The overdue part goes off the loan; the penalty doesn't. */
  redeem() {
    if (!this.seized || this.cash < this.redeemCost) return false;
    const overdue = Math.min(this.missedDays * DAILY_DUE, this.loan);
    this.cash -= this.redeemCost;
    this.loan -= overdue;
    this.paidToday = DAILY_DUE; // today's counts as settled
    this.missedDays = 0;
    this.seized = false;
    return true;
  }

  /** Plain data for the save file. */
  snapshot() {
    const { cash, loan, rides, earnedToday, paidToday, missedDays, day, seized } = this;
    return { cash, loan, rides, earnedToday, paidToday, missedDays, day, seized };
  }

  restore(s: ReturnType<Economy['snapshot']>) {
    Object.assign(this, s);
  }

  /** Still owed for today. */
  get dueToday() {
    return this.loan > 0 ? Math.max(0, Math.min(DAILY_DUE, this.loan) - this.paidToday) : 0;
  }

  get paidOff() {
    return this.loan <= 0;
  }

  /**
   * Call with the current (IST) day number. On a new day, settles yesterday: returns
   * 'missed' if the daily amount wasn't paid, 'ok' if it was, null if the day hasn't changed.
   */
  tickDay(day: number): 'missed' | 'ok' | null {
    if (this.day === null) this.day = day;
    if (day === this.day) return null;
    const missed = this.dueToday > 0;
    this.missedDays = missed ? this.missedDays + 1 : 0;
    if (this.missedDays >= SEIZE_AFTER && this.loan > 0) this.seized = true;
    this.day = day;
    this.earnedToday = 0;
    this.paidToday = 0;
    return missed ? 'missed' : 'ok';
  }
}
