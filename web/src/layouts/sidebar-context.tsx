import {
  createContext,
  cloneElement,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ComponentProps,
  type ReactElement,
  type ReactNode
} from 'react'
import { PanelLeft } from 'lucide-react'
import { Button, SideSheet, Tooltip } from '@douyinfe/semi-ui-19'

import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_ICON = '3rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

export interface SidebarContextProps {
  isMobile: boolean
  open: boolean
  openMobile: boolean
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  setOpenMobile: (open: boolean | ((prev: boolean) => boolean)) => void
  state: 'collapsed' | 'expanded'
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextProps | null>(null)

export function useSidebar(): SidebarContextProps {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }
  return context
}

export interface SidebarProviderProps extends ComponentProps<'div'> {
  children?: ReactNode
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

export function SidebarProvider({
  children,
  className,
  defaultOpen = true,
  onOpenChange,
  open: openProp,
  style,
  ...props
}: SidebarProviderProps) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = useState(false)
  const [_open, _setOpen] = useState(defaultOpen)
  const open = openProp ?? _open

  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === 'function' ? value(open) : value
      if (onOpenChange) {
        onOpenChange(next)
      } else {
        _setOpen(next)
      }
    },
    [onOpenChange, open]
  )

  const toggleSidebar = useCallback(() => {
    return isMobile ? setOpenMobile(prev => !prev) : setOpen(prev => !prev)
  }, [isMobile, setOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar])

  const state = open ? 'expanded' : 'collapsed'

  const contextValue = useMemo<SidebarContextProps>(
    () => ({
      isMobile,
      open,
      openMobile,
      setOpen,
      setOpenMobile,
      state,
      toggleSidebar
    }),
    [isMobile, open, openMobile, setOpen, state, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        data-state={state}
        style={
          {
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            ...style
          } as CSSProperties
        }
        className={cn(
          'group/sidebar-wrapper flex h-svh min-h-0 w-full overflow-hidden has-data-[variant=inset]:bg-sidebar',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export function Sidebar({
  children,
  className,
  collapsible = 'offcanvas',
  side = 'left',
  variant = 'sidebar',
  ...props
}: ComponentProps<'div'> & {
  collapsible?: 'icon' | 'none' | 'offcanvas'
  side?: 'left' | 'right'
  variant?: 'floating' | 'inset' | 'sidebar'
}) {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar()

  if (collapsible === 'none') {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <SideSheet
        motion={false}
        title="侧边栏"
        aria-label="侧边栏"
        placement="left"
        visible={openMobile}
        onCancel={() => setOpenMobile(false)}
        width={280}
        closable={false}
        headerStyle={{ display: 'none' }}
        bodyStyle={{ padding: 0, height: '100%' }}
        className={cn('!bg-sidebar text-sidebar-foreground', className)}
      >
        <div
          ref={node => {
            if (node) {
              const dialog = node.closest('[role="dialog"]')
              if (dialog) {
                dialog.setAttribute('aria-label', '侧边栏')
              }
            }
          }}
          data-mobile="true"
          data-slot="sidebar"
          className="flex h-full w-full flex-col"
        >
          {children}
        </div>
      </SideSheet>
    )
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant={variant}
      {...props}
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[collapsible=offcanvas]:w-0',
          'group-data-[side=right]:rotate-180',
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
        )}
      />
      <div
        data-side={side}
        data-slot="sidebar-container"
        className={cn(
          'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex',
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
          className
        )}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function SidebarInset({ className, ...props }: ComponentProps<'main'>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        'relative flex min-h-0 min-w-0 flex-1 flex-col bg-background',
        'md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm',
        className
      )}
      {...props}
    />
  )
}

export function SidebarTrigger({ className, onClick, ...props }: ComponentProps<'button'>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      theme="borderless"
      type="tertiary"
      icon={<PanelLeft className="size-4" />}
      className={cn('size-8 !p-0', className)}
      aria-label="切换侧边栏"
      onClick={event => {
        onClick?.(event as any)
        toggleSidebar()
      }}
      {...(props as any)}
    />
  )
}

export function SidebarHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="header"
      data-slot="sidebar-header"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  )
}

export function SidebarFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="footer"
      data-slot="sidebar-footer"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  )
}

export function SidebarContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="content"
      data-slot="sidebar-content"
      className={cn(
        'no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden group-data-[collapsible=icon]:overflow-hidden',
        className
      )}
      {...props}
    />
  )
}

export function SidebarGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="group"
      data-slot="sidebar-group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  )
}

