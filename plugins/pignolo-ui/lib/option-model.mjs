// Model of the ui-option dispatch by profile (spec 7.4): opus in max, sonnet in balanced and economy.
// The profile is the plugin's own userConfig; an unknown or unsubstituted value counts as balanced.
const MODEL_BY_PROFILE = Object.freeze({ max: 'opus', balanced: 'sonnet', economy: 'sonnet' });

export function optionModel(profile) {
  const known = Object.hasOwn(MODEL_BY_PROFILE, profile);
  const used = known ? profile : 'balanced';
  return { profile: used, model: MODEL_BY_PROFILE[used], defaulted: !known };
}
