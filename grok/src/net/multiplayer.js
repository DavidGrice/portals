export function multiplayerStatus() {
  return {
    available: false,
    parked: true,
    reason: 'Multiplayer is last. Portal stencil stays a local WebGL walk.',
  };
}

export function assertMultiplayerAllowed(world) {
  if (!world?.multiplayer) {
    return false;
  }
  if (world.id === 'drift' || world.generated) {
    throw new Error('Drift cannot host multiplayer');
  }
  throw new Error('Multiplayer is parked last');
}
