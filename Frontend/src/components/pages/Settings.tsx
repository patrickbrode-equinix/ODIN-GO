/* ------------------------------------------------ */
/* SETTINGS – PAGE (FINAL / CLEAN & CONSISTENT)     */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Button } from "../ui/button";
import { Lock, Settings as SettingsIcon, Sliders, Save } from "lucide-react";
import { EnterprisePageShell, EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader, ENT_SECTION_TITLE } from "../layout/EnterpriseLayout";
import { useTheme } from "../ThemeProvider";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/api";
import { useLanguage, type LanguageCode, getLanguageLocale } from "../../context/LanguageContext";
import { fetchSkills, type EmployeeSkills } from "../../api/coverage";
import { formatAbsoluteDateTime, formatRelativeTime } from "../../utils/loginStatus";
import PreferredColleagues from "../settings/PreferredColleagues";
import EmployeePreferences from "../settings/EmployeePreferences";
import TicketPreferences from "../settings/TicketPreferences";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type UserSettings = {
  language: LanguageCode;
  theme: "dark" | "light";
  notify_email: boolean;
  notify_browser: boolean;
  notify_shift_reminder: boolean;
};

type UserMeta = {
  created_at?: string;
  last_login?: string;
  provisioned_employee_name?: string;
  location?: string;
  team?: string;
};

