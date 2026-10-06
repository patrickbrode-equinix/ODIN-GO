import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../api/api";
import { useAuth } from "./AuthContext";

/* ─────────────────────────────────────────────────────────────────────── */
/*  TYPES                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

export type LanguageCode = "de" | "en";

type LanguageOption = {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  shortLabel: string;
  flag: string;
};

type LanguageContextValue = {
  language: LanguageCode;
  languages: LanguageOption[];
  setLanguage: (nextLanguage: LanguageCode, options?: { persist?: boolean }) => Promise<void>;
  t: (key: TranslationKey) => string;
  direction: "ltr";
};

/* ─────────────────────────────────────────────────────────────────────── */
/*  CONFIGURATION                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

const DEFAULT_LANGUAGE: LanguageCode = "de";
const STORAGE_KEY = "odin.language";

export const LANGUAGE_TO_LOCALE: Record<LanguageCode, string> = {
  de: "de-DE",
  en: "en-US",
};

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "de", label: "Deutsch", nativeLabel: "Deutsch", shortLabel: "DE", flag: "🇩🇪" },
  { code: "en", label: "English", nativeLabel: "English", shortLabel: "EN", flag: "🇺🇸" },
];

/* ─────────────────────────────────────────────────────────────────────── */
/*  TRANSLATION KEYS                                                       */
/* ─────────────────────────────────────────────────────────────────────── */

