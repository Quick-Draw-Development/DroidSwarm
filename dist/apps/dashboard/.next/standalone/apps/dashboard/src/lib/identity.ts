export const USERNAME_COOKIE = 'droidswarm_username';
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export const isValidUsername = (value: string): boolean => USERNAME_PATTERN.test(value);