const SETTINGS_PAGE_COPY = {
  de: {
    saveOk: "Gespeichert",
    saveError: "Fehler beim Speichern",
    passwordRequiredTitle: "Initiales Passwort ändern",
    passwordTitle: "Passwort ändern",
    passwordRequiredHint: "Verwende für die erste Anmeldung dein initiales Passwort root und vergib danach ein persönliches Passwort.",
    currentPasswordRoot: "Aktuelles Passwort (root)",
    currentPassword: "Aktuelles Passwort",
    newPassword: "Neues Passwort",
    passwordBusy: "Bitte warten…",
    changePassword: "Passwort ändern",
    passwordChanged: "Passwort erfolgreich geändert",
    passwordFillBoth: "Bitte beide Felder ausfüllen",
    passwordChangeFailed: "Passwort konnte nicht geändert werden",
    thresholdsShiftWarning: "Schicht-Warnungsschwelle",
    thresholdsShiftWarningBody: "Mindestanzahl Mitarbeiter vor Schicht-Warnung",
    thresholdsUnderstaffing: "Unterbesetzungs-Schwelle",
    thresholdsUnderstaffingBody: "Mitarbeiter unter diesem Wert = Unterbesetzung",
    thresholdsWellbeing: "Wellbeing-Schwelle (%)",
    thresholdsWellbeingBody: "Score unter diesem Wert = Warnmeldung",
    thresholdsLogRetention: "Log-Aufbewahrung (Tage)",
    thresholdsLogRetentionBody: "Activity-Logs älterer als X Tage werden gelöscht",
    competenceTitle: "Mein Kompetenzprofil",
    competenceBody: "Dieses Profil wird in der Schichtplanung und im Auto Assignment verwendet. Die Pflege erfolgt zentral in den Schichtplan-Einstellungen und wird hier nur angezeigt.",
    competenceEmpty: "Für deinen aktuellen Benutzer ist noch kein Kompetenzprofil hinterlegt.",
    competenceProfileName: "Profilname",
    competenceTopSkills: "Top-Skills",
    neverLoggedIn: "Noch nie eingeloggt",
    lastLoginRelativePrefix: "Zuletzt",
  },
  en: {
    saveOk: "Saved",
    saveError: "Failed to save",
    passwordRequiredTitle: "Change initial password",
    passwordTitle: "Change password",
    passwordRequiredHint: "Use your initial password root for the first login and then set a personal password.",
    currentPasswordRoot: "Current password (root)",
    currentPassword: "Current password",
    newPassword: "New password",
    passwordBusy: "Please wait…",
    changePassword: "Change password",
    passwordChanged: "Password changed successfully",
    passwordFillBoth: "Please fill in both fields",
    passwordChangeFailed: "Password could not be changed",
    thresholdsShiftWarning: "Shift warning threshold",
    thresholdsShiftWarningBody: "Minimum employees before a shift warning is raised",
    thresholdsUnderstaffing: "Understaffing threshold",
    thresholdsUnderstaffingBody: "Below this employee count the shift is treated as understaffed",
    thresholdsWellbeing: "Wellbeing threshold (%)",
    thresholdsWellbeingBody: "Scores below this value trigger a warning",
    thresholdsLogRetention: "Log retention (days)",
    thresholdsLogRetentionBody: "Activity logs older than X days are removed",
    competenceTitle: "My competence profile",
    competenceBody: "This profile is used in shift planning and auto assignment. It is maintained centrally in shift admin settings and shown here as read-only information.",
    competenceEmpty: "No competence profile has been stored for your current user yet.",
    competenceProfileName: "Profile name",
    competenceTopSkills: "Top skills",
    neverLoggedIn: "Never logged in",
    lastLoginRelativePrefix: "Last seen",
  },
  ro: {
    saveOk: "Salvat",
    saveError: "Salvarea a esuat",
    passwordRequiredTitle: "Schimba parola initiala",
    passwordTitle: "Schimba parola",
    passwordRequiredHint: "Foloseste parola initiala root la prima autentificare si apoi seteaza o parola personala.",
    currentPasswordRoot: "Parola actuala (root)",
    currentPassword: "Parola actuala",
    newPassword: "Parola noua",
    passwordBusy: "Te rugam asteapta…",
    changePassword: "Schimba parola",
    passwordChanged: "Parola a fost schimbata cu succes",
    passwordFillBoth: "Completeaza ambele campuri",
    passwordChangeFailed: "Parola nu a putut fi schimbata",
    thresholdsShiftWarning: "Prag avertizare tura",
    thresholdsShiftWarningBody: "Numarul minim de angajati inainte de avertizarea de tura",
    thresholdsUnderstaffing: "Prag subdimensionare",
    thresholdsUnderstaffingBody: "Sub aceasta valoare tura este considerata subdimensionata",
    thresholdsWellbeing: "Prag wellbeing (%)",
    thresholdsWellbeingBody: "Scorurile sub aceasta valoare declanseaza un avertisment",
    thresholdsLogRetention: "Retentie loguri (zile)",
    thresholdsLogRetentionBody: "Logurile de activitate mai vechi de X zile sunt sterse",
    competenceTitle: "Profilul meu de competenta",
    competenceBody: "Acest profil este folosit in planificarea turelor si in Auto Assignment. El este administrat central in setarile de administrare a turelor si este afisat aici doar pentru consultare.",
    competenceEmpty: "Nu exista inca un profil de competenta pentru utilizatorul curent.",
    competenceProfileName: "Nume profil",
    competenceTopSkills: "Skill-uri principale",
    neverLoggedIn: "Nu te-ai autentificat niciodata",
    lastLoginRelativePrefix: "Ultima activitate",
  },
  ar: {
    saveOk: "تم الحفظ",
    saveError: "فشل الحفظ",
    passwordRequiredTitle: "تغيير كلمة المرور الأولى",
    passwordTitle: "تغيير كلمة المرور",
    passwordRequiredHint: "استخدم كلمة المرور الأولية root عند أول تسجيل دخول ثم عيّن كلمة مرور شخصية.",
    currentPasswordRoot: "كلمة المرور الحالية (root)",
    currentPassword: "كلمة المرور الحالية",
    newPassword: "كلمة المرور الجديدة",
    passwordBusy: "يرجى الانتظار…",
    changePassword: "تغيير كلمة المرور",
    passwordChanged: "تم تغيير كلمة المرور بنجاح",
    passwordFillBoth: "يرجى تعبئة الحقلين",
    passwordChangeFailed: "تعذر تغيير كلمة المرور",
    thresholdsShiftWarning: "حد تحذير الشفت",
    thresholdsShiftWarningBody: "الحد الأدنى لعدد الموظفين قبل ظهور تحذير الشفت",
    thresholdsUnderstaffing: "حد نقص التغطية",
    thresholdsUnderstaffingBody: "إذا كان العدد أقل من هذا الحد تعتبر الشفت ناقصة التغطية",
    thresholdsWellbeing: "حد الرفاهية (%)",
    thresholdsWellbeingBody: "القيم الأقل من هذا الحد تُظهر تحذيراً",
    thresholdsLogRetention: "الاحتفاظ بالسجلات (أيام)",
    thresholdsLogRetentionBody: "يتم حذف سجلات النشاط الأقدم من X أيام",
    competenceTitle: "ملف الكفاءة الخاص بي",
    competenceBody: "يُستخدم هذا الملف في تخطيط الشفت وAuto Assignment. تتم إدارته مركزياً في إعدادات إدارة الشفت ويُعرض هنا للقراءة فقط.",
    competenceEmpty: "لا يوجد ملف كفاءة محفوظ للمستخدم الحالي بعد.",
    competenceProfileName: "اسم الملف",
    competenceTopSkills: "أهم المهارات",
    neverLoggedIn: "لم يتم تسجيل الدخول من قبل",
    lastLoginRelativePrefix: "آخر نشاط",
  },
} as const;

