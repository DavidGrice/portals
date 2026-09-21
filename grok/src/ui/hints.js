const DEFAULTS = {
  unlock: 'Unseal door',
  launch: 'Jump',
  read: 'Read',
  stoke: 'Stoke',
  toggle: 'Toggle',
  'arm-laser': 'Arm laser',
  'arm-lamp': 'Arm lamp',
  'cycle-options': 'Change options',
  'kill-laser': 'Beam off',
  'set-slit': 'Cycle slit',
  'flip-blaze': 'Flip blaze',
  'tilt-cross': 'Tilt cross-dispersion',
  'confirm-blaze': 'Confirm',
  'confirm-evanescent': 'Confirm',
  'identify-lamp': 'Confirm',
};

export function interactHint(spec) {
  if (!spec) {
    return 'E  Look';
  }
  if (spec.text) {
    return `E  ${spec.text}`;
  }
  return `E  ${DEFAULTS[spec.action] ?? 'Look'}`;
}