export type TranslationKey =
  /* ── Common ── */
  | "common.settings"
  | "common.logout"
  | "common.language"
  | "common.themeDark"
  | "common.themeLight"
  | "common.noData"
  | "common.loading"
  | "common.save"
  | "common.saving"
  | "common.cancel"
  | "common.apply"
  | "common.date"
  | "common.employee"
  | "common.close"
  | "common.delete"
  | "common.refresh"
  | "common.total"
  | "common.active"
  | "common.peak"
  /* ── Navigation ── */
  | "nav.dashboard"
  | "nav.shiftplan"
  | "nav.handover"
  | "nav.protokoll"
  | "nav.shiftplanControl"
  | "nav.adminSettings"
  | "nav.userManagement"
  | "nav.statistics"
  | "nav.weekPlanning"
  | "nav.dayPlanning"
  | "nav.teamsNotifications"
  | "nav.automatedAssignment"
  | "nav.operationsNode"
  /* ── Settings ── */
  | "settings.title"
  | "settings.personalAppSettings"
  | "settings.changePassword"
  | "settings.startPasswordChange"
  | "settings.securityRequirement"
  | "settings.securityRequirementBody"
  | "settings.profile"
  | "settings.name"
  | "settings.email"
  | "settings.location"
  | "settings.team"
  | "settings.activeSince"
  | "settings.lastLogin"
  | "settings.app"
  | "settings.language"
  | "settings.theme"
  | "settings.notifications"
  | "settings.emailNotifications"
  | "settings.browserNotifications"
  | "settings.shiftReminders"
  | "settings.shiftPreferences"
  | "settings.shiftPreferencesBody"
  | "settings.systemThresholds"
  | "settings.loading"
  /* ── Dashboard / Statistics ── */
  | "stats.title"
  | "stats.refreshing"
  | "stats.lastLabel"
  | "stats.today"
  | "stats.other"
  | "stats.fetchError"
  | "stats.retryNow"
  /* ── User Management ── */
  | "userAccess.loadFailed"
  | "userAccess.saveFailed"
  | "userAccess.resetFailed"
  | "userAccess.title"
  | "userAccess.department"
  | "userAccess.role"
  | "userAccess.overrideHint"
  | "userAccess.loading"
  | "userAccess.standard"
  | "userAccess.departmentDefault"
  | "userAccess.noAccess"
  | "userAccess.read"
  | "userAccess.write"
  | "userAccess.clearOverrides"
  /* ── Group Access ── */
  | "groupAccess.loadFailed"
  | "groupAccess.saveFailed"
  | "groupAccess.keyLabelRequired"
  | "groupAccess.createFailed"
  | "groupAccess.selectDepartment"
  | "groupAccess.newDepartment"
  | "groupAccess.keyPlaceholder"
  | "groupAccess.labelPlaceholder"
  | "groupAccess.create"
  | "groupAccess.hint"
  | "groupAccess.page"
  | "groupAccess.departmentStandard"
  | "groupAccess.selectAccess"
  | "groupAccess.title"
  | "groupAccess.noAccess"
  | "groupAccess.read"
  | "groupAccess.write"
  /* ── Add User ── */
  | "addUser.createFailed"
  | "addUser.title"
  | "addUser.subtitle"
  | "addUser.note"
  | "addUser.firstName"
  | "addUser.lastName"
  | "addUser.loginName"
  | "addUser.loginNamePlaceholder"
  | "addUser.email"
  | "addUser.initialPassword"
  | "addUser.passwordPlaceholder"
  | "addUser.location"
  | "addUser.locationPlaceholder"
  | "addUser.department"
  | "addUser.departmentPlaceholder"
  | "addUser.role"
  | "addUser.submit"
  /* ── Holidays ── */
  | "holidays.newYearsDay"
  | "holidays.labourDay"
  | "holidays.germanUnityDay"
  | "holidays.christmasDay1"
  | "holidays.christmasDay2"
  | "holidays.goodFriday"
  | "holidays.easterMonday"
  | "holidays.ascensionDay"
  | "holidays.whitMonday"
  | "holidays.corpusChristi"
  | "holidays.generic"
  /* ── AccessDenied ── */
  | "accessDenied.title"
  | "accessDenied.message"
  | "accessDenied.backButton"
  /* ── ProjectsPanel ── */
  | "projects.createNewProject"
  | "projects.title"
  | "projects.subtitle"
  | "projects.projectNameLabel"
  | "projects.projectNamePlaceholder"
  | "projects.responsibleLabel"
  | "projects.responsiblePlaceholder"
  | "projects.endDateLabel"
  | "projects.progressLabel"
  | "projects.descriptionLabel"
  | "projects.descriptionPlaceholder"
  | "projects.createProjectButton"
  | "projects.completedBadge"
  | "projects.overdue"
  | "projects.today"
  | "projects.markCompletedConfirm"
  | "projects.loadingLabel"
  | "projects.newProjectButton"
  | "projects.activeSection"
  | "projects.completedSection"
  | "projects.noProjects"
  | "projects.createFirstButton"
  | "projects.participantsLabel"
  | "projects.participantsHint"
  | "projects.deleteConfirm"
  /* ── TicketAudit ── */
  | "ticketAudit.employee"
  | "shiftAdmin.title"
  | "shiftAdmin.subtitle"
  | "shiftAdmin.activeOn"
  /* ── Overview cards ── */
  | "shiftAdmin.cardDefinitions"
  | "shiftAdmin.cardDefinitionsDesc"
  | "shiftAdmin.cardDbsPool"
  | "shiftAdmin.cardDbsPoolDesc"
  | "shiftAdmin.cardExclusions"
  | "shiftAdmin.cardExclusionsDesc"
  /* ── Shift definitions ── */
  | "shiftAdmin.sectionDefinitions"
  | "shiftAdmin.sectionDefinitionsInfo"
  | "shiftAdmin.helpSectionDefinitions"
  | "shiftAdmin.defCode"
  | "shiftAdmin.defName"
  | "shiftAdmin.defType"
  | "shiftAdmin.defFrom"
  | "shiftAdmin.defTo"
  | "shiftAdmin.defHours"
  | "shiftAdmin.defMin"
  | "shiftAdmin.defMax"
  | "shiftAdmin.defColorStatus"
  | "shiftAdmin.defActive"
  | "shiftAdmin.defStartDay"
  | "shiftAdmin.defEndDay"
  | "shiftAdmin.defTimeWindow"
  | "shiftAdmin.defWeekdayPlanning"
  | "shiftAdmin.defSave"
  | "shiftAdmin.defSaving"
  | "shiftAdmin.typeEarly"
  | "shiftAdmin.typeLate"
  | "shiftAdmin.typeNight"
  | "shiftAdmin.typeSpecial"
  | "shiftAdmin.helpDefWeekdays"
  | "shiftAdmin.helpDefMinMax"
  | "shiftAdmin.helpDefDayOffset"
  /* ── DBS configuration ── */
  | "shiftAdmin.sectionDbs"
  | "shiftAdmin.sectionDbsInfo"
  | "shiftAdmin.helpSectionDbs"
  | "shiftAdmin.dbsEnabled"
  | "shiftAdmin.helpDbsEnabled"
  | "shiftAdmin.dbsRhythm"
  | "shiftAdmin.helpDbsRhythm"
  | "shiftAdmin.dbsReferenceDate"
  | "shiftAdmin.helpDbsReferenceDate"
  | "shiftAdmin.dbsWeekdays"
  | "shiftAdmin.helpDbsWeekdays"
  | "shiftAdmin.dbsShiftCode"
  | "shiftAdmin.helpDbsShiftCode"
  | "shiftAdmin.dbsRequiredStaff"
  | "shiftAdmin.helpDbsRequiredStaff"
  | "shiftAdmin.dbsDefaultTarget"
  | "shiftAdmin.helpDbsDefaultTarget"
  | "shiftAdmin.dbsPool"
  | "shiftAdmin.dbsSelectEmployee"
  | "shiftAdmin.dbsMonthlyDays"
  | "shiftAdmin.helpDbsMonthlyDays"
  | "shiftAdmin.dbsAddEmployee"
  | "shiftAdmin.dbsRemove"
  | "shiftAdmin.dbsSaveConfig"
  | "shiftAdmin.dbsSavePool"
  | "shiftAdmin.dbsSavingConfig"
  | "shiftAdmin.dbsSavingPool"
  | "shiftAdmin.dbsEmptyPool"
  | "shiftAdmin.dbsDisabledHint"
  /* ── Rotation & overtime ── */
  | "shiftAdmin.sectionRotation"
  | "shiftAdmin.helpSectionRotation"
  | "shiftAdmin.rotMaxConsecutiveSame"
  | "shiftAdmin.helpRotMaxConsecutiveSame"
  | "shiftAdmin.rotMaxConsecutiveWorkdays"
  | "shiftAdmin.helpRotMaxConsecutiveWorkdays"
  | "shiftAdmin.rotMinFreeAfterStreak"
  | "shiftAdmin.helpRotMinFreeAfterStreak"
  | "shiftAdmin.rotMinRestHours"
  | "shiftAdmin.helpRotMinRestHours"
  | "shiftAdmin.rotMaxNightsMonth"
  | "shiftAdmin.helpRotMaxNightsMonth"
  | "shiftAdmin.rotMaxWeekendsMonth"
  | "shiftAdmin.helpRotMaxWeekendsMonth"
  | "shiftAdmin.rotFreeDaysAfterNight"
  | "shiftAdmin.helpRotFreeDaysAfterNight"
  | "shiftAdmin.rotFreeDaysAfterWeekend"
  | "shiftAdmin.helpRotFreeDaysAfterWeekend"
  | "shiftAdmin.rotNightToEarlyForbidden"
  | "shiftAdmin.helpRotNightToEarlyForbidden"
  | "shiftAdmin.rotLateToEarlyForbidden"
  | "shiftAdmin.helpRotLateToEarlyForbidden"
  | "shiftAdmin.rotSave"
  | "shiftAdmin.rotSaving"
  | "shiftAdmin.overtimeTitle"
  | "shiftAdmin.overtimeMax"
  | "shiftAdmin.helpOvertimeMax"
  | "shiftAdmin.overtimeMode"
  | "shiftAdmin.helpOvertimeMode"
  | "shiftAdmin.overtimeModeShow"
  | "shiftAdmin.overtimeModeWarn"
  | "shiftAdmin.overtimeModeHard"
  | "shiftAdmin.overtimeHint"
  /* ── Fairness ── */
  | "shiftAdmin.sectionFairness"
  | "shiftAdmin.helpSectionFairness"
  | "shiftAdmin.fairBalanceNights"
  | "shiftAdmin.helpFairBalanceNights"
  | "shiftAdmin.fairBalanceWeekends"
  | "shiftAdmin.helpFairBalanceWeekends"
  | "shiftAdmin.fairBalanceLoad"
  | "shiftAdmin.helpFairBalanceLoad"
  | "shiftAdmin.fairMaxDeviation"
  | "shiftAdmin.helpFairMaxDeviation"
  | "shiftAdmin.fairPriority"
  | "shiftAdmin.helpFairPriority"
  | "shiftAdmin.fairOptFairness"
  | "shiftAdmin.fairOptPreference"
  | "shiftAdmin.fairOptBalanced"
  | "shiftAdmin.fairSave"
  | "shiftAdmin.fairSaving"
  /* ── Planning ── */
  | "shiftAdmin.sectionPlanning"
  | "shiftAdmin.helpSectionPlanning"
  | "shiftAdmin.planRespectWishes"
  | "shiftAdmin.helpPlanRespectWishes"
  | "shiftAdmin.planTargetHours"
  | "shiftAdmin.helpPlanTargetHours"
  | "shiftAdmin.planHardRules"
  | "shiftAdmin.helpPlanHardRules"
  | "shiftAdmin.planSoftWishes"
  | "shiftAdmin.planFairness"
  | "shiftAdmin.planAdminOverride"
  | "shiftAdmin.planSave"
  | "shiftAdmin.planSaving"
  /* ── Issues / control ── */
  | "shiftAdmin.sectionIssues"
  | "shiftAdmin.sectionIssuesInfo"
  | "shiftAdmin.helpSectionIssues"
  | "shiftAdmin.issuePanel"
  | "shiftAdmin.issueAutoRefresh"
  | "shiftAdmin.issueShowSolutions"
  | "shiftAdmin.issuePriorityMode"
  | "shiftAdmin.issueModeStaffing"
  | "shiftAdmin.issueModeBalanced"
  | "shiftAdmin.issueModeFairness"
  /* ── Illness / replacement ── */
  | "shiftAdmin.sectionIllness"
  | "shiftAdmin.sectionIllnessInfo"
  | "shiftAdmin.helpSectionIllness"
  | "shiftAdmin.illnessAutoSwap"
  | "shiftAdmin.illnessSkillMatch"
  | "shiftAdmin.illnessProtectWLB"
  | "shiftAdmin.illnessBuffer"
  | "shiftAdmin.helpIllnessBuffer"
  | "shiftAdmin.illnessRestHours"
  /* ── Weekend ── */
  | "shiftAdmin.sectionWeekend"
  | "shiftAdmin.sectionWeekendInfo"
  | "shiftAdmin.helpSectionWeekend"
  | "shiftAdmin.weekendVolume"
  | "shiftAdmin.weekendBuffer"
  | "shiftAdmin.helpWeekendBuffer"
  | "shiftAdmin.weekendMinDispatchers"
  | "shiftAdmin.helpWeekendMinDispatchers"
  /* ── Skills ── */
  | "shiftAdmin.sectionSkills"
  | "shiftAdmin.sectionSkillsInfo"
  | "shiftAdmin.helpSectionSkills"
  | "shiftAdmin.skillsEnabled"
  | "shiftAdmin.helpSkillsEnabled"
  | "shiftAdmin.skillsEmployeeCount"
  | "shiftAdmin.skillsCatalogCount"
  | "shiftAdmin.skillsActive"
  | "shiftAdmin.skillsInactive"
  | "shiftAdmin.skillCatalog"
  | "shiftAdmin.helpSkillCatalog"
  | "shiftAdmin.skillAddPlaceholder"
  | "shiftAdmin.skillAdd"
  | "shiftAdmin.skillRateInfo"
  | "shiftAdmin.skillRatedCount"
  | "shiftAdmin.skillSave"
  | "shiftAdmin.skillSaving"
  /* ── Exclusions ── */
  | "shiftAdmin.sectionExclusions"
  | "shiftAdmin.helpSectionExclusions"
  | "shiftAdmin.exclSelectEmployee"
  | "shiftAdmin.exclExclude"
  | "shiftAdmin.exclEmpty"
  | "shiftAdmin.exclCreatedBy"
  | "shiftAdmin.exclRestore"
  /* ── Shared / toasts ── */
  | "shiftAdmin.advancedSave"
  | "shiftAdmin.advancedSaving"
  | "shiftAdmin.toastDefSaved"
  | "shiftAdmin.toastRotationSaved"
  | "shiftAdmin.toastFairnessSaved"
  | "shiftAdmin.toastPlanSaved"
  | "shiftAdmin.toastAdvancedSaved"
  | "shiftAdmin.toastDbsPoolSaved"
  | "shiftAdmin.toastDbsConfigSaved"
  | "shiftAdmin.toastExclAdded"
  | "shiftAdmin.toastExclRemoved"
  | "shiftAdmin.toastSkillSaved"
  | "shiftAdmin.toastSkillExists"
  | "shiftAdmin.error"
  | "shiftplan.title"
  | "shiftplan.shiftEarly"
  | "shiftplan.shiftLate"
  | "shiftplan.shiftNight"
  | "shiftplan.minStaffingViolated"
  | "shiftplan.minStaffingSolution"
  | "shiftplan.skillGapDetected"
  | "shiftplan.skillGapMeta"
  | "shiftplan.skillGapSolution"
  | "shiftplan.restTimeViolated"
  | "shiftplan.hardTransitionDetected"
  | "shiftplan.restTimeSolution"
  | "shiftplan.hardTransitionSolution"
  | "shiftplan.changesSaved"
  | "shiftplan.saveFailed"
  | "shiftplan.filenameMustContainYear"
  | "shiftplan.excelImportFailed"
  | "shiftplan.exportFailed"
  | "shiftplan.holidayTooltip"
  | "shiftplan.holidaysOn"
  | "shiftplan.holidays"
  | "shiftplan.noHolidays"
  | "shiftplan.changeShift"
  | "shiftplan.selectShift"
  | "shiftplan.emptyShift"
  | "shiftplan.early1"
  | "shiftplan.early2"
  | "shiftplan.late1"
  | "shiftplan.late2"
  | "shiftplan.offWeekend"
  | "shiftplan.absent"
  | "sc.statusDraft"
  | "sc.statusInReview"
  | "sc.statusApproved"
  | "sc.statusActivated"
  | "sc.statusFailed"
  | "sc.severityCritical"
  | "sc.severityRelevant"
  | "sc.severityHint"
  | "sc.title"
  | "sc.subtitle"
  | "sc.generating"
  | "sc.generateDraft"
  | "sc.shifts"
  | "sc.conflicts"
  | "sc.errors"
  | "sc.version"
  | "sc.created"
  | "sc.by"
  | "sc.on"
  | "sc.markInReview"
  | "sc.approve"
  | "sc.activatePlan"
  | "sc.excelExport"
  | "sc.discard"
  | "sc.activateModalTitle"
  | "sc.cannotBeUndone"
  | "sc.confirmActivate"
  | "sc.shiftPlanning"
  | "sc.noDraftHint"
  | "sc.generateFirstDraft"
  | "sc.activatedBy"
  | "sc.selectOrGenerateDraft"
  | "sc.draftVersionsFor"
  | "sc.noVersions"
  | "sc.status"
  | "sc.createdBy"
  | "sc.createdAt"
  | "sc.approvedBy"
  | "sc.note"
  | "sc.draftShiftPlan"
  | "sc.draftLabel"
  | "sc.target"
  | "sc.actual"
  | "sc.conflictCenter"
  | "sc.noConflicts"
  | "sc.explanationsPerAssignment"
  | "sc.noExplanations"
  | "sc.day"
  | "sc.noFairnessData"
  | "sc.fairnessOverview"
  | "sc.nights"
  | "sc.weekends"
  | "sc.earlyShifts"
  | "sc.early"
  | "sc.late"
  | "sc.deviation"
  | "sc.loadPlanningBasis"
  | "sc.planningBasisFor"
  | "sc.employees"
  | "sc.absences"
  | "sc.noAbsences"
  | "sc.permanentExclusions"
  | "sc.noExclusions"
  | "sc.skills"
  | "sc.minimumStaffing"
  | "sc.shift"
  | "sc.atLeast"
  | "sc.people"
  | "sc.noRulesDefined"
  | "sc.helpTitle"
  | "sc.confirmDeleteDraft"
  | "sc.tabOverview"
  | "sc.tabDraftView"
  | "sc.tabConflictCenter"
  | "sc.tabExplanations"
  | "sc.tabPlanningBasis"
  | "sc.tabVersions"
  | "sc.tabHelp"
  | "sc.exportFailed"
  | "sc.tabFairness"
  /* ── Admin Settings ── */
  | "admin.title"
  | "admin.subtitle"
  | "admin.controlCenter"
  | "admin.allSettings"
  | "admin.tilesDescription"
  | "admin.tabShiftplan"
  | "admin.tabShiftplanDesc"
  | "admin.tabTeamsDesc"
  | "admin.tabTv"
  | "admin.tabTvDesc"
  | "admin.tabThresholds"
  | "admin.tabThresholdsDesc"
  | "admin.tabTogglesDesc"
  | "admin.tabFeedback"
  | "admin.tabFeedbackDesc"
  | "admin.tabOdinDesc"
  | "admin.tabMaintenance"
  | "admin.tabMaintenanceDesc"
  | "admin.tabAudit"
  | "admin.tabAuditDesc"
  | "admin.tvConfigHint"
  | "admin.tvSlides"
  | "admin.tvHeaderNote"
  | "admin.durationSec"
  | "admin.duration"
  | "admin.order"
  | "admin.onlyWithData"
  | "admin.saveChanges"
  | "admin.lastChangedBy"
  | "admin.odinLogic"
  | "admin.odinLogicDesc"
  | "admin.ticketExclusions"
  | "admin.ticketExclusionsDesc"
  | "admin.employeeExclusions"
  | "admin.employeeExclusionsDesc"
  | "admin.manualExclusionList"
  | "admin.manualExclusionListDesc"
  | "admin.manualExclusionSubDesc"
  | "admin.permanentExclusions"
  | "admin.permanentExclusionsDesc"
  | "admin.resetTicketDb"
  | "admin.resetTicketDbDesc"
  | "admin.affectedAreas"
  | "admin.resetDbLiveDesc"
  | "admin.resetDialogTitle"
  | "admin.resetDialogDesc"
  | "admin.authPhrase"
  | "admin.auditNote"
  | "admin.auditNotePlaceholder"
  | "admin.runReset"
  | "admin.resetting"
  | "admin.crawlerStaleAfter"
  | "admin.minutes"
  | "admin.commitRiskBelow"
  | "admin.hours"
  | "admin.escalateAfter"
  | "admin.understaffingFrom"
  | "admin.missingPeople"
  | "admin.defaultSlideDuration"
  | "admin.fontScaleFactor"
  | "admin.compactCards"
  | "admin.autoScroll"
  | "admin.animations"
  | "admin.commitWindow"
  | "admin.showStaleTickets"
  | "admin.tvCrawlerStale"
  | "admin.globalThresholds"
  | "admin.tvModePresentation"
  | "admin.noToggles"
  | "admin.feedbackRules"
  | "admin.feedbackEnabled"
  | "admin.allowScreenshots"
  | "admin.maxFileSize"
  | "admin.submittedFeedback"
  | "admin.noFeedback"
  | "admin.from"
  | "admin.unknown"
  | "admin.feedbackOpen"
  | "admin.feedbackInProgress"
  | "admin.feedbackDone"
  | "admin.feedbackSetStatus"
  | "admin.feedbackDelete"
  | "admin.feedbackDeleteConfirm"
  | "admin.feedbackDeleteTitle"
  | "admin.feedbackDeleted"
  | "admin.feedbackStatusUpdated"
  | "admin.feedbackCancel"
  | "admin.allAreas"
  | "admin.appSettings"
  | "admin.timestamp"
  | "admin.area"
  | "admin.setting"
  | "admin.old"
  | "admin.new"
  | "admin.by"
  | "admin.note"
  | "admin.noChangesLogged"
  | "admin.on"
  /* ── Weekplan ── */
  | "weekplan.title"
  | "weekplan.today"
  | "weekplan.showActiveOnly"
  | "weekplan.editOn"
  | "weekplan.edit"
  | "weekplan.saveFailed"
  | "weekplan.roleHint"
  | "weekplan.changeShift"
  | "weekplan.selectShift"
  | "weekplan.empty"
  | "weekplan.apply"
  | "weekplan.roleFor"
  | "weekplan.roleForDays"
  | "weekplan.removeRole"
  | "weekplan.removeRoles"
  | "weekplan.loading"
  | "weekplan.highlightHint"
  | "weekplan.holiday"
  | "weekplan.daySelected"
  | "weekplan.daysSelected"
  /* ── Shift Context Menu ── */
  | "shiftContext.employee"
  | "shiftContext.daySelected"
  | "shiftContext.daysSelected"
  | "shiftContext.early1"
  | "shiftContext.early2"
  | "shiftContext.late1"
  | "shiftContext.late2"
  | "shiftContext.night"
  | "shiftContext.absence"
  | "shiftContext.vacation"
  | "shiftContext.sick"
  | "shiftContext.training"
  | "shiftContext.offsite"
  | "shiftContext.clearDelete"
  | "shiftContext.competencies"
  | "shiftContext.changeHistory"
  | "shiftContext.manageRules"
  | "shiftContext.halfShifts"
  | "shiftContext.halfEarly1"
  | "shiftContext.halfEarly2"
  | "shiftContext.halfLate1"
  | "shiftContext.halfLate2"
  /* ── Shiftplan extras ── */
  | "shiftplan.warningsTooltip"
  | "shiftplan.warningsOn"
  | "shiftplan.warnings"
  | "shiftplan.wellbeing"
  | "shiftplan.hiddenOn"
  | "shiftplan.hidden"
  /* ── ConstraintDialog ── */
  | "constraints.title"
  | "constraints.noNight"
  | "constraints.earlyOnly"
  | "constraints.maxWeekends"
  /* ── ExportMenu ── */
  | "export.options"
  | "export.menu"
  | "export.shiftplanXlsx"
  | "export.changeLog"
  | "export.noChanges"
  /* ── HistoryDialog ── */
  | "history.title"
  | "history.date"
  | "history.old"
  | "history.new"
  | "history.changedBy"
  | "history.timestamp"
  | "history.loading"
  | "history.noChanges"
  | "history.deleted"
  /* ── ShiftStatsPanel ── */
  | "stats.hide"
  | "stats.show"
  | "stats.nightShifts"
  | "stats.weekendShifts"
  | "stats.conflicts"
  /* ── CompetencyModal ── */
  | "competency.title"
  | "competency.basic"
  | "competency.advanced"
  | "competency.expert"
  | "competency.noCompetencies"
  | "competency.newCompetency"
  | "competency.skillPlaceholder"
  | "competency.level"
  | "competency.notesPlaceholder"
  | "competency.add"
  | "competency.addCompetency";

/* ─────────────────────────────────────────────────────────────────────── */
/*  TRANSLATIONS                                                           */
/* ─────────────────────────────────────────────────────────────────────── */

