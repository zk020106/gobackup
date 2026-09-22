import { useState } from "react";
import { Tabs } from "@douyinfe/semi-ui-19";
import { Activity, History } from "lucide-react";

import { Page } from "@/components/page";
import LiveLogPanel from "@/pages/logs/live-log-panel";
import RunHistoryPanel from "@/pages/logs/run-history-panel";

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState("live");

  return (
    <Page>
      <Tabs
        activeKey={activeTab}
        className="[&_.semi-tabs-bar-line]:border-b-0"
        onChange={(key) => setActiveTab(String(key))}
        type="line"
      >
        <Tabs.TabPane
          itemKey="live"
          tab={
            <span className="flex items-center gap-1.5">
              <Activity className="size-4" />
              实时日志
            </span>
          }
        >
          <LiveLogPanel />
        </Tabs.TabPane>
        <Tabs.TabPane
          itemKey="runs"
          tab={
            <span className="flex items-center gap-1.5">
              <History className="size-4" />
              备份记录
            </span>
          }
        >
          <RunHistoryPanel />
        </Tabs.TabPane>
      </Tabs>
    </Page>
  );
}
