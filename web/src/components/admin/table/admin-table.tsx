import { Table } from '@douyinfe/semi-ui-19'
import type { ColumnProps, TableProps } from '@douyinfe/semi-ui-19/lib/es/table'
import type { ReactNode } from 'react'

export type { ColumnProps, TableProps }

export interface AdminTableProps<RecordType extends Record<string, any> = any> extends Omit<
  TableProps<RecordType>,
  'columns' | 'dataSource'
> {
  columns?: ColumnProps<RecordType>[]
  dataSource?: RecordType[]
  toolbar?: ReactNode
}

/** 内容区标准表格：基于 Semi Design Table 实现，统一默认分页、尺寸与工具栏布局。 */
export function AdminTable<RecordType extends Record<string, any> = any>({
  columns,
  dataSource,
  pagination,
  toolbar,
  ...tableProps
}: AdminTableProps<RecordType>) {
  const resolvedPagination =
    pagination === false
      ? false
      : {
          pageSize: 10,
          showSizeChanger: false,
          ...(typeof pagination === 'object' ? pagination : {})
        }

  return (
    <div className="grid gap-3" data-slot="admin-table">
      {toolbar ? <div className="flex justify-end gap-2">{toolbar}</div> : null}
      <Table<any>
        columns={columns}
        dataSource={dataSource}
        pagination={resolvedPagination}
        size="middle"
        {...tableProps}
      />
    </div>
  )
}