const TRANSLATIONS: Record<TranslationKey, Record<LanguageCode, string>> = {

  /* ── Common ── */
  "common.settings": { de: "Einstellungen", en: "Settings" },
  "common.logout": { de: "Abmelden", en: "Log out" },
  "common.language": { de: "Sprache", en: "Language" },
  "common.themeDark": { de: "Dunkel", en: "Dark" },
  "common.themeLight": { de: "Hell", en: "Light" },
  "common.noData": { de: "Keine Daten", en: "No data" },
  "common.loading": { de: "Lädt…", en: "Loading…" },
  "common.save": { de: "Speichern", en: "Save" },
  "common.saving": { de: "Speichern…", en: "Saving…" },
  "common.cancel": { de: "Abbrechen", en: "Cancel" },
  "common.apply": { de: "Übernehmen", en: "Apply" },
  "common.date": { de: "Datum", en: "Date" },
  "common.employee": { de: "Mitarbeiter", en: "Employee" },
  "common.close": { de: "Schließen", en: "Close" },
  "common.delete": { de: "Löschen", en: "Delete" },
  "common.refresh": { de: "Aktualisieren", en: "Refresh" },
  "common.total": { de: "Gesamt", en: "Total" },
  "common.active": { de: "Aktiv", en: "Active" },
  "common.peak": { de: "Peak", en: "Peak" },

  /* ── Navigation ── */
  "nav.dashboard": { de: "Dashboard", en: "Dashboard" },
  "nav.shiftplan": { de: "Schichtplan", en: "Shift plan" },
  "nav.handover": { de: "Handover", en: "Handover" },
  "nav.protokoll": { de: "Protokoll", en: "Log" },
  "nav.shiftplanControl": { de: "Schichtplaner", en: "Shift planner" },
  "nav.adminSettings": { de: "Admin-Einstellungen", en: "Admin settings" },
  "nav.userManagement": { de: "Benutzerverwaltung", en: "User management" },
  "nav.statistics": { de: "Statistiken", en: "Statistics" },
  "nav.weekPlanning": { de: "Wochenplanung", en: "Week planning" },
  "nav.dayPlanning": { de: "Tagesplanung", en: "Day planning" },
  "nav.teamsNotifications": { de: "Teams Benachrichtigungen", en: "Teams notifications" },
  "nav.automatedAssignment": { de: "Automatisierte Zuweisung", en: "Automated assignment" },
  "nav.operationsNode": { de: "Operations Dispatching and Intelligence Node", en: "Operations Dispatching and Intelligence Node" },

  /* ── Settings ── */
  "settings.title": { de: "EINSTELLUNGEN", en: "SETTINGS" },
  "settings.personalAppSettings": { de: "Persönliche App-Einstellungen", en: "Personal app settings" },
  "settings.changePassword": { de: "Passwort ändern", en: "Change password" },
  "settings.startPasswordChange": { de: "Startpasswort ändern", en: "Change starter password" },
  "settings.securityRequirement": { de: "Sicherheitsvorgabe", en: "Security requirement" },
  "settings.securityRequirementBody": { de: "Dieses Konto verwendet noch das initiale Passwort. Bitte ändere es jetzt. Bis dahin bleibt ODIN auf diese Seite beschränkt.", en: "This account is still using the initial password. Please change it now. Until then, ODIN remains limited to this page." },
  "settings.profile": { de: "Profil", en: "Profile" },
  "settings.name": { de: "Name", en: "Name" },
  "settings.email": { de: "E-Mail", en: "Email" },
  "settings.location": { de: "Standort", en: "Location" },
  "settings.team": { de: "Team", en: "Team" },
  "settings.activeSince": { de: "Aktiv seit", en: "Active since" },
  "settings.lastLogin": { de: "Letzter Login", en: "Last login" },
  "settings.app": { de: "App", en: "App" },
  "settings.language": { de: "Sprache", en: "Language" },
  "settings.theme": { de: "Theme", en: "Theme" },
  "settings.notifications": { de: "Benachrichtigungen", en: "Notifications" },
  "settings.emailNotifications": { de: "E-Mail Benachrichtigungen", en: "Email notifications" },
  "settings.browserNotifications": { de: "Browser Benachrichtigungen", en: "Browser notifications" },
  "settings.shiftReminders": { de: "Schicht-Erinnerungen", en: "Shift reminders" },
  "settings.shiftPreferences": { de: "Schichtplan-Wünsche", en: "Shift preferences" },
  "settings.shiftPreferencesBody": { de: "Lege deine bevorzugten und unerwünschten Schichten, verfügbare Tage und weitere Wünsche fest. Diese werden bei der automatischen Schichtplanung berücksichtigt.", en: "Define your preferred and unwanted shifts, available days, and further wishes. These are considered during automatic shift planning." },
  "settings.systemThresholds": { de: "System-Schwellenwerte", en: "System thresholds" },
  "settings.loading": { de: "Lade Einstellungen…", en: "Loading settings…" },


  /* ── Dashboard / Statistics ── */
  "stats.title": { de: "Team-Statistiken", en: "Team statistics" },
  "stats.refreshing": { de: "Aktualisierung…", en: "Refreshing…" },
  "stats.lastLabel": { de: "Zuletzt", en: "Last" },
  "stats.today": { de: "Heute", en: "Today" },
  "stats.other": { de: "Sonstige", en: "Other" },
  "stats.fetchError": { de: "Statistiken konnten nicht geladen werden.", en: "Statistics could not be loaded." },
  "stats.retryNow": { de: "Erneut laden", en: "Retry" },



  /* ── User Access ── */
  "userAccess.loadFailed": { de: "Konnte User-Rechte nicht laden", en: "Could not load user permissions" },
  "userAccess.saveFailed": { de: "Konnte Änderungen nicht speichern", en: "Could not save changes" },
  "userAccess.resetFailed": { de: "Konnte Overrides nicht zurücksetzen", en: "Could not reset overrides" },
  "userAccess.title": { de: "User Rechte", en: "User permissions" },
  "userAccess.department": { de: "Abteilung", en: "Department" },
  "userAccess.role": { de: "Rolle", en: "Role" },
  "userAccess.overrideHint": { de: "Kein Override gesetzt = Rollenstandard gilt. Setze Overrides nur wenn nötig.", en: "No override set = role default applies. Set overrides only when necessary." },
  "userAccess.loading": { de: "Lade Rechte…", en: "Loading permissions…" },
  "userAccess.standard": { de: "Standard", en: "Default" },
  "userAccess.departmentDefault": { de: "Abteilungsstandard", en: "Department default" },
  "userAccess.noAccess": { de: "Kein Zugriff", en: "No access" },
  "userAccess.read": { de: "Lesen", en: "Read" },
  "userAccess.write": { de: "Schreiben", en: "Write" },
  "userAccess.clearOverrides": { de: "Alle Overrides löschen", en: "Clear all overrides" },

  /* ── Group Access ── */
  "groupAccess.loadFailed": { de: "Konnte Abteilungen nicht laden", en: "Could not load departments" },
  "groupAccess.saveFailed": { de: "Speichern fehlgeschlagen", en: "Saving failed" },
  "groupAccess.keyLabelRequired": { de: "Key und Label sind erforderlich", en: "Key and label are required" },
  "groupAccess.createFailed": { de: "Abteilung konnte nicht erstellt werden", en: "Department could not be created" },
  "groupAccess.selectDepartment": { de: "Abteilung auswählen", en: "Select department" },
  "groupAccess.newDepartment": { de: "Neue Abteilung anlegen", en: "Create new department" },
  "groupAccess.keyPlaceholder": { de: "Key (z.\u00A0B. qa-team)", en: "Key (e.g. qa-team)" },
  "groupAccess.labelPlaceholder": { de: "Label (z.\u00A0B. QA Team)", en: "Label (e.g. QA Team)" },
  "groupAccess.create": { de: "Anlegen", en: "Create" },
  "groupAccess.hint": { de: "Hinweis: Keys werden automatisch normalisiert (Kleinschreibung, Bindestriche).", en: "Note: keys are normalised automatically (lowercase, hyphens)." },
  "groupAccess.page": { de: "Seite", en: "Page" },
  "groupAccess.departmentStandard": { de: "Abteilungsstandard", en: "Department default" },
  "groupAccess.selectAccess": { de: "Zugriff auswählen", en: "Select access" },
  "groupAccess.title": { de: "Abteilung Access (Pages)", en: "Department access (pages)" },
  "groupAccess.noAccess": { de: "Kein Zugriff", en: "No access" },
  "groupAccess.read": { de: "Lesen", en: "Read" },
  "groupAccess.write": { de: "Schreiben", en: "Write" },

  /* ── Add User ── */
  "addUser.createFailed": { de: "User konnte nicht angelegt werden", en: "User could not be created" },
  "addUser.title": { de: "User anlegen", en: "Create user" },
  "addUser.subtitle": { de: "Manuell angelegte Mitarbeiter werden per Jarvis SSO verifiziert und erhalten eine leere Dienstplanzeile.", en: "Manually added employees use Jarvis SSO and receive an empty schedule row." },
  "addUser.note": { de: "E-Mail und Nutzerkennung werden automatisch aus Vor- und Nachname erzeugt.", en: "Email and user identifier are generated automatically from first and last name." },
  "addUser.firstName": { de: "Vorname", en: "First name" },
  "addUser.lastName": { de: "Nachname", en: "Last name" },
  "addUser.loginName": { de: "SSO-Kennung", en: "SSO identifier" },
  "addUser.loginNamePlaceholder": { de: "Vorname@Nachname", en: "Firstname@Lastname" },
  "addUser.email": { de: "E-Mail (optional)", en: "Email (optional)" },
  "addUser.initialPassword": { de: "Startpasswort", en: "Initial password" },
  "addUser.passwordPlaceholder": { de: "Initiales Passwort für den ersten Login", en: "Initial password for the first login" },
  "addUser.location": { de: "Standort (IBX)", en: "Location (IBX)" },
  "addUser.locationPlaceholder": { de: "Standort auswählen", en: "Select location" },
  "addUser.department": { de: "Abteilung", en: "Department" },
  "addUser.departmentPlaceholder": { de: "Abteilung auswählen", en: "Select department" },
  "addUser.role": { de: "Rolle", en: "Role" },
  "addUser.submit": { de: "User anlegen", en: "Create user" },

  /* ── Holidays ── */
  "holidays.newYearsDay": { de: "Neujahr", en: "New Year's Day" },
  "holidays.labourDay": { de: "Tag der Arbeit", en: "Labour Day" },
  "holidays.germanUnityDay": { de: "Tag der Deutschen Einheit", en: "German Unity Day" },
  "holidays.christmasDay1": { de: "1. Weihnachtstag", en: "Christmas Day" },
  "holidays.christmasDay2": { de: "2. Weihnachtstag", en: "Boxing Day" },
  "holidays.goodFriday": { de: "Karfreitag", en: "Good Friday" },
  "holidays.easterMonday": { de: "Ostermontag", en: "Easter Monday" },
  "holidays.ascensionDay": { de: "Christi Himmelfahrt", en: "Ascension Day" },
  "holidays.whitMonday": { de: "Pfingstmontag", en: "Whit Monday" },
  "holidays.corpusChristi": { de: "Fronleichnam", en: "Corpus Christi" },
  "holidays.generic": { de: "Feiertag", en: "Public holiday" },
  /* ── AccessDenied ── */
  "accessDenied.title": { de: "Zugriff verweigert", en: "Access denied" },
  "accessDenied.message": { de: "Du hast keine Berechtigung, diese Seite aufzurufen.", en: "You do not have permission to open this page." },
  "accessDenied.backButton": { de: "Zurück", en: "Back" },
  /* ── ProjectsPanel ── */
  "projects.title": { de: "Projekte", en: "Projects" },
  "projects.subtitle": { de: "Projektstatus, Beschreibung und beteiligte Mitarbeiter zentral pflegen.", en: "Manage project status, descriptions, and participating employees in one place." },
  "projects.createNewProject": { de: "Neues Projekt erstellen", en: "Create new project" },
  "projects.projectNameLabel": { de: "Projektname *", en: "Project name *" },
  "projects.projectNamePlaceholder": { de: "Projektname", en: "Project name" },
  "projects.responsibleLabel": { de: "Verantwortlich", en: "Responsible" },
  "projects.responsiblePlaceholder": { de: "Name oder Team", en: "Name or team" },
  "projects.endDateLabel": { de: "Geplantes Enddatum", en: "Planned end date" },
  "projects.progressLabel": { de: "Fortschritt", en: "Progress" },
  "projects.descriptionLabel": { de: "Beschreibung", en: "Description" },
  "projects.descriptionPlaceholder": { de: "Optionale Beschreibung...", en: "Optional description..." },
  "projects.createProjectButton": { de: "Projekt erstellen", en: "Create project" },
  "projects.completedBadge": { de: "Abgeschlossen", en: "Completed" },
  "projects.overdue": { de: "überfällig", en: "overdue" },
  "projects.today": { de: "heute", en: "today" },
  "projects.markCompletedConfirm": { de: "Projekt als abgeschlossen markieren?", en: "Mark project as completed?" },
  "projects.loadingLabel": { de: "Lade Projekte...", en: "Loading projects..." },
  "projects.newProjectButton": { de: "Neues Projekt", en: "New project" },
  "projects.activeSection": { de: "Aktiv", en: "Active" },
  "projects.completedSection": { de: "Abgeschlossen", en: "Completed" },
  "projects.noProjects": { de: "Noch keine Projekte vorhanden.", en: "No projects available yet." },
  "projects.createFirstButton": { de: "Erstes Projekt erstellen", en: "Create first project" },
  "projects.participantsLabel": { de: "Teilnehmende Mitarbeiter", en: "Participating employees" },
  "projects.participantsHint": { de: "Mehrere Einträge mit Strg oder Umschalt auswählen.", en: "Use Ctrl or Shift to select multiple employees." },
  "projects.deleteConfirm": { de: "Projekt \"{name}\" wirklich löschen?", en: "Delete project \"{name}\"?" },
  /* ── TicketAudit ── */
  "ticketAudit.employee": { de: "Mitarbeiter", en: "Employee" },


  /* ── ShiftAdminSettings ── */
  "shiftAdmin.title": { de: "Schichtplaneinstellungen", en: "Shift plan settings" },
  "shiftAdmin.subtitle": { de: "Konfiguration aller Regeln, Wochenend-Varianten und DBS-Parameter", en: "Configuration of all rules, weekend variants, and DBS parameters" },
  "shiftAdmin.activeOn": { de: "Aktiv an", en: "Active on" },

  /* ── ShiftAdmin: Overview cards ── */
  "shiftAdmin.cardDefinitions": { de: "Schichtdesign", en: "Shift design" },
  "shiftAdmin.cardDefinitionsDesc": { de: "Aktive Definitionen, inklusive Wochenend-Varianten und DBS.", en: "Active definitions, including weekend variants and DBS." },
  "shiftAdmin.cardDbsPool": { de: "DBS-Pool", en: "DBS pool" },
  "shiftAdmin.cardDbsPoolDesc": { de: "Fest hinterlegte Mitarbeiter mit individuellem Monatslimit.", en: "Fixed employees with individual monthly limit." },
  "shiftAdmin.cardExclusions": { de: "Ausschlüsse", en: "Exclusions" },
  "shiftAdmin.cardExclusionsDesc": { de: "Mitarbeiter, die derzeit nicht in automatische Entwürfe einfließen.", en: "Employees currently excluded from automatic drafts." },

  /* ── ShiftAdmin: Shift definitions section ── */
  "shiftAdmin.sectionDefinitions": { de: "Schichtdefinitionen", en: "Shift definitions" },
  "shiftAdmin.sectionDefinitionsInfo": { de: "Die Wochentage steuern direkt, an welchen Tagen eine Schicht von der Engine gebaut wird. Für Nachtschichten kann zusätzlich exakt festgelegt werden, ob Beginn und Ende am Plan-Tag oder erst am Folgetag liegen.", en: "Weekdays directly control on which days a shift is built by the engine. For night shifts, you can additionally specify whether start and end fall on the planned day or the next day." },
  "shiftAdmin.helpSectionDefinitions": { de: "Hier werden alle Schichttypen verwaltet. Jede Schicht hat einen Code, Zeitfenster, Mindest-/Maximalbesetzung und kann auf bestimmte Wochentage beschränkt werden. Änderungen wirken sich auf die automatische Planung aus.", en: "Manage all shift types here. Each shift has a code, time window, min/max staffing and can be restricted to certain weekdays. Changes affect automatic planning." },
  "shiftAdmin.defCode": { de: "Code", en: "Code" },
  "shiftAdmin.defName": { de: "Name", en: "Name" },
  "shiftAdmin.defType": { de: "Typ", en: "Type" },
  "shiftAdmin.defFrom": { de: "Von", en: "From" },
  "shiftAdmin.defTo": { de: "Bis", en: "To" },
  "shiftAdmin.defHours": { de: "Stunden", en: "Hours" },
  "shiftAdmin.defMin": { de: "Min", en: "Min" },
  "shiftAdmin.defMax": { de: "Max", en: "Max" },
  "shiftAdmin.defColorStatus": { de: "Farbe und Status", en: "Color & status" },
  "shiftAdmin.defActive": { de: "Aktiv", en: "Active" },
  "shiftAdmin.defStartDay": { de: "Starttag", en: "Start day" },
  "shiftAdmin.defEndDay": { de: "Endtag", en: "End day" },
  "shiftAdmin.defTimeWindow": { de: "Zeitfenster", en: "Time window" },
  "shiftAdmin.defWeekdayPlanning": { de: "Planung pro Wochentag", en: "Planning per weekday" },
  "shiftAdmin.defSave": { de: "Schicht speichern", en: "Save shift" },
  "shiftAdmin.defSaving": { de: "Speichert…", en: "Saving…" },
  "shiftAdmin.typeEarly": { de: "Früh", en: "Early" },
  "shiftAdmin.typeLate": { de: "Spät", en: "Late" },
  "shiftAdmin.typeNight": { de: "Nacht", en: "Night" },
  "shiftAdmin.typeSpecial": { de: "Sonder", en: "Special" },
  "shiftAdmin.helpDefWeekdays": { de: "Nur an aktivierten Tagen wird die Schicht in die Tages-Slots aufgenommen. Damit lassen sich reine Samstag- oder Sa/So-Positionen direkt über die Definition steuern.", en: "The shift is only included on activated days. This lets you control Saturday-only or Sat/Sun positions directly via the definition." },
  "shiftAdmin.helpDefMinMax": { de: "Mindestbesetzung: So viele Mitarbeiter werden pro Schicht mindestens benötigt. Maximalbesetzung: Die Engine plant nie mehr als diese Zahl ein. 0 bei Min bedeutet optional.", en: "Minimum staffing: At least this many employees needed per shift. Maximum: The engine never plans more. 0 for min means optional." },
  "shiftAdmin.helpDefDayOffset": { de: "Bei Nachtschichten kann festgelegt werden, ob die Schicht am Plan-Tag beginnt und am Folgetag endet. Das ist wichtig für korrekte Überschneidungen und Ruhezeiten.", en: "For night shifts, you can specify if the shift starts on the planned day and ends the next. This is important for correct overlaps and rest periods." },

  /* ── ShiftAdmin: DBS configuration ── */
  "shiftAdmin.sectionDbs": { de: "DBS-Konfiguration", en: "DBS configuration" },
  "shiftAdmin.sectionDbsInfo": { de: "DBS (Deutsche Börse Services) wird mit einer festen Mitarbeitergruppe im Rotationsrhythmus geplant. Hier werden globale DBS-Parameter und der Mitarbeiterpool konfiguriert.", en: "DBS (Deutsche Börse Services) is planned with a fixed employee group in a rotation rhythm. Configure global DBS parameters and the employee pool here." },
  "shiftAdmin.helpSectionDbs": { de: "Der DBS-Bereich steuert, wie DBS-Schichten in die Schichtplanung integriert werden. DBS-Mitarbeiter werden bevorzugt für DBS-Schichten eingeplant und erst danach für andere Schichttypen berücksichtigt.", en: "The DBS section controls how DBS shifts are integrated into shift planning. DBS employees are prioritized for DBS shifts before being considered for other shift types." },
  "shiftAdmin.dbsEnabled": { de: "DBS aktiv", en: "DBS active" },
  "shiftAdmin.helpDbsEnabled": { de: "Wenn aktiv, werden DBS-Schichten in die automatische Planung einbezogen. Wenn deaktiviert, bleibt der Pool erhalten, aber DBS-Schichten werden nicht geplant. Sinnvoll bei temporärer Pause.", en: "When active, DBS shifts are included in automatic planning. When disabled, the pool is preserved but DBS shifts are not planned. Useful for temporary pauses." },
  "shiftAdmin.dbsRhythm": { de: "DBS-Rhythmus (Wochen)", en: "DBS rhythm (weeks)" },
  "shiftAdmin.helpDbsRhythm": { de: "Legt fest, in welchem Wochenrhythmus DBS-Einsätze geplant werden. Beispiel: 2 = alle zwei Wochen. 1 = jede Woche. Der Rhythmus startet ab dem Referenzdatum.", en: "Defines the weekly rhythm for DBS deployments. Example: 2 = every two weeks. 1 = every week. The rhythm starts from the reference date." },
  "shiftAdmin.dbsReferenceDate": { de: "Referenzdatum", en: "Reference date" },
  "shiftAdmin.helpDbsReferenceDate": { de: "Das Datum, ab dem der DBS-Rhythmus gezählt wird. An diesem Tag (bzw. in dieser Woche) beginnt der erste DBS-Zyklus. Leer = Beginn ab nächstem Monatsersten.", en: "The date from which the DBS rhythm is counted. The first DBS cycle starts on this day (or in this week). Empty = starts from next month's first day." },
  "shiftAdmin.dbsWeekdays": { de: "DBS-Wochentage", en: "DBS weekdays" },
  "shiftAdmin.helpDbsWeekdays": { de: "An welchen Wochentagen DBS-Einsätze stattfinden sollen. Standard: Montag bis Freitag. Kann bei Bedarf um Wochenende erweitert werden.", en: "On which weekdays DBS deployments should occur. Default: Monday to Friday. Can be extended to weekends if needed." },
  "shiftAdmin.dbsShiftCode": { de: "DBS-Schichttyp", en: "DBS shift type" },
  "shiftAdmin.helpDbsShiftCode": { de: "Welche Schichtdefinition für DBS-Einsätze verwendet wird. Standard ist 'DBS'. Kann bei abweichender Schicht-Konfiguration angepasst werden.", en: "Which shift definition is used for DBS deployments. Default is 'DBS'. Can be adjusted for different shift configurations." },
  "shiftAdmin.dbsRequiredStaff": { de: "DBS-Mindestbesetzung", en: "DBS min. staffing" },
  "shiftAdmin.helpDbsRequiredStaff": { de: "Wie viele Mitarbeiter pro DBS-Tag mindestens eingeplant werden müssen. 0 = wird nicht geprüft. Typisch ist 1.", en: "How many employees must be planned per DBS day at minimum. 0 = not checked. 1 is typical." },
  "shiftAdmin.dbsDefaultTarget": { de: "Standard Soll-Einsätze/Monat", en: "Default target deployments/month" },
  "shiftAdmin.helpDbsDefaultTarget": { de: "Globaler Standardwert für DBS-Einsätze pro Monat. Gilt als Fallback, wenn kein individueller Wert hinterlegt ist. Beispiel: 4 = ca. 1× pro Woche.", en: "Global default for DBS deployments per month. Used as fallback when no individual value is set. Example: 4 = approx. once per week." },
  "shiftAdmin.dbsPool": { de: "DBS-Mitarbeiter", en: "DBS employees" },
  "shiftAdmin.dbsSelectEmployee": { de: "Mitarbeiter für DBS auswählen…", en: "Select employee for DBS…" },
  "shiftAdmin.dbsMonthlyDays": { de: "DBS-Tage pro Monat", en: "DBS days per month" },
  "shiftAdmin.helpDbsMonthlyDays": { de: "Maximale Anzahl an DBS-Einsatztagen pro Monat für diesen Mitarbeiter. 0 = Standard-Sollwert wird verwendet. Ermöglicht individuelle Steuerung bei Teilzeit oder Sondervereinbarungen.", en: "Maximum number of DBS deployment days per month for this employee. 0 = default target is used. Allows individual control for part-time or special agreements." },
  "shiftAdmin.dbsAddEmployee": { de: "Mitarbeiter hinzufügen", en: "Add employee" },
  "shiftAdmin.dbsRemove": { de: "Entfernen", en: "Remove" },
  "shiftAdmin.dbsSaveConfig": { de: "DBS-Konfiguration speichern", en: "Save DBS configuration" },
  "shiftAdmin.dbsSavePool": { de: "DBS-Pool speichern", en: "Save DBS pool" },
  "shiftAdmin.dbsSavingConfig": { de: "Speichert…", en: "Saving…" },
  "shiftAdmin.dbsSavingPool": { de: "Speichert…", en: "Saving…" },
  "shiftAdmin.dbsEmptyPool": { de: "Noch kein DBS-Pool hinterlegt.", en: "No DBS pool configured yet." },
  "shiftAdmin.dbsDisabledHint": { de: "DBS ist derzeit deaktiviert. Der Pool bleibt erhalten, aber DBS-Schichten werden nicht automatisch geplant.", en: "DBS is currently disabled. The pool is preserved but DBS shifts are not automatically planned." },

  /* ── ShiftAdmin: Rotation & overtime ── */
  "shiftAdmin.sectionRotation": { de: "Rotationsregeln & Arbeitszeitgrenzen", en: "Rotation rules & working time limits" },
  "shiftAdmin.helpSectionRotation": { de: "Diese Regeln definieren harte Grenzen für die automatische Schichtplanung. Verletzungen werden von der Engine nicht zugelassen. Überstundengrenzen steuern die maximale Zusatzbelastung pro Monat.", en: "These rules define hard limits for automatic shift planning. Violations are not permitted by the engine. Overtime limits control maximum additional workload per month." },
  "shiftAdmin.rotMaxConsecutiveSame": { de: "Max. gleiche Schichten hintereinander", en: "Max. consecutive identical shifts" },
  "shiftAdmin.helpRotMaxConsecutiveSame": { de: "Wie viele Tage in Folge ein Mitarbeiter dieselbe Schichtart arbeiten darf. Beispiel: 5 = maximal 5 Frühschichten am Stück. Verhindert monotone Belastung.", en: "How many consecutive days an employee may work the same shift type. Example: 5 = max 5 early shifts in a row. Prevents monotonous workload." },
  "shiftAdmin.rotMaxConsecutiveWorkdays": { de: "Max. Arbeitstage in Folge", en: "Max. consecutive workdays" },
  "shiftAdmin.helpRotMaxConsecutiveWorkdays": { de: "Maximale Anzahl aufeinanderfolgender Arbeitstage, bevor ein freier Tag eingeplant werden muss. Gesetzlich in DE oft 6, intern häufig 5.", en: "Maximum consecutive workdays before a free day must be scheduled. Legally often 6 in DE, internally often 5." },
  "shiftAdmin.rotMinFreeAfterStreak": { de: "Min. freie Tage nach Serie", en: "Min. free days after streak" },
  "shiftAdmin.helpRotMinFreeAfterStreak": { de: "Mindestanzahl freier Tage nach einer durchgängigen Arbeitsserie. Beispiel: 1 = mindestens ein freier Tag nach Ablauf der maximalen Serie.", en: "Minimum free days after a continuous work streak. Example: 1 = at least one free day after the maximum streak runs out." },
  "shiftAdmin.rotMinRestHours": { de: "Min. Ruhestunden zwischen Schichten", en: "Min. rest hours between shifts" },
  "shiftAdmin.helpRotMinRestHours": { de: "Minimale Ruhezeit in Stunden zwischen zwei aufeinanderfolgenden Schichten. Gesetzlich in DE mindestens 11 Stunden. Verhindert z.B. Spät→Früh ohne Pause.", en: "Minimum rest time in hours between two consecutive shifts. Legally 11h minimum in DE. Prevents e.g. Late→Early without break." },
  "shiftAdmin.rotMaxNightsMonth": { de: "Max. Nachtschichten pro Monat", en: "Max. night shifts per month" },
  "shiftAdmin.helpRotMaxNightsMonth": { de: "Maximale Anzahl an Nachtschichten, die ein Mitarbeiter pro Monat erhält. 0 = keine Begrenzung. Dient dem Gesundheitsschutz.", en: "Maximum night shifts per employee per month. 0 = no limit. Serves health protection." },
  "shiftAdmin.rotMaxWeekendsMonth": { de: "Max. Wochenenden pro Monat", en: "Max. weekends per month" },
  "shiftAdmin.helpRotMaxWeekendsMonth": { de: "Maximale Anzahl an Wochenenden (Sa/So), an denen ein Mitarbeiter arbeiten darf. 0 = keine Begrenzung. Ein Wochenende zählt, sobald Sa oder So belegt ist.", en: "Maximum weekends (Sat/Sun) an employee may work. 0 = no limit. A weekend counts if Saturday or Sunday is occupied." },
  "shiftAdmin.rotFreeDaysAfterNight": { de: "Freie Tage nach Nachtschicht", en: "Free days after night shift" },
  "shiftAdmin.helpRotFreeDaysAfterNight": { de: "Anzahl freier Tage, die nach einer Nachtschicht automatisch eingeplant werden. Üblich sind 1-2 Tage für Erholung.", en: "Free days automatically scheduled after a night shift. 1-2 days for recovery is common." },
  "shiftAdmin.rotFreeDaysAfterWeekend": { de: "Freie Tage nach Wochenende", en: "Free days after weekend" },
  "shiftAdmin.helpRotFreeDaysAfterWeekend": { de: "Anzahl freier Tage nach einem Wochenenddienst. Sorgt dafür, dass Wochenendarbeit durch Freizeit kompensiert wird.", en: "Free days after weekend duty. Ensures weekend work is compensated with time off." },
  "shiftAdmin.rotNightToEarlyForbidden": { de: "Nacht → Früh verboten", en: "Night → Early forbidden" },
  "shiftAdmin.helpRotNightToEarlyForbidden": { de: "Verhindert, dass direkt nach einer Nachtschicht eine Frühschicht folgt. Ohne diese Regel wäre die Ruhezeit zu kurz.", en: "Prevents an early shift directly after a night shift. Without this rule, rest time would be too short." },
  "shiftAdmin.rotLateToEarlyForbidden": { de: "Spät → Früh verboten", en: "Late → Early forbidden" },
  "shiftAdmin.helpRotLateToEarlyForbidden": { de: "Verhindert, dass direkt nach einer Spätschicht eine Frühschicht folgt. Schützt die gesetzliche Ruhezeit von 11 Stunden.", en: "Prevents an early shift directly after a late shift. Protects the legally required 11-hour rest period." },
  "shiftAdmin.rotSave": { de: "Rotationsregeln speichern", en: "Save rotation rules" },
  "shiftAdmin.rotSaving": { de: "Speichert…", en: "Saving…" },
  "shiftAdmin.overtimeTitle": { de: "Überstundenbegrenzung", en: "Overtime limits" },
  "shiftAdmin.overtimeMax": { de: "Max. Überstunden pro Monat", en: "Max. overtime hours per month" },
  "shiftAdmin.helpOvertimeMax": { de: "Maximale Überstunden in Stunden pro Monat und Mitarbeiter. 0 = keine Begrenzung (undefiniert). Die Überstunden werden gegen die monatliche Sollzeit geprüft.", en: "Maximum overtime hours per month per employee. 0 = no limit (undefined). Overtime is checked against the monthly target hours." },
  "shiftAdmin.overtimeMode": { de: "Überstunden-Modus", en: "Overtime enforcement mode" },
  "shiftAdmin.helpOvertimeMode": { de: "Bestimmt, wie die Engine mit Überstunden umgeht. 'Nur anzeigen' markiert Überschreitungen visuell. 'Warnen' zeigt zusätzlich Hinweise im Problem-Panel. 'Hart begrenzen' verhindert Planungen, die das Limit überschreiten.", en: "Determines how the engine handles overtime. 'Show only' marks violations visually. 'Warn' also shows hints in the issue panel. 'Hard limit' prevents plans exceeding the limit." },
  "shiftAdmin.overtimeModeShow": { de: "Nur anzeigen", en: "Show only" },
  "shiftAdmin.overtimeModeWarn": { de: "Warnen", en: "Warn" },
  "shiftAdmin.overtimeModeHard": { de: "Hart begrenzen", en: "Hard limit" },
  "shiftAdmin.overtimeHint": { de: "0 = keine Begrenzung", en: "0 = no limit" },

  /* ── ShiftAdmin: Fairness ── */
  "shiftAdmin.sectionFairness": { de: "Fairness & Belastungsausgleich", en: "Fairness & workload balance" },
  "shiftAdmin.helpSectionFairness": { de: "Fairnessregeln sorgen dafür, dass unbeliebte Schichten (Nacht, Wochenende) und die Gesamtbelastung gleichmäßig verteilt werden. Die Engine optimiert innerhalb der erlaubten Abweichung.", en: "Fairness rules ensure that unpopular shifts (night, weekend) and total workload are evenly distributed. The engine optimizes within the allowed deviation." },
  "shiftAdmin.fairBalanceNights": { de: "Nachtschichten ausgleichen", en: "Balance night shifts" },
  "shiftAdmin.helpFairBalanceNights": { de: "Verteilt Nachtschichten über den Monat gleichmäßig auf alle Mitarbeiter. Verhindert, dass einzelne Personen überproportional viele Nächte arbeiten.", en: "Distributes night shifts evenly across all employees over the month. Prevents individuals from working disproportionately many nights." },
  "shiftAdmin.fairBalanceWeekends": { de: "Wochenenden ausgleichen", en: "Balance weekends" },
  "shiftAdmin.helpFairBalanceWeekends": { de: "Verteilt Wochenendschichten gleichmäßig. Wenn aktiviert, bekommt kein Mitarbeiter deutlich mehr Wochenenddienste als andere.", en: "Distributes weekend shifts evenly. When active, no employee gets significantly more weekend duties than others." },
  "shiftAdmin.fairBalanceLoad": { de: "Gesamtbelastung ausgleichen", en: "Balance total workload" },
  "shiftAdmin.helpFairBalanceLoad": { de: "Gleicht die gesamte Stundenbelastung zwischen Mitarbeitern aus. Berücksichtigt alle Schichttypen und sorgt für faire Arbeitszeitverteilung.", en: "Balances total hour workload between employees. Considers all shift types and ensures fair working time distribution." },
  "shiftAdmin.fairMaxDeviation": { de: "Max. Abweichung (%)", en: "Max. deviation (%)" },
  "shiftAdmin.helpFairMaxDeviation": { de: "Maximale Abweichung in Prozent vom Durchschnitt. Beispiel: 15% bedeutet, kein Mitarbeiter darf mehr als 15% über oder unter dem Teamschnitt liegen.", en: "Maximum percentage deviation from the average. Example: 15% means no employee may be more than 15% above or below the team average." },
  "shiftAdmin.fairPriority": { de: "Priorität", en: "Priority" },
  "shiftAdmin.helpFairPriority": { de: "Bestimmt, ob bei Konflikten Fairness oder Mitarbeiterpräferenzen Vorrang haben. 'Ausgewogen' versucht beides zu berücksichtigen.", en: "Determines whether fairness or employee preferences take precedence in conflicts. 'Balanced' tries to consider both." },
  "shiftAdmin.fairOptFairness": { de: "Fairness priorisieren", en: "Prioritize fairness" },
  "shiftAdmin.fairOptPreference": { de: "Präferenzen priorisieren", en: "Prioritize preferences" },
  "shiftAdmin.fairOptBalanced": { de: "Ausgewogen", en: "Balanced" },
  "shiftAdmin.fairSave": { de: "Fairnessregeln speichern", en: "Save fairness rules" },
  "shiftAdmin.fairSaving": { de: "Speichert…", en: "Saving…" },

  /* ── ShiftAdmin: Planning config ── */
  "shiftAdmin.sectionPlanning": { de: "Planungsgewichtung", en: "Planning weights" },
  "shiftAdmin.helpSectionPlanning": { de: "Steuert, wie die Engine bei der automatischen Planung Regeln, Wünsche und Fairness gegeneinander abwägt. Höhere Prozentwerte bedeuten stärkeren Einfluss.", en: "Controls how the engine weighs rules, wishes and fairness during automatic planning. Higher percentages mean stronger influence." },
  "shiftAdmin.planRespectWishes": { de: "Mitarbeiterwünsche berücksichtigen", en: "Respect employee wishes" },
  "shiftAdmin.helpPlanRespectWishes": { de: "Wenn aktiv, fließen individuelle Schichtwünsche der Mitarbeiter in die Planung ein. Wenn deaktiviert, plant die Engine rein nach Regeln und Fairness.", en: "When active, individual shift wishes are included in planning. When disabled, the engine plans purely by rules and fairness." },
  "shiftAdmin.planTargetHours": { de: "Monatliche Sollzeit (Std.)", en: "Monthly target hours" },
  "shiftAdmin.helpPlanTargetHours": { de: "Durchschnittliche Ziel-Arbeitsstunden pro Monat und Mitarbeiter. Das konkrete Monats-Soll richtet sich nach den Werktagen (Mo–Fr): Jahres-Soll × Werktage des Monats / Werktage des Jahres (z. B. 21 Werktage ≈ 168 h, 22 Werktage ≈ 176 h). 0 = kein festes Ziel.", en: "Average target work hours per month per employee. The actual month target follows the Mon–Fri working days: annual target × month weekdays / year weekdays (e.g. 21 weekdays ≈ 168 h, 22 weekdays ≈ 176 h). 0 = no fixed target." },
  "shiftAdmin.planHardRules": { de: "Harte Regeln (%)", en: "Hard rules (%)" },
  "shiftAdmin.helpPlanHardRules": { de: "Gewichtung der harten Regeln (Rotation, Ruhezeiten, Maximalwerte). 100% = Regeln werden nie verletzt, auch wenn die Planung dadurch Lücken hat.", en: "Weight of hard rules (rotation, rest times, limits). 100% = rules are never violated, even if it causes planning gaps." },
  "shiftAdmin.planSoftWishes": { de: "Wünsche (%)", en: "Wishes (%)" },
  "shiftAdmin.planFairness": { de: "Fairness (%)", en: "Fairness (%)" },
  "shiftAdmin.planAdminOverride": { de: "Admin-Vorgaben Gewichtung", en: "Admin override weight" },
  "shiftAdmin.planSave": { de: "Planungskonfiguration speichern", en: "Save planning config" },
  "shiftAdmin.planSaving": { de: "Speichert…", en: "Saving…" },

  /* ── ShiftAdmin: Issues / control ── */
  "shiftAdmin.sectionIssues": { de: "Problemerkennung und Leitstand", en: "Issue detection & control panel" },
  "shiftAdmin.sectionIssuesInfo": { de: "Diese Einstellungen steuern die Problem- und Lösungsansicht im Schichtplan. Bestehende Mindestbesetzungsregeln bleiben die fachliche Grundlage, die Oberfläche priorisiert nur ihre Darstellung.", en: "These settings control the issue and solution view in the shift plan. Existing minimum staffing rules remain the technical basis; the interface only prioritizes their display." },
  "shiftAdmin.helpSectionIssues": { de: "Das Problem-Panel zeigt Besetzungslücken, Regelverletzungen und andere Planungsprobleme direkt im Schichtplan an. Lösungsvorschläge helfen bei der schnellen Behebung.", en: "The issue panel shows staffing gaps, rule violations and other planning problems directly in the shift plan. Solution suggestions help with quick resolution." },
  "shiftAdmin.issuePanel": { de: "Problem-Panel im Schichtplan aktivieren", en: "Enable issue panel in shift plan" },
  "shiftAdmin.issueAutoRefresh": { de: "Hinweise nach Berechnung automatisch aktualisieren", en: "Auto-refresh issues after calculation" },
  "shiftAdmin.issueShowSolutions": { de: "Lösungsvorschläge im Panel anzeigen", en: "Show solution suggestions in panel" },
  "shiftAdmin.issuePriorityMode": { de: "Priorisierungsmodus", en: "Priority mode" },
  "shiftAdmin.issueModeStaffing": { de: "Besetzung zuerst", en: "Staffing first" },
  "shiftAdmin.issueModeBalanced": { de: "Ausgewogen", en: "Balanced" },
  "shiftAdmin.issueModeFairness": { de: "Fairness zuerst", en: "Fairness first" },

  /* ── ShiftAdmin: Illness / replacement ── */
  "shiftAdmin.sectionIllness": { de: "Autonome Krankheits- und Ersatzplanung", en: "Autonomous illness & replacement planning" },
  "shiftAdmin.sectionIllnessInfo": { de: "Diese Regeln schaffen die Grundlage für automatische Schichtwechsel bei Krankheit. Die eigentliche Automatik wird aktiviert, wenn der Autopilot-Lauf implementiert ist.", en: "These rules lay the groundwork for automatic shift swaps during illness. The actual automation activates when the autopilot run is implemented." },
  "shiftAdmin.helpSectionIllness": { de: "Definiert die Rahmenbedingungen für automatische Ersatzsuche bei Krankheitsausfall. Der Autopilot prüft Quellschicht-Puffer, Ruhezeiten und Skill-Übereinstimmung.", en: "Defines the framework for automatic replacement search during illness. The autopilot checks source shift buffer, rest times and skill matching." },
  "shiftAdmin.illnessAutoSwap": { de: "Automatische Ersatzsuche bei Krankheit vorbereiten", en: "Prepare automatic replacement for illness" },
  "shiftAdmin.illnessSkillMatch": { de: "Skill-Match als Pflichtkriterium erzwingen", en: "Require skill match as mandatory" },
  "shiftAdmin.illnessProtectWLB": { de: "Work-Life-Balance bei automatischen Vorschlägen schützen", en: "Protect work-life balance in automatic suggestions" },
  "shiftAdmin.illnessBuffer": { de: "Min. Puffer in der Quellschicht", en: "Min. buffer in source shift" },
  "shiftAdmin.helpIllnessBuffer": { de: "Mindestanzahl an Mitarbeitern, die in der Quellschicht verbleiben müssen, bevor ein Tausch erlaubt ist. Verhindert, dass durch Ersatzsuche eine andere Schicht unterbesetzt wird.", en: "Minimum employees that must remain in the source shift before a swap is allowed. Prevents understaffing another shift through replacement search." },
  "shiftAdmin.illnessRestHours": { de: "Min. Ruhezeit in Stunden", en: "Min. rest hours" },

  /* ── ShiftAdmin: Weekend ── */
  "shiftAdmin.sectionWeekend": { de: "Wochenendplanung nach Ticketvolumen", en: "Weekend planning by ticket volume" },
  "shiftAdmin.sectionWeekendInfo": { de: "Hier wird vorbereitet, dass Wochenendbesetzung später automatisch aus Ticketlast und Sicherheitsaufschlag abgeleitet werden kann.", en: "Prepares automatic weekend staffing derivation from ticket load and safety buffer." },
  "shiftAdmin.helpSectionWeekend": { de: "Die Wochenendplanung kann sich dynamisch an das tatsächliche Ticketvolumen anpassen. Der Sicherheitsaufschlag stellt sicher, dass auch bei Schwankungen genug Personal vorhanden ist.", en: "Weekend planning can dynamically adapt to actual ticket volume. The safety buffer ensures enough staff even during fluctuations." },
  "shiftAdmin.weekendVolume": { de: "Wochenendplanung auf Ticketvolumen vorbereiten", en: "Prepare weekend planning by ticket volume" },
  "shiftAdmin.weekendBuffer": { de: "Sicherheitsaufschlag (%)", en: "Safety buffer (%)" },
  "shiftAdmin.helpWeekendBuffer": { de: "Prozentualer Aufschlag auf das berechnete Wochenend-Ticketvolumen. Beispiel: 15% = 15% mehr Personal als das Minimum. Schützt gegen unerwartete Peaks.", en: "Percentage margin on calculated weekend ticket volume. Example: 15% = 15% more staff than minimum. Protects against unexpected peaks." },
  "shiftAdmin.weekendMinDispatchers": { de: "Min. Dispatcher am Wochenende", en: "Min. dispatchers on weekend" },
  "shiftAdmin.helpWeekendMinDispatchers": { de: "Absolute Mindestanzahl an Dispatchern, die unabhängig vom Ticketvolumen am Wochenende eingeplant werden. 0 = keine feste Untergrenze.", en: "Absolute minimum dispatchers scheduled on weekends regardless of ticket volume. 0 = no fixed lower bound." },

  /* ── ShiftAdmin: Skills ── */
  "shiftAdmin.sectionSkills": { de: "Skills und Kompetenzmatrix", en: "Skills & competency matrix" },
  "shiftAdmin.sectionSkillsInfo": { de: "Hier kann eine detaillierte Skill-Matrix pro Mitarbeiter gepflegt werden. Die Matrix ist optional aktivierbar und startet getrennt von den bestehenden Coverage-Merkmalen.", en: "Maintain a detailed skill matrix per employee here. The matrix can be optionally activated and starts separately from existing coverage attributes." },
  "shiftAdmin.helpSectionSkills": { de: "Die Skill-Matrix bewertet Mitarbeiter von 1-5 in verschiedenen Kompetenzbereichen. Wenn aktiviert, nutzt die Engine diese Bewertungen bei der Schichtzuteilung für optimale Besetzung.", en: "The skill matrix rates employees 1-5 in various competency areas. When active, the engine uses these ratings for optimal staffing during shift allocation." },
  "shiftAdmin.skillsEnabled": { de: "Skill-Matrix aktivieren", en: "Enable skill matrix" },
  "shiftAdmin.helpSkillsEnabled": { de: "Wenn aktiv, wird die Skill-Matrix in der Schichtplanung als Bewertungskriterium verwendet. Im deaktivierten Zustand bleibt sie reine Stammdatenpflege ohne Einfluss auf die Planung.", en: "When active, the skill matrix is used as an evaluation criterion in shift planning. When disabled, it remains pure master data maintenance without planning influence." },
  "shiftAdmin.skillsEmployeeCount": { de: "Mitarbeiter", en: "Employees" },
  "shiftAdmin.skillsCatalogCount": { de: "Skills im Katalog", en: "Skills in catalog" },
  "shiftAdmin.skillsActive": { de: "Die Skill-Matrix ist aktiv. Bewertete Skills fließen in die automatische Schichtplanung ein.", en: "The skill matrix is active. Rated skills are included in automatic shift planning." },
  "shiftAdmin.skillsInactive": { de: "Die Skill-Matrix ist derzeit nur gepflegt, aber nicht aktiv. Skills beeinflussen die Planung nicht.", en: "The skill matrix is maintained but not active. Skills do not affect planning." },
  "shiftAdmin.skillCatalog": { de: "Skill-Katalog", en: "Skill catalog" },
  "shiftAdmin.helpSkillCatalog": { de: "Lege hier die Skill-Namen fest, die im Team bewertet werden sollen. Sterne bedeuten 1 bis 5 Kompetenzstufen. Ein erneuter Klick auf denselben Stern entfernt die Bewertung.", en: "Define skill names to be rated in the team. Stars mean 1 to 5 competency levels. Clicking the same star again removes the rating." },
  "shiftAdmin.skillAddPlaceholder": { de: "Neuen Skill hinzufügen…", en: "Add new skill…" },
  "shiftAdmin.skillAdd": { de: "Skill hinzufügen", en: "Add skill" },
  "shiftAdmin.skillRateInfo": { de: "Bewerte die vorhandenen Skills mit 1 bis 5 Sternen. 0 = noch nicht bewertet.", en: "Rate existing skills with 1 to 5 stars. 0 = not yet rated." },
  "shiftAdmin.skillRatedCount": { de: "Bewertete Skills", en: "Rated skills" },
  "shiftAdmin.skillSave": { de: "Skill-Matrix speichern", en: "Save skill matrix" },
  "shiftAdmin.skillSaving": { de: "Speichert…", en: "Saving…" },

  /* ── ShiftAdmin: Exclusions ── */
  "shiftAdmin.sectionExclusions": { de: "Mitarbeiter-Ausschlüsse", en: "Employee exclusions" },
  "shiftAdmin.helpSectionExclusions": { de: "Ausgeschlossene Mitarbeiter werden nicht in automatisch generierte Schichtplan-Entwürfe aufgenommen. Der Ausschluss kann jederzeit aufgehoben werden.", en: "Excluded employees are not included in automatically generated shift plan drafts. The exclusion can be lifted at any time." },
  "shiftAdmin.exclSelectEmployee": { de: "Mitarbeiter auswählen…", en: "Select employee…" },
  "shiftAdmin.exclExclude": { de: "Ausschließen", en: "Exclude" },
  "shiftAdmin.exclEmpty": { de: "Keine Mitarbeiter ausgeschlossen.", en: "No employees excluded." },
  "shiftAdmin.exclCreatedBy": { de: "Angelegt von", en: "Created by" },
  "shiftAdmin.exclRestore": { de: "Zurück in Planung", en: "Restore to planning" },

  /* ── ShiftAdmin: Shared / toasts ── */
  "shiftAdmin.advancedSave": { de: "Leitstand & Autopilot speichern", en: "Save control & autopilot" },
  "shiftAdmin.advancedSaving": { de: "Speichert…", en: "Saving…" },
  "shiftAdmin.toastDefSaved": { de: "Schichtdefinition gespeichert", en: "Shift definition saved" },
  "shiftAdmin.toastRotationSaved": { de: "Rotationsregeln gespeichert", en: "Rotation rules saved" },
  "shiftAdmin.toastFairnessSaved": { de: "Fairnessregeln gespeichert", en: "Fairness rules saved" },
  "shiftAdmin.toastPlanSaved": { de: "Planungskonfiguration gespeichert", en: "Planning configuration saved" },
  "shiftAdmin.toastAdvancedSaved": { de: "Leitstand-Einstellungen gespeichert", en: "Control settings saved" },
  "shiftAdmin.toastDbsPoolSaved": { de: "DBS-Pool gespeichert", en: "DBS pool saved" },
  "shiftAdmin.toastDbsConfigSaved": { de: "DBS-Konfiguration gespeichert", en: "DBS configuration saved" },
  "shiftAdmin.toastExclAdded": { de: "Mitarbeiter von Schichtplanung ausgeschlossen", en: "Employee excluded from shift planning" },
  "shiftAdmin.toastExclRemoved": { de: "Ausschluss aufgehoben", en: "Exclusion removed" },
  "shiftAdmin.toastSkillSaved": { de: "Skill-Matrix gespeichert", en: "Skill matrix saved" },
  "shiftAdmin.toastSkillExists": { de: "Skill existiert bereits", en: "Skill already exists" },
  "shiftAdmin.error": { de: "Fehler", en: "Error" },

  /* ── Shiftplan ── */
  "shiftplan.title": { de: "SCHICHTPLAN", en: "SHIFT PLAN" },
  "shiftplan.shiftEarly": { de: "Früh", en: "Early" },
  "shiftplan.shiftLate": { de: "Spät", en: "Late" },
  "shiftplan.shiftNight": { de: "Nacht", en: "Night" },
  "shiftplan.minStaffingViolated": { de: "Mindestbesetzung verletzt", en: "Minimum staffing violated" },
  "shiftplan.minStaffingSolution": { de: "Mindeststaffing-Regel für diesen Tag prüfen und gezielt Mitarbeiter mit passender Schichtfähigkeit nachziehen.", en: "Review the minimum staffing rule for this day and add employees with matching shift capability." },
  "shiftplan.skillGapDetected": { de: "Skill-Lücke erkannt", en: "Skill gap detected" },
  "shiftplan.skillGapMeta": { de: "Skill-Lücke", en: "Skill gap" },
  "shiftplan.skillGapSolution": { de: "Mitarbeiter mit passender Skill-Matrix einplanen oder die Schichtbesetzung so tauschen, dass die Mindestskills erhalten bleiben.", en: "Plan employees with the right skill matrix or rebalance shifts so required skills remain covered." },
  "shiftplan.restTimeViolated": { de: "Ruhezeit verletzt", en: "Rest time violated" },
  "shiftplan.hardTransitionDetected": { de: "Harter Schichtwechsel erkannt", en: "Hard shift transition detected" },
  "shiftplan.restTimeSolution": { de: "Genug Ruhezeit herstellen, indem der Folgetag auf frei oder eine spätere Schicht umgestellt wird.", en: "Restore sufficient rest time by changing the following day to off-duty or a later shift." },
  "shiftplan.hardTransitionSolution": { de: "Wechselkette glätten und harte Sprünge zwischen Nacht-, Spät- und Frühschicht reduzieren.", en: "Smooth the shift sequence and reduce hard jumps between night, late, and early shifts." },
  "shiftplan.changesSaved": { de: "Änderungen erfolgreich gespeichert", en: "Changes saved successfully" },
  "shiftplan.saveFailed": { de: "Speichern fehlgeschlagen", en: "Saving failed" },
  "shiftplan.filenameMustContainYear": { de: "Dateiname muss ein Jahr enthalten (z. B. 2026)", en: "Filename must contain a year (for example 2026)" },
  "shiftplan.excelImportFailed": { de: "Fehler beim Excel-Import", en: "Excel import failed" },
  "shiftplan.exportFailed": { de: "Export fehlgeschlagen.", en: "Export failed." },
  "shiftplan.holidayTooltip": { de: "Feiertage (Hessen) – Links: Overlay, Rechts: Liste", en: "Public holidays (Hesse) – left: overlay, right: list" },
  "shiftplan.holidaysOn": { de: "Feiertage: an", en: "Holidays: on" },
  "shiftplan.holidays": { de: "Feiertage", en: "Holidays" },
  "shiftplan.noHolidays": { de: "Für dieses Jahr liegen aktuell keine Feiertage vor.", en: "There are currently no public holidays available for this year." },
  "shiftplan.changeShift": { de: "Schicht ändern", en: "Change shift" },
  "shiftplan.selectShift": { de: "Schicht wählen", en: "Select shift" },
  "shiftplan.emptyShift": { de: "(Leer / Löschen)", en: "(Empty / Clear)" },
  "shiftplan.early1": { de: "Früh 1", en: "Early 1" },
  "shiftplan.early2": { de: "Früh 2", en: "Early 2" },
  "shiftplan.late1": { de: "Spät 1", en: "Late 1" },
  "shiftplan.late2": { de: "Spät 2", en: "Late 2" },
  "shiftplan.offWeekend": { de: "Frei/WE", en: "Off/Weekend" },
  "shiftplan.absent": { de: "Abwesend", en: "Absent" },



  /* ── ShiftplanControlCenter ── */
  "sc.statusDraft": { de: "Entwurf", en: "Draft" },
  "sc.statusInReview": { de: "In Prüfung", en: "In review" },
  "sc.statusApproved": { de: "Freigegeben", en: "Approved" },
  "sc.statusActivated": { de: "Übernommen", en: "Activated" },
  "sc.statusFailed": { de: "Fehlgeschlagen", en: "Failed" },
  "sc.severityCritical": { de: "Kritisch", en: "Critical" },
  "sc.severityRelevant": { de: "Relevant", en: "Relevant" },
  "sc.severityHint": { de: "Hinweis", en: "Hint" },
  "sc.title": { de: "Schichtplaner", en: "Shift planner" },
  "sc.subtitle": { de: "Schichtplanung – Draft-Generierung, Prüfung, Freigabe und Übernahme", en: "Shift planning – draft generation, review, approval, and activation" },
  "sc.generating": { de: "Wird generiert...", en: "Generating..." },
  "sc.generateDraft": { de: "Draft generieren", en: "Generate draft" },
  "sc.shifts": { de: "Schichten", en: "shifts" },
  "sc.conflicts": { de: "Konflikte", en: "conflicts" },
  "sc.errors": { de: "Fehler", en: "Errors" },
  "sc.version": { de: "Version", en: "Version" },
  "sc.created": { de: "Erstellt", en: "Created" },
  "sc.by": { de: "von", en: "by" },
  "sc.on": { de: "am", en: "on" },
  "sc.markInReview": { de: "In Prüfung", en: "Mark in review" },
  "sc.approve": { de: "Freigeben", en: "Approve" },
  "sc.activatePlan": { de: "Als aktiven Plan übernehmen", en: "Activate this plan" },
  "sc.excelExport": { de: "Excel Export", en: "Excel export" },
  "sc.discard": { de: "Verwerfen", en: "Discard" },
  "sc.activateModalTitle": { de: "Draft als aktiven Schichtplan übernehmen", en: "Activate draft as the live shift plan" },
  "sc.cannotBeUndone": { de: "Diese Aktion kann nicht rückgängig gemacht werden.", en: "This action cannot be undone." },
  "sc.confirmActivate": { de: "Ja, als aktiven Plan übernehmen", en: "Yes, activate this plan" },
  "sc.shiftPlanning": { de: "Schichtplanung", en: "Shift planning" },
  "sc.noDraftHint": { de: "W\u00e4hle einen Monat und klicke auf \u201EDraft generieren\u201C um zu starten", en: "Select a month and click \"Generate draft\" to begin" },
  "sc.generateFirstDraft": { de: "Ersten Draft generieren", en: "Generate first draft" },
  "sc.activatedBy": { de: "Übernommen von", en: "Activated by" },
  "sc.selectOrGenerateDraft": { de: "Wähle einen Draft aus der Übersicht oder generiere einen neuen", en: "Select a draft from the overview or generate a new one" },
  "sc.draftVersionsFor": { de: "Draft-Versionen für", en: "Draft versions for" },
  "sc.noVersions": { de: "Keine Versionen vorhanden", en: "No versions available" },
  "sc.status": { de: "Status", en: "Status" },
  "sc.createdBy": { de: "Erstellt von", en: "Created by" },
  "sc.createdAt": { de: "Erstellt am", en: "Created at" },
  "sc.approvedBy": { de: "Freigegeben von", en: "Approved by" },
  "sc.note": { de: "Notiz", en: "Note" },
  "sc.draftShiftPlan": { de: "Draft-Schichtplan", en: "Draft shift plan" },
  "sc.draftLabel": { de: "ENTWURF", en: "DRAFT" },
  "sc.target": { de: "Soll", en: "Target" },
  "sc.actual": { de: "Ist", en: "Actual" },
  "sc.conflictCenter": { de: "Konfliktzentrum", en: "Conflict center" },
  "sc.noConflicts": { de: "Keine Konflikte erkannt", en: "No conflicts detected" },
  "sc.explanationsPerAssignment": { de: "Erklärungen pro Zuweisung", en: "Explanations per assignment" },
  "sc.noExplanations": { de: "Keine Erklärungen vorhanden – bitte zuerst einen Draft generieren", en: "No explanations available yet – please generate a draft first" },
  "sc.day": { de: "Tag", en: "Day" },
  "sc.noFairnessData": { de: "Keine Fairness-Daten verfügbar – bitte zuerst einen Draft generieren", en: "No fairness data available yet – please generate a draft first" },
  "sc.fairnessOverview": { de: "Fairnessübersicht", en: "Fairness overview" },
  "sc.nights": { de: "Nächte", en: "Nights" },
  "sc.weekends": { de: "Wochenenden", en: "Weekends" },
  "sc.earlyShifts": { de: "Frühschichten", en: "Early shifts" },
  "sc.early": { de: "Früh", en: "Early" },
  "sc.late": { de: "Spät", en: "Late" },
  "sc.deviation": { de: "Abweichung", en: "Deviation" },
  "sc.loadPlanningBasis": { de: "Planungsbasis laden", en: "Load planning basis" },
  "sc.planningBasisFor": { de: "Planungsbasis für", en: "Planning basis for" },
  "sc.employees": { de: "Mitarbeiter", en: "Employees" },
  "sc.absences": { de: "Abwesenheiten", en: "Absences" },
  "sc.noAbsences": { de: "Keine Abwesenheiten", en: "No absences" },
  "sc.permanentExclusions": { de: "Dauerhafte Ausschlüsse", en: "Permanent exclusions" },
  "sc.noExclusions": { de: "Keine Ausschlüsse", en: "No exclusions" },
  "sc.skills": { de: "Qualifikationen", en: "Skills" },
  "sc.minimumStaffing": { de: "Mindestbesetzung", en: "Minimum staffing" },
  "sc.shift": { de: "Schicht", en: "Shift" },
  "sc.atLeast": { de: "mindestens", en: "at least" },
  "sc.people": { de: "Personen", en: "people" },
  "sc.noRulesDefined": { de: "Keine Regeln definiert", en: "No rules defined" },
  "sc.helpTitle": { de: "Hilfe – So funktioniert der Schichtplaner", en: "Help – how the shift planner works" },
  "sc.confirmDeleteDraft": { de: "Diesen Draft endgültig löschen?", en: "Delete this draft permanently?" },
  "sc.tabOverview": { de: "Übersicht", en: "Overview" },
  "sc.tabDraftView": { de: "Draft-Ansicht", en: "Draft view" },
  "sc.tabConflictCenter": { de: "Konfliktzentrum", en: "Conflict center" },
  "sc.tabExplanations": { de: "Erklärungen", en: "Explanations" },
  "sc.tabPlanningBasis": { de: "Planungsbasis", en: "Planning basis" },
  "sc.tabVersions": { de: "Versionen", en: "Versions" },
  "sc.tabHelp": { de: "Hilfe", en: "Help" },
  "sc.exportFailed": { de: "Export fehlgeschlagen", en: "Export failed" },
  "sc.tabFairness": { de: "Fairness", en: "Fairness" },

  /* ── Admin Settings ── */
  "admin.title": { de: "Admin-Einstellungen", en: "Admin settings" },
  "admin.subtitle": { de: "Zentrale Konfiguration f\u00fcr Schichtplan, ODIN und Systemfunktionen", en: "Central configuration for shift planning, ODIN, and system functions" },
  "admin.controlCenter": { de: "Kontrollzentrum", en: "Control center" },
  "admin.allSettings": { de: "Alle administrativen Einstellungen an einem Ort", en: "All administrative settings in one place" },
  "admin.tilesDescription": { de: "Die Kacheln f\u00fchren direkt in den jeweiligen Konfigurationsbereich. Schichtplan- und Teams-Einstellungen sind jetzt Teil der Admin-Einstellungen und nicht mehr separat ausgelagert.", en: "The tiles take you directly to the corresponding configuration area. Shift plan and Teams settings are now part of the admin settings instead of living in separate pages." },
  "admin.tabShiftplan": { de: "Schichtplan", en: "Shift plan" },
  "admin.tabShiftplanDesc": { de: "Definitionen, DBS-Pool und Planungsregeln", en: "Definitions, DBS pool, and planning rules" },
  "admin.tabTeamsDesc": { de: "Events, Routing, Templates und Versandregeln zentral pflegen", en: "Manage events, routing, templates, and delivery rules centrally" },
  "admin.tabTv": { de: "TV-Modus", en: "TV mode" },
  "admin.tabTvDesc": { de: "Slides, Reihenfolge und Laufzeiten", en: "Slides, order, and durations" },
  "admin.tabThresholds": { de: "Schwellenwerte", en: "Thresholds" },
  "admin.tabThresholdsDesc": { de: "Globale Grenzwerte und TV-Parameter", en: "Global limits and TV parameters" },
  "admin.tabTogglesDesc": { de: "Funktionen ein- und ausschalten", en: "Enable and disable features" },
  "admin.tabFeedback": { de: "User-Feedback", en: "User feedback" },
  "admin.tabFeedbackDesc": { de: "Gespeicherte R\u00fcckmeldungen und Upload-Regeln", en: "Stored feedback and upload rules" },
  "admin.tabOdinDesc": { de: "ODIN-Regeln, manuelle Ausnahmen und dauerhafte Ausschl\u00fcsse", en: "ODIN rules, manual exceptions, and permanent exclusions" },
  "admin.tabMaintenance": { de: "Wartung", en: "Maintenance" },
  "admin.tabMaintenanceDesc": { de: "Reset- und Bereinigungsaktionen", en: "Reset and cleanup actions" },
  "admin.tabAudit": { de: "\u00c4nderungsprotokoll", en: "Change log" },
  "admin.tabAuditDesc": { de: "Alle Konfigurations\u00e4nderungen nachverfolgen", en: "Track all configuration changes" },
  "admin.tvConfigHint": { de: "Slide-Dauern, Reihenfolge und Sichtbarkeit f\u00fcr den TV-Modus konfigurieren.", en: "Configure slide durations, order, and visibility for TV mode." },
  "admin.tvSlides": { de: "TV-Slides", en: "TV slides" },
  "admin.tvHeaderNote": { de: "Die Header-Transparenz bleibt erhalten. Der Assignment-Slide ist zus\u00e4tzlich separat steuerbar und kann in der Rotation ein- oder ausgeschaltet werden.", en: "Header transparency remains intact. The assignment slide can also be controlled separately and enabled or disabled in the rotation." },
  "admin.durationSec": { de: "Dauer (Sek.)", en: "Duration (sec.)" },
  "admin.duration": { de: "Dauer", en: "Duration" },
  "admin.order": { de: "Reihenfolge", en: "Order" },
  "admin.onlyWithData": { de: "Nur mit Daten", en: "Only with data" },
  "admin.saveChanges": { de: "\u00c4nderungen speichern", en: "Save changes" },
  "admin.lastChangedBy": { de: "Zuletzt ge\u00e4ndert von", en: "Last changed by" },
  "admin.odinLogic": { de: "ODIN-Logik", en: "ODIN logic" },
  "admin.odinLogicDesc": { de: "Die Regeln unten steuern die produktive ODIN-Zuweisungslogik. \u00c4nderungen werden versioniert und im \u00c4nderungsprotokoll festgehalten.", en: "The rules below control productive ODIN assignment logic. Changes are versioned and recorded in the change log." },
  "admin.ticketExclusions": { de: "Ticket-Ausschl\u00fcsse", en: "Ticket exclusions" },
  "admin.ticketExclusionsDesc": { de: "Diese Ausschl\u00fcsse sind operativ Teil der ODIN-Logik und deshalb zus\u00e4tzlich direkt hier verf\u00fcgbar.", en: "These exclusions are an operational part of ODIN logic and are therefore also available directly here." },
  "admin.employeeExclusions": { de: "Mitarbeiter-Ausschl\u00fcsse", en: "Employee exclusions" },
  "admin.employeeExclusionsDesc": { de: "Sinnvoll f\u00fcr Einarbeitung, Sonderprojekte, Buddy-Konstellationen oder manuelle Entlastung einzelner Mitarbeiter.", en: "Useful for onboarding, special projects, buddy setups, or manual workload relief for individual employees." },
  "admin.manualExclusionList": { de: "Manuelle Ausnahmeliste", en: "Manual exclusion list" },
  "admin.manualExclusionListDesc": { de: "Separater Direktzugriff auf die Ticket-Ausschlusslisten f\u00fcr Systemnamen und Subtypes.", en: "Separate direct access to the ticket exclusion lists for system names and subtypes." },
  "admin.manualExclusionSubDesc": { de: "Systemnamen und Ticket-Subtypes, die ODIN nicht automatisch zuweisen darf, werden zentral in den Admin-Einstellungen gepflegt.", en: "System names and ticket subtypes that ODIN must not assign automatically are maintained centrally in the admin settings." },
  "admin.permanentExclusions": { de: "Dauerhafte Ausschl\u00fcsse", en: "Permanent exclusions" },
  "admin.permanentExclusionsDesc": { de: "Mitarbeiter, die ODIN dauerhaft oder zeitlich begrenzt nicht automatisch ber\u00fccksichtigen darf, werden hier zentral verwaltet.", en: "Employees that ODIN must not consider automatically, either permanently or temporarily, are managed centrally here." },
  "admin.resetTicketDb": { de: "Ticket-Datenbank zur\u00fccksetzen", en: "Reset ticket database" },
  "admin.resetTicketDbDesc": { de: "L\u00f6scht die live eingespielten Ticket-, Snapshot- und ODIN-Laufdaten. Manuell gepflegte Stammdaten bleiben erhalten.", en: "Deletes live-ingested ticket, snapshot, and ODIN run data. Manually maintained master data remains intact." },
  "admin.affectedAreas": { de: "Betroffene Bereiche", en: "Affected areas" },
  "admin.resetDbLiveDesc": { de: "L\u00f6scht operative Ticket- und Snapshot-Daten, ohne Stammdaten zu entfernen. Diese Aktion ist nur f\u00fcr bereinigte Neustarts oder Wartungsf\u00e4lle gedacht.", en: "Deletes operational ticket and snapshot data without removing master data. This action is only intended for clean restarts or maintenance cases." },
  "admin.resetDialogTitle": { de: "Ticket-Datenbank wirklich zur\u00fccksetzen?", en: "Really reset the ticket database?" },
  "admin.resetDialogDesc": { de: "Diese Aktion l\u00f6scht alle aktuellen Ticket-Snapshots und ODIN-L\u00e4ufe. Tippe RESET TICKETS ein, um den Reset freizugeben.", en: "This action deletes all current ticket snapshots and ODIN runs. Type RESET TICKETS to authorize the reset." },
  "admin.authPhrase": { de: "Freigabephrase", en: "Authorization phrase" },
  "admin.auditNote": { de: "Audit-Notiz", en: "Audit note" },
  "admin.auditNotePlaceholder": { de: "Optionale Notiz f\u00fcr das Audit-Log", en: "Optional note for the audit log" },
  "admin.runReset": { de: "Reset ausf\u00fchren", en: "Run reset" },
  "admin.resetting": { de: "Setze zur\u00fcck...", en: "Resetting..." },
  "admin.crawlerStaleAfter": { de: "Crawler veraltet nach", en: "Crawler stale after" },
  "admin.minutes": { de: "Minuten", en: "minutes" },
  "admin.commitRiskBelow": { de: "Commit-Risiko ab", en: "Commit risk below" },
  "admin.hours": { de: "Stunden", en: "hours" },
  "admin.escalateAfter": { de: "Eskalation nach", en: "Escalate after" },
  "admin.understaffingFrom": { de: "Unterbesetzung ab", en: "Understaffing from" },
  "admin.missingPeople": { de: "fehlende Personen", en: "missing people" },
  "admin.defaultSlideDuration": { de: "Standard-Slide-Dauer", en: "Default slide duration" },
  "admin.fontScaleFactor": { de: "Schriftgr\u00f6\u00dfe Faktor", en: "Font scale factor" },
  "admin.compactCards": { de: "Kompakte Karten", en: "Compact cards" },
  "admin.autoScroll": { de: "Auto-Scroll", en: "Auto scroll" },
  "admin.animations": { de: "Animationen", en: "Animations" },
  "admin.commitWindow": { de: "Commit-Fenster", en: "Commit window" },
  "admin.showStaleTickets": { de: "Stale Tickets anzeigen", en: "Show stale tickets" },
  "admin.tvCrawlerStale": { de: "TV Crawler-Stale", en: "TV crawler stale" },
  "admin.globalThresholds": { de: "Globale Schwellenwerte", en: "Global thresholds" },
  "admin.tvModePresentation": { de: "TV-Modus Darstellung", en: "TV mode presentation" },
  "admin.noToggles": { de: "Keine Feature Toggles konfiguriert", en: "No feature toggles configured" },
  "admin.feedbackRules": { de: "Feedback-Regeln", en: "Feedback rules" },
  "admin.feedbackEnabled": { de: "Feedback-Funktion aktiv", en: "Feedback enabled" },
  "admin.allowScreenshots": { de: "Screenshots erlauben", en: "Allow screenshots" },
  "admin.maxFileSize": { de: "Max. Dateigr\u00f6\u00dfe (MB)", en: "Max file size (MB)" },
  "admin.submittedFeedback": { de: "Eingereichte User-Feedbacks", en: "Submitted user feedback" },
  "admin.noFeedback": { de: "Es liegen aktuell keine gespeicherten Feedbacks vor.", en: "There is currently no stored feedback." },
  "admin.from": { de: "Von", en: "From" },
  "admin.unknown": { de: "Unbekannt", en: "Unknown" },
  "admin.feedbackOpen": { de: "Offen", en: "Open" },
  "admin.feedbackInProgress": { de: "In Bearbeitung", en: "In progress" },
  "admin.feedbackDone": { de: "Erledigt", en: "Done" },
  "admin.feedbackSetStatus": { de: "Status ändern", en: "Change status" },
  "admin.feedbackDelete": { de: "Löschen", en: "Delete" },
  "admin.feedbackDeleteConfirm": { de: "Soll dieser Feedback-Eintrag endgültig gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.", en: "Do you want to permanently delete this feedback entry? This action cannot be undone." },
  "admin.feedbackDeleteTitle": { de: "Feedback löschen", en: "Delete feedback" },
  "admin.feedbackDeleted": { de: "Feedback gelöscht", en: "Feedback deleted" },
  "admin.feedbackStatusUpdated": { de: "Status aktualisiert", en: "Status updated" },
  "admin.feedbackCancel": { de: "Abbrechen", en: "Cancel" },
  "admin.allAreas": { de: "Alle Bereiche", en: "All areas" },
  "admin.appSettings": { de: "App-Einstellungen", en: "App settings" },
  "admin.timestamp": { de: "Zeitpunkt", en: "Timestamp" },
  "admin.area": { de: "Bereich", en: "Area" },
  "admin.setting": { de: "Einstellung", en: "Setting" },
  "admin.old": { de: "Alt", en: "Old" },
  "admin.new": { de: "Neu", en: "New" },
  "admin.by": { de: "Von", en: "By" },
  "admin.note": { de: "Notiz", en: "Note" },
  "admin.noChangesLogged": { de: "Keine \u00c4nderungen protokolliert", en: "No changes logged" },
  "admin.on": { de: "am", en: "on" },


  /* ── Weekplan ── */
  "weekplan.title": { de: "Wochenplanung – KW", en: "Week planning – CW" },
  "weekplan.today": { de: "Heute", en: "Today" },
  "weekplan.showActiveOnly": { de: "Nur aktive anzeigen", en: "Show active only" },
  "weekplan.editOn": { de: "Bearbeiten: an", en: "Editing: on" },
  "weekplan.edit": { de: "Bearbeiten", en: "Edit" },
  "weekplan.saveFailed": { de: "Speichern fehlgeschlagen", en: "Save failed" },
  "weekplan.roleHint": { de: "Rollen werden per Rechtsklick vergeben. Mit Shift + Klick kannst du mehrere Tage für dieselbe Person markieren und die Rolle gesammelt setzen oder entfernen.", en: "Roles are assigned via right-click. Use Shift + Click to select multiple days for the same person and assign or remove roles in bulk." },
  "weekplan.changeShift": { de: "Schicht ändern", en: "Change shift" },
  "weekplan.selectShift": { de: "Schicht wählen", en: "Select shift" },
  "weekplan.empty": { de: "(leer)", en: "(empty)" },
  "weekplan.apply": { de: "Übernehmen", en: "Apply" },
  "weekplan.roleFor": { de: "Rolle für", en: "Role for" },
  "weekplan.roleForDays": { de: "Tage", en: "days" },
  "weekplan.removeRole": { de: "Rolle entfernen", en: "Remove role" },
  "weekplan.removeRoles": { de: "Rollen entfernen", en: "Remove roles" },
  "weekplan.loading": { de: "Lade Wochenplan …", en: "Loading week plan…" },
  "weekplan.highlightHint": { de: "Klicken um Zeile hervorzuheben (ESC zum Aufheben)", en: "Click to highlight row (ESC to clear)" },
  "weekplan.holiday": { de: "Feiertag", en: "Holiday" },
  "weekplan.daySelected": { de: "Tag ausgewählt", en: "day selected" },
  "weekplan.daysSelected": { de: "Tage ausgewählt", en: "days selected" },



  /* ── Shift Context Menu ── */
  "shiftContext.employee": { de: "Mitarbeiter", en: "Employee" },
  "shiftContext.daySelected": { de: "Tag ausgewählt", en: "day selected" },
  "shiftContext.daysSelected": { de: "Tage ausgewählt", en: "days selected" },
  "shiftContext.early1": { de: "Früh 1 (E1)", en: "Early 1 (E1)" },
  "shiftContext.early2": { de: "Früh 2 (E2)", en: "Early 2 (E2)" },
  "shiftContext.late1": { de: "Spät 1 (L1)", en: "Late 1 (L1)" },
  "shiftContext.late2": { de: "Spät 2 (L2)", en: "Late 2 (L2)" },
  "shiftContext.night": { de: "Nacht (N)", en: "Night (N)" },
  "shiftContext.absence": { de: "ABWESENHEIT", en: "ABSENCE" },
  "shiftContext.vacation": { de: "Urlaub (U)", en: "Vacation (U)" },
  "shiftContext.sick": { de: "Krank (K)", en: "Sick (K)" },
  "shiftContext.training": { de: "Training (T)", en: "Training (T)" },
  "shiftContext.offsite": { de: "Offsite (O)", en: "Offsite (O)" },
  "shiftContext.clearDelete": { de: "Frei / Löschen", en: "Free / Clear" },
  "shiftContext.competencies": { de: "Kompetenzen", en: "Competencies" },
  "shiftContext.changeHistory": { de: "Änderungshistorie", en: "Change history" },
  "shiftContext.manageRules": { de: "Regeln verwalten", en: "Manage rules" },
  "shiftContext.halfShifts": { de: "Halbe Schichten", en: "Half shifts" },
  "shiftContext.halfEarly1": { de: "HE1 – Halbe Früh (06:30–10:30)", en: "HE1 – Half early (06:30–10:30)" },
  "shiftContext.halfEarly2": { de: "HE2 – Halbe Früh (07:00–11:00)", en: "HE2 – Half early (07:00–11:00)" },
  "shiftContext.halfLate1": { de: "HL1 – Halbe Spät (13:00–17:30)", en: "HL1 – Half late (13:00–17:30)" },
  "shiftContext.halfLate2": { de: "HL2 – Halbe Spät (15:00–19:30)", en: "HL2 – Half late (15:00–19:30)" },

  /* ── Shiftplan extras ── */
  "shiftplan.warningsTooltip": { de: "Warnungen – Links: rote Markierungen, Rechts: Details", en: "Warnings – left: red markers, right: details" },
  "shiftplan.warningsOn": { de: "Warnungen: an", en: "Warnings: on" },
  "shiftplan.warnings": { de: "Warnungen", en: "Warnings" },
  "shiftplan.wellbeing": { de: "Wellbeing", en: "Wellbeing" },
  "shiftplan.hiddenOn": { de: "Ausgebl.", en: "Hidden" },
  "shiftplan.hidden": { de: "Ausgebl.", en: "Hidden" },



  /* ── ConstraintDialog ── */
  "constraints.title": { de: "Regeln verwalten", en: "Manage rules" },
  "constraints.noNight": { de: "Keine Nachtschichten", en: "No night shifts" },
  "constraints.earlyOnly": { de: "Nur Frühschichten (E1/E2)", en: "Early shifts only (E1/E2)" },
  "constraints.maxWeekends": { de: "Max. Wochenenden", en: "Max. weekends" },

  /* ── ExportMenu ── */
  "export.options": { de: "Export Optionen", en: "Export options" },
  "export.menu": { de: "Export Menü", en: "Export menu" },
  "export.shiftplanXlsx": { de: "Schichtplan (XLSX)", en: "Shift plan (XLSX)" },
  "export.changeLog": { de: "Änderungen (Change Log)", en: "Changes (Change log)" },
  "export.noChanges": { de: "Noch keine Änderungen aufgezeichnet", en: "No changes recorded yet" },

  /* ── HistoryDialog ── */
  "history.title": { de: "Änderungshistorie", en: "Change history" },
  "history.date": { de: "Datum", en: "Date" },
  "history.old": { de: "Alt", en: "Old" },
  "history.new": { de: "Neu", en: "New" },
  "history.changedBy": { de: "Geändert von", en: "Changed by" },
  "history.timestamp": { de: "Zeitpunkt", en: "Timestamp" },
  "history.loading": { de: "Lade…", en: "Loading…" },
  "history.noChanges": { de: "Keine Änderungen gefunden.", en: "No changes found." },
  "history.deleted": { de: "Gelöscht", en: "Deleted" },

  /* ── ShiftStatsPanel ── */
  "stats.hide": { de: "Statistik (Ausblenden)", en: "Statistics (Hide)" },
  "stats.show": { de: "Statistik (Anzeigen)", en: "Statistics (Show)" },
  "stats.nightShifts": { de: "Nachtschichten", en: "Night shifts" },
  "stats.weekendShifts": { de: "Wochenendschichten", en: "Weekend shifts" },
  "stats.conflicts": { de: "Konflikte", en: "Conflicts" },

  /* ── CompetencyModal ── */
  "competency.title": { de: "Kompetenzen", en: "Competencies" },
  "competency.basic": { de: "Grundkenntnisse", en: "Basic" },
  "competency.advanced": { de: "Fortgeschritten", en: "Advanced" },
  "competency.expert": { de: "Experte", en: "Expert" },
  "competency.noCompetencies": { de: "Keine Kompetenzen hinterlegt", en: "No competencies recorded" },
  "competency.newCompetency": { de: "Neue Kompetenz", en: "New competency" },
  "competency.skillPlaceholder": { de: "Fähigkeit (z.B. Cisco Catalyst, Oracle DB…)", en: "Skill (e.g. Cisco Catalyst, Oracle DB…)" },
  "competency.level": { de: "Niveau", en: "Level" },
  "competency.notesPlaceholder": { de: "Notizen (optional)", en: "Notes (optional)" },
  "competency.add": { de: "Hinzufügen", en: "Add" },
  "competency.addCompetency": { de: "Kompetenz hinzufügen", en: "Add competency" },

};

