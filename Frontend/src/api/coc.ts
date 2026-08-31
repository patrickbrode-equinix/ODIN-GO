import { api } from "./api";

export type CocClassification = "problem" | "idea" | "improvement";
export type CocStatus = "awaiting_routing" | "pending" | "approved" | "rejected";

export type CocCase = {
  id: number;
  reference: string;
  classification: CocClassification;
  title: string;
  shortDescription: string;
  description: string;
  submitterName: string;
  currentApproverName?: string;
  status: CocStatus;
  currentLevel: number;
  attachmentCount: number;
  createdAt: string;
  events?: Array<{ id: number; action: string; comment?: string; actorName: string; toApproverName?: string; createdAt: string }>;
  attachments?: Array<{ id: number; name: string; mimeType: string; size: number; createdAt: string }>;
};

export type CocChainMember = {
  id: number;
  name: string;
  email?: string;
  managerUserId?: number;
  managerName?: string;
  isFinalApprover: boolean;
};

export async function getCocCases(scope: "mine" | "inbox" | "all") {
  const response = await api.get<CocCase[]>("/coc/cases", { params: { scope } });
  return response.data;
}

export async function getCocCase(id: number) {
  const response = await api.get<CocCase>(`/coc/cases/${id}`);
  return response.data;
}

export async function createCocCase(input: {
  classification: CocClassification;
  title: string;
  shortDescription: string;
  description: string;
  attachments: File[];
}) {
  const form = new FormData();
  form.set("classification", input.classification);
  form.set("title", input.title);
  form.set("shortDescription", input.shortDescription);
  form.set("description", input.description);
  input.attachments.forEach((file) => form.append("attachments", file));
  const response = await api.post("/coc/cases", form);
  return response.data;
}

export async function decideCocCase(id: number, action: "forward" | "approve" | "reject", comment: string) {
  const response = await api.post(`/coc/cases/${id}/decision`, { action, comment });
  return response.data;
}

export async function downloadCocAttachment(attachment: { id: number; name: string }) {
  const response = await api.get(`/coc/attachments/${attachment.id}`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = attachment.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function getCocChain() {
  const response = await api.get<CocChainMember[]>("/coc/admin/chain");
  return response.data;
}

export async function updateCocChain(userId: number, managerUserId: number | null, isFinalApprover: boolean) {
  await api.put(`/coc/admin/chain/${userId}`, { managerUserId, isFinalApprover });
}

export async function routeCocCase(caseId: number, approverUserId: number, comment: string) {
  await api.post(`/coc/admin/cases/${caseId}/route`, { approverUserId, comment });
}

export type CocMailStatus = {
  enabled: boolean;
  publicUrl: string | null;
  smtpHostConfigured: boolean;
  fromConfigured: boolean;
  authentication: "jarvis_sso";
  missing: string[];
};

export async function getCocMailStatus() {
  const response = await api.get<CocMailStatus>("/coc/admin/notifications/status");
  return response.data;
}

export async function sendCocMailTest(email: string) {
  const response = await api.post("/coc/admin/notifications/test", { email });
  return response.data;
}
