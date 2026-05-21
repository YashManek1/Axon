import StatsCards from "../../components/dashboard/StatsCards";
import AgentGrid from "../../components/dashboard/AgentGrid";
import RecentActivity from "../../components/dashboard/RecentActivity";
import SystemThroughputChart from "../../components/dashboard/SystemThroughputChart";
import ErrorDistributionChart from "../../components/dashboard/ErrorDistributionChart";
import ActiveJobQueue from "../../components/dashboard/ActiveJobQueue";
import ResourceCharts from "../../components/dashboard/ResourceCharts";
import AgentHealthMonitoring from "../../components/dashboard/AgentHealthMonitoring";
import SystemLogs from "../../components/dashboard/SystemLogs";
import ActiveAlerts from "../../components/dashboard/ActiveAlerts";
import QuickActions from "../../components/dashboard/QuickActions";
import ErrorBoundary from "../../components/ErrorBoundary";

export default function DashboardPage() {
  return (
    <ErrorBoundary>
      <div className="space-y-6">
      {/* Stats */}
      <StatsCards />

      {/* Agent Grid + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AgentGrid />
        </div>
        <div>
          <RecentActivity />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <SystemThroughputChart />
        </div>
        <div className="lg:col-span-2">
          <ErrorDistributionChart />
        </div>
      </div>

      {/* Active Job Queue */}
      <ActiveJobQueue />

      {/* Resource Charts */}
      <ResourceCharts />

      {/* Agent Health */}
      <AgentHealthMonitoring />

      {/* System Logs */}
      <SystemLogs />

      {/* Alerts + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActiveAlerts />
        <QuickActions />
      </div>
      </div>
    </ErrorBoundary>
  );
}
