// 顶栏通知中心的数据结构。当前 GoBackup 后端还没有通知接口，
// 界面保留空状态展示，数据源接入后直接复用该类型。
export interface NotificationRecord {
  description: string
  id: string
  status: 'read' | 'unread'
  time: string
  title: string
  type: 'success' | 'warning' | 'info'
}
