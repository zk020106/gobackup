import { Expand, PanelsTopLeft } from 'lucide-react'
import { useState } from 'react'
import { useStore } from 'zustand'
import { Button, Card, Form } from '@douyinfe/semi-ui-19'

import { AdminDrawer } from '@/components/admin/popup/admin-drawer'
import { AdminModal } from '@/components/admin/popup/admin-modal'
import { useDrawerApi, useModalApi } from '@/components/admin/popup/use-popup'
import { Page, PageSection } from '@/components/page'
import { getAdminMessages } from '@/i18n/admin-i18n'
import { preferenceStore } from '@/store/preferences'
import { DrawerApi, ModalApi } from '@/utils/popup-api'

type AdminMessages = ReturnType<typeof getAdminMessages>

/** 组件能力演示页：展示弹层 API 与 Semi 表单的标准用法。 */
export default function EffectsPage() {
  const appLocale = useStore(preferenceStore, state => state.preferences.appLocale)
  const messages = getAdminMessages(appLocale)

  return (
    <Page title="组件示例" description="演示 PopupApi 弹层与 Semi UI 表单的框架用法。">
      <PageSection contentClassName="grid gap-4">
        <PopupLab messages={messages} />
        <FormPanel messages={messages} />
        <IframePanel messages={messages} />
      </PageSection>
    </Page>
  )
}

/** 演示模态弹窗和抽屉 API 的交互能力。 */
export function PopupLab({ messages }: { messages: AdminMessages }) {
  const popup = messages.pages.popup
  const modalApi = useModalApi(() => new ModalApi({ title: popup.modalTitle }))
  const drawerApi = useDrawerApi(
    () => new DrawerApi({ placement: 'right', title: popup.drawerTitle })
  )

  return (
    <Card
      title={popup.title}
      shadows="hover"
      headerExtraContent={
        <span className="text-xs text-muted-foreground">{popup.description}</span>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => modalApi.setData({ [popup.modalSourceKey]: popup.modalSource }).open()}
          theme="solid"
          type="primary"
          icon={<Expand className="size-4" />}
        >
          {popup.openModal}
        </Button>
        <Button
          onClick={() => drawerApi.setData({ [popup.drawerSourceKey]: popup.drawerSource }).open()}
          theme="light"
          type="tertiary"
          icon={<PanelsTopLeft className="size-4" />}
        >
          {popup.openDrawer}
        </Button>
      </div>
      <AdminModal api={modalApi}>
        <div className="py-2">
          {popup.payload}: {JSON.stringify(modalApi.getData())}
        </div>
      </AdminModal>
      <AdminDrawer api={drawerApi} onConfirm={() => void drawerApi.close()}>
        <div className="py-2">
          {popup.payload}: {JSON.stringify(drawerApi.getData())}
        </div>
      </AdminDrawer>
    </Card>
  )
}

/** 演示 Semi 表单配置和统一提交能力。 */
export function FormPanel({ messages }: { messages: AdminMessages }) {
  const schemaFormMessages = messages.pages.schemaForm
  const [submitted, setSubmitted] = useState<Record<string, unknown>>({})

  return (
    <Card
      title={schemaFormMessages.title}
      shadows="hover"
      headerExtraContent={
        <span className="text-xs text-muted-foreground">{schemaFormMessages.description}</span>
      }
    >
      <div className="grid max-w-2xl gap-4">
        <Form
          initValues={{
            name: 'Root',
            email: 'root@example.com',
            role: schemaFormMessages.defaultRole
          }}
          onSubmit={values => setSubmitted(values)}
        >
          {({ formApi }) => (
            <>
              <Form.Input
                field="name"
                label={schemaFormMessages.name}
                rules={[{ required: true, message: '请输入姓名' }]}
              />
              <Form.Input
                field="email"
                label={schemaFormMessages.email}
                rules={[{ required: true, message: '请输入邮箱' }]}
              />
              <Form.Select
                field="role"
                label={schemaFormMessages.role}
                optionList={[
                  { label: schemaFormMessages.defaultRole, value: schemaFormMessages.defaultRole },
                  { label: 'auditor', value: 'auditor' }
                ]}
              />
              <div className="flex gap-2 mt-4">
                <Button htmlType="submit" theme="solid" type="primary">
                  {schemaFormMessages.submit}
                </Button>
                <Button onClick={() => formApi.reset()} theme="light" type="tertiary">
                  {schemaFormMessages.reset}
                </Button>
              </div>
            </>
          )}
        </Form>
        <pre className="rounded-lg border bg-muted/40 p-3 text-xs font-mono">
          {JSON.stringify(submitted, null, 2)}
        </pre>
      </div>
    </Card>
  )
}

/** 展示内嵌页面能力的占位面板。 */
export function IframePanel({ messages }: { messages: AdminMessages }) {
  const iframe = messages.pages.iframe

  return (
    <Card
      title={iframe.title}
      shadows="hover"
      headerExtraContent={
        <span className="text-xs text-muted-foreground">{iframe.description}</span>
      }
    >
      <div className="flex aspect-video items-center justify-center rounded-lg border bg-background/50 text-muted-foreground">
        {iframe.placeholder}
      </div>
    </Card>
  )
}
