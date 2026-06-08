import ServiceShell from "./ServiceShell";
import ReportCalendar from "@/components/visuals/ReportCalendar";
import { SECTION_REPORTS } from "@/lib/copy";

export default function ReportsSection() {
  return (
    <ServiceShell
      id="reports"
      copy={SECTION_REPORTS}
      visual={<ReportCalendar />}
      background="ink"
      from="right"
      visualSide="right"
    />
  );
}
