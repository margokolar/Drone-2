export type BtControlMode = 'pedal' | 'speaker'

export const BT_CONTROL_MODES: { id: BtControlMode; label: string }[] = [
  {
    id: 'pedal',
    label: 'Pedal',
  },
  {
    id: 'speaker',
    label: 'Speaker',
  },
]
