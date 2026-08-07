export const AVAILABLE_USER_MODULES = [
  "cashPayments",
  "modules",
  "pensions",
  "pensionPasses",
  "tickets",
  "pensionMoves",
  "payments",
] as const;

export type UserModuleAccess = (typeof AVAILABLE_USER_MODULES)[number];

const USER_MODULE_SET = new Set<string>(AVAILABLE_USER_MODULES);

const MODULE_ALIASES: Record<string, UserModuleAccess> = {
  cashpayments: "cashPayments",
  pospayments: "cashPayments",

  modules: "modules",

  pensions: "pensions",

  pensionpasses: "pensionPasses",

  tickets: "tickets",

  pensionmoves: "pensionMoves",

  payments: "payments",
};

const normalizeModuleValue = (value: unknown): string => {
  const module = String(value ?? "").trim();
  return MODULE_ALIASES[module.toLowerCase()] ?? module;
};

export const normalizeUserModules = (value: unknown): UserModuleAccess[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(normalizeModuleValue)
        .filter((item): item is UserModuleAccess => USER_MODULE_SET.has(item)),
    ),
  );
};

export const getInvalidUserModules = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(normalizeModuleValue)
        .filter((module) => !USER_MODULE_SET.has(module)),
    ),
  );
};

export const hasUserModuleAccess = (
  modules: UserModuleAccess[],
  module: UserModuleAccess,
): boolean => modules.includes(module);
