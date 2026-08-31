/* ================================================ */
/* Assignment Writeback — JarvisUiAdapter           */
/* Abstract browser/UI automation interface.        */
/* All actual Jarvis UI interactions go here.       */
/* Never call Playwright/Puppeteer from outside.   */
/* ================================================ */

/**
 * JarvisUiAdapter defines the interface for all Jarvis browser interactions.
 *
 * This class is designed to be:
 * - Mocked in unit tests
 * - Extended with Playwright/Puppeteer in production
 * - NEVER called directly from the assignment logic
 *
 * Default implementation (NullAdapter):
 * - All methods throw — prevents accidental writes in shadow mode
 */
export class JarvisUiAdapter {
  constructor({ mode = 'shadow_only' } = {}) {
    this.mode = mode;
  }

  /**
   * Navigate to the Jarvis queue for the given queue type.
   * @param {string} queueType
   * @returns {Promise<void>}
   */
  async openQueue(queueType) {
    throw new Error(`JarvisUiAdapter.openQueue not implemented (mode: ${this.mode})`);
  }

  /**
   * Find the queue row for the given activity number.
   * MUST verify exactly one matching row.
   *
   * @param {object} params
   * @param {string} params.activityNumber
   * @param {string} [params.salesOrderNumber]   - expected SO # for cross-validation
   * @param {string} [params.expectedSubType]
   * @param {string} [params.expectedStatus]
   * @param {boolean} [params.expectOwnerEmpty]  - if true, row must have no owner
   * @param {string} [params.expectOwnerCode]    - if set, row must have this owner code
   *
   * @returns {Promise<{
   *   found: boolean,
   *   rowCount: number,
   *   activityNumber: string,
   *   salesOrderNumber: string,
   *   subType: string,
   *   status: string,
   *   ownerCode: string|null,
   *   validationErrors: string[],
   * }>}
   */
  async findQueueRow(params) {
    throw new Error(`JarvisUiAdapter.findQueueRow not implemented (mode: ${this.mode})`);
  }

  /**
   * Open the ticket detail page by clicking the Activity # link.
   * Must wait for full page load and validate the header.
   *
   * @param {object} params
   * @param {string} params.activityNumber
   * @param {string} [params.salesOrderNumber]
   * @param {string} [params.expectedQueueProduct]
   * @param {string} [params.expectedStatus]
   *
   * @returns {Promise<{
   *   opened: boolean,
   *   activityNumber: string,
   *   salesOrderNumber: string,
   *   product: string,
   *   status: string,
   *   validationErrors: string[],
   * }>}
   */
  async openTicketDetail(params) {
    throw new Error(`JarvisUiAdapter.openTicketDetail not implemented (mode: ${this.mode})`);
  }

  /**
   * Click the assignment button (top-right, user icon + site code).
   * Validates the Assign Activity dialog opens with Staff tab active.
   *
   * @returns {Promise<{ opened: boolean, validationErrors: string[] }>}
   */
  async openAssignDialog() {
    throw new Error(`JarvisUiAdapter.openAssignDialog not implemented (mode: ${this.mode})`);
  }

  /**
   * Search for an employee in the Assign Activity dialog.
   * Uses the search input — must find exactly ONE matching staff row.
   * Normalizes display names by removing "(Me)".
   *
   * @param {object} params
   * @param {string} params.jarvisDisplayName        - expected exact name
   * @param {string[]} [params.jarvisDisplayNameAliases] - alternative accepted names
   *
   * @returns {Promise<{
   *   found: boolean,
   *   matchCount: number,
   *   matchedName: string|null,
   *   rowIndex: number|null,
   *   validationErrors: string[],
   * }>}
   */
  async searchStaffInDialog(params) {
    throw new Error(`JarvisUiAdapter.searchStaffInDialog not implemented (mode: ${this.mode})`);
  }

  /**
   * Click the Assign button for the already-found single staff row.
   * Must verify the button belongs to the exact row found by searchStaffInDialog.
   *
   * @returns {Promise<{ clicked: boolean, validationErrors: string[] }>}
   */
  async clickAssign() {
    throw new Error(`JarvisUiAdapter.clickAssign not implemented (mode: ${this.mode})`);
  }

  /**
   * Find the currently assigned staff row (has check mark + UnAssign button).
   * Normalizes display names by removing "(Me)".
   *
   * @param {object} params
   * @param {string} params.expectedOwnerCode
   * @param {string} params.expectedJarvisDisplayName
   *
   * @returns {Promise<{
   *   found: boolean,
   *   matchedName: string|null,
   *   validationErrors: string[],
   * }>}
   */
  async findCurrentlyAssignedRow(params) {
    throw new Error(`JarvisUiAdapter.findCurrentlyAssignedRow not implemented (mode: ${this.mode})`);
  }

  /**
   * Click the UnAssign button for the already-found assigned staff row.
   * Must verify the button belongs to the exact row with the check mark.
   *
   * @returns {Promise<{ clicked: boolean, validationErrors: string[] }>}
   */
  async clickUnAssign() {
    throw new Error(`JarvisUiAdapter.clickUnAssign not implemented (mode: ${this.mode})`);
  }

  /**
   * Close the Assign Activity dialog using the X button.
   * Required after UnAssign (dialog does not close automatically).
   *
   * @returns {Promise<{ closed: boolean, validationErrors: string[] }>}
   */
  async closeAssignDialog() {
    throw new Error(`JarvisUiAdapter.closeAssignDialog not implemented (mode: ${this.mode})`);
  }

