import { useMemo, useState } from "react";
import { LazyLog } from "@melloware/react-logviewer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  Empty,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Skeleton,
  Table,
  Tag,
  Toast,
} from "@douyinfe/semi-ui-19";
import type { ColumnProps } from "@douyinfe/semi-ui-19/lib/es/table";
import { Download, Eye, RefreshCw, Trash2 } from "lucide-react";

import { buildBackupUrl, gobackupApi, type BackupRun } from "@/api/gobackup";
import { PageSection } from "@/components/page";
import {
  downloadRemoteFile,
  formatBytes,
  formatDateTime,
  formatDuration,
  statusLabel,
  triggerLabel,
} from "@/pages/logs/log-utils";
import {
  bytesText,
  phaseText,
  progressAriaLabel,
  progressPercent,
  progressText,
} from "@/pages/tasks/task-utils";

function statusTag(status: BackupRun["status"]) {
  switch (status) {
    case "success":
      return (
        <Tag color="green" className="w-fit">
          成功
        </Tag>
      );
    case "failure":
      return (
        <Tag color="red" className="w-fit">
          失败
        </Tag>
      );
    case "running":
      return (
        <Tag color="orange" className="w-fit">
          进行中
        </Tag>
      );
    default:
      return (
        <Tag color="grey" className="w-fit">
          {statusLabel(status)}
        </Tag>
      );
  }
}

function triggerTag(trigger: string) {
  const color = trigger === "schedule" ? "blue" : trigger === "api" ? "purple" : "grey";
  return <Tag color={color}>{triggerLabel(trigger)}</Tag>;
}

