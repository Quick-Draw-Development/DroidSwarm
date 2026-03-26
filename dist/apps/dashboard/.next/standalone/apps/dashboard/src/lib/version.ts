export function getAppVersion(): string {
  return process.env.DROIDSWARM_VERSION ?? 'dev';
}