  /**
   * Navigate back to the queue using the internal black back arrow.
   * Must wait for queue to reload.
   *
   * @returns {Promise<{ returned: boolean, validationErrors: string[] }>}
   */
  async returnToQueue() {
    throw new Error(`JarvisUiAdapter.returnToQueue not implemented (mode: ${this.mode})`);
  }

  /**
   * Verify the final queue state after an assign action.
   * The Owner column MUST equal expectedOwnerCode.
   *
   * @param {object} params
   * @param {string} params.activityNumber
   * @param {string} params.expectedOwnerCode
   *
   * @returns {Promise<{
   *   verified: boolean,
   *   actualOwnerCode: string|null,
   *   validationErrors: string[],
   * }>}
   */
  async verifyQueueOwner(params) {
    throw new Error(`JarvisUiAdapter.verifyQueueOwner not implemented (mode: ${this.mode})`);
  }

  /**
   * Verify the queue row is unassigned (Owner column empty).
   *
   * @param {object} params
   * @param {string} params.activityNumber
   *
   * @returns {Promise<{
   *   verified: boolean,
   *   actualOwnerCode: string|null,
   *   validationErrors: string[],
   * }>}
   */
  async verifyQueueOwnerEmpty(params) {
    throw new Error(`JarvisUiAdapter.verifyQueueOwnerEmpty not implemented (mode: ${this.mode})`);
  }

  /**
   * Capture a screenshot and diagnostic HTML for error reporting.
   * Returns paths to saved files, or null if capture failed.
   *
   * @returns {Promise<{ screenshotPath: string|null, diagnosticHtmlPath: string|null, currentUrl: string|null, pageTitle: string|null }>}
   */
  async captureDiagnostics() {
    return { screenshotPath: null, diagnosticHtmlPath: null, currentUrl: null, pageTitle: null };
  }

  /**
   * Gracefully clean up: close browser session if open.
   */
  async cleanup() {
    // Default: no-op
  }
}

/**
 * MockJarvisUiAdapter — for unit/integration testing.
 * All methods succeed by default unless pre-configured to fail.
 */
export class MockJarvisUiAdapter extends JarvisUiAdapter {
  constructor(overrides = {}) {
    super({ mode: 'mock' });
    this._overrides = overrides;
    this._calls = [];
  }

  _record(method, params) {
    this._calls.push({ method, params, at: new Date().toISOString() });
  }

  _result(method, defaultResult) {
    return this._overrides[method] !== undefined
      ? this._overrides[method]
      : defaultResult;
  }

  getCalls() { return this._calls; }
  getCallsFor(method) { return this._calls.filter(c => c.method === method); }
  wasCalledWith(method) { return this._calls.some(c => c.method === method); }

  async openQueue(queueType) {
    this._record('openQueue', { queueType });
    return this._result('openQueue', undefined);
  }

  async findQueueRow(params) {
    this._record('findQueueRow', params);
    return this._result('findQueueRow', {
      found: true, rowCount: 1,
      activityNumber: params.activityNumber,
      salesOrderNumber: params.salesOrderNumber || '',
      subType: params.expectedSubType || '',
      status: 'Open',
      ownerCode: params.expectOwnerEmpty ? null : (params.expectOwnerCode || null),
      validationErrors: [],
    });
  }

  async openTicketDetail(params) {
    this._record('openTicketDetail', params);
    return this._result('openTicketDetail', {
      opened: true,
      activityNumber: params.activityNumber,
      salesOrderNumber: params.salesOrderNumber || '',
      product: params.expectedQueueProduct || 'Smart Hands',
      status: 'Open',
      validationErrors: [],
    });
  }

  async openAssignDialog() {
    this._record('openAssignDialog', {});
    return this._result('openAssignDialog', { opened: true, validationErrors: [] });
  }

  async searchStaffInDialog(params) {
    this._record('searchStaffInDialog', params);
    return this._result('searchStaffInDialog', {
      found: true, matchCount: 1,
      matchedName: params.jarvisDisplayName,
      rowIndex: 0, validationErrors: [],
    });
  }

  async clickAssign() {
    this._record('clickAssign', {});
    return this._result('clickAssign', { clicked: true, validationErrors: [] });
  }

  async findCurrentlyAssignedRow(params) {
    this._record('findCurrentlyAssignedRow', params);
    return this._result('findCurrentlyAssignedRow', {
      found: true, matchedName: params.expectedJarvisDisplayName, validationErrors: [],
    });
  }

  async clickUnAssign() {
    this._record('clickUnAssign', {});
    return this._result('clickUnAssign', { clicked: true, validationErrors: [] });
  }

  async closeAssignDialog() {
    this._record('closeAssignDialog', {});
    return this._result('closeAssignDialog', { closed: true, validationErrors: [] });
  }

  async returnToQueue() {
    this._record('returnToQueue', {});
    return this._result('returnToQueue', { returned: true, validationErrors: [] });
  }

  async verifyQueueOwner(params) {
    this._record('verifyQueueOwner', params);
    return this._result('verifyQueueOwner', {
      verified: true, actualOwnerCode: params.expectedOwnerCode, validationErrors: [],
    });
  }

  async verifyQueueOwnerEmpty(params) {
    this._record('verifyQueueOwnerEmpty', params);
    return this._result('verifyQueueOwnerEmpty', {
      verified: true, actualOwnerCode: null, validationErrors: [],
    });
  }

  async captureDiagnostics() {
    this._record('captureDiagnostics', {});
    return this._result('captureDiagnostics', {
      screenshotPath: null, diagnosticHtmlPath: null, currentUrl: null, pageTitle: null,
    });
  }

  async cleanup() {
    this._record('cleanup', {});
  }
}
