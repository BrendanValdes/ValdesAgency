import ServiceShell from "./ServiceShell";
import ReportCalendar from "@/components/visuals/ReportCalendar";
import { SECTION_9_REPORTS } from "@/lib/copy";

export default function ReportsSection() {
  return (
    <ServiceShell
      id="reports"
      number="09 / Reports + strategy"
      copy={SECTION_9_REPORTS}
      visual={<ReportCalendar />}
      background="paper"
      from="left"
      visualSide="right"
    />
  );
}
