import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`theme-toggle-btn relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-surface text-ink-2 hover:border-rule-strong hover:text-ink cursor-pointer ${className}`}
    >
      <span className="relative h-4 w-4">
        <Sun
          className={`theme-icon absolute inset-0 h-4 w-4 ${
            isDark
              ? 'scale-100 rotate-0 opacity-100'
              : 'scale-50 -rotate-90 opacity-0'
          }`}
        />
        <Moon
          className={`theme-icon absolute inset-0 h-4 w-4 ${
            isDark
              ? 'scale-50 rotate-90 opacity-0'
              : 'scale-100 rotate-0 opacity-100'
          }`}
        />
      </span>
    </button>
  );
}
