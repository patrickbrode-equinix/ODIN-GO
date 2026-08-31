/* ================================================ */
/* Assignment Engine — Config & Mapping Aliases     */
/* ================================================ */

/**
 * Type mapping aliases — maps raw ticket type strings
 * to normalized types.
 */
export const TYPE_ALIASES = {
  // TroubleTicket
  'troubleticket': 'TroubleTicket',
  'troubletickets': 'TroubleTicket',
  'trouble_ticket': 'TroubleTicket',
  'trouble ticket': 'TroubleTicket',
  'trouble tickets': 'TroubleTicket',
  'tt': 'TroubleTicket',
  'incident': 'TroubleTicket',
  // SmartHands
  'smarthands': 'SmartHands',
  'smart_hands': 'SmartHands',
  'smart hands': 'SmartHands',
  'sh': 'SmartHands',
  // CrossConnect
  'crossconnect': 'CrossConnect',
  'cross_connect': 'CrossConnect',
  'cross connect': 'CrossConnect',
  'cross connects': 'CrossConnect',
  'xconnect': 'CrossConnect',
  'xc': 'CrossConnect',
  'cc': 'CrossConnect',
  'ccinstall': 'CrossConnect',
  'ccinstalls': 'CrossConnect',
  'cc_install': 'CrossConnect',
  'cc installs': 'CrossConnect',
  'cc install': 'CrossConnect',
  // Scheduled
  'scheduled': 'Scheduled',
  'scheduled_ticket': 'Scheduled',
  'scheduled ticket': 'Scheduled',
  'sched': 'Scheduled',
  // Other
  'other': 'Other',
  'misc': 'Other',
  'general': 'Other',
};

/**
 * Status mapping aliases — maps raw status strings
 * to normalized statuses.
 */
export const STATUS_ALIASES = {
  'open': 'open',
  'new': 'open',
  'created': 'open',
  'open-dispatch': 'active',
  'open_dispatch': 'active',
  'open dispatch': 'active',
  'open-accepted': 'active',
  'open_accepted': 'active',
  'open accepted': 'active',
  'open-wip': 'active',
  'open_wip': 'active',
  'open wip': 'active',
  'active': 'active',
  'in progress': 'active',
  'in_progress': 'active',
  'inprogress': 'active',
  'working': 'active',
  'pending': 'pending',
  'waiting': 'pending',
  'on hold': 'pending',
  'on_hold': 'pending',
  'onhold': 'pending',
  'reviewed': 'pending',
  'customer updated': 'pending',
  'customer_updated': 'pending',
  'updated': 'pending',
  'completed pending migration': 'pending',
  'completed_pending_migration': 'pending',
  'completed pending test': 'pending',
  'completed_pending_test': 'pending',
  'closed': 'closed',
  'resolved': 'closed',
  'done': 'closed',
  'completed': 'closed',
  'cancelled': 'cancelled',
  'canceled': 'cancelled',
  'rejected': 'cancelled',
  'void': 'cancelled',
};

/**
 * Priority mapping aliases.
 */
export const PRIORITY_ALIASES = {
  'low': 'low',
  'p4': 'low',
  '4': 'low',
  'minor': 'low',
  'medium': 'medium',
  'normal': 'medium',
  'p3': 'medium',
  '3': 'medium',
  'standard': 'medium',
  'high': 'high',
  'p2': 'high',
  '2': 'high',
  'major': 'high',
  'urgent': 'high',
  'critical': 'critical',
  'p1': 'critical',
  '1': 'critical',
  'emergency': 'critical',
  'blocker': 'critical',
};

/**
 * Handover type aliases — maps raw handover type strings
 * to normalized handover types.
 */
export const HANDOVER_ALIASES = {
  'workload': 'workload',
  'workload_handover': 'workload',
  'workload handover': 'workload',
  'terminated': 'terminated',
  'terminated_handover': 'terminated',
  'terminated handover': 'terminated',
  'other_teams': 'other_teams',
  'otherteams': 'other_teams',
  'other teams': 'other_teams',
  'other_teams_handover': 'other_teams',
  'otherteams handover': 'other_teams',
};

/**
 * Staff role aliases — maps raw role strings
 * to normalized role identifiers.
 */
export const ROLE_ALIASES = {
  'dispatcher': 'dispatcher',
  'dispatch': 'dispatcher',
  'large_order': 'large_order',
  'large order': 'large_order',
  'largeorder': 'large_order',
  'project': 'project',
  'leads': 'leads',
  'lead': 'leads',
  'teamlead': 'leads',
  'team_lead': 'leads',
  'deutsche_boerse': 'deutsche_boerse',
  'deutsche börse': 'deutsche_boerse',
  'deutsche boerse': 'deutsche_boerse',
  'db': 'deutsche_boerse',
  'dbag': 'deutsche_boerse',
  'cross_connect': 'cross_connect',
  'crossconnect': 'cross_connect',
  'buddy': 'buddy',
  'neustarter': 'neustarter',
  'newstarter': 'neustarter',
  'support': 'support',
  'normal': 'normal',
  'c-ops': 'normal',
  'cops': 'normal',
};
