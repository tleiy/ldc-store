import { AnnouncementForm } from "@/components/admin/announcement-form";

export default function NewAnnouncementPage() {
  const envSiteKey = (process.env.LDC_SITE_KEY || "").trim();
  const defaultSiteKey = envSiteKey === "backup" ? "backup" : "primary";
  return <AnnouncementForm defaultSiteKey={defaultSiteKey} />;
}
