/* ================================================ */
/* Assignment Engine — Custom Error Classes         */
/* ================================================ */

export class AssignmentError extends Error {
  constructor(message, { code, context } = {}) {
    super(message);
    this.name = 'AssignmentError';
    this.code = code || 'ASSIGNMENT_ERROR';
    this.context = context || {};
  }
}

export class NormalizationError extends AssignmentError {
  constructor(message, context = {}) {
    super(message, { code: 'NORMALIZATION_ERROR', context });
    this.name = 'NormalizationError';
  }
}

export class ValidationError extends AssignmentError {
  constructor(message, context = {}) {
    super(message, { code: 'VALIDATION_ERROR', context });
    this.name = 'ValidationError';
  }
}

export class DecisionConflictError extends AssignmentError {
  constructor(message, context = {}) {
    super(message, { code: 'DECISION_CONFLICT', context });
    this.name = 'DecisionConflictError';
  }
}