/* ------------------------------------------------ */
/* PAGE                                             */
/* ------------------------------------------------ */

export default function Settings() {
  const { user, completeForcedPasswordChange } = useAuth();
  const { setTheme } = useTheme();
  const { language, languages, setLanguage, t } = useLanguage();
  const locale = getLanguageLocale(language);
  const pageCopy = SETTINGS_PAGE_COPY[language as keyof typeof SETTINGS_PAGE_COPY] || SETTINGS_PAGE_COPY.en;

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [meta, setMeta] = useState<UserMeta | null>(null);
  const [competenceProfile, setCompetenceProfile] = useState<EmployeeSkills | null>(null);
  const [loading, setLoading] = useState(true);

  /* SYSTEM THRESHOLDS */
  type AppSettings = {
    shift_warning_threshold: number;
    understaffing_threshold: number;
    wellbeing_threshold: number;
    log_retention_days: number;
  };
  const [appSettings, setAppSettings] = useState<AppSettings>({
    shift_warning_threshold: 1,
    understaffing_threshold: 2,
    wellbeing_threshold: 60,
    log_retention_days: 90,
  });
  const [appSettingsSaving, setAppSettingsSaving] = useState(false);
  const [appSettingsMsg, setAppSettingsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* PASSWORD */
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const passwordChangeRequired = user?.mustChangePassword === true;

  /* ------------------------------------------------ */
  /* LOAD SETTINGS + META                             */
  /* ------------------------------------------------ */

  useEffect(() => {
    async function load() {
      const [settingsRes, metaRes, skillsRes] = await Promise.all([
        api.get("/user/settings"),
        api.get("/user/meta"),
        fetchSkills().catch(() => []),
      ]);

      setSettings(settingsRes.data);
      setMeta(metaRes.data);
      setTheme(settingsRes.data.theme);

      const candidateNames = [
        String(metaRes.data?.provisioned_employee_name || "").trim(),
        user?.lastName && user?.firstName ? `${user.lastName}, ${user.firstName}` : "",
        user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : "",
      ].filter(Boolean);

      const matchedProfile = Array.isArray(skillsRes)
        ? skillsRes.find((entry) => candidateNames.includes(String(entry.employee_name || "").trim())) || null
        : null;
      setCompetenceProfile(matchedProfile);
      setLoading(false);
    }

    load();
    if (!passwordChangeRequired) {
      api.get("/app-settings").then(res => {
        if (res.data) setAppSettings(s => ({ ...s, ...res.data }));
      }).catch(() => { /* table may not exist yet */ });
    }
  }, [passwordChangeRequired, setTheme, user?.firstName, user?.lastName]);

  useEffect(() => {
    if (passwordChangeRequired) {
      setPwOpen(true);
    }
  }, [passwordChangeRequired]);

  async function saveAppSettings() {
    setAppSettingsSaving(true);
    setAppSettingsMsg(null);
    try {
      await api.put("/app-settings", appSettings);
      setAppSettingsMsg({ ok: true, text: pageCopy.saveOk });
    } catch {
      setAppSettingsMsg({ ok: false, text: pageCopy.saveError });
    } finally {
      setAppSettingsSaving(false);
      setTimeout(() => setAppSettingsMsg(null), 3000);
    }
  }

  /* ------------------------------------------------ */
  /* UPDATE SETTINGS                                  */
  /* ------------------------------------------------ */

  async function update(patch: Partial<UserSettings>) {
    if (!settings) return;

    setSettings({ ...settings, ...patch });

    const nextPatch = { ...patch };
    if (patch.language) {
      await setLanguage(patch.language, { persist: true });
      delete nextPatch.language;
    }

    if (Object.keys(nextPatch).length > 0) {
      await api.put("/user/settings", nextPatch);
    }

    if (patch.theme) setTheme(patch.theme);
  }

  useEffect(() => {
    if (!settings) return;
    if (settings.language !== language) {
      setSettings((current) => current ? { ...current, language } : current);
    }
  }, [language, settings]);

  /* ------------------------------------------------ */
  /* CHANGE PASSWORD                                  */
  /* ------------------------------------------------ */

  async function changePassword() {
    if (!currentPw || !newPw) {
      setPwError(pageCopy.passwordFillBoth);
      return;
    }

    setPwLoading(true);
    setPwError(null);
    setPwSuccess(null);

    try {
      await api.post("/auth/change-password", {
        currentPassword: currentPw,
        newPassword: newPw,
      });

      completeForcedPasswordChange();

      setPwSuccess(pageCopy.passwordChanged);

      setTimeout(() => {
        setPwOpen(false);
        setCurrentPw("");
        setNewPw("");
        setPwSuccess(null);
      }, 1500);
    } catch (err: any) {
      setPwError(
        err?.response?.data?.message ??
        pageCopy.passwordChangeFailed
      );
    } finally {
      setPwLoading(false);
    }
  }

  if (loading || !settings || !user) {
    return <div className="text-muted-foreground">{t("settings.loading")}</div>;
  }

  const fullName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : "–";

  const formatDate = (v?: string) => formatAbsoluteDateTime(v || null, locale) || "–";
  const formatLastLoginValue = () => {
    if (!meta?.last_login) return pageCopy.neverLoggedIn;
    const absolute = formatAbsoluteDateTime(meta.last_login, locale);
    const relative = formatRelativeTime(meta.last_login, locale);
    if (!absolute) return pageCopy.neverLoggedIn;
    return relative ? `${absolute} (${relative})` : absolute;
  };

  /* ------------------------------------------------ */
  /* RENDER                                           */
  /* ------------------------------------------------ */

  return (
    <EnterprisePageShell>
      {/* HEADER */}
      <EnterpriseHeader
        title={t("settings.title")}
        subtitle={<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("settings.personalAppSettings")}</span>}
        icon={<SettingsIcon className="w-5 h-5 text-indigo-400" />}
        rightContent={
          <Button onClick={() => setPwOpen(true)} className="h-7 px-3 text-[11px] font-bold tracking-wider uppercase bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 shadow-sm">
            <Lock className="w-3.5 h-3.5 mr-2" />
            {passwordChangeRequired ? t("settings.startPasswordChange") : t("settings.changePassword")}
          </Button>
        }
      />

      <EnterpriseFeatureHero
        tone="indigo"
        eyebrow={t("settings.personalAppSettings")}
        title={fullName}
        description={passwordChangeRequired ? t("settings.securityRequirementBody") : pageCopy.competenceBody}
        metrics={[
          { label: t("settings.location"), value: meta?.location || "-" },
          { label: t("settings.team"), value: meta?.team || "-" },
          { label: t("settings.lastLogin"), value: formatLastLoginValue() },
        ]}
      />

      {passwordChangeRequired && (
        <EnterpriseCard noPadding={false} className="flex flex-col gap-3 border-amber-500/30 bg-amber-500/10">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200">{t("settings.securityRequirement")}</div>
          <p className="text-sm text-amber-50/90">
            {t("settings.securityRequirementBody")}
          </p>
        </EnterpriseCard>
      )}

      {/* PROFIL */}
      <EnterpriseCard noPadding={false} className="flex flex-col gap-4">
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/10 pb-2">
          {t("settings.profile")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Info label={t("settings.name")} value={fullName} />
          <Info label={t("settings.email")} value={user.email} />
          <Info label={t("settings.location")} value={meta?.location} />
          <Info label={t("settings.team")} value={meta?.team} />
          <Info label={t("settings.activeSince")} value={formatDate(meta?.created_at)} />
          <Info label={t("settings.lastLogin")} value={formatLastLoginValue()} />
        </div>
      </EnterpriseCard>

      {!passwordChangeRequired && (
        <EnterpriseCard noPadding={false} className="flex flex-col gap-4">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            {pageCopy.competenceTitle}
          </div>
          <p className="text-xs text-muted-foreground">{pageCopy.competenceBody}</p>

          {competenceProfile ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {competenceProfile.can_sh ? <Badge className="border-blue-500/30 bg-blue-500/15 text-blue-300">SH</Badge> : null}
                {competenceProfile.can_tt ? <Badge className="border-violet-500/30 bg-violet-500/15 text-violet-300">TT</Badge> : null}
                {competenceProfile.can_cc ? <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">CC</Badge> : null}
              </div>
              <div className="text-sm text-muted-foreground">
                {pageCopy.competenceProfileName}: <span className="text-foreground">{competenceProfile.employee_name}</span>
              </div>
              {Object.keys(competenceProfile.rated_skills || {}).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(competenceProfile.rated_skills || {})
                    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], locale))
                    .slice(0, 6)
                    .map(([skill, rating]) => (
                      <Badge key={skill} className="border-slate-500/30 bg-slate-500/10 text-slate-300">
                        {skill} {rating}/5
                      </Badge>
                    ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{pageCopy.competenceEmpty}</div>
          )}
        </EnterpriseCard>
      )}

      {!passwordChangeRequired && (
        <>
          {/* APP */}
          <EnterpriseCard noPadding={false} className="flex flex-col gap-4">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/10 pb-2">
              {t("settings.app")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>{t("settings.language")}</Label>
                <Select
                  value={settings.language}
                  onValueChange={(v) =>
                    update({ language: v as UserSettings["language"] })
                  }
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((option) => (
                      <SelectItem key={option.code} value={option.code}>{option.nativeLabel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("settings.theme")}</Label>
                <Select
                  value={settings.theme}
                  onValueChange={(v) =>
                    update({ theme: v as UserSettings["theme"] })
                  }
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">{t("common.themeDark")}</SelectItem>
                    <SelectItem value="light">{t("common.themeLight")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </EnterpriseCard>

          {/* PREFERRED COLLEAGUES (Wunschkollegen) */}
          <EnterpriseCard noPadding={false} className="flex flex-col gap-4">
            <PreferredColleagues />
          </EnterpriseCard>

          {/* EMPLOYEE PREFERENCES (Schichtplan-Wünsche) */}
          <EnterpriseCard noPadding={false} className="flex flex-col gap-4">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              {t("settings.shiftPreferences")}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.shiftPreferencesBody")}
            </p>
            <EmployeePreferences />
          </EnterpriseCard>

          {/* TICKET & WORKLOAD PREFERENCES (Ticketpräferenzen & Arbeitsbelastung) */}
          <EnterpriseCard noPadding={false} className="flex flex-col gap-4">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              {language === 'de' ? 'Ticketpräferenzen & Arbeitsbelastung' : 'Ticket Preferences & Workload'}
            </div>
            <p className="text-xs text-muted-foreground">
              {language === 'de'
                ? 'Lege fest, welche Ticketarten du bevorzugst, wie flexibel du eingesetzt werden möchtest und wo du dich weiterentwickeln willst.'
                : 'Define which ticket types you prefer, how flexible you want to be deployed, and where you want to grow.'}
            </p>
            <TicketPreferences />
          </EnterpriseCard>

          {/* SYSTEM THRESHOLDS */}
          <EnterpriseCard noPadding={false} className="flex flex-col gap-4">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              {t("settings.systemThresholds")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ThresholdInput
                label={pageCopy.thresholdsShiftWarning}
                description={pageCopy.thresholdsShiftWarningBody}
                value={appSettings.shift_warning_threshold}
                min={0} max={10}
                onChange={v => setAppSettings(s => ({ ...s, shift_warning_threshold: v }))}
              />
              <ThresholdInput
                label={pageCopy.thresholdsUnderstaffing}
                description={pageCopy.thresholdsUnderstaffingBody}
                value={appSettings.understaffing_threshold}
                min={0} max={20}
                onChange={v => setAppSettings(s => ({ ...s, understaffing_threshold: v }))}
              />
              <ThresholdInput
                label={pageCopy.thresholdsWellbeing}
                description={pageCopy.thresholdsWellbeingBody}
                value={appSettings.wellbeing_threshold}
                min={0} max={100}
                onChange={v => setAppSettings(s => ({ ...s, wellbeing_threshold: v }))}
              />
              <ThresholdInput
                label={pageCopy.thresholdsLogRetention}
                description={pageCopy.thresholdsLogRetentionBody}
                value={appSettings.log_retention_days}
                min={7} max={365}
                onChange={v => setAppSettings(s => ({ ...s, log_retention_days: v }))}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              {appSettingsMsg && (
                <span className={`text-xs font-semibold ${appSettingsMsg.ok ? "text-green-400" : "text-red-400"}`}>
                  {appSettingsMsg.text}
                </span>
              )}
              <Button
                onClick={saveAppSettings}
                disabled={appSettingsSaving}
                className="h-7 px-3 text-[11px] font-bold tracking-wider uppercase bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 shadow-sm"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {appSettingsSaving ? `${pageCopy.saveOk}…` : pageCopy.saveOk}
              </Button>
            </div>
          </EnterpriseCard>
        </>
      )}

      {/* PASSWORD DIALOG */}
      <Dialog
        open={pwOpen}
        onOpenChange={(nextOpen) => {
          if (passwordChangeRequired && !nextOpen) return;
          setPwOpen(nextOpen);
        }}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{passwordChangeRequired ? pageCopy.passwordRequiredTitle : pageCopy.passwordTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {passwordChangeRequired && (
              <p className="text-sm text-muted-foreground">
                {pageCopy.passwordRequiredHint}
              </p>
            )}
            <Input
              type="password"
              placeholder={passwordChangeRequired ? pageCopy.currentPasswordRoot : pageCopy.currentPassword}
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
            <Input
              type="password"
              placeholder={pageCopy.newPassword}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />

            {pwError && (
              <p className="text-sm text-red-500">{pwError}</p>
            )}
            {pwSuccess && (
              <p className="text-sm text-green-500">{pwSuccess}</p>
            )}

            <Button
              className="w-full"
              onClick={changePassword}
              disabled={pwLoading}
            >
              {pwLoading ? pageCopy.passwordBusy : pageCopy.changePassword}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </EnterprisePageShell>
  );
}

/* ------------------------------------------------ */
/* COMPONENTS                                       */
/* ------------------------------------------------ */

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="text-foreground">{value ?? "–"}</p>
    </div>
  );
}

function ThresholdInput({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-semibold text-foreground/90">{label}</Label>
      <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        className="h-8 text-sm font-mono w-28 rounded-lg"
      />
    </div>
  );
}