/* ─────────────────────────────────────────────────────────────────────── */
/*  CONTEXT & PROVIDER                                                     */
/* ─────────────────────────────────────────────────────────────────────── */

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function isLanguageCode(value: unknown): value is LanguageCode {
  return value === "de" || value === "en";
}

function getStoredLanguage(): LanguageCode {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isLanguageCode(stored) ? stored : DEFAULT_LANGUAGE;
}

export function getLanguageLocale(language: LanguageCode): string {
  return LANGUAGE_TO_LOCALE[language] || LANGUAGE_TO_LOCALE[DEFAULT_LANGUAGE];
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<LanguageCode>(getStoredLanguage);
  const languageHydrationSourceRef = useRef<"storage" | "server" | "user">("storage");

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = "ltr";
    window.localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    languageHydrationSourceRef.current = "storage";

    async function loadUserLanguage() {
      if (!user) return;
      try {
        const { data } = await api.get("/user/settings");
        const nextLanguage = isLanguageCode(data?.language) ? data.language : DEFAULT_LANGUAGE;
        if (!cancelled && languageHydrationSourceRef.current !== "user") {
          languageHydrationSourceRef.current = "server";
          setLanguageState(nextLanguage);
        }
      } catch {
        // Non-fatal: keep local language state.
      }
    }

    loadUserLanguage();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setLanguage = useCallback(async (nextLanguage: LanguageCode, options?: { persist?: boolean }) => {
    const persist = options?.persist !== false;
    languageHydrationSourceRef.current = "user";
    setLanguageState(nextLanguage);
    if (persist && user) {
      try {
        await api.put("/user/settings", { language: nextLanguage });
      } catch (error) {
        console.error("Failed to persist language setting", error);
      }
    }
  }, [user]);

  const t = useCallback((key: TranslationKey) => {
    return TRANSLATIONS[key]?.[language] || TRANSLATIONS[key]?.de || key;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    languages: LANGUAGE_OPTIONS,
    setLanguage,
    t,
    direction: "ltr",
  }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
