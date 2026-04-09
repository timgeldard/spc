import CheckmarkFilled from '@carbon/icons-react/es/CheckmarkFilled.js'
import Misuse from '@carbon/icons-react/es/Misuse.js'
import WarningAltFilled from '@carbon/icons-react/es/WarningAltFilled.js'
import { Tag } from '~/lib/carbon-layout'
import type { ComponentType } from 'react'

type Status = 'healthy' | 'warning' | 'critical'

const statusConfig: Record<Status, { type: 'green' | 'warm-gray' | 'red'; icon: ComponentType<{ size?: number }> }> = {
  healthy: { type: 'green', icon: CheckmarkFilled },
  warning: { type: 'warm-gray', icon: WarningAltFilled },
  critical: { type: 'red', icon: Misuse },
}

interface StatusBadgeProps {
  status: Status
  label: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const { type, icon: Icon } = statusConfig[status]

  return (
    <Tag type={type} size="sm" className={className} renderIcon={() => <Icon size={14} />}>
      {label}
    </Tag>
  )
}
