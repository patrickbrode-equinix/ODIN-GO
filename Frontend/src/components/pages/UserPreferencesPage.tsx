import { HeartHandshake, SlidersHorizontal } from "lucide-react";
import EmployeePreferences from "../settings/EmployeePreferences";
import PreferredColleagues from "../settings/PreferredColleagues";
import { EnterpriseCard } from "../layout/EnterpriseLayout";

export default function UserPreferencesPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6">
      <div>
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="h-6 w-6 text-cyan-400" />
          <h1 className="text-2xl font-bold">Meine Wünsche</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Diese Angaben werden bei der automatischen Dienstplanung berücksichtigt.
        </p>
      </div>

      <EnterpriseCard className="flex flex-col gap-4" noPadding={false}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <HeartHandshake className="h-4 w-4 text-pink-400" />
          Wunschkollegen
        </div>
        <PreferredColleagues />
      </EnterpriseCard>

      <EnterpriseCard className="flex flex-col gap-4" noPadding={false}>
        <EmployeePreferences />
      </EnterpriseCard>
    </div>
  );
}
