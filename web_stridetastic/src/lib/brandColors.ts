type BrandShade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export const brandGreen: Record<BrandShade, string> = {
  50: '#e9fff4',
  100: '#cfffe3',
  200: '#a0fcc6',
  300: '#78f0ad',
  400: '#4fe090',
  500: '#67ea94',
  600: '#3fc373',
  700: '#2a9a58',
  800: '#1b6f3f',
  900: '#104328',
};

export const BRAND_PRIMARY = brandGreen[500];
export const BRAND_ACCENT = brandGreen[600];
export const BRAND_PRIMARY_DARK = brandGreen[700];
export const BRAND_PRIMARY_DEEP = brandGreen[900];
export const BRAND_PRIMARY_SOFT = brandGreen[100];
export const BRAND_PRIMARY_SURFACE = brandGreen[50];

export const brandGradient = {
  from: '#082c1c',
  via: '#115a34',
  to: '#67ea94',
} as const;
