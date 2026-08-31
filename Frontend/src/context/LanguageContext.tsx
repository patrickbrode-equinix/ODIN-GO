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
  /* ── Header ── */
  | "header.crawlerUpdate"
  | "header.noCurrentCrawlerData"
  | "header.activeTickets"
  | "header.shiftplan"
  | "header.noUpdateAvailable"
  | "header.infos"
  | "header.teamsActive"
  | "header.teamsInactive"
  | "header.odinLogicActive"
  | "header.odinLogicInactive"
  | "header.systemMetrics"
  | "header.imageLoadError"
  | "header.uploadFailed"
  | "header.confirmDeleteImage"
  | "header.deleteFailed"
  | "header.visibilityChangeFailed"
  | "header.uploading"
  | "header.uploadButton"
  | "header.fileFormats"
  | "header.noImagesAvailable"
  | "header.events"
  | "header.imageVisibleHint"
  | "header.imageHiddenHint"
  | "header.deleteTooltip"
  | "header.instructions"
  | "header.projects"
  | "header.polls"
  | "header.quickLinks"
  | "header.links"
  | "header.infoAndInstructions"
  | "header.teamsActiveTooltip"
  | "header.teamsInactiveTooltip"
  | "header.odinLogicActiveTooltip"
  | "header.odinLogicInactiveTooltip"
  | "header.notAvailable"
  | "header.loggedIn"
  | "header.ofApprovedUsers"
  | "header.utilization"
  | "header.systemLoad"
  | "header.dbStorage"
  | "header.activeConnections"
  | "header.ticketLoad"
  | "header.ticketsPerUser"
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
  | "nav.tickets"
  | "nav.tvDashboard"
  | "nav.protokoll"
  | "nav.commitCompliance"
  | "nav.odinLogic"
  | "nav.shiftplanControl"
  | "nav.teamsCenter"
  | "nav.adminSettings"
  | "nav.userManagement"
  | "nav.statistics"
  | "nav.ticketAudit"
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
  /* ── Sidebar ── */
  | "sidebar.collapseDashboard"
  | "sidebar.expandDashboard"
  | "sidebar.collapseShiftplan"
  | "sidebar.expandShiftplan"
  | "sidebar.collapseLog"
  | "sidebar.expandLog"
  | "sidebar.openTutorial"
  | "sidebar.tutorial"
  /* ── Dashboard / Statistics ── */
  | "stats.title"
  | "stats.refreshing"
  | "stats.lastLabel"
  | "stats.today"
  | "stats.commitHealth"
  | "stats.onTime"
  | "stats.expired"
  | "stats.overdue"
  | "stats.activeTickets"
  | "stats.smartHand"
  | "stats.troubleTicket"
  | "stats.crossConnect"
  | "stats.other"
  | "stats.closedWeek"
  | "stats.onTimeRate"
  | "stats.dispatchVsClosed"
  | "stats.dispatched"
  | "stats.closed"
  | "stats.ticketTypes"
  | "stats.closedVsExpired"
  | "stats.statusDistribution"
  | "stats.dispatchPerDay"
  | "stats.closedPerDay"
  | "stats.expiredPerDay"
  | "stats.fetchError"
  | "stats.retryNow"
  /* ── ODIN Logic ── */
  | "odin.title"
  | "odin.subtitle"
  | "odin.liveConfirmTitle"
  | "odin.liveConfirmMessage"
  | "odin.liveConfirmButton"
  | "odin.shadowConfirmTitle"
  | "odin.shadowConfirmMessage"
  | "odin.shadowConfirmButton"
  | "odin.stopConfirmTitle"
  | "odin.stopConfirmMessage"
  | "odin.stopConfirmButton"
  | "odin.runsTab"
  | "odin.decisionsTab"
  | "odin.reportTab"
  | "odin.logicTreeTab"
  | "odin.flowTab"
  | "odin.settingsTab"
  | "odin.crawlerOverride"
  | "odin.staleData"
  | "odin.dryRun"
  | "odin.shadowRun"
  | "odin.runInProgress"
  | "odin.automaticAssignment"
  | "odin.disabled"
  | "odin.liveActive"
  | "odin.shadowActive"
  | "odin.lastStarted"
  | "odin.stopped"
  | "odin.by"
  | "odin.mode"
  | "odin.startShadowAutomation"
  | "odin.startLiveAutomation"
  | "odin.stopAutomation"
  | "odin.engineSettings"
  | "odin.selectRunForReport"
  | "odin.loadReport"
  | "odin.validationConsistent"
  | "odin.validationInconsistent"
  | "odin.processed"
  | "odin.assigned"
  | "odin.unassigned"
  | "odin.notRelevant"
  | "odin.crawlerOverrideActive"
  | "odin.crawlerOverrideHint"
  | "odin.assignedTickets"
  | "odin.unassignedTickets"
  | "odin.ticket"
  | "odin.system"
  | "odin.category"
  | "odin.queue"
  | "odin.assignedTo"
  | "odin.reason"
  | "odin.status"
  | "odin.modeDryRun"
  /* ── Teams Center ── */
  | "teams.channelDelivery"
  | "teams.personalMessages"
  | "teams.scope"
  | "teams.diagnosticsScope"
  | "teams.diagnosticsValue"
  | "teams.checksDocumentation"
  | "teams.commonCauses"
  | "teams.blockingCauses"
  | "teams.debugTip"
  | "teams.howToUse"
  | "teams.usageInstructions"
  | "teams.traceableAnalysis"
  | "teams.eventsDescription"
  | "teams.eventActiveInactive"
  | "teams.eventToggleHint"
  | "teams.important"
  | "teams.disablingNote"
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
  /* ── Login ── */
  | "login.loginFailed"
  | "login.emailHint"
  | "login.email"
  | "login.emailPlaceholder"
  | "login.userIdInvalid"
  | "login.password"
  | "login.hidePassword"
  | "login.showPassword"
  | "login.loggingIn"
  | "login.loginButton"
  | "login.forgotPassword"
  | "login.noAccount"
  | "login.register"
  /* ── ForgotPassword ── */
  | "forgotPassword.title"
  | "forgotPassword.subtitle"
  | "forgotPassword.email"
  | "forgotPassword.emailPlaceholder"
  | "forgotPassword.submitButton"
  | "forgotPassword.backToLogin"
  /* ── AccessDenied ── */
  | "accessDenied.title"
  | "accessDenied.message"
  | "accessDenied.backButton"
  /* ── CommitCompliance ── */
  | "commitCompliance.pdfOnlyError"
  | "commitCompliance.uploadFailedError"
  | "commitCompliance.subtitle"
  | "commitCompliance.uploadSection"
  | "commitCompliance.uploadingButton"
  | "commitCompliance.uploadButton"
  | "commitCompliance.uploadedFiles"
  /* ── DBS ── */
  | "dbs.coloDashboardTitle"
  | "dbs.coloDashboardDesc"
  | "dbs.completeListTitle"
  | "dbs.completeListDesc"
  | "dbs.networkViewTitle"
  | "dbs.networkViewDesc"
  | "dbs.pageSubtitle"
  /* ── EmployeeContacts ── */
  | "employeeContacts.title"
  | "employeeContacts.subtitle"
  /* ── DashboardInfoBar ── */
  | "dashboardInfo.deleteEntryConfirm"
  | "dashboardInfo.displayActive"
  | "dashboardInfo.hidden"
  | "dashboardInfo.hideButton"
  | "dashboardInfo.showButton"
  | "dashboardInfo.noEntries"
  | "dashboardInfo.typeInstruction"
  | "dashboardInfo.typeInformation"
  | "dashboardInfo.deletionBadge"
  | "dashboardInfo.addPlaceholder"
  | "dashboardInfo.settingsMenu"
  | "dashboardInfo.markAsInfo"
  | "dashboardInfo.markAsInstruction"
  | "dashboardInfo.autoDeletion"
  | "dashboardInfo.removeAutoDeletion"
  /* ── ProjectsPanel ── */
  | "projects.createNewProject"
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
  /* ── Register ── */
  | "register.registerFailed"
  | "register.title"
  | "register.subtitle"
  | "register.infoLineOne"
  | "register.infoLineTwo"
  | "register.firstName"
  | "register.lastName"
  | "register.loginName"
  | "register.loginNamePlaceholder"
  | "register.email"
  | "register.emailPlaceholder"
  | "register.location"
  | "register.locationPlaceholder"
  | "register.department"
  | "register.departmentPlaceholder"
  | "register.password"
  | "register.hidePassword"
  | "register.showPassword"
  | "register.passwordHint"
  | "register.successTitle"
  | "register.successBody"
  | "register.submitting"
  | "register.submitButton"
  | "register.backToLogin"
  /* ── TicketAudit ── */
  | "ticketAudit.today"
  | "ticketAudit.week"
  | "ticketAudit.month"
  | "ticketAudit.year"
  | "ticketAudit.customRange"
  | "ticketAudit.subtitle"
  | "ticketAudit.rangeLabel"
  | "ticketAudit.manualTakeoversTitle"
  | "ticketAudit.noManualTakeovers"
  | "ticketAudit.employee"
  | "ticketAudit.withoutAssignment"
  | "ticketAudit.total"
  | "ticketAudit.share"
  | "ticketAudit.lastTakeover"
  | "ticketAudit.ticketTypes"
  | "ticketAudit.processingStatsTitle"
  | "ticketAudit.noActivity"
  | "ticketAudit.closed"
  | "ticketAudit.closeRate"
  | "ticketAudit.definitionsTitle"
  | "ticketAudit.manualTakeoverDefLabel"
  | "ticketAudit.manualTakeoverDefDesc"
  | "ticketAudit.processedTicketDefLabel"
  | "ticketAudit.processedTicketDefDesc"
  | "ticketAudit.closeRateDefLabel"
  | "ticketAudit.closeRateDefDesc"
  | "logicTree.title"
  | "logicTree.description"
  | "logicTree.badgeRule"
  | "logicTree.badgeAction"
  | "logicTree.openPoints"
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
  | "exclusions.reasonProject"
  | "exclusions.reasonAdminOverride"
  | "exclusions.reasonNoOperative"
  | "exclusions.reasonTemporary"
  | "exclusions.title"
  | "exclusions.subtitle"
  | "exclusions.quickExclude"
  | "exclusions.quickExcludeInfo"
  | "exclusions.filterEmployees"
  | "exclusions.available"
  | "exclusions.noMatches"
  | "exclusions.allExcluded"
  | "exclusions.excluded"
  | "exclusions.noExclusions"
  | "exclusions.quickFooter"
  | "exclusions.addTitle"
  | "exclusions.addInfo"
  | "exclusions.searchEmployee"
  | "exclusions.noEmployeeFound"
  | "exclusions.reason"
  | "exclusions.additionalReason"
  | "exclusions.additionalReasonPlaceholder"
  | "exclusions.add"
  | "exclusions.limitPeriod"
  | "exclusions.until"
  | "exclusions.activeExclusions"
  | "exclusions.noActiveExclusions"
  | "exclusions.justification"
  | "exclusions.validFrom"
  | "exclusions.validTo"
  | "exclusions.createdBy"
  | "exclusions.createdAt"
  | "exclusions.actions"
  | "exclusions.deactivate"
  | "exclusions.deletePermanently"
  | "exclusions.showInactive"
  | "exclusions.inactiveExclusions"
  | "exclusions.deactivatedBy"
  | "exclusions.deactivatedAt"
  | "exclusions.introText"
  | "exclusions.tooltipReason"
  | "exclusions.tooltipAdditionalReason"
  | "exclusions.tooltipLimitPeriod"
  | "exclusions.tooltipActiveExclusions"
  | "exclusions.tooltipEmployee"
  | "exclusions.tooltipReasonCol"
  | "exclusions.tooltipJustification"
  | "exclusions.tooltipValidFrom"
  | "exclusions.tooltipValidTo"
  | "exclusions.tooltipCreatedBy"
  | "exclusions.tooltipCreatedAt"
  | "exclusions.tooltipActions"
  | "exclusions.tooltipShowInactive"
  | "exclusions.tooltipInactive"
  | "rules.title"
  | "rules.subtitle"
  | "rules.titleAlt"
  | "rules.subtitleAlt"
  | "rules.catPriorities"
  | "rules.catRoleRules"
  | "rules.catLoadBalancing"
  | "rules.catExceptions"
  | "rules.newStarter"
  | "rules.normalOperation"
  | "rules.noTiersConfigured"
  | "rules.adjustOrder"
  | "rules.types"
  | "rules.priorities"
  | "rules.all"
  | "rules.onlyOtherTeamsHandovers"
  | "rules.allowTroubleTickets"
  | "rules.ccOnlyAbove24h"
  | "rules.blockedTicketTypes"
  | "rules.allowedCcTicketTypes"
  | "rules.mixableTicketTypes"
  | "rules.ttExceptionResourceShortage"
  | "rules.mixOnlySameSystem"
  | "rules.mixOnlySamePriority"
  | "rules.ttExceptionRemainingTime"
  | "rules.maxShPerWorkerSystem"
  | "rules.maxTimeDiffCcGrouping"
  | "rules.fewestTicketsFirst"
  | "rules.stableOrder"
  | "rules.overallTicketLimit"
  | "rules.noLimit"
  | "rules.limitsPerTicketType"
  | "rules.limitsPerRole"
  | "rules.limitsPerRoleAndType"
  | "rules.preferExpedite"
  | "rules.noVisualEditor"
  | "rules.emptyNoOverride"
  | "rules.changeNote"
  | "rules.changeNotePlaceholder"
  | "rules.showAdvancedJson"
  | "rules.hideAdvancedJson"
  | "rules.advancedJsonOnlySpecial"
  | "rules.history"
  | "rules.changeHistory"
  | "rules.lastChangedBy"
  | "rules.version"
  | "rules.rollback"
  | "rules.noExplanation"
  | "rules.noCategoryDescription"
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
  | "sc.preferredColleagues"
  | "sc.noPreferredColleagues"
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
  | "sc.confirmDeleteDraft"
  | "sc.helpTitle"
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
  /* ── Teams Communication Center ── */
  | "teams.quietHoursStart"
  | "teams.quietHoursEnd"
  | "teams.criticalOnly"
  | "teams.maxMessagesDay"
  | "teams.digestInterval"
  | "teams.defaultCooldown"
  | "teams.escalationDelay"
  | "teams.fallbackRecipient"
  | "teams.duplicateWindow"
  | "teams.notifySystemExclusions"
  | "teams.notifySubtypeExclusions"
  | "teams.liveOnly"
  | "teams.directRecipients"
  | "teams.specificShifts"
  | "teams.groupTargets"
  | "teams.channelFallback"
  | "teams.titleTemplate"
  | "teams.bodyTemplate"
  | "teams.botBaseUrl"
  | "teams.timingMatrix"
  | "teams.standardPersonShift"
  | "teams.standardGroupMessages"
  | "teams.globalDeliveryRules"
  | "teams.globalDeliveryRulesDesc"
  | "teams.dispatcherExcluded"
  | "teams.dispatcherExcludedDesc"
  | "teams.messageOrchestration"
  | "teams.messageOrchestrationDesc"
  | "teams.on"
  | "teams.off"
  | "teams.dispatcherReview"
  | "teams.systemSubtypeExclusions"
  | "teams.deliveryPath"
  | "teams.peopleChannelRouting"
  | "teams.routingPrep"
  | "teams.whoGetsWhat"
  | "teams.advancedConfigured"
  | "teams.basic"
  | "teams.immediate"
  | "teams.priority"
  | "teams.mode"
  | "teams.duplicateProtection"
  | "teams.yes"
  | "teams.no"
  | "teams.eventDescription"
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
  /* ── Handover ── */
  | "handover.title"
  | "handover.subtitle"
  | "handover.newTask"
  | "handover.hideCompleted"
  | "handover.showCompleted"
  | "handover.statusDone"
  | "handover.statusInProgress"
  | "handover.statusOpen"
  /* ── Handover Form ── */
  | "handover.formTitle"
  | "handover.ticketNumber"
  | "handover.customerName"
  | "handover.area"
  | "handover.type"
  | "handover.priority"
  | "handover.commitTime"
  | "handover.description"
  | "handover.selectFiles"
  | "handover.filesSelected"
  | "handover.clearSelection"
  | "handover.requiredFields"
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
  /* ── Handover List / Item ── */
  | "handover.completedHandovers"
  | "handover.latestHandovers"
  | "handover.syncing"
  | "handover.alreadyTaken"
  | "handover.takeOver"
  | "handover.done"
  /* ── CreateTaskModal ── */
  | "handover.createTask"
  | "handover.assignee"
  | "handover.loadingEllipsis"
  | "handover.pleaseSelect"
  | "handover.dueBy"
  | "handover.recurrence"
  | "handover.recurrenceNone"
  | "handover.recurrenceDaily"
  | "handover.recurrenceWeekly"
  | "handover.recurrenceMonthly"
  | "handover.whatToDo"
  | "handover.create"
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
  | "competency.addCompetency"
  /* ── Assignment Writeback ── */
  | "writeback.panelTitle"
  | "writeback.panelSubtitle"
  | "writeback.tabPending"
  | "writeback.tabShadow"
  | "writeback.tabConfirm"
  | "writeback.tabApplied"
  | "writeback.tabUnassign"
  | "writeback.tabReassign"
  | "writeback.tabManualReview"
  | "writeback.tabFailed"
  | "writeback.tabOther"
  | "writeback.empty"
  | "writeback.loading"
  | "writeback.refresh"
  | "writeback.reconcile"
  | "writeback.reconcileInfo"
  | "writeback.reconcileResult"
  | "writeback.snapshotCount"
  | "writeback.discrepancies"
  | "writeback.killSwitchActive"
  | "writeback.shadowModeActive"
  | "writeback.shadowBanner"
  | "writeback.manualReviewNote"
  | "writeback.btnValidate"
  | "writeback.btnApprove"
  | "writeback.btnExecute"
  | "writeback.btnCancel"
  | "writeback.btnAudit"
  | "writeback.confirmExecute"
  | "writeback.confirmCancel"
  | "writeback.fieldActivity"
  | "writeback.fieldSO"
  | "writeback.fieldQueue"
  | "writeback.fieldSubType"
  | "writeback.fieldSystem"
  | "writeback.fieldCurrentOwner"
  | "writeback.fieldSelectedEmployee"
  | "writeback.fieldOwnerCode"
  | "writeback.fieldActionType"
  | "writeback.fieldMode"
  | "writeback.fieldStatus"
  | "writeback.fieldCreated"
  | "writeback.fieldLastAttempt"
  | "writeback.fieldFailureReason"
  | "writeback.fieldHardReason"
  | "writeback.fieldRetryCount"
  | "writeback.auditTitle"
  | "writeback.auditLoading"
  | "writeback.auditEmpty"
  | "writeback.auditBefore"
  | "writeback.auditAfter"
  | "writeback.auditValidation"
  | "writeback.auditScreenshot"
  | "writeback.auditDiagnostics"
  | "writeback.settingEnabled"
  | "writeback.settingEnabledTooltip"
  | "writeback.settingMode"
  | "writeback.settingModeTooltip"
  | "writeback.settingKillSwitch"
  | "writeback.settingKillSwitchTooltip"
  | "writeback.settingOverwriteExisting"
  | "writeback.settingOverwriteExistingTooltip"
  | "writeback.settingAllowUnassign"
  | "writeback.settingAllowUnassignTooltip"
  | "writeback.settingAllowReassign"
  | "writeback.settingAllowReassignTooltip"
  | "writeback.settingMaxRetries"
  | "writeback.settingMaxRetriesTooltip"
  | "writeback.settingRequireFresh"
  | "writeback.settingRequireFreshTooltip"
  | "writeback.settingMaxSnapshotAge"
  | "writeback.settingMaxSnapshotAgeTooltip"
  | "writeback.settingQueueSmartHands"
  | "writeback.settingQueueSmartHandsTooltip"
  | "writeback.settingQueueCrossConnect"
  | "writeback.settingQueueCrossConnectTooltip"
  | "writeback.settingQueueTrouble"
  | "writeback.settingQueueTroubleTooltip"
  | "writeback.settingQueueDeinstall"
  | "writeback.settingQueueDeinstallTooltip"
  | "writeback.settingAllowOtherTeams"
  | "writeback.settingAllowOtherTeamsTooltip"
  | "writeback.settingRequireApprovalUnassign"
  | "writeback.settingRequireApprovalUnassignTooltip"
  | "writeback.settingRequireApprovalReassign"
  | "writeback.settingRequireApprovalReassignTooltip";

