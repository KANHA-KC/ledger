/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './index.html',
  ],
  // Support both class-based and media query based dark mode
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"SF Pro"',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        // Official Apple HIG Dynamic System Colors
        apple: {
          blue: {
            DEFAULT: '#007AFF',
            dark: '#0A84FF',
          },
          green: {
            DEFAULT: '#1C7430',
            vibrant: '#34C759',
            dark: '#30D158',
          },
          red: {
            DEFAULT: '#D70015',
            vibrant: '#FF3B30',
            dark: '#FF453A',
          },
          orange: {
            DEFAULT: '#C93400',
            vibrant: '#FF9500',
            dark: '#FF9F0A',
          },
          indigo: {
            DEFAULT: '#5856D6',
            dark: '#5E5CE6',
          },
          purple: {
            DEFAULT: '#AF52DE',
            dark: '#BF5AF2',
          },
          teal: {
            DEFAULT: '#00838F',
            dark: '#64D2FF',
          },
          // Backgrounds
          bg: {
            light: '#F2F2F7',
            dark: '#000000',
          },
          card: {
            light: '#FFFFFF',
            dark: '#1C1C1E',
          },
          cardSecondary: {
            light: '#E5E5EA',
            dark: '#2C2C2E',
          },
          // Labels
          label: {
            light: '#000000',
            dark: '#FFFFFF',
          },
          secondaryLabel: {
            light: '#6E6E73',
            dark: '#A1A1A6',
          },
          tertiaryLabel: {
            light: '#8E8E93',
            dark: '#787880',
          },
          divider: {
            light: 'rgba(60, 60, 67, 0.12)',
            dark: 'rgba(84, 84, 88, 0.36)',
          },
        },
        // Backward-compatible semantic palettes
        aaya: {
          DEFAULT: '#1C7430',
          vibrant: '#34C759',
          light: '#E8F5E9',
          dark: '#30D158',
        },
        gaya: {
          DEFAULT: '#D70015',
          vibrant: '#FF3B30',
          light: '#FFEBEE',
          dark: '#FF453A',
        },
        udhaar: {
          DEFAULT: '#C93400',
          vibrant: '#FF9500',
          light: '#FFF3E0',
          dark: '#FF9F0A',
        },
        neutral2: {
          DEFAULT: '#007AFF',
          light: '#E5F1FF',
          dark: '#0A84FF',
        },
      },
      borderRadius: {
        'apple-sm': '10px',
        'apple-md': '14px',
        'apple-lg': '18px',
        'apple-xl': '24px',
      },
      boxShadow: {
        'apple-subtle': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        'apple-card': '0 2px 10px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        'apple-card-dark': '0 2px 12px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(255, 255, 255, 0.05)',
        'apple-floating': '0 12px 36px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.08)',
        'apple-floating-dark': '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.12)',
      },
      minHeight: {
        tap: '44px',
      },
    },
  },
  plugins: [],
}
