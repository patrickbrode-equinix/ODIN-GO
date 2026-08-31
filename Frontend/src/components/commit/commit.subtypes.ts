/* ------------------------------------------------ */
/* COMMIT – SUB TYPE CATALOG (CSV FINAL)            */
/* Source: real CSV export (Activity Sub-Type)     */
/* Status: approved                                */
/* ------------------------------------------------ */

export type CommitSubTypeStatus = "relevant" | "ignore";

export type CommitSubType = {
  key: string;
  label: string;
  status: CommitSubTypeStatus;
};

export const COMMIT_SUB_TYPES: CommitSubType[] = [
  /* ---------------- KPI RELEVANT ---------------- */

  { key: "Cage Clean Up", label: "Cage Clean Up", status: "relevant" },
  { key: "EIS Accessories", label: "EIS Accessories", status: "relevant" },
  { key: "Equipment Install", label: "Equipment Install", status: "relevant" },
  { key: "Equipment Maintenance", label: "Equipment Maintenance", status: "relevant" },
  { key: "Move/Replace Equipment/RMA", label: "Move/Replace Equipment/RMA", status: "relevant" },
  { key: "Other Smart Hands", label: "Other Smart Hands", status: "relevant" },
  { key: "Patch Cable Install", label: "Patch Cable Install", status: "relevant" },
  { key: "Patch Panel", label: "Patch Panel", status: "relevant" },
  { key: "Physical Audit", label: "Physical Audit", status: "relevant" },

  /* ------------- NOT KPI RELEVANT --------------- */

  { key: "AC Power", label: "AC Power", status: "ignore" },
  { key: "Access Enrollment Report", label: "Access Enrollment Report", status: "ignore" },
  { key: "Access Enrollment Rprt", label: "Access Enrollment Rprt", status: "ignore" },
  { key: "CPE Inbound Shipment", label: "CPE Inbound Shipment", status: "ignore" },
  { key: "Cabinet", label: "Cabinet", status: "ignore" },
  { key: "Cage Access Report", label: "Cage Access Report", status: "ignore" },
  { key: "Cage Access Rprt", label: "Cage Access Rprt", status: "ignore" },
  { key: "Conference Rooms", label: "Conference Rooms", status: "ignore" },
  { key: "Custom Fulfillment", label: "Custom Fulfillment", status: "ignore" },
  { key: "Customer Provided Cabinets", label: "Customer Provided Cabinets", status: "ignore" },
  { key: "Customer Work Visits", label: "Customer Work Visits", status: "ignore" },
  { key: "Customer cage restrictions", label: "Customer cage restrictions", status: "ignore" },
  { key: "EIS Inbound Shipment", label: "EIS Inbound Shipment", status: "ignore" },
  { key: "Network Cable Connection (XC)", label: "Network Cable Connection (XC)", status: "ignore" },
  { key: "Network Port Migration", label: "Network Port Migration", status: "ignore" },
  { key: "Open Cabinet", label: "Open Cabinet", status: "ignore" },
  { key: "Operations Action Request", label: "Operations Action Request", status: "ignore" },
  { key: "Outbound Shipments", label: "Outbound Shipments", status: "ignore" },
  { key: "Power Consumption Rprt non-BCM", label: "Power Consumption Rprt non-BCM", status: "ignore" },
  { key: "Power Consumption Rpt  non-BCM", label: "Power Consumption Rpt  non-BCM", status: "ignore" },
  { key: "Power Meter", label: "Power Meter", status: "ignore" },
  { key: "Service Delivery Report", label: "Service Delivery Report", status: "ignore" },
  { key: "Space", label: "Space", status: "ignore" },
  { key: "Tour", label: "Tour", status: "ignore" },
  { key: "Weekly Tape Backup", label: "Weekly Tape Backup", status: "ignore" },
];