/* ─────────────────────────────────────────────────────────────────────── */
/*  TRANSLATIONS                                                           */
/* ─────────────────────────────────────────────────────────────────────── */

const TRANSLATIONS: Record<TranslationKey, Record<LanguageCode, string>> = {
  /* ── Header ── */
  "header.crawlerUpdate": { de: "Crawler-Update", en: "Crawler update" },
  "header.noCurrentCrawlerData": { de: "Keine aktuellen Crawler-Daten", en: "No current crawler data" },
  "header.activeTickets": { de: "Aktive Tickets", en: "Active tickets" },
  "header.shiftplan": { de: "Schichtplan", en: "Shift plan" },
  "header.noUpdateAvailable": { de: "Kein Update verfügbar", en: "No update available" },
  "header.infos": { de: "Infos", en: "Info" },
  "header.teamsActive": { de: "Teams aktiv", en: "Teams active" },
  "header.teamsInactive": { de: "Teams inaktiv", en: "Teams inactive" },
  "header.odinLogicActive": { de: "ODIN-Logik aktiv", en: "ODIN logic active" },
  "header.odinLogicInactive": { de: "ODIN-Logik inaktiv", en: "ODIN logic inactive" },
  "header.systemMetrics": { de: "Systemmetriken", en: "System metrics" },
  "header.imageLoadError": { de: "Bilder konnten nicht geladen werden.", en: "Images could not be loaded." },
  "header.uploadFailed": { de: "Upload fehlgeschlagen.", en: "Upload failed." },
  "header.confirmDeleteImage": { de: "Bild löschen?", en: "Delete image?" },
  "header.deleteFailed": { de: "Löschen fehlgeschlagen.", en: "Delete failed." },
  "header.visibilityChangeFailed": { de: "Sichtbarkeit konnte nicht geändert werden.", en: "Visibility could not be changed." },
  "header.uploading": { de: "Wird hochgeladen…", en: "Uploading…" },
  "header.uploadButton": { de: "Bilder hochladen", en: "Upload images" },
  "header.fileFormats": { de: "JPG, PNG, WebP, GIF · max. 20 MB pro Datei", en: "JPG, PNG, WebP, GIF · max. 20 MB per file" },
  "header.noImagesAvailable": { de: "Keine Event-Bilder vorhanden", en: "No event images available" },
  "header.events": { de: "Events", en: "Events" },
  "header.imageVisibleHint": { de: "Sichtbar – klicken zum Ausblenden", en: "Visible – click to hide" },
  "header.imageHiddenHint": { de: "Ausgeblendet – klicken zum Einblenden", en: "Hidden – click to show" },
  "header.deleteTooltip": { de: "Löschen", en: "Delete" },
  "header.instructions": { de: "Anweisungen", en: "Instructions" },
  "header.projects": { de: "Projekte", en: "Projects" },
  "header.polls": { de: "Umfragen", en: "Polls" },
  "header.quickLinks": { de: "Schnellzugriffe", en: "Quick links" },
  "header.links": { de: "Links", en: "Links" },
  "header.infoAndInstructions": { de: "Informationen und Anweisungen", en: "Information and instructions" },
  "header.teamsActiveTooltip": { de: "Teams Benachrichtigungen sind aktiv – Benachrichtigungsfunktion ist eingeschaltet", en: "Teams notifications are active – notification delivery is enabled" },
  "header.teamsInactiveTooltip": { de: "Teams Benachrichtigungen sind inaktiv – keine automatischen Benachrichtigungen", en: "Teams notifications are inactive – no automatic notifications" },
  "header.odinLogicActiveTooltip": { de: "ODIN-Logik ist aktiv – automatische Zuweisungslogik ist eingeschaltet", en: "ODIN logic is active – automatic assignment logic is enabled" },
  "header.odinLogicInactiveTooltip": { de: "ODIN-Logik ist inaktiv – keine automatische Ticketzuweisung", en: "ODIN logic is inactive – no automatic ticket assignment" },
  "header.notAvailable": { de: "nicht verfügbar", en: "not available" },
  "header.loggedIn": { de: "Eingeloggt", en: "Logged in" },
  "header.ofApprovedUsers": { de: "freigegebenen Nutzern", en: "approved users" },
  "header.utilization": { de: "Auslastung", en: "Utilisation" },
  "header.systemLoad": { de: "Systemlast", en: "System load" },
  "header.dbStorage": { de: "DB-Speicher", en: "DB storage" },
  "header.activeConnections": { de: "aktive Verbindungen", en: "active connections" },
  "header.ticketLoad": { de: "Ticketlast", en: "Ticket load" },
  "header.ticketsPerUser": { de: "Tickets / online User", en: "tickets / online user" },

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
  "nav.tickets": { de: "Tickets", en: "Tickets" },
  "nav.tvDashboard": { de: "TV Dashboard", en: "TV dashboard" },
  "nav.protokoll": { de: "Protokoll", en: "Log" },
  "nav.commitCompliance": { de: "Commit Compliance", en: "Commit compliance" },
  "nav.odinLogic": { de: "ODIN-Logik", en: "ODIN logic" },
  "nav.shiftplanControl": { de: "Schichtplaner", en: "Shift planner" },
  "nav.teamsCenter": { de: "Teams Center", en: "Teams centre" },
  "nav.adminSettings": { de: "Admin-Einstellungen", en: "Admin settings" },
  "nav.userManagement": { de: "Benutzerverwaltung", en: "User management" },
  "nav.statistics": { de: "Statistiken", en: "Statistics" },
  "nav.ticketAudit": { de: "Ticket-Audit", en: "Ticket audit" },
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

  /* ── Sidebar ── */
  "sidebar.collapseDashboard": { de: "Dashboard einklappen", en: "Collapse dashboard" },
  "sidebar.expandDashboard": { de: "Dashboard ausklappen", en: "Expand dashboard" },
  "sidebar.collapseShiftplan": { de: "Shiftplan einklappen", en: "Collapse shift plan" },
  "sidebar.expandShiftplan": { de: "Shiftplan ausklappen", en: "Expand shift plan" },
  "sidebar.collapseLog": { de: "Protokoll einklappen", en: "Collapse log" },
  "sidebar.expandLog": { de: "Protokoll ausklappen", en: "Expand log" },
  "sidebar.openTutorial": { de: "Tutorial öffnen", en: "Open tutorial" },
  "sidebar.tutorial": { de: "Tutorial", en: "Tutorial" },

  /* ── Dashboard / Statistics ── */
  "stats.title": { de: "Team-Statistiken", en: "Team statistics" },
  "stats.refreshing": { de: "Aktualisierung…", en: "Refreshing…" },
  "stats.lastLabel": { de: "Zuletzt", en: "Last" },
  "stats.today": { de: "Heute", en: "Today" },
  "stats.commitHealth": { de: "Commit-Gesundheit", en: "Commit health" },
  "stats.onTime": { de: "PÜNKTLICH", en: "ON-TIME" },
  "stats.expired": { de: "Überfällig", en: "Expired" },
  "stats.overdue": { de: "Überfällig", en: "Overdue" },
  "stats.activeTickets": { de: "Aktive Tickets", en: "Active tickets" },
  "stats.smartHand": { de: "Smart Hand", en: "Smart hand" },
  "stats.troubleTicket": { de: "Trouble Ticket", en: "Trouble ticket" },
  "stats.crossConnect": { de: "Cross Connect", en: "Cross connect" },
  "stats.other": { de: "Sonstige", en: "Other" },
  "stats.closedWeek": { de: "Closed (Woche)", en: "Closed (week)" },
  "stats.onTimeRate": { de: "pünktlich", en: "on-time" },
  "stats.dispatchVsClosed": { de: "Dispatch vs. Closed", en: "Dispatch vs. closed" },
  "stats.dispatched": { de: "Zugewiesen", en: "Dispatched" },
  "stats.closed": { de: "Geschlossen", en: "Closed" },
  "stats.ticketTypes": { de: "Ticket-Typen", en: "Ticket types" },
  "stats.closedVsExpired": { de: "Closed vs. Expired", en: "Closed vs. expired" },
  "stats.statusDistribution": { de: "Status-Verteilung", en: "Status distribution" },
  "stats.dispatchPerDay": { de: "Dispatch / Tag", en: "Dispatch / day" },
  "stats.closedPerDay": { de: "Closed / Tag", en: "Closed / day" },
  "stats.expiredPerDay": { de: "Expired / Tag", en: "Expired / day" },
  "stats.fetchError": { de: "Statistiken konnten nicht geladen werden.", en: "Statistics could not be loaded." },
  "stats.retryNow": { de: "Erneut laden", en: "Retry" },

  /* ── ODIN Logic ── */
  "odin.title": { de: "ODIN-Logik", en: "ODIN Logic" },
  "odin.subtitle": { de: "Hier steuerst du die automatische Ticketzuweisung — teste, prüfe Ergebnisse und aktiviere den Live-Modus wenn alles passt.", en: "Control automatic ticket assignment here — test, review results, and activate live mode when ready." },
  "odin.liveConfirmTitle": { de: "Produktive automatische Zuweisung aktivieren", en: "Enable productive auto-assignment" },
  "odin.liveConfirmMessage": { de: "Du bist dabei, die produktive automatische Zuweisung zu aktivieren. Tickets werden ab sofort automatisch zugewiesen.", en: "You are about to enable productive automatic assignment. Tickets will be assigned automatically from now on." },
  "odin.liveConfirmButton": { de: "Ja, Live-Automatik aktivieren", en: "Yes, enable live automation" },
  "odin.shadowConfirmTitle": { de: "Automatische Zuweisung starten (Shadow)", en: "Start automatic assignment (shadow)" },
  "odin.shadowConfirmMessage": { de: "Möchtest du die automatische Zuweisungslogik im Shadow-Modus starten?", en: "Do you want to start the automatic assignment logic in shadow mode?" },
  "odin.shadowConfirmButton": { de: "Ja, Shadow-Automatik starten", en: "Yes, start shadow automation" },
  "odin.stopConfirmTitle": { de: "Automatische Zuweisung stoppen", en: "Stop automatic assignment" },
  "odin.stopConfirmMessage": { de: "Möchtest du die automatische Zuweisungslogik stoppen?", en: "Do you want to stop the automatic assignment logic?" },
  "odin.stopConfirmButton": { de: "Ja, Automatik stoppen", en: "Yes, stop automation" },
  "odin.runsTab": { de: "Lauf-Historie", en: "Run history" },
  "odin.decisionsTab": { de: "Ticket-Entscheidungen", en: "Ticket decisions" },
  "odin.reportTab": { de: "Lauf-Bericht", en: "Run report" },
  "odin.logicTreeTab": { de: "Regelwerk", en: "Rule engine" },
  "odin.flowTab": { de: "Zuweisungsfluss", en: "Assignment flow" },
  "odin.settingsTab": { de: "Einstellungen", en: "Settings" },
  "odin.crawlerOverride": { de: "Crawler-Override", en: "Crawler override" },
  "odin.staleData": { de: "Veraltete Daten", en: "Stale data" },
  "odin.dryRun": { de: "Dry-Run", en: "Dry run" },
  "odin.shadowRun": { de: "Shadow-Run starten", en: "Start shadow run" },
  "odin.runInProgress": { de: "Läuft…", en: "Running…" },
  "odin.automaticAssignment": { de: "Automatische Zuweisung", en: "Automatic assignment" },
  "odin.disabled": { de: "Deaktiviert", en: "Disabled" },
  "odin.liveActive": { de: "Live aktiv", en: "Live active" },
  "odin.shadowActive": { de: "Shadow aktiv", en: "Shadow active" },
  "odin.lastStarted": { de: "Zuletzt gestartet", en: "Last started" },
  "odin.stopped": { de: "Gestoppt", en: "Stopped" },
  "odin.by": { de: "von", en: "by" },
  "odin.mode": { de: "Modus", en: "Mode" },
  "odin.startShadowAutomation": { de: "Shadow-Automatik starten", en: "Start shadow automation" },
  "odin.startLiveAutomation": { de: "Live-Automatik starten", en: "Start live automation" },
  "odin.stopAutomation": { de: "Automatik stoppen", en: "Stop automation" },
  "odin.engineSettings": { de: "Regeln & Schwellenwerte anpassen", en: "Adjust rules & thresholds" },
  "odin.selectRunForReport": { de: "Wähle zuerst einen Run im Tab \u201ERuns & Logs\u201C.", en: 'Select a run in the "Runs & logs" tab first.' },
  "odin.loadReport": { de: "Report laden", en: "Load report" },
  "odin.validationConsistent": { de: "✓ Ticketzählung konsistent", en: "✓ Ticket count consistent" },
  "odin.validationInconsistent": { de: "⚠ Ticketzählung inkonsistent", en: "⚠ Ticket count inconsistent" },
  "odin.processed": { de: "Verarbeitet", en: "Processed" },
  "odin.assigned": { de: "Zugewiesen", en: "Assigned" },
  "odin.unassigned": { de: "Nicht zugewiesen", en: "Unassigned" },
  "odin.notRelevant": { de: "Nicht relevant", en: "Not relevant" },
  "odin.crawlerOverrideActive": { de: "⚠ Crawler-Override war aktiv", en: "⚠ Crawler override was active" },
  "odin.crawlerOverrideHint": { de: "Ergebnisse basieren möglicherweise auf veralteten Crawler-Daten.", en: "Results may be based on stale crawler data." },
  "odin.assignedTickets": { de: "✓ Zugewiesene Tickets", en: "✓ Assigned tickets" },
  "odin.unassignedTickets": { de: "✗ Nicht zugewiesene Tickets", en: "✗ Unassigned tickets" },
  "odin.ticket": { de: "Ticket", en: "Ticket" },
  "odin.system": { de: "System", en: "System" },
  "odin.category": { de: "Kategorie", en: "Category" },
  "odin.queue": { de: "Queue", en: "Queue" },
  "odin.assignedTo": { de: "Zugewiesen an", en: "Assigned to" },
  "odin.reason": { de: "Begründung", en: "Reason" },
  "odin.status": { de: "Status", en: "Status" },
  "odin.modeDryRun": { de: "Dry-Run", en: "Dry run" },

  /* ── Teams Center ── */
  "teams.channelDelivery": { de: "Kanalversand", en: "Channel delivery" },
  "teams.personalMessages": { de: "Persönliche Nachrichten", en: "Personal messages" },
  "teams.scope": { de: "Prüfumfang", en: "Scope" },
  "teams.diagnosticsScope": { de: "Das Fehlercenter kombiniert Konfiguration, echte Authentifizierung, Graph-Lesetest und aktuelle Versandlage.", en: "Diagnostics combine configuration, real authentication, a Graph read test, and the current delivery state." },
  "teams.diagnosticsValue": { de: "Dadurch sieht man nicht nur dass Teams nicht funktioniert, sondern woran es konkret scheitert.", en: "This shows not only that Teams is failing, but also why it is failing." },
  "teams.checksDocumentation": { de: "Jeder Check dokumentiert Prüfschritt, Ergebnis, technische Details und den nächsten sinnvollen Arbeitsschritt.", en: "Each check documents the verification step, the result, technical details, and the next sensible action." },
  "teams.commonCauses": { de: "Häufige Ursachen", en: "Common causes" },
  "teams.blockingCauses": { de: "In der Praxis blockieren am häufigsten drei Dinge: fehlender Webhook, fehlende Graph-Rechte oder ein gültiges Token ohne Admin Consent.", en: "In practice, three things block delivery most often: a missing webhook, missing Graph permissions, or a valid token without admin consent." },
  "teams.debugTip": { de: "Wenn Kanalversand läuft, persönliche Nachrichten aber nicht, liegt die Ursache fast immer im Graph- oder Bot-Pfad.", en: "If channel delivery works but personal messages do not, the root cause is almost always the Graph or bot path." },
  "teams.howToUse": { de: "Wie man es nutzt", en: "How to use it" },
  "teams.usageInstructions": { de: "Erst die roten Blocker beheben, dann die Hinweise prüfen, danach im Test Center mit Kanal- und Personaltest verifizieren.", en: "Fix the red blockers first, review the warnings second, then verify the result in the test centre with channel and personal tests." },
  "teams.traceableAnalysis": { de: "So bleibt die Fehleranalyse nachvollziehbar und endet nicht bei einem reinen Konfigurations-Check.", en: "This keeps troubleshooting traceable instead of ending at a pure configuration check." },
  "teams.eventsDescription": { de: "Welche ODIN-Events lösen Teams-Nachrichten aus? Jedes Event kann einzeln aktiviert/deaktiviert und konfiguriert werden.", en: "Which ODIN events trigger Teams messages? Each event can be enabled, disabled, and configured separately." },
  "teams.eventActiveInactive": { de: "Event aktiv/inaktiv", en: "Event active/inactive" },
  "teams.eventToggleHint": { de: "Schaltet das Event ein oder aus. Inaktive Events lösen keine Teams-Nachrichten aus, auch wenn die Bedingung im System eintritt.", en: "Turns the event on or off. Inactive events trigger no Teams messages even if the condition occurs in the system." },
  "teams.important": { de: "Wichtig", en: "Important" },
  "teams.disablingNote": { de: "Deaktivierung betrifft nur den Nachrichtenversand. Das Event selbst wird weiterhin im System erkannt und geloggt.", en: "Disabling only affects message delivery. The event itself is still recognised and logged by the system." },

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
  /* ── Login ── */
  "login.loginFailed": { de: "Anmeldung fehlgeschlagen. Bitte Daten prüfen.", en: "Sign-in failed. Please check your credentials." },
  "login.emailHint": { de: "Melde dich mit deiner Benutzerkennung an.", en: "Sign in with your user ID." },
  "login.email": { de: "Benutzerkennung", en: "User ID" },
  "login.emailPlaceholder": { de: "Vorname@Nachname", en: "Firstname@Lastname" },
  "login.userIdInvalid": { de: "Bitte Benutzerkennung im Format Vorname@Nachname eingeben.", en: "Please enter your user ID in the format Firstname@Lastname." },
  "login.password": { de: "Passwort", en: "Password" },
  "login.hidePassword": { de: "Passwort verbergen", en: "Hide password" },
  "login.showPassword": { de: "Passwort anzeigen", en: "Show password" },
  "login.loggingIn": { de: "Anmelden…", en: "Signing in..." },
  "login.loginButton": { de: "Anmelden", en: "Sign in" },
  "login.forgotPassword": { de: "Passwort vergessen?", en: "Forgot password?" },
  "login.noAccount": { de: "Noch kein Konto?", en: "No account yet?" },
  "login.register": { de: "Registrieren", en: "Register" },
  /* ── ForgotPassword ── */
  "forgotPassword.title": { de: "Passwort zurücksetzen", en: "Reset password" },
  "forgotPassword.subtitle": { de: "Du erhältst einen Reset-Link per E-Mail", en: "You will receive a reset link by email" },
  "forgotPassword.email": { de: "E-Mail", en: "Email" },
  "forgotPassword.emailPlaceholder": { de: "vorname.nachname@eu.equinix.com", en: "firstname.lastname@eu.equinix.com" },
  "forgotPassword.submitButton": { de: "Reset-Link senden", en: "Send reset link" },
  "forgotPassword.backToLogin": { de: "Zurück zum Login", en: "Back to login" },
  /* ── AccessDenied ── */
  "accessDenied.title": { de: "Zugriff verweigert", en: "Access denied" },
  "accessDenied.message": { de: "Du hast keine Berechtigung, diese Seite aufzurufen.", en: "You do not have permission to open this page." },
  "accessDenied.backButton": { de: "Zurück", en: "Back" },
  /* ── CommitCompliance ── */
  "commitCompliance.pdfOnlyError": { de: "Nur PDF-Dateien erlaubt.", en: "Only PDF files are allowed." },
  "commitCompliance.uploadFailedError": { de: "Upload fehlgeschlagen.", en: "Upload failed." },
  "commitCompliance.subtitle": { de: "Crawler-Ergebnisse hochladen und SLA-Abweichungen automatisch erkennen", en: "Upload crawler results and automatically detect SLA deviations" },
  "commitCompliance.uploadSection": { de: "PDF-Upload", en: "PDF upload" },
  "commitCompliance.uploadingButton": { de: "Wird hochgeladen...", en: "Uploading..." },
  "commitCompliance.uploadButton": { de: "Hochladen", en: "Upload" },
  "commitCompliance.uploadedFiles": { de: "Hochgeladene Dateien", en: "Uploaded files" },
  /* ── DBS ── */
  "dbs.coloDashboardTitle": { de: "Colo-Dashboard", en: "Colo dashboard" },
  "dbs.coloDashboardDesc": { de: "Zeigt die für die aktuelle Woche geplanten Arbeiten an.", en: "Shows the work planned for the current week." },
  "dbs.completeListTitle": { de: "Vollständige Liste", en: "Complete list" },
  "dbs.completeListDesc": { de: "Vollständiger Colo 2.0 Excel-Datensatz.", en: "Complete Colo 2.0 Excel dataset." },
  "dbs.networkViewTitle": { de: "Netzwerkansicht", en: "Network view" },
  "dbs.networkViewDesc": { de: "Grafische Kabelvisualisierung im FNT-Stil.", en: "Graphical cable visualization in an FNT-style layout." },
  "dbs.pageSubtitle": { de: "Colocation Planung und Übersicht", en: "Colocation planning and overview" },
  /* ── EmployeeContacts ── */
  "employeeContacts.title": { de: "Mitarbeiter-Kontakte", en: "Employee contacts" },
  "employeeContacts.subtitle": { de: "E-Mail-Adressen für Schichtplan-Benachrichtigungen", en: "Email addresses for shift plan notifications" },
  /* ── DashboardInfoBar ── */
  "dashboardInfo.deleteEntryConfirm": { de: "Eintrag wirklich löschen?", en: "Delete this entry?" },
  "dashboardInfo.displayActive": { de: "ANZEIGE AKTIV", en: "DISPLAY ACTIVE" },
  "dashboardInfo.hidden": { de: "VERBORGEN", en: "HIDDEN" },
  "dashboardInfo.hideButton": { de: "Ausblenden", en: "Hide" },
  "dashboardInfo.showButton": { de: "Anzeigen", en: "Show" },
  "dashboardInfo.noEntries": { de: "Keine Einträge vorhanden.", en: "No entries available." },
  "dashboardInfo.typeInstruction": { de: "Anweisung", en: "Instruction" },
  "dashboardInfo.typeInformation": { de: "Information", en: "Information" },
  "dashboardInfo.deletionBadge": { de: "Löschung", en: "Deletion" },
  "dashboardInfo.addPlaceholder": { de: "Neue Information hinzufügen...", en: "Add new information..." },
  "dashboardInfo.settingsMenu": { de: "Einstellungen", en: "Settings" },
  "dashboardInfo.markAsInfo": { de: "Als Information markieren", en: "Mark as information" },
  "dashboardInfo.markAsInstruction": { de: "Als Anweisung markieren", en: "Mark as instruction" },
  "dashboardInfo.autoDeletion": { de: "Automatische Löschung", en: "Automatic deletion" },
  "dashboardInfo.removeAutoDeletion": { de: "Auto-Löschung entfernen", en: "Remove auto deletion" },
  /* ── ProjectsPanel ── */
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
  /* ── Register ── */
  "register.registerFailed": { de: "Registrierung fehlgeschlagen", en: "Registration failed" },
  "register.title": { de: "Konto registrieren", en: "Register account" },
  "register.subtitle": { de: "Registrierung erfordert Admin-Freigabe", en: "Registration requires administrator approval" },
  "register.infoLineOne": { de: "Verwende deine interne Benutzerkennung im Format Vorname@Nachname.", en: "Use your internal user ID in the format Firstname@Lastname." },
  "register.infoLineTwo": { de: "Nach der Registrierung muss ein Admin dein Konto freigeben, bevor du dich einloggen kannst.", en: "After registration, an administrator must approve your account before you can sign in." },
  "register.firstName": { de: "Vorname", en: "First name" },
  "register.lastName": { de: "Nachname", en: "Last name" },
  "register.loginName": { de: "Benutzerkennung", en: "User ID" },
  "register.loginNamePlaceholder": { de: "Vorname@Nachname", en: "Firstname@Lastname" },
  "register.email": { de: "E-Mail (optional)", en: "Email (optional)" },
  "register.emailPlaceholder": { de: "kontakt@firma.de", en: "contact@company.com" },
  "register.location": { de: "Standort (IBX)", en: "Location (IBX)" },
  "register.locationPlaceholder": { de: "Standort auswählen", en: "Select location" },
  "register.department": { de: "Abteilung", en: "Department" },
  "register.departmentPlaceholder": { de: "Abteilung auswählen", en: "Select department" },
  "register.password": { de: "Passwort", en: "Password" },
  "register.hidePassword": { de: "Passwort verbergen", en: "Hide password" },
  "register.showPassword": { de: "Passwort anzeigen", en: "Show password" },
  "register.passwordHint": { de: "Mindestens 8 Zeichen mit Groß-/Kleinbuchstaben und einer Zahl.", en: "At least 8 characters with uppercase, lowercase, and one number." },
  "register.successTitle": { de: "Registrierung erfolgreich!", en: "Registration successful!" },
  "register.successBody": { de: "Dein Konto wurde angelegt. Ein Admin gibt es frei, bevor du dich anmelden kannst.", en: "Your account request was created. An administrator must approve it before you can sign in." },
  "register.submitting": { de: "Wird gesendet…", en: "Submitting..." },
  "register.submitButton": { de: "Registrierung anfragen", en: "Request registration" },
  "register.backToLogin": { de: "Zurück zum Login", en: "Back to login" },
  /* ── TicketAudit ── */
  "ticketAudit.today": { de: "Heute", en: "Today" },
  "ticketAudit.week": { de: "Woche", en: "Week" },
  "ticketAudit.month": { de: "Monat", en: "Month" },
  "ticketAudit.year": { de: "Jahr", en: "Year" },
  "ticketAudit.customRange": { de: "Zeitraum", en: "Range" },
  "ticketAudit.subtitle": { de: "Administratives Auswertungs-Dashboard – Ticketaktivität und manuelle Übernahmen", en: "Administrative analytics dashboard – ticket activity and manual takeovers" },
  "ticketAudit.rangeLabel": { de: "Zeitraum", en: "Range" },
  "ticketAudit.manualTakeoversTitle": { de: "Manuelle Ticketübernahmen ohne ODIN-Zuweisung", en: "Manual ticket takeovers without ODIN assignment" },
  "ticketAudit.noManualTakeovers": { de: "Keine manuellen Übernahmen ohne Zuweisung im gewählten Zeitraum.", en: "No manual takeovers without assignment in the selected period." },
  "ticketAudit.employee": { de: "Mitarbeiter", en: "Employee" },
  "ticketAudit.withoutAssignment": { de: "Ohne Zuweisung", en: "Without assignment" },
  "ticketAudit.total": { de: "Gesamt", en: "Total" },
  "ticketAudit.share": { de: "Anteil", en: "Share" },
  "ticketAudit.lastTakeover": { de: "Letzte Übernahme", en: "Last takeover" },
  "ticketAudit.ticketTypes": { de: "Tickettypen", en: "Ticket types" },
  "ticketAudit.processingStatsTitle": { de: "Bearbeitungsstatistik je Mitarbeiter", en: "Processing statistics by employee" },
  "ticketAudit.noActivity": { de: "Keine Ticketaktivität im gewählten Zeitraum.", en: "No ticket activity in the selected period." },
  "ticketAudit.closed": { de: "Geschlossen", en: "Closed" },
  "ticketAudit.closeRate": { de: "Abschlussquote", en: "Close rate" },
  "ticketAudit.definitionsTitle": { de: "Definitionen und Berechnungsgrundlagen", en: "Definitions and calculation rules" },
  "ticketAudit.manualTakeoverDefLabel": { de: "Manuelle Übernahme ohne Zuweisung:", en: "Manual takeover without assignment:" },
  "ticketAudit.manualTakeoverDefDesc": { de: "Ein Ticket, bei dem ein Mitarbeiter als Owner eingetragen ist, aber keine ODIN-Zuweisungsentscheidung existiert.", en: "A ticket where an employee is the owner but no ODIN assignment decision exists." },
  "ticketAudit.processedTicketDefLabel": { de: "Bearbeitetes Ticket:", en: "Processed ticket:" },
  "ticketAudit.processedTicketDefDesc": { de: "Ein Ticket, das einem Mitarbeiter als Owner zugeordnet ist und im gewählten Zeitraum aktiv war.", en: "A ticket assigned to an employee as owner and active during the selected period." },
  "ticketAudit.closeRateDefLabel": { de: "Abschlussquote:", en: "Close rate:" },
  "ticketAudit.closeRateDefDesc": { de: "Anteil der Tickets mit Abschlussdatum an der Gesamtzahl der zugeordneten Tickets.", en: "Share of tickets with a close date compared to the total assigned tickets." },

  /* ── OdinLogicTree ── */
  "logicTree.title": { de: "Zuweisungslogik - Entscheidungsbaum", en: "Assignment logic - decision tree" },
  "logicTree.description": { de: "Visualisiert die aktuelle Pipeline der Assignment Engine. Klicken Sie auf Knoten mit Unterebenen, um diese ein-/auszuklappen.", en: "Visualizes the current assignment engine pipeline. Click nodes with child levels to expand or collapse them." },
  "logicTree.badgeRule": { de: "Regel", en: "Rule" },
  "logicTree.badgeAction": { de: "Aktion", en: "Action" },
  "logicTree.openPoints": { de: "Offene Punkte", en: "Open points" },

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
  "shiftAdmin.helpPlanTargetHours": { de: "Ziel-Arbeitsstunden pro Monat und Mitarbeiter. Die Engine versucht, jeden Mitarbeiter nahe an diesen Wert zu planen. 0 = kein festes Ziel.", en: "Target work hours per month per employee. The engine tries to plan each employee close to this value. 0 = no fixed target." },
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

  /* ── EmployeeExclusions ── */
  "exclusions.reasonProject": { de: "Projektarbeit", en: "Project work" },
  "exclusions.reasonAdminOverride": { de: "Admin-Vorgabe", en: "Admin override" },
  "exclusions.reasonNoOperative": { de: "Keine operative Ticketbearbeitung", en: "No operational ticket handling" },
  "exclusions.reasonTemporary": { de: "Temporär ausgeschlossen", en: "Temporarily excluded" },
  "exclusions.title": { de: "Dauerhafte Assignment-Ausschlüsse", en: "Permanent assignment exclusions" },
  "exclusions.subtitle": { de: "Mitarbeiter dauerhaft oder zeitlich begrenzt von automatischer Ticketzuweisung ausschließen", en: "Exclude employees from automatic ticket assignment permanently or for a limited time" },
  "exclusions.quickExclude": { de: "Schnell-Ausschluss — Mitarbeiter per Drag & Drop oder Klick verschieben", en: "Quick exclusion - move employees via drag and drop or click" },
  "exclusions.quickExcludeInfo": { de: "Für schnelle operative Eingriffe. Dabei wird automatisch der Grund \u201EAdmin-Vorgabe\u201C verwendet. Für genaue Gründe oder Zeiträume das Formular darunter nutzen.", en: "For quick operational interventions. The default reason is set to \u201CAdmin override\u201D automatically. Use the form below for specific reasons or date ranges." },
  "exclusions.filterEmployees": { de: "Mitarbeiter filtern\u2026", en: "Filter employees..." },
  "exclusions.available": { de: "Verfügbar", en: "Available" },
  "exclusions.noMatches": { de: "Keine Treffer", en: "No matches" },
  "exclusions.allExcluded": { de: "Alle Mitarbeiter sind ausgeschlossen", en: "All employees are excluded" },
  "exclusions.excluded": { de: "Ausgeschlossen", en: "Excluded" },
  "exclusions.noExclusions": { de: "Keine Ausschlüsse — Mitarbeiter hierher ziehen", en: "No exclusions - drag employees here" },
  "exclusions.quickFooter": { de: "Schnell-Ausschlüsse verwenden Grund \u201EAdmin-Vorgabe\u201C. Für spezifische Gründe / Zeiträume das Formular unten nutzen.", en: "Quick exclusions use the reason \u201CAdmin override\u201D. Use the form below for specific reasons or time ranges." },
  "exclusions.addTitle": { de: "Neuen Ausschluss hinzufügen (mit Grund / Zeitraum)", en: "Add new exclusion (with reason / time range)" },
  "exclusions.addInfo": { de: "Hier können Ausschlüsse mit sauberer Begründung und optionalem Gültigkeitszeitraum angelegt werden.", en: "Create exclusions with a documented reason and an optional validity range." },
  "exclusions.searchEmployee": { de: "Mitarbeiter suchen\u2026", en: "Search employee..." },
  "exclusions.noEmployeeFound": { de: "Kein Mitarbeiter gefunden — manueller Name wird übernommen", en: "No employee found - manual name will be used" },
  "exclusions.reason": { de: "Grund", en: "Reason" },
  "exclusions.additionalReason": { de: "Zusätzliche Begründung", en: "Additional reason" },
  "exclusions.additionalReasonPlaceholder": { de: "Zusätzliche Begründung (optional)", en: "Additional reason (optional)" },
  "exclusions.add": { de: "Hinzufügen", en: "Add" },
  "exclusions.limitPeriod": { de: "Zeitlich begrenzen (optional):", en: "Limit time period (optional):" },
  "exclusions.until": { de: "bis", en: "to" },
  "exclusions.activeExclusions": { de: "Aktive Ausschlüsse", en: "Active exclusions" },
  "exclusions.noActiveExclusions": { de: "Keine aktiven Ausschlüsse vorhanden", en: "No active exclusions available" },
  "exclusions.justification": { de: "Begründung", en: "Justification" },
  "exclusions.validFrom": { de: "Gültig von", en: "Valid from" },
  "exclusions.validTo": { de: "Gültig bis", en: "Valid to" },
  "exclusions.createdBy": { de: "Erstellt von", en: "Created by" },
  "exclusions.createdAt": { de: "Erstellt am", en: "Created at" },
  "exclusions.actions": { de: "Aktionen", en: "Actions" },
  "exclusions.deactivate": { de: "Deaktivieren", en: "Deactivate" },
  "exclusions.deletePermanently": { de: "Endgültig löschen", en: "Delete permanently" },
  "exclusions.showInactive": { de: "Auch deaktivierte Ausschlüsse anzeigen", en: "Also show inactive exclusions" },
  "exclusions.inactiveExclusions": { de: "Deaktivierte Ausschlüsse", en: "Inactive exclusions" },
  "exclusions.deactivatedBy": { de: "Deaktiviert von", en: "Deactivated by" },
  "exclusions.deactivatedAt": { de: "Deaktiviert am", en: "Deactivated at" },
  "exclusions.introText": { de: "Hier werden Mitarbeiter gepflegt, die ODIN gar nicht oder nur in bestimmten Zeiträumen automatisch berücksichtigen darf.", en: "Manage employees whom ODIN must exclude from automatic consideration either permanently or during defined periods." },
  "exclusions.tooltipReason": { de: "Standardisierte Ursache für den Ausschluss, z. B. Projektarbeit, Training oder operative Aussteuerung.", en: "Standardized cause for the exclusion, for example project work, training, or operational removal." },
  "exclusions.tooltipAdditionalReason": { de: "Freitext für Details, die aus dem Standardgrund nicht hervorgehen, z. B. Projektname oder Teamabsprache.", en: "Free text for details not covered by the standard reason, for example project name or team agreement." },
  "exclusions.tooltipLimitPeriod": { de: "Mit Von/Bis kann ein Ausschluss automatisch nur für einen definierten Zeitraum gelten.", en: "Use From/To to limit an exclusion automatically to a defined period." },
  "exclusions.tooltipActiveExclusions": { de: "Diese Mitarbeiter werden aktuell von ODIN bei der automatischen Auswahl ausgeschlossen.", en: "These employees are currently excluded by ODIN during automatic selection." },
  "exclusions.tooltipEmployee": { de: "Betroffene Person, die aktuell von Auto-Assignments ausgenommen ist.", en: "Affected person currently excluded from auto assignments." },
  "exclusions.tooltipReasonCol": { de: "Standardisierter Ausschlussgrund.", en: "Standardized exclusion reason." },
  "exclusions.tooltipJustification": { de: "Zusätzlicher Freitext mit Kontext.", en: "Additional free-text context." },
  "exclusions.tooltipValidFrom": { de: "Startdatum des Ausschlusses.", en: "Start date of the exclusion." },
  "exclusions.tooltipValidTo": { de: "Optionales Enddatum. Danach kann der Ausschluss automatisch oder operativ beendet werden.", en: "Optional end date. Afterwards the exclusion can end automatically or operationally." },
  "exclusions.tooltipCreatedBy": { de: "Wer den Ausschluss angelegt hat.", en: "Who created the exclusion." },
  "exclusions.tooltipCreatedAt": { de: "Zeitpunkt der Anlage.", en: "Timestamp of creation." },
  "exclusions.tooltipActions": { de: "Deaktivieren beendet den Ausschluss, Löschen entfernt ihn vollständig aus der Liste.", en: "Deactivate ends the exclusion, delete removes it completely from the list." },
  "exclusions.tooltipShowInactive": { de: "Zeigt zusätzlich historische, bereits deaktivierte Ausschlüsse für Nachvollziehbarkeit und Audit.", en: "Also shows historical deactivated exclusions for auditability." },
  "exclusions.tooltipInactive": { de: "Historische Einträge, die aktuell nicht mehr greifen, aber für Nachvollziehbarkeit erhalten bleiben.", en: "Historical entries that no longer apply but remain for traceability." },

  /* ── AssignmentRulesEditor ── */
  "rules.title": { de: "ODIN-Logik Konfiguration", en: "ODIN logic configuration" },
  "rules.subtitle": { de: "Assignment Rules & Prioritäten", en: "Assignment rules and priorities" },
  "rules.titleAlt": { de: "ODIN-Logik Konfiguration", en: "ODIN logic configuration" },
  "rules.subtitleAlt": { de: "Assignment Rules, Prioritäten & Hierarchien", en: "Assignment rules, priorities, and hierarchies" },
  "rules.catPriorities": { de: "Prioritäten", en: "Priorities" },
  "rules.catRoleRules": { de: "Rollenregeln", en: "Role rules" },
  "rules.catLoadBalancing": { de: "Lastverteilung", en: "Load balancing" },
  "rules.catExceptions": { de: "Ausnahmen", en: "Exceptions" },
  "rules.newStarter": { de: "Neustarter", en: "New starter" },
  "rules.normalOperation": { de: "Normalbetrieb", en: "Normal operation" },
  "rules.noTiersConfigured": { de: "Keine Prioritätsstufen definiert.", en: "No priority tiers defined." },
  "rules.adjustOrder": { de: "Reihenfolge per Buttons anpassen", en: "Adjust order with the buttons" },
  "rules.types": { de: "Typen", en: "Types" },
  "rules.priorities": { de: "Prioritäten", en: "Priorities" },
  "rules.all": { de: "alle", en: "all" },
  "rules.onlyOtherTeamsHandovers": { de: "Nur OtherTeams-Handovers", en: "Only OtherTeams handovers" },
  "rules.allowTroubleTickets": { de: "Trouble Tickets erlauben", en: "Allow Trouble Tickets" },
  "rules.ccOnlyAbove24h": { de: "Cross Connect nur bei mehr als 24h Restzeit", en: "Allow Cross Connect only above 24h remaining" },
  "rules.blockedTicketTypes": { de: "Explizit blockierte Tickettypen", en: "Explicitly blocked ticket types" },
  "rules.allowedCcTicketTypes": { de: "Erlaubte Tickettypen für die CC-Rolle", en: "Allowed ticket types for the CC role" },
  "rules.mixableTicketTypes": { de: "Zusätzlich mischbare Tickettypen", en: "Additional mixable ticket types" },
  "rules.ttExceptionResourceShortage": { de: "TT-Ausnahme bei knappen Ressourcen", en: "TT exception during resource shortage" },
  "rules.mixOnlySameSystem": { de: "Nur gleiches System mischen", en: "Mix only the same system" },
  "rules.mixOnlySamePriority": { de: "Nur gleiche Priorität mischen", en: "Mix only the same priority" },
  "rules.ttExceptionRemainingTime": { de: "TT-Ausnahme ab Restzeit", en: "TT exception from remaining time" },
  "rules.maxShPerWorkerSystem": { de: "Maximale SH-Tickets pro Worker und System", en: "Maximum SH tickets per worker and system" },
  "rules.maxTimeDiffCcGrouping": { de: "Maximale Restzeit-Differenz für CC-Systemgruppierung", en: "Maximum remaining-time difference for CC system grouping" },
  "rules.fewestTicketsFirst": { de: "Wenigste Tickets zuerst", en: "Fewest tickets first" },
  "rules.stableOrder": { de: "Stabile Reihenfolge", en: "Stable order" },
  "rules.overallTicketLimit": { de: "Gesamtlimit aktiver Tickets pro Worker", en: "Overall limit of active tickets per worker" },
  "rules.noLimit": { de: "Kein Limit", en: "No limit" },
  "rules.limitsPerTicketType": { de: "Limits pro Tickettyp", en: "Limits per ticket type" },
  "rules.limitsPerRole": { de: "Limits pro Rolle", en: "Limits per role" },
  "rules.limitsPerRoleAndType": { de: "Limits pro Rolle und Tickettyp", en: "Limits per role and ticket type" },
  "rules.preferExpedite": { de: "Expedite bevorzugen", en: "Prefer expedite" },
  "rules.noVisualEditor": { de: "Für diese Regel ist noch kein visueller Editor hinterlegt. Nutze bei Bedarf den erweiterten JSON-Modus unten.", en: "No visual editor is implemented for this rule yet. Use the advanced JSON mode below if needed." },
  "rules.emptyNoOverride": { de: "leer = kein Sonderlimit", en: "empty = no override" },
  "rules.changeNote": { de: "Änderungsnotiz", en: "Change note" },
  "rules.changeNotePlaceholder": { de: "Was wurde geändert und warum?", en: "What changed and why?" },
  "rules.showAdvancedJson": { de: "Erweiterten JSON-Modus anzeigen", en: "Show advanced JSON mode" },
  "rules.hideAdvancedJson": { de: "Erweiterten JSON-Modus ausblenden", en: "Hide advanced JSON mode" },
  "rules.advancedJsonOnlySpecial": { de: "Nur für Sonderfälle oder neue Regelstrukturen. Änderungen hier überschreiben die visuellen Controls.", en: "Only for special cases or new rule structures. Changes here override the visual controls." },
  "rules.history": { de: "Verlauf", en: "History" },
  "rules.changeHistory": { de: "Änderungshistorie", en: "Change history" },
  "rules.lastChangedBy": { de: "Zuletzt geändert von", en: "Last changed by" },
  "rules.version": { de: "Version", en: "Version" },
  "rules.rollback": { de: "Rollback", en: "Rollback" },
  "rules.noExplanation": { de: "Keine zusätzliche Erklärung hinterlegt.", en: "No additional explanation available." },
  "rules.noCategoryDescription": { de: "Keine zusätzliche Kategoriebeschreibung hinterlegt.", en: "No additional category description available." },

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
  "sc.preferredColleagues": { de: "Wunschkollegen", en: "Preferred colleagues" },
  "sc.noPreferredColleagues": { de: "Keine Wunschkollegen", en: "No preferred colleagues" },
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

  /* ── Teams Communication Center ── */
  "teams.quietHoursStart": { de: "Quiet Hours Start", en: "Quiet hours start" },
  "teams.quietHoursEnd": { de: "Quiet Hours Ende", en: "Quiet hours end" },
  "teams.criticalOnly": { de: "Nur kritische nachts", en: "Only critical overnight" },
  "teams.maxMessagesDay": { de: "Max. Nachrichten/Tag", en: "Max messages/day" },
  "teams.digestInterval": { de: "Digest-Intervall (Min)", en: "Digest interval (min)" },
  "teams.defaultCooldown": { de: "Cooldown Standard (Min)", en: "Default cooldown (min)" },
  "teams.escalationDelay": { de: "Eskalationsverz\u00f6gerung (Min)", en: "Escalation delay (min)" },
  "teams.fallbackRecipient": { de: "Fallback-Empf\u00e4nger", en: "Fallback recipient" },
  "teams.duplicateWindow": { de: "Duplikat-Fenster (Min)", en: "Duplicate window (min)" },
  "teams.notifySystemExclusions": { de: "System-Ausschl\u00fcsse melden", en: "Notify on system exclusions" },
  "teams.notifySubtypeExclusions": { de: "Subtype-Ausschl\u00fcsse melden", en: "Notify on subtype exclusions" },
  "teams.liveOnly": { de: "Nur im Live-Modus senden", en: "Send only in live mode" },
  "teams.directRecipients": { de: "Direkte Empf\u00e4nger", en: "Direct recipients" },
  "teams.specificShifts": { de: "Nur f\u00fcr bestimmte Schichten", en: "Only for specific shifts" },
  "teams.groupTargets": { de: "Gruppen-Ziele", en: "Group targets" },
  "teams.channelFallback": { de: "Kanal-Fallback erlauben", en: "Allow channel fallback" },
  "teams.titleTemplate": { de: "Titel-Vorlage", en: "Title template" },
  "teams.bodyTemplate": { de: "Text-Vorlage", en: "Body template" },
  "teams.botBaseUrl": { de: "Bot-Base-URL", en: "Bot base URL" },
  "teams.timingMatrix": { de: "Wann soll wer eine Nachricht bekommen", en: "Who should receive which message when" },
  "teams.standardPersonShift": { de: "Standardnachrichten f\u00fcr Personen/Schichten", en: "Standard messages for people/shifts" },
  "teams.standardGroupMessages": { de: "Standardnachrichten f\u00fcr Gruppen", en: "Standard messages for groups" },
  "teams.globalDeliveryRules": { de: "Globale Versandregeln", en: "Global delivery rules" },
  "teams.globalDeliveryRulesDesc": { de: "Basisverhalten f\u00fcr Ruhezeiten, Deduplizierung und Eskalation.", en: "Base behavior for quiet hours, deduplication, and escalation." },
  "teams.dispatcherExcluded": { de: "Dispatcher bei ausgeschlossenen Tickets", en: "Dispatcher for excluded tickets" },
  "teams.dispatcherExcludedDesc": { de: "Diese Einstellungen steuern die neue Backend-Benachrichtigung f\u00fcr Tickets, die wegen Systemname oder Subtype in den manuellen Review laufen.", en: "These settings control the new backend notification for tickets moved into manual review because of system name or subtype exclusions." },
  "teams.messageOrchestration": { de: "Nachrichten-Orchestrierung", en: "Message orchestration" },
  "teams.messageOrchestrationDesc": { de: "Vorbereitung f\u00fcr feinere Regeln wie personenspezifische Standards\u00e4tze, Gruppenansprache und zeitabh\u00e4ngige Zustellung.", en: "Preparation for finer rules such as person-specific defaults, group addressing, and time-based delivery." },
  "teams.on": { de: "An", en: "On" },
  "teams.off": { de: "Aus", en: "Off" },
  "teams.dispatcherReview": { de: "Dispatcher-Review", en: "Dispatcher review" },
  "teams.systemSubtypeExclusions": { de: "System- und Subtype-Ausschl\u00fcsse", en: "System and subtype exclusions" },
  "teams.deliveryPath": { de: "Zustellpfad", en: "Delivery path" },
  "teams.peopleChannelRouting": { de: "Personen und Kanalsteuerung", en: "People and channel routing" },
  "teams.routingPrep": { de: "Routing-Vorbereitung", en: "Routing preparation" },
  "teams.whoGetsWhat": { de: "Wer bekommt wann welche Nachricht", en: "Who gets which message and when" },
  "teams.advancedConfigured": { de: "Erweitert konfiguriert", en: "Advanced" },
  "teams.basic": { de: "Basis", en: "Basic" },
  "teams.immediate": { de: "Sofort", en: "Immediate" },
  "teams.priority": { de: "Priorit\u00e4t", en: "Priority" },
  "teams.mode": { de: "Modus", en: "Mode" },
  "teams.duplicateProtection": { de: "Duplikatschutz", en: "Duplicate protection" },
  "teams.yes": { de: "Ja", en: "Yes" },
  "teams.no": { de: "Nein", en: "No" },
  "teams.eventDescription": { de: "Welche ODIN-Events l\u00f6sen Teams-Nachrichten aus? Jedes Event kann einzeln aktiviert/deaktiviert und konfiguriert werden.", en: "Which ODIN events trigger Teams messages? Each event can be enabled, disabled, and configured separately." },

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

  /* ── Handover ── */
  "handover.title": { de: "Schichtübergabe", en: "Shift Handover" },
  "handover.subtitle": { de: "Offene Aufgaben zwischen Schichten übergeben — nichts geht verloren.", en: "Hand over open tasks between shifts — nothing gets lost." },
  "handover.newTask": { de: "Neue Aufgabe", en: "New task" },
  "handover.hideCompleted": { de: "Erledigte ausblenden", en: "Hide completed" },
  "handover.showCompleted": { de: "Erledigte anzeigen", en: "Show completed" },
  "handover.statusDone": { de: "Erledigt", en: "Done" },
  "handover.statusInProgress": { de: "In Bearbeitung", en: "In progress" },
  "handover.statusOpen": { de: "Offen", en: "Open" },

  /* ── Handover Form ── */
  "handover.formTitle": { de: "Neues Handover", en: "New handover" },
  "handover.ticketNumber": { de: "Ticketnummer", en: "Ticket number" },
  "handover.customerName": { de: "Kundenname", en: "Customer name" },
  "handover.area": { de: "Bereich", en: "Area" },
  "handover.type": { de: "Typ", en: "Type" },
  "handover.priority": { de: "Priorität", en: "Priority" },
  "handover.commitTime": { de: "Commit-Zeitpunkt", en: "Commit time" },
  "handover.description": { de: "Beschreibung", en: "Description" },
  "handover.selectFiles": { de: "Dateien auswählen", en: "Select files" },
  "handover.filesSelected": { de: "Datei(en) ausgewählt", en: "file(s) selected" },
  "handover.clearSelection": { de: "Auswahl löschen", en: "Clear selection" },
  "handover.requiredFields": { de: "Bitte alle Pflichtfelder ausfüllen.", en: "Please fill in all required fields." },

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

  /* ── Handover List / Item ── */
  "handover.completedHandovers": { de: "Erledigte Übergaben", en: "Completed handovers" },
  "handover.latestHandovers": { de: "Letzte Übergaben", en: "Latest handovers" },
  "handover.syncing": { de: "Wird synchronisiert …", en: "Syncing…" },
  "handover.alreadyTaken": { de: "Bereits von anderem Nutzer übernommen", en: "Already taken over by another user" },
  "handover.takeOver": { de: "Übernehmen", en: "Take over" },
  "handover.done": { de: "Erledigt", en: "Done" },

  /* ── CreateTaskModal ── */
  "handover.createTask": { de: "Neue Aufgabe erstellen", en: "Create new task" },
  "handover.assignee": { de: "Mitarbeiter", en: "Assignee" },
  "handover.loadingEllipsis": { de: "Laden…", en: "Loading…" },
  "handover.pleaseSelect": { de: "Bitte wählen", en: "Please select" },
  "handover.dueBy": { de: "Fällig bis", en: "Due by" },
  "handover.recurrence": { de: "Wiederholung", en: "Recurrence" },
  "handover.recurrenceNone": { de: "Keine", en: "None" },
  "handover.recurrenceDaily": { de: "Täglich", en: "Daily" },
  "handover.recurrenceWeekly": { de: "Wöchentlich", en: "Weekly" },
  "handover.recurrenceMonthly": { de: "Monatlich", en: "Monthly" },
  "handover.whatToDo": { de: "Was ist zu tun?", en: "What needs to be done?" },
  "handover.create": { de: "Erstellen", en: "Create" },

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

  /* ── Assignment Writeback ── */
  "writeback.panelTitle": { de: "Zuweisung Ausführung", en: "Assignment Execution" },
  "writeback.panelSubtitle": { de: "Kontrollierte Jarvis-Schreiboperationen mit Audit-Protokoll", en: "Controlled Jarvis write-back with full audit trail" },
  "writeback.tabPending": { de: "Ausstehend", en: "Pending" },
  "writeback.tabShadow": { de: "Shadow geprüft", en: "Shadow Validated" },
  "writeback.tabConfirm": { de: "Warte Bestätigung", en: "Awaiting Confirmation" },
  "writeback.tabApplied": { de: "Angewendet", en: "Applied" },
  "writeback.tabUnassign": { de: "Abweisung nötig", en: "Unassign Required" },
  "writeback.tabReassign": { de: "Neuzuweisung nötig", en: "Reassign Required" },
  "writeback.tabManualReview": { de: "Manuelle Prüfung", en: "Manual Review" },
  "writeback.tabFailed": { de: "Fehlgeschlagen", en: "Failed" },
  "writeback.tabOther": { de: "Sonstige", en: "Other" },
  "writeback.empty": { de: "Keine Aktionen in dieser Kategorie.", en: "No actions in this category." },
  "writeback.loading": { de: "Lade Aktionen…", en: "Loading actions…" },
  "writeback.refresh": { de: "Aktualisieren", en: "Refresh" },
  "writeback.reconcile": { de: "Abgleichen", en: "Reconcile" },
  "writeback.reconcileInfo": { de: "Vergleicht Snapshot-Zustand mit aktuellem ODIN-Zustand.", en: "Compares snapshot state with current ODIN state." },
  "writeback.reconcileResult": { de: "Abgleich-Ergebnis:", en: "Reconcile result:" },
  "writeback.snapshotCount": { de: "Snapshots:", en: "Snapshots:" },
  "writeback.discrepancies": { de: "Abweichungen:", en: "Discrepancies:" },
  "writeback.killSwitchActive": { de: "Kill-Switch aktiv — alle Schreiboperationen gesperrt.", en: "Kill switch active — all write operations are blocked." },
  "writeback.shadowModeActive": { de: "Shadow-Modus: Aktionen werden geprüft, aber Jarvis wird nicht geändert.", en: "Shadow mode: actions are validated but Jarvis is not modified." },
  "writeback.shadowBanner": { de: "Shadow-Modus aktiv: ODIN würde diese Zuweisung vornehmen, Jarvis wird jedoch nicht geändert.", en: "Shadow mode active: ODIN would apply this assignment, but Jarvis will not be changed." },
  "writeback.manualReviewNote": { de: "Manuelle Prüfung erforderlich", en: "Manual review required" },
  "writeback.btnValidate": { de: "Prüfen", en: "Validate" },
  "writeback.btnApprove": { de: "Freigeben", en: "Approve" },
  "writeback.btnExecute": { de: "Ausführen", en: "Execute" },
  "writeback.btnCancel": { de: "Abbrechen", en: "Cancel" },
  "writeback.btnAudit": { de: "Protokoll", en: "Audit Log" },
  "writeback.confirmExecute": { de: "Ausführung wirklich starten? Diese Aktion ändert den Jarvis-Owner.", en: "Really execute? This will change the Jarvis owner." },
  "writeback.confirmCancel": { de: "Aktion wirklich abbrechen?", en: "Really cancel this action?" },
  "writeback.fieldActivity": { de: "Aktivität", en: "Activity" },
  "writeback.fieldSO": { de: "Auftragsnr.", en: "Sales Order" },
  "writeback.fieldQueue": { de: "Queue", en: "Queue" },
  "writeback.fieldSubType": { de: "Sub-Typ", en: "Sub Type" },
  "writeback.fieldSystem": { de: "System", en: "System" },
  "writeback.fieldCurrentOwner": { de: "Aktueller Jarvis-Owner", en: "Current Jarvis Owner" },
  "writeback.fieldSelectedEmployee": { de: "ODIN-Auswahl", en: "ODIN Selection" },
  "writeback.fieldOwnerCode": { de: "Owner-Code", en: "Owner Code" },
  "writeback.fieldActionType": { de: "Aktion", en: "Action" },
  "writeback.fieldMode": { de: "Modus", en: "Mode" },
  "writeback.fieldStatus": { de: "Status", en: "Status" },
  "writeback.fieldCreated": { de: "Erstellt", en: "Created" },
  "writeback.fieldLastAttempt": { de: "Letzter Versuch", en: "Last Attempt" },
  "writeback.fieldFailureReason": { de: "Fehlergrund", en: "Failure Reason" },
  "writeback.fieldHardReason": { de: "Grund (hart)", en: "Hard Reason" },
  "writeback.fieldRetryCount": { de: "Versuche", en: "Attempts" },
  "writeback.auditTitle": { de: "Audit-Protokoll", en: "Audit Log" },
  "writeback.auditLoading": { de: "Lade Audit-Protokoll…", en: "Loading audit log…" },
  "writeback.auditEmpty": { de: "Keine Audit-Einträge vorhanden.", en: "No audit entries found." },
  "writeback.auditBefore": { de: "Vorher", en: "Before" },
  "writeback.auditAfter": { de: "Nachher", en: "After" },
  "writeback.auditValidation": { de: "Validierung", en: "Validation" },
  "writeback.auditScreenshot": { de: "Screenshot", en: "Screenshot" },
  "writeback.auditDiagnostics": { de: "Diagnose-HTML", en: "Diagnostic HTML" },
  "writeback.settingEnabled": { de: "Writeback aktiviert", en: "Writeback enabled" },
  "writeback.settingEnabledTooltip": { de: "Aktiviert das Jarvis-Writeback-System. Standardmäßig deaktiviert. Muss explizit eingeschaltet werden.", en: "Enables the Jarvis write-back system. Disabled by default. Must be explicitly turned on." },
  "writeback.settingMode": { de: "Ausführungsmodus", en: "Execution mode" },
  "writeback.settingModeTooltip": { de: "shadow_only: nur Protokollierung, keine Schreiboperationen. manual_confirm: jede Aktion erfordert manuelle Bestätigung. assisted_auto: ODIN führt aus, Dispatcher wird informiert. full_auto: vollautomatisch.", en: "shadow_only: log only, no writes. manual_confirm: each action requires human approval. assisted_auto: ODIN executes, dispatcher is notified. full_auto: fully automatic." },
  "writeback.settingKillSwitch": { de: "Kill-Switch (Notfallstopp)", en: "Kill switch (emergency stop)" },
  "writeback.settingKillSwitchTooltip": { de: "Blockiert sofort alle Schreiboperationen. Kann ohne Deploymentzyklus aktiviert werden.", en: "Immediately blocks all write operations. Can be activated without a deployment cycle." },
  "writeback.settingOverwriteExisting": { de: "Bestehende Zuweisung überschreiben", en: "Overwrite existing assignee" },
  "writeback.settingOverwriteExistingTooltip": { de: "Erlaubt ODIN, einen bereits zugewiesenen Jarvis-Owner zu überschreiben.", en: "Allows ODIN to overwrite an already assigned Jarvis owner." },
  "writeback.settingAllowUnassign": { de: "Auto-Abweisung erlauben", en: "Allow auto-unassign" },
  "writeback.settingAllowUnassignTooltip": { de: "Erlaubt ODIN, automatisch abzuweisen (z.B. bei Krankheit, Dispatcher-Rolle).", en: "Allows ODIN to automatically unassign (e.g. sick, Dispatcher role)." },
  "writeback.settingAllowReassign": { de: "Auto-Neuzuweisung erlauben", en: "Allow auto-reassign" },
  "writeback.settingAllowReassignTooltip": { de: "Erlaubt ODIN, automatisch neu zuzuweisen, wenn ein besserer Kandidat verfügbar ist.", en: "Allows ODIN to automatically reassign when a better candidate is available." },
  "writeback.settingMaxRetries": { de: "Max. Wiederholungsversuche", en: "Max execution retries" },
  "writeback.settingMaxRetriesTooltip": { de: "Maximale Anzahl an Ausführungsversuchen, bevor die Aktion als fehlgeschlagen markiert wird.", en: "Maximum number of execution attempts before the action is marked as failed." },
  "writeback.settingRequireFresh": { de: "Frische Crawler-Daten erforderlich", en: "Require fresh crawler data" },
  "writeback.settingRequireFreshTooltip": { de: "Blockiert Ausführungen, wenn die Crawler-Daten älter als das konfigurierte Maximum sind.", en: "Blocks executions when crawler data is older than the configured maximum." },
  "writeback.settingMaxSnapshotAge": { de: "Max. Snapshot-Alter (Minuten)", en: "Max snapshot age (minutes)" },
  "writeback.settingMaxSnapshotAgeTooltip": { de: "Maximales Alter der Crawler-Daten in Minuten, bevor Ausführungen blockiert werden.", en: "Maximum age of crawler data in minutes before executions are blocked." },
  "writeback.settingQueueSmartHands": { de: "Queue: Smart Hands aktiviert", en: "Queue: Smart Hands enabled" },
  "writeback.settingQueueSmartHandsTooltip": { de: "Erlaubt Writeback-Operationen für Smart-Hands-Tickets.", en: "Allows write-back operations for Smart Hands tickets." },
  "writeback.settingQueueCrossConnect": { de: "Queue: Cross Connect aktiviert", en: "Queue: Cross Connect enabled" },
  "writeback.settingQueueCrossConnectTooltip": { de: "Erlaubt Writeback-Operationen für Cross-Connect-Tickets.", en: "Allows write-back operations for Cross Connect tickets." },
  "writeback.settingQueueTrouble": { de: "Queue: Trouble Tickets aktiviert", en: "Queue: Trouble Tickets enabled" },
  "writeback.settingQueueTroubleTooltip": { de: "Erlaubt Writeback-Operationen für Trouble-Tickets.", en: "Allows write-back operations for Trouble Tickets." },
  "writeback.settingQueueDeinstall": { de: "Queue: Deinstall aktiviert", en: "Queue: Deinstall enabled" },
  "writeback.settingQueueDeinstallTooltip": { de: "Erlaubt Writeback-Operationen für Deinstall-Tickets.", en: "Allows write-back operations for Deinstall tickets." },
  "writeback.settingAllowOtherTeams": { de: "Andere Teams zuweisen erlauben", en: "Allow other teams assignment" },
  "writeback.settingAllowOtherTeamsTooltip": { de: "Erlaubt Zuweisungen an Mitarbeiter außerhalb des primären Teams.", en: "Allows assignments to employees outside the primary team." },
  "writeback.settingRequireApprovalUnassign": { de: "Manuelle Freigabe für Abweisung", en: "Require approval for unassign" },
  "writeback.settingRequireApprovalUnassignTooltip": { de: "Abweisungen müssen manuell bestätigt werden, bevor ODIN sie ausführt.", en: "Unassignments must be manually confirmed before ODIN executes them." },
  "writeback.settingRequireApprovalReassign": { de: "Manuelle Freigabe für Neuzuweisung", en: "Require approval for reassign" },
  "writeback.settingRequireApprovalReassignTooltip": { de: "Neuzuweisungen müssen manuell bestätigt werden, bevor ODIN sie ausführt.", en: "Reassignments must be manually confirmed before ODIN executes them." },
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