export default function RunHistoryPanel() {
  const queryClient = useQueryClient();
  const [modelFilter, setModelFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string>();

  const runsQuery = useQuery({
    queryKey: ["gobackup", "runs", modelFilter],
    queryFn: ({ signal }) =>
      gobackupApi.runs({ model: modelFilter || undefined, limit: 100 }, signal),
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.status === "running") ? 3000 : false,
  });

  const runs = runsQuery.data ?? [];
  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedId), [runs, selectedId]);

  const logQuery = useQuery({
    queryKey: ["gobackup", "runs", selectedId, "log"],
    queryFn: ({ signal }) => gobackupApi.runLog(selectedId!, signal),
    enabled: Boolean(selectedId),
    refetchInterval: selectedRun?.status === "running" ? 3000 : false,
  });

  const modelOptions = useMemo(() => {
    const names = Array.from(new Set(runs.map((run) => run.model))).sort();
    return [
      { label: "全部模型", value: "" },
      ...names.map((name) => ({ label: name, value: name })),
    ];
  }, [runs]);

  const stats = useMemo(
    () => ({
      failure: runs.filter((run) => run.status === "failure").length,
      running: runs.filter((run) => run.status === "running").length,
      success: runs.filter((run) => run.status === "success").length,
      total: runs.length,
    }),
    [runs],
  );

  async function removeRun(id: string) {
    try {
      await gobackupApi.deleteRun(id);
      if (selectedId === id) setSelectedId(undefined);
      Toast.success("已删除该备份记录");
      await queryClient.invalidateQueries({ queryKey: ["gobackup", "runs"] });
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "删除备份记录失败");
    }
  }

  async function downloadRunLog(run: BackupRun) {
    try {
      await downloadRemoteFile(
        buildBackupUrl(`runs/${encodeURIComponent(run.id)}/log`, { download: "1" }),
        `${run.id}.log`,
      );
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "下载运行日志失败");
    }
  }

  const columns: ColumnProps<BackupRun>[] = [
    {
      dataIndex: "started_at",
      render: (_: unknown, run: BackupRun) => (
        <span className="whitespace-nowrap">{formatDateTime(run.started_at)}</span>
      ),
      title: "开始时间",
      width: 170,
    },
    {
      dataIndex: "model",
      render: (_: unknown, run: BackupRun) => <span className="font-medium">{run.model}</span>,
      title: "模型",
      width: 140,
    },
    {
      dataIndex: "trigger",
      render: (_: unknown, run: BackupRun) => triggerTag(run.trigger),
      title: "触发方式",
      width: 110,
    },
    {
      dataIndex: "status",
      render: (_: unknown, run: BackupRun) => (
        <div className="flex flex-col items-start gap-1">
          {statusTag(run.status)}
          {run.error ? (
            <span className="line-clamp-1 max-w-64 text-xs text-destructive" title={run.error}>
              {run.error}
            </span>
          ) : null}
        </div>
      ),
      title: "结果",
      width: 220,
    },
    {
      dataIndex: "progress",
      render: (_: unknown, run: BackupRun) => {
        const progress = run.progress;
        if (run.running) {
          if (!progress) {
            return <span className="text-xs text-muted-foreground">启动中…</span>;
          }
          const percent = progressPercent(progress);
          const isIndeterminate = percent === undefined;
          return (
            <div className="grid min-w-36 gap-1">
              <Progress
                aria-label={`列表 ${progressAriaLabel(progress, run.model)}`}
                format={() => progressText(progress)}
                indeterminate={isIndeterminate}
                percent={percent ?? 0}
                showInfo
                size="small"
                stroke="var(--semi-color-primary)"
              />
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {phaseText(progress) ? (
                  <span className="line-clamp-1 max-w-56 truncate" title={phaseText(progress)}>
                    {phaseText(progress)}
                  </span>
                ) : null}
                {bytesText(progress) ? <span>{bytesText(progress)}</span> : null}
              </div>
            </div>
          );
        }

        if (run.status === "success") {
          return (
            <div className="min-w-32 py-1">
              <Progress
                format={() => "100%"}
                percent={100}
                showInfo
                size="small"
                stroke="var(--semi-color-success)"
              />
            </div>
          );
        }

        if (run.status === "failure") {
          const percent = Math.round(progress?.percent ?? 0);
          return (
            <div className="min-w-32 py-1">
              <Progress
                format={() => `${percent}%`}
                percent={percent}
                showInfo
                size="small"
                stroke="var(--semi-color-danger)"
              />
            </div>
          );
        }

        return "-";
      },
      title: "进度",
      width: 220,
    },
    {
      dataIndex: "duration_ms",
      render: (_: unknown, run: BackupRun) => formatDuration(run.duration_ms),
      title: "耗时",
      width: 110,
    },
    {
      dataIndex: "archive_name",
      render: (_: unknown, run: BackupRun) =>
        run.archive_name ? (
          <div className="grid gap-0.5">
            <span className="max-w-56 truncate" title={run.archive_name}>
              {run.archive_name}
            </span>
            <span className="text-xs text-muted-foreground">{formatBytes(run.archive_size)}</span>
          </div>
        ) : (
          "-"
        ),
      title: "归档文件",
      width: 200,
    },
    {
      dataIndex: "id",
      render: (_: unknown, run: BackupRun) => (
        <div className="flex items-center gap-1">
          <Button
            icon={<Eye className="size-4" />}
            size="small"
            theme="light"
            type="tertiary"
            onClick={() => setSelectedId(run.id)}
          >
            日志
          </Button>
          <Button
            aria-label={`下载 ${run.id} 的日志`}
            icon={<Download className="size-4" />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => void downloadRunLog(run)}
          />
          <Popconfirm
            content="删除后无法恢复，确定删除这条备份记录？"
            onConfirm={() => void removeRun(run.id)}
            title="删除备份记录"
          >
            <Button
              aria-label={`删除 ${run.id}`}
              icon={<Trash2 className="size-4" />}
              size="small"
              theme="borderless"
              type="danger"
            />
          </Popconfirm>
        </div>
      ),
      title: "操作",
      width: 180,
    },
  ];

  return (
    <PageSection
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-40"
            optionList={modelOptions}
            value={modelFilter}
            onChange={(next) => setModelFilter(String(next))}
          />
          <Button
            icon={<RefreshCw className="size-4" />}
            loading={runsQuery.isFetching}
            onClick={() => void runsQuery.refetch()}
            theme="light"
            type="tertiary"
          >
            刷新
          </Button>
        </div>
      }
      description="每次备份（网页触发、计划任务、命令行）都会在这里留下完整日志与结果，最多保留最近 100 次。"
      title="备份记录"
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Card
            shadows="hover"
            title={<span className="text-xs text-muted-foreground">记录总数</span>}
          >
            <div className="mt-1 text-2xl font-bold">{stats.total}</div>
          </Card>
          <Card shadows="hover" title={<span className="text-xs text-muted-foreground">成功</span>}>
            <div className="mt-1 text-2xl font-bold text-success">{stats.success}</div>
          </Card>
          <Card shadows="hover" title={<span className="text-xs text-muted-foreground">失败</span>}>
            <div className="mt-1 text-2xl font-bold text-destructive">{stats.failure}</div>
          </Card>
          <Card
            shadows="hover"
            title={<span className="text-xs text-muted-foreground">进行中</span>}
          >
            <div className="mt-1 text-2xl font-bold text-warning">{stats.running}</div>
          </Card>
        </div>

        <Card shadows="hover">
          {runsQuery.isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              读取备份记录失败，请检查 GoBackup 服务状态。
            </div>
          ) : (
            <Table<BackupRun>
              columns={columns}
              dataSource={runs}
              empty={<Empty description="还没有备份记录，执行一次备份后就会出现在这里" />}
              loading={runsQuery.isLoading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              rowKey="id"
              size="middle"
            />
          )}
        </Card>
      </div>

      <Modal
        footer={
          <div className="flex justify-end gap-2">
            {selectedRun ? (
              <Button
                icon={<Download className="size-4" />}
                onClick={() => void downloadRunLog(selectedRun)}
                theme="light"
                type="tertiary"
              >
                下载日志
              </Button>
            ) : null}
            <Button onClick={() => setSelectedId(undefined)} theme="solid" type="primary">
              关闭
            </Button>
          </div>
        }
        onCancel={() => setSelectedId(undefined)}
        title={
          selectedRun ? `${selectedRun.model} · ${statusLabel(selectedRun.status)}` : "备份详情"
        }
        visible={Boolean(selectedId)}
        width={860}
      >
        {selectedRun ? (
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-lg border bg-background-deep px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">开始时间</div>
                <div>{formatDateTime(selectedRun.started_at)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">结束时间</div>
                <div>{formatDateTime(selectedRun.finished_at)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">耗时</div>
                <div>{formatDuration(selectedRun.duration_ms)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">触发方式</div>
                <div>{triggerTag(selectedRun.trigger)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">数据库</div>
                <div>
                  {(selectedRun.databases ?? [])
                    .map((item) => `${item.name}(${item.type})`)
                    .join(", ") || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">存储</div>
                <div>
                  {(selectedRun.storages ?? [])
                    .map((item) => `${item.name}(${item.type})`)
                    .join(", ") || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">归档文件</div>
                <div className="break-all">
                  {selectedRun.archive_name
                    ? `${selectedRun.archive_name}（${formatBytes(selectedRun.archive_size)}）`
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">记录 ID</div>
                <div className="break-all font-mono text-xs">{selectedRun.id}</div>
              </div>
            </div>

            {selectedRun.error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm break-all text-destructive">
                {selectedRun.error}
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">运行日志</span>
              <Button
                icon={<RefreshCw className="size-4" />}
                loading={logQuery.isFetching}
                onClick={() => void logQuery.refetch()}
                size="small"
                theme="light"
                type="tertiary"
              >
                刷新日志
              </Button>
            </div>

            <div className="h-[46vh] min-h-64 overflow-hidden rounded-lg bg-[#222222]">
              {logQuery.isLoading ? (
                <div className="p-4">
                  <Skeleton active loading />
                </div>
              ) : logQuery.isError ? (
                <div className="flex h-full items-center justify-center text-sm text-destructive">
                  读取运行日志失败
                </div>
              ) : (
                <LazyLog
                  enableLineNumbers
                  enableLinks
                  enableSearch
                  enableSearchNavigation
                  extraLines={1}
                  follow={false}
                  height="auto"
                  selectableLines
                  text={logQuery.data ?? ""}
                  wrapLines
                />
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </PageSection>
  );
}
