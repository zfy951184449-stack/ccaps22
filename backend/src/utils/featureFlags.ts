const truthyValues = new Set(['1', 'true', 'yes', 'on']);

const readFlag = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  return truthyValues.has(value.trim().toLowerCase());
};

export const isTemplateResourceRulesEnabled = (): boolean =>
  readFlag(process.env.ENABLE_TEMPLATE_RESOURCE_RULES);

export const isBatchResourceSnapshotsEnabled = (): boolean =>
  readFlag(process.env.ENABLE_BATCH_RESOURCE_SNAPSHOTS);

export const isRuntimeResourceSnapshotReadEnabled = (): boolean =>
  readFlag(process.env.ENABLE_RUNTIME_RESOURCE_SNAPSHOT_READ);

