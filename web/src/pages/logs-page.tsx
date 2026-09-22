import { useState } from 'react'
import { Tabs } from '@douyinfe/semi-ui-19'

import { Page } from '@/components/page'
import LiveLogPanel from '@/pages/logs/live-log-panel'
import RunHistoryPanel from '@/pages/logs/run-history-panel'

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState('live')

  return (
    <Page>
      <Tabs activeKey={activeTab} onChange={key => setActiveTab(String(key))} type="line">
        <Tabs.TabPane itemKey="live" tab="实时日志">
          <LiveLogPanel />
        </Tabs.TabPane>
        <Tabs.TabPane itemKey="runs" tab="备份记录">
          <RunHistoryPanel />
        </Tabs.TabPane>
      </Tabs>
    </Page>
  )
}
