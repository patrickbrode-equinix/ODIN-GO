import { EnterprisePageShell, EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader } from "../layout/EnterpriseLayout";
import { EmployeeContactsPanel } from "../shiftplan/EmployeeContactsPanel";
import { useLanguage } from "../../context/LanguageContext";

export default function EmployeeContacts() {
  const { t } = useLanguage();
  return (
    <EnterprisePageShell>
      <EnterpriseHeader title={t("employeeContacts.title")} subtitle={t("employeeContacts.subtitle")} />
      <EnterpriseFeatureHero
        tone="emerald"
        eyebrow={t("employeeContacts.subtitle")}
        title={t("employeeContacts.title")}
        description={t("employeeContacts.subtitle")}
      />
      <EnterpriseCard>
        <EmployeeContactsPanel />
      </EnterpriseCard>
    </EnterprisePageShell>
  );
}