export function SidebarGroupLabel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="group-label"
      data-slot="sidebar-group-label"
      className={cn(
        'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0',
        className
      )}
      {...props}
    />
  )
}

export function SidebarGroupContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="group-content"
      data-slot="sidebar-group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  )
}

export function SidebarMenu({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-sidebar="menu"
      data-slot="sidebar-menu"
      className={cn('flex w-full min-w-0 flex-col gap-0', className)}
      {...props}
    />
  )
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  )
}

export function SidebarMenuButton({
  asChild = false,
  className,
  isActive = false,
  isCurrent = isActive,
  tooltip,
  children,
  ...props
}: ComponentProps<'button'> & {
  asChild?: boolean
  isActive?: boolean
  isCurrent?: boolean
  tooltip?: string | { children: ReactNode }
}) {
  const { isMobile, state } = useSidebar()

  const buttonProps = {
    'data-active': isActive ? 'true' : undefined,
    'data-current': isCurrent ? 'true' : undefined,
    'data-sidebar': 'menu-button',
    'data-slot': 'sidebar-menu-button',
    className: cn(
      'peer/menu-button group/menu-button flex h-8 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding,background-color,color,box-shadow] group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-hover hover:text-sidebar-hover-foreground active:bg-sidebar-active active:text-sidebar-active-foreground disabled:pointer-events-none disabled:opacity-50 data-[active=true]:text-sidebar-active-foreground data-[active=true]:[&_svg]:text-sidebar-active-foreground data-[current=true]:rounded-none data-[current=true]:bg-sidebar-active [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate',
      className
    ),
    ...props
  }

  const element =
    asChild && isValidElement(children) ? (
      cloneElement(children as ReactElement<any>, {
        ...buttonProps,
        className: cn(buttonProps.className, (children.props as any)?.className),
        onClick: (e: any) => {
          ;(children.props as any)?.onClick?.(e)
          props.onClick?.(e)
        }
      })
    ) : (
      <button {...buttonProps}>{children}</button>
    )

  if (!tooltip || state !== 'collapsed' || isMobile) {
    return element
  }

  const tooltipContent = typeof tooltip === 'string' ? tooltip : tooltip.children

  return (
    <Tooltip content={tooltipContent} position="right">
      {element}
    </Tooltip>
  )
}

export function SidebarMenuBadge({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="menu-badge"
      data-slot="sidebar-menu-badge"
      className={cn(
        'pointer-events-none absolute right-1 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-hover-foreground peer-data-[active=true]/menu-button:text-sidebar-active-foreground',
        className
      )}
      {...props}
    />
  )
}

export function SidebarMenuSub({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-sidebar="menu-sub"
      data-slot="sidebar-menu-sub"
      className={cn(
        'mx-2 flex min-w-0 flex-col gap-1 px-1 py-0.5 pl-6 group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  )
}

export function SidebarMenuSubItem({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      data-sidebar="menu-sub-item"
      data-slot="sidebar-menu-sub-item"
      className={cn('group/menu-sub-item relative', className)}
      {...props}
    />
  )
}

export function SidebarMenuSubButton({
  asChild = false,
  className,
  isActive = false,
  isCurrent = isActive,
  children,
  ...props
}: ComponentProps<'a'> & {
  asChild?: boolean
  isActive?: boolean
  isCurrent?: boolean
}) {
  const linkProps = {
    'data-active': isActive ? 'true' : undefined,
    'data-current': isCurrent ? 'true' : undefined,
    'data-sidebar': 'menu-sub-button',
    'data-slot': 'sidebar-menu-sub-button',
    className: cn(
      'flex h-7 min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-sidebar-foreground outline-hidden transition-[background-color,color,box-shadow] group-data-[collapsible=icon]:hidden hover:bg-sidebar-hover hover:text-sidebar-hover-foreground active:bg-sidebar-active active:text-sidebar-active-foreground disabled:pointer-events-none disabled:opacity-50 data-[active=true]:text-sidebar-active-foreground data-[active=true]:[&>svg]:text-sidebar-active-foreground data-[current=true]:bg-sidebar-active [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-hover-foreground',
      className
    ),
    ...props
  }

  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<any>, {
      ...linkProps,
      className: cn(linkProps.className, (children.props as any)?.className),
      onClick: (e: any) => {
        ;(children.props as any)?.onClick?.(e)
        props.onClick?.(e)
      }
    })
  }

  return <a {...linkProps}>{children}</a>
}
