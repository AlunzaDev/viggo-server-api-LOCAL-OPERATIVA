export const USER_APPS = {
  ADMIN_WEB: "ADMIN_WEB",
  OPERATIVE_WEB: "OPERATIVE_WEB",
  OPERATIVE_MOBILE: "OPERATIVE_MOBILE",
} as const;

export type UserAppAccess =
  (typeof USER_APPS)[keyof typeof USER_APPS];

export const USER_APP_VALUES: UserAppAccess[] =
  Object.values(USER_APPS);

export const WEB_OPERATIVE_APPS = [
  USER_APPS.OPERATIVE_WEB,
] as const;

export type WebOperativeApp =
  (typeof WEB_OPERATIVE_APPS)[number];

const USER_APP_SET = new Set<string>(
  USER_APP_VALUES,
);

const WEB_OPERATIVE_APP_SET = new Set<string>(
  WEB_OPERATIVE_APPS,
);

export const isUserAppAccess = (
  value: unknown,
): value is UserAppAccess => {
  return (
    typeof value === "string" &&
    USER_APP_SET.has(value)
  );
};

export const isWebOperativeApp = (
  value: unknown,
): value is WebOperativeApp => {
  return (
    typeof value === "string" &&
    WEB_OPERATIVE_APP_SET.has(value)
  );
};

export const normalizeUserApps = (
  value: unknown,
): UserAppAccess[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter(isUserAppAccess)),
  );
};