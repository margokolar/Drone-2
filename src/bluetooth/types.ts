export type BtControlMode = 'pedal' | 'speaker'

export const BT_CONTROL_MODES: { id: BtControlMode; label: string; hint: string }[] = [
  {
    id: 'pedal',
    label: 'Pedal',
    hint: 'BlueTurn / HID keyboard',
  },
  {
    id: 'speaker',
    label: 'Speaker',
    hint: 'Bluetooth speaker / lock screen',
  },
]
